# Toolshop Add-to-Cart Golden Path

## Application Overview

Practice Software Testing - Toolshop (https://practicesoftwaretesting.com/) is an Angular e-commerce demo site selling tools and hardware. This plan covers exactly one scenario: the add-to-cart happy path for a guest user starting from the home product catalog. No authentication, checkout completion, filters, search, pagination, or edge cases are in scope. The site exposes data-test attributes on interactive elements (e.g., data-test="add-to-cart", data-test="nav-cart"), which must be used as locators. Fresh browser state assumed — no cookies, no prior cart contents.

## Test Scenarios

### 1. Add to Cart — Happy Path

**Seed:** ``

#### 1.1. Guest user adds a single product to the cart from the home catalog

**File:** `tests/add-to-cart/add-product-to-cart.spec.ts`

**Steps:**
  1. Navigate to https://practicesoftwaretesting.com/
    - expect: Page title contains 'Practice Software Testing - Toolshop'
    - expect: Product catalog grid is visible with at least one product card
    - expect: The nav cart icon is NOT visible (no items in cart yet — cart menuitem is absent from the nav)
  2. Locate the first product card in the catalog grid. The first product rendered is 'Combination Pliers' at URL /product/01KSYQM9VRT3KSME48W9N7DE9S. Click its card link (the card is a link element; data-test attribute on the link is 'product-<id>', e.g. data-test='product-01KSYQM9VRT3KSME48W9N7DE9S').
    - expect: Browser navigates to the product detail page at /product/01KSYQM9VRT3KSME48W9N7DE9S
    - expect: Page title contains 'Combination Pliers'
    - expect: Product name heading (h1) reads 'Combination Pliers'
    - expect: Product price displays '$14.15'
    - expect: Quantity spinbutton (data-test='quantity') shows value '1'
    - expect: An 'Add to cart' button (data-test='add-to-cart') is present and enabled
    - expect: The nav cart icon is still NOT present in the navigation (no badge)
  3. Click the 'Add to cart' button (data-test='add-to-cart').
    - expect: A success alert/toast with text 'Product added to shopping cart.' appears on the page
    - expect: The cart icon now appears in the navigation menuitem with role 'menuitem' and name 'cart' (data-test='nav-cart')
    - expect: The cart badge (the numeric counter inside the cart nav link, data-test='cart-quantity') displays the value '1'
    - expect: The 'Add to cart' button remains visible and enabled (no disabled state after add)
  4. Click the cart icon in the navigation (data-test='nav-cart', link href='/checkout').
    - expect: Browser navigates to /checkout
    - expect: Page title contains 'Checkout'
    - expect: The cart step indicator shows step 1 'Cart' as active
  5. Inspect the cart table on the /checkout page.
    - expect: The cart table contains exactly one row for the product 'Combination Pliers'
    - expect: The 'Item' cell reads 'Combination Pliers'
    - expect: The 'Quantity' spinbutton (data-test='product-quantity' or aria-label 'Quantity for Combination Pliers') shows value '1'
    - expect: The 'Price' cell reads '$14.15'
    - expect: The 'Total' cell for that row reads '$14.15'
    - expect: The summary row 'Total' at the bottom of the table reads '$14.15'
    - expect: The nav cart badge (data-test='cart-quantity') still displays '1'
