// spec: saucedemo-slice65-plan.md

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';
import { InventoryPage } from '../pages/inventory.page';

test.describe('Feature: Shopping cart (golden path)', () => {
  /**
   * @criterion saucedemo-slice65-plan.md#1.2
   */
  test('Adding backpack shows cart badge count 1', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const inventoryPage = new InventoryPage(page);

    // 1. Navigate to https://www.saucedemo.com/
    await loginPage.goto();

    // Accessibility check after FIRST navigation (login page) — per ia4d-a11y-injector contract.
    // Runtime finding: /inventory.html has a critical `select-name` violation (sort dropdown).
    // The check stays on the clean login page where the spec begins; the inventory violation is
    // tracked as a known SauceDemo issue, not a regression in the test.
    const a11yResults = await new AxeBuilder({ page }).analyze();
    expect(a11yResults.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);

    // Log in as standard_user
    await loginPage.loginAs('standard_user', 'secret_sauce');
    await expect(page).toHaveURL(/\/inventory\.html$/);

    // 2. Locate the 'Sauce Labs Backpack' product card and click its 'Add to cart' button
    await inventoryPage.addBackpackToCart();

    // expect: The button label changes to 'Remove'
    await expect(page.getByTestId('remove-sauce-labs-backpack')).toBeVisible();

    // expect: A cart badge appears in the top-right navigation area showing the number '1'
    await expect(inventoryPage.shoppingCartBadge).toHaveText('1');
  });
});
