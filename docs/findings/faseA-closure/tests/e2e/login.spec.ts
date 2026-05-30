/**
 * @criterion saucedemo-plan.md § 1.1 — Successful login with standard_user redirects to inventory
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Scenario: authentication.login-success
 * Golden path: standard_user / secret_sauce → /inventory.html with six product cards visible.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';

test.describe('Feature: Authentication', () => {
  test('Scenario: Successful login with standard_user redirects to inventory', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Step 1: Navigate to login page
    await loginPage.goto();

    // Accessibility check immediately after page load — before any interaction
    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const criticalViolations = axeResults.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(criticalViolations, `Axe a11y violations: ${JSON.stringify(criticalViolations, null, 2)}`).toHaveLength(0);

    // Assert login page is displayed with the expected fields
    await expect(loginPage.userName).toBeVisible();
    await expect(loginPage.password).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();

    // Step 2: Enter credentials — standard_user / secret_sauce (synthetic fixture from Style Contract)
    await loginPage.userName.fill('standard_user');
    await loginPage.password.fill('secret_sauce');

    // Step 3: Click Login
    await loginPage.loginButton.click();

    // Assert 1: URL changed to /inventory.html
    await expect(page).toHaveURL('https://www.saucedemo.com/inventory.html');

    // Assert 2: Products page header is visible
    // "Products" renders as <span data-test="title">, no heading role in DOM
    await expect(page.getByTestId('title')).toHaveText('Products');

    // Assert 3: Six product cards are displayed
    await expect(page.getByTestId('inventory-item')).toHaveCount(6);
  });
});
