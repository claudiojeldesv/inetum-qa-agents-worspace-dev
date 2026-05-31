/**
 * @criterion login.successful-login-with-valid-credentials-redirects-to-secure-area
 * @plan-entry expandtesting-login-plan.md
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Scenario: Successful login with valid credentials redirects to secure area.
 * Steps:
 *   1. Navigate to /login
 *   2. Axe accessibility check (WCAG 2.1 AA)
 *   3. Fill username "practice" and password "SuperSecretPassword!"
 *   4. Click Login button
 *   5. Assert URL is /secure
 *   6. Assert flash message contains "You logged into a secure area!"
 *   7. Assert Logout button is visible
 *
 * Credentials: synthetic_fixtures from style-contracts/expandtesting.yaml
 * Site: https://practice.expandtesting.com
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';
import { SecurePage } from '../pages/secure.page';

const BASE_URL = 'https://practice.expandtesting.com';

test.describe('Feature: Login', () => {
  test('successful login with valid credentials redirects to secure area', async ({ page }) => {
    // Step 1: Navigate to the login page via POM
    const loginPage = new LoginPage(page);
    await page.goto(`${BASE_URL}/login`);

    // Step 2: Axe accessibility check immediately after page load (WCAG 2.1 AA)
    const a11yResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const violations = a11yResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(violations, `Axe violations on /login: ${JSON.stringify(violations, null, 2)}`).toHaveLength(0);

    // Step 3 + 4: Fill credentials and submit via POM action
    await loginPage.loginWith('practice', 'SuperSecretPassword!');

    // Step 5: URL must be /secure
    await expect(page).toHaveURL(`${BASE_URL}/secure`);

    // Step 6: Flash message confirms successful login (semantic content check, not text equality)
    // discovery-report.json marks the flash element as TODO — using getByRole('alert') as the
    // semantic locator. If expandtesting does not assign role=alert, update discovery and this locator.
    const securePage = new SecurePage(page);
    const flashMessage = page.getByRole('alert');
    await expect(flashMessage).toContainText('You logged into a secure area!');

    // Step 7: Logout button visible — confirms authenticated state
    await expect(securePage.logout).toBeVisible();
  });
});
