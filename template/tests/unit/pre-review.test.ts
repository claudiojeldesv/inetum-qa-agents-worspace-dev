import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  preReviewSpec,
  loadPreReviewContract,
  loadBusinessPostconditions,
  parseTscOutput,
  attributeDiagnostics,
  runTsc,
  debeEscribirse,
  scanReadinessGuards,
  postconditionsForSpec,
  assertsLandingUrl,
  screenFileName,
  type PreReviewContract,
} from '../../src/scripts/pre-review.ts';

const BASE: PreReviewContract = {
  forbid_css_selectors: true,
  forbid_xpath: true,
  css_fallback_attributes: [],
  banned_apis: ['page.waitForTimeout', 'assert.equal', 'xpath'],
  pom_enabled: true,
  require_business_postcondition: false,
  min_functional_asserts: 1,
  evidence_level: 'minimal',
};

const HEADER = `/**
 * @criterion El usuario válido accede al inventario (plan: inicio-sesion)
 * @generated-by ia4d-writer
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../../pages/saucedemo/login.page.ts';
`;

const A11Y_BLOCK = `
  const results = await new AxeBuilder({ page }).analyze();
  const a11yViolations = results.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''));
  if (a11yViolations.length > 0) {
    test.info().annotations.push({ type: 'a11y-warning', description: 'x' });
  }
`;

const SPEC_LIMPIO = `${HEADER}
test('credenciales válidas → muestra inventario', async ({ page }) => {
  await page.goto('/');
  ${A11Y_BLOCK}
  const login = new LoginPage(page);
  await login.iniciarSesion('standard_user', 'secret_sauce');
  await expect(page.getByTestId('inventory-list')).toBeVisible();
});
`;

