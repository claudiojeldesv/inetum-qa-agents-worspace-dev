# Restful Booker Platform (automationintesting.online) — Regression Test Plan

## Application Overview

Target: https://automationintesting.online/ — "Shady Meadows B&B", the Restful Booker Platform (v2.2) public sandbox by Mark Winteringham. Authorized on the project's compliance allowlist for QA automation practice (authorized 2026-08-30).

Scope covers both faces of the app:
- PUBLIC: home page (hero, "Check Availability & Book Your Stay" widget), the three seeded rooms (Single £100 / Double £150 / Suite £225), the full room reservation flow (room detail page → Price Summary → Reserve Now → guest form Firstname/Lastname/Email/Phone → "Booking Confirmed"), and the "Send Us a Message" contact form (Name/Email/Phone/Subject/Message → confirmation) including its field-level validation.
- ADMIN (/admin, credentials admin/password): Rooms list and room-creation form, room detail/edit view, Messages inbox (unread badge + modal), Report calendar page, and Branding page.

IMPORTANT — environment notes (verified live on 2026-08-30, must be re-validated if they drift):
1. This is a SHARED public sandbox. Other testers/automation constantly create bookings, messages and rooms. The homepage's default Check-in/Check-out dates (today/tomorrow) and any previously-used dates are frequently already booked by third parties. Tests that create a booking MUST pick a check-in/check-out pair that is unlikely to already be taken (e.g. a date at least 3-4 weeks out, not "today"), and must not assume the Messages/Report data set is empty — always assert by matching the specific record just created (by its distinctive synthetic name/subject), never by exact total counts.
2. CONFIRMED DEFECT-LIKE BEHAVIOR: submitting a booking for a room+date range that is already booked (double-booking) does NOT show a graceful in-page error. The API returns HTTP 409 and the SPA crashes to a generic Next.js error screen: heading "This page couldn't load", text "Reload to try again, or go back.", buttons "Reload" and "Back". Tests must treat "no 'Booking Confirmed' screen appears" as the pass condition for the negative case, and should record whether the crash screen is still produced (regression signal) or whether it has been replaced by a friendlier message (product improvement, not a failure).
3. A successful public booking on any room automatically creates a message in the admin Messages inbox with Name = guest's "Firstname Lastname", Subject = exact literal "You have a new booking!", and body "You have a new booking from <Firstname> <Lastname>. They have booked a room for the following dates: <YYYY-MM-DD> to <YYYY-MM-DD>". This was verified end-to-end during exploration and is the basis of the cross-flow regression scenario.
4. Room creation in Admin has no dedicated "Room #" input; the first text field (labelled only via placeholder-less input, testid "roomName") accepts a free-text room identifier which is then displayed as "Room #" in the list. Use a distinctive synthetic value (not a low round number) to avoid colliding with rooms created by other testers.
5. Synthetic guest/contact data used throughout: Firstname "Ana", Lastname "Prueba" (or full name "Ana Prueba" for the contact form), email "ana.prueba@example.com", phone "01234567890" (11 digits — the minimum accepted length). No real PII is used.

## Test Scenarios

### 1. Public site — Home, availability and rooms

**Seed:** ``

#### 1.1. TC-01 Home page renders hero, availability widget and the three seeded rooms with correct prices

**File:** `tests/public/home-page.spec.ts`

