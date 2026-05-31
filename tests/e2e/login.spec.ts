/**
 * @criterion parabank-plan.md § 1.1
 *   Login happy path — valid credentials log in and land on Accounts Overview
 * @style-contract style-contracts/parabank.yaml
 * @discovery-source discovery-report.json
 *
 * AUTH-HANDLER (v0.2 Fase C): session persistence is owned by auth.setup.ts (setup
 * project) wired in playwright.config.ts via QA_STORAGE_STATE + dependencies. This spec
 * runs FRESH — it overrides the project-level storageState with an empty one so it
 * exercises the real login form, and it does NOT save state (auth.setup.ts does that).
 *
 * A11Y: the axe-core scan is injected by ia4d-a11y-injector per the style-contract gate
 * (parabank.yaml a11y.fail_on_violations=false → warning mode, captured as annotation,
 * does not abort the flow).
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';
import { OverviewPage } from '../pages/overview.page';

test.describe('Feature: Login', () => {
  // Fresh context: this test performs a real login; it must NOT inherit the
  // project-level storageState produced by the setup dependency.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Scenario: valid credentials log in and land on Accounts Overview', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const overviewPage = new OverviewPage(page);

    // Step 1: Navigate to login page
    await loginPage.goto();

    // A11y scan (warning mode per style-contract fail_on_violations=false)
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

    // Step 1 assertions: page title + login form visible
    await expect(page).toHaveTitle('ParaBank | Welcome | Online Banking');
    await expect(loginPage.username).toBeVisible();
    await expect(loginPage.password).toBeVisible();
    await expect(loginPage.logIn).toBeVisible();

    // Steps 2–4: Fill credentials and submit
    // Credentials from synthetic_fixtures in style-contract (john/demo — public demo account)
    await loginPage.login('john', 'demo');

    // Step 4 assertions: redirect to overview.htm
    await expect(page).toHaveURL(/\/parabank\/overview\.htm/);
    await expect(page).toHaveTitle('ParaBank | Accounts Overview');

    // Step 5: Authenticated welcome message in sidebar
    await expect(overviewPage.welcomeMessage).toBeVisible();

    // Step 6: Account Services navigation
    await expect(overviewPage.transferFunds).toBeVisible();
    await expect(overviewPage.transferFunds).toHaveAttribute('href', /transfer\.htm/);
    await expect(overviewPage.logOut).toBeVisible();
    await expect(overviewPage.logOut).toHaveAttribute('href', /logout\.htm/);

    // Step 7: Accounts Overview table present — structure only, no balance assertion
    // (shared demo environment; balances change across runs per plan § 1.1 step 7)
    await expect(overviewPage.accountsTable).toBeVisible();
  });
});
