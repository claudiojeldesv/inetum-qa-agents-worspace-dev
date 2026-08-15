import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  accentInsensitivePattern,
  aliasKey,
  assistStepsToWalkSteps,
  buildFallbackCandidates,
  buildLocatorCandidates,
  BUSY_SELECTORS,
  calibratedTimeout,
  compareCount,
  COUNT_OPERATORS,
  dedupeAndPrune,
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_SETTLE,
  effectiveDebounceMs,
  hashScript,
  hintLocatorPlan,
  isRetrySafe,
  locatorSource,
  looksGeneratedId,
  mergeSettle,
  normalizedPlan,
  normalizeText,
  parseLocatorChain,
  parseJsonLoose,
  percentile,
  pruneAriaSnapshot,
  rescueInstructions,
  resolveFixtureRef,
  slugFromUrl,
  updateTimingProfile,
  validateWalkScript,
} from '../src/walk-core.ts';
import type { DomElement, PickedElement, TimingProfile, WalkScript, WalkStep } from '../src/walk-types.ts';

const FIXTURES = {
  credentials: [
    { username: 'standard_user', password: 'secret_sauce' },
    { username: 'locked_out_user', password: 'secret_sauce' },
  ],
  buyer_info: [{ firstName: 'John', lastName: 'Doe', postalCode: '12345' }],
};

describe('resolveFixtureRef', () => {
  it('resuelve paths con índices y puntos', () => {
    expect(resolveFixtureRef('$fixtures.credentials[0].username', FIXTURES)).toBe('standard_user');
    expect(resolveFixtureRef('$fixtures.credentials[1].username', FIXTURES)).toBe('locked_out_user');
    expect(resolveFixtureRef('$fixtures.buyer_info[0].postalCode', FIXTURES)).toBe('12345');
  });

  it('deja pasar literales sin prefijo', () => {
    expect(resolveFixtureRef('hola', FIXTURES)).toBe('hola');
  });

  it('lanza error ante ref irresoluble (nunca inventar datos)', () => {
    expect(() => resolveFixtureRef('$fixtures.test_cards[0].pan', FIXTURES)).toThrow(/irresoluble/);
    expect(() => resolveFixtureRef('$fixtures.credentials[9].username', FIXTURES)).toThrow(/irresoluble/);
  });

  it('lanza error si la ref apunta a un objeto, no a un escalar', () => {
    expect(() => resolveFixtureRef('$fixtures.credentials[0]', FIXTURES)).toThrow(/irresoluble/);
  });
});

describe('hintLocatorPlan', () => {
  const PRIORITY = ['getByTestId', 'getByRole', 'getByLabel', 'getByText'];

  it('respeta el orden del priority del contract', () => {
    const plan = hintLocatorPlan({ test_id: 'login-button', role: 'button', name: 'Login' }, PRIORITY);
    // role son DOS intentos desde K0.33 (exacto, substring) por la misma razón
    // que el texto en K0.28: getByRole({name}) también matchea por substring.
    // El texto es UNO solo porque aquí lo alimenta `name`, no `text` (K0.33).
    expect(plan.map((a) => a.kind)).toEqual(['test_id', 'role', 'role', 'text']);
  });

  it('omite intentos sin datos en el hint', () => {
    const plan = hintLocatorPlan({ role: 'textbox', name: 'Username' }, PRIORITY);
    expect(plan.map((a) => a.kind)).toEqual(['role', 'role', 'text']);
  });

  it('K0.33: el peldaño de LABEL prueba exacto antes que substring', () => {
    // la clase de campo (UI5): el <input aria-label="Search"> y la región que lo
    // envuelve, etiquetada "Product Catalog Search and Navigation". Substring ve
    // dos y el paso se planta; exacto ve uno.
    const plan = hintLocatorPlan({ label: 'Search' }, PRIORITY);
    expect(plan.map(locatorSource)).toEqual([
      "getByLabel('Search', { exact: true })",
      "getByLabel('Search')",
    ]);
  });

  it('K0.33: el peldaño de ROLE prueba exacto antes que substring', () => {
    const plan = hintLocatorPlan({ role: 'button', name: 'Cart' }, ['getByRole']);
    expect(plan.map(locatorSource)).toEqual([
      "getByRole('button', { name: 'Cart', exact: true })",
      "getByRole('button', { name: 'Cart' })",
    ]);
  });

  it('K0.33: un hint de NOMBRE no cae a substring de texto (el fallo mudo de UI5)', () => {
    // {name:'Cart'} sin `role` no produce intento de role, así que la escalera cae
    // al peldaño de texto. Con substring resolvía UNA coincidencia visible —el
    // botón "Add to Cart"— y el walker lo pulsaba: EQUIVOCADO con duplicación de
    // negocio. Cambiar de atributo Y aflojar el matching son dos saltos.
    expect(hintLocatorPlan({ name: 'Cart' }, ['getByText']).map(locatorSource)).toEqual([
      "getByText('Cart', { exact: true })",
    ]);
    // pero cuando el FD dice TEXTO, la red de substring sigue puesta (drift de sufijos)
    expect(hintLocatorPlan({ text: 'Total' }, ['getByText']).map(locatorSource)).toEqual([
      "getByText('Total', { exact: true })",
      "getByText('Total')",
    ]);
  });

  it('K0.33: un role SIN name no duplica intento (no hay texto que acotar)', () => {
    const plan = hintLocatorPlan({ role: 'button' }, PRIORITY);
    expect(plan).toEqual([{ kind: 'role', role: 'button', name: undefined }]);
  });

  it('usa hint.text para getByText y cae a name si no hay text', () => {
    const withText = hintLocatorPlan({ text: 'Thank you' }, PRIORITY);
    expect(withText).toEqual([
      { kind: 'text', value: 'Thank you', exact: true },
      { kind: 'text', value: 'Thank you' },
    ]);
  });

  it('K0.28: el intento EXACTO va delante del substring (y así lo dice su source)', () => {
    // la clase de campo: 'Medicamentos' (enlace del menú) vs "Venta de medicamentos
    // con receta" (footer). Substring ve dos; exacto ve uno. El orden es el arreglo.
    const plan = hintLocatorPlan({ text: 'Medicamentos' }, PRIORITY);
    expect(plan.map(locatorSource)).toEqual([
      "getByText('Medicamentos', { exact: true })",
      "getByText('Medicamentos')",
    ]);
  });

  it('K0.28: la pasada normalizada conserva el exacto como regex ANCLADA', () => {
    const norm = normalizedPlan(hintLocatorPlan({ text: 'Medicamentos' }, PRIORITY));
    const [exacta, substring] = norm.map(locatorSource);
    const re = (src: string): RegExp => new RegExp(src.match(/\/(.+)\/i/)![1], 'i');
    // la anclada tolera el acento/caja pero NO el texto que solo contiene la palabra
    expect(re(exacta).test('MEDICAMENTOS')).toBe(true);
    expect(re(exacta).test('Venta de medicamentos con receta')).toBe(false);
    expect(re(substring).test('Venta de medicamentos con receta')).toBe(true);
  });

  it('con priority invertida cambia el orden de intentos', () => {
    const plan = hintLocatorPlan({ test_id: 'x', role: 'button', name: 'Go' }, ['getByRole', 'getByTestId']);
    expect(plan.map((a) => a.kind)).toEqual(['role', 'role', 'test_id']);
  });
});

