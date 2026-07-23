import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { verifySpec, extractTestBlocks, type A11yContract } from '../../src/scripts/verify-a11y.ts';

const WARNING: A11yContract = { fail_on_violations: false, severity_threshold: ['serious', 'critical'] };
const FAIL: A11yContract = { fail_on_violations: true, severity_threshold: ['serious', 'critical'] };

const SPEC_WARNING_OK = `
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('login válido', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  const a11yViolations = results.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''));
  if (a11yViolations.length > 0) {
    test.info().annotations.push({ type: 'a11y-warning', description: 'x' });
  }
  await expect(page).toHaveURL('/inventory.html');
});
`;

const SPEC_NAMED_IMPORT_OK = SPEC_WARNING_OK.replace(
  "import AxeBuilder from '@axe-core/playwright';",
  "import { AxeBuilder } from '@axe-core/playwright';",
);

const SPEC_SIN_SCAN = `
import { test, expect } from '@playwright/test';

test('sin scan', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/');
});
`;

const SPEC_FAIL_OK = `
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('con gate', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  const a11yViolations = results.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(a11yViolations).toEqual([]);
});
`;

const SPEC_SETUP = `
import { test as setup } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
});
`;

const SPEC_SCAN_ANTES_DE_GOTO = `
import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('scan mal posicionado', async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  test.info().annotations.push({ type: 'a11y-warning', description: 'x' });
  await page.goto('/');
});
`;

let dir: string;
const write = (name: string, content: string): string => {
  const p = join(dir, name);
  writeFileSync(p, content, 'utf8');
  return p;
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'verify-a11y-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('extractTestBlocks', () => {
  it('segmenta múltiples test() y no confunde test.step/test.describe/test.info', () => {
    const src = `
test.describe('feature', () => {
  test('uno', { tag: ['@smoke'] }, async ({ page }) => {
    await test.step('paso', async () => { test.info().annotations.push({}); });
  });
  test('dos', async ({ page }) => {});
});`;
    const blocks = extractTestBlocks(src);
    expect(blocks.map((b) => b.title)).toEqual(['uno', 'dos']);
  });
});

describe('verifySpec', () => {
  it('modo warning: scan + annotation → ok', () => {
    const r = verifySpec(write('ok.spec.ts', SPEC_WARNING_OK), WARNING);
    expect(r.ok).toBe(true);
    expect(r.gate_mode).toBe('warning');
  });

  it('acepta el named import de AxeBuilder (forma que emite el Writer a veces)', () => {
    expect(verifySpec(write('named.spec.ts', SPEC_NAMED_IMPORT_OK), WARNING).ok).toBe(true);
  });

  it('sin scan AxeBuilder → falla con problema accionable', () => {
    const r = verifySpec(write('sin-scan.spec.ts', SPEC_SIN_SCAN), WARNING);
    expect(r.ok).toBe(false);
    expect(r.tests[0].problem).toMatch(/sin scan AxeBuilder/);
  });

  it('contract fail_on_violations:true exige el expect que aborta', () => {
    expect(verifySpec(write('gated.spec.ts', SPEC_FAIL_OK), FAIL).ok).toBe(true);
    // el spec en modo warning NO pasa el contract con gate on
    expect(verifySpec(write('warn-vs-fail.spec.ts', SPEC_WARNING_OK), FAIL).ok).toBe(false);
  });

  it('auth.setup.ts se salta (sin AxeBuilder por diseño)', () => {
    const r = verifySpec(write('auth.setup.ts', SPEC_SETUP), WARNING);
    expect(r.skipped).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('scan antes del primer goto → falla (debe correr sobre la página cargada)', () => {
    const r = verifySpec(write('mal-pos.spec.ts', SPEC_SCAN_ANTES_DE_GOTO), WARNING);
    expect(r.ok).toBe(false);
    expect(r.tests[0].problem).toMatch(/antes del primer goto/);
  });

  it('spec sin bloques test() → falla, no pasa en silencio', () => {
    const r = verifySpec(write('vacio.spec.ts', "import { test } from '@playwright/test';\n"), WARNING);
    expect(r.ok).toBe(false);
  });
});
