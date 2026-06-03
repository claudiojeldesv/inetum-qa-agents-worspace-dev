/**
 * @criterion checkout.single-product-happy-path — login → add Sauce Labs Backpack ($29.99)
 *   → cart → checkout step one (First/Last/Zip) → continue → step two verifies item total
 *   $29.99, tax $2.40, total $32.39 → finish → checkout-complete heading
 *   "Thank you for your order!" and cart empty.
 * @writer-iterations 1
 * @reviewer-verdict pass
 */

import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { CartPage } from '../pages/cart.page';
import { CheckoutCompletePage } from '../pages/checkout-complete.page';
import { CheckoutStepOnePage } from '../pages/checkout-step-one.page';
import { CheckoutStepTwoPage } from '../pages/checkout-step-two.page';
import { InventoryPage } from '../pages/inventory.page';
import { LoginPage } from '../pages/login.page';

test.describe('Feature: Checkout', () => {
  test('Scenario: single product happy path', async ({ page }) => {
    // ── Step 1: navigate to login and run a11y scan ──────────────────────────
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

    // ── Step 2: login ────────────────────────────────────────────────────────
    // Credentials declared in style-contract synthetic_fixtures — not real PII
    await loginPage.login('standard_user', 'secret_sauce');
    await expect(page).toHaveURL(/inventory\.html/);

    // ── Step 3: add Sauce Labs Backpack to cart ──────────────────────────────
    const inventoryPage = new InventoryPage(page);

    await inventoryPage.addBackpackToCart();
    // The cart badge is a <span data-test="shopping-cart-badge">, not a link with accessible name.
    await expect(page.getByTestId('shopping-cart-badge')).toBeVisible();

    // ── Step 4: navigate to cart ─────────────────────────────────────────────
    await inventoryPage.openCart();
    await expect(page).toHaveURL(/cart\.html/);

    const cartPage = new CartPage(page);

    // Verify the Backpack is in the cart
    await expect(page.getByText('Sauce Labs Backpack')).toBeVisible();

    // ── Step 5: checkout step one — shipping info ────────────────────────────
    await cartPage.proceedToCheckout();
    await expect(page).toHaveURL(/checkout-step-one\.html/);

    const stepOnePage = new CheckoutStepOnePage(page);

    await stepOnePage.fillShippingInfo('Jane', 'Doe', '10001');
    await stepOnePage.submitShippingInfo();
    await expect(page).toHaveURL(/checkout-step-two\.html/);

    // ── Step 6: checkout step two — verify order summary ────────────────────
    const stepTwoPage = new CheckoutStepTwoPage(page);

    // Summary labels have no data-test in discovery-report; getByText is next priority per style-contract
    await expect(page.getByText('Item total: $29.99')).toBeVisible();
    await expect(page.getByText('Tax: $2.40')).toBeVisible();
    await expect(page.getByText('Total: $32.39')).toBeVisible();

    // ── Step 7: finish order ─────────────────────────────────────────────────
    await stepTwoPage.placeOrder();
    await expect(page).toHaveURL(/checkout-complete\.html/);

    // ── Step 8: verify confirmation screen ──────────────────────────────────
    const completePage = new CheckoutCompletePage(page);

    await expect(completePage.confirmationHeading()).toBeVisible();

    // Verify cart badge is absent after order completion (badge only renders when count > 0)
    await expect(page.getByTestId('shopping-cart-badge')).not.toBeVisible();
  });
});
