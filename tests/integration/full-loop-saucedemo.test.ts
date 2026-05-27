/**
 * Integration test del full-loop (S11-T2).
 *
 * Los slash commands `/test-pilot:*` no son ejecutables desde vitest;
 * son artefactos markdown que Claude Code interpreta. Lo que sí podemos
 * verificar end-to-end vía Node es la **convergencia de artefactos**:
 * dado un set de fixtures que simulan los outputs intermedios de cada
 * slice (plan, specs, judge, run, audit, audit-log), el exporter CLI
 * los consume y produce un test-catalog.json coherente.
 *
 * Este test ES el integration test del SPEC: "valida que el flujo produce
 * todos los artefactos esperados". Sin LLM real (mock), sin Chromium,
 * sin MCP — solo fixtures + cli.
 */

import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildCatalog } from '../../hooks/exporter.js';
import type { TestCatalog } from '../../hooks/exporter.js';

const PLAN_FIXTURE = `# Test plan

- **FD source**: demo/saucedemo/fd-login-only.md

## Casos de test

### RF-001 · Login con standard_user

- **Texto FD**: Login con standard_user redirige a /inventory.html y la cabecera muestra "Swag Labs".
- **Tipo**: happy_path
- **Inputs**: standard_user / secret_sauce

### RF-002 · Locked out user

- **Texto FD**: Login con locked_out_user muestra mensaje de error en [data-test="error"].
- **Tipo**: error
- **Inputs**: locked_out_user / secret_sauce

### RF-003 · Wrong password

- **Texto FD**: Login con password incorrecto produce mensaje de error sin redirección.
- **Tipo**: error
- **Inputs**: standard_user / wrong_password

### RF-004 · Logout

- **Texto FD**: Logout desde el menú lateral devuelve al login.
- **Tipo**: happy_path
- **Inputs**: standard_user / secret_sauce
`;

function makeSpec(criterion: string, testName: string, a11yMode: 'block' | 'warn' | 'skip'): string {
  const axeImport = a11yMode === 'skip' ? '' : `import { AxeBuilder } from '@axe-core/playwright';\n`;
  let snippet = '';
  if (a11yMode === 'block') {
    snippet = `  const _axe = await new AxeBuilder({ page }).analyze();\n  expect(_axe.violations).toEqual([]);\n`;
  } else if (a11yMode === 'warn') {
    snippet = `  const _axe = await new AxeBuilder({ page }).analyze();\n  if (_axe.violations.length > 0) {\n    console.warn('[a11y][warn] ' + _axe.violations.length + ' violation(s) — downgrade declarado por SDET');\n  }\n`;
  }
  return [
    `import { test, expect } from '@playwright/test';`,
    axeImport ? axeImport : '',
    `/**`,
    ` * ${criterion}: criterio del FD.`,
    ` */`,
    `test('${testName}', async ({ page }) => {`,
    snippet,
    `  await page.goto('https://www.saucedemo.com/');`,
    `  await page.getByTestId('username').fill('standard_user');`,
    `  await page.getByTestId('password').fill('secret_sauce');`,
    `  await page.getByTestId('login-button').click();`,
    `});`,
    ``,
  ].join('\n');
}

