/**
 * @criterion RF-001 (parabank.feature:8 (REQ-LOGIN))
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * RF-001 — Inicio de sesion con credenciales validas
 * Given: un cliente registrado no ha iniciado sesion
 * When:  el cliente introduce su usuario y contrasena correctos; confirma el acceso
 * Then:  el sistema autentica al cliente y muestra el resumen de cuentas
 *
 * Synthetic fixture: synthetic_fixtures.credentials[0] — john / demo (parabank.yaml)
 * Style contract: style-contracts/parabank.yaml
 * Discovery: discovery-report.json screen 'login' + screen 'overview'
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';

test.describe('Feature: Login', () => {
  // RF-001 given: "un cliente registrado NO ha iniciado sesion". The chromium project
  // injects john's storageState (auth-handler, Fase C) for the post-login specs; this
  // login test must start UNAUTHENTICATED or ParaBank redirects an already-logged-in
  // session to overview.htm and the credential form never renders. Opt out of the shared
  // storageState with a clean empty state — standard Playwright pattern for login tests.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Scenario: standard user happy-path — RF-001', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Step 1: navigate to the login screen
    await loginPage.goto();

    // A11y check — injected per hard rule; fail_on_violations=false in style-contract,
    // so violations are annotated as warnings and do not abort the test.
    const a11yResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    if (a11yResults.violations.length > 0) {
      const serious = a11yResults.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${a11yResults.violations.length} violation(s) found (${serious.length} serious/critical): ${serious.map((v) => v.id).join(', ')}`,
      });
    }

    // Step 2: submit valid credentials (john / demo — synthetic_fixtures.credentials[0])
    await loginPage.login('john', 'demo');

    // Step 3: verify the system authenticated the client and shows the accounts overview
    // (RF-001 then: "el sistema autentica al cliente y muestra el resumen de cuentas")

    // 3a. Page heading confirms the authenticated screen
    await expect(
      page.getByRole('heading', { name: 'Accounts Overview', level: 1 }),
    ).toBeVisible();

    // 3b. Welcome message confirms identity of the authenticated user
    await expect(page.getByText('Welcome John Smith')).toBeVisible();

    // 3c. Log Out link confirms active session (auth state indicator per discovery-report)
    await expect(
      page.getByRole('link', { name: 'Log Out' }),
    ).toBeVisible();

    // 3d. Accounts table is present (summary of accounts — functional state, not balance value)
    // Scoped to #rightPanel to guard against layout changes adding tables elsewhere
    await expect(page.locator('#rightPanel').getByRole('table')).toBeVisible();
  });
});