describe('locatorSource', () => {
  it('serializa cada tipo de intento', () => {
    expect(locatorSource({ kind: 'test_id', value: 'user-name' })).toBe("getByTestId('user-name')");
    expect(locatorSource({ kind: 'role', role: 'button', name: 'Login' })).toBe(
      "getByRole('button', { name: 'Login' })",
    );
    expect(locatorSource({ kind: 'role', role: 'navigation' })).toBe("getByRole('navigation')");
    expect(locatorSource({ kind: 'label', value: 'Email' })).toBe("getByLabel('Email')");
  });

  it('escapa comillas simples en nombres', () => {
    expect(locatorSource({ kind: 'role', role: 'button', name: "User's cart" })).toBe(
      "getByRole('button', { name: 'User\\'s cart' })",
    );
  });
});

describe('buildLocatorCandidates', () => {
  const PRIORITY = ['getByTestId', 'getByRole', 'getByLabel', 'getByText'];

  it('ordena candidatos según priority', () => {
    const el = { role: 'button', name: 'Login', test_id: 'login-button' };
    expect(buildLocatorCandidates(el, PRIORITY)).toEqual([
      "getByTestId('login-button')",
      "getByRole('button', { name: 'Login' })",
    ]);
  });

  it('sin test_id emite getByText como último recurso', () => {
    const el = { role: 'link', name: 'About' };
    expect(buildLocatorCandidates(el, PRIORITY)).toEqual([
      "getByRole('link', { name: 'About' })",
      "getByText('About')",
    ]);
  });
});

describe('dedupeAndPrune', () => {
  const el = (partial: Partial<DomElement>): DomElement => ({
    role: 'button',
    locator_candidates: [],
    ...partial,
  });

  it('dedupea componentes repetidos con count', () => {
    const items = [
      el({ role: 'button', name: 'Add to cart' }),
      el({ role: 'button', name: 'Add to cart' }),
      el({ role: 'button', name: 'Add to cart' }),
      el({ role: 'link', name: 'Cart' }),
    ];
    const { elements, truncated } = dedupeAndPrune(items, 60);
    expect(elements).toHaveLength(2);
    expect(elements.find((e) => e.name === 'Add to cart')?.count).toBe(3);
    expect(elements.find((e) => e.name === 'Cart')?.count).toBeUndefined();
    expect(truncated).toBe(0);
  });

  it('aplica el cap por pantalla y reporta truncated (no silent caps)', () => {
    const items = Array.from({ length: 80 }, (_, i) => el({ name: `btn-${String(i).padStart(2, '0')}` }));
    const { elements, truncated } = dedupeAndPrune(items, 60);
    expect(elements).toHaveLength(60);
    expect(truncated).toBe(20);
  });

  it('orden estable: test_id primero, luego rol+nombre (dos runs = mismo output)', () => {
    const items = [
      el({ role: 'link', name: 'zeta' }),
      el({ role: 'button', name: 'alpha' }),
      el({ role: 'textbox', name: 'user', test_id: 'user-input' }),
    ];
    const a = dedupeAndPrune(items, 60).elements.map((e) => e.name);
    const b = dedupeAndPrune([...items].reverse(), 60).elements.map((e) => e.name);
    expect(a).toEqual(b);
    expect(a[0]).toBe('user'); // test_id gana
  });

  it('distingue elementos iguales en frames distintos', () => {
    const items = [
      el({ name: 'Submit' }),
      el({ name: 'Submit', frame_path: ['iframe[name="pago"]'] }),
    ];
    expect(dedupeAndPrune(items, 60).elements).toHaveLength(2);
  });
});

