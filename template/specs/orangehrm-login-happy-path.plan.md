# OrangeHRM Login and Dashboard — Happy Path (Directed)

## Application Overview

OrangeHRM OS 5.8 demo instance (https://opensource-demo.orangehrmlive.com). Scope limited to two flows: Login (3 scenarios) and Dashboard post-login (5 scenarios). Credentials used throughout: Admin / admin123 (publicly displayed on the login page). The demo environment is shared and periodically reset; scenarios assert structural UI presence only, never exact dynamic data values (employee counts, names, numbers).

## Test Scenarios

### 1. Login

**Seed:** `tests/seed.spec.ts`

#### 1.1. L-01 Successful login with valid credentials redirects to Dashboard

**File:** `template/tests/e2e/login.happy-path.spec.ts`

**Steps:**
  1. Navigate to https://opensource-demo.orangehrmlive.com/web/index.php/auth/login
    - expect: Page URL is /auth/login
    - expect: Heading 'Login' is visible
    - expect: textbox 'Username' and textbox 'Password' are present
    - expect: button 'Login' is present
  2. Fill textbox 'Username' with 'Admin'
  3. Fill textbox 'Password' with 'admin123'
  4. Click button 'Login'
    - expect: Browser navigates to URL containing /web/index.php/dashboard/index
    - expect: Heading 'Dashboard' (level 6) is visible in the top banner
    - expect: Side navigation panel is visible with menu items including 'Admin', 'PIM', 'Leave', 'Time'

#### 1.2. L-02 Login with invalid credentials shows 'Invalid credentials' alert

**File:** `template/tests/e2e/login.happy-path.spec.ts`

**Steps:**
  1. Navigate to https://opensource-demo.orangehrmlive.com/web/index.php/auth/login
    - expect: Page URL is /auth/login
    - expect: Login form is visible
  2. Fill textbox 'Username' with 'wronguser'
  3. Fill textbox 'Password' with 'wrongpass'
  4. Click button 'Login'
    - expect: Page URL remains /auth/login (no redirect)
    - expect: An alert element with the text 'Invalid credentials' is visible on the page
    - expect: The login form fields remain visible and are not cleared of the username value

#### 1.3. L-03 Submitting empty form shows 'Required' validation under both fields

**File:** `template/tests/e2e/login.happy-path.spec.ts`

**Steps:**
  1. Navigate to https://opensource-demo.orangehrmlive.com/web/index.php/auth/login
    - expect: Page URL is /auth/login
    - expect: Login form is visible
    - expect: No validation messages are shown initially
  2. Leave textbox 'Username' empty and leave textbox 'Password' empty
  3. Click button 'Login'
    - expect: Page URL remains /auth/login (no redirect)
    - expect: A span with text 'Required' appears beneath the Username field
    - expect: A span with text 'Required' appears beneath the Password field
    - expect: Both input fields are highlighted with an error state class (oxd-input--error)

### 2. Dashboard

**Seed:** `tests/seed.spec.ts`

#### 2.1. D-01 Post-login URL and Dashboard heading are correct

**File:** `template/tests/e2e/login.happy-path.spec.ts`

**Steps:**
  1. Navigate to /auth/login, fill Username with 'Admin', fill Password with 'admin123', click button 'Login', and wait for navigation to complete
  2. Inspect the current page URL and the top banner heading
    - expect: URL is exactly https://opensource-demo.orangehrmlive.com/web/index.php/dashboard/index
    - expect: A heading element with text 'Dashboard' is present in the top banner (role=banner)
    - expect: Page title is 'OrangeHRM'

#### 2.2. D-02 Dashboard widgets are visible after login

**File:** `template/tests/e2e/login.happy-path.spec.ts`

**Steps:**
  1. Authenticate as Admin / admin123 and land on /dashboard/index
  2. Observe the main content area for dashboard widget panels
    - expect: A widget labelled 'Time at Work' is visible
    - expect: A widget labelled 'My Actions' is visible
    - expect: A widget labelled 'Quick Launch' is visible
    - expect: A widget labelled 'Buzz Latest Posts' is visible
    - expect: A widget labelled 'Employees on Leave Today' is visible
    - expect: A widget labelled 'Employee Distribution by Sub Unit' is visible

#### 2.3. D-03 Side navigation menu and search field are present

**File:** `template/tests/e2e/login.happy-path.spec.ts`

**Steps:**
  1. Authenticate as Admin / admin123 and land on /dashboard/index
  2. Inspect the complementary / sidebar navigation landmark
    - expect: A navigation element with accessible name 'Sidepanel' is present
    - expect: The navigation contains a textbox with accessible name 'Search'
    - expect: The navigation list includes links for 'Admin', 'PIM', 'Leave', 'Time', 'Recruitment', 'My Info', 'Performance', 'Dashboard', 'Directory', 'Maintenance', 'Claim', and 'Buzz'

#### 2.4. D-04 User dropdown in topbar shows username and options

**File:** `template/tests/e2e/login.happy-path.spec.ts`

**Steps:**
  1. Authenticate as Admin / admin123 and land on /dashboard/index
  2. Locate the user identity element in the top banner (role=banner) — it shows a profile picture and a username paragraph
    - expect: A paragraph with the logged-in username text is visible in the banner
    - expect: A profile picture image with alt 'profile picture' is present next to the username
  3. Click the user identity element (the listitem containing the username paragraph) to open the dropdown menu
    - expect: A dropdown menu appears
    - expect: The dropdown contains the item 'About'
    - expect: The dropdown contains the item 'Support'
    - expect: The dropdown contains the item 'Change Password'
    - expect: The dropdown contains the item 'Logout'

#### 2.5. D-05 Quick Launch 'Assign Leave' button navigates to the Assign Leave page

**File:** `template/tests/e2e/login.happy-path.spec.ts`

**Steps:**
  1. Authenticate as Admin / admin123 and land on /dashboard/index
  2. Locate the 'Quick Launch' widget and click the button labelled 'Assign Leave'
    - expect: The 'Assign Leave' button is present within the Quick Launch widget
  3. Wait for navigation to complete after clicking 'Assign Leave'
    - expect: URL changes to a path containing /leave/assignLeave
    - expect: The previous dashboard URL /dashboard/index is no longer the current URL
    - expect: The page loads without a JavaScript error in the console