let dir: string;
const write = (name: string, content: string): string => {
  const p = join(dir, name);
  writeFileSync(p, content, 'utf8');
  return p;
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pre-review-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const ids = (r: ReturnType<typeof preReviewSpec>): string[] => r.findings.map((f) => f.criterion_id);

describe('preReviewSpec — spec limpio', () => {
  it('pasa sin findings', () => {
    const r = preReviewSpec(write('limpio.spec.ts', SPEC_LIMPIO), BASE);
    expect(r.findings).toEqual([]);
    expect(r.clean).toBe(true);
  });

  it('salta los checks de contenido en ficheros de setup', () => {
    // el fixture asserta su URL de aterrizaje porque MF-auth-landing (D39) lo exige a
    // todo setup; lo que este test prueba sigue siendo que el RESTO de checks no aplica
    const r = preReviewSpec(
      write('auth.setup.ts', `import { test as setup, expect } from '@playwright/test';\nsetup('auth', async ({ page }) => { await page.goto('/'); await expect(page).toHaveURL(/inventory/); });`),
      BASE,
    );
    expect(r.skipped).toBe(true);
    expect(r.clean).toBe(true);
  });
});

describe('preReviewSpec — MF-1 locators', () => {
  it('rechaza XPath', () => {
    const r = preReviewSpec(
      write('xpath.spec.ts', SPEC_LIMPIO.replace("page.getByTestId('inventory-list')", "page.locator('xpath=//div[@id=\"inventory\"]')")),
      BASE,
    );
    expect(ids(r)).toContain('MF-1');
    expect(r.clean).toBe(false);
  });

  it('rechaza CSS bruto (clase/descendiente)', () => {
    const r = preReviewSpec(
      write('css.spec.ts', SPEC_LIMPIO.replace("page.getByTestId('inventory-list')", "page.locator('div.inventory_list > .item')")),
      BASE,
    );
    expect(ids(r)).toContain('MF-1');
  });

  it('acepta atributo acotado taggeado y sancionado por el contract', () => {
    const spec = SPEC_LIMPIO.replace(
      "await expect(page.getByTestId('inventory-list')).toBeVisible();",
      "await expect(page.locator('[name=\"login-button\"]')).toBeVisible(); // css-fallback: no semantic locator (legacy)",
    );
    const conAttr = { ...BASE, css_fallback_attributes: ['name'] };
    expect(preReviewSpec(write('fallback-ok.spec.ts', spec), conAttr).clean).toBe(true);
  });

  it('rechaza atributo acotado sin tag css-fallback o sin sancionar', () => {
    const sinTag = SPEC_LIMPIO.replace(
      "page.getByTestId('inventory-list')",
      "page.locator('[name=\"login-button\"]')",
    );
    expect(ids(preReviewSpec(write('fallback-sin-tag.spec.ts', sinTag), { ...BASE, css_fallback_attributes: ['name'] }))).toContain('MF-1');
    const sinSancion = sinTag.replace('toBeVisible();', "toBeVisible(); // css-fallback: x");
    expect(ids(preReviewSpec(write('fallback-sin-sancion.spec.ts', sinSancion), BASE))).toContain('MF-1');
  });
});

describe('preReviewSpec — waits y banned APIs', () => {
  it('MF-2 con waitForTimeout', () => {
    const r = preReviewSpec(
      write('wait.spec.ts', SPEC_LIMPIO.replace('await login.iniciarSesion', 'await page.waitForTimeout(1000);\n  await login.iniciarSesion')),
      BASE,
    );
    expect(ids(r)).toContain('MF-2');
    expect(ids(r)).not.toContain('MF-banned-api'); // dedupe: waitForTimeout ya es MF-2
  });

  it('banned api del contract (assert.equal)', () => {
    const r = preReviewSpec(
      write('banned.spec.ts', SPEC_LIMPIO.replace('await expect(page.getByTestId', 'assert.equal(1, 1);\n  await expect(page.getByTestId')),
      BASE,
    );
    expect(ids(r)).toContain('MF-banned-api');
  });
});

// ---------------------------------------------------------------------------
// Checks de FORMA (spec-template.md) — should-fix, nunca tocan `clean`
// ---------------------------------------------------------------------------

const STEPS: PreReviewContract = { ...BASE, evidence_level: 'steps' };

/** Spec canónico en forma `steps`: el golden de spec-template.md, reducido. */
const SPEC_CANON_STEPS = `${HEADER}
test('credenciales válidas → muestra inventario', async ({ page }) => {
  const login = new LoginPage(page);
  await test.step('Dado: el formulario de login', async () => {
    await page.goto('/');
  });
  await test.step('Evidencia a11y (WCAG 2.1 AA)', async () => {
    ${A11Y_BLOCK}
  });
  await test.step('Cuando: introduce credenciales válidas', async () => {
    await login.iniciarSesion('standard_user', 'secret_sauce');
  });
  await test.step('Entonces: muestra el inventario', async () => {
    await expect(page.getByTestId('inventory-list')).toBeVisible();
  });
});
`;

describe('preReviewSpec — forma (spec-template.md)', () => {
  it('el golden en forma steps pasa sin findings (par falsable, mitad limpia)', () => {
    const r = preReviewSpec(write('canon-steps.spec.ts', SPEC_CANON_STEPS), STEPS);
    expect(r.findings).toEqual([]);
    expect(r.clean).toBe(true);
  });

  it('SF-generated-by: JSDoc sin procedencia', () => {
    const sinTag = SPEC_CANON_STEPS.replace(' * @generated-by ia4d-writer\n', '');
    const r = preReviewSpec(write('sin-procedencia.spec.ts', sinTag), STEPS);
    expect(ids(r)).toContain('SF-generated-by');
    expect(r.clean).toBe(true); // should-fix no bloquea
  });

  it('SF-steps: evidence.level steps pero cuerpo plano', () => {
    const r = preReviewSpec(write('plano-en-steps.spec.ts', SPEC_LIMPIO), STEPS);
    expect(ids(r)).toContain('SF-steps');
    expect(r.clean).toBe(true);
  });

  it("SF-steps no aplica con evidence.level 'minimal' (mismo spec, otro contract)", () => {
    const r = preReviewSpec(write('plano-en-minimal.spec.ts', SPEC_LIMPIO), BASE);
    expect(ids(r)).not.toContain('SF-steps');
  });

  it('SF-step-lang: marcador // Step N: en inglés, en cualquier nivel', () => {
    const conStep = SPEC_LIMPIO.replace('await page.goto', '// Step 1: navegar\n  await page.goto');
    const r = preReviewSpec(write('step-en.spec.ts', conStep), BASE);
    expect(ids(r)).toContain('SF-step-lang');
    const conPaso = SPEC_LIMPIO.replace('await page.goto', '// Paso 1: navegar\n  await page.goto');
    expect(ids(preReviewSpec(write('paso-es.spec.ts', conPaso), BASE))).not.toContain('SF-step-lang');
  });

  it('SF-a11y-step: scan fuera de su step canónico', () => {
    const scanSuelto = SPEC_CANON_STEPS.replace(
      "await test.step('Evidencia a11y (WCAG 2.1 AA)', async () => {",
      "await test.step('preparación', async () => {",
    );
    const r = preReviewSpec(write('a11y-fuera.spec.ts', scanSuelto), STEPS);
    expect(ids(r)).toContain('SF-a11y-step');
    expect(r.clean).toBe(true);
  });
});

describe('preReviewSpec — a11y, criterion, POM', () => {
  it('MF-4 sin scan AxeBuilder', () => {
    const sinAxe = `${HEADER}
test('t → r', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('x')).toBeVisible();
});
`;
    expect(ids(preReviewSpec(write('sin-axe.spec.ts', sinAxe), BASE))).toContain('MF-4');
  });

  it('MF-5 sin @criterion', () => {
    const r = preReviewSpec(write('sin-criterio.spec.ts', SPEC_LIMPIO.replace('@criterion El usuario válido accede al inventario (plan: inicio-sesion)', 'sin cita')), BASE);
    expect(ids(r)).toContain('MF-5');
  });

  it('MF-8 sin import de POM cuando pom.enabled', () => {
    const sinPom = SPEC_LIMPIO
      .replace("import { LoginPage } from '../../pages/saucedemo/login.page.ts';\n", '')
      .replace('  const login = new LoginPage(page);\n  await login.iniciarSesion(\'standard_user\', \'secret_sauce\');\n', '');
    expect(ids(preReviewSpec(write('sin-pom.spec.ts', sinPom), BASE))).toContain('MF-8');
    expect(preReviewSpec(write('sin-pom-off.spec.ts', sinPom), { ...BASE, pom_enabled: false }).clean).toBe(true);
  });
});

describe('preReviewSpec — MF-9 asserts funcionales', () => {
  const TD = { ...BASE, require_business_postcondition: true, min_functional_asserts: 1 };

  it('rechaza test solo-navegación', () => {
    const soloNav = SPEC_LIMPIO.replace(
      "await expect(page.getByTestId('inventory-list')).toBeVisible();",
      "await expect(page).toHaveURL(/inventory/);",
    );
    expect(ids(preReviewSpec(write('solo-nav.spec.ts', soloNav), TD))).toContain('MF-9');
  });

  it('acepta test con assert funcional (a11y y URL no cuentan)', () => {
    expect(preReviewSpec(write('funcional.spec.ts', SPEC_LIMPIO), TD).clean).toBe(true);
  });

  it('sin bloque test_design no aplica', () => {
    const soloNav = SPEC_LIMPIO.replace(
      "await expect(page.getByTestId('inventory-list')).toBeVisible();",
      "await expect(page).toHaveURL(/inventory/);",
    );
    expect(ids(preReviewSpec(write('solo-nav-off.spec.ts', soloNav), BASE))).not.toContain('MF-9');
  });
});

describe('preReviewSpec — MF-regex-anchor toHaveClass sin anclas (caso real TC-005 Q2)', () => {
  // SauceDemo: los inputs llevan SIEMPRE la clase base 'input_error form_input'; la exclusiva
  // del estado de error es la clase suelta 'error'. not.toHaveClass(/error/) matchea 'input_error'
  // por substring y el test falla aunque el error no esté — la clase del rojo TC-005 de Q2.
  it('rechaza not.toHaveClass(/error/) — substring contra la clase base input_error', () => {
    const r = preReviewSpec(
      write('regex-sin-ancla.spec.ts', SPEC_LIMPIO.replace(
        "await expect(page.getByTestId('inventory-list')).toBeVisible();",
        "await expect(page.getByTestId('username')).not.toHaveClass(/error/);",
      )),
      BASE,
    );
    expect(ids(r)).toContain('MF-regex-anchor');
    expect(r.clean).toBe(false);
  });

  it('acepta el fix real: regex anclado con \\b (\\berror\\b no matchea input_error)', () => {
    const r = preReviewSpec(
      write('regex-anclado-b.spec.ts', SPEC_LIMPIO.replace(
        "await expect(page.getByTestId('inventory-list')).toBeVisible();",
        "await expect(page.getByTestId('username')).not.toHaveClass(/\\berror\\b/);",
      )),
      BASE,
    );
    expect(ids(r)).not.toContain('MF-regex-anchor');
    expect(r.clean).toBe(true);
  });

  it('acepta anclas ^/$ y el arg string (match exacto de Playwright, no substring)', () => {
    const conAnclas = SPEC_LIMPIO.replace(
      "await expect(page.getByTestId('inventory-list')).toBeVisible();",
      "await expect(page.getByTestId('username')).toHaveClass(/^error$/);\n  await expect(page.getByTestId('password')).toHaveClass('input_error form_input');",
    );
    expect(preReviewSpec(write('regex-anclado-caret.spec.ts', conAnclas), BASE).clean).toBe(true);
  });

  it('caza el regex sin anclas también dentro de un array de toHaveClass', () => {
    const enArray = SPEC_LIMPIO.replace(
      "await expect(page.getByTestId('inventory-list')).toBeVisible();",
      "await expect(page.getByTestId('form').locator('input')).toHaveClass([/\\berror\\b/, /error/]);",
    );
    expect(ids(preReviewSpec(write('regex-array.spec.ts', enArray), BASE))).toContain('MF-regex-anchor');
  });

  it('un comentario de cola con slashes no produce falso positivo', () => {
    const conComentario = SPEC_LIMPIO.replace(
      "await expect(page.getByTestId('inventory-list')).toBeVisible();",
      "await expect(page.getByTestId('username')).toHaveClass(/\\berror\\b/); // ver plan §1.2 / docs/test-plans/",
    );
    expect(preReviewSpec(write('regex-comentario.spec.ts', conComentario), BASE).clean).toBe(true);
  });
});

describe('preReviewSpec — should-fix naming', () => {
  it('naturaleza en el título es should-fix y no ensucia el verdict', () => {
    const r = preReviewSpec(
      write('naming.spec.ts', SPEC_LIMPIO.replace('credenciales válidas → muestra inventario', 'login happy-path')),
      BASE,
    );
    expect(ids(r)).toContain('SF-naming');
    expect(r.clean).toBe(true);
    expect(r.should_fix).toBe(1);
  });
});

describe('loadPreReviewContract', () => {
  it('defaults sin contract', () => {
    const c = loadPreReviewContract(undefined);
    expect(c.forbid_css_selectors).toBe(true);
    expect(c.require_business_postcondition).toBe(false);
  });

  it('lee el contract de saucedemo', () => {
    const c = loadPreReviewContract('config/style-contracts/saucedemo.yaml');
    expect(c.banned_apis).toContain('page.waitForTimeout');
    expect(c.require_business_postcondition).toBe(true);
    expect(c.min_functional_asserts).toBe(1);
  });
});


// --------------------------------------------- MF-postcondition (kernel v2 K0.7)

describe('MF-postcondition — fuerza semantica del assert de cierre', () => {
  const WITH_POST: PreReviewContract = { ...BASE, require_business_postcondition: true };
  const POSTS = [
    { screen: 'checkout-completado', text: 'Thank you for your order!', test_id: 'complete-header' },
  ];

  /**
   * D37: la postcondicion solo se exige al spec que toca ESA pantalla, y el vinculo es el
   * import de su POM. El fixture usaba `CheckoutPage` sin importarlo — incoherencia que el
   * acotado dejo a la vista.
   */
  const HEADER_CHECKOUT =
    HEADER + "import { CheckoutPage } from '../../pages/saucedemo/checkout-completado.page.ts';" + '\n';

  /** El defecto REAL medido dos veces en Fase A: cierra sobre el boton de chrome. */
  const CHROME_ASSERT = `${HEADER_CHECKOUT}
test.describe('Feature: compra', () => {
  test('compra completa -> muestra confirmacion', async ({ page }) => {
    const p = new CheckoutPage(page);
    await page.goto('/');
    await expect(p.backToProducts).toBeVisible();
    await expect(p.backToProducts).toBeEnabled();
  });
});
`;

  const BUSINESS_ASSERT = `${HEADER_CHECKOUT}
test.describe('Feature: compra', () => {
  test('compra completa -> muestra confirmacion', async ({ page }) => {
    const p = new CheckoutPage(page);
    await page.goto('/');
    await expect(page.getByText('Thank you for your order!')).toBeVisible();
  });
});
`;

  const TESTID_ASSERT = `${HEADER_CHECKOUT}
test.describe('Feature: compra', () => {
  test('compra completa -> muestra confirmacion', async ({ page }) => {
    const p = new CheckoutPage(page);
    await page.goto('/');
    await expect(page.getByTestId('complete-header')).toBeVisible();
  });
});
`;

  it('caza el assert sobre chrome cuando el discovery trae la postcondicion', () => {
    const r = preReviewSpec(write('chrome.spec.ts', CHROME_ASSERT), WITH_POST, undefined, POSTS);
    const mf = r.findings.filter((f) => f.criterion_id === 'MF-postcondition');
    expect(mf).toHaveLength(1);
    expect(mf[0].severity).toBe('must-fix');
    expect(mf[0].description).toContain('Thank you for your order!');
  });

  it('acepta el assert sobre el texto de negocio', () => {
    const r = preReviewSpec(write('business.spec.ts', BUSINESS_ASSERT), WITH_POST, undefined, POSTS);
    expect(r.findings.some((f) => f.criterion_id === 'MF-postcondition')).toBe(false);
  });

  it('acepta el assert por test_id del elemento que porta el texto', () => {
    const r = preReviewSpec(write('testid.spec.ts', TESTID_ASSERT), WITH_POST, undefined, POSTS);
    expect(r.findings.some((f) => f.criterion_id === 'MF-postcondition')).toBe(false);
  });

  it('tolera diferencias de acentos y puntuacion en el texto', () => {
    const posts = [{ screen: 'sim', text: 'Simulacion generada correctamente' }];
    const src = `${HEADER}
test('simula -> confirma', async ({ page }) => {
  await expect(page.getByText('Simulación generada correctamente')).toBeVisible();
});
`;
    const r = preReviewSpec(write('acentos.spec.ts', src), WITH_POST, undefined, posts);
    expect(r.findings.some((f) => f.criterion_id === 'MF-postcondition')).toBe(false);
  });

  it('NO aplica sin discovery (no se inventan exigencias)', () => {
    const r = preReviewSpec(write('nodisc.spec.ts', CHROME_ASSERT), WITH_POST, undefined, []);
    expect(r.findings.some((f) => f.criterion_id === 'MF-postcondition')).toBe(false);
  });

  it('NO aplica con require_business_postcondition:false', () => {
    const r = preReviewSpec(write('off.spec.ts', CHROME_ASSERT), BASE, undefined, POSTS);
    expect(r.findings.some((f) => f.criterion_id === 'MF-postcondition')).toBe(false);
  });
});

describe('loadBusinessPostconditions — extraccion desde el discovery', () => {
  const discovery = {
    screens: [
      {
        name: 'checkout-completado',
        interactive_elements: [
          { role: 'button', name: 'Back Home', test_id: 'back-to-products', verified: true },
          { role: 'heading', name: 'Thank you for your order!', test_id: 'complete-header', verified: true },
          { role: 'status', name: 'Pedido registrado', verified: null },
          { role: 'alert', name: 'Fantasma no verificado', verified: false },
        ],
      },
    ],
  };

  it('extrae solo roles de negocio y descarta los no verificados', () => {
    const f = join(dir, 'discovery.json');
    writeFileSync(f, JSON.stringify(discovery), 'utf8');
    const posts = loadBusinessPostconditions(f);
    expect(posts.map((p) => p.text)).toEqual(['Thank you for your order!', 'Pedido registrado']);
    expect(posts[0].test_id).toBe('complete-header');
  });

  it('sin path o con fichero ausente devuelve vacio', () => {
    expect(loadBusinessPostconditions(undefined)).toEqual([]);
    expect(loadBusinessPostconditions(join(dir, 'no-existe.json'))).toEqual([]);
  });
});

/**
 * MF-tsc — el veredicto del compilador, atribuido por spec.
 *
 * Dos defectos de campo salieron por aquí porque NADA en el flujo corría `tsc`
 * (verificado: cero invocaciones en commands y agentes). D24: un nombre accesible
 * numérico generaba `readonly 12345: Locator` y tumbaba el POM entero. D29: una
 * propiedad `readonly transferFunds: Locator` del scaffolder tapaba el método de
 * negocio homónimo del Writer y estallaba en ejecución con «no es una función».
 * Los dos los dice `tsc --noEmit` en 6 s.
 */
describe('pre-review — MF-tsc: el compilador antes que el estilo', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'prereview-tsc-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('parsea fichero, línea, columna y código de la salida de tsc', () => {
    const raw = [
      'tests/e2e/tc-002.spec.ts(12,5): error TS2349: This expression is not callable.',
      'tests/pages/overview.page.ts(8,3): error TS1003: Identifier expected.',
    ].join('\n');
    const d = parseTscOutput(raw);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ file: 'tests/e2e/tc-002.spec.ts', line: 12, column: 5, code: 'TS2349' });
    expect(d[1].code).toBe('TS1003');
  });

  it('un error GLOBAL del proyecto se conserva: significa que el typecheck no cubrió nada', () => {
    const d = parseTscOutput('error TS18003: No inputs were found in config file.');
    expect(d).toHaveLength(1);
    expect(d[0].file).toBe('');
    expect(d[0].code).toBe('TS18003');
  });

  it('el ruido no produce diagnósticos fantasma', () => {
    expect(parseTscOutput('\n\nFound 0 errors.\n')).toEqual([]);
    expect(parseTscOutput('')).toEqual([]);
  });

  it('EL PAR FALSABLE (D29): el error vive en el POM y se atribuye al spec que lo importa', () => {
    const pom = join(dir, 'transfer.page.ts');
    const spec = join(dir, 'transfer.spec.ts');
    writeFileSync(pom, 'export class TransferPage {}\n', 'utf8');
    const source = "import { TransferPage } from './transfer.page.ts';\n";
    writeFileSync(spec, source, 'utf8');
    const diags = [
      {
        file: pom,
        line: 9,
        column: 3,
        code: 'TS2349',
        message: 'This expression is not callable. Type Locator has no call signatures.',
      },
    ];
    // el Writer que escribió el spec es quien puede arreglar su POM: atribuirlo a un
    // fichero que nadie revisa lo deja huérfano, que es como D29 llegó a la ejecución
    expect(attributeDiagnostics(spec, source, diags)).toHaveLength(1);
  });

  it('un error en un fichero que el spec NO importa no se le cuelga', () => {
    const spec = join(dir, 'otro.spec.ts');
    const source = "import { LoginPage } from './login.page.ts';\n";
    writeFileSync(spec, source, 'utf8');
    const diags = [
      { file: join(dir, 'ajeno.page.ts'), line: 3, column: 1, code: 'TS1003', message: 'Identifier expected.' },
    ];
    expect(attributeDiagnostics(spec, source, diags)).toEqual([]);
  });

  it('MF-tsc sale como must-fix, en la línea que dijo el compilador', () => {
    const spec = join(dir, 'compila-mal.spec.ts');
    writeFileSync(spec, SPEC_LIMPIO, 'utf8');
    const r = preReviewSpec(spec, BASE, undefined, [], [
      { file: spec, line: 42, column: 7, code: 'TS2349', message: 'This expression is not callable.' },
    ]);
    const tsc = r.findings.filter((f) => f.criterion_id === 'MF-tsc');
    expect(tsc).toHaveLength(1);
    expect(tsc[0].severity).toBe('must-fix');
    expect(tsc[0].category).toBe('compile');
    expect(tsc[0].location.line).toBe(42);
    expect(r.clean).toBe(false);
  });

  it('el error del POM importado nombra DÓNDE está, para que el Writer no busque en el spec', () => {
    const pom = join(dir, 'login.page.ts');
    writeFileSync(pom, 'export class LoginPage {}\n', 'utf8');
    const spec = join(dir, 'con-pom.spec.ts');
    const source = "import { LoginPage } from './login.page.ts';\n";
    writeFileSync(spec, source, 'utf8');
    const r = preReviewSpec(spec, BASE, undefined, [], [
      { file: pom, line: 4, column: 3, code: 'TS1003', message: 'Identifier expected.' },
    ]);
    const tsc = r.findings.find((f) => f.criterion_id === 'MF-tsc');
    expect(tsc?.description).toContain('login.page.ts');
    expect(tsc?.description).toContain('importado por este spec');
  });

  it('un .setup.ts se salta el CONTENIDO pero no la COMPILACIÓN (D28 vivía en un setup)', () => {
    const setup = join(dir, 'auth.setup.ts');
    // con la asercion de aterrizaje que MF-auth-landing (D39) exige: aqui se prueba la
    // compilacion, no la senal de auth
    writeFileSync(
      setup,
      "import { test as setup, expect } from '@playwright/test';" + '\n' + "await expect(page).toHaveURL(/x/);",
      'utf8',
    );
    const limpio = preReviewSpec(setup, BASE, undefined, [], []);
    expect(limpio.skipped).toBe(true);
    expect(limpio.clean).toBe(true);

    const roto = preReviewSpec(setup, BASE, undefined, [], [
      { file: setup, line: 3, column: 1, code: 'TS2304', message: "Cannot find name 'page'." },
    ]);
    // sigue marcado como skipped (los checks de estilo no aplican) pero NO está limpio:
    // un setup que no compila tumba el proyecto entero
    expect(roto.skipped).toBe(true);
    expect(roto.clean).toBe(false);
    expect(roto.must_fix).toBe(1);
  });

  it('sin diagnósticos no inventa findings', () => {
    const spec = join(dir, 'sano.spec.ts');
    writeFileSync(spec, SPEC_LIMPIO, 'utf8');
    const r = preReviewSpec(spec, BASE, undefined, [], []);
    expect(r.findings.filter((f) => f.criterion_id === 'MF-tsc')).toEqual([]);
  });

  it('runTsc DECLARA que no pudo correr en vez de reportar limpio', () => {
    // un typecheck ausente reportado como verde es exactamente la mentira que este
    // check viene a matar: el directorio temporal no tiene node_modules
    const r = runTsc(dir);
    expect(r.ran).toBe(false);
    expect(r.diagnostics).toEqual([]);
    expect(r.note).toMatch(/typescript no esta instalado/);
  });
});