**Steps:**
  1. Navigate to https://automationintesting.online/ (fresh/blank browser state, no login).
    - expect: Page title is 'Restful-booker-platform demo'.
    - expect: Heading level 1 'Welcome to Shady Meadows B&B' is visible.
    - expect: A 'Book Now' link pointing to '#booking' is visible.
  2. Scroll to / locate the 'Check Availability & Book Your Stay' section.
    - expect: Heading level 3 'Check Availability & Book Your Stay' is visible.
    - expect: A 'Check In' labeled date textbox and a 'Check Out' labeled date textbox are visible, each pre-filled with a date (default today/tomorrow).
    - expect: A 'Check Availability' button is visible.
  3. Scroll to the 'Our Rooms' section and inspect the three room cards in order.
    - expect: Heading level 2 'Our Rooms' is visible with subtext 'Comfortable beds and delightful breakfast from locally sourced ingredients'.
    - expect: Card 1: heading 'Single', price text '£100 per night', a 'Book now' link to '/reservation/1?checkin=...&checkout=...'.
    - expect: Card 2: heading 'Double', price text '£150 per night', a 'Book now' link to '/reservation/2?checkin=...&checkout=...'.
    - expect: Card 3: heading 'Suite', price text '£225 per night', a 'Book now' link to '/reservation/3?checkin=...&checkout=...'.

#### 1.2. TC-02 Check Availability query filters the room list for the selected dates

**File:** `tests/public/check-availability.spec.ts`

**Steps:**
  1. Navigate to https://automationintesting.online/. Note the full set of room names shown in 'Our Rooms' before querying (call this baseline set).
    - expect: Baseline room list is captured (e.g. Single, Double, Suite, plus any admin-created rooms currently available for the default dates).
  2. Change the 'Check In' field to a date in the current default range and 'Check Out' to the next day (or leave the pre-filled defaults), then click 'Check Availability'.
    - expect: The request completes without a page crash.
    - expect: The 'Our Rooms' list re-renders showing only rooms that report as available for that exact date range — a room known to be booked for those dates (verifiable beforehand via the Admin Report calendar, see TC-12) must NOT appear in the filtered list, while unbooked rooms remain listed with their correct name and price.
  3. Change 'Check In'/'Check Out' to a date range at least 60 days in the future with no existing bookings, click 'Check Availability' again.
    - expect: All currently active rooms (Single £100, Double £150, Suite £225, and any others created via Admin) appear in the list, since none of them have a reservation on that far-future date range.

### 2. Public site — Room reservation flow

**Seed:** ``

#### 2.1. TC-03 End-to-end: successful reservation of the Single room (happy path)

**File:** `tests/public/reservation-happy-path.spec.ts`

**Steps:**
  1. Navigate directly to '/reservation/1?checkin=<CI>&checkout=<CO>' where <CI>/<CO> is a not-yet-booked one-night range at least 3-4 weeks in the future (e.g. verify via Admin Report first that the date is free for room 101).
    - expect: Heading level 1 'Single Room' is visible.
    - expect: Breadcrumb shows 'Home / Rooms / Single Room'.
    - expect: 'Book This Room' panel shows '£100' / 'per night'.
    - expect: 'Price Summary' shows '£100 x 1 nights' = '£100', 'Cleaning fee' = '£25', 'Service fee' = '£15', 'Total' = '£140'.
    - expect: A 'Reserve Now' button is visible.
  2. Click 'Reserve Now'.
    - expect: The panel now shows four textboxes labelled 'Firstname', 'Lastname', 'Email', 'Phone', plus the same Price Summary, and both 'Reserve Now' and 'Cancel' buttons.
  3. Fill Firstname='Ana', Lastname='Prueba', Email='ana.prueba@example.com', Phone='01234567890', then click 'Reserve Now'.
    - expect: The booking succeeds (no crash/error screen).
    - expect: Heading level 2 'Booking Confirmed' is visible.
    - expect: Paragraph 'Your booking has been confirmed for the following dates:' is visible.
    - expect: A bold/strong line shows exactly '<CI> - <CO>' in YYYY-MM-DD format matching the dates used.
    - expect: A 'Return home' link to '/' is visible.

#### 2.2. TC-04 Negative: booking the same room and dates a second time is rejected

**File:** `tests/public/reservation-double-booking.spec.ts`