describe('slugFromUrl', () => {
  it('deriva nombres de pantalla deterministas', () => {
    expect(slugFromUrl('https://www.saucedemo.com/')).toBe('home');
    expect(slugFromUrl('https://www.saucedemo.com/inventory.html')).toBe('inventory');
    expect(slugFromUrl('https://x.com/checkout-step-one.html')).toBe('checkout-step-one');
    expect(slugFromUrl('https://x.com/app/orders/')).toBe('orders');
  });

  it('salta segmentos genéricos (SPA tipo OrangeHRM)', () => {
    expect(slugFromUrl('https://x.com/web/index.php/dashboard/index')).toBe('dashboard');
    expect(slugFromUrl('https://x.com/web/index.php/auth/login')).toBe('login');
  });
});

describe('validateWalkScript', () => {
  const valid = (): WalkScript => ({
    version: 1,
    site_id: 's',
    entry: '/',
    flows: [{ flow: 'f1', steps: [{ id: 's1', action: 'goto', target: '/' }] }],
  });

  it('acepta un script mínimo válido', () => {
    expect(validateWalkScript(valid())).toEqual({ ok: true, errors: [] });
  });

  it('el fixture de SauceDemo valida', () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/saucedemo.walk.json'), 'utf8'));
    expect(validateWalkScript(raw)).toEqual({ ok: true, errors: [] });
  });

  it('rechaza fill sin hint y sin value', () => {
    const s = valid();
    s.flows[0].steps = [{ id: 's1', action: 'fill' }];
    const { ok, errors } = validateWalkScript(s);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toMatch(/requiere hint/);
    expect(errors.join(' ')).toMatch(/requiere value/);
  });

  it('rechaza ids duplicados dentro de un flujo', () => {
    const s = valid();
    s.flows[0].steps = [
      { id: 's1', action: 'goto', target: '/' },
      { id: 's1', action: 'goto', target: '/x' },
    ];
    expect(validateWalkScript(s).errors.join(' ')).toMatch(/duplicado/);
  });

  it('rechaza version distinta de 1 y flows vacíos', () => {
    const { errors } = validateWalkScript({ version: 2, site_id: 's', entry: '/', flows: [] });
    expect(errors.join(' ')).toMatch(/version/);
    expect(errors.join(' ')).toMatch(/flows/);
  });
});

describe('hashScript', () => {
  it('es estable para el mismo script y cambia al editar un paso', () => {
    const s1: WalkScript = { version: 1, site_id: 's', entry: '/', flows: [{ flow: 'f', steps: [{ id: 's1', action: 'goto', target: '/' }] }] };
    const s2 = JSON.parse(JSON.stringify(s1)) as WalkScript;
    expect(hashScript(s1)).toBe(hashScript(s2));
    s2.flows[0].steps[0].target = '/otro';
    expect(hashScript(s1)).not.toBe(hashScript(s2));
  });
});

describe('pruneAriaSnapshot', () => {
  it('conserva líneas interactivas y descarta decorativas', () => {
    const snap = [
      '- generic',
      '- button "Login"',
      '- img',
      '- textbox "Username"',
      '- separator',
    ].join('\n');
    const pruned = pruneAriaSnapshot(snap);
    expect(pruned).toContain('button "Login"');
    expect(pruned).toContain('textbox "Username"');
    expect(pruned).not.toContain('separator');
    expect(pruned).not.toContain('- img');
  });

  it('aplica tope de líneas y lo declara', () => {
    const snap = Array.from({ length: 200 }, (_, i) => `- button "b${i}"`).join('\n');
    const pruned = pruneAriaSnapshot(snap, 50);
    expect(pruned.split('\n')).toHaveLength(51);
    expect(pruned).toMatch(/podado: 150/);
  });

  it('K0.29: con foco, el contenido buscado entra aunque el menú se coma el tope', () => {
    // la forma exacta del hallazgo de campo: 200 entradas de menú y, al final,
    // el formulario por el que se pregunta. Sin foco, el rescate ve solo menú.
    const snap = [
      ...Array.from({ length: 200 }, (_, i) => `- menuitem "Componente ${i}"`),
      '- form "datos del coche":',
      '  - combobox "Select your car\'s brand"',
      '  - button "Submit AJAX"',
    ].join('\n');

    const sinFoco = pruneAriaSnapshot(snap, 50);
    expect(sinFoco).not.toContain("Select your car's brand");

    const conFoco = pruneAriaSnapshot(snap, 50, "Select your car's brand");
    expect(conFoco).toContain("combobox \"Select your car's brand\"");
    expect(conFoco).toContain('form "datos del coche"'); // la ventana de contexto trae al padre
    expect(conFoco.split('\n').length).toBeLessThanOrEqual(50 + 2); // el tope se respeta
    expect(conFoco).toMatch(/líneas omitidas|podado/); // y el corte se declara, no se disimula
  });

  it('K0.29: el foco tolera acentos y mayúsculas, como el resto de la escalera', () => {
    const snap = [
      ...Array.from({ length: 60 }, (_, i) => `- menuitem "Menu ${i}"`),
      '- textbox "Número de póliza"',
    ].join('\n');
    expect(pruneAriaSnapshot(snap, 30, 'numero de poliza')).toContain('Número de póliza');
  });
});

