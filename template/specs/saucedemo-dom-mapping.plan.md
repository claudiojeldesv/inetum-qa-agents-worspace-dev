# SauceDemo DOM Mapping — login, login-locked, checkout

## Application Overview

SauceDemo (https://www.saucedemo.com/) is a demo e-commerce application used for Playwright test practice. It exposes a login wall at / and, after authentication, an inventory page, cart, and a three-step checkout flow (shipping info → order overview → confirmation). All elements carry data-test attributes, making locator strategy straightforward. Three flows are mapped here against the real DOM: login happy-path (standard_user), login error path for a locked account (locked_out_user), and a full checkout happy-path starting from an authenticated session. All three flows exist in the DOM and are fully mappable — no NOT MAPPED entries.

## Test Scenarios

### 1. login

**Seed:** ``

#### 1.1. login.happy-path

**File:** `tests/e2e/login.happy-path.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/ — the login page (screen: Login). Verify the page title is 'Swag Labs' and the URL is https://www.saucedemo.com/.
    - expect: Page URL is https://www.saucedemo.com/
    - expect: Username textbox is visible (data-test='username', id='user-name')
    - expect: Password textbox is visible (data-test='password', id='password')
    - expect: Login button is visible (data-test='login-button', type='submit')
  2. Fill the Username field (data-test='username') with the value 'standard_user'.
    - expect: Username field contains 'standard_user'
  3. Fill the Password field (data-test='password') with the value 'secret_sauce'.
    - expect: Password field contains the entered value
  4. Click the Login button (data-test='login-button').
    - expect: Browser navigates to https://www.saucedemo.com/inventory.html
    - expect: Page title element (data-test='title') contains text 'Products'
    - expect: Inventory list (data-test='inventory-list') is visible and contains at least one product item
    - expect: Shopping cart link (data-test='shopping-cart-link') is visible in the header
    - expect: No error container (data-test='error') is present in the DOM

### 2. login-locked

**Seed:** ``

#### 2.1. login-locked.error-path

**File:** `tests/e2e/login-locked.error-path.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/ — the login page (screen: Login). Verify the Username textbox (data-test='username'), Password textbox (data-test='password') and Login button (data-test='login-button') are visible.
    - expect: Page URL is https://www.saucedemo.com/
    - expect: Login form elements are present
  2. Fill the Username field (data-test='username') with the value 'locked_out_user'.
    - expect: Username field contains 'locked_out_user'
  3. Fill the Password field (data-test='password') with the value 'secret_sauce'.
    - expect: Password field contains the entered value
  4. Click the Login button (data-test='login-button').
    - expect: Page URL remains https://www.saucedemo.com/ — no redirect to inventory
    - expect: Error container (data-test='error') is visible
    - expect: Error message text is exactly: 'Epic sadface: Sorry, this user has been locked out.'
    - expect: Error dismiss button (data-test='error-button') is present inside the error container
    - expect: Username and Password fields each show an error icon (SVG injected as sibling to the input)
    - expect: No navigation to /inventory.html occurs

### 3. checkout

**Seed:** ``

#### 3.1. checkout.happy-path

**File:** `tests/e2e/checkout.happy-path.spec.ts`

**Steps:**
  1. Authenticate as standard_user: navigate to https://www.saucedemo.com/, fill Username (data-test='username') with 'standard_user', fill Password (data-test='password') with 'secret_sauce', click Login (data-test='login-button'). This step establishes the authenticated session; implement as a storageState setup or an inline beforeEach.
    - expect: Browser is at https://www.saucedemo.com/inventory.html
    - expect: Page title (data-test='title') reads 'Products'
    - expect: Inventory list (data-test='inventory-list') is visible
  2. On the Inventory page (https://www.saucedemo.com/inventory.html), locate the 'Sauce Labs Backpack' product card and click its 'Add to cart' button (data-test='add-to-cart-sauce-labs-backpack', id='add-to-cart-sauce-labs-backpack').
    - expect: Cart badge (data-test='shopping-cart-badge') appears in the header and shows '1'
    - expect: The 'Add to cart' button for Sauce Labs Backpack changes to a 'Remove' button (data-test='remove-sauce-labs-backpack')
  3. Click the shopping cart icon/link (data-test='shopping-cart-link') in the header to navigate to the cart.
    - expect: Browser navigates to https://www.saucedemo.com/cart.html
    - expect: Page title (data-test='title') reads 'Your Cart'
    - expect: Cart list (data-test='cart-list') contains one item with the name 'Sauce Labs Backpack'
    - expect: Checkout button (data-test='checkout') is visible
    - expect: Continue Shopping button (data-test='continue-shopping') is visible
  4. Click the Checkout button (data-test='checkout').
    - expect: Browser navigates to https://www.saucedemo.com/checkout-step-one.html
    - expect: Page title (data-test='title') reads 'Checkout: Your Information'
    - expect: First Name field (data-test='firstName', id='first-name') is visible
    - expect: Last Name field (data-test='lastName', id='last-name') is visible
    - expect: Zip/Postal Code field (data-test='postalCode', id='postal-code') is visible
    - expect: Continue button (data-test='continue') is visible
    - expect: Cancel button (data-test='cancel') is visible
  5. Fill the shipping information: First Name (data-test='firstName') = 'Test', Last Name (data-test='lastName') = 'User', Zip/Postal Code (data-test='postalCode') = '12345'. Then click the Continue button (data-test='continue').
    - expect: Browser navigates to https://www.saucedemo.com/checkout-step-two.html
    - expect: Page title (data-test='title') reads 'Checkout: Overview'
    - expect: Order summary shows 'Sauce Labs Backpack' with price $29.99
    - expect: Subtotal label (data-test='subtotal-label') shows 'Item total: $29.99'
    - expect: Tax label (data-test='tax-label') shows 'Tax: $2.40'
    - expect: Total label (data-test='total-label') shows 'Total: $32.39'
    - expect: Finish button (data-test='finish') is visible
    - expect: Cancel button (data-test='cancel') is visible
  6. Click the Finish button (data-test='finish').
    - expect: Browser navigates to https://www.saucedemo.com/checkout-complete.html
    - expect: Page title (data-test='title') reads 'Checkout: Complete!'
    - expect: Confirmation heading (data-test='complete-header') reads 'Thank you for your order!'
    - expect: Confirmation body text (data-test='complete-text') reads 'Your order has been dispatched, and will arrive just as fast as the pony can get there!'
    - expect: Pony Express image (data-test='pony-express', alt='Pony Express') is visible
    - expect: Back Home button (data-test='back-to-products') is visible
    - expect: Shopping cart badge is absent (cart is empty after order completion)
