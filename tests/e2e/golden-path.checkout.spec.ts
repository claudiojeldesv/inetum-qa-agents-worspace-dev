// spec: saucedemo-slice65-plan.md
// scenario: 1.3 Complete checkout from cart to confirmation page

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';
import { InventoryPage } from '../pages/inventory.page';
import { CartPage } from '../pages/cart.page';
import { CheckoutStepOnePage } from '../pages/checkout-step-one.page';
import { CheckoutStepTwoPage } from '../pages/checkout-step-two.page';
import { CheckoutCompletePage } from '../pages/checkout-complete.page';

test.describe('Feature: Checkout (golden path)', () => {
  /**
   * Golden path checkout test for standard_user on SauceDemo.
   * Covers the full cart-to-confirmation flow in a single scenario.
   * @criterion saucedemo-slice65-plan.md#1.3
   */
  test('Standard user completes checkout golden path', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const inventoryPage = new InventoryPage(page);
    const cartPage = new CartPage(page);
    const checkoutStepOne = new CheckoutStepOnePage(page);
    const checkoutStepTwo = new CheckoutStepTwoPage(page);
    const checkoutComplete = new CheckoutCompletePage(page);

    // 1. Navigate to SauceDemo
    await loginPage.goto();

    // Axe a11y check after FIRST navigation (login page) — per ia4d-a11y-injector contract.
    // Runtime finding: /inventory.html has a critical `select-name` violation (sort dropdown).
    // The check stays on the clean login page where the spec begins.
    const a11yResults = await new AxeBuilder({ page }).analyze();
    expect(a11yResults.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);

    // Log in as standard_user
    await loginPage.loginAs('standard_user', 'secret_sauce');
    await expect(page).toHaveURL(/inventory\.html/);

    // 2. Add Sauce Labs Backpack to cart — expect badge shows '1'
    await inventoryPage.addBackpackToCart();
    await expect(inventoryPage.shoppingCartBadge).toHaveText('1');

    // 3. Click the cart icon — expect navigation to /cart.html
    await inventoryPage.openCart();
    await expect(page).toHaveURL(/cart\.html/);

    // 4. Click the Checkout button — expect navigation to /checkout-step-one.html
    await cartPage.proceedToCheckout();
    await expect(page).toHaveURL(/checkout-step-one\.html/);

    // 5. Fill customer info and click Continue — expect navigation to /checkout-step-two.html
    await checkoutStepOne.fillCustomerInfo('Claudia', 'Test', '12345');
    await expect(page).toHaveURL(/checkout-step-two\.html/);

    // 6. Click Finish button to complete the order
    await checkoutStepTwo.finishOrder();

    // 7. Verify URL is /checkout-complete.html and Thank you heading is visible
    await expect(page).toHaveURL(/checkout-complete\.html/);
    await expect(checkoutComplete.thankYouHeading).toBeVisible();
  });
});