describe('pre-review — un finding calculado no se tira a la basura', () => {
  it('EL PAR FALSABLE: un .setup.ts saltado pero SUCIO si se escribe', () => {
    // en campo (2026-08-21) el CLI hacia `if (r.skipped) continue` antes de escribir,
    // asi que los findings de MF-tsc de un setup se calculaban y se descartaban: el
    // Writer nunca los veia. Patron D2 — declarado y nadie lo consume.
    expect(debeEscribirse({ skipped: true, clean: false })).toBe(true);
  });

  it('saltado y limpio no genera fichero: no hay nada que contar', () => {
    expect(debeEscribirse({ skipped: true, clean: true })).toBe(false);
  });

  it('un spec normal siempre se escribe, limpio o no', () => {
    expect(debeEscribirse({ skipped: false, clean: true })).toBe(true);
    expect(debeEscribirse({ skipped: false, clean: false })).toBe(true);
  });
});

/**
 * D35 — una espera de disponibilidad declara su presupuesto.
 *
 * Par falsable literal de campo (2026-08-21): TC-002 verde en la pasada 1, rojo en la 2.
 * El Writer hizo lo dificil bien —detecto la carga asincrona y escribio un helper citando
 * el plan— y fallo en lo facil: dejo el presupuesto por defecto.
 *
 *     Expected: not 0 | Received: 0 | Timeout: 5000ms  (13 x resolved to 0 elements)
 */