describe('rescueInstructions (K0.29)', () => {
  it('con snapshot, pide el locator y prohíbe inventarlo', () => {
    const txt = rescueInstructions('s3', 'click');
    expect(txt).toContain("action='click'");
    expect(txt).toContain('locator=null');
    expect(txt).not.toContain('SIN EVIDENCIA');
  });

  it('sin snapshot, ANUNCIA la ceguera antes de pedir nada', () => {
    // el defecto medido en la gira: tres peticiones seguidas con aria_snapshot
    // vacío y ni una palabra de por qué. Un rescate a ciegas que no se anuncia
    // invita a inventar el locator.
    const txt = rescueInstructions('s2', 'select', 'locator.ariaSnapshot: Timeout 10000ms exceeded.');
    expect(txt).toContain('SIN EVIDENCIA');
    expect(txt).toContain('Timeout 10000ms exceeded.');
    expect(txt).toContain('no adivines');
    expect(txt.indexOf('AVISO')).toBe(0); // primero el aviso, luego la petición
  });
});


// ------------------------------------------------------------- K0 (kernel v2)

describe('normalizeText (K0.1)', () => {
  it('pliega acentos, case y espacios', () => {
    expect(normalizeText('GESTIÓN')).toBe('gestion');
    expect(normalizeText('  Iniciar   Sesión ')).toBe('iniciar sesion');
    expect(normalizeText('Póliza')).toBe('poliza');
  });

  it('es idempotente', () => {
    expect(normalizeText(normalizeText('GESTIÓN'))).toBe('gestion');
  });
});

describe('accentInsensitivePattern (K0.1)', () => {
  it('matchea GESTIÓN desde el hint sin tilde y viceversa', () => {
    const re = new RegExp(accentInsensitivePattern('GESTION'), 'i');
    expect(re.test('GESTIÓN')).toBe(true);
    expect(re.test('gestion')).toBe(true);
    const re2 = new RegExp(accentInsensitivePattern('Simulación/Declaración Rescates'), 'i');
    expect(re2.test('Simulacion/Declaracion Rescates')).toBe(true);
    expect(re2.test('SIMULACIÓN/DECLARACIÓN  RESCATES')).toBe(true);
  });

  it('escapa metacaracteres de regex', () => {
    const re = new RegExp(accentInsensitivePattern('Zip/Postal Code (US)'), 'i');
    expect(re.test('Zip/Postal Code (US)')).toBe(true);
    expect(re.test('Zip Postal')).toBe(false);
  });
});

describe('normalizedPlan (K0.1)', () => {
  const PRIORITY = ['getByTestId', 'getByRole', 'getByLabel', 'getByText'];

  it('excluye test_id y conserva el orden del contract', () => {
    const raw = hintLocatorPlan({ test_id: 'x', role: 'link', name: 'GESTION' }, PRIORITY);
    const norm = normalizedPlan(raw);
    expect(norm.map((a) => a.kind)).toEqual(['role', 'role', 'text']);
    expect(norm.every((a) => 'normalized' in a && a.normalized)).toBe(true);
  });

  it('locatorSource de un intento normalizado emite regex accent-insensitive', () => {
    const [attempt] = normalizedPlan(hintLocatorPlan({ role: 'link', name: 'GESTION' }, PRIORITY));
    const src = locatorSource(attempt);
    expect(src).toMatch(/^getByRole\('link', \{ name: \/.+\/i \}\)$/);
    const pattern = src.match(/\/(.+)\/i/)![1];
    expect(new RegExp(pattern, 'i').test('GESTIÓN')).toBe(true);
  });
});

describe('aliasKey (K0.5)', () => {
  it('hints que difieren solo en acentos/case comparten clave', () => {
    expect(aliasKey({ role: 'link', name: 'GESTIÓN' })).toBe(aliasKey({ role: 'link', name: 'gestion' }));
    expect(aliasKey({ role: 'link', name: 'GESTION' })).not.toBe(aliasKey({ role: 'button', name: 'GESTION' }));
  });

  it('test_id se compara exacto (atributo, no texto)', () => {
    expect(aliasKey({ test_id: 'Login-Button' })).not.toBe(aliasKey({ test_id: 'login-button' }));
  });
});

