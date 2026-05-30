/**
 * @criterion saucedemo-plan.md §4.1 "Complete golden-path checkout with a single item"
 * @scenario checkout.golden-path-single-item
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Covers the full happy-path checkout flow:
 *   Login → Add Sauce Labs Backpack → Cart → Checkout step one (fill info) →
 *   Checkout step two (verify totals) → Finish → Confirmation → Back Home.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';
import { InventoryPage } from '../pages/inventory.page';
import { CartPage } from '../pages/cart.page';
import { CheckoutStepOnePage } from '../pages/checkout-step-one.page';
import { CheckoutStepTwoPage } from '../pages/checkout-step-two.page';
import { CheckoutCompletePage } from '../pages/checkout-complete.page';

// Synthetic fixture — declared in style-contracts/saucedemo.yaml > synthetic_fixtures.credentials
const CREDENTIALS = { username: 'standard_user', password: 'secret_sauce' };

test.describe('Feature: Checkout golden path', () => {
  test('Scenario: Complete single-item checkout from login to confirmation', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const inventoryPage = new InventoryPage(page);
    const cartPage = new CartPage(page);
    const checkoutStepOnePage = new CheckoutStepOnePage(page);
    const checkoutStepTwoPage = new CheckoutStepTwoPage(page);
    const checkoutCompletePage = new CheckoutCompletePage(page);

    // Step 1: Navigate to login page and authenticate
    await page.goto('https://www.saucedemo.com/');

    // A11y check — injected immediately after goto per style contract (a11y.inject_axe_check: true)
    const a11yLoginResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(
      a11yLoginResults.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')),
      `Login page: axe-core found ${a11yLoginResults.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).length} serious/critical violation(s)`
    ).toHaveLength(0);

    await expect(loginPage.userName).toBeVisible();
    await expect(loginPage.password).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();

    await loginPage.userName.fill(CREDENTIALS.username);
    await loginPage.password.fill(CREDENTIALS.password);
    await loginPage.loginButton.click();

    // Post-login: assert functional state on inventory page
    await expect(page).toHaveURL('https://www.saucedemo.com/inventory.html');
    await expect(inventoryPage.addToCartSauceLabsBackpack).toBeVisible();

    // Step 2: Add Sauce Labs Backpack to cart from inventory
    await inventoryPage.addToCartSauceLabsBackpack.click();

    // Add-to-cart button toggles to Remove after adding — functional state confirmation
    // (data-test for Remove follows the pattern documented in discovery-report.json cart screen)
    await expect(inventoryPage.addToCartSauceLabsBackpack).not.toBeVisible();
    await expect(page.getByTestId('remove-sauce-labs-backpack')).toBeVisible();
    // TODO writer: locator missing from discovery — cart badge count span (no data-test in discovery-report.json for badge element)

    // Step 3: Navigate to cart and click Checkout
    await inventoryPage.shoppingCartLink.click();
    await expect(page).toHaveURL('https://www.saucedemo.com/cart.html');

    // A11y check on cart page
    const a11yCartResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(
      a11yCartResults.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')),
      `Cart page: axe-core found ${a11yCartResults.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).length} serious/critical violation(s)`
    ).toHaveLength(0);

    await expect(cartPage.checkout).toBeVisible();
    await cartPage.checkout.click();

    // Step 4: Checkout step one — fill required fields
    await expect(page).toHaveURL('https://www.saucedemo.com/checkout-step-one.html');

    // A11y check on step one
    const a11yStepOneResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(
      a11yStepOneResults.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')),
      `Checkout step one: axe-core found ${a11yStepOneResults.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).length} serious/critical violation(s)`
    ).toHaveLength(0);

    await expect(checkoutStepOnePage.firstName).toBeVisible();
    await expect(checkoutStepOnePage.lastName).toBeVisible();
    await expect(checkoutStepOnePage.postalCode).toBeVisible();

    // Synthetic fixture data (no real PII — plan §4.1 specifies 'John', 'Doe', '12345')
    await checkoutStepOnePage.firstName.fill('John');
    await checkoutStepOnePage.lastName.fill('Doe');
    await checkoutStepOnePage.postalCode.fill('12345');
    await checkoutStepOnePage.continue.click();

    // Step 5: Checkout step two — verify order summary and totals
    await expect(page).toHaveURL('https://www.saucedemo.com/checkout-step-two.html');

    // A11y check on step two
    const a11yStepTwoResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(
      a11yStepTwoResults.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')),
      `Checkout step two: axe-core found ${a11yStepTwoResults.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).length} serious/critical violation(s)`
    ).toHaveLength(0);

    // Product line item — Sauce Labs Backpack present in order summary
    await expect(page.getByText('Sauce Labs Backpack')).toBeVisible();

    // Payment and shipping info as specified in plan §4.1
    await expect(page.getByText('SauceCard #31337')).toBeVisible();
    await expect(page.getByText('Free Pony Express Delivery!')).toBeVisible();

    // Totals verification — plan §4.1 specifies exact values
    await expect(page.getByText('Item total: $29.99')).toBeVisible();
    await expect(page.getByText('Tax: $2.40')).toBeVisible();
    await expect(page.getByText('Total: $32.39')).toBeVisible();

    await expect(checkoutStepTwoPage.finish).toBeVisible();
    await expect(checkoutStepTwoPage.cancel).toBeVisible();

    // Step 6: Finish — submit order
    await checkoutStepTwoPage.finish.click();

    // Step 7: Confirmation page assertions
    await expect(page).toHaveURL('https://www.saucedemo.com/checkout-complete.html');

    // A11y check on confirmation page
    const a11yCompleteResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(
      a11yCompleteResults.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')),
      `Checkout complete: axe-core found ${a11yCompleteResults.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).length} serious/critical violation(s)`
    ).toHaveLength(0);

    // Functional state: confirmation messaging
    await expect(page.getByText('Thank you for your order!')).toBeVisible();
    await expect(
      page.getByText('Your order has been dispatched, and will arrive just as fast as the pony can get there!')
    ).toBeVisible();

    // Pony Express image — no data-test in discovery, using getByRole per priority
    await expect(page.getByRole('img', { name: 'Pony Express' })).toBeVisible();

    // Back Home button present; cart is now empty (badge not assertable — no data-test in discovery-report.json)
    await expect(checkoutCompletePage.backToProducts).toBeVisible();
    // TODO writer: locator missing from discovery — cannot assert cart badge absence without badge data-test

    // Step 8: Back Home returns to inventory with empty cart
    await checkoutCompletePage.backToProducts.click();
    await expect(page).toHaveURL('https://www.saucedemo.com/inventory.html');
    await expect(inventoryPage.addToCartSauceLabsBackpack).toBeVisible();
    // Backpack add-to-cart button is visible again (not Remove) — confirms cart was cleared after order
    await expect(page.getByTestId('remove-sauce-labs-backpack')).not.toBeVisible();
  });
});
