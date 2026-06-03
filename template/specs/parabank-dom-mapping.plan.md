# ParaBank DOM Mapping — login, transfer-funds, logout, close-account

## Application Overview

DOM mapping of four flows (login, transfer-funds, logout, close-account) against https://parabank.parasoft.com/parabank/index.htm using credentials john/demo. Three flows are fully mapped to real DOM elements. close-account is NOT MAPPED: the endpoint /parabank/closeaccount.htm returns HTTP 404, the authenticated sidebar does not contain any Close Account link, and the account detail page (/activity.htm?id=*) exposes no close-account control. No steps were invented for that flow.

## Test Scenarios

### 1. login

**Seed:** ``

#### 1.1. Successful login with valid credentials redirects to Accounts Overview

**File:** `specs/parabank/login.spec.ts`

**Steps:**
  1. Navigate to https://parabank.parasoft.com/parabank/index.htm
    - expect: Page title is 'ParaBank | Welcome | Online Banking'
    - expect: A 'Customer Login' heading (h2) is visible
    - expect: A username textbox (name='username') is present
    - expect: A password textbox (name='password') is present
    - expect: A submit button (input[value='Log In']) is present
  2. Fill the username textbox (name='username') with the value 'john'
    - expect: The field contains the value 'john'
  3. Fill the password textbox (name='password') with the value 'demo'
    - expect: The field contains the value 'demo'
  4. Click the 'Log In' button (input[value='Log In'])
    - expect: The browser navigates to /parabank/overview.htm
    - expect: Page title is 'ParaBank | Accounts Overview'
    - expect: A paragraph 'Welcome John Smith' is visible in the left sidebar
    - expect: An 'Account Services' heading (h2) is visible in the left sidebar
    - expect: The sidebar contains links: Open New Account, Accounts Overview, Transfer Funds, Bill Pay, Find Transactions, Update Contact Info, Request Loan, Log Out
    - expect: An 'Accounts Overview' heading (h1) is visible in the main content area
    - expect: An accounts table is present listing at least one account number with Balance and Available Amount columns

#### 1.2. Login with wrong password shows error and stays on login page

**File:** `specs/parabank/login.spec.ts`

**Steps:**
  1. Navigate to https://parabank.parasoft.com/parabank/index.htm
    - expect: The 'Customer Login' form is visible
  2. Fill username 'john' and password 'wrongpassword', then click the 'Log In' button (input[value='Log In'])
    - expect: The page does not navigate to /overview.htm
    - expect: An error message is displayed (the application shows a login error)
    - expect: The 'Customer Login' form remains visible
    - expect: The 'Welcome John Smith' paragraph is NOT present

### 2. transfer-funds

**Seed:** ``

#### 2.1. Successful fund transfer between two accounts shows Transfer Complete confirmation

**File:** `specs/parabank/transfer-funds.spec.ts`

**Steps:**
  1. Log in as john/demo via /parabank/index.htm and land on /parabank/overview.htm
    - expect: 'Welcome John Smith' paragraph is visible in the sidebar
  2. Click the 'Transfer Funds' link (a[href='transfer.htm']) in the Account Services sidebar
    - expect: The browser navigates to /parabank/transfer.htm
    - expect: Page title is 'ParaBank | Transfer Funds'
    - expect: A 'Transfer Funds' heading (h1) is visible
    - expect: An amount textbox (id='amount') is present
    - expect: A 'From account #' select dropdown (id='fromAccountId') is present and populated with account numbers
    - expect: A 'to account #' select dropdown (id='toAccountId') is present and populated with account numbers
    - expect: A 'Transfer' submit button (input[value='Transfer']) is present
  3. Fill the amount textbox (id='amount') with '100'
    - expect: The field value is '100'
  4. Select a source account from the 'From account #' dropdown (id='fromAccountId') that has a positive balance — for example account 13122
    - expect: The dropdown shows the selected account
  5. Select a different destination account from the 'to account #' dropdown (id='toAccountId') — for example account 12456
    - expect: The dropdown shows the selected account, different from the source
  6. Click the 'Transfer' button (input[value='Transfer'])
    - expect: The URL stays on /parabank/transfer.htm
    - expect: A 'Transfer Complete!' heading (h1) is visible in the main content area
    - expect: A confirmation paragraph matching the pattern '$100.00 has been transferred from account #<fromId> to account #<toId>.' is visible
    - expect: A 'See Account Activity for more details.' paragraph is visible

#### 2.2. Transfer form is not accessible without authentication

**File:** `specs/parabank/transfer-funds.spec.ts`

**Steps:**
  1. Navigate directly to https://parabank.parasoft.com/parabank/transfer.htm without logging in (fresh browser context with no session)
    - expect: The browser is redirected to the login page (/parabank/index.htm or equivalent)
    - expect: The Transfer Funds form is NOT visible
    - expect: The 'Customer Login' form IS visible

### 3. logout

**Seed:** ``

#### 3.1. Clicking Log Out from an authenticated session returns to the login page

**File:** `specs/parabank/logout.spec.ts`

**Steps:**
  1. Log in as john/demo via /parabank/index.htm and land on /parabank/overview.htm
    - expect: 'Welcome John Smith' paragraph is visible
    - expect: The Account Services sidebar contains the 'Log Out' link (a[href='logout.htm'])
  2. Click the 'Log Out' link (a[href='logout.htm']) in the Account Services sidebar
    - expect: The browser navigates to /parabank/index.htm (URL may include query string ?ConnType=JDBC)
    - expect: Page title is 'ParaBank | Welcome | Online Banking'
    - expect: The 'Customer Login' heading (h2) is visible
    - expect: The username textbox (name='username') and password textbox (name='password') are visible
    - expect: The 'Welcome John Smith' paragraph is NOT present
    - expect: The Account Services sidebar (Open New Account, Transfer Funds, etc.) is NOT present

#### 3.2. Accessing a protected page after logout redirects to login

**File:** `specs/parabank/logout.spec.ts`

**Steps:**
  1. Log in as john/demo, then log out by clicking 'Log Out' (a[href='logout.htm'])
    - expect: The session is terminated and the login page is shown
  2. Navigate directly to https://parabank.parasoft.com/parabank/overview.htm
    - expect: The browser is redirected away from /overview.htm
    - expect: The 'Customer Login' form is displayed
    - expect: The Accounts Overview table is NOT visible

### 4. close-account — NOT MAPPED

**Seed:** ``

#### 4.1. DRIFT CONFIRMED: close-account flow does not exist in ParaBank UI

**File:** `specs/parabank/close-account.spec.ts`

**Steps:**
  1. Log in as john/demo and inspect the full Account Services sidebar on /parabank/overview.htm
    - expect: The sidebar contains exactly 8 items: Open New Account, Accounts Overview, Transfer Funds, Bill Pay, Find Transactions, Update Contact Info, Request Loan, Log Out
    - expect: No 'Close Account' link is present in the sidebar
  2. Navigate directly to https://parabank.parasoft.com/parabank/closeaccount.htm while authenticated
    - expect: The server returns HTTP 404
    - expect: The response body confirms 'No endpoint GET /parabank/closeaccount.htm'
    - expect: No close-account UI is rendered
  3. Navigate to an account detail page such as /parabank/activity.htm?id=12456 and inspect all visible controls
    - expect: The page shows Account Details (number, type, balance, available) and Account Activity filters
    - expect: No 'Close Account' button or link is present anywhere on the page
