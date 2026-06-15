/**
 * @criterion login.invalid-credentials (coverage 1.2, source: discovery-report.json)
 * @writer-iterations 1
 * @reviewer-verdict pass
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';

test.describe('Feature: Login', () => {
  // Negative path — requires a clean, logged-out session regardless of global storageState.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Scenario: invalid credentials show alert and stay on login page', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();

    // A11y check immediately after goto (hard rule — always injected; fail_on_violations=false per contract).
    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    test.info().annotations.push({
      type: 'a11y',
      description: JSON.stringify({
        violations: axeResults.violations.length,
        severities: axeResults.violations.map((v) => v.impact),
      }),
    });
    // Gate is off (fail_on_violations: false) — log as warning, do not throw.
    if (axeResults.violations.length > 0) {
      console.warn(
        `[a11y] ${axeResults.violations.length} violation(s) on login page (not blocking per contract)`
      );
    }

    // Given: login form is visible.
    await expect(loginPage.login2).toBeVisible();
    await expect(loginPage.username).toBeVisible();
    await expect(loginPage.password).toBeVisible();

    // When: submit with invalid credentials.
    await loginPage.doLogin('wronguser', 'wrongpass');

    // Then: URL stays on /auth/login (no redirect to dashboard).
    await expect(page).toHaveURL(/\/auth\/login/);

    // Then: alert with "Invalid credentials" is visible.
    // Text used in the LOCATOR (getByText), not in a text-equality assert — compliant with
    // forbid_text_equality: true. The assert is toBeVisible() which is semantic state.
    await expect(loginPage.invalidCredentialsAlert).toBeVisible();

    // NOTE: OrangeHRM clears the username field after an invalid submit — toHaveValue assertion
    // removed because the app does NOT retain the submitted value (assumption was wrong for this app).
  });
});
