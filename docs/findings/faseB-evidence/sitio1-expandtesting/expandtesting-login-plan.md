# expandtesting Login Flow

## Application Overview

Focused test plan for the login flow at https://practice.expandtesting.com/login. The page presents a standard username/password form with test credentials documented on-screen (username: practice, password: SuperSecretPassword!). Successful login redirects to /secure and displays a flash success message plus a Logout button. Failed login keeps the user on /login and displays a specific error flash message. Scope is login-only; no registration, no navigation to other sections.

## Test Scenarios

### 1. Login

**Seed:** ``

#### 1.1. Successful login with valid credentials redirects to secure area

**File:** `tests/login/login-happy-path.spec.ts`

**Steps:**
  1. Navigate directly to https://practice.expandtesting.com/login
    - expect: Page URL is https://practice.expandtesting.com/login
    - expect: Page title contains 'Test Login Page'
    - expect: A Username textbox is visible
    - expect: A Password textbox is visible
    - expect: A Login button is visible
  2. Locate the on-screen credentials list and confirm it reads 'Username: practice' and 'Password: SuperSecretPassword!'
    - expect: The list item 'Username: practice' is present in the page body
    - expect: The list item 'Password: SuperSecretPassword!' is present in the page body
  3. Fill the Username textbox with the value 'practice'
    - expect: The Username field contains the text 'practice'
  4. Fill the Password textbox with the value 'SuperSecretPassword!'
    - expect: The Password field is filled (value not empty)
  5. Click the Login button
    - expect: The browser navigates away from /login
    - expect: The final URL is https://practice.expandtesting.com/secure
    - expect: A flash message containing the text 'You logged into a secure area!' is visible
    - expect: A Logout button is visible on the page

#### 1.2. Login with invalid credentials shows error and stays on login page

**File:** `tests/login/login-invalid-credentials.spec.ts`

**Steps:**
  1. Navigate directly to https://practice.expandtesting.com/login
    - expect: Page URL is https://practice.expandtesting.com/login
    - expect: Username textbox is visible
    - expect: Password textbox is visible
    - expect: Login button is visible
  2. Fill the Username textbox with 'wrongUser'
    - expect: The Username field contains the text 'wrongUser'
  3. Fill the Password textbox with 'WrongPassword'
    - expect: The Password field is filled
  4. Click the Login button
    - expect: The URL remains https://practice.expandtesting.com/login (no redirect to /secure)
    - expect: A flash error message is visible on the page
    - expect: The error message text is either 'Invalid username.' or 'Invalid password.' (depending on which credential fails first)
    - expect: The Username and Password fields are still present and accessible
