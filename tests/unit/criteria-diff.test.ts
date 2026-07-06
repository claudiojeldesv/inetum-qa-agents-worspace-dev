import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  diffCriteria,
  scanCriterionAnnotations,
  criterionHash,
  type CriteriaDoc,
  type Criterion,
} from '../../src/criteria-diff.ts';

const dirs: string[] = [];
const tmp = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const crit = (id: string, flow: string, then = 'resultado esperado', overrides: Partial<Criterion> = {}): Criterion => ({
  id,
  title: `Criterio ${id}`,
  flow,
  given: 'usuario en la pantalla',
  when: `ejecuta ${flow}`,
  then,
  ...overrides,
});
const doc = (...criteria: Criterion[]): CriteriaDoc => ({ criteria });
const noSpecs = new Map<string, string[]>();

describe('criteria-diff — matching por pases (id + contenido)', () => {
  it('mismo id + mismo contenido → unchanged (whitespace-insensible)', () => {
    const base = doc(crit('RF-001', 'login'));
    const next = doc(crit('RF-001', 'login', 'resultado   esperado '));
    const r = diffCriteria(base, next, noSpecs);
    expect(r.unchanged.map((e) => e.rf)).toEqual(['RF-001']);
    expect(r.added).toHaveLength(0);
    expect(r.modified).toHaveLength(0);
  });

  it('criterio nuevo → added; criterio desaparecido → removed (se reporta, no se borra)', () => {
    const base = doc(crit('RF-001', 'login'), crit('RF-002', 'logout'));
    const next = doc(crit('RF-001', 'login'), crit('RF-003', 'checkout'));
    const r = diffCriteria(base, next, noSpecs);
    expect(r.added.map((e) => e.rf)).toEqual(['RF-003']);
    expect(r.removed.map((e) => e.rf)).toEqual(['RF-002']);
  });

  it('mismo id + contenido distinto → modified con changed_fields', () => {
    const base = doc(crit('RF-001', 'login', 'muestra el dashboard'));
    const next = doc(crit('RF-001', 'login', 'muestra el dashboard con el saldo'));
    const r = diffCriteria(base, next, noSpecs);
    expect(r.modified).toHaveLength(1);
    expect(r.modified[0].changed_fields).toEqual(['then']);
  });

  it('renumeración por inserción intermedia NO produce cascada de falsos modified', () => {
    // El FD v2 inserta un requisito nuevo entre RF-001 y el antiguo RF-002:
    // el antiguo RF-002 (logout) pasa a ser RF-003 con contenido idéntico.
    const base = doc(crit('RF-001', 'login'), crit('RF-002', 'logout'));
    const next = doc(crit('RF-001', 'login'), crit('RF-002', 'transfer'), crit('RF-003', 'logout'));
    const r = diffCriteria(base, next, noSpecs);
    expect(r.unchanged.map((e) => e.rf)).toEqual(['RF-001']);
    expect(r.added.map((e) => e.rf)).toEqual(['RF-002']); // el insertado
    expect(r.renumbered).toHaveLength(1);
    expect(r.renumbered[0]).toMatchObject({ old_rf: 'RF-002', rf: 'RF-003' });
    expect(r.modified).toHaveLength(0);
    expect(r.removed).toHaveLength(0);
  });

  it('hash de contenido ambiguo (duplicado) NO se empareja como renumbered', () => {
    const dup = { given: 'g', when: 'w', then: 't' };
    const base = doc(crit('RF-001', 'x', 't', dup), crit('RF-002', 'x', 't', dup));
    const next = doc(crit('RF-003', 'x', 't', dup));
    const r = diffCriteria(base, next, noSpecs);
    expect(r.renumbered).toHaveLength(0); // ambiguo → no se adivina
    expect(r.added.map((e) => e.rf)).toEqual(['RF-003']);
    expect(r.removed).toHaveLength(2);
  });

  it('sin baseline → degrada honesto: citado por spec = existing_unverified, resto = added', () => {
    const specs = new Map([['RF-001', ['tests/e2e/site/TC-001_login.spec.ts']]]);
    const next = doc(crit('RF-001', 'login'), crit('RF-002', 'checkout'));
    const r = diffCriteria(null, next, specs);
    expect(r.baseline_found).toBe(false);
    expect(r.existing_unverified.map((e) => e.rf)).toEqual(['RF-001']);
    expect(r.added.map((e) => e.rf)).toEqual(['RF-002']);
  });

  it('spec que cita un RF inexistente (y no renumerado) → orphan_specs', () => {
    const specs = new Map([
      ['RF-001', ['tests/e2e/site/TC-001_login.spec.ts']],
      ['RF-009', ['tests/e2e/site/TC-009_legacy.spec.ts']],
    ]);
    const r = diffCriteria(doc(crit('RF-001', 'login')), doc(crit('RF-001', 'login')), specs);
    expect(r.orphan_specs).toEqual([
      { spec_file: 'tests/e2e/site/TC-009_legacy.spec.ts', rfs: ['RF-009'] },
    ]);
  });

  it('modified arrastra los spec_files impactados del RF', () => {
    const specs = new Map([['RF-001', ['tests/e2e/site/TC-001_login.spec.ts']]]);
    const base = doc(crit('RF-001', 'login', 'v1'));
    const next = doc(crit('RF-001', 'login', 'v2'));
    const r = diffCriteria(base, next, specs);
    expect(r.modified[0].spec_files).toEqual(['tests/e2e/site/TC-001_login.spec.ts']);
  });
});

describe('scanCriterionAnnotations — mapeo RF → specs por anotación @criterion', () => {
  it('extrae anotaciones recursivamente y deduplica por archivo', () => {
    const root = tmp('qa-cdiff-');
    const specsDir = resolve(root, 'tests/e2e/site');
    mkdirSync(resolve(specsDir, 'sub'), { recursive: true });
    writeFileSync(
      resolve(specsDir, 'TC-001_login.spec.ts'),
      '/** @criterion RF-001 (fd.md:3) */\n/* @criterion RF-001 duplicada */ test(...)',
    );
    writeFileSync(resolve(specsDir, 'sub', 'TC-002_transfer.spec.ts'), '/** @criterion RF-002 */');
    writeFileSync(resolve(specsDir, 'notas.txt'), '@criterion RF-099'); // no es .spec.ts

    const map = scanCriterionAnnotations(specsDir, root);
    expect(map.get('RF-001')).toEqual(['tests/e2e/site/TC-001_login.spec.ts']);
    expect(map.get('RF-002')).toEqual(['tests/e2e/site/sub/TC-002_transfer.spec.ts']);
    expect(map.has('RF-099')).toBe(false);
  });

  it('directorio inexistente → mapa vacío (primer run)', () => {
    expect(scanCriterionAnnotations(resolve(tmp('qa-cdiff-empty-'), 'nope')).size).toBe(0);
  });
});

describe('criterionHash', () => {
  it('normaliza whitespace y excluye el id', () => {
    expect(criterionHash(crit('RF-001', 'login'))).toBe(criterionHash(crit('RF-999', 'login')));
    expect(criterionHash(crit('RF-001', 'login'))).not.toBe(criterionHash(crit('RF-001', 'logout')));
  });
});
