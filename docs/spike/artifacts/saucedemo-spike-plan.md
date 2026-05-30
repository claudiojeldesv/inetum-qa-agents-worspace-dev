# SauceDemo Spike Test Plan

## Application Overview

SauceDemo (https://www.saucedemo.com/) is a demo e-commerce application by Sauce Labs used for testing automation practices. It presents a login page, a product catalog (inventory), product detail pages, a shopping cart, and a three-step checkout flow (info → overview → complete). Credentials for six distinct user types are displayed on the login page itself (standard_user, locked_out_user, problem_user, performance_glitch_user, error_user, visual_user — all sharing password secret_sauce). The application has no real PII or financial data; all credentials and payment info (SauceCard #31337) are synthetic test fixtures published by Sauce Labs. This plan covers the MVP golden path (login → catalog → add to cart → checkout) plus login negative cases, cart management, catalog sorting, and checkout validation.

## Test Scenarios

### 1. Authentication

**Seed:** ``

#### 1.1. Successful login with standard_user

**File:** `tests/authentication/login-standard-user.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/
    - expect: The login page is displayed with Username field, Password field, and Login button
    - expect: A hint section shows the accepted usernames and the shared password secret_sauce
  2. Type 'standard_user' into the Username field
    - expect: The username field contains 'standard_user'
  3. Type 'secret_sauce' into the Password field
    - expect: The password field is filled (masked)
  4. Click the Login button
    - expect: The browser navigates to /inventory.html
    - expect: The page title area shows 'Products'
    - expect: A sort dropdown with default option 'Name (A to Z)' is visible
    - expect: Six product cards are displayed in the catalog grid
    - expect: No error message is shown

#### 1.2. Login rejected for locked_out_user

**File:** `tests/authentication/login-locked-out-user.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/
    - expect: The login page is displayed
  2. Type 'locked_out_user' into the Username field and 'secret_sauce' into the Password field
    - expect: Both fields are filled
  3. Click the Login button
    - expect: The page URL remains https://www.saucedemo.com/
    - expect: An error message is displayed containing the text: 'Epic sadface: Sorry, this user has been locked out.'
    - expect: The Username and Password fields each show a red error icon
    - expect: No navigation to inventory occurs

#### 1.3. Login rejected with wrong password

**File:** `tests/authentication/login-wrong-password.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/
    - expect: The login page is displayed
  2. Type 'standard_user' into the Username field and 'wrong_password' into the Password field
    - expect: Both fields are filled
  3. Click the Login button
    - expect: The page URL remains https://www.saucedemo.com/
    - expect: An error message is displayed containing the text: 'Epic sadface: Username and password do not match any user in this service'
    - expect: The Username and Password fields each show a red error icon

#### 1.4. Login rejected with empty credentials

**File:** `tests/authentication/login-empty-credentials.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/
    - expect: The login page is displayed with empty Username and Password fields
  2. Click the Login button without entering any credentials
    - expect: The page URL remains https://www.saucedemo.com/
    - expect: An error message is displayed containing the text: 'Epic sadface: Username is required'
    - expect: No navigation to inventory occurs

#### 1.5. Logout from the application

**File:** `tests/authentication/logout.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/ and log in with standard_user / secret_sauce
    - expect: The inventory page is displayed at /inventory.html
  2. Click the hamburger menu button (Open Menu) in the top-left corner
    - expect: A side navigation panel opens with links: All Items, About, Logout, Reset App State
  3. Click the 'Logout' link
    - expect: The browser navigates back to https://www.saucedemo.com/
    - expect: The login page is displayed with empty Username and Password fields
    - expect: The user session is terminated — navigating directly to /inventory.html redirects back to the login page

### 2. Product Catalog

**Seed:** ``

#### 2.1. Browse product catalog and view product details

**File:** `tests/catalog/browse-and-view-product.spec.ts`

**Steps:**
  1. Log in with standard_user / secret_sauce and land on /inventory.html
    - expect: Six product cards are displayed, each showing a product image, name, description, price, and an 'Add to cart' button
  2. Click on the product name link 'Sauce Labs Backpack'
    - expect: The browser navigates to /inventory-item.html?id=4
    - expect: The product detail page shows: product image, product name ('Sauce Labs Backpack'), description text, price ($29.99), an 'Add to cart' button, and a 'Back to products' button
  3. Click the 'Back to products' button
    - expect: The browser navigates back to /inventory.html
    - expect: All six product cards are displayed again

#### 2.2. Sort catalog by price low to high

**File:** `tests/catalog/sort-price-low-to-high.spec.ts`

**Steps:**
  1. Log in with standard_user / secret_sauce and land on /inventory.html
    - expect: The default sort order is 'Name (A to Z)' — products are listed alphabetically
  2. Click the sort dropdown and select 'Price (low to high)'
    - expect: The product list re-orders so that the cheapest item appears first
    - expect: The six visible prices in order are: $7.99, $9.99, $15.99, $15.99, $29.99, $49.99

#### 2.3. Sort catalog by name Z to A

**File:** `tests/catalog/sort-name-z-to-a.spec.ts`

**Steps:**
  1. Log in with standard_user / secret_sauce and land on /inventory.html
    - expect: The default sort is 'Name (A to Z)'
  2. Click the sort dropdown and select 'Name (Z to A)'
    - expect: The product list reverses alphabetical order — 'Test.allTheThings() T-Shirt (Red)' appears first and 'Sauce Labs Backpack' appears last

### 3. Shopping Cart

**Seed:** ``

#### 3.1. Add item to cart from inventory and verify cart badge

**File:** `tests/cart/add-item-from-inventory.spec.ts`

**Steps:**
  1. Log in with standard_user / secret_sauce and land on /inventory.html
    - expect: No cart badge is visible in the header (cart is empty)
  2. Click 'Add to cart' on the 'Sauce Labs Backpack' product card
    - expect: The button text changes from 'Add to cart' to 'Remove'
    - expect: A cart badge appears in the header showing the number '1'
  3. Click the cart icon in the header to navigate to /cart.html
    - expect: The cart page displays: heading 'Your Cart', a QTY column, a Description column, one line item for 'Sauce Labs Backpack' with quantity 1 and price $29.99
    - expect: A 'Continue Shopping' button and a 'Checkout' button are visible

#### 3.2. Add item to cart from product detail page

**File:** `tests/cart/add-item-from-detail-page.spec.ts`

**Steps:**
  1. Log in with standard_user / secret_sauce, navigate to /inventory.html, then click the image or name link of 'Sauce Labs Backpack' to open the detail page
    - expect: The product detail page /inventory-item.html?id=4 is shown with an 'Add to cart' button and no cart badge in the header
  2. Click 'Add to cart' on the product detail page
    - expect: The button text changes to 'Remove'
    - expect: A cart badge showing '1' appears in the header

#### 3.3. Remove item from cart

**File:** `tests/cart/remove-item-from-cart.spec.ts`

**Steps:**
  1. Log in with standard_user / secret_sauce, add 'Sauce Labs Backpack' to the cart, then navigate to /cart.html
    - expect: One item is shown in the cart with a 'Remove' button
  2. Click the 'Remove' button next to 'Sauce Labs Backpack'
    - expect: The item disappears from the cart list
    - expect: The cart badge in the header disappears (0 items)
    - expect: The cart list area is now empty

#### 3.4. Continue Shopping returns to inventory

**File:** `tests/cart/continue-shopping.spec.ts`

**Steps:**
  1. Log in with standard_user / secret_sauce, add any item to cart, then navigate to /cart.html
    - expect: The cart page is displayed with at least one item
  2. Click 'Continue Shopping'
    - expect: The browser navigates back to /inventory.html
    - expect: Previously added items remain in the cart (cart badge count is unchanged)

### 4. Checkout Flow

**Seed:** ``

#### 4.1. Complete full checkout golden path

**File:** `tests/checkout/checkout-golden-path.spec.ts`

**Steps:**
  1. Log in with standard_user / secret_sauce, add 'Sauce Labs Backpack' ($29.99) to cart, then navigate to /cart.html and click 'Checkout'
    - expect: The browser navigates to /checkout-step-one.html
    - expect: The page heading reads 'Checkout: Your Information'
    - expect: Three fields are present: First Name, Last Name, and Zip/Postal Code
    - expect: A 'Cancel' button and a 'Continue' button are visible
  2. Fill in First Name: 'John', Last Name: 'Doe', Zip/Postal Code: '12345', then click 'Continue'
    - expect: The browser navigates to /checkout-step-two.html
    - expect: The page heading reads 'Checkout: Overview'
    - expect: The order summary lists 'Sauce Labs Backpack' with quantity 1 and price $29.99
    - expect: Payment Information shows 'SauceCard #31337'
    - expect: Shipping Information shows 'Free Pony Express Delivery!'
    - expect: Item total is $29.99
    - expect: Tax is $2.40
    - expect: Total is $32.39
    - expect: A 'Cancel' button and a 'Finish' button are visible
  3. Click the 'Finish' button
    - expect: The browser navigates to /checkout-complete.html
    - expect: The page heading reads 'Checkout: Complete!'
    - expect: An h2 heading reads 'Thank you for your order!'
    - expect: A confirmation message states the order has been dispatched
    - expect: A Pony Express image is displayed
    - expect: A 'Back Home' button is visible
    - expect: The cart badge in the header is gone (0 items)
  4. Click the 'Back Home' button
    - expect: The browser navigates to /inventory.html
    - expect: The product catalog is displayed with an empty cart (no badge)

#### 4.2. Checkout step 1 validation — empty form

**File:** `tests/checkout/checkout-step1-empty-form.spec.ts`

**Steps:**
  1. Log in with standard_user / secret_sauce, add any item to cart, navigate to /cart.html, and click 'Checkout' to reach /checkout-step-one.html
    - expect: The checkout information form is displayed with empty fields
  2. Leave all three fields (First Name, Last Name, Zip/Postal Code) empty and click 'Continue'
    - expect: The page URL remains /checkout-step-one.html
    - expect: An error message is displayed containing the text: 'Error: First Name is required'
    - expect: No navigation to step two occurs

#### 4.3. Checkout step 1 — Cancel returns to cart

**File:** `tests/checkout/checkout-step1-cancel.spec.ts`

**Steps:**
  1. Log in with standard_user / secret_sauce, add any item to cart, navigate to /cart.html, and click 'Checkout' to reach /checkout-step-one.html
    - expect: The checkout information form is displayed
  2. Click the 'Cancel' button
    - expect: The browser navigates back to /cart.html
    - expect: The previously added item is still present in the cart

#### 4.4. Checkout step 2 — Cancel returns to inventory

**File:** `tests/checkout/checkout-step2-cancel.spec.ts`

**Steps:**
  1. Log in with standard_user / secret_sauce, add 'Sauce Labs Backpack' to cart, proceed through checkout step 1 with valid info (First Name: 'Jane', Last Name: 'Smith', Zip: '90210') to reach /checkout-step-two.html
    - expect: The checkout overview page is shown with order summary, payment info, shipping info, and total
  2. Click the 'Cancel' button on the overview page
    - expect: The browser navigates to /inventory.html
    - expect: The cart badge still reflects the item count from before (item is still in cart)
