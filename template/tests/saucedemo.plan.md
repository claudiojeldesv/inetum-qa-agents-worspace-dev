# SauceDemo Happy Path Test Plan

## Application Overview

Swag Labs (https://www.saucedemo.com/) is a demo e-commerce frontend built by Sauce Labs for testing practice. It presents a product catalogue behind an authentication wall. The scope of this plan covers two happy-path flows only: login with a valid user, and a full purchase from adding a product to the cart through checkout confirmation. No exploratory, negative, or edge-case scenarios are included.

## Test Scenarios

### 1. Login

**Seed:** ``

#### 1.1. Valid user can log in and reach the inventory page

**File:** `tests/login/valid-login.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/
    - expect: The page title is 'Swag Labs'
    - expect: A 'Username' text input is visible
    - expect: A 'Password' text input is visible
    - expect: A 'Login' button is visible
  2. Type 'standard_user' into the Username field (data-test='username')
    - expect: The field value is 'standard_user'
  3. Type 'secret_sauce' into the Password field (data-test='password')
    - expect: The field value is 'secret_sauce'
  4. Click the 'Login' button (data-test='login-button')
    - expect: The browser navigates to https://www.saucedemo.com/inventory.html
    - expect: The page heading reads 'Products'
    - expect: Six product cards are visible on the page
    - expect: Each product card contains a product name, description, price, and an 'Add to cart' button
    - expect: The shopping cart icon is visible in the header with no badge count

### 2. Checkout

**Seed:** ``

#### 2.1. User can add a single product to the cart and complete checkout

**File:** `tests/checkout/single-product-checkout.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/ and log in with username 'standard_user' and password 'secret_sauce' (precondition: authenticated session)
    - expect: The inventory page at /inventory.html is displayed
    - expect: The Products heading is visible
  2. Click the 'Add to cart' button on the 'Sauce Labs Backpack' product card (data-test='add-to-cart-sauce-labs-backpack')
    - expect: The button label changes from 'Add to cart' to 'Remove' on that product card
    - expect: The shopping cart icon in the header shows a badge with the count '1'
  3. Click the shopping cart icon in the header to navigate to the cart page
    - expect: The browser navigates to https://www.saucedemo.com/cart.html
    - expect: The page heading reads 'Your Cart'
    - expect: One line item is listed: 'Sauce Labs Backpack', quantity 1, price $29.99
    - expect: A 'Continue Shopping' button is visible
    - expect: A 'Checkout' button is visible
  4. Click the 'Checkout' button (data-test='checkout')
    - expect: The browser navigates to https://www.saucedemo.com/checkout-step-one.html
    - expect: The page heading reads 'Checkout: Your Information'
    - expect: Three input fields are visible: 'First Name', 'Last Name', 'Zip/Postal Code'
    - expect: A 'Cancel' button and a 'Continue' button are visible
  5. Type 'Test' into the 'First Name' field (data-test='firstName')
    - expect: The field value is 'Test'
  6. Type 'User' into the 'Last Name' field (data-test='lastName')
    - expect: The field value is 'User'
  7. Type '12345' into the 'Zip/Postal Code' field (data-test='postalCode')
    - expect: The field value is '12345'
  8. Click the 'Continue' button (data-test='continue')
    - expect: The browser navigates to https://www.saucedemo.com/checkout-step-two.html
    - expect: The page heading reads 'Checkout: Overview'
    - expect: One line item is listed: 'Sauce Labs Backpack', quantity 1, price $29.99
    - expect: Payment Information section shows 'SauceCard #31337'
    - expect: Shipping Information section shows 'Free Pony Express Delivery!'
    - expect: Item total displays '$29.99'
    - expect: Tax displays '$2.40'
    - expect: Total displays '$32.39'
    - expect: A 'Cancel' button and a 'Finish' button are visible
  9. Click the 'Finish' button (data-test='finish')
    - expect: The browser navigates to https://www.saucedemo.com/checkout-complete.html
    - expect: The page heading reads 'Checkout: Complete!'
    - expect: A level-2 heading reads 'Thank you for your order!'
    - expect: Body text reads 'Your order has been dispatched, and will arrive just as fast as the pony can get there!'
    - expect: A 'Pony Express' image is visible
    - expect: A 'Back Home' button is visible
    - expect: The shopping cart icon badge is absent (cart is empty)

#### 2.2. User can add multiple products to the cart and complete checkout

**File:** `tests/checkout/multi-product-checkout.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/ and log in with username 'standard_user' and password 'secret_sauce'
    - expect: The inventory page at /inventory.html is displayed
  2. Click 'Add to cart' on 'Sauce Labs Backpack' ($29.99)
    - expect: Cart badge shows '1'
    - expect: Button for Sauce Labs Backpack changes to 'Remove'
  3. Click 'Add to cart' on 'Sauce Labs Bike Light' ($9.99)
    - expect: Cart badge shows '2'
    - expect: Button for Sauce Labs Bike Light changes to 'Remove'
  4. Click the shopping cart icon to navigate to the cart page
    - expect: The page heading reads 'Your Cart'
    - expect: Two line items are listed: 'Sauce Labs Backpack' at $29.99 and 'Sauce Labs Bike Light' at $9.99
    - expect: The 'Checkout' button is visible
  5. Click the 'Checkout' button
    - expect: The browser navigates to /checkout-step-one.html
    - expect: The 'Checkout: Your Information' heading is visible
  6. Fill 'First Name' with 'Test', 'Last Name' with 'User', 'Zip/Postal Code' with '12345', then click 'Continue'
    - expect: The browser navigates to /checkout-step-two.html
    - expect: The page heading reads 'Checkout: Overview'
    - expect: Both line items are listed
    - expect: Item total displays '$39.98'
    - expect: Tax displays '$3.20'
    - expect: Total displays '$43.18'
  7. Click the 'Finish' button
    - expect: The browser navigates to /checkout-complete.html
    - expect: The heading 'Thank you for your order!' is visible
    - expect: The cart badge is absent