**Steps:**
  1. Using the SAME room and SAME date range just confirmed in TC-03, navigate again to '/reservation/1?checkin=<CI>&checkout=<CO>'.
    - expect: The room page loads normally showing the calendar and Price Summary again (the UI does not visibly grey out or disable the already-booked dates in the calendar widget).
  2. Click 'Reserve Now', fill the same or different synthetic guest data (Firstname='Ana', Lastname='Prueba', Email='ana.prueba@example.com', Phone='01234567890'), and click 'Reserve Now' again to submit.
    - expect: The booking is NOT accepted: the 'Booking Confirmed' heading must NOT appear.
    - expect: CURRENTLY OBSERVED (regression baseline, re-verify on each run): the underlying API call to '/api/booking' responds HTTP 409 and the single-page app crashes to a generic error screen — heading 'This page couldn't load', text 'Reload to try again, or go back.', with 'Reload' and 'Back' buttons. If instead a graceful inline validation/error message is now shown without a full page crash, treat that as a product improvement and update this test's expectation — but the booking must still not be confirmed.

### 3. Public site — Contact form

**Seed:** ``

#### 3.1. TC-05 Contact form: submitting completely empty shows all field validation messages

**File:** `tests/public/contact-empty-validation.spec.ts`

**Steps:**
  1. Navigate to https://automationintesting.online/#contact (fresh page load so all contact fields are empty). Locate the 'Send Us a Message' form (textboxes 'Name', 'Email', 'Phone', 'Subject', and the unlabeled Message textbox, plus 'Submit' button).
    - expect: Heading level 3 'Send Us a Message' is visible and all five fields are empty.
  2. Click 'Submit' without filling any field.
    - expect: The form does not submit successfully (no 'Thanks for getting in touch' confirmation appears).
    - expect: The following exact validation messages are all visible somewhere below the form: 'Name may not be blank', 'Email may not be blank', 'Phone may not be blank', 'Phone must be between 11 and 21 characters.', 'Subject may not be blank', 'Subject must be between 5 and 100 characters.', 'Message may not be blank', 'Message must be between 20 and 2000 characters.'

#### 3.2. TC-06 Contact form: invalid (too short) phone number is rejected with a specific message

**File:** `tests/public/contact-invalid-phone.spec.ts`

**Steps:**
  1. Navigate to https://automationintesting.online/#contact. Fill Name='Ana Prueba', Email='ana.prueba@example.com', Phone='12345' (5 digits, below the 11-character minimum), Subject='Question about rooms', Message='This is a test message with enough characters to pass validation.' (69 characters, within the 20-2000 range).
    - expect: All fields show the values just entered.
  2. Click 'Submit'.
    - expect: The form does not submit successfully.
    - expect: Exactly the message 'Phone must be between 11 and 21 characters.' is shown; the other four fields (Name, Email, Subject, Message) do NOT show any 'may not be blank' or length-related validation errors, since they are individually valid.
  3. Correct the Phone field to '01234567890' (11 digits) and click 'Submit' again.
    - expect: The form submits successfully this time (see TC-07 for the exact confirmation contract).

#### 3.3. TC-07 Contact form: valid submission shows the personalized confirmation message

**File:** `tests/public/contact-happy-path.spec.ts`

**Steps:**
  1. Navigate to https://automationintesting.online/#contact. Fill Name='Ana Prueba', Email='ana.prueba@example.com', Phone='01234567890', Subject='Regression test subject QA' (or another distinctive, run-unique subject), Message='This is a test message with enough characters to pass validation.'.
    - expect: All fields accept the input without inline errors.
  2. Click 'Submit'.
    - expect: The form and its fields disappear and are replaced by a confirmation block.
    - expect: Heading level 3 reads exactly 'Thanks for getting in touch Ana Prueba!' (guest name is interpolated from the Name field).
    - expect: Paragraph “We'll get back to you about” is shown, followed by a paragraph containing the exact Subject just submitted ('Regression test subject QA'), followed by paragraph 'as soon as possible.'

### 4. Admin panel — access and rooms management

**Seed:** ``

#### 4.1. TC-09 Admin login with valid credentials reaches the Rooms screen with seeded rooms

**File:** `tests/admin/login-and-rooms-list.spec.ts`

