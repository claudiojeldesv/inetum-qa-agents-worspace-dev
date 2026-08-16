import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  preReviewSpec,
  loadPreReviewContract,
  loadBusinessPostconditions,
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

  it('salta ficheros de setup', () => {
    const r = preReviewSpec(
      write('auth.setup.ts', `import { test as setup } from '@playwright/test';\nsetup('auth', async ({ page }) => { await page.goto('/'); });`),
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

  /** El defecto REAL medido dos veces en Fase A: cierra sobre el boton de chrome. */
  const CHROME_ASSERT = `${HEADER}
test.describe('Feature: compra', () => {
  test('compra completa -> muestra confirmacion', async ({ page }) => {
    const p = new CheckoutPage(page);
    await page.goto('/');
    await expect(p.backToProducts).toBeVisible();
    await expect(p.backToProducts).toBeEnabled();
  });
});
`;

  const BUSINESS_ASSERT = `${HEADER}
test.describe('Feature: compra', () => {
  test('compra completa -> muestra confirmacion', async ({ page }) => {
    const p = new CheckoutPage(page);
    await page.goto('/');
    await expect(page.getByText('Thank you for your order!')).toBeVisible();
  });
});
`;

  const TESTID_ASSERT = `${HEADER}
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
