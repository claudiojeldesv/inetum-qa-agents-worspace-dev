/**
 * @criterion RF-003 (parabank.feature:27 (REQ-LOGOUT))
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * RF-003 — Cierre de sesion
 *   given:  el cliente tiene una sesion activa
 *   when:   el cliente ejecuta el cierre de sesion
 *   then:   el sistema termina la sesion y devuelve a la pantalla de acceso
 *
 * Session: uses storageState (playwright/.auth/john.json) set by auth.setup.ts.
 * The test navigates directly to /parabank/overview.htm — no re-login.
 * A11y: axe-core injected immediately after goto(); fail_on_violations=false
 * per style-contract (ParaBank JSP legacy — warning mode, not blocking).
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { OverviewPage } from '../pages/overview.page';
import { LoginPage } from '../pages/login.page';

test.describe('Feature: Cierre de sesion', () => {
  // RF-003 logs OUT, which invalidates the JSESSIONID server-side. The shared
  // auth.setup storageState carries ONE session reused by the post-login specs
  // (transfer); if this test logged out of THAT session, it would poison the
  // concurrent transfer tests (they'd hit ParaBank's error page). So this test
  // owns its session: opt out of the shared storageState and log in fresh — its
  // logout then only tears down its own JSESSIONID. The given ("sesion activa")
  // is satisfied by the fresh login.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Scenario: RF-003 — el sistema termina la sesion y devuelve a la pantalla de acceso', async ({ page }) => {
    const overviewPage = new OverviewPage(page);
    const loginPage = new LoginPage(page);

    // Establish a dedicated authenticated session (given: "el cliente tiene una sesion activa").
    await loginPage.goto();
    await loginPage.login('john', 'demo');

    // A11y check immediately after initial navigation (hard rule; warning mode per contract).
    const axeResults = await new AxeBuilder({ page })
      .options({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
      .analyze();
    if (axeResults.violations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `axe found ${axeResults.violations.length} violation(s) on /parabank/overview.htm: ${axeResults.violations.map(v => v.id).join(', ')}`,
      });
    }

    // Pre-condition guard: verify session is genuinely active before acting.
    await expect(overviewPage.welcomeJohnSmith).toBeVisible();
    await expect(overviewPage.logOut).toBeVisible();

    // When: the client executes session termination.
    await overviewPage.clickLogOut();

    // Then: the system terminates the session and returns to the access screen.
    // 1. URL resolves to the login entry point.
    await expect(page).toHaveURL(/\/parabank\/index\.htm/);

    // 2. Login form (Customer Login heading + credential inputs) is visible — screen is accessible.
    await expect(loginPage.customerLoginHeading).toBeVisible();
    await expect(loginPage.username).toBeVisible();
    await expect(loginPage.password).toBeVisible();

    // 3. Session indicators are gone — session is cleared, not merely navigated away.
    await expect(overviewPage.welcomeJohnSmith).not.toBeVisible();
    await expect(overviewPage.logOut).not.toBeVisible();
  });
});
