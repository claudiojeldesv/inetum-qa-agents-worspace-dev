# SauceDemo Slice 6.5 — Golden Path (standard_user)

## Application Overview

SauceDemo (https://www.saucedemo.com/) is a demo e-commerce application by Sauce Labs used for testing practice. It presents a login page, a product inventory, a shopping cart, and a multi-step checkout flow. This plan covers the strict golden path for standard_user only — three scenarios, no error paths, no login variants.

## Test Scenarios

### 1. Golden Path — standard_user

**Seed:** ``

#### 1.1. Login as standard_user reaches inventory page

**File:** `tests/golden-path/login.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/
    - expect: The page title is 'Swag Labs' and the login form is visible with Username and Password fields and a Login button
  2. Fill the Username field with the value 'standard_user'
    - expect: The field contains 'standard_user'
  3. Fill the Password field with the value 'secret_sauce'
    - expect: The field contains the entered password
  4. Click the 'Login' button
    - expect: The browser navigates to https://www.saucedemo.com/inventory.html
    - expect: The page heading 'Products' is visible
    - expect: A list of product cards is displayed on the page

#### 1.2. Add Sauce Labs Backpack to cart shows badge count 1

**File:** `tests/golden-path/add-to-cart.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/ and log in as standard_user with password secret_sauce so that /inventory.html is the current page
    - expect: The inventory page is loaded at /inventory.html
  2. Locate the 'Sauce Labs Backpack' product card and click its 'Add to cart' button
    - expect: The button label changes to 'Remove'
    - expect: A cart badge appears in the top-right navigation area showing the number '1'

#### 1.3. Complete checkout from cart to confirmation page

**File:** `tests/golden-path/checkout.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/ and log in as standard_user / secret_sauce, then add 'Sauce Labs Backpack' to the cart so that the cart badge shows '1'
    - expect: Cart badge displays '1'
  2. Click the cart icon / cart badge in the top-right navigation
    - expect: The browser navigates to https://www.saucedemo.com/cart.html
    - expect: The cart page heading 'Your Cart' is visible
    - expect: One line item 'Sauce Labs Backpack' with quantity 1 and price $29.99 is listed
    - expect: A 'Checkout' button is present
  3. Click the 'Checkout' button
    - expect: The browser navigates to https://www.saucedemo.com/checkout-step-one.html
    - expect: The page heading reads 'Checkout: Your Information'
    - expect: Three input fields are present: First Name, Last Name, and Zip/Postal Code
  4. Fill First Name with 'Claudia', Last Name with 'Test', and Zip/Postal Code with '12345'
    - expect: Each field contains the entered value
  5. Click the 'Continue' button
    - expect: The browser navigates to https://www.saucedemo.com/checkout-step-two.html
    - expect: The page heading reads 'Checkout: Overview'
    - expect: The order summary shows 'Sauce Labs Backpack' with quantity 1 and item price $29.99
    - expect: Payment Information shows 'SauceCard #31337'
    - expect: Shipping Information shows 'Free Pony Express Delivery!'
    - expect: Item total is $29.99, Tax is $2.40, and Total is $32.39
    - expect: A 'Finish' button is present
  6. Click the 'Finish' button
    - expect: The browser navigates to https://www.saucedemo.com/checkout-complete.html
    - expect: The page heading reads 'Checkout: Complete!'
    - expect: An h2 heading with the text 'Thank you for your order!' is visible
    - expect: A 'Back Home' button is present
