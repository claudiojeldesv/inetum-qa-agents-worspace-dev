import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  archiveStaleSpecs,
  assignIds,
  checkFragmentSource,
  computePomOwnership,
  contextFromFlags,
  normalizeRegistry,
  parsePlaywrightResults,
  parseSelection,
  reconcileCatalog,
  renderCheckpointTable,
  specPathFor,
  summarizeReviews,
  type CatalogEntry,
  type RegistryEntry,
  type SlugResolution,
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

describe('normalizeRegistry (Q4 — registro v2, tolerancia legacy)', () => {
  it('migra strings legacy a { id } y conserva entradas objeto', () => {
    const reg = normalizeRegistry({
      'pago.compra-completa': 'TC-004',
      'inicio-sesion.usuario-valido': { id: 'TC-001', nature: 'principal', screens: ['login', 'inventory'] },
    });
    expect(reg['pago.compra-completa']).toEqual({ id: 'TC-004' });
    expect(reg['inicio-sesion.usuario-valido'].screens).toEqual(['login', 'inventory']);
  });

  it('descarta valores malformados y tolera null', () => {
    expect(normalizeRegistry({ 'a.b': 42, 'c.d': { sin_id: true } } as never)).toEqual({});
    expect(normalizeRegistry(null)).toEqual({});
  });
});

describe('reconcileCatalog (Q4.1 — slug drift)', () => {
  const catalogEntry = (slug: string, extra: Partial<CatalogEntry> = {}) => ({
    scenario_slug: slug,
    feature: slug.split('.')[0],
    nature: 'principal',
    screens: ['login', 'inventory'],
    ...extra,
  });

  it('slug exacto en el registro → via slug', () => {
    const r = reconcileCatalog([catalogEntry('pago.compra-completa')], { 'pago.compra-completa': { id: 'TC-004' } });
    expect(r['pago.compra-completa']).toEqual({ id: 'TC-004', via: 'slug' });
  });

  it('reconcilia el caso real Q2: slug nuevo con UN candidato del mismo feature (entrada legacy sin metadata)', () => {
    // El registro real de saucedemo tras Q1: pago.compra-completa es la ÚNICA entrada de pago
    const registry = {
      'inicio-sesion.usuario-valido': { id: 'TC-001' },
      'carrito.anadir-un-producto': { id: 'TC-002' },
      'carrito.anadir-multiples-productos': { id: 'TC-003' },
      'pago.compra-completa': { id: 'TC-004' },
    };
    const r = reconcileCatalog([catalogEntry('pago.compra-exitosa', { screens: ['login', 'inventory', 'cart', 'checkout-complete'] })], registry);
    expect(r['pago.compra-exitosa']).toEqual({ id: 'TC-004', via: 'reconciled', from: 'pago.compra-completa' });
  });

  it('ambiguo (>1 candidato del mismo feature) → ID nuevo con el empate reportado — el caso carrito de Q2', () => {
    const registry = {
      'carrito.anadir-un-producto': { id: 'TC-002' },
      'carrito.anadir-multiples-productos': { id: 'TC-003' },
    };
    const r = reconcileCatalog([catalogEntry('carrito.productos-en-carrito')], registry);
    expect(r['carrito.productos-en-carrito'].via).toBe('new');
    expect(r['carrito.productos-en-carrito'].id).toBeNull();
    expect(r['carrito.productos-en-carrito'].ambiguous_with).toEqual([
      'carrito.anadir-un-producto',
      'carrito.anadir-multiples-productos',
    ]);
  });

  it('el slug registrado presente en el catálogo actual NO es candidato (es otro escenario)', () => {
    const registry = { 'inicio-sesion.usuario-valido': { id: 'TC-001' } };
    const r = reconcileCatalog(
      [catalogEntry('inicio-sesion.usuario-valido'), catalogEntry('inicio-sesion.usuario-bloqueado', { nature: 'negative', screens: ['login'] })],
      registry,
    );
    expect(r['inicio-sesion.usuario-valido'].via).toBe('slug');
    expect(r['inicio-sesion.usuario-bloqueado'].via).toBe('new');
  });

  it('nature y pantalla de destino FILTRAN cuando el registro las tiene (entradas v2)', () => {
    const registry: Record<string, RegistryEntry> = {
      'inicio-sesion.usuario-bloqueado': { id: 'TC-005', nature: 'negative', screens: ['login'] },
    };
    // mismo feature pero nature principal → no matchea
    expect(reconcileCatalog([catalogEntry('inicio-sesion.acceso-directo')], registry)['inicio-sesion.acceso-directo'].via).toBe('new');
    // mismo feature y nature pero destino distinto → no matchea
    expect(
      reconcileCatalog([catalogEntry('inicio-sesion.credenciales-invalidas', { nature: 'negative', screens: ['login', 'inventory'] })], registry)[
        'inicio-sesion.credenciales-invalidas'
      ].via,
    ).toBe('new');
    // mismo feature + nature + destino → reconcilia
    expect(
      reconcileCatalog([catalogEntry('inicio-sesion.credenciales-invalidas', { nature: 'negative', screens: ['login'] })], registry)[
        'inicio-sesion.credenciales-invalidas'
      ],
    ).toEqual({ id: 'TC-005', via: 'reconciled', from: 'inicio-sesion.usuario-bloqueado' });
  });

  it('alias registrado → via alias (el drift oscila entre runs)', () => {
    const registry: Record<string, RegistryEntry> = {
      'pago.compra-exitosa': { id: 'TC-004', aliases: ['pago.compra-completa'] },
    };
    const r = reconcileCatalog([catalogEntry('pago.compra-completa')], registry);
    expect(r['pago.compra-completa']).toEqual({ id: 'TC-004', via: 'alias', from: 'pago.compra-exitosa' });
  });

  it('dos slugs nuevos no pueden reclamar el MISMO candidato: el primero por rank lo toma', () => {
    const registry = { 'pago.compra-completa': { id: 'TC-004' } };
    const r = reconcileCatalog(
      [catalogEntry('pago.compra-exitosa'), catalogEntry('pago.compra-rapida')],
      registry,
    );
    expect(r['pago.compra-exitosa'].via).toBe('reconciled');
    expect(r['pago.compra-rapida'].via).toBe('new');
  });
});

