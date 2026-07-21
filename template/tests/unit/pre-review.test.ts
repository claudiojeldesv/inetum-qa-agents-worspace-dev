import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { preReviewSpec, loadPreReviewContract, type PreReviewContract } from '../../src/scripts/pre-review.ts';

const BASE: PreReviewContract = {
  forbid_css_selectors: true,
  forbid_xpath: true,
  css_fallback_attributes: [],
  banned_apis: ['page.waitForTimeout', 'assert.equal', 'xpath'],
  pom_enabled: true,
  require_business_postcondition: false,
  min_functional_asserts: 1,
};

const HEADER = `/**
 * @criterion El usuario válido accede al inventario (plan: inicio-sesion)
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
