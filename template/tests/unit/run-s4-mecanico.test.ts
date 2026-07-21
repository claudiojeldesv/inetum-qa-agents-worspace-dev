import { describe, expect, it } from 'vitest';

import {
  assignIds,
  checkFragmentSource,
  contextFromFlags,
  parsePlaywrightResults,
  parseSelection,
  renderCheckpointTable,
  specPathFor,
  summarizeReviews,
  type CatalogEntry,
} from '../../src/scripts/run-s4-mecanico.ts';

describe('contextFromFlags', () => {
  it('deriva site-id del basename del style contract y namespacea los dirs', () => {
    const ctx = contextFromFlags({ style: 'config/style-contracts/parabank.yaml' });
    expect(ctx.siteId).toBe('parabank');
    expect(ctx.workDir).toBe('.work/parabank');
    expect(ctx.specsDir).toBe('tests/e2e/parabank');
    expect(ctx.plansDir).toBe('docs/test-plans/parabank');
  });

  it('default saucedemo cuando no llega --style', () => {
    expect(contextFromFlags({}).siteId).toBe('saucedemo');
  });

  it('respeta overrides de --work-dir y --output-dir', () => {
    const ctx = contextFromFlags({ style: 'x/demo.yaml', 'work-dir': '.work/otro', 'output-dir': 'tests/e2e/custom' });
    expect(ctx.workDir).toBe('.work/otro');
    expect(ctx.specsDir).toBe('tests/e2e/custom');
  });
});

describe('parseSelection', () => {
  it('TOP selecciona los cap primeros por rank', () => {
    const r = parseSelection('TOP', 10, 5);
    expect(r.mode).toBe('checkpoint');
    expect(r.picks.map((p) => p.num)).toEqual([1, 2, 3, 4, 5]);
  });

  it('TODOS ignora el cap con mode all-acknowledged', () => {
    const r = parseSelection('todos', 7, 5);
    expect(r.mode).toBe('all-acknowledged');
    expect(r.picks).toHaveLength(7);
  });

  it('lista de # con ediciones de tags multi-coma', () => {
    const r = parseSelection('1,3:@regression,@negative,5', 6, 5);
    expect(r.picks).toEqual([
      { num: 1 },
      { num: 3, tags: ['@regression', '@negative'] },
      { num: 5 },
    ]);
  });

  it('rechaza # fuera de rango, duplicados, tokens ambiguos y tags huérfanos', () => {
    expect(() => parseSelection('9', 6, 5)).toThrow(/fuera de rango/);
    expect(() => parseSelection('2,2', 6, 5)).toThrow(/duplicado/);
    expect(() => parseSelection('si claro', 6, 5)).toThrow(/ambigua/);
    expect(() => parseSelection('1,@negative', 6, 5)).toThrow(/ambigua/);
    expect(() => parseSelection('', 6, 5)).toThrow(/vacía/);
  });
});

describe('assignIds', () => {
  it('reusa por slug y asigna correlativo max+1 con 3 dígitos', () => {
    const registry = { 'inicio-sesion.usuario-valido': 'TC-001', 'pago.completar-compra': 'TC-007' };
    const { ids, registry: updated, assigned, reused } = assignIds(
      ['inicio-sesion.usuario-valido', 'carrito.agregar-productos'],
      registry,
      'TC',
    );
    expect(ids['inicio-sesion.usuario-valido']).toBe('TC-001');
    expect(ids['carrito.agregar-productos']).toBe('TC-008');
    expect(reused).toEqual(['inicio-sesion.usuario-valido']);
    expect(assigned).toEqual(['carrito.agregar-productos']);
    expect(updated['pago.completar-compra']).toBe('TC-007'); // los no seleccionados no se tocan
  });

  it('ignora keys de gestor (no matchean el prefijo) al calcular el correlativo', () => {
    const registry = { 'a.b': 'MAPFRE-T1234', 'c.d': 'TC-002' };
    const { ids } = assignIds(['e.f'], registry, 'TC');
    expect(ids['e.f']).toBe('TC-003');
  });

  it('registro vacío arranca en 001 y no muta el original', () => {
    const registry: Record<string, string> = {};
    const { ids } = assignIds(['x.y', 'z.w'], registry, 'TC');
    expect(ids['x.y']).toBe('TC-001');
    expect(ids['z.w']).toBe('TC-002');
    expect(registry).toEqual({});
  });
});

describe('specPathFor', () => {
  const entry = { feature: 'inicio-sesion', condicion: 'usuario-valido' };

  it('aplica el spec_pattern con ID', () => {
    expect(specPathFor(entry, 'TC-001', '{id}_{feature}.{condicion}.spec.ts', 'tests/e2e/saucedemo')).toBe(
      'tests/e2e/saucedemo/TC-001_inicio-sesion.usuario-valido.spec.ts',
    );
  });

  it('sin registro (id null) quita el prefijo {id}_ del pattern', () => {
    expect(specPathFor(entry, null, '{id}_{feature}.{condicion}.spec.ts', 'tests/e2e/demo')).toBe(
      'tests/e2e/demo/inicio-sesion.usuario-valido.spec.ts',
    );
  });
});

