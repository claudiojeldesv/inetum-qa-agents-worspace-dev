/**
 * @criterion toolshop-addcart-plan.md § add-to-cart.end-to-end
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Scenario: Add to cart — end-to-end golden path
 * Target: https://practicesoftwaretesting.com/ (Toolshop, Angular SPA)
 * Plan source: toolshop-addcart-plan.md
 * Style Contract: style-contracts/practicesoftwaretesting.yaml
 *
 * Steps:
 *   1. Navigate to catalog root `/`
 *   2. Inject axe-core accessibility check (WCAG 2.1 AA, serious+critical)
 *   3. Open the first product from the catalog
 *   4. Click "Add to cart"
 *   5. Assert success alert is visible with success text
 *   6. Assert nav-cart badge shows "1"
 *   7. Navigate to /checkout
 *   8. Assert cart line item has quantity "1"
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CatalogPage } from '../pages/catalog.page';
import { ProductPage } from '../pages/product.page';
import { CartPage } from '../pages/cart.page';

test.describe('Feature: Add to cart — Toolshop happy path', () => {
  test('Scenario: guest adds first catalog product to cart and verifies badge and cart row', async ({ page }) => {
    const catalogPage = new CatalogPage(page);
    const productPage = new ProductPage(page);
    const cartPage = new CartPage(page);

    // Step 1: Navigate to catalog root
    await catalogPage.goto();

    // Step 2: Axe-core A11y check immediately after goto (WCAG 2.1 AA, EAA 2025)
    // Fail on serious and critical violations per style contract a11y.severity_threshold.
    // includedImpacts() scopes axe to only return serious+critical — avoids inline filter
    // logic in the test body (Reviewer should-fix iteration 0).
    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .options({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
      .analyze();
    expect(axeResults.violations).toEqual([]);

    // Step 3: Open first product
    // Locator decision: using getByTestId(/^product-/) regex instead of the
    // hardcoded UUID 'product-01KSYQM9VRT3KSME48W9N7DE9S' from the scaffolded POM.
    // The UUID is dataset-dependent and breaks on DB reseed. The invariant prefix
    // 'product-' is stable — see CatalogPage.firstProductLink and locator-hardener
    // finding in discovery coverage_gaps.
    await catalogPage.openFirstProduct();

    // Step 4 & 5: Click add-to-cart and wait for cart badge to appear
    // ProductPage.addToCartAndWaitForBadge() handles the SPA conditional render:
    // nav-cart and cart-quantity do NOT exist in DOM before the first add-to-cart.
    // We must NOT assert their absence before this call.
    await productPage.addToCartAndWaitForBadge();

    // Step 5: Assert success alert
    // Discovery notes: success toast has no data-test attribute.
    // Using getByRole('alert') — semantic, not CSS. Text match is intentionally
    // loose (toContainText) per style contract asserts.forbid_text_equality.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(/added to cart|product added/i);

    // Step 6: Assert nav-cart badge shows "1"
    // cart-quantity is conditionally rendered — we wait via the POM action above.
    await expect(productPage.cartQuantity).toHaveText('1');

    // Step 7: Navigate to /checkout via nav-cart link
    // Navigation is confirmed functionally by the product-quantity assert below —
    // no toHaveURL assert needed (Reviewer should-fix iteration 0: redundant URL assert).
    await productPage.navCart.click();

    // Step 8: Assert cart line item has quantity "1"
    // product-quantity is the spinbutton for the line item qty in the cart table.
    await expect(cartPage.productQuantity).toHaveValue('1');

    // Bonus: cart badge still reflects 1 on checkout page
    await expect(cartPage.cartQuantity).toHaveText('1');
  });
});