describe('full-loop integration (mocked artifacts)', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'full-loop-int-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('end-to-end: 4 specs login + plan + judge + run + audit + audit-log → catalog coherente', async () => {
    // Fixtures dir
    const specsDir = join(tmp, 'generate');
    await mkdir(specsDir, { recursive: true });
    const planPath = join(tmp, 'test-plan.md');
    const judgePath = join(tmp, 'judge-report.json');
    const runPath = join(tmp, 'run-report.json');
    const auditPath = join(tmp, 'audit-report.json');
    const logPath = join(tmp, 'audit-log.json');

    // 1) Plan
    await writeFile(planPath, PLAN_FIXTURE, 'utf8');

    // 2) Specs (4 archivos login.*.spec.ts con a11y=warn)
    const specs = [
      { file: 'login.standard-user.spec.ts', criterion: 'RF-001', name: 'standard_user login redirect' },
      { file: 'login.locked-out-user.spec.ts', criterion: 'RF-002', name: 'locked_out_user error' },
      { file: 'login.wrong-password.spec.ts', criterion: 'RF-003', name: 'wrong password error' },
      { file: 'login.logout.spec.ts', criterion: 'RF-004', name: 'logout returns to login' },
    ];
    for (const s of specs) {
      await writeFile(join(specsDir, s.file), makeSpec(s.criterion, s.name, 'warn'), 'utf8');
    }

    // 3) Judge: avgScore=0.95, todos PASS
    await writeFile(
      judgePath,
      JSON.stringify({
        schemaVersion: 1,
        generated: new Date().toISOString(),
        summary: { threshold: 0.5, total: 4, avgScore: 0.95, belowThreshold: 0 },
        results: specs.map((s) => ({
          file: join(specsDir, s.file),
          testName: s.name,
          criterion: s.criterion,
          axes: {
            meaningfulAssert: { score: 1, reason: 'expect semantico' },
            stableSelectors: { score: 1, reason: 'getByTestId' },
            noFragileWaits: { score: 1, reason: 'sin waitForTimeout' },
            noContamination: { score: 1, reason: 'login desde 0' },
            coversCriterion: { score: 0.75, reason: 'cubre el flow' },
          },
          score: 0.95,
          verdict: 'PASS' as const,
        })),
      }),
      'utf8',
    );

    // 4) Run report: 4 passed
    await writeFile(
      runPath,
      JSON.stringify({
        pass: true,
        threshold: 0.8,
        total: 4,
        passed: 4,
        failed: 0,
        flaky: 0,
        skipped: 0,
        passRate: 1.0,
        results: specs.map((s) => ({
          file: join(specsDir, s.file),
          title: s.name,
          status: 'passed' as const,
          confidence: 1,
        })),
        exitCode: 0,
      }),
      'utf8',
    );

    // 5) Audit report: pass, sin findings
    await writeFile(
      auditPath,
      JSON.stringify({
        schemaVersion: 1,
        generated: new Date().toISOString(),
        dir: specsDir,
        pass: true,
        findings: [],
      }),
      'utf8',
    );

    // 6) Audit log con entry policy_skip a11y=warn
    await writeFile(
      logPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        source: 'command:/test-pilot:generate',
        action: 'policy_skip',
        target: 'a11y',
        result: 'pass',
        metadata: {
          schemaVersion: 1,
          policy: 'a11y',
          mode: 'warn',
          reason: 'SauceDemo demo público sin SLA WCAG',
          declaredIn: 'cli',
        },
      }) + '\n',
      'utf8',
    );

    // ----- Acto principal: construir catalog -----
    const catalog: TestCatalog = await buildCatalog({
      specsDir,
      plan: planPath,
      judgeReport: judgePath,
      runReport: runPath,
      auditReport: auditPath,
      auditLog: logPath,
    });

    // ----- Verificaciones del catalog -----
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.entries).toHaveLength(4);

    // summary
    expect(catalog.summary.total).toBe(4);
    expect(catalog.summary.withJudge).toBe(4);
    expect(catalog.summary.withRun).toBe(4);
    expect(catalog.summary.passed).toBe(4);
    expect(catalog.summary.failed).toBe(0);
    expect(catalog.summary.avgJudgeScore).toBe(0.95);
    expect(catalog.summary.weakTests).toBe(0);

    // a11y policy del log
    expect(catalog.summary.a11yPolicy).toEqual({
      mode: 'warn',
      reason: 'SauceDemo demo público sin SLA WCAG',
      declaredIn: 'cli',
    });

    // criterios de cada entry
    const criteria = catalog.entries.map((e) => e.criterion).sort();
    expect(criteria).toEqual(['RF-001', 'RF-002', 'RF-003', 'RF-004']);

    // todas las entries detectaron a11ySnippetMode warn (por el snippet inyectado)
    expect(catalog.entries.every((e) => e.a11ySnippetMode === 'warn')).toBe(true);

    // criterionText proveniente del plan
    const rf001 = catalog.entries.find((e) => e.criterion === 'RF-001');
    expect(rf001?.criterionText).toContain('Login con standard_user redirige');

    // todas las entries fueron passed en el run
    expect(catalog.entries.every((e) => e.runStatus === 'passed')).toBe(true);

    // sources documenta dónde vino cada cosa
    expect(catalog.sources.specsDir).toBe(specsDir);
    expect(catalog.sources.judgeReport).toBe(judgePath);
    expect(catalog.sources.runReport).toBe(runPath);
    expect(catalog.sources.auditReport).toBe(auditPath);
  });

  it('full-loop sin judge ni run (cadena --no-run --no-judge) → catalog con campos null', async () => {
    const specsDir = join(tmp, 'generate');
    await mkdir(specsDir, { recursive: true });
    await writeFile(
      join(specsDir, 'a.spec.ts'),
      makeSpec('RF-001', 'no-run no-judge case', 'block'),
      'utf8',
    );

    const catalog = await buildCatalog({ specsDir });

    expect(catalog.entries).toHaveLength(1);
    const e = catalog.entries[0];
    expect(e?.judgeScore).toBeNull();
    expect(e?.judgeVerdict).toBeNull();
    expect(e?.runStatus).toBeNull();
    expect(e?.a11ySnippetMode).toBe('block');
    expect(catalog.summary.avgJudgeScore).toBeNull();
    expect(catalog.summary.withRun).toBe(0);
    expect(catalog.summary.withJudge).toBe(0);
  });

  it('full-loop con audit BLOCK → findings llegan al catalog', async () => {
    const specsDir = join(tmp, 'generate');
    await mkdir(specsDir, { recursive: true });
    const specFile = join(specsDir, 'contaminated.spec.ts');
    await writeFile(specFile, makeSpec('RF-001', 'dirty test', 'block'), 'utf8');

    const auditPath = join(tmp, 'audit-report.json');
    await writeFile(
      auditPath,
      JSON.stringify({
        schemaVersion: 1,
        dir: specsDir,
        pass: false,
        findings: [
          { file: specFile, line: 9, type: 'URL_NOT_ALLOWLISTED', value: 'https://prod-x.com/' },
        ],
      }),
      'utf8',
    );

    const catalog = await buildCatalog({ specsDir, auditReport: auditPath });

    expect(catalog.entries[0]?.auditFindings).toHaveLength(1);
    expect(catalog.entries[0]?.auditFindings[0]?.type).toBe('URL_NOT_ALLOWLISTED');
  });

  it('catalog escrito a JSON parsea de vuelta sin pérdida', async () => {
    const specsDir = join(tmp, 'generate');
    await mkdir(specsDir, { recursive: true });
    await writeFile(join(specsDir, 'a.spec.ts'), makeSpec('RF-001', 'round trip', 'warn'), 'utf8');

    const catalog = await buildCatalog({ specsDir });
    const outPath = join(tmp, 'test-catalog.json');
    await writeFile(outPath, JSON.stringify(catalog, null, 2), 'utf8');

    const reread = JSON.parse(await readFile(outPath, 'utf8')) as TestCatalog;
    expect(reread.schemaVersion).toBe(1);
    expect(reread.entries).toHaveLength(1);
    expect(reread.entries[0]?.caseId).toBe(catalog.entries[0]?.caseId);
  });
});
