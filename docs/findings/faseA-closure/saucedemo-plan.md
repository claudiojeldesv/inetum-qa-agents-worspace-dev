# SauceDemo (Swag Labs) Test Plan

## Application Overview

SauceDemo (https://www.saucedemo.com/) is a demo e-commerce web application by Sauce Labs used for QA automation practice. It exposes a login wall protecting all routes, a product inventory page with sorting, individual product detail pages, a shopping cart, and a three-page checkout flow (info form, order overview, confirmation). Six test accounts are publicly documented, each representing a different behavior profile: standard_user (fully functional), locked_out_user (blocked on login), problem_user (UI defects), performance_glitch_user (slow responses), error_user (API errors), and visual_user (visual regressions). The full authenticated product catalog contains six items with prices ranging from $7.99 to $49.99. The checkout flow requires first name, last name, and postal code; each field is independently validated. The application allows checkout from an empty cart (no guard), which is a known behavioral quirk worth asserting explicitly.

## Test Scenarios

### 1. Authentication

**Seed:** `tests/seed.spec.ts`

#### 1.1. Successful login with standard_user redirects to inventory

**File:** `tests/authentication/login-success.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/
    - expect: The login page is displayed with Username and Password fields and a Login button
  2. Enter 'standard_user' in the Username field
  3. Enter 'secret_sauce' in the Password field
  4. Click the Login button
    - expect: The browser URL changes to https://www.saucedemo.com/inventory.html
    - expect: The Products page header is visible
    - expect: Six product cards are displayed

#### 1.2. Login with locked_out_user shows locked error

**File:** `tests/authentication/login-locked-user.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/
    - expect: The login page is displayed
  2. Enter 'locked_out_user' in the Username field and 'secret_sauce' in the Password field, then click Login
    - expect: The URL remains https://www.saucedemo.com/
    - expect: An error message is displayed: 'Epic sadface: Sorry, this user has been locked out.'
    - expect: Both the Username and Password fields show an error icon

#### 1.3. Login with wrong password shows credential mismatch error

**File:** `tests/authentication/login-wrong-password.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/
    - expect: The login page is displayed
  2. Enter 'standard_user' in the Username field
  3. Enter 'wrong_password' in the Password field and click Login
    - expect: The URL remains https://www.saucedemo.com/
    - expect: An error message is displayed: 'Epic sadface: Username and password do not match any user in this service'
    - expect: Both fields show error icons

#### 1.4. Login with empty username shows required field error

**File:** `tests/authentication/login-empty-fields.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/
    - expect: The login page is displayed
  2. Leave both Username and Password fields empty and click Login
    - expect: The URL remains https://www.saucedemo.com/
    - expect: An error message is displayed: 'Epic sadface: Username is required'

#### 1.5. Successful logout returns user to login page

**File:** `tests/authentication/logout.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/ and log in as standard_user / secret_sauce
    - expect: The inventory page is displayed at /inventory.html
  2. Click the hamburger menu button (Open Menu) in the top-left corner
    - expect: The side navigation menu opens with links: All Items, About, Logout, Reset App State
  3. Click the Logout link
    - expect: The browser URL changes to https://www.saucedemo.com/
    - expect: The login page is displayed
    - expect: Username and Password fields are empty

#### 1.6. Accessing protected route while unauthenticated redirects to login with message

**File:** `tests/authentication/protected-route-redirect.spec.ts`

**Steps:**
  1. Without logging in, navigate directly to https://www.saucedemo.com/inventory.html
    - expect: The browser URL changes to https://www.saucedemo.com/
    - expect: An error message is displayed: "Epic sadface: You can only access '/inventory.html' when you are logged in."

#### 1.7. Error message can be dismissed via the close button

**File:** `tests/authentication/login-error-dismiss.spec.ts`

**Steps:**
  1. Navigate to https://www.saucedemo.com/ and submit the login form with empty fields
    - expect: The error message 'Epic sadface: Username is required' is visible
  2. Click the X (close) button on the error message
    - expect: The error message disappears
    - expect: The Username and Password fields no longer show error icons

### 2. Product Inventory

**Seed:** `tests/seed.spec.ts`

#### 2.1. Inventory page displays all six products with correct data

**File:** `tests/inventory/inventory-product-list.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce
    - expect: The inventory page is displayed
  2. Count the product cards on the page
    - expect: Exactly 6 product cards are displayed
  3. Verify each product card contains a product image, product name link, description, price, and an Add to cart button
    - expect: All 6 products have a visible image
    - expect: All 6 products have a clickable title link
    - expect: All 6 products have a non-empty description
    - expect: All 6 products have a price in the format '$XX.XX'
    - expect: All 6 products have an 'Add to cart' button

#### 2.2. Default sort order is Name A to Z

**File:** `tests/inventory/inventory-sort-default.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce
    - expect: The inventory page is displayed
  2. Observe the sort dropdown and the order of product names
    - expect: The sort dropdown shows 'Name (A to Z)' as the selected option
    - expect: Products are listed alphabetically: Sauce Labs Backpack, Sauce Labs Bike Light, Sauce Labs Bolt T-Shirt, Sauce Labs Fleece Jacket, Sauce Labs Onesie, Test.allTheThings() T-Shirt (Red)

#### 2.3. Sort by Name Z to A reorders products in reverse alphabetical order

**File:** `tests/inventory/inventory-sort-za.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce
    - expect: The inventory page is displayed
  2. Select 'Name (Z to A)' from the sort dropdown
    - expect: The product list reorders immediately
    - expect: The first product is 'Test.allTheThings() T-Shirt (Red)'
    - expect: The last product is 'Sauce Labs Backpack'

#### 2.4. Sort by Price low to high orders products by ascending price

**File:** `tests/inventory/inventory-sort-price-lohi.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce
    - expect: The inventory page is displayed
  2. Select 'Price (low to high)' from the sort dropdown
    - expect: The first product is Sauce Labs Onesie at $7.99
    - expect: The second product is Sauce Labs Bike Light at $9.99
    - expect: The last product is Sauce Labs Fleece Jacket at $49.99
    - expect: Each subsequent product price is greater than or equal to the previous one

#### 2.5. Sort by Price high to low orders products by descending price

**File:** `tests/inventory/inventory-sort-price-hilo.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce
    - expect: The inventory page is displayed
  2. Select 'Price (high to low)' from the sort dropdown
    - expect: The first product is Sauce Labs Fleece Jacket at $49.99
    - expect: The last product is Sauce Labs Onesie at $7.99
    - expect: Each subsequent product price is less than or equal to the previous one

#### 2.6. Clicking a product image or name navigates to product detail page

**File:** `tests/inventory/inventory-product-detail-navigation.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce
    - expect: The inventory page is displayed
  2. Click the product name link 'Sauce Labs Backpack'
    - expect: The URL changes to https://www.saucedemo.com/inventory-item.html?id=4
    - expect: The product detail page is displayed showing the product image, name 'Sauce Labs Backpack', description, price '$29.99', and an Add to cart button
    - expect: A 'Back to products' button is present

#### 2.7. Back to products button from detail page returns to inventory

**File:** `tests/inventory/inventory-back-from-detail.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce and click on any product to reach its detail page
    - expect: The product detail page is displayed
  2. Click the 'Back to products' button
    - expect: The URL changes back to https://www.saucedemo.com/inventory.html
    - expect: All six products are visible

#### 2.8. Hamburger menu contains All Items, About, Logout, and Reset App State

**File:** `tests/inventory/inventory-hamburger-menu.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce
    - expect: The inventory page is displayed
  2. Click the hamburger (Open Menu) button
    - expect: The side navigation drawer opens
    - expect: The menu contains the links: 'All Items', 'About', 'Logout', 'Reset App State'
  3. Click the Close Menu button
    - expect: The navigation drawer closes

### 3. Shopping Cart

**Seed:** `tests/seed.spec.ts`

#### 3.1. Adding a single item from inventory updates cart badge to 1

**File:** `tests/cart/cart-add-single-item.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce
    - expect: The inventory page is displayed with no cart badge visible
  2. Click 'Add to cart' on the Sauce Labs Backpack card
    - expect: The cart badge in the top-right header shows '1'
    - expect: The button for Sauce Labs Backpack changes from 'Add to cart' to 'Remove'

#### 3.2. Adding a single item from product detail page updates cart badge to 1

**File:** `tests/cart/cart-add-from-detail.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce and navigate to the Sauce Labs Backpack detail page
    - expect: The detail page shows an 'Add to cart' button and no cart badge
  2. Click the 'Add to cart' button on the detail page
    - expect: The cart badge shows '1'
    - expect: The button changes to 'Remove'

#### 3.3. Adding multiple items accumulates the correct badge count

**File:** `tests/cart/cart-add-multiple-items.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce
    - expect: The inventory page is displayed
  2. Click 'Add to cart' on Sauce Labs Backpack, Sauce Labs Bike Light, and Sauce Labs Bolt T-Shirt in sequence
    - expect: After the first click, the cart badge shows '1'
    - expect: After the second click, the cart badge shows '2'
    - expect: After the third click, the cart badge shows '3'

#### 3.4. Removing an item from inventory decrements the cart badge

**File:** `tests/cart/cart-remove-from-inventory.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce and add Sauce Labs Backpack and Sauce Labs Bike Light to the cart
    - expect: The cart badge shows '2'
  2. Click the 'Remove' button on the Sauce Labs Backpack card
    - expect: The cart badge decrements to '1'
    - expect: The button for Sauce Labs Backpack reverts to 'Add to cart'

#### 3.5. Cart page displays all added items with correct details

**File:** `tests/cart/cart-page-display.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce, add Sauce Labs Backpack ($29.99) and Sauce Labs Bike Light ($9.99) to the cart
    - expect: The cart badge shows '2'
  2. Click the cart icon to navigate to /cart.html
    - expect: The page title shows 'Your Cart'
    - expect: Two items are listed with their quantity (1), name, description, and price
    - expect: Sauce Labs Backpack is listed at $29.99
    - expect: Sauce Labs Bike Light is listed at $9.99
    - expect: Each item has a 'Remove' button
    - expect: A 'Continue Shopping' button and a 'Checkout' button are present

#### 3.6. Removing an item from the cart page updates the cart correctly

**File:** `tests/cart/cart-remove-from-cart-page.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce, add Sauce Labs Backpack, Sauce Labs Bike Light, and Sauce Labs Bolt T-Shirt to the cart, then navigate to /cart.html
    - expect: Three items are listed
    - expect: The cart badge shows '3'
  2. Click the 'Remove' button next to Sauce Labs Bike Light
    - expect: Sauce Labs Bike Light is removed from the cart list
    - expect: Two items remain in the cart
    - expect: The cart badge in the header decrements to '2'

#### 3.7. Continue Shopping from cart returns to inventory with cart state preserved

**File:** `tests/cart/cart-continue-shopping.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce, add Sauce Labs Backpack to the cart, then navigate to /cart.html
    - expect: The cart page shows one item and cart badge shows '1'
  2. Click the 'Continue Shopping' button
    - expect: The URL changes to https://www.saucedemo.com/inventory.html
    - expect: The cart badge still shows '1'
    - expect: The Sauce Labs Backpack button shows 'Remove' (item remains in cart)

#### 3.8. Empty cart page shows no items and still displays the Checkout button

**File:** `tests/cart/cart-empty-state.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce (do not add any items)
    - expect: The inventory page shows no cart badge
  2. Navigate to https://www.saucedemo.com/cart.html
    - expect: The page title shows 'Your Cart'
    - expect: No product items are listed under the QTY/Description columns
    - expect: The 'Continue Shopping' button is present
    - expect: The 'Checkout' button is present and enabled

### 4. Checkout Flow

**Seed:** `tests/seed.spec.ts`

#### 4.1. Complete golden-path checkout with a single item

**File:** `tests/checkout/checkout-golden-path.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce and add Sauce Labs Backpack to the cart
    - expect: The cart badge shows '1'
  2. Navigate to /cart.html and click the 'Checkout' button
    - expect: The URL changes to https://www.saucedemo.com/checkout-step-one.html
    - expect: The page header shows 'Checkout: Your Information'
    - expect: Three input fields are visible: First Name, Last Name, Zip/Postal Code
  3. Enter 'John' in First Name, 'Doe' in Last Name, and '12345' in Zip/Postal Code, then click Continue
    - expect: The URL changes to https://www.saucedemo.com/checkout-step-two.html
    - expect: The page header shows 'Checkout: Overview'
    - expect: Sauce Labs Backpack is listed with quantity 1 and price $29.99
    - expect: Payment Information shows 'SauceCard #31337'
    - expect: Shipping Information shows 'Free Pony Express Delivery!'
    - expect: Item total shows '$29.99'
    - expect: Tax shows '$2.40'
    - expect: Total shows '$32.39'
    - expect: A 'Cancel' button and a 'Finish' button are present
  4. Click the 'Finish' button
    - expect: The URL changes to https://www.saucedemo.com/checkout-complete.html
    - expect: The page header shows 'Checkout: Complete!'
    - expect: A 'Thank you for your order!' heading is displayed
    - expect: The confirmation message 'Your order has been dispatched, and will arrive just as fast as the pony can get there!' is visible
    - expect: A Pony Express image is displayed
    - expect: A 'Back Home' button is present
    - expect: The cart badge is no longer visible (cart is empty)
  5. Click the 'Back Home' button
    - expect: The URL changes to https://www.saucedemo.com/inventory.html
    - expect: The inventory page is displayed
    - expect: No cart badge is visible

#### 4.2. Complete checkout with multiple items verifies totals

**File:** `tests/checkout/checkout-multiple-items.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce and add Sauce Labs Backpack ($29.99) and Sauce Labs Bike Light ($9.99) to the cart
    - expect: The cart badge shows '2'
  2. Navigate to /cart.html and click Checkout
    - expect: Checkout step one is displayed
  3. Fill in First Name 'Jane', Last Name 'Smith', Zip '90210', then click Continue
    - expect: Checkout step two is displayed with both items listed
  4. Verify the order summary on the overview page
    - expect: Both Sauce Labs Backpack and Sauce Labs Bike Light are listed
    - expect: Item total shows '$39.98'
    - expect: Tax shows '$3.20'
    - expect: Total shows '$43.18'
  5. Click Finish
    - expect: The confirmation page is displayed at /checkout-complete.html
    - expect: The 'Thank you for your order!' message is shown

#### 4.3. Checkout step one shows error when First Name is missing

**File:** `tests/checkout/checkout-validation-firstname.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce, add any item to the cart, navigate to /cart.html, and click Checkout
    - expect: Checkout step one is displayed
  2. Leave all fields empty and click the Continue button
    - expect: The URL remains on /checkout-step-one.html
    - expect: An error message appears: 'Error: First Name is required'
    - expect: All three fields show error icons

#### 4.4. Checkout step one shows error when Last Name is missing

**File:** `tests/checkout/checkout-validation-lastname.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce, add any item to cart, navigate to checkout step one
    - expect: Checkout step one is displayed
  2. Enter 'John' in First Name, leave Last Name empty, leave Zip empty, and click Continue
    - expect: The URL remains on /checkout-step-one.html
    - expect: An error message appears: 'Error: Last Name is required'

#### 4.5. Checkout step one shows error when Postal Code is missing

**File:** `tests/checkout/checkout-validation-postalcode.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce, add any item to cart, navigate to checkout step one
    - expect: Checkout step one is displayed
  2. Enter 'John' in First Name, 'Doe' in Last Name, leave Zip/Postal Code empty, and click Continue
    - expect: The URL remains on /checkout-step-one.html
    - expect: An error message appears: 'Error: Postal Code is required'

#### 4.6. Cancel on checkout step one returns user to cart

**File:** `tests/checkout/checkout-cancel-step-one.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce, add Sauce Labs Backpack to cart, navigate to /cart.html, and click Checkout
    - expect: Checkout step one is displayed
  2. Click the 'Cancel' button without filling in any fields
    - expect: The URL changes to https://www.saucedemo.com/cart.html
    - expect: Sauce Labs Backpack is still in the cart
    - expect: The cart badge still shows '1'

#### 4.7. Cancel on checkout step two returns user to inventory

**File:** `tests/checkout/checkout-cancel-step-two.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce, add Sauce Labs Backpack to cart, navigate through checkout step one (filling all fields) to reach checkout step two
    - expect: Checkout step two (Overview) is displayed
  2. Click the 'Cancel' button on the overview page
    - expect: The URL changes to https://www.saucedemo.com/inventory.html
    - expect: The inventory page is displayed
    - expect: The cart badge still shows '1' (item was not removed)

#### 4.8. Checkout from empty cart proceeds with $0.00 total

**File:** `tests/checkout/checkout-empty-cart.spec.ts`

**Steps:**
  1. Log in as standard_user / secret_sauce without adding any items to the cart
    - expect: The inventory page is displayed with no cart badge
  2. Navigate to https://www.saucedemo.com/cart.html
    - expect: The cart page shows no items but the Checkout button is enabled
  3. Click Checkout, fill in 'John', 'Doe', '12345', and click Continue
    - expect: Checkout step two is reached at /checkout-step-two.html
    - expect: No items are listed in the order summary
    - expect: Item total shows '$0'
    - expect: Tax shows '$0.00'
    - expect: Total shows '$0.00'