describe('validateWalkScript — expect_* (K0.2)', () => {
  const base = (): WalkScript => ({
    version: 1,
    site_id: 's',
    entry: '/',
    flows: [{ flow: 'f1', steps: [{ id: 's1', action: 'goto', target: '/' }] }],
  });

  it('acepta expect_text con value y expect_state con hint+estado valido', () => {
    const s = base();
    s.flows[0].steps.push(
      { id: 's2', action: 'expect_text', value: 'Thank you for your order!' },
      { id: 's3', action: 'expect_state', hint: { role: 'button', name: 'Finish' }, value: 'visible' },
    );
    expect(validateWalkScript(s)).toEqual({ ok: true, errors: [] });
  });

  it('rechaza expect_text sin value, expect_state sin hint y estado desconocido', () => {
    const s = base();
    s.flows[0].steps.push(
      { id: 's2', action: 'expect_text' },
      { id: 's3', action: 'expect_state', value: 'brillante' },
    );
    const { ok, errors } = validateWalkScript(s);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toMatch(/'expect_text' requiere value/);
    expect(errors.join(' ')).toMatch(/'expect_state' requiere hint/);
    expect(errors.join(' ')).toMatch(/visible\|enabled\|disabled/);
  });

  it('el fixture lean de SauceDemo (con expect_text) valida', () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/saucedemo.lean.walk.json'), 'utf8'));
    expect(validateWalkScript(raw)).toEqual({ ok: true, errors: [] });
  });
});

describe('compareCount (Fase 6 — cardinalidad)', () => {
  it.each([
    ['>', 3, 0, true], ['>', 0, 0, false],
    ['>=', 3, 3, true], ['>=', 2, 3, false],
    ['=', 3, 3, true], ['=', 2, 3, false],
    ['<', 0, 3, true], ['<', 3, 3, false],
  ] as const)('%s: %d %s %d -> %s', (operator, actual, expected, want) => {
    expect(compareCount(actual, operator, expected)).toBe(want);
  });

  it('COUNT_OPERATORS contiene exactamente los cuatro operadores del vocabulario', () => {
    expect([...COUNT_OPERATORS].sort()).toEqual(['<', '=', '>', '>='].sort());
  });
});

describe('validateWalkScript — expect_count / expect_each (Fase 6)', () => {
  const base = (): WalkScript => ({
    version: 1,
    site_id: 's',
    entry: '/',
    flows: [{ flow: 'f1', steps: [{ id: 's1', action: 'goto', target: '/' }] }],
  });

  it('acepta expect_count con hint+operator+value numerico', () => {
    const s = base();
    s.flows[0].steps.push({ id: 's2', action: 'expect_count', hint: { role: 'row' }, operator: '>', value: '0' });
    expect(validateWalkScript(s)).toEqual({ ok: true, errors: [] });
  });

  it('rechaza expect_count sin hint, sin operator valido, o con value no numerico', () => {
    const s = base();
    s.flows[0].steps.push(
      { id: 's2', action: 'expect_count', operator: '>', value: '0' },
      { id: 's3', action: 'expect_count', hint: { role: 'row' }, operator: '??' as never, value: '0' },
      { id: 's4', action: 'expect_count', hint: { role: 'row' }, operator: '>', value: 'muchas' },
    );
    const { ok, errors } = validateWalkScript(s);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toMatch(/s2: 'expect_count' requiere hint o locator/);
    expect(errors.join(' ')).toMatch(/s3: 'expect_count' requiere operator/);
    expect(errors.join(' ')).toMatch(/s4: 'expect_count' requiere value numérico/);
  });

  it('acepta expect_each con hint+each completo', () => {
    const s = base();
    s.flows[0].steps.push({
      id: 's2',
      action: 'expect_each',
      hint: { role: 'listbox' },
      each: { hint: { role: 'option' }, operator: '>=', value: '1' },
    });
    expect(validateWalkScript(s)).toEqual({ ok: true, errors: [] });
  });

  it('rechaza expect_each sin each, o con each incompleto', () => {
    const s = base();
    s.flows[0].steps.push(
      { id: 's2', action: 'expect_each', hint: { role: 'listbox' } },
      {
        id: 's3',
        action: 'expect_each',
        hint: { role: 'listbox' },
        each: { hint: {}, operator: '>=', value: '1' },
      },
    );
    const { ok, errors } = validateWalkScript(s);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toMatch(/s2: 'expect_each' requiere 'each'/);
    expect(errors.join(' ')).toMatch(/s3: 'expect_each.hint' necesita al menos un campo/);
  });

  it('expect_after no aplica a expect_count/expect_each (no ejecutan accion)', () => {
    const s = base();
    s.flows[0].steps.push({
      id: 's2',
      action: 'expect_count',
      hint: { role: 'row' },
      operator: '>',
      value: '0',
      expect_after: 'algo',
    });
    const { ok, errors } = validateWalkScript(s);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toMatch(/'expect_after' no aplica a 'expect_count'/);
  });
});

describe('effectiveDebounceMs (Fase 5)', () => {
  it('debounce_ms explicito manda', () => {
    expect(effectiveDebounceMs({ debounce_ms: 500 })).toBe(500);
    expect(effectiveDebounceMs({ debounced: true, debounce_ms: 500 })).toBe(500);
  });

  it('debounced:true sin ms cae al default conservador', () => {
    expect(effectiveDebounceMs({ debounced: true })).toBe(DEFAULT_DEBOUNCE_MS);
  });

  it('ninguno de los dos -> 0 (sin valvula)', () => {
    expect(effectiveDebounceMs({})).toBe(0);
    expect(effectiveDebounceMs({ debounced: false })).toBe(0);
  });
});

