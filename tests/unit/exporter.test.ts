import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildCatalog } from '../../hooks/exporter.js';

describe('buildCatalog', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'exporter-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  async function writeSpec(name: string, body: string): Promise<string> {
    const p = join(tmp, name);
    await writeFile(p, body, 'utf8');
    return p;
  }

  it('dir vacío → 0 entries', async () => {
    const cat = await buildCatalog({ specsDir: tmp });
    expect(cat.entries).toHaveLength(0);
    expect(cat.summary.total).toBe(0);
  });

  it('un spec con un test → 1 entry con caseId estable', async () => {
    await writeSpec(
      'login.standard-user.spec.ts',
      [
        `import { test, expect } from '@playwright/test';`,
        `import { AxeBuilder } from '@axe-core/playwright';`,
        ``,
        `/**`,
        ` * RF-001: Login con standard_user redirige a inventory.`,
        ` */`,
        `test('standard_user login redirects', async ({ page }) => {`,
        `  const _axe = await new AxeBuilder({ page }).analyze();`,
        `  expect(_axe.violations).toEqual([]);`,
        `  await page.goto('https://www.saucedemo.com/');`,
        `});`,
      ].join('\n'),
    );
    const cat = await buildCatalog({ specsDir: tmp });
    expect(cat.entries).toHaveLength(1);
    const e = cat.entries[0];
    expect(e?.caseId).toContain('login.standard-user.spec.ts::standard-user-login-redirects');
    expect(e?.criterion).toBe('RF-001');
    expect(e?.a11ySnippetMode).toBe('block');
    expect(e?.judgeScore).toBeNull();
    expect(e?.runStatus).toBeNull();
  });

  it('detecta a11y mode warn cuando el snippet usa console.warn', async () => {
    await writeSpec(
      'warn.spec.ts',
      [
        `import { test } from '@playwright/test';`,
        `import { AxeBuilder } from '@axe-core/playwright';`,
        `test('x', async ({ page }) => {`,
        `  const _axe = await new AxeBuilder({ page }).analyze();`,
        `  if (_axe.violations.length > 0) {`,
        `    console.warn('[a11y][warn] ' + _axe.violations.length + ' violation(s) — downgrade declarado por SDET');`,
        `  }`,
        `});`,
      ].join('\n'),
    );
    const cat = await buildCatalog({ specsDir: tmp });
    expect(cat.entries[0]?.a11ySnippetMode).toBe('warn');
  });

  it('detecta a11y mode skip cuando no hay AxeBuilder', async () => {
    await writeSpec(
      'skip.spec.ts',
      [
        `import { test } from '@playwright/test';`,
        `test('x', async ({ page }) => {`,
        `  await page.goto('https://www.saucedemo.com/');`,
        `});`,
      ].join('\n'),
    );
    const cat = await buildCatalog({ specsDir: tmp });
    expect(cat.entries[0]?.a11ySnippetMode).toBe('skip');
  });

  it('fusiona judge-report.json cuando se provee', async () => {
    const specFile = await writeSpec(
      'a.spec.ts',
      [
        `import { test } from '@playwright/test';`,
        `/** RF-001 */`,
        `test('login flow', async ({ page }) => { await page.goto('https://x.com/'); });`,
      ].join('\n'),
    );
    const judgePath = join(tmp, 'judge-report.json');
    await writeFile(
      judgePath,
      JSON.stringify({
        schemaVersion: 1,
        results: [
          {
            file: specFile,
            testName: 'login flow',
            criterion: 'RF-001',
            axes: {
              meaningfulAssert: { score: 1, reason: '' },
              stableSelectors: { score: 0.5, reason: '' },
              noFragileWaits: { score: 1, reason: '' },
              noContamination: { score: 1, reason: '' },
              coversCriterion: { score: 1, reason: '' },
            },
            score: 0.9,
            verdict: 'PASS',
          },
        ],
      }),
      'utf8',
    );
    const cat = await buildCatalog({ specsDir: tmp, judgeReport: judgePath });
    expect(cat.entries[0]?.judgeScore).toBe(0.9);
    expect(cat.entries[0]?.judgeVerdict).toBe('PASS');
    expect(cat.entries[0]?.judgeAxes?.stableSelectors).toBe(0.5);
    expect(cat.summary.withJudge).toBe(1);
    expect(cat.summary.avgJudgeScore).toBe(0.9);
  });

  it('fusiona run-report.json cuando se provee', async () => {
    const specFile = await writeSpec(
      'b.spec.ts',
      [
        `import { test } from '@playwright/test';`,
        `/** RF-002 */`,
        `test('runner case', async ({ page }) => { await page.goto('https://x.com/'); });`,
      ].join('\n'),
    );
    const runPath = join(tmp, 'run-report.json');
    await writeFile(
      runPath,
      JSON.stringify({
        results: [
          { file: specFile, title: 'runner case', status: 'failed', errorMessage: 'Boom\nstack' },
        ],
      }),
      'utf8',
    );
    const cat = await buildCatalog({ specsDir: tmp, runReport: runPath });
    expect(cat.entries[0]?.runStatus).toBe('failed');
    expect(cat.entries[0]?.runErrorMessage).toBe('Boom');
    expect(cat.summary.failed).toBe(1);
  });

  it('extrae criterio text del plan cuando se provee', async () => {
    await writeSpec(
      'p.spec.ts',
      [
        `import { test } from '@playwright/test';`,
        `/** RF-005 */`,
        `test('catalog list', async ({ page }) => { await page.goto('https://x.com/'); });`,
      ].join('\n'),
    );
    const planPath = join(tmp, 'plan.md');
    await writeFile(
      planPath,
      [
        `# Plan`,
        ``,
        `### RF-005 · Lista de productos`,
        ``,
        `- **Texto FD**: La página de inventario lista exactamente 6 productos.`,
        `- Tipo: happy_path`,
      ].join('\n'),
      'utf8',
    );
    const cat = await buildCatalog({ specsDir: tmp, plan: planPath });
    expect(cat.entries[0]?.criterionText).toContain('6 productos');
  });

  it('extrae policy a11y del audit-log cuando hay entry policy_skip', async () => {
    const logPath = join(tmp, 'audit-log.json');
    await writeFile(
      logPath,
      [
        JSON.stringify({
          source: 'command:/test-pilot:generate',
          action: 'policy_skip',
          target: 'a11y',
          result: 'pass',
          metadata: { policy: 'a11y', mode: 'warn', reason: 'demo', declaredIn: 'cli' },
        }),
      ].join('\n') + '\n',
      'utf8',
    );
    const cat = await buildCatalog({ specsDir: tmp, auditLog: logPath });
    expect(cat.summary.a11yPolicy).toEqual({ mode: 'warn', reason: 'demo', declaredIn: 'cli' });
  });
});