**Steps:**
  1. Navigate to https://automationintesting.online/admin (fresh session, not already logged in).
    - expect: Heading level 2 'Login' is visible with a 'Username' textbox (placeholder 'Enter username') and a 'Password' textbox, and a 'Login' button.
  2. Fill Username='admin', Password='password', click 'Login'.
    - expect: The browser navigates to '/admin/rooms'.
    - expect: The top admin nav shows links 'Rooms', 'Report', 'Branding' and 'Messages <N>' (N = current unread count), plus 'Front Page' and 'Logout'.
  3. Inspect the rooms table on '/admin/rooms'.
    - expect: Column headers read 'Room #', 'Type', 'Accessible', 'Price', 'Room details'.
    - expect: A row exists with Room # '101', Type 'Single', Accessible 'true', Price '100', details 'TV, WiFi, Safe'.
    - expect: A row exists with Room # '102', Type 'Double', Accessible 'true', Price '150', details 'TV, Radio, Safe'.
    - expect: A row exists with Room # '103', Type 'Suite', Accessible 'true', Price '225', details 'Radio, WiFi, Safe'.
    - expect: Below the existing rows, a room-creation form is visible with a free-text room identifier field, a Type dropdown containing options 'Single', 'Twin', 'Double', 'Family', 'Suite', an Accessible dropdown with options 'false'/'true', a Price textbox, feature checkboxes 'WiFi', 'TV', 'Radio', 'Refreshments', 'Safe', 'Views', and a 'Create' button.

#### 4.2. TC-10 Regression: create a room in Admin and find it in the Rooms list and its detail view

**File:** `tests/admin/create-room-and-verify.spec.ts`

**Steps:**
  1. Logged in as admin on '/admin/rooms', fill the room-creation form: room identifier = a distinctive synthetic value (e.g. 'QA-201'), Type='Twin', Accessible='false' (default), Price='175', check the 'TV' feature checkbox only.
    - expect: The form accepts all inputs without inline errors.
  2. Click 'Create'.
    - expect: A new row appears at the bottom of the Rooms table with Room # matching the identifier used (e.g. 'QA-201'), Type 'Twin', Accessible 'false', Price '175', Room details 'TV'.
    - expect: The pre-existing rows for 101/102/103 are unchanged.
  3. Click on the newly created room's row/identifier to open its detail view.
    - expect: The URL changes to '/admin/room/<id>'.
    - expect: Heading level 2 reads 'Room: QA-201' with an 'Edit' button next to it.
    - expect: Paragraph 'Type: Twin' is visible.
    - expect: Paragraph 'Description: Please enter a description for this room' is visible (default placeholder text, since no description was set).
    - expect: Paragraph 'Accessible: false' is visible.
    - expect: Paragraph 'Features: TV' is visible.
    - expect: Paragraph 'Room price: 175' is visible.
    - expect: A bookings table with headers 'First name', 'Last name', 'Price', 'Deposit paid?', 'Check in', 'Check out' is visible below, with no rows (the new room has no bookings yet).

### 5. Admin panel — Messages, cross-flow regression, Report and Branding

**Seed:** ``

#### 5.1. TC-08 Cross-flow regression: a public booking generates a 'You have a new booking!' message in the admin inbox

**File:** `tests/cross-flow/booking-creates-admin-message.spec.ts`