describe('validateWalkScript — debounce_ms (Fase 5)', () => {
  const base = (): WalkScript => ({
    version: 1,
    site_id: 's',
    entry: '/',
    flows: [{ flow: 'f1', steps: [{ id: 's1', action: 'goto', target: '/' }] }],
  });

  it('acepta fill con debounced o debounce_ms', () => {
    const s = base();
    s.flows[0].steps.push(
      { id: 's2', action: 'fill', hint: { role: 'textbox' }, value: 'x', debounced: true },
      { id: 's3', action: 'fill', hint: { role: 'textbox' }, value: 'x', debounce_ms: 300 },
    );
    expect(validateWalkScript(s)).toEqual({ ok: true, errors: [] });
  });

  it('rechaza debounce_ms no positivo', () => {
    const s = base();
    s.flows[0].steps.push({ id: 's2', action: 'fill', hint: { role: 'textbox' }, value: 'x', debounce_ms: 0 });
    const { ok, errors } = validateWalkScript(s);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toMatch(/'debounce_ms' debe ser un número > 0/);
  });
});

describe('parseJsonLoose (robustez de contratos escritos por subagentes)', () => {
  const payload = { step: 's3', locator: "getByTestId('login-button')" };
  const BOM = String.fromCharCode(0xfeff);

  it('parsea JSON con BOM (PowerShell Set-Content -Encoding utf8)', () => {
    const withBom = BOM + JSON.stringify(payload);
    expect(() => JSON.parse(withBom)).toThrow();
    expect(parseJsonLoose(withBom)).toEqual(payload);
  });

  it('parsea JSON limpio y con espacios/saltos al principio', () => {
    expect(parseJsonLoose(JSON.stringify(payload))).toEqual(payload);
    expect(parseJsonLoose('\n  ' + JSON.stringify(payload))).toEqual(payload);
  });

  it('sigue lanzando ante JSON realmente corrupto (no enmascara errores)', () => {
    expect(() => parseJsonLoose('{"step": ')).toThrow();
    expect(() => parseJsonLoose(BOM + 'no-json')).toThrow();
  });
});


describe('validateWalkScript — hover (K0.10a)', () => {
  const base = (): WalkScript => ({
    version: 1,
    site_id: 's',
    entry: '/',
    flows: [{ flow: 'f1', steps: [{ id: 's1', action: 'goto', target: '/' }] }],
  });

  it('acepta hover con hint', () => {
    const s = base();
    s.flows[0].steps.push({ id: 's2', action: 'hover', hint: { role: 'link', name: 'GESTION' } });
    expect(validateWalkScript(s)).toEqual({ ok: true, errors: [] });
  });

  it('rechaza hover sin hint (no hay nada que abrir a ciegas)', () => {
    const s = base();
    s.flows[0].steps.push({ id: 's2', action: 'hover' });
    const { ok, errors } = validateWalkScript(s);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toMatch(/'hover' requiere hint/);
  });
});


// ------------------------------- escalera de fallback de locators (K0.11a)

describe('looksGeneratedId', () => {
  it('caza los ids autogenerados por framework', () => {
    for (const id of [':r3:', ':R2ab:', 'ng-tns-c12-4', 'cdk-overlay-0', 'input-347', 'field_12', 'j_id123', '3col', 'a1b2c3d4-1111-2222', 'mat-input-3'])
      expect(looksGeneratedId(id)).toBe(true);
  });

  it('acepta los que parecen escritos por una persona', () => {
    for (const id of ['numeroPoliza', 'login-form', 'btnGuardar', 'tomador_nombre'])
      expect(looksGeneratedId(id)).toBe(false);
  });

  it('id vacio no sirve', () => {
    expect(looksGeneratedId('')).toBe(true);
  });
});

describe('buildFallbackCandidates (el fallo real de onesait s7)', () => {
  const PRIORITY = ['getByRole', 'getByLabel', 'getByText'];

  it('un elemento SIN identidad semantica ya no se queda sin candidatos', () => {
    // input sin name, sin label, sin test-id: la norma en formularios Java corporativos
    const el: PickedElement = {
      role: 'textbox',
      via: 'click',
      anchor: { role: 'form', name: 'Datos de la poliza' },
      nearby_text: 'Numero Poliza',
      nth_of_role: 2,
    };
    const cands = buildFallbackCandidates(el, PRIORITY);
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.map((c) => c.tier)).toContain('anchored');
    expect(cands.map((c) => c.tier)).toContain('indexed');
  });

  it('el orden es semantic -> scoped -> anchored -> css -> indexed', () => {
    const el: PickedElement = {
      role: 'textbox',
      name: 'Poliza',
      via: 'click',
      anchor: { role: 'form', name: 'Datos' },
      nearby_text: 'Numero',
      dom_id: 'numeroPoliza',
      id_stable: true,
      nth_of_role: 1,
    };
    const tiers = buildFallbackCandidates(el, PRIORITY).map((c) => c.tier);
    expect(tiers[0]).toBe('semantic');
    expect(tiers.indexOf('scoped')).toBeLessThan(tiers.indexOf('anchored'));
    expect(tiers.lastIndexOf('indexed')).toBe(tiers.length - 1);
  });

  it('solo semantic va sin marca de fragilidad; indexed SIEMPRE fragil', () => {
    const el: PickedElement = { role: 'textbox', via: 'click', nth_of_role: 4 };
    const cands = buildFallbackCandidates(el, PRIORITY);
    const indexed = cands.find((c) => c.tier === 'indexed');
    expect(indexed?.fragile).toBe(true);
    expect(indexed?.why).toMatch(/posicional/);
  });

  it('un id de aspecto generado NO produce candidato css', () => {
    const el: PickedElement = { role: 'textbox', via: 'click', dom_id: 'input-347', id_stable: false };
    expect(buildFallbackCandidates(el, PRIORITY).some((c) => c.tier === 'css')).toBe(false);
  });

  it('el scoped se ancla al contenedor con nombre accesible', () => {
    const el: PickedElement = { role: 'button', name: 'Guardar', via: 'click', anchor: { role: 'region', name: 'Beneficiario' } };
    const scoped = buildFallbackCandidates(el, PRIORITY).find((c) => c.tier === 'scoped');
    expect(scoped?.source).toBe("getByRole('region', { name: 'Beneficiario' }) >> getByRole('button', { name: 'Guardar' })");
  });
});