describe('renderCheckpointTable', () => {
  it('muestra ID del registro o "nuevo" y las instrucciones de selección', () => {
    const rows: Array<CatalogEntry & { num: number; current_id: string | null }> = [
      {
        num: 1,
        current_id: 'TC-001',
        scenario_slug: 'inicio-sesion.usuario-valido',
        feature: 'inicio-sesion',
        condicion: 'usuario-valido',
        nature: 'principal',
        suite_tags: ['@smoke'],
        criticality: 'critical',
        rank: 1,
      },
      {
        num: 2,
        current_id: null,
        scenario_slug: 'pago.completar-compra',
        feature: 'pago',
        condicion: 'completar-compra',
        nature: 'principal',
        suite_tags: ['@critical'],
        criticality: 'critical',
        rank: 2,
      },
    ];
    const table = renderCheckpointTable(rows, 1);
    expect(table).toContain('TC-001');
    expect(table).toContain('nuevo');
    expect(table).toContain('TOP');
    expect(table).toContain('TODOS');
  });
});

describe('checkFragmentSource', () => {
  it('acepta un fragmento real con pasos y locators concretos', () => {
    const real = [
      '# Plan',
      '**Steps:**',
      '  1. Navegar a https://www.saucedemo.com/',
      '    - expect: campo [data-test="username"] visible',
      '  2. Click en [data-test="login-button"]',
      '    - expect: URL https://www.saucedemo.com/inventory.html',
      'Relleno adicional del plan para superar el umbral de tamaño mínimo. '.repeat(10),
    ].join('\n');
    expect(checkFragmentSource(real).concrete).toBe(true);
  });

  it('rechaza fragmentos cortos, sin pasos o sin locators concretos', () => {
    const fabricated = 'Un plan genérico que describe la aplicación sin ningún selector específico.';
    const r = checkFragmentSource(fabricated);
    expect(r.concrete).toBe(false);
    expect(r.problems.length).toBeGreaterThan(0);
  });
});

describe('summarizeReviews', () => {
  it('toma la última iteración por spec y cuenta severidades', () => {
    const lines = [
      JSON.stringify({
        test_file: 'tests/e2e/demo/TC-001_a.b.spec.ts',
        iteration: 0,
        verdict: 'rejected',
        feedback: [{ severity: 'must-fix' }, { severity: 'should-fix' }],
      }),
      JSON.stringify({
        test_file: 'tests/e2e/demo/TC-001_a.b.spec.ts',
        iteration: 1,
        verdict: 'approved',
        feedback: [{ severity: 'should-fix' }],
      }),
      JSON.stringify({
        test_file: 'tests/e2e/demo/TC-002_c.d.spec.ts',
        iteration: 0,
        verdict: 'approved',
        feedback: [],
      }),
    ].join('\n');
    const summary = summarizeReviews(lines);
    expect(summary).toEqual([
      { spec: 'tests/e2e/demo/TC-001_a.b.spec.ts', verdict: 'approved', iterations: 1, must_fix: 0, should_fix: 1 },
      { spec: 'tests/e2e/demo/TC-002_c.d.spec.ts', verdict: 'approved', iterations: 0, must_fix: 0, should_fix: 0 },
    ]);
  });

  it('ignora líneas corruptas y entradas sin spec', () => {
    expect(summarizeReviews('no-json\n{"verdict":"approved"}\n')).toEqual([]);
  });
});

describe('parsePlaywrightResults', () => {
  it('aplana suites anidadas al último result por test', () => {
    const root = {
      suites: [
        {
          title: 'TC-001_a.b.spec.ts',
          file: 'demo/TC-001_a.b.spec.ts',
          suites: [
            {
              title: 'grupo',
              specs: [
                {
                  title: 'caso verde',
                  ok: true,
                  file: 'demo/TC-001_a.b.spec.ts',
                  tests: [{ projectName: 'chromium', results: [{ status: 'passed' }] }],
                },
              ],
            },
          ],
          specs: [
            {
              title: 'caso rojo',
              ok: false,
              file: 'demo/TC-001_a.b.spec.ts',
              tests: [
                {
                  projectName: 'chromium',
                  results: [{ status: 'failed', error: { message: 'boom\nstack...' } }],
                },
              ],
            },
          ],
        },
      ],
    };
    const outcomes = parsePlaywrightResults(root);
    expect(outcomes).toHaveLength(2);
    const rojo = outcomes.find((o) => o.title === 'caso rojo')!;
    expect(rojo.status).toBe('failed');
    expect(rojo.message).toBe('boom');
    const verde = outcomes.find((o) => o.title === 'caso verde')!;
    expect(verde.status).toBe('passed');
  });

  it('tolera árbol vacío', () => {
    expect(parsePlaywrightResults({})).toEqual([]);
    expect(parsePlaywrightResults(null)).toEqual([]);
  });
});