describe('pre-review — MF-wait-budget: la espera declara su presupuesto', () => {
  const POM_DE_CAMPO = `
export class TransferFundsPage {
  /** Espera a que la carga async de cuentas resuelva (plan linea 16). */
  async waitForAccountsLoaded() {
    await expect(this.fromaccountid.locator('option')).not.toHaveCount(0);
    await expect(this.toaccountid.locator('option')).not.toHaveCount(0);
  }
}`;

  it('EL PAR FALSABLE: el helper real que se puso flaky se caza', () => {
    const g = scanReadinessGuards(POM_DE_CAMPO);
    expect(g.length).toBeGreaterThan(0);
    expect(g[0].description).toContain('not.toHaveCount(0)');
    expect(g[0].description).toContain('timeout');
  });

  it('con el presupuesto declarado, deja de ser un finding', () => {
    const sano = POM_DE_CAMPO.replace(
      /\.not\.toHaveCount\(0\)/g,
      ".not.toHaveCount(0, { timeout: 20_000 })",
    );
    expect(scanReadinessGuards(sano)).toEqual([]);
  });

  it('un waitFor* que asserta sin timeout tambien cuenta, aunque no use toHaveCount', () => {
    const src = `
export class P {
  async waitForPanel() {
    await expect(this.panel).toBeVisible();
  }
}`;
    const g = scanReadinessGuards(src);
    expect(g).toHaveLength(1);
    expect(g[0].description).toContain('waitForPanel');
  });

  it('un waitFor* con presupuesto esta bien', () => {
    const src = `
export class P {
  async waitForPanel() {
    await expect(this.panel).toBeVisible({ timeout: 15_000 });
  }
}`;
    expect(scanReadinessGuards(src)).toEqual([]);
  });

  it('no dispara sobre asserts de negocio normales', () => {
    const src = `
test('x', async () => {
  await expect(page.getByText('Transfer Complete!')).toBeVisible();
  await expect(rows).toHaveCount(3);
});`;
    expect(scanReadinessGuards(src)).toEqual([]);
  });

  it('la etiqueta dice en QUE fichero esta, porque el helper vive en el POM', () => {
    const g = scanReadinessGuards(POM_DE_CAMPO, 'transfer-funds.page.ts');
    expect(g[0].description).toContain('transfer-funds.page.ts');
    expect(g[0].description).toContain('importado por este spec');
  });

  it('un waitFor* que no asserta nada no es una guarda: no se reporta', () => {
    const src = `
export class P {
  async waitForNothing() {
    await this.page.goto('/x');
  }
}`;
    expect(scanReadinessGuards(src)).toEqual([]);
  });
});

