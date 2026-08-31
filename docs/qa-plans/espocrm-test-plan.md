# EspoCRM Demo — Test Plan

## Application Overview

Target: https://demo.espocrm.com/ (redirects to https://demo.eu.espocrm.com/) — the public EspoCRM demo instance.

**Access**: There is no password. The login screen shows a "Username" `<select>` combobox (defaults to the only option, "Administrator") and a "Language" `<select>` (defaults to "English (US)"), plus a "Login" button. Authentication is simply: leave defaults, click Login.

**Critical environment constraint — SHARED, MUTABLE DEMO**: The login screen itself states "This is a shared demo, it can be used simultaneously by many people." Many unrelated testers/bots use this instance concurrently. Consequences for every test in this plan:
- Record counts (e.g. "1–12 / 12" in Accounts, "42" total Opportunities) WILL drift between runs and even between steps of the same run. Never assert an exact count as a pass/fail oracle; only assert that a count changed in the expected direction (e.g. "+1 after creating a record") when you control the before/after window tightly, and prefer re-querying by the record's own unique name instead.
- "The first row of the list" is NOT stable — default sort is by creation/modification recency, and other users create records constantly. Never target "row 1" as an oracle; target rows by the exact literal name of a record you created or a long-lived seed record (e.g. "Janeville", an Account that has existed across the whole exploration session).
- Any record you did not create yourself (existing Accounts like Janeville, AFP Supply, Intelacard; existing Leads like Andrew Peterson; existing Opportunities like "Bulk Order #56") should be treated as read-only reference fixtures for oracles (their field values were stable during this exploration) but must not be assumed to exist forever — a screening test should tolerate their absence and fall back to a resilient locator strategy (e.g. searching first).
- The user identity shown once logged in as "Administrator" is literally named "Jack Adams" throughout the UI (avatar name, "Created" / "Modified" byline, Stream entries) — do not assert the username string "Administrator" appears anywhere post-login; it does not.
- Any record created during testing (Accounts, Contacts, Leads) PERSISTS in the shared demo unless explicitly removed. This plan creates two classes of records: (a) clearly-synthetic, intentionally-persistent fixtures named "QA Prueba Inetum" (Account) and "Ana Prueba" / ana.prueba@example.com (Contact), which stay in the shared demo after this plan is executed and are safe to re-detect on subsequent runs; and (b) throwaway records (e.g. a Lead named "QA Temp Delete") that tests create and then remove in the same test to keep the shared demo tidy for the delete-confirmation scenario. Never enter real personal data — only clearly-synthetic strings as shown above.

**Stable vs. unstable oracles — the rule used throughout this plan**:
- STABLE (assert freely): screen titles / breadcrumbs (e.g. "Accounts", " Accounts › create"), column headers (e.g. "Name", "Industry", "Type", "Country"), field labels (e.g. "Name *", "Email", "Phone"), button/menu labels (e.g. "Save", "Cancel", "Remove", "Create Account"), validation/dialog literal text (e.g. "Are you sure you want to remove the record?", "The record you are creating might already exist"), the fixed set of dropdown option values for enumerated fields (Lead Status: New / Assigned / In Process / Converted / Recycled / Dead; Opportunity Stage: Prospecting / Qualification / Proposal / Negotiation / Closed Won), and behavior of controls (e.g. required-field red-highlight on empty Save).
- NOT STABLE (never assert as pass/fail): absolute row counts, absolute pagination totals, "the Nth row", which specific pre-existing records exist, which user is shown as "Assigned User" on shared records, exact "Created"/"Modified" timestamps of records not created by the test.

**Modules explored in the browser**: Accounts, Contacts, Leads, Opportunities (list + Kanban), plus supporting UI: top navigation bar, global "+" quick-create menu, global text search with live dropdown results, user avatar menu (Administration / Preferences / About / Log Out), Home dashboard (Stream / Calendar / My Activities / My Cases dashlets).

**Records created/observed during exploration** (for reproducibility): Account "QA Prueba Inetum" (id ends 2573d1c5f) with related Contact "Ana Prueba" / ana.prueba@example.com; a throwaway Lead "QA Temp Delete" was created and removed to verify the delete-confirmation dialog. No real personal data was used anywhere.

## Test Scenarios

### 1. Authentication

**Seed:** `tests/seed.spec.ts`

#### 1.1. Login as Administrator with no password succeeds and shows the Home dashboard