describe('parseLocatorChain', () => {
  it('parte por el separador y extrae el nth de cada segmento', () => {
    expect(parseLocatorChain("getByRole('form') >> getByRole('textbox').nth(2)")).toEqual([
      { segment: "getByRole('form')" },
      { segment: "getByRole('textbox')", nth: 2 },
    ]);
  });

  it('un solo segmento se comporta como siempre', () => {
    expect(parseLocatorChain("getByTestId('x')")).toEqual([{ segment: "getByTestId('x')" }]);
  });

  it('round-trip con lo que emite buildFallbackCandidates', () => {
    const el: PickedElement = { role: 'textbox', via: 'click', anchor: { role: 'form', name: 'Datos' }, nth_of_role: 3 };
    const indexed = buildFallbackCandidates(el, ['getByRole']).find((c) => c.tier === 'indexed')!;
    const chain = parseLocatorChain(indexed.source);
    expect(chain).toHaveLength(2);
    expect(chain[1].nth).toBe(3);
  });
});


describe('espacios alrededor de la puntuacion (K0.12 — caso real onesait)', () => {
  it('normalizeText pliega los espacios del separador', () => {
    expect(normalizeText('RESCATES / REINVERSION')).toBe('rescates/reinversion');
    expect(normalizeText('Rescates/Reinversion')).toBe('rescates/reinversion');
    expect(normalizeText('SINIESTROS (Fallecim./Invalidez)')).toBe('siniestros (fallecim./invalidez)');
  });

  it('el patron matchea el menu de la app desde el texto del FD y al reves', () => {
    // el FD escribe "Rescates/Reinversion", la app muestra "RESCATES / REINVERSION"
    const desdeFD = new RegExp(accentInsensitivePattern('Rescates/Reinversión'), 'i');
    expect(desdeFD.test('RESCATES / REINVERSIÓN')).toBe(true);
    expect(desdeFD.test('RESCATES/REINVERSIÓN')).toBe(true);

    const desdeApp = new RegExp(accentInsensitivePattern('RESCATES / REINVERSIÓN'), 'i');
    expect(desdeApp.test('Rescates/Reinversión')).toBe(true);
  });

  it('el item de nivel 3 del FD matchea tal cual (no habia drift)', () => {
    const re = new RegExp(accentInsensitivePattern('Simulación/Declaración Rescates'), 'i');
    expect(re.test('Simulación/Declaración Rescates')).toBe(true);
    expect(re.test('SIMULACIÓN / DECLARACIÓN RESCATES')).toBe(true);
  });

  it('no confunde ramas hermanas del menu', () => {
    // "SIMULACION RESCATES" es OTRA entrada de nivel 2: no debe matchear el item de nivel 3
    const re = new RegExp(accentInsensitivePattern('Simulación/Declaración Rescates'), 'i');
    expect(re.test('SIMULACIÓN RESCATES')).toBe(false);
  });

  it('hints que solo difieren en el espaciado del separador comparten alias', () => {
    expect(aliasKey({ role: 'link', name: 'Rescates/Reinversión' }))
      .toBe(aliasKey({ role: 'link', name: 'RESCATES / REINVERSIÓN' }));
  });

  it('K0.16: el scope entra en la clave del alias — dos "X" no colisionan', () => {
    const x = { role: 'button', name: 'X' };
    const enDocumento = aliasKey(x, { role: 'dialog', name: 'Documento de Liquidación' });
    const enTarea = aliasKey(x, { role: 'dialog', name: 'Gestionar Documentación y Firma' });
    // sin esto, la memoria del cliente guardaria UN locator para los dos botones
    expect(enDocumento).not.toBe(enTarea);
    // el scope tambien se normaliza (acentos/case), como el hint
    expect(enDocumento).toBe(aliasKey(x, { role: 'DIALOG', name: 'DOCUMENTO DE LIQUIDACION' }));
    // y sin scope la clave es EXACTAMENTE la de antes: los ficheros existentes valen
    expect(aliasKey(x)).toBe('|button|x||');
  });

  it('K0.16: assistStepsToWalkSteps deja el parche listo para pegar en el guion', () => {
    const walk = assistStepsToWalkSteps(
      [
        { action: 'click', hint: { role: 'button', name: 'Open Menu' }, locator: "getByRole('button', { name: 'Open Menu' })", role: 'opener' },
        { action: 'click', hint: { role: 'link', name: 'Logout' }, locator: "getByTestId('logout-sidebar-link')", role: 'target' },
        { action: 'expect_text', hint: {}, locator: '', role: 'assertion', value: 'Bienvenido' },
      ],
      's5',
    );
    expect(walk.map((s) => s.id)).toEqual(['s5', 's5b', 's5c']);
    // el locator VIAJA: es lo que hace fundible un parche por encima del tier plano
    expect(walk[1].locator).toBe("getByTestId('logout-sidebar-link')");
    expect(walk[2]).toEqual({ id: 's5c', action: 'expect_text', value: 'Bienvenido' });
    // y el resultado es un guion valido
    expect(validateWalkScript({ version: 1, site_id: 's', entry: '/', flows: [{ flow: 'f', steps: walk }] }))
      .toEqual({ ok: true, errors: [] });
  });

  it('sincronizacion: retry_safe sin oraculo es reintento ciego y no valida', () => {
    const base = (step: Partial<WalkStep>): unknown => ({
      version: 1,
      site_id: 's',
      entry: '/',
      flows: [{ flow: 'f', steps: [{ id: 's1', action: 'click', hint: { role: 'button', name: 'X' }, ...step }] }],
    });
    const sinOraculo = validateWalkScript(base({ retry_safe: true }));
    expect(sinOraculo.ok).toBe(false);
    expect(sinOraculo.errors[0]).toContain('sin oráculo el reintento es ciego');
    // con postcondicion inline si vale
    expect(validateWalkScript(base({ retry_safe: true, expect_after: 'Guardado' }))).toEqual({ ok: true, errors: [] });
    // y con transicion tambien
    expect(validateWalkScript(base({ retry_safe: true, expect_transition: true }))).toEqual({ ok: true, errors: [] });
  });

  it('sincronizacion: expect_after no aplica a pasos que no ejecutan accion', () => {
    const r = validateWalkScript({
      version: 1,
      site_id: 's',
      entry: '/',
      flows: [{ flow: 'f', steps: [{ id: 's1', action: 'expect_text', value: 'Hola', expect_after: 'Adios' }] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("'expect_after' no aplica");
  });

  it('sincronizacion: settle con numeros negativos no valida', () => {
    const r = validateWalkScript({
      version: 1,
      site_id: 's',
      entry: '/',
      flows: [{ flow: 'f', steps: [{ id: 's1', action: 'capture', settle: { quiet_ms: -1 } }] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('settle.quiet_ms');
  });

  it('K0.16: un locator autoritativo sustituye a la hint', () => {
    const r = validateWalkScript({
      version: 1,
      site_id: 's',
      entry: '/',
      flows: [{ flow: 'f', steps: [{ id: 's1', action: 'fill', locator: 'css=#x', value: 'v' }] }],
    });
    expect(r).toEqual({ ok: true, errors: [] });
  });

  it('K0.16: locator vacio, scope sin campos y ambos juntos no validan', () => {
    const step = (extra: Record<string, unknown>): unknown => ({
      version: 1,
      site_id: 's',
      entry: '/',
      flows: [{ flow: 'f', steps: [{ id: 's1', action: 'click', hint: { role: 'button', name: 'X' }, ...extra }] }],
    });
    expect(validateWalkScript(step({ locator: '  ' })).errors[0]).toContain("'locator' debe ser una cadena no vacía");
    expect(validateWalkScript(step({ scope: {} })).errors[0]).toContain("'scope' necesita al menos un campo");
    expect(validateWalkScript(step({ locator: 'css=#a', scope: { role: 'dialog' } })).errors[0]).toContain(
      "no declares 'locator' y 'scope'",
    );
  });

  it('K0.16: el guion del banco corporativo valida y ejercita scope y locator', () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/corp-bench.walk.json'), 'utf8'));
    expect(validateWalkScript(raw)).toEqual({ ok: true, errors: [] });
    const steps = raw.flows[0].steps as Array<Record<string, unknown>>;
    // los DOS botones "X" de la cadena de modales: misma hint, contenedor distinto
    const equis = steps.filter((s) => (s.hint as { name?: string })?.name === 'X');
    expect(equis).toHaveLength(2);
    expect(new Set(equis.map((s) => (s.scope as { name?: string }).name)).size).toBe(2);
    // el "Siguiente" de la botonera inferior, distinguido por cadena
    expect(steps.find((s) => s.id === 's12')!.locator).toContain('.botonera:not(.sup)');
  });

  it('el guion de onesait valida y usa el camino de tres niveles', () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/onesait.lean.walk.json'), 'utf8'));
    expect(validateWalkScript(raw)).toEqual({ ok: true, errors: [] });
    const steps = raw.flows[0].steps;
    expect(steps).toHaveLength(10);
    // GESTION -> Rescates/Reinversion -> Simulacion/Declaracion Rescates
    expect([steps[3].action, steps[3].hint.name]).toEqual(['hover', 'GESTIÓN']);
    expect([steps[4].action, steps[4].hint.name]).toEqual(['hover', 'Rescates/Reinversión']);
    expect([steps[5].action, steps[5].hint.name]).toEqual(['click', 'Simulación/Declaración Rescates']);
    // el nivel 2 es OBLIGATORIO: sin abrirlo el nivel 3 no es clicable
    expect(steps[4].optional).toBeUndefined();
  });
});
