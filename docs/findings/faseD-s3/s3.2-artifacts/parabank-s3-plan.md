# ParaBank S3 — FD Flow Mapping Against DOM

## Application Overview

ParaBank (https://parabank.parasoft.com/parabank/index.htm) is a JSP legacy banking demo application by Parasoft. It has no data-testid attributes. All locators are by name, id, label text, role, or button value. The application uses server-side session management via JSESSIONID cookies. Account numbers are dynamic (shared demo environment) and must be read from select option values at runtime, never hardcoded. Balance figures change between runs. This plan maps five FD-declared flows against the real DOM observed in a live session authenticated as user "john".

## Test Scenarios

### 1. login

**Seed:** ``

#### 1.1. Happy path — valid credentials show accounts overview with balances

**File:** `tests/parabank/login.spec.ts`

**Steps:**
  1. Navigate to https://parabank.parasoft.com/parabank/index.htm
    - expect: Page title is 'ParaBank | Welcome | Online Banking'
    - expect: Heading 'Customer Login' is visible in the left panel
  2. Fill input[name='username'] with 'john'
    - expect: Username field accepts the value
  3. Fill input[name='password'] with 'demo'
    - expect: Password field accepts the value
  4. Click input[type='submit'][value='Log In']
    - expect: Browser navigates to /parabank/overview.htm
    - expect: Page title is 'ParaBank | Accounts Overview'
    - expect: Paragraph 'Welcome John Smith' is visible
    - expect: Heading 'Accounts Overview' (h1) is visible
    - expect: A table with columns 'Account', 'Balance*', 'Available Amount' is present
    - expect: At least one row with a linked account number (e.g., link pointing to activity.htm?id=NNNNN) is visible
    - expect: A 'Total' row is present at the bottom of the table
    - expect: Left-panel navigation shows links: 'Accounts Overview', 'Transfer Funds', 'Bill Pay', 'Log Out'

#### 1.2. Negative — invalid credentials show error message

**File:** `tests/parabank/login.spec.ts`

**Steps:**
  1. Navigate to https://parabank.parasoft.com/parabank/index.htm
    - expect: Login form is visible
  2. Fill input[name='username'] with 'john' and input[name='password'] with 'wrongpassword', then click input[type='submit'][value='Log In']
    - expect: Page does not navigate to overview.htm
    - expect: An error message is visible on the page (e.g., text containing 'The username and password could not be verified')

### 2. auth-guard

**Seed:** ``

#### 2.1. Unauthenticated direct access to protected page returns error state

**File:** `tests/parabank/auth-guard.spec.ts`

**Steps:**
  1. In a fresh browser context (no active session / no JSESSIONID cookie), navigate directly to https://parabank.parasoft.com/parabank/overview.htm
    - expect: Page URL remains at /parabank/overview.htm (no redirect to index.htm)
    - expect: Page title is 'ParaBank | Error'
    - expect: Heading 'Error!' (h1) is visible in the main content area
    - expect: Paragraph 'An internal error has occurred and has been logged.' is visible
    - expect: The Customer Login form (input[name='username'], input[name='password']) is still rendered in the left panel

#### 2.2. Unauthenticated direct access to transfer.htm returns error state

**File:** `tests/parabank/auth-guard.spec.ts`

**Steps:**
  1. In a fresh browser context (no active session), navigate directly to https://parabank.parasoft.com/parabank/transfer.htm
    - expect: Page title is 'ParaBank | Error'
    - expect: Heading 'Error!' (h1) is visible
    - expect: Customer Login form is still rendered in the left panel

#### 2.3. Unauthenticated direct access to billpay.htm returns error state

**File:** `tests/parabank/auth-guard.spec.ts`

**Steps:**
  1. In a fresh browser context (no active session), navigate directly to https://parabank.parasoft.com/parabank/billpay.htm
    - expect: Page title is 'ParaBank | Error'
    - expect: Heading 'Error!' (h1) is visible
    - expect: Customer Login form is still rendered in the left panel

### 3. transfer-funds

**Seed:** ``

#### 3.1. Happy path — transfer amount between two own accounts shows confirmation

**File:** `tests/parabank/transfer-funds.spec.ts`

**Steps:**
  1. Authenticate as john/demo (navigate to index.htm, fill credentials, click Log In)
    - expect: Lands on /parabank/overview.htm with 'Welcome John Smith'
  2. Navigate to https://parabank.parasoft.com/parabank/transfer.htm (or click 'Transfer Funds' in the left-panel nav)
    - expect: Page title is 'ParaBank | Transfer Funds'
    - expect: Heading 'Transfer Funds' (h1) is visible
    - expect: Text input with id='amount' is present
    - expect: Select with id='fromAccountId' is present and populated with at least one account option
    - expect: Select with id='toAccountId' is present and populated with at least one account option
    - expect: Submit button input[value='Transfer'] is present
  3. Fill #amount with '10'
    - expect: Amount field shows '10'
  4. Read the first option value from #fromAccountId at runtime and select it as the source account; read a second distinct option value from #toAccountId and select it as the destination account
    - expect: From and To selects show different account numbers selected
  5. Click input[value='Transfer']
    - expect: Page URL stays at /parabank/transfer.htm
    - expect: Heading 'Transfer Complete!' (h1) is visible
    - expect: Confirmation paragraph matches pattern '$10.00 has been transferred from account #NNNNN to account #MMMMM.' where NNNNN and MMMMM are the selected account numbers
    - expect: Text 'See Account Activity for more details.' is visible

#### 3.2. Negative — transfer with empty amount shows validation error

**File:** `tests/parabank/transfer-funds.spec.ts`

**Steps:**
  1. Authenticate, navigate to /parabank/transfer.htm, leave #amount empty, select any two accounts, click input[value='Transfer']
    - expect: Transfer does not complete
    - expect: An error or validation message is visible (exact text to be confirmed against live DOM on first run)

### 4. bill-pay

**Seed:** ``

#### 4.1. Happy path — valid beneficiary data and amount results in Bill Payment Complete

**File:** `tests/parabank/bill-pay.spec.ts`

**Steps:**
  1. Authenticate as john/demo and navigate to /parabank/billpay.htm (or click 'Bill Pay' in the left-panel nav)
    - expect: Page title is 'ParaBank | Bill Pay'
    - expect: Heading 'Bill Payment Service' (h1) is visible
    - expect: Subheading 'Enter payee information' is visible
    - expect: Form fields visible: input[name='payee.name'], input[name='payee.address.street'], input[name='payee.address.city'], input[name='payee.address.state'], input[name='payee.address.zipCode'], input[name='payee.phoneNumber'], input[name='payee.accountNumber'], input[name='verifyAccount'], input[name='amount']
    - expect: Select select[name='fromAccountId'] is present and populated with john's accounts
    - expect: Button input[type='button'][value='Send Payment'] is present
  2. Fill input[name='payee.name'] with 'Test Payee'
    - expect: Field accepts value
  3. Fill input[name='payee.address.street'] with '123 Main St'
    - expect: Field accepts value
  4. Fill input[name='payee.address.city'] with 'Testville'
    - expect: Field accepts value
  5. Fill input[name='payee.address.state'] with 'CA'
    - expect: Field accepts value
  6. Fill input[name='payee.address.zipCode'] with '90210'
    - expect: Field accepts value
  7. Fill input[name='payee.phoneNumber'] with '5551234567'
    - expect: Field accepts value
  8. Fill input[name='payee.accountNumber'] with '99999'
    - expect: Field accepts value
  9. Fill input[name='verifyAccount'] with '99999'
    - expect: Field accepts value — must match payee.accountNumber
  10. Fill input[name='amount'] with '25'
    - expect: Field accepts value
  11. Read the first option value from select[name='fromAccountId'] at runtime and select it as the charge account
    - expect: From account is selected
  12. Click input[type='button'][value='Send Payment']
    - expect: Page URL stays at /parabank/billpay.htm
    - expect: Page title changes to 'ParaBank | Bill Payment Complete'
    - expect: Heading 'Bill Payment Complete' (h1) is visible
    - expect: Confirmation paragraph matches pattern 'Bill Payment to Test Payee in the amount of $25.00 from account NNNNN was successful.' where NNNNN is the selected from-account number
    - expect: Text 'See Account Activity for more details.' is visible

#### 4.2. Negative — mismatched account number and verify account shows validation error

**File:** `tests/parabank/bill-pay.spec.ts`

**Steps:**
  1. Authenticate, navigate to /parabank/billpay.htm, fill all required fields with valid data but set input[name='payee.accountNumber'] to '11111' and input[name='verifyAccount'] to '22222' (mismatched), select a from account, click input[type='button'][value='Send Payment']
    - expect: Payment does not complete
    - expect: A validation error message is visible (exact text to be confirmed against live DOM on first run)

### 5. logout

**Seed:** ``

#### 5.1. Happy path — clicking Log Out clears session and returns to login screen

**File:** `tests/parabank/logout.spec.ts`

**Steps:**
  1. Authenticate as john/demo so that the authenticated navigation menu is visible
    - expect: 'Welcome John Smith' paragraph is visible
    - expect: Left-panel nav link 'Log Out' pointing to logout.htm is visible
  2. Click the 'Log Out' link (href='logout.htm') in the left-panel Account Services navigation
    - expect: Browser navigates to /parabank/index.htm (with optional query string ?ConnType=JDBC — do not assert the query string)
    - expect: Page title is 'ParaBank | Welcome | Online Banking'
    - expect: Heading 'Customer Login' (h2) is visible
    - expect: input[name='username'] and input[name='password'] are visible and empty
    - expect: 'Welcome John Smith' paragraph is no longer present
    - expect: Account Services navigation links (Transfer Funds, Bill Pay, Log Out) are no longer present

#### 5.2. Post-logout — accessing protected page returns Error state

**File:** `tests/parabank/logout.spec.ts`

**Steps:**
  1. Authenticate as john/demo, click 'Log Out', then navigate directly to https://parabank.parasoft.com/parabank/overview.htm
    - expect: Page title is 'ParaBank | Error'
    - expect: Heading 'Error!' (h1) is visible
    - expect: The Customer Login form is rendered in the left panel
    - expect: 'Welcome John Smith' is not present