/**
 * D37 — las postcondiciones exigibles son las de LA PANTALLA del spec.
 *
 * Par falsable de campo (2026-08-21): el analizador emitio una pantalla `error` con el
 * heading «Error!». Eso activo por primera vez `MF-postcondition` —hasta entonces no
 * habia ninguna postcondicion y la guarda lo saltaba— y empezo a exigirle al spec de
 * login que asertara «Transfer Complete!» o «Error!». Dos Writers lo reportaron como
 * falso positivo y dos EDITARON el discovery para poder pasarlo (D38).
 */
describe('pre-review — D37: el gate de postcondicion se acota a la pantalla del spec', () => {
  const TODAS = [
    { screen: 'login', text: 'Customer Login' },
    { screen: 'transfer', text: 'Transfer Complete!' },
    { screen: 'error', text: 'Error!' },
  ];
  const specLogin = 'C:/ws/tests/e2e/parabank-fd/TC-001_login.spec.ts';
  const fuenteLogin = "import { LoginPage } from '../../pages/parabank-fd/login.page';";

  it('EL PAR FALSABLE: al spec de login no se le exige «Transfer Complete!»', () => {
    const p = postconditionsForSpec(fuenteLogin, specLogin, TODAS);
    expect(p.map((x) => x.text)).toEqual(['Customer Login']);
  });

  it('un spec que importa dos POM se lleva las postcondiciones de los dos', () => {
    const fuente = [
      "import { LoginPage } from '../../pages/parabank-fd/login.page';",
      "import { TransferPage } from '../../pages/parabank-fd/transfer.page';",
    ].join('\n');
    const p = postconditionsForSpec(fuente, specLogin, TODAS);
    expect(p.map((x) => x.text).sort()).toEqual(['Customer Login', 'Transfer Complete!']);
  });

  it('si no se puede acotar a ninguna pantalla el check NO aplica: no se inventan exigencias', () => {
    const sinPom = "import { test } from '@playwright/test';";
    expect(postconditionsForSpec(sinPom, specLogin, TODAS)).toEqual([]);
  });

  it('sin postcondiciones no hay nada que acotar', () => {
    expect(postconditionsForSpec(fuenteLogin, specLogin, [])).toEqual([]);
  });

  it('el nombre de fichero se deriva igual que en el scaffolder', () => {
    expect(screenFileName('accounts-overview')).toBe('accounts-overview.page.ts');
    expect(screenFileName('Transfer Funds')).toBe('transfer-funds.page.ts');
  });
});