**File:** `tests/auth/login.spec.ts`

**Steps:**
  1. Navigate to https://demo.espocrm.com/
    - expect: The browser is redirected to https://demo.eu.espocrm.com/
    - expect: Page title is "EspoCRM Demo"
    - expect: The Username combobox is visible with "Administrator" already selected (it is the only option)
    - expect: The Language combobox is visible with "English (US)" already selected
    - expect: A "Login" button is visible
  2. Without changing any field, click the "Login" button
    - expect: The app navigates away from the login screen to the Home dashboard (URL becomes https://demo.eu.espocrm.com/?l=en_US or similar, no #login state)
    - expect: The top navigation bar appears with entity links: Home, Accounts, Contacts, Leads, Opportunities, Emails, Calendar, Meetings, Calls, Tasks, Cases, Knowledge Base, Documents
    - expect: The Home dashboard shows at least the "Stream", "Calendar", "My Activities" and "My Cases" dashlet panels (exact literal headings)
    - expect: Opening the user avatar menu (top-right "..." icon) shows the display name "Jack Adams" at the top, NOT the literal word "Administrator"

#### 1.2. Language selector on the login screen offers multiple options without requiring a password field

**File:** `tests/auth/login-language-selector.spec.ts`

**Steps:**
  1. Navigate to https://demo.eu.espocrm.com/ (fresh/unauthenticated state)
    - expect: No password input field is present anywhere on the login screen
  2. Open the "Language" combobox
    - expect: The dropdown lists many language options including literal entries "English (US)", "English (UK)", "Spanish (Mexico)", "Spanish (Spain)", "German", "French (France)", "Japanese", "Simplified Chinese (China)" among others
  3. Leave selection as "English (US)" and click "Login"
    - expect: Login succeeds and the UI renders in English, confirming the language selector does not block login when left at default

### 2. Global Navigation and Search

**Seed:** `tests/seed.spec.ts`

#### 2.1. Main navigation bar links route to the correct module list views

**File:** `tests/navigation/main-nav.spec.ts`

**Steps:**
  1. Log in as Administrator
    - expect: Home dashboard is shown
  2. Click the "Accounts" nav link
    - expect: URL becomes https://demo.eu.espocrm.com/#Account
    - expect: Page title is "Accounts"
    - expect: Heading " Accounts" is shown with a "+ Create Account" button
  3. Click the "Contacts" nav link
    - expect: URL becomes .../#Contact
    - expect: Page title is "Contacts"
    - expect: A "+ Create Contact" button is shown
  4. Click the "Leads" nav link
    - expect: URL becomes .../#Lead
    - expect: Page title is "Leads"
    - expect: A "+ Create Lead" button is shown
  5. Click the "Opportunities" nav link
    - expect: URL becomes .../#Opportunity
    - expect: Page title is "Opportunities"
    - expect: The view defaults to a Kanban board with columns "Prospecting", "Qualification", "Proposal", "Negotiation", "Closed Won" (stable column labels; card contents inside are NOT stable)

#### 2.2. Global '+' quick-create menu lists all creatable entity types

**File:** `tests/navigation/global-create-menu.spec.ts`

**Steps:**
  1. From any screen, click the "+" icon button in the top-right toolbar (next to the global search box)
    - expect: A menu opens with a header item "Create" followed by, in order: "Account", "Contact", "Lead", "Opportunity", "Meeting", "Call", "Task", "Case", "Email", "Project Task" (all literal labels)
  2. Click "Contact" in the menu
    - expect: Navigates to .../#Contact/create and shows the Create Contact full-page form
  3. Press Escape or click elsewhere to close the menu without selecting anything, when reopened
    - expect: The menu closes without navigating away from the current page

#### 2.3. User avatar menu exposes Administration, Preferences, About and Log Out

**File:** `tests/navigation/user-menu.spec.ts`

**Steps:**
  1. Click the "..." (three-dot) avatar/menu icon at the far right of the top toolbar
    - expect: A dropdown opens showing the current user's display name "Jack Adams" at the top
    - expect: Below it: "Administration" and "Preferences" links, then "About" and "Log Out" links (literal labels, in this grouping)
  2. Click elsewhere to close the menu without navigating
    - expect: The menu closes and the current page/URL is unchanged

#### 2.4. Global text search returns grouped results by entity type and navigates to the record

**File:** `tests/navigation/global-search.spec.ts`

**Steps:**
  1. Type "Janeville" into the global "Search" box in the top toolbar and press Enter
    - expect: A "Global Search" results dropdown appears beneath the search box
    - expect: Results are grouped with an entity-type label (e.g. literal group label "Account") followed by a clickable record name link ("Janeville")
    - expect: Additional matching records from other entity types (e.g. a "Lead" group) may appear below — this grouping/labeling behavior is stable, the specific extra matches are NOT (depend on shared data)
  2. Click the "Janeville" result link under the "Account" group
    - expect: Navigates to the Account detail view for Janeville (URL .../#Account/view/<id>)
    - expect: The detail heading breadcrumb reads " Accounts › Janeville"

### 3. Accounts Module

**Seed:** `tests/seed.spec.ts`

#### 3.1. Accounts list view shows expected columns, toolbar and filter options

**File:** `tests/accounts/list-view.spec.ts`

**Steps:**
  1. Navigate to .../#Account
    - expect: Heading " Accounts" and a "+ Create Account" link/button are visible
    - expect: The list toolbar shows a filter dropdown button labeled "All", a text search box, and two icon buttons
    - expect: The table header row shows exactly these column headers, in order: a checkbox/select-all column, "Name", "Industry", "Type", "Country", plus a trailing actions column
    - expect: A pagination control shows the format "<start>–<end> / <total>" (the numbers themselves are NOT a stable oracle in a shared demo) with previous/next arrow buttons
  2. Click the "All" filter dropdown button
    - expect: A menu opens with, in order: " All", "Starred", "Recently Created", then a checkbox item "Only My" and a checkbox item "Followed" (all literal labels)
  3. Click each column header button ("Name", "Industry", "Type", "Country") in turn
    - expect: Clicking a header re-sorts the list by that column; the clicked header becomes underlined/marked as the active sort column (verified for "Name": rows re-order alphabetically, e.g. "AFP Supply" appears before "EasyReservations" before "Janeville")

#### 3.2. Accounts text search filters the list by name and updates the result count

**File:** `tests/accounts/text-search.spec.ts`

**Steps:**
  1. Navigate to .../#Account. Note the current pagination total shown (e.g. "1–12 / 12")
    - expect: Baseline list is showing (do not hard-code the number itself as an oracle)
  2. Type "Janeville" into the list search box and press Enter (or click the magnifier icon)
    - expect: The list re-renders to show only the row(s) whose Name matches "Janeville"
    - expect: Pagination control updates to "1–1 / 1"
    - expect: The single visible row's Name cell is a link with exact text "Janeville", Industry "Electronics", Type "Customer", Country "France"
  3. Clear the search box and press Enter
    - expect: The list returns to showing all Accounts (pagination total reverts upward)

#### 3.3. Account detail view shows all expected panels, tabs and related lists

**File:** `tests/accounts/detail-view.spec.ts`

**Steps:**
  1. Navigate to the "Janeville" Account detail view (via search or direct link from the Accounts list)
    - expect: Breadcrumb heading reads " Accounts › Janeville"
    - expect: Top-right shows a "Star"/"Starred" toggle button and a "Follow"/"Followed" toggle button
    - expect: An "Edit" button and a "..." actions dropdown are shown
  2. Inspect the main panel fields
    - expect: Left column shows label/value pairs: "Name" = Janeville, "Website" (a clickable link), "Email", "Phone" (with an "Office" phone-type badge), "Billing Address", "Shipping Address"
    - expect: A "Details" sub-panel shows "Type", "Industry", "Description" labels
  3. Inspect the tab strip below the main panel
    - expect: Tabs are shown including literal labels "Account", "Stream", and "Sales" (a "Support" tab may also appear when the account has related Cases — presence of "Support" is data-dependent, not guaranteed for every account)
  4. Scroll to the related-record panels under the "Account" tab
    - expect: A "Contacts" panel is shown with a "+" (create) button, a table with column headers "Name", "Title", "Email"
    - expect: An "Opportunities" panel is shown with a "+" button and column headers "Name", "Stage", "Close Date", "Amount"
    - expect: A "Documents" panel is shown (may read "No Data")
  5. Inspect the right sidebar
    - expect: Sidebar shows "Assigned User", "Teams", "Created" (with a timestamp and the creator's display name as a link), "Modified", "Followers", followed by "Activities" and "History" panels with their own "+"/icon toolbars, and a "Tasks" panel

#### 3.4. Create Account: saving with the required Name field empty is blocked with an inline red highlight (no popup text)

**File:** `tests/accounts/create-required-name.spec.ts`

**Steps:**
  1. Navigate to .../#Account/create
    - expect: Breadcrumb heading reads " Accounts › create"
    - expect: The Name field's label reads exactly "Name *" (asterisk denotes required)
    - expect: "Save" and "Cancel" buttons are visible, Name field is empty
  2. Without typing anything, click "Save"
    - expect: The record is NOT created (URL stays at .../#Account/create)
    - expect: The "Name *" label text turns red and the Name input's border turns red
    - expect: No separate toast/banner error message is shown elsewhere on the page — the red highlight on the field itself is the only validation signal (this exact literal-vs-visual behavior is the oracle: verify there is no dismissible "error" toast, only the field-level red state)

#### 3.5. Create Account: an invalid Email format is also flagged in red at Save time

**File:** `tests/accounts/create-invalid-email.spec.ts`

**Steps:**
  1. Navigate to .../#Account/create and type "not-an-email" into the Email field, leaving Name empty
    - expect: Both fields still show their normal (non-error) state before Save is clicked
  2. Click "Save"
    - expect: Record is not created
    - expect: The "Name *" label and its input both turn red (still empty/required)
    - expect: The "Email" label and its input ALSO turn red simultaneously, with the invalid text "not-an-email" still present in the field
    - expect: Both invalid fields are highlighted at once in the same Save attempt (not one-at-a-time)

#### 3.6. Create Account: happy path with only the required Name field succeeds and defaults all optional fields to 'None'

**File:** `tests/accounts/create-happy-path.spec.ts`

**Steps:**
  1. Navigate to .../#Account/create and type the synthetic name "QA Prueba Inetum" into the Name field (do not fill any other field)
    - expect: Name field shows "QA Prueba Inetum" with no red state
  2. Click "Save"
    - expect: Navigates to the new Account's detail view (URL .../#Account/view/<new-id>)
    - expect: Page title becomes "QA Prueba Inetum"
    - expect: Breadcrumb heading reads " Accounts › QA Prueba Inetum"
    - expect: All unfilled optional fields (Website, Email, Phone, Billing Address, Shipping Address, Type, Industry, Description, Assigned User, Teams) literally display the text "None"
    - expect: The "Created" sidebar field shows a "Today" timestamp and the creator display name "Jack Adams"
  3. Navigate back to .../#Account list
    - expect: "QA Prueba Inetum" now appears in the Accounts list (its exact name is a stable, searchable oracle even though its position in the list and the total count are not) — NOTE: this record intentionally persists in the shared demo after this test; do not delete it, later tests reuse it

#### 3.7. Create Account: entering a name that duplicates an existing Account shows a non-blocking duplicate warning

**File:** `tests/accounts/create-duplicate-warning.spec.ts`

**Steps:**
  1. Navigate to .../#Account/create and type "Janeville" into the Name field (an existing Account's exact name)
    - expect: No error is shown yet — the check happens on Save
  2. Click "Save"
    - expect: A modal dialog opens with heading text exactly "The record you are creating might already exist"
    - expect: The dialog contains a mini-table with column headers "Name" and "Country" listing the conflicting existing record(s) (e.g. "Janeville" / "France")
    - expect: The dialog offers two buttons: "Create" (to proceed anyway) and "Cancel"
    - expect: The underlying create form is NOT submitted while this dialog is open (this is a soft warning, not a hard validation block)
  3. Click "Cancel" in the duplicate-warning dialog
    - expect: The dialog closes and the create form remains open with "Janeville" still in the Name field, unsaved
  4. Click the form-level "Cancel" button (not the dialog's)
    - expect: Navigates away to the Accounts list without creating any new record

#### 3.8. Edit Account: form is pre-filled with current values, mirrors the Create form layout, and Cancel discards no persisted changes

**File:** `tests/accounts/edit-cancel.spec.ts`

**Steps:**
  1. From the Janeville Account detail view, click "Edit"
    - expect: Navigates to .../#Account/edit/<id>
    - expect: Breadcrumb heading reads " Accounts › Janeville"
    - expect: All fields are pre-filled with the record's current values (Name="Janeville", Website="www.janeville.co.fr", Email="janeville@mail.com", Phone Office="+12345645989", Billing City="Paris", Billing Country="France", Type="Customer", Industry="Electronics", Assigned User="Jack Adams", Teams="Sales")
    - expect: A "Copy Billing" button is present next to the Shipping Address fields (present in Edit; behavior of copying billing into shipping fields is a candidate for a separate functional test)
  2. Without changing any field, click "Cancel"
    - expect: Navigates back to the Account detail view (.../#Account/view/<id>) without any save request, all field values on the detail view remain identical to before

#### 3.9. Quick-create modal: adding a related Contact from an Account's Contacts panel

**File:** `tests/accounts/quick-create-contact-modal.spec.ts`

**Steps:**
  1. Open the "QA Prueba Inetum" Account detail view and click the "+" icon on its "Contacts" related panel
    - expect: A modal dialog opens with header text " Create Contact" and a close ("×") icon
    - expect: The modal footer shows three buttons: "Save", "Full Form", "Cancel"
    - expect: The Name field is split into "First Name" and "Last Name" text boxes under a shared "Name *" label
    - expect: An "Accounts" field is pre-filled/pre-linked showing "QA Prueba Inetum" as a tag, confirming the new Contact will be related to the account you launched the modal from
  2. Type "Ana" into First Name, "Prueba" into Last Name, and "ana.prueba@example.com" into Email, then click "Save"
    - expect: The modal closes
    - expect: The Account detail view's "Contacts" related panel now lists a row "Ana Prueba" with Email "ana.prueba@example.com" (no Title)
    - expect: NOTE: this Contact record intentionally persists in the shared demo — synthetic data only, no real personal data used
  3. Navigate to the Contacts list (.../#Contact)
    - expect: A row for "Ana Prueba" is present with Account column showing a link to "QA Prueba Inetum" and Email "ana.prueba@example.com" (its exact name is the stable oracle; its position in the list is not)

#### 3.10. Delete confirmation dialog: literal wording, destructive-styled button, and Cancel path

**File:** `tests/accounts/delete-confirmation-via-lead.spec.ts`

**Steps:**
  1. Create a throwaway Lead with Last Name "QA Temp Delete" (see Leads suite for full create steps) purely to exercise this dialog without touching any shared record
    - expect: The new Lead's detail view opens, title "QA Temp Delete"
  2. Open the "..." actions dropdown next to the "Edit" button, then click "Remove"
    - expect: The dropdown menu items include, in order: "Remove", "Duplicate", "Self-Assign", then "View Personal Data", "View Followers", "View Audit Log", "View User Access", then "Convert Currency" (literal labels, observed on a Lead; Account/Contact detail views expose an analogous but not necessarily identical action set — verify per entity type if asserting this list elsewhere)
    - expect: Clicking "Remove" opens a centered modal dialog over a dimmed background with the exact text "Are you sure you want to remove the record?"
    - expect: The dialog shows a red/destructive-styled "Remove" button on the left and a neutral "Cancel" button on the right
  3. Click "Cancel" in the confirmation dialog
    - expect: The dialog closes, the record is NOT removed, and the detail view is unchanged
  4. Repeat: open "..." → "Remove", then click the red "Remove" button in the confirmation dialog
    - expect: The dialog closes and the app navigates to the Leads list view (.../#Lead)
    - expect: The "QA Temp Delete" Lead no longer appears when searching the Leads list by that name (list is now clean again for the shared demo)

### 4. Contacts Module

**Seed:** `tests/seed.spec.ts`

#### 4.1. Contacts list view shows expected columns and reflects newly created contacts

**File:** `tests/contacts/list-view.spec.ts`

**Steps:**
  1. Navigate to .../#Contact
    - expect: Heading " Contacts" and a "+ Create Contact" button are visible
    - expect: Table column headers read exactly, in order: checkbox column, "Name", "Account", "Email", "Phone", plus trailing actions column
    - expect: Pagination control shows "1–20" style range (Contacts list may omit the "/ total" suffix seen on Accounts/Opportunities — this presentation difference between modules is itself worth re-verifying, not assumed identical across all list views) with a "Show more" button beneath the table
  2. Locate the row for "Ana Prueba" (created in the Accounts suite)
    - expect: Row shows Name "Ana Prueba" as a link, Account column links to "QA Prueba Inetum", Email "ana.prueba@example.com", Phone column empty (no phone was entered)

### 5. Leads Module

**Seed:** `tests/seed.spec.ts`

#### 5.1. Leads list view shows expected columns and the fixed set of Status values

**File:** `tests/leads/list-view.spec.ts`

**Steps:**
  1. Navigate to .../#Lead
    - expect: Heading " Leads" and "+ Create Lead" button visible
    - expect: Table column headers read exactly: checkbox column, "Name", "Status", "Email", "Phone", "Assigned User", plus trailing actions column
  2. Scan the Status column values across the visible rows
    - expect: Every value belongs to the fixed enumeration: "New", "Assigned", "In Process", "Converted", "Recycled", "Dead" (these six literal labels are the stable oracle; which specific leads hold which status is not stable)
  3. Open the row-level actions dropdown (rightmost icon) for any Lead row
    - expect: A menu opens with exactly three items: "View", "Edit", "Remove" (literal labels) — this is the compact list-row menu, distinct from the richer detail-view "..." menu

#### 5.2. Create Lead: required Name field validation and successful creation with default Status

**File:** `tests/leads/create-and-validate.spec.ts`

**Steps:**
  1. Navigate to .../#Lead/create
    - expect: Breadcrumb heading reads " Leads › create"
    - expect: "Name *" label with separate "First Name" / "Last Name" boxes
    - expect: The "Status" field in the Details panel is pre-populated with "New" by default before any input
  2. Click "Save" with both First Name and Last Name empty
    - expect: Record is not created; the Name field/label is highlighted red, same pattern as Accounts
  3. Type "QA Temp Delete" into Last Name and click "Save"
    - expect: Navigates to the new Lead's detail view, title "QA Temp Delete"
    - expect: "Status" detail shows "New"
    - expect: The detail view header shows a "Follow" button AND a distinct "Convert" button — this "Convert" action is unique to Leads and not present on Accounts/Contacts/Opportunities detail views

#### 5.3. Lead Convert screen: entity checkboxes and Cancel path (does not execute an actual conversion)

**File:** `tests/leads/convert-screen.spec.ts`

**Steps:**
  1. Open an existing Lead's detail view and click the "Convert" button
    - expect: Navigates to .../#Lead/convert/id=<id>
    - expect: Breadcrumb heading reads " Leads › <Lead Name> › convert"
    - expect: Three checkboxes are shown, unchecked by default, labeled exactly "Account", "Contact", "Opportunity"
    - expect: "Convert" and "Cancel" buttons are shown at the bottom
  2. Click "Cancel" without checking any box
    - expect: Navigates back to the Lead's detail view; the Lead's Status is unchanged (still not "Converted"), and no new Account/Contact/Opportunity records are created
    - expect: CAUTION for future test authors: actually completing a Convert on a shared record is irreversible-in-effect (creates permanent Account/Contact/Opportunity records and flips Status to "Converted") — only ever execute a full Convert against a Lead you created yourself as disposable test data, never against a pre-existing shared Lead

### 6. Opportunities Module

**Seed:** `tests/seed.spec.ts`

#### 6.1. Opportunities defaults to a Kanban board grouped by Stage, with a List view toggle

**File:** `tests/opportunities/kanban-and-list-toggle.spec.ts`

**Steps:**
  1. Navigate to .../#Opportunity
    - expect: The view renders as a Kanban board (not a table) by default
    - expect: Column headers read, in order: "Prospecting", "Qualification", "Proposal", "Negotiation", "Closed Won" (each with a small "+" quick-add affordance)
    - expect: Each card in a column shows the Opportunity name (link), its Amount (currency-formatted, e.g. "€2,250.00"), the related Account name (link), and a relative/short date (e.g. "29 Aug", "Today")
    - expect: A numeric badge near the toolbar shows a running total of Opportunities (NOT a stable oracle — value drifts with shared usage)
  2. Click the List-view toggle icon in the top-right of the Opportunities toolbar
    - expect: The view switches to a standard table
    - expect: Column headers read exactly: checkbox column, "Name", "Account", "Stage", "Assigned User", "Close Date", "Amount", plus trailing actions column
    - expect: Pagination shows "1–20 / <total>" format with a "Show more" button revealing the remaining count (e.g. a button literally labeled with a number and the text "Show more")
    - expect: Stage column values belong to the fixed enumeration matching the Kanban columns plus "Closed Won" appears as a plain-text badge; a "Closed Lost" stage should be checked for in a full run even though it was not observed in the sampled data window
