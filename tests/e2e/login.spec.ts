/**
 * @criterion RF-001 (fd-parabank.md:20-24)
 *   "Inicio de sesión con credenciales válidas"
 *   given:  Un cliente registrado no ha iniciado sesión
 *   when:   El cliente introduce su nombre de usuario y contraseña correctos y confirma el acceso
 *   then:   El sistema autentica al cliente y muestra el resumen de cuentas con el saldo de cada cuenta
 *
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * AUTH-HANDLER (v0.2 Fase C): session persistence is owned by auth.setup.ts (setup
 * project) wired in playwright.config.ts via QA_STORAGE_STATE + dependencies. This spec
 * runs FRESH — it overrides the project-level storageState with an empty one so it
 * exercises the real login form, and it does NOT save state (auth.setup.ts does that).
 *
 * A11Y: axe-core scan injected per style-contract hard rule. parabank.yaml
 * a11y.fail_on_violations=false → warning mode only; violations captured as
 * test.info().annotations, never abort the test flow.
 *
 * LOCATORS: ParaBank JSP has no data-test attributes. Per style-contract
 * locators.css_fallback_attributes=[name,id], login inputs use css-fallback
 * (documented in LoginPage POM). All other locators are semantic.
 *
 * DATA: credentials john/demo from synthetic_fixtures[0] in parabank.yaml.
 * Balance values NOT asserted — shared demo environment; balances change across runs.
 *
 * Source: discovery-report.json criteria_mapping RF-001, screen "login" + "overview".
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';
import { OverviewPage } from '../pages/overview.page';

test.describe('Feature: Login', () => {
  // Fresh context: this test performs a real login; it must NOT inherit the
  // project-level storageState produced by the auth.setup dependency.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Scenario: valid credentials authenticate and display accounts overview', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const overviewPage = new OverviewPage(page);

    // given: cliente registrado no ha iniciado sesión — navigate to fresh login page
    await loginPage.goto();

    // A11y gate: always inject per SPEC hard rule; fail_on_violations=false → annotation only
    const a11yScan = await new AxeBuilder({ page }).analyze();
    const a11yViolations = a11yScan.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (a11yViolations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${a11yViolations.length} serious/critical violation(s): ` +
          a11yViolations.map(v => v.id).join(', '),
      });
    }

    // Assert login screen is active before submitting
    await expect(page).toHaveTitle('ParaBank | Welcome | Online Banking');
    await expect(loginPage.username).toBeVisible();
    await expect(loginPage.password).toBeVisible();
    await expect(loginPage.logIn).toBeVisible();

    // when: cliente introduce credenciales correctas y confirma el acceso
    // Credentials from synthetic_fixtures in parabank.yaml (john/demo — public demo account)
    await loginPage.login('john', 'demo');

    // then: sistema autentica al cliente
    await expect(page).toHaveURL(/\/parabank\/overview\.htm/);
    await expect(page).toHaveTitle('ParaBank | Accounts Overview');

    // then: muestra el resumen de cuentas — authenticated welcome message
    await expect(overviewPage.welcomeMessage).toBeVisible();

    // then: muestra el resumen de cuentas — Account Services navigation present
    await expect(overviewPage.transferFunds).toBeVisible();
    await expect(overviewPage.transferFunds).toHaveAttribute('href', /transfer\.htm/);
    await expect(overviewPage.logOut).toBeVisible();
    await expect(overviewPage.logOut).toHaveAttribute('href', /logout\.htm/);

    // then: muestra el resumen de cuentas — accounts table structure visible
    // Balance values not asserted: shared demo env, balances change between runs
    await expect(overviewPage.accountsTable).toBeVisible();
  });
});