describe('assignIds (Q4 — registro v2 con reconciliación)', () => {
  const noResolution = (slugs: string[]): Record<string, SlugResolution> =>
    Object.fromEntries(slugs.map((s) => [s, { id: null, via: 'new' as const }]));

  it('reusa por slug (refrescando metadata) y asigna correlativo max+1 con 3 dígitos', () => {
    const registry: Record<string, RegistryEntry> = {
      'inicio-sesion.usuario-valido': { id: 'TC-001' },
      'pago.completar-compra': { id: 'TC-007' },
    };
    const resolution: Record<string, SlugResolution> = {
      'inicio-sesion.usuario-valido': { id: 'TC-001', via: 'slug' },
      'carrito.agregar-productos': { id: null, via: 'new' },
    };
    const { ids, registry: updated, assigned, reused } = assignIds(
      [
        { slug: 'inicio-sesion.usuario-valido', nature: 'principal', screens: ['login', 'inventory'] },
        { slug: 'carrito.agregar-productos' },
      ],
      registry,
      'TC',
      resolution,
    );
    expect(ids['inicio-sesion.usuario-valido']).toBe('TC-001');
    expect(ids['carrito.agregar-productos']).toBe('TC-008');
    expect(reused).toEqual(['inicio-sesion.usuario-valido']);
    expect(assigned).toEqual(['carrito.agregar-productos']);
    expect(updated['inicio-sesion.usuario-valido']).toEqual({ id: 'TC-001', nature: 'principal', screens: ['login', 'inventory'] });
    expect(updated['pago.completar-compra']).toEqual({ id: 'TC-007' }); // los no seleccionados no se tocan
    expect(updated['carrito.agregar-productos'].source).toBe('agent');
  });

  it('reconciliado re-keyea al slug actual, conserva el ID y archiva el slug viejo como alias', () => {
    const registry: Record<string, RegistryEntry> = { 'pago.compra-completa': { id: 'TC-004' } };
    const resolution: Record<string, SlugResolution> = {
      'pago.compra-exitosa': { id: 'TC-004', via: 'reconciled', from: 'pago.compra-completa' },
    };
    const { ids, registry: updated, reconciled, assigned } = assignIds(
      [{ slug: 'pago.compra-exitosa', nature: 'principal', screens: ['login', 'checkout-complete'] }],
      registry,
      'TC',
      resolution,
    );
    expect(ids['pago.compra-exitosa']).toBe('TC-004');
    expect(assigned).toEqual([]);
    expect(reconciled).toEqual([{ slug: 'pago.compra-exitosa', from: 'pago.compra-completa', id: 'TC-004' }]);
    expect(updated['pago.compra-completa']).toBeUndefined();
    expect(updated['pago.compra-exitosa']).toEqual({
      id: 'TC-004',
      nature: 'principal',
      screens: ['login', 'checkout-complete'],
      aliases: ['pago.compra-completa'],
    });
  });

  it('via alias re-keyea acumulando aliases sin duplicar ni auto-referenciarse', () => {
    const registry: Record<string, RegistryEntry> = {
      'pago.compra-exitosa': { id: 'TC-004', aliases: ['pago.compra-completa'] },
    };
    const resolution: Record<string, SlugResolution> = {
      'pago.compra-completa': { id: 'TC-004', via: 'alias', from: 'pago.compra-exitosa' },
    };
    const { registry: updated, reused } = assignIds(
      [{ slug: 'pago.compra-completa' }],
      registry,
      'TC',
      resolution,
    );
    expect(reused).toEqual(['pago.compra-completa']);
    expect(updated['pago.compra-completa'].id).toBe('TC-004');
    expect(updated['pago.compra-completa'].aliases).toEqual(['pago.compra-exitosa']);
  });

  it('ignora keys de gestor (no matchean el prefijo) al calcular el correlativo', () => {
    const registry: Record<string, RegistryEntry> = { 'a.b': { id: 'MAPFRE-T1234' }, 'c.d': { id: 'TC-002' } };
    const { ids } = assignIds([{ slug: 'e.f' }], registry, 'TC', noResolution(['e.f']));
    expect(ids['e.f']).toBe('TC-003');
  });

  it('registro vacío arranca en 001 y no muta el original', () => {
    const registry: Record<string, RegistryEntry> = {};
    const { ids } = assignIds([{ slug: 'x.y' }, { slug: 'z.w' }], registry, 'TC', noResolution(['x.y', 'z.w']));
    expect(ids['x.y']).toBe('TC-001');
    expect(ids['z.w']).toBe('TC-002');
    expect(registry).toEqual({});
  });

  it('dos runs consecutivos con catálogos distintos NO duplican entradas (criterio de salida Q4)', () => {
    // Run 1: el discovery nombra el flujo pago.compra-completa
    const run1Catalog = [{ scenario_slug: 'pago.compra-completa', feature: 'pago', nature: 'principal', screens: ['login', 'checkout-complete'] }];
    const r1 = assignIds(
      run1Catalog.map((c) => ({ slug: c.scenario_slug, nature: c.nature, screens: c.screens })),
      {},
      'TC',
      reconcileCatalog(run1Catalog, {}),
    );
    expect(r1.ids['pago.compra-completa']).toBe('TC-001');

    // Run 2: el mismo flujo llega con slug drifteado
    const run2Catalog = [{ scenario_slug: 'pago.compra-exitosa', feature: 'pago', nature: 'principal', screens: ['login', 'checkout-complete'] }];
    const r2 = assignIds(
      run2Catalog.map((c) => ({ slug: c.scenario_slug, nature: c.nature, screens: c.screens })),
      r1.registry,
      'TC',
      reconcileCatalog(run2Catalog, r1.registry),
    );
    expect(r2.ids['pago.compra-exitosa']).toBe('TC-001');
    expect(Object.keys(r2.registry)).toEqual(['pago.compra-exitosa']);

    // Run 3: el drift oscila de vuelta al nombre original → alias, mismo ID, sin duplicados
    const r3 = assignIds(
      run1Catalog.map((c) => ({ slug: c.scenario_slug, nature: c.nature, screens: c.screens })),
      r2.registry,
      'TC',
      reconcileCatalog(run1Catalog, r2.registry),
    );
    expect(r3.ids['pago.compra-completa']).toBe('TC-001');
    expect(Object.keys(r3.registry)).toEqual(['pago.compra-completa']);
    expect(r3.registry['pago.compra-completa'].aliases).toEqual(['pago.compra-exitosa']);
  });
});

