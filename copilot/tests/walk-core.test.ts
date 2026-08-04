import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  accentInsensitivePattern,
  aliasKey,
  buildFallbackCandidates,
  buildLocatorCandidates,
  dedupeAndPrune,
  hashScript,
  hintLocatorPlan,
  locatorSource,
  looksGeneratedId,
  normalizedPlan,
  normalizeText,
  parseLocatorChain,
  parseJsonLoose,
  pruneAriaSnapshot,
  resolveFixtureRef,
  slugFromUrl,
  validateWalkScript,
} from '../src/walk-core.ts';
import type { DomElement, PickedElement, WalkScript } from '../src/walk-types.ts';

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
    expect(plan.map((a) => a.kind)).toEqual(['test_id', 'role', 'text']);
  });

  it('omite intentos sin datos en el hint', () => {
    const plan = hintLocatorPlan({ role: 'textbox', name: 'Username' }, PRIORITY);
    expect(plan.map((a) => a.kind)).toEqual(['role', 'text']);
  });

  it('usa hint.text para getByText y cae a name si no hay text', () => {
    const withText = hintLocatorPlan({ text: 'Thank you' }, PRIORITY);
    expect(withText).toEqual([{ kind: 'text', value: 'Thank you' }]);
  });

  it('con priority invertida cambia el orden de intentos', () => {
    const plan = hintLocatorPlan({ test_id: 'x', role: 'button', name: 'Go' }, ['getByRole', 'getByTestId']);
    expect(plan.map((a) => a.kind)).toEqual(['role', 'test_id']);
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
    expect(norm.map((a) => a.kind)).toEqual(['role', 'text']);
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
