/**
 * @criterion RF-003 (saucedemo.feature:24 (REQ-CHECKOUT))
 * @plan-entry checkout.happy-path (specs/saucedemo-dom-mapping.plan.md §3.1)
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * RF-003 — Compra de un producto hasta la confirmacion del pedido
 *   Given:  el usuario ha iniciado sesion y esta en el listado de productos
 *   When:   el usuario anade un producto al carrito; abre el carrito y continua al checkout;
 *           introduce sus datos de envio y confirma la compra
 *   Then:   el sistema completa el pedido y muestra la confirmacion de pedido realizado
 *
 * Screens traversed: login → inventory → cart → checkout-step-one → checkout-step-two → checkout-complete
 * Synthetic fixtures: standard_user / secret_sauce (style-contract synthetic_fixtures)
 * Auth: inline login in beforeEach (no storageState — style-contract has no auth field)
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { LoginPage } from '../pages/login.page';
import { InventoryPage } from '../pages/inventory.page';
import { CartPage } from '../pages/cart.page';
import { CheckoutStepOnePage } from '../pages/checkout-step-one.page';
import { CheckoutStepTwoPage } from '../pages/checkout-step-two.page';
import { CheckoutCompletePage } from '../pages/checkout-complete.page';

// Synthetic fixtures from style-contract (synthetic_fixtures.credentials[0])
const USER = 'standard_user';
const PASS = 'secret_sauce';

// Synthetic shipping data — no storageState, no real PII
const SHIPPING = {
  firstName: 'Test',
  lastName:  'User',
  postalCode: '12345',
} as const;

test.describe('Feature: checkout', () => {
  test('Scenario: checkout happy-path — compra de un producto hasta la confirmacion del pedido', async ({ page }) => {

    // ── Step 1: Authenticate inline (no storageState configured in style-contract) ──
    const loginPage = new LoginPage(page);
    await page.goto('https://www.saucedemo.com/');

    // Axe check on the login page (style-contract: inject_axe_check: true, fail_on_violations: false → warning mode)
    const loginAxeResults = await new AxeBuilder({ page }).analyze();
    if (loginAxeResults.violations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `Login page axe violations (${loginAxeResults.violations.length}): ${loginAxeResults.violations.map(v => v.id).join(', ')}`,
      });
    }

    await loginPage.username.fill(USER);
    await loginPage.password.fill(PASS);
    await loginPage.loginButton.click();

    await expect(page).toHaveURL('https://www.saucedemo.com/inventory.html');

    // ── Step 2: Add Sauce Labs Backpack to cart ──
    const inventoryPage = new InventoryPage(page);

    // Axe check on inventory page
    const inventoryAxeResults = await new AxeBuilder({ page }).analyze();
    if (inventoryAxeResults.violations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `Inventory page axe violations (${inventoryAxeResults.violations.length}): ${inventoryAxeResults.violations.map(v => v.id).join(', ')}`,
      });
    }

    await expect(inventoryPage.title).toContainText('Products');
    await expect(inventoryPage.inventoryList).toBeVisible();

    await inventoryPage.addToCartSauceLabsBackpack.click();

    // shopping-cart-badge and remove button are not in discovery-report.json — using plan-entry DOM mapping
    // TODO writer: locator missing from discovery — shopping-cart-badge
    const cartBadge = page.getByTestId('shopping-cart-badge');
    await expect(cartBadge).toHaveText('1');

    // TODO writer: locator missing from discovery — remove-sauce-labs-backpack
    const removeBackpackButton = page.getByTestId('remove-sauce-labs-backpack');
    await expect(removeBackpackButton).toBeVisible();

    // ── Step 3: Navigate to cart ──
    await inventoryPage.shoppingCartLink.click();
    await expect(page).toHaveURL('https://www.saucedemo.com/cart.html');

    const cartPage = new CartPage(page);

    // Axe check on cart page
    const cartAxeResults = await new AxeBuilder({ page }).analyze();
    if (cartAxeResults.violations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `Cart page axe violations (${cartAxeResults.violations.length}): ${cartAxeResults.violations.map(v => v.id).join(', ')}`,
      });
    }

    await expect(cartPage.title).toContainText('Your Cart');
    await expect(cartPage.cartList).toBeVisible();
    // Verify Sauce Labs Backpack is the item in the cart
    await expect(cartPage.cartList).toContainText('Sauce Labs Backpack');
    await expect(cartPage.checkout).toBeVisible();
    await expect(cartPage.continueShopping).toBeVisible();

    // ── Step 4: Proceed to checkout step one ──
    await cartPage.checkout.click();
    await expect(page).toHaveURL('https://www.saucedemo.com/checkout-step-one.html');

    const stepOnePage = new CheckoutStepOnePage(page);

    // Axe check on checkout step one
    const stepOneAxeResults = await new AxeBuilder({ page }).analyze();
    if (stepOneAxeResults.violations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `Checkout step-one axe violations (${stepOneAxeResults.violations.length}): ${stepOneAxeResults.violations.map(v => v.id).join(', ')}`,
      });
    }

    await expect(stepOnePage.title).toContainText('Checkout: Your Information');
    await expect(stepOnePage.firstname).toBeVisible();
    await expect(stepOnePage.lastname).toBeVisible();
    await expect(stepOnePage.postalcode).toBeVisible();
    await expect(stepOnePage.continue).toBeVisible();
    await expect(stepOnePage.cancel).toBeVisible();

    // ── Step 5: Fill shipping information and continue ──
    await stepOnePage.firstname.fill(SHIPPING.firstName);
    await stepOnePage.lastname.fill(SHIPPING.lastName);
    await stepOnePage.postalcode.fill(SHIPPING.postalCode);
    await stepOnePage.continue.click();

    await expect(page).toHaveURL('https://www.saucedemo.com/checkout-step-two.html');

    const stepTwoPage = new CheckoutStepTwoPage(page);

    // Axe check on checkout step two
    const stepTwoAxeResults = await new AxeBuilder({ page }).analyze();
    if (stepTwoAxeResults.violations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `Checkout step-two axe violations (${stepTwoAxeResults.violations.length}): ${stepTwoAxeResults.violations.map(v => v.id).join(', ')}`,
      });
    }

    await expect(stepTwoPage.title).toContainText('Checkout: Overview');
    // Verify item, pricing, and totals
    await expect(stepTwoPage.subtotalLabel).toContainText('Item total: $29.99');
    await expect(stepTwoPage.taxLabel).toContainText('Tax: $2.40');
    await expect(stepTwoPage.totalLabel).toContainText('Total: $32.39');
    await expect(stepTwoPage.finish).toBeVisible();
    await expect(stepTwoPage.cancel).toBeVisible();

    // ── Step 6: Confirm order ──
    await stepTwoPage.finish.click();
    await expect(page).toHaveURL('https://www.saucedemo.com/checkout-complete.html');

    const completePage = new CheckoutCompletePage(page);

    // Axe check on confirmation page
    const completeAxeResults = await new AxeBuilder({ page }).analyze();
    if (completeAxeResults.violations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `Checkout complete axe violations (${completeAxeResults.violations.length}): ${completeAxeResults.violations.map(v => v.id).join(', ')}`,
      });
    }

    await expect(completePage.title).toContainText('Checkout: Complete!');
    await expect(completePage.completeHeader).toContainText('Thank you for your order!');
    await expect(completePage.completeText).toContainText('Your order has been dispatched, and will arrive just as fast as the pony can get there!');
    await expect(completePage.ponyExpress).toBeVisible();
    await expect(completePage.backToProducts).toBeVisible();
    // Cart badge must be absent after order completion
    await expect(page.getByTestId('shopping-cart-badge')).toHaveCount(0);

    // Screenshot evidence (style-contract: evidence.screenshots: on)
    await page.screenshot({ path: 'test-results/checkout-happy-path-complete.png' });
  });
});