**Steps:**
  1. As an unauthenticated visitor, complete a full reservation on the Double room (room 2) using a distinctive synthetic guest, e.g. Firstname='Beto', Lastname='Notif', Email='beto.notif@example.com', Phone='01234567890', for a not-yet-booked future date range (see TC-03 for the flow), until 'Booking Confirmed' is shown.
    - expect: The public booking flow completes successfully as in TC-03, confirming dates matching the ones chosen.
  2. Log in to /admin (admin/password) and open '/admin/message'.
    - expect: The 'Messages' nav badge count has increased by exactly 1 compared to its value before the booking.
    - expect: A new row appears with Name = 'Beto Notif' and Subject = exactly 'You have a new booking!'.
  3. Click the 'Beto Notif' / 'You have a new booking!' row to open its detail modal.
    - expect: The modal shows 'From: Beto Notif', 'Phone: 01234567890', 'Email: beto.notif@example.com', the subject line 'You have a new booking!', and a body reading exactly 'You have a new booking from Beto Notif. They have booked a room for the following dates: <CI> to <CO>' with <CI>/<CO> matching the dates booked.
    - expect: A 'Close' button is visible.
  4. Click 'Close'.
    - expect: The modal closes and the Messages list is visible again.
    - expect: The Messages nav badge count has decremented by 1 relative to before opening this message (see TC-11 for the general unread-badge contract).

#### 5.2. TC-11 Admin Messages inbox: unread badge decrements on read, modal shows correct content and Close works

**File:** `tests/admin/messages-inbox.spec.ts`

**Steps:**
  1. Log in to /admin and open '/admin/message'. Note the current unread badge count on the 'Messages' nav link (format 'Messages <N>').
    - expect: A table with column headers 'Name' and 'Subject' lists at least one message row (the seeded 'James Dean' / 'Booking enquiry' message is present by default on a fresh sandbox instance).
  2. Click on any row that is currently unread.
    - expect: A modal dialog opens showing 'From: <Name>', 'Phone: <phone>', 'Email: <email>', the message's Subject as its own line, the full message body text, and a 'Close' button.
    - expect: The 'Messages' nav badge count immediately decrements by 1 (updates without a full page reload).
  3. Click 'Close' on the modal.
    - expect: The modal closes, returning to the Messages list.
    - expect: The message row remains listed (messages are not deleted by being read, only marked as read).

#### 5.3. TC-12 Admin Report calendar reflects a booking made on the public site

**File:** `tests/admin/report-calendar.spec.ts`

**Steps:**
  1. Complete a public booking for the Suite room (room 3) with a distinctive synthetic guest, e.g. Firstname='Carla', Lastname='Reporte', Email='carla.reporte@example.com', Phone='01234567890', for a specific future date, e.g. one falling in a currently-displayed calendar month, and note the confirmed date.
    - expect: The booking completes with the 'Booking Confirmed' screen as in TC-03.
  2. Log in to /admin and open '/admin/report'.
    - expect: Heading/controls 'Today', 'Back', 'Next' and a month label (e.g. 'August 2026') are visible above a 'Month View' calendar table with day-of-week column headers Sun-Sat.
  3. Navigate (using 'Next'/'Back') to the month containing the booked date and locate that date's cell.
    - expect: An entry reading 'Carla Reporte - Room: 103' is listed on the correct calendar day cell, alongside any other guests already booked for overlapping dates.

#### 5.4. TC-13 Admin Branding page loads the current B&B configuration

**File:** `tests/admin/branding.spec.ts`

**Steps:**
  1. Log in to /admin and open '/admin/branding'.
    - expect: Heading level 2 'B&B details' is visible with a 'Name' field containing 'Shady Meadows B&B', a 'Logo' field containing '/images/rbp-logo.jpg', and a 'Description' textarea containing the standard welcome paragraph text starting 'Welcome to Shady Meadows, a delightful Bed & Breakfast...'.
    - expect: Heading level 2 'Map details' is visible with 'Latitude' = '52.6351204' and 'Longitude' = '1.2733774', plus a 'Directions' textarea.
    - expect: Heading level 2 'Contact details' is visible with 'Name' = 'Shady Meadows B&B', 'Phone' = '012345678901', 'Email' = 'fake@fakeemail.com'.
    - expect: Heading level 2 'Address details' is visible with 'Line 1' = 'Shady Meadows B&B', 'Line 2' = 'Shadows valley', 'Post Town' = 'Newingtonfordburyshire', 'County' = 'Dilbery', 'Post Code' = 'N1 1AA'.
    - expect: A 'Submit' button is visible at the bottom of the form.
