# ParaBank Happy-Path Plan — Login + Transfer Funds

## Application Overview

ParaBank (https://parabank.parasoft.com/parabank/index.htm) is a Parasoft demo banking application used for test automation practice. It exposes a session-based Java web app with server-side rendering. This plan covers two flows only: (1) login and (2) transfer funds. Scope is happy-path acotado — objetivo principal: cazar la categoría auth-handler (login persistente / reutilización de sesión via storageState o encadenamiento explícito login→transfer).

Key structural facts observed during recon:
- Login form: index.htm — inputs name=username / name=password, submit input[value="Log In"]. Successful login redirects to overview.htm.
- Authenticated sidebar shows "Welcome John Smith" and the Account Services nav.
- transfer.htm is protected: redirects to login if no session. Must be reached after login.
- transfer.htm form: Amount textbox, "From account #" combobox (options: 13344, 15564), "to account #" combobox (options: 13344, 15564), Transfer button. Both comboboxes default to 13344.
- Confirmation after transfer: "Transfer Complete!" heading appears on the same page with the amount echoed back.
- ParaBank is a shared demo environment. Balance values change across runs. No assertions on exact balance amounts — assert only "Transfer Complete!" and the transferred amount.

Auth-handler strategy: login is a prerequisite for transfer-funds. Preferred pattern is Playwright storageState saved after login and reused in transfer test via use: { storageState }. If storageState is not wired in the project config, document the explicit login→transfer chain as a single test fixture setup step before the transfer assertions.

## Test Scenarios

### 1. Login

**Seed:** `tests/parabank/login.spec.ts`

#### 1.1. Happy path — valid credentials log in and land on Accounts Overview

**File:** `tests/parabank/login.spec.ts`

**Steps:**
  1. Start from a fresh browser context with no active session. Navigate to https://parabank.parasoft.com/parabank/index.htm
    - expect: Page title is 'ParaBank | Welcome | Online Banking'
    - expect: Customer Login form is visible with Username and Password fields and a Log In button
  2. Locate the Username input (name='username') and fill in the value 'john'
    - expect: Input accepts the value without error
  3. Locate the Password input (name='password') and fill in the value 'demo'
    - expect: Input accepts the value without masking errors
  4. Click the Log In submit button (input[value='Log In'])
    - expect: Browser redirects to /parabank/overview.htm
    - expect: Page title changes to 'ParaBank | Accounts Overview'
  5. Assert the authenticated welcome message is present in the left sidebar
    - expect: Text 'Welcome John Smith' is visible on the page
  6. Assert the Account Services navigation is present in the left sidebar
    - expect: 'Transfer Funds' link pointing to transfer.htm is visible in the Account Services list
    - expect: 'Log Out' link pointing to logout.htm is visible
  7. Assert the accounts table is rendered in the main content area
    - expect: Account number 13344 is listed in the Accounts Overview table
    - expect: Account number 15564 is listed in the Accounts Overview table
    - expect: No assertion on exact balance values — table structure present is sufficient
  8. [Auth-handler] After login completes, save browser storageState (cookies + localStorage) to a file e.g. playwright/.auth/john.json using page.context().storageState(). This file will be consumed by the transfer-funds suite via use: { storageState: 'playwright/.auth/john.json' } in the project config.
    - expect: storageState file is written to disk and is non-empty
    - expect: If storageState save is not available in the current project plumbing, document this step as a manual note and proceed to chain login directly into the transfer test via a shared fixture

#### 1.2. Negative — wrong password shows error, no redirect

**File:** `tests/parabank/login.spec.ts`

**Steps:**
  1. Navigate to https://parabank.parasoft.com/parabank/index.htm with no active session
    - expect: Login form is visible
  2. Fill username 'john' and password 'wrongpassword', then click Log In
    - expect: Page does NOT redirect to overview.htm
    - expect: An error message is displayed — typically 'The username and password could not be verified' or equivalent
    - expect: The URL remains on index.htm or an error page, not overview.htm

#### 1.3. Negative — empty credentials submit shows validation

**File:** `tests/parabank/login.spec.ts`

**Steps:**
  1. Navigate to https://parabank.parasoft.com/parabank/index.htm with no active session
    - expect: Login form is visible
  2. Leave both Username and Password fields empty and click Log In
    - expect: Page does NOT redirect to overview.htm
    - expect: A validation error message is displayed (e.g. 'Please enter a username and password' or field-level HTML5 required constraint)
    - expect: The user remains on the login page

### 2. Transfer Funds

**Seed:** `tests/parabank/transfer-funds.spec.ts`

#### 2.1. Happy path — transfer a fixed amount between accounts and confirm completion

**File:** `tests/parabank/transfer-funds.spec.ts`

**Steps:**
  1. [Auth-handler prerequisite] Reuse the storageState saved by the login suite (playwright/.auth/john.json) via use: { storageState } in the Playwright project config. If storageState is not wired, execute an explicit login step first: navigate to index.htm, fill username='john' / password='demo', click Log In, and wait for overview.htm before continuing. This step is the auth-handler gate — the rest of the test assumes an active authenticated session.
    - expect: Session is active — 'Welcome John Smith' is accessible if overview.htm is loaded
  2. Navigate directly to https://parabank.parasoft.com/parabank/transfer.htm
    - expect: Page title is 'ParaBank | Transfer Funds'
    - expect: Transfer Funds heading (h1) is visible
    - expect: Page is NOT redirected back to index.htm (which would indicate the session was not reused correctly)
  3. Locate the Amount textbox and fill in '10.00'
    - expect: Textbox accepts the numeric value
  4. Locate the 'From account #' combobox and select account 13344
    - expect: Option 13344 is selected in the From combobox
  5. Locate the 'to account #' combobox and select account 15564
    - expect: Option 15564 is selected in the To combobox
  6. Click the Transfer button
    - expect: Page updates with a confirmation section
    - expect: Text 'Transfer Complete!' is visible on the page
    - expect: The transferred amount '10.00' is echoed back in the confirmation text (e.g. '$10.00 has been transferred from account #13344 to account #15564')
    - expect: No assertion on account balances — shared environment, balance changes across runs

#### 2.2. Auth-handler guard — unauthenticated direct access to transfer.htm redirects to login

**File:** `tests/parabank/transfer-funds.spec.ts`

**Steps:**
  1. Start with a fresh browser context with NO active session (no storageState loaded). Navigate directly to https://parabank.parasoft.com/parabank/transfer.htm
    - expect: Page redirects away from transfer.htm — either to index.htm (login form) or to an error/unauthorized page
    - expect: The Transfer Funds form (Amount textbox) is NOT visible
    - expect: This test confirms the session-protection guard is active and validates why storageState reuse is necessary in the transfer-funds suite

#### 2.3. Negative — submit transfer with empty Amount shows error

**File:** `tests/parabank/transfer-funds.spec.ts`

**Steps:**
  1. [Auth prerequisite] Ensure active session via storageState or explicit login, then navigate to transfer.htm
    - expect: Transfer Funds form is visible
  2. Leave the Amount field empty. Select 13344 from both From and To comboboxes. Click Transfer.
    - expect: Page does NOT show 'Transfer Complete!'
    - expect: An error message is displayed — e.g. 'Please enter a valid amount' or equivalent validation message
    - expect: The form remains visible for correction

#### 2.4. Negative — submit transfer with non-numeric Amount shows error

**File:** `tests/parabank/transfer-funds.spec.ts`

**Steps:**
  1. [Auth prerequisite] Ensure active session via storageState or explicit login, then navigate to transfer.htm
    - expect: Transfer Funds form is visible
  2. Enter 'abc' in the Amount field. Select 13344 in both comboboxes. Click Transfer.
    - expect: Page does NOT show 'Transfer Complete!'
    - expect: An error or validation message is shown indicating the amount is invalid
    - expect: The form remains visible for correction