describe('archiveStaleSpecs (Q4.2/Q4.3 — archivado post-selección)', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('mueve a _archive/ los specs fuera de la selección y respeta los seleccionados y los .setup.ts', () => {
    dir = mkdtempSync(join(tmpdir(), 'q4-archive-'));
    writeFileSync(join(dir, 'TC-001_a.b.spec.ts'), '// seleccionado');
    writeFileSync(join(dir, 'TC-004_pago.compra-completa.spec.ts'), '// stale');
    writeFileSync(join(dir, 'seed.spec.ts'), '// seed de run abortado');
    writeFileSync(join(dir, 'auth.setup.ts'), '// setup de auth, no se toca');
    const moves = archiveStaleSpecs(dir, new Set(['TC-001_a.b.spec.ts']));
    expect(moves.map((m) => m.from.split(/[\\/]/).pop()).sort()).toEqual([
      'TC-004_pago.compra-completa.spec.ts',
      'seed.spec.ts',
    ]);
    expect(readdirSync(dir).sort()).toEqual(['TC-001_a.b.spec.ts', '_archive', 'auth.setup.ts']);
    expect(readdirSync(join(dir, '_archive')).sort()).toEqual(['TC-004_pago.compra-completa.spec.ts', 'seed.spec.ts']);
  });

  it('colisión en _archive/ → sufijo numérico, nunca pisa un archivado previo', () => {
    dir = mkdtempSync(join(tmpdir(), 'q4-archive-'));
    mkdirSync(join(dir, '_archive'));
    writeFileSync(join(dir, '_archive', 'TC-002_c.d.spec.ts'), '// archivado en un run previo');
    writeFileSync(join(dir, 'TC-002_c.d.spec.ts'), '// nueva versión stale');
    const moves = archiveStaleSpecs(dir, new Set());
    expect(moves).toHaveLength(1);
    expect(moves[0].to.endsWith('TC-002_c.d.2.spec.ts')).toBe(true);
    expect(readdirSync(join(dir, '_archive')).sort()).toEqual(['TC-002_c.d.2.spec.ts', 'TC-002_c.d.spec.ts']);
  });

  it('directorio inexistente → no-op; no desciende a subdirectorios', () => {
    dir = mkdtempSync(join(tmpdir(), 'q4-archive-'));
    expect(archiveStaleSpecs(join(dir, 'no-existe'), new Set())).toEqual([]);
    mkdirSync(join(dir, 'saucedemo'));
    writeFileSync(join(dir, 'saucedemo', 'TC-001_a.b.spec.ts'), '// namespaced, no lo toca el barrido de raíz');
    expect(archiveStaleSpecs(dir, new Set())).toEqual([]);
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
    const rows: Array<CatalogEntry & { num: number; current_id: string | null; reconciled_from?: string | null }> = [
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
      {
        num: 3,
        current_id: 'TC-004',
        reconciled_from: 'pago.compra-completa',
        scenario_slug: 'pago.compra-exitosa',
        feature: 'pago',
        condicion: 'compra-exitosa',
        nature: 'principal',
        suite_tags: ['@smoke'],
        criticality: 'critical',
        rank: 3,
      },
    ];
    const table = renderCheckpointTable(rows, 1);
    expect(table).toContain('TC-001');
    expect(table).toContain('nuevo');
    expect(table).toContain('TC-004*');
    expect(table).toContain('registrado como `pago.compra-completa`');
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

describe('computePomOwnership (Q2.4 — race de POMs compartidos)', () => {
  const pagesDir = 'tests/pages/saucedemo';

  it('asigna cada POM al PRIMER escenario que pisa la pantalla; el resto read-only', () => {
    const result = computePomOwnership(
      [
        { key: 'carrito.agregar-producto', screens: ['login', 'inventory', 'cart'] },
        { key: 'carrito.quitar-producto', screens: ['login', 'inventory', 'cart'] },
        { key: 'pago.compra-completa', screens: ['login', 'inventory', 'cart', 'checkout-step-one'] },
      ],
      pagesDir,
    );
    expect(result).not.toBeNull();
    expect(result!.ownership['tests/pages/saucedemo/cart.page.ts']).toBe('carrito.agregar-producto');
    expect(result!.ownership['tests/pages/saucedemo/inventory.page.ts']).toBe('carrito.agregar-producto');
    expect(result!.ownership['tests/pages/saucedemo/checkout-step-one.page.ts']).toBe('pago.compra-completa');
    // El segundo escenario de carrito no posee ningún POM (todos ya asignados)
    expect(result!.ownedBy.get('carrito.quitar-producto')).toEqual([]);
    expect(result!.ownedBy.get('pago.compra-completa')).toEqual(['tests/pages/saucedemo/checkout-step-one.page.ts']);
  });

  it('sin `screens` en algún escenario → null (degradación al comportamiento previo, sin ownership)', () => {
    expect(
      computePomOwnership(
        [
          { key: 'a', screens: ['login'] },
          { key: 'b' },
        ],
        pagesDir,
      ),
    ).toBeNull();
  });

  it('normaliza el nombre de pantalla al fichero .page.ts del scaffolder', () => {
    const result = computePomOwnership([{ key: 'x', screens: ['Checkout Step One'] }], pagesDir);
    expect(Object.keys(result!.ownership)).toEqual(['tests/pages/saucedemo/checkout-step-one.page.ts']);
  });
});
