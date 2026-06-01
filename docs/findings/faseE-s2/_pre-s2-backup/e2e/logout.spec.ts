/**
 * @criterion RF-006 (fd-parabank.md:44-47)
 *   Cierre de sesión — El sistema termina la sesión y devuelve al cliente a la pantalla de acceso (login).
 *   given: El cliente tiene una sesión activa
 *   when:  El cliente ejecuta el cierre de sesión
 *   then:  El sistema termina la sesión y devuelve a la pantalla de acceso (login)
 * @style-contract style-contracts/parabank.yaml
 * @discovery-source discovery-report.json
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * AUTH-HANDLER (v0.2 Fase C): logout OWNS an isolated session. It overrides the
 * project-level storageState with an empty one and logs in inline (Arrange) so the
 * session it tears down is its OWN, not the shared playwright/.auth/john.json. This is
 * required correctness, not a workaround: ParaBank sessions are server-side (JSESSIONID).
 * If logout inherited the shared storageState and clicked Log Out, it would invalidate
 * that JSESSIONID server-side and poison transfer-funds.spec (which inherits the same
 * session). Logging in inline gives logout a private session to destroy. The login here
 * is the `given` of RF-006 ("el cliente tiene una sesión activa"), not the assertion target.
 *
 * A11Y: axe-core scan injected after the first goto per style-contract hard rule.
 * fail_on_violations=false → warning mode: serious/critical violations are captured as
 * test.info() annotations and do NOT abort the flow (SDET decision, Fase B).
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { OverviewPage } from '../pages/overview.page';
import { LoginPage } from '../pages/login.page';

test.describe('Feature: Logout', () => {
  // Isolated session: do NOT inherit the shared storageState. Logout destroys the session
  // it owns; sharing would poison sibling specs (server-side JSESSIONID).
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Scenario: logout happy path — session is terminated and user returns to login screen', async ({ page }) => {
    const overviewPage = new OverviewPage(page);
    const loginPage = new LoginPage(page);

    // Step 1 (Arrange — RF-006 given): establish an active session of our own via real login.
    await loginPage.goto();
    await loginPage.login('john', 'demo');
    await expect(page).toHaveURL(/\/parabank\/overview\.htm/);

    // A11y scan immediately after first goto — warning mode per style-contract (fail_on_violations=false).
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    const a11yViolations = accessibilityScanResults.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (a11yViolations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${a11yViolations.length} serious/critical violation(s): ` +
          a11yViolations.map(v => v.id).join(', '),
      });
    }

    // Step 2: Assert authenticated state before acting (pre-condition guard).
    // "Welcome John Smith" visible confirms session is active.
    await expect(overviewPage.welcomeMessage).toBeVisible();
    // "Log Out" link visible confirms Account Services navigation is rendered.
    await expect(overviewPage.logOut).toBeVisible();
    await expect(overviewPage.logOut).toHaveAttribute('href', /logout\.htm/);

    // Step 3: Execute logout — click the "Log Out" link.
    await overviewPage.logOut.click();

    // Step 4: Assert post-logout state (RF-006 then clause).
    // The server clears the session and redirects to the login page.
    // Do NOT assert the ?ConnType=JDBC query string — it is an implementation detail
    // that may or may not be present depending on server config.
    await expect(page).toHaveURL(/\/parabank\/index\.htm/);
    await expect(page).toHaveTitle('ParaBank | Welcome | Online Banking');

    // "Customer Login" heading confirms the user is on the login screen.
    await expect(page.getByRole('heading', { name: 'Customer Login' })).toBeVisible();

    // Login form inputs visible — session-cleared state confirmed.
    await expect(loginPage.username).toBeVisible();
    await expect(loginPage.password).toBeVisible();

    // "Welcome John Smith" must no longer be present — session cleared server-side.
    await expect(overviewPage.welcomeMessage).not.toBeVisible();

    // Account Services navigation links must no longer be present — authenticated nav is gone.
    // Scoped to #leftPanel to avoid strict-mode violation: index.htm footer contains SOAP
    // service links also named "Transfer Funds" (href=services/ParaBank?wsdl etc.) that
    // survive logout. The nav panel itself (#leftPanel) is what vanishes with the session.
    await expect(overviewPage.transferFundsNav).not.toBeVisible();
    await expect(overviewPage.logOutNav).not.toBeVisible();
  });
});
