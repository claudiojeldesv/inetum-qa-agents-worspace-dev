import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  redsFromSummary,
  specsDirFromSummary,
  resolveWorkDir,
  contextFrom,
} from '../../src/scripts/run-heal-mecanico.ts';

const SUMMARY = {
  module: 'S4',
  target_url: 'https://www.saucedemo.com/',
  tests_generated: [
    { tc_id: 'TC-001', spec: 'tests/e2e/saucedemo/TC-001_a.spec.ts', run_result: 'passed' },
    {
      tc_id: 'TC-005',
      spec: 'tests/e2e/saucedemo/TC-005_b.spec.ts',
      run_result: 'failed',
      failure: 'expect(locator).not.toHaveClass failed',
    },
    { tc_id: 'TC-006', spec: 'tests/e2e/saucedemo/TC-006_c.spec.ts', run_result: 'not-run' },
  ],
};

describe('redsFromSummary', () => {
  it('devuelve todo lo que no sea passed (failed y not-run), con failure si existe', () => {
    const reds = redsFromSummary(SUMMARY as any);
    expect(reds.map((r) => r.tc_id)).toEqual(['TC-005', 'TC-006']);
    expect(reds[0].failure).toContain('toHaveClass');
    expect(reds[1].failure).toBeNull();
  });

  it('sin tests_generated → sin rojos (re-ejecutable sin efectos)', () => {
    expect(redsFromSummary({} as any)).toEqual([]);
  });
});

describe('specsDirFromSummary', () => {
  it('deriva el namespace común de los specs', () => {
    expect(specsDirFromSummary(SUMMARY as any)).toBe('tests/e2e/saucedemo');
  });

  it('normaliza backslashes de entradas mangled', () => {
    const s = { tests_generated: [{ spec: 'tests\\e2e\\sitio\\x.spec.ts', run_result: 'failed' }] };
    expect(specsDirFromSummary(s as any)).toBe('tests/e2e/sitio');
  });

  it('null sin specs', () => {
    expect(specsDirFromSummary({} as any)).toBeNull();
  });
});

describe('resolveWorkDir (patrón report: explícito > env > único candidato)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'heal-workdir-'));
    mkdirSync(join(root, '.work', 'sitio-a'), { recursive: true });
    writeFileSync(join(root, '.work', 'sitio-a', 'qa-automator-run-summary.json'), '{}', 'utf8');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('--work-dir explícito con summary → lo usa', () => {
    const r = resolveWorkDir({ 'work-dir': '.work/sitio-a' }, {}, root);
    expect(r).toEqual({ workDir: '.work/sitio-a' });
  });

  it('--work-dir explícito sin summary → error con instrucción', () => {
    const r = resolveWorkDir({ 'work-dir': '.work/no-existe' }, {}, root);
    expect('error' in r && r.error).toContain('qa-automator-run-summary.json');
  });

  it('sin flag: único candidato bajo .work/ → lo elige solo', () => {
    const r = resolveWorkDir({}, {}, root);
    expect(r).toEqual({ workDir: '.work/sitio-a' });
  });

  it('varios candidatos → los devuelve para preguntar al QA (nunca elige en silencio)', () => {
    mkdirSync(join(root, '.work', 'sitio-b'), { recursive: true });
    writeFileSync(join(root, '.work', 'sitio-b', 'qa-automator-run-summary.json'), '{}', 'utf8');
    const r = resolveWorkDir({}, {}, root);
    expect('candidates' in r && r.candidates.sort()).toEqual(['.work/sitio-a', '.work/sitio-b']);
  });
});

describe('contextFrom', () => {
  it('deriva site_id del workDir y el style default solo si existe', () => {
    const ctx = contextFrom({}, '.work/no-hay-contract');
    expect(ctx.siteId).toBe('no-hay-contract');
    expect(ctx.stylePath).toBeNull();
    expect(ctx.summaryPath).toBe('.work/no-hay-contract/qa-automator-run-summary.json');
  });

  it('--style explícito gana siempre', () => {
    const ctx = contextFrom({ style: 'config/style-contracts/x.yaml' }, '.work/sitio');
    expect(ctx.stylePath).toBe('config/style-contracts/x.yaml');
  });
});
