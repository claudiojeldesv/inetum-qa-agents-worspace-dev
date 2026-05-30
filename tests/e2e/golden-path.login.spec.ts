// spec: saucedemo-slice65-plan.md
// scenario: 1.1 Login as standard_user reaches inventory page

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';

test.describe('Feature: Authentication (golden path)', () => {
  /**
   * Validates the standard_user golden-path login flow.
   * @criterion saucedemo-slice65-plan.md#1.1
   */
  test('Standard user reaches inventory after login', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // 1. Navigate to https://www.saucedemo.com/
    await loginPage.goto();

    // 2. Run axe accessibility check — no serious/critical violations
    const a11yResults = await new AxeBuilder({ page }).analyze();
    expect(a11yResults.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);

    // 3. Fill the Username field with 'standard_user'
    await loginPage.username.fill('standard_user');
    await expect(loginPage.username).toHaveValue('standard_user');

    // 4. Fill the Password field with 'secret_sauce'
    await loginPage.password.fill('secret_sauce');
    await expect(loginPage.password).toHaveValue('secret_sauce');

    // 5. Click the Login button
    await loginPage.loginButton.click();

    // 6. Expect navigation to /inventory.html
    await expect(page).toHaveURL(/.*\/inventory\.html/);

    // 7. Expect heading 'Products' to be visible
    // style-enforcer applied: rewrote `page.locator('[data-test="title"]')` to getByTestId
    await expect(page.getByTestId('title')).toBeVisible();

    // 8. Expect product cards list is visible
    // style-enforcer applied: rewrote `page.locator('[data-test="item-4-img-link"]')` to getByTestId
    await expect(page.getByTestId('item-4-img-link')).toBeVisible();
  });
});
