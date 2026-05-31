/**
 * @criterion parabank-plan.md § 1.1
 *   Login happy path — valid credentials log in and land on Accounts Overview
 * @style-contract style-contracts/parabank.yaml
 * @discovery-source discovery-report.json
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * AUTH-HANDLER NOTE (storageState plumbing):
 *   After a successful login this spec saves browser storageState to
 *   playwright/.auth/john.json via page.context().storageState().
 *   To wire the transfer-funds suite to reuse this state, add a setup project in
 *   playwright.config.ts:
 *
 *     { name: 'setup', testMatch: /.*login\.spec\.ts/, use: {} },
 *     { name: 'chromium-authenticated',
 *       use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/john.json' },
 *       dependencies: ['setup'] }
 *
 *   The Writer does NOT modify playwright.config.ts per SPEC restriction.
 *   The orchestrator decides this plumbing.
 *
 * A11Y NOTE:
 *   axe-core check is injected (hard rule). fail_on_violations=false per style-contract
 *   (ParaBank JSP legacy has known violations — captured as warning, not blocker).
 */

import * as path from 'path';
import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';
import { OverviewPage } from '../pages/overview.page';

const AUTH_FILE = path.join(process.cwd(), 'playwright', '.auth', 'john.json');

test.describe('Feature: Login', () => {
  test('Scenario: valid credentials log in and land on Accounts Overview', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const overviewPage = new OverviewPage(page);

    // Step 1: Navigate to login page
    await loginPage.goto();

    // A11y check immediately after goto — per SPEC hard rule.
    // fail_on_violations=false (style-contract): capture as warning, do not abort.
    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    if (axeResults.violations.length > 0) {
      const criticalOrSerious = axeResults.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious',
      );
      console.warn(
        `[A11Y WARNING] ParaBank login.htm: ${axeResults.violations.length} violation(s) ` +
          `(${criticalOrSerious.length} critical/serious). ` +
          `This is expected for legacy JSP — audit data captured, test continues.`,
      );
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

    // Step 7: Accounts Overview table — account numbers present, no balance assertion
    // (shared demo environment; balance changes across runs per plan § 1.1 step 7)
    await expect(overviewPage.accountsTable).toBeVisible();
    await expect(page.getByText('13344')).toBeVisible();
    await expect(page.getByText('15564')).toBeVisible();

    // Step 8: AUTH-HANDLER — save storageState for reuse by transfer-funds suite
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    await page.context().storageState({ path: AUTH_FILE });

    // Verify auth file was written and is non-empty
    const stat = fs.statSync(AUTH_FILE);
    expect(stat.size).toBeGreaterThan(0);
  });
});
