// spec: saucedemo-spike-plan.md
// seed: none (self-contained)

import { test, expect } from '@playwright/test';

test.describe('Checkout Flow', () => {
  test('Complete full checkout golden path', async ({ page }) => {
    // 1. Navigate to https://www.saucedemo.com/ and log in with standard_user / secret_sauce,
    //    add 'Sauce Labs Backpack' to cart, then navigate to /cart.html and click 'Checkout'
    await page.goto('https://www.saucedemo.com/');
    await page.locator('[data-test="username"]').fill('standard_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('[data-test="login-button"]').click();

    await expect(page).toHaveURL('https://www.saucedemo.com/inventory.html');
    await expect(page.locator('[data-test="add-to-cart-sauce-labs-backpack"]')).toBeVisible();

    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
    await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('1');

    await page.goto('https://www.saucedemo.com/cart.html');
    await expect(page.locator('[data-test="inventory-item-name"]')).toHaveText('Sauce Labs Backpack');
    await expect(page.locator('[data-test="inventory-item-price"]')).toHaveText('$29.99');

    await page.locator('[data-test="checkout"]').click();

    // expect: navigated to /checkout-step-one.html
    await expect(page).toHaveURL('https://www.saucedemo.com/checkout-step-one.html');
    // expect: page heading reads 'Checkout: Your Information'
    await expect(page.getByText('Checkout: Your Information')).toBeVisible();
    // expect: First Name, Last Name, and Zip/Postal Code fields are present
    await expect(page.locator('[data-test="firstName"]')).toBeVisible();
    await expect(page.locator('[data-test="lastName"]')).toBeVisible();
    await expect(page.locator('[data-test="postalCode"]')).toBeVisible();
    // expect: Cancel and Continue buttons are visible
    await expect(page.locator('[data-test="cancel"]')).toBeVisible();
    await expect(page.locator('[data-test="continue"]')).toBeVisible();

    // 2. Fill in First Name: 'John', Last Name: 'Doe', Zip/Postal Code: '12345', then click 'Continue'
    await page.locator('[data-test="firstName"]').fill('John');
    await page.locator('[data-test="lastName"]').fill('Doe');
    await page.locator('[data-test="postalCode"]').fill('12345');
    await page.locator('[data-test="continue"]').click();

    // expect: navigated to /checkout-step-two.html
    await expect(page).toHaveURL('https://www.saucedemo.com/checkout-step-two.html');
    // expect: page heading reads 'Checkout: Overview'
    await expect(page.getByText('Checkout: Overview')).toBeVisible();
    // expect: order summary lists 'Sauce Labs Backpack' with quantity 1 and price $29.99
    await expect(page.locator('[data-test="inventory-item-name"]')).toHaveText('Sauce Labs Backpack');
    await expect(page.locator('[data-test="inventory-item-price"]')).toHaveText('$29.99');
    // expect: Payment Information shows 'SauceCard #31337'
    await expect(page.getByText('SauceCard #31337')).toBeVisible();
    // expect: Shipping Information shows 'Free Pony Express Delivery!'
    await expect(page.getByText('Free Pony Express Delivery!')).toBeVisible();
    // expect: item total, tax, and grand total
    await expect(page.getByText('Item total: $29.99')).toBeVisible();
    await expect(page.getByText('Tax: $2.40')).toBeVisible();
    await expect(page.getByText('Total: $32.39')).toBeVisible();
    // expect: Cancel and Finish buttons are visible
    await expect(page.locator('[data-test="cancel"]')).toBeVisible();
    await expect(page.locator('[data-test="finish"]')).toBeVisible();

    // 3. Click the 'Finish' button
    await page.locator('[data-test="finish"]').click();

    // expect: navigated to /checkout-complete.html
    await expect(page).toHaveURL('https://www.saucedemo.com/checkout-complete.html');
    // expect: page heading reads 'Checkout: Complete!'
    await expect(page.getByText('Checkout: Complete!')).toBeVisible();
    // expect: h2 heading reads 'Thank you for your order!'
    await expect(page.locator('h2')).toHaveText('Thank you for your order!');
    // expect: Back Home button is visible
    await expect(page.locator('[data-test="back-to-products"]')).toBeVisible();
    // expect: cart badge is gone (0 items)
    await expect(page.locator('[data-test="shopping-cart-badge"]')).not.toBeVisible();

    // 4. Click the 'Back Home' button
    await page.locator('[data-test="back-to-products"]').click();

    // expect: navigated to /inventory.html with empty cart
    await expect(page).toHaveURL('https://www.saucedemo.com/inventory.html');
    await expect(page.getByText('Products')).toBeVisible();
    await expect(page.locator('[data-test="shopping-cart-badge"]')).not.toBeVisible();
  });
});
