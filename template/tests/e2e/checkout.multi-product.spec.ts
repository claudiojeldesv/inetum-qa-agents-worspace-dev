/**
 * @criterion checkout.multi-product-happy-path (tests/saucedemo.plan.md §2.2)
 *   Login → add Sauce Labs Backpack $29.99 + Sauce Labs Bike Light $9.99 → cart →
 *   checkout step one → continue → step two: item total $39.98, tax $3.20, total $43.18 →
 *   finish → checkout-complete with "Thank you for your order!"
 * @writer-iterations 1
 * @reviewer-verdict approved
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { LoginPage } from '../pages/login.page';
import { InventoryPage } from '../pages/inventory.page';
import { CartPage } from '../pages/cart.page';
import { CheckoutStepOnePage } from '../pages/checkout-step-one.page';
import { CheckoutStepTwoPage } from '../pages/checkout-step-two.page';
import { CheckoutCompletePage } from '../pages/checkout-complete.page';

test.describe('Feature: Checkout', () => {
  test('Scenario: multi-product happy path completes with correct totals and confirmation', async ({ page }) => {
    // ── Arrange: navigate to app root and run axe baseline ──────────────────
    const loginPage = new LoginPage(page);
    await loginPage.goto();
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

    // ── Step 1: Login ────────────────────────────────────────────────────────
    await loginPage.login('standard_user', 'secret_sauce');
    await expect(page).toHaveURL(/\/inventory\.html/);

    // ── Step 2: Add Sauce Labs Backpack to cart ──────────────────────────────
    const inventoryPage = new InventoryPage(page);
    await inventoryPage.addBackpackToCart();
    // Remove button accessible name is "Remove", data-test is the reliable discriminator.
    await expect(page.getByTestId('remove-sauce-labs-backpack')).toBeVisible();
    await expect(page.getByTestId('shopping-cart-badge')).toHaveText('1');

    // ── Step 3: Add Sauce Labs Bike Light to cart ────────────────────────────
    await inventoryPage.addBikeLightToCart();
    await expect(page.getByTestId('remove-sauce-labs-bike-light')).toBeVisible();
    await expect(page.getByTestId('shopping-cart-badge')).toHaveText('2');

    // ── Step 4: Navigate to cart ─────────────────────────────────────────────
    await inventoryPage.openCart();
    await expect(page).toHaveURL(/\/cart\.html/);
    await expect(page.getByTestId('title')).toHaveText('Your Cart');
    await expect(page.getByText('Sauce Labs Backpack')).toBeVisible();
    await expect(page.getByText('Sauce Labs Bike Light')).toBeVisible();
    await expect(page.getByText('$29.99')).toBeVisible();
    await expect(page.getByText('$9.99')).toBeVisible();

    // ── Step 5: Proceed to checkout step one ─────────────────────────────────
    const cartPage = new CartPage(page);
    await cartPage.proceedToCheckout();
    await expect(page).toHaveURL(/\/checkout-step-one\.html/);
    await expect(page.getByTestId('title')).toHaveText('Checkout: Your Information');

    // ── Step 6: Fill shipping info and continue ───────────────────────────────
    const stepOnePage = new CheckoutStepOnePage(page);
    await stepOnePage.fillShippingInfo('Test', 'User', '12345');
    await stepOnePage.submitShippingInfo();
    await expect(page).toHaveURL(/\/checkout-step-two\.html/);
    await expect(page.getByTestId('title')).toHaveText('Checkout: Overview');

    // Both line items present on overview
    await expect(page.getByText('Sauce Labs Backpack')).toBeVisible();
    await expect(page.getByText('Sauce Labs Bike Light')).toBeVisible();

    // Price summary assertions
    // TODO writer: price summary elements have no test_id in discovery-report — using getByText
    await expect(page.getByText('Item total: $39.98')).toBeVisible();
    await expect(page.getByText('Tax: $3.20')).toBeVisible();
    await expect(page.getByText('Total: $43.18')).toBeVisible();

    // ── Step 7: Finish order ─────────────────────────────────────────────────
    const stepTwoPage = new CheckoutStepTwoPage(page);
    await stepTwoPage.placeOrder();
    await expect(page).toHaveURL(/\/checkout-complete\.html/);

    const completePage = new CheckoutCompletePage(page);
    await expect(completePage.confirmationHeading()).toBeVisible();
    // Cart badge absent — badge element is not rendered when count is 0
    await expect(page.getByTestId('shopping-cart-badge')).not.toBeVisible();
  });
});