/**
 * D39 — el setup de auth asserta DONDE aterrizo, no solo que hay un enlace en el menu.
 *
 * Par falsable de campo: `auth.setup.ts` paso en VERDE contra una app que devolvia HTTP
 * 500, porque su senal de exito era el enlace `Log Out` — que ParaBank pinta tambien en
 * su pantalla de error. El gate dio por buena una sesion inservible.
 */
describe('pre-review — D39: MF-auth-landing', () => {
  let dirAuth: string;
  beforeAll(() => {
    dirAuth = mkdtempSync(join(tmpdir(), 'prereview-auth-'));
  });
  afterAll(() => {
    rmSync(dirAuth, { recursive: true, force: true });
  });

  const SETUP_DEBIL = [
    "import { test as setup, expect } from '@playwright/test';",
    "setup('auth', async ({ page }) => {",
    "  await page.goto('/parabank/index.htm');",
    "  await page.getByRole('button', { name: 'Log In' }).click();",
    "  await expect(page.getByRole('link', { name: 'Log Out' })).toBeVisible();",
    '});',
  ].join('\n');

  it('EL PAR FALSABLE: una senal solo de locator no basta', () => {
    expect(assertsLandingUrl(SETUP_DEBIL)).toBe(false);
    const f = join(dirAuth, 'auth.setup.ts');
    writeFileSync(f, SETUP_DEBIL, 'utf8');
    const r = preReviewSpec(f, BASE, undefined, [], []);
    const finding = r.findings.find((x) => x.criterion_id === 'MF-auth-landing');
    expect(finding?.severity).toBe('must-fix');
    expect(r.clean).toBe(false);
    expect(r.skipped).toBe(true); // los demas checks de contenido siguen sin aplicar
  });

  it('con la URL de destino asertada, el setup pasa', () => {
    const conUrl = SETUP_DEBIL.replace(
      '});',
      "  await expect(page).toHaveURL(/overview/);\n});",
    );
    const f = join(dirAuth, 'auth-ok.setup.ts');
    writeFileSync(f, conUrl, 'utf8');
    const r = preReviewSpec(f, BASE, undefined, [], []);
    expect(r.findings.find((x) => x.criterion_id === 'MF-auth-landing')).toBeUndefined();
    expect(r.clean).toBe(true);
  });

  it('waitForURL tambien vale como asercion de aterrizaje', () => {
    expect(assertsLandingUrl("await page.waitForURL('**/overview.htm');")).toBe(true);
  });

  it('un spec normal NO recibe este check', () => {
    const f = join(dirAuth, 'normal.spec.ts');
    writeFileSync(f, SPEC_LIMPIO, 'utf8');
    const r = preReviewSpec(f, BASE, undefined, [], []);
    expect(r.findings.find((x) => x.criterion_id === 'MF-auth-landing')).toBeUndefined();
  });
});
