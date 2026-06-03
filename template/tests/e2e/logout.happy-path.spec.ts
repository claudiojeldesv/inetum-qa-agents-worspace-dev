/**
 * @criterion RF-003 (parabank.feature:27 (REQ-LOGOUT))
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * RF-003 — Cierre de sesion
 * Given: el cliente tiene una sesion activa
 * When:  el cliente ejecuta el cierre de sesion
 * Then:  el sistema termina la sesion y devuelve a la pantalla de acceso
 *
 * ISOLATION NOTE: this test does NOT use the shared john storageState.
 * Logging out with the shared session kills the server-side JSESSIONID and
 * poisons concurrently-running authenticated tests (Fase E hallazgo). The test
 * performs its own isolated login and then exercises logout within that private
 * context, leaving the shared state untouched.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';
import { OverviewPage } from '../pages/overview.page';

// Isolated session — no shared storageState.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Feature: Cierre de sesion (RF-003)', () => {
  test('Scenario: Clicking Log Out from an authenticated session returns to the login page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const overviewPage = new OverviewPage(page);

    // --- Given: establish an isolated authenticated session ---
    await loginPage.goto();

    // Axe-core check on the login screen (hard rule — injected immediately after goto).
    const loginA11y = await new AxeBuilder({ page }).analyze();
    const loginA11yViolations = loginA11y.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (loginA11yViolations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${loginA11yViolations.length} serious/critical violation(s): ` +
          loginA11yViolations.map(v => v.id).join(', '),
      });
    }

    await loginPage.username.fill('john');
    await loginPage.password.fill('demo');
    await loginPage.logIn.click();

    // Confirm authenticated state before exercising the logout action.
    await expect(overviewPage.logOut).toBeVisible();
    await expect(page.getByText('Welcome John Smith')).toBeVisible();

    // --- When: the client executes logout ---
    await overviewPage.logOut.click();

    // --- Then: session is terminated and the access screen is shown ---

    // URL returns to the login page; query string ?ConnType=JDBC may be appended — match by pattern.
    await expect(page).toHaveURL(/\/parabank\/index\.htm/);

    // Axe-core check on the post-logout screen.
    const logoutA11y = await new AxeBuilder({ page }).analyze();
    const logoutA11yViolations = logoutA11y.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (logoutA11yViolations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${logoutA11yViolations.length} serious/critical violation(s): ` +
          logoutA11yViolations.map(v => v.id).join(', '),
      });
    }

    // Customer Login form must reappear.
    await expect(page.getByRole('heading', { name: 'Customer Login' })).toBeVisible();
    await expect(loginPage.username).toBeVisible();
    await expect(loginPage.password).toBeVisible();

    // Authenticated sidebar must be gone — 'Log Out' link is the sentinel for the auth sidebar.
    await expect(overviewPage.logOut).not.toBeVisible();
    // 'Welcome John Smith' paragraph must not be present.
    await expect(page.getByText('Welcome John Smith')).not.toBeVisible();
  });
});
