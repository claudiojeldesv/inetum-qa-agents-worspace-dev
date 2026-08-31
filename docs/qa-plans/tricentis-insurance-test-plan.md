# Tricentis Vehicle Insurance Sample App — Test Plan

## Application Overview

Target: https://sampleapp.tricentis.com/101/ — Tricentis' public "Vehicle Insurance Application" sample app, used to demo Tosca. No login is required. The app has two areas:

1. A marketing home page (`index.php`) with four vehicle-type entry points (Automobile, Truck, Motorcycle, Camper), each with a "Get a quote" link.
2. A single-page wizard (`app.php`) with five steps, shown as a horizontal step nav that carries a **live badge count of outstanding validation issues** for each step: "Enter Vehicle Data" → "Enter Insurant Data" → "Enter Product Data" → "Select Price Option" → "Send Quote".

Key verified behaviors that drive this plan (all confirmed live in the browser, not assumed):
- The wizard is a client-side SPA: all step DOM/fields exist at once and data survives Prev/Next, direct step-nav clicks, and vehicle-tab-relative step revisits **as long as no full page navigation/reload happens**. A full reload (address bar / `page.goto`) or switching the top vehicle-type tab (Automobile/Truck/Motorcycle/Camper) wipes all entered data and returns to step 1.
- "Next »" does **not** block on invalid/empty fields in steps 1–3 — you can click through Vehicle Data, Insurant Data and Product Data with everything blank. The only hard gate is on "Select Price Option", which refuses to show the price table ("Please, complete the first three steps to see the price table.") until all three prior steps are individually valid (their nav badge reads 0).
- Each step (except Send Quote) does **live, per-field validation**: leaving a required field empty/invalid and then blurring it shows an inline red message "This field is mandatory" directly under the field, and the step's nav badge count decrements/increments accordingly in real time.
- The Send Quote step instead validates only on submit, via a modal dialog: "Not finished yet..." / "There is still some data missing!" for incomplete/invalid data, or "Sending e-mail success!" (preceded by a brief "Loading PDF... Loading..." overlay) on success. Field-level state on this step is only visible via CSS valid/invalid classes, not inline text.
- The four vehicle types have different Vehicle Data and Product Data field sets: Automobile and Camper (9 required fields, 8/11 total incl. optional) both have full field sets; Truck (9 required) swaps in Payload/Total Weight; Motorcycle (8 required) is the odd one out, with Model/Cylinder Capacity and no Fuel Type / License Plate, and only 1–3 seats. Only Automobile's Product Data step has "Merit Rating" and "Courtesy Car"; Truck/Motorcycle/Camper's Product Data step has just Start Date, Insurance Sum, Damage Insurance and Optional Products.
- The price table (Silver/Gold/Platinum/Ultimate) is deterministic for a fixed set of Vehicle+Product Data inputs: revisiting "Select Price Option" via step-nav (no field changes) reproduces byte-identical prices. It is NOT provably input-agnostic-random — two different automobile configurations produced two different, internally-consistent, and each individually reproducible price tables (Silver/Gold/Platinum/Ultimate = 80.00/236.00/464.00/884.00 vs. 88.00/260.00/510.00/972.00).
- Two concrete client-side validation gaps were found and should be treated as candidate defects: (a) "List Price [$]" on Vehicle Data accepts negative numbers (e.g. `-500`) with no error; (b) "Date of Manufacture" on Vehicle Data accepts arbitrary far-future dates (e.g. `01/01/2099`) with no error, unlike "Start Date" on Product Data which explicitly rejects anything not "more than one month in the future" with that literal message.
- Submitting a fully valid "Send Quote" form triggers a real browser console error — `ReferenceError: e is not defined` at `forms/customization/calculations.js:489:3` — even though the user-visible flow still reports success. Flagged as a defect to monitor, not a blocker.
- Only synthetic data was used throughout (e.g. "Ana"/"Prueba", ana.prueba@example.com, phone 600000000 after the "+" prefix was found to fail validation) — never real personal data.

All literal texts, field labels, option lists and error messages below were read directly from the live application via accessibility snapshots and are quoted verbatim; nothing was invented.

## Test Scenarios

### 1. Marketing home page and vehicle-type entry

**Seed:** ``

#### 1.1. Home page shows all four vehicle insurance offers

**File:** `tests/tricentis-insurance/home-page.spec.ts`

**Steps:**
  1. Navigate to https://sampleapp.tricentis.com/101/
    - expect: Page title is "Tricentis Vehicle Insurance"
    - expect: Header shows heading "Vehicle Insurance Application" with subtitle text "This is a sample application, Version 1.0.1"
    - expect: Top nav list shows exactly 4 tabs, in order: "Automobile", "Truck", "Motorcycle", "Camper"
    - expect: A "Request Demo" link is present
  2. Scroll through the page and read the 4 offer blocks
    - expect: Block 1 heading reads "Get your Automobile Insurance" (with "Automobile Insurance" emphasized) and has a "Get a quote" link
    - expect: Block 2 heading reads "Get your Truck Insurance" with a "Get a quote" link
    - expect: Block 3 heading reads "Get your Motorcycle Insurance" with a "Get a quote" link
    - expect: Block 4 heading reads "Get your Camper Insurance" with a "Get a quote" link
    - expect: Each block shows the identical boilerplate paragraph starting "Well, the best way to get to know new software is to use an example to try it out..."
  3. Continue scrolling to the lower marketing sections
    - expect: A "Welcome Aboard!" heading section is present with tagline "...and take not only your insurance application testing to the next level"
    - expect: Four feature cards are present titled exactly: "We've Got You Covered", "No More Search and Destroy", "Relax and Automate", "Don't Play Solo"
    - expect: A closing paragraph reads "...and that's just an infinitesimal excerpt of our numerous capabilities." followed by a "Read more" link
    - expect: A section headed "Our Insane Insurance Offer" is present with tagline "Scrutinize our motives, and get your quote now!" and 4 offer tiles labelled "Automobile", "Camper", "Truck", "Motorcycle"
  4. Check the footer
    - expect: Footer nav shows: "About", "Products", "Events & Webinars", "Resources", "Services"
    - expect: Footer text reads exactly "Copyright 2021 by Tricentis GmbH. All rights reserved."

#### 1.2. "Get a quote" opens the wizard on the matching vehicle type

**File:** `tests/tricentis-insurance/home-page.spec.ts`

**Steps:**
  1. From the home page, click the "Get a quote" link inside the Automobile offer block
    - expect: Browser navigates to app.php
    - expect: Page title becomes "Enter Vehicle Data"
    - expect: Breadcrumb/header area under the top nav reads "Automobile Insurance"
    - expect: The wizard step nav shows all 5 steps: "Enter Vehicle Data", "Enter Insurant Data", "Enter Product Data", "Select Price Option", "Send Quote", each with a numeric badge, and "Enter Vehicle Data" is the active/current step

### 2. Enter Vehicle Data step — Automobile

**Seed:** ``

#### 2.1. All Automobile Vehicle Data fields and their options are present

**File:** `tests/tricentis-insurance/vehicle-data-automobile.spec.ts`

**Steps:**
  1. Open the wizard for Automobile and land on "Enter Vehicle Data"
    - expect: Fields present in order: "Make" (select), "Engine Performance [kW]" (text), "Date of Manufacture" (text "MM/DD/YYYY" + calendar-icon button), "Number of Seats" (select), "Fuel Type" (select), "List Price [$]" (text), "License Plate Number" (text), "Annual Mileage [mi]" (text)
    - expect: Only a "Next »" button is present on this first step (no "Prev" button)
  2. Open the "Make" dropdown
    - expect: Options, in order: "– please select –" (selected by default), "Audi", "BMW", "Ford", "Honda", "Mazda", "Mercedes Benz", "Nissan", "Opel", "Porsche", "Renault", "Skoda", "Suzuki", "Toyota", "Volkswagen", "Volvo"
  3. Open the "Number of Seats" dropdown
    - expect: Options are "– please select –", then "1" through "9"
  4. Open the "Fuel Type" dropdown
    - expect: Options, in order: "– please select –", "Petrol", "Diesel", "Electric Power", "Gas", "Other"

#### 2.2. Live per-field validation shows "This field is mandatory" and the step badge tracks outstanding fields

**File:** `tests/tricentis-insurance/vehicle-data-automobile.spec.ts`

**Steps:**
  1. Land fresh on "Enter Vehicle Data" for Automobile and note the step's nav badge value
    - expect: Badge reads "7" before anything is filled
  2. Select "Audi" as Make
    - expect: Badge decrements by 1 (reads "6")
  3. Click into "Engine Performance [kW]", type the non-numeric text "abc", then move focus away (Tab/blur)
    - expect: An inline message "This field is mandatory" appears directly under "Engine Performance [kW]", i.e. a non-numeric value is treated the same as an empty one and does not read as a distinct "invalid format" message
  4. Clear the field and type a valid number, e.g. "100", then blur
    - expect: The "This field is mandatory" message disappears
    - expect: The step badge decrements accordingly
  5. Click into "Date of Manufacture", leave it empty, and blur
    - expect: "This field is mandatory" appears under "Date of Manufacture"
  6. Type a valid past date, e.g. "05/15/2015", and blur
    - expect: The message clears and the badge decrements
  7. Fill "Number of Seats" = "4", "Fuel Type" = "Petrol", "List Price [$]" = "20000", "License Plate Number" = "AB-123-CD", "Annual Mileage [mi]" = "15000", blurring each
    - expect: After all fields are valid and blurred, the "Enter Vehicle Data" step badge reads "0"

#### 2.3. Two validation gaps: negative List Price and unrestricted future Date of Manufacture are both accepted

**File:** `tests/tricentis-insurance/vehicle-data-automobile.spec.ts`

**Steps:**
  1. On "Enter Vehicle Data", type "-500" into "List Price [$]" and blur
    - expect: DEFECT CANDIDATE: no validation error is shown; the negative value is accepted as valid, with no minimum/non-negative constraint enforced
  2. Type "01/01/2099" into "Date of Manufacture" and blur
    - expect: DEFECT CANDIDATE: no validation error is shown for a vehicle manufacture date almost 75 years in the future; there is no apparent upper bound on this field, unlike "Start Date" on the Product Data step (see Product Data suite)

#### 2.4. "Next »" advances even with the step fully empty or invalid

**File:** `tests/tricentis-insurance/vehicle-data-automobile.spec.ts`

**Steps:**
  1. Land fresh on "Enter Vehicle Data" (Automobile) and, without touching any field, click "Next »"
    - expect: The wizard advances to "Enter Insurant Data" (page title changes accordingly) — clicking Next does NOT block on incomplete/invalid step-1 data
    - expect: The "Enter Vehicle Data" nav badge still reads its original outstanding-field count (e.g. "7"), reflecting that the step is still incomplete even though navigation was allowed

### 3. Enter Vehicle Data step — field differences across vehicle types

**Seed:** ``

#### 3.1. Truck adds Payload and Total Weight

**File:** `tests/tricentis-insurance/vehicle-data-truck.spec.ts`

**Steps:**
  1. From the wizard, click the "Truck" tab in the top nav
    - expect: Header changes to "Truck Insurance"
    - expect: The wizard resets to step 1 "Enter Vehicle Data" with all fields empty (switching vehicle type discards any previously entered data)
    - expect: "Enter Vehicle Data" badge reads "9"
  2. Inspect the Vehicle Data fields for Truck
    - expect: Fields, in order: "Make", "Engine Performance [kW]", "Date of Manufacture", "Number of Seats", "Fuel Type", "Payload [kg]", "Total Weight [kg]", "List Price [$]", "License Plate Number", "Annual Mileage [mi]" — i.e. Automobile's field set plus "Payload [kg]" and "Total Weight [kg]" inserted between Fuel Type and List Price

#### 3.2. Motorcycle has a reduced, distinct field set

**File:** `tests/tricentis-insurance/vehicle-data-motorcycle.spec.ts`

**Steps:**
  1. From the wizard, click the "Motorcycle" tab
    - expect: Header changes to "Motorcycle Insurance"
    - expect: "Enter Vehicle Data" badge reads "8"
  2. Inspect the Vehicle Data fields for Motorcycle
    - expect: Fields, in order: "Make", "Model" (select: "– please select –", "Scooter", "Three-Wheeler", "Moped", "Motorcycle"), "Cylinder Capacity [ccm]" (text), "Engine Performance [kW]", "Date of Manufacture", "Number of Seats" (select options "– please select –", "1", "2", "3" only), "List Price [$]", "Annual Mileage [mi]"
    - expect: Unlike Automobile/Truck/Camper, Motorcycle has NO "Fuel Type" field and NO "License Plate Number" field

#### 3.3. Camper adds Right Hand Drive plus Payload/Total Weight

**File:** `tests/tricentis-insurance/vehicle-data-camper.spec.ts`

**Steps:**
  1. From the wizard, click the "Camper" tab
    - expect: Header changes to "Camper Insurance"
    - expect: "Enter Vehicle Data" badge reads "9"
  2. Inspect the Vehicle Data fields for Camper
    - expect: Fields, in order: "Make", "Engine Performance [kW]", "Date of Manufacture", "Number of Seats" ("1"-"9"), "Right Hand Drive" (radio group: "Yes" / "No"), "Fuel Type", "Payload [kg]", "Total Weight [kg]", "List Price [$]", "License Plate Number", "Annual Mileage [mi]"

### 4. Enter Insurant Data step

**Seed:** ``

#### 4.1. Insurant Data fields, required-field validation, and optional fields

**File:** `tests/tricentis-insurance/insurant-data.spec.ts`

**Steps:**
  1. From "Enter Vehicle Data" (any vehicle type), click "Next »" to reach "Enter Insurant Data"
    - expect: Page title is "Enter Insurant Data"
    - expect: "Enter Insurant Data" badge reads "7" before any field is filled
    - expect: "« Prev" and "Next »" buttons are both present (unlike step 1, which only has "Next »")
  2. Inspect the fields present
    - expect: Required-looking fields: "First Name", "Last Name", "Date of Birth" (MM/DD/YYYY + calendar button), "Gender" (radio group: "Male" / "Female"), "Street Address", "Country" (a very long select — 190+ ISO country names, default "– please select –", includes entries like "Bolivia - Plurinational State of", "Korea - Republic of", "Côte d'Ivoire", "Åland Islands"), "Zip Code", "City"
    - expect: Fields that do not affect the badge count (optional): "Occupation" (select: "– please select –", "Employee", "Public Official", "Farmer", "Unemployed", "Selfemployed"), "Hobbies" (checkboxes: "Speeding", "Bungee Jumping", "Cliff Diving", "Skydiving", "Other"), "Website" (text), "Picture" (file upload with a "Choose File" control)
  3. Fill First Name, Last Name, Date of Birth, Gender, Street Address, Country, Zip Code and City with synthetic values (e.g. "Ana" / "Prueba" / "01/01/1990" / Male / "Calle Falsa 123" / "Spain" / "28080" / "Madrid"), blurring each
    - expect: The badge decrements to "0" once all 7 required fields are valid, without needing Occupation/Hobbies/Website/Picture to be touched

### 5. Enter Product Data step

**Seed:** ``

#### 5.1. Automobile Product Data has Merit Rating and Courtesy Car; other vehicle types do not

**File:** `tests/tricentis-insurance/product-data.spec.ts`

**Steps:**
  1. Reach "Enter Product Data" for Automobile
    - expect: Badge reads "6" before filling
    - expect: Fields present, in order: "Start Date" (MM/DD/YYYY + calendar), "Insurance Sum [$]" (select), "Merit Rating" (select), "Damage Insurance" (select), "Optional Products" (checkboxes), "Courtesy Car" (select)
  2. Open the "Insurance Sum [$]" dropdown
    - expect: Options, in order: "– please select –", "3.000.000,00", "5.000.000,00", "7.000.000,00", "10.000.000,00", "15.000.000,00", "20.000.000,00", "25.000.000,00", "30.000.000,00", "35.000.000,00"
  3. Open the "Merit Rating" dropdown
    - expect: Options, in order: "– please select –", "Super Bonus", "Bonus 1" through "Bonus 9", "Malus 10" through "Malus 17"
  4. Open the "Damage Insurance" dropdown
    - expect: Options, in order: "– please select –", "No Coverage", "Partial Coverage", "Full Coverage"
  5. Inspect "Optional Products" and "Courtesy Car"
    - expect: "Optional Products" offers checkboxes "Euro Protection" and "Legal Defense Insurance" (optional, do not affect badge)
    - expect: "Courtesy Car" is a select with options "– please select –", "No", "Yes"
  6. Reach "Enter Product Data" for Truck (or Motorcycle / Camper)
    - expect: Badge reads "4" before filling
    - expect: Only "Start Date", "Insurance Sum [$]", "Damage Insurance" and "Optional Products" are present — no "Merit Rating" and no "Courtesy Car" fields for these vehicle types

#### 5.2. "Start Date" enforces a minimum lead time with a literal error message

**File:** `tests/tricentis-insurance/product-data.spec.ts`

**Steps:**
  1. On "Enter Product Data", click into "Start Date", type a date only ~1 day in the future (e.g. tomorrow's date), then blur
    - expect: An inline message reading exactly "Must be more than one month in the future" appears under "Start Date"
    - expect: The step badge does not credit this field as complete
  2. Replace the value with a date clearly more than one month ahead (e.g. 3+ months from today), and blur
    - expect: The message clears and the field is accepted
    - expect: This is a real constraint (unlike "Date of Manufacture" on Vehicle Data, which has no future-date limit — see the Vehicle Data validation-gap test)

### 6. Select Price Option step

**Seed:** ``

#### 6.1. The price table is gated behind completing the first three steps

**File:** `tests/tricentis-insurance/price-option.spec.ts`

**Steps:**
  1. From a fresh wizard session (any vehicle type), jump straight to "Select Price Option" via the step nav without filling anything
    - expect: The step shows only the text "Please, complete the first three steps to see the price table." — no table, no radio options
  2. Fill Vehicle Data, Insurant Data and Product Data completely and validly (badges all read "0"), then return to "Select Price Option"
    - expect: The gating message disappears and a price table renders instead

#### 6.2. Price table content and literal labels

**File:** `tests/tricentis-insurance/price-option.spec.ts`

**Steps:**
  1. With all three prior Automobile steps complete, open "Select Price Option"
    - expect: Table has 4 columns headed, in order: "Silver", "Gold", "Platinum", "Ultimate"
    - expect: Row "Price per Year ($)" shows 4 numeric values formatted like "80.00"
    - expect: Row "Online Claim" reads "No" / "Submit" / "Submit" / "Submit" for Silver/Gold/Platinum/Ultimate respectively
    - expect: Row "Claims Discount (%)" reads "No" / "2" / "5" / "10"
    - expect: Row "Worldwide Cover" reads "No" / "Limited" / "Limited" / "Unlimited"
    - expect: A final "Select Option" row offers one radio button per column

#### 6.3. Price is deterministic for a fixed Vehicle+Product Data configuration

**File:** `tests/tricentis-insurance/price-option.spec.ts`

**Steps:**
  1. With all three prior steps complete for Automobile, record the 4 "Price per Year ($)" values shown
    - expect: Values are recorded, e.g. Silver/Gold/Platinum/Ultimate = 88.00/260.00/510.00/972.00 for one particular input set
  2. Navigate away to "Enter Vehicle Data" via the step nav WITHOUT changing any field value, then navigate back to "Select Price Option" via the step nav
    - expect: The exact same 4 price values are shown again — the price table is reproducible for identical underlying data, not re-randomized on every view
  3. Go back and change one Vehicle Data input (e.g. increase "List Price [$]" or "Engine Performance [kW]"), re-validate the step, and return to "Select Price Option"
    - expect: The price values change from the previous reading, confirming the table is a function of the entered Vehicle/Product data rather than a fixed constant

#### 6.4. Selecting a price option carries through to Send Quote

**File:** `tests/tricentis-insurance/price-option.spec.ts`

**Steps:**
  1. On a completed price table, select the "Gold" option's radio button
    - expect: The Gold radio becomes selected (no other column's radio is selected simultaneously)
  2. Navigate to "Send Quote" via the step nav
    - expect: Navigation succeeds without any warning about the price selection being lost

### 7. Send Quote step

**Seed:** ``

#### 7.1. Submitting a fully empty Send Quote form shows the "Not finished yet..." modal

**File:** `tests/tricentis-insurance/send-quote.spec.ts`

**Steps:**
  1. With prior steps completed and a price option selected, go to "Send Quote" and immediately click the "« Send »" button without filling any field
    - expect: A modal dialog appears with heading "Not finished yet..." and body text "There is still some data missing!"
    - expect: The same dialog additionally shows an exclamation icon ("!") and the text "Not valid!"
    - expect: The dialog has a single "OK" button
  2. Click "OK"
    - expect: The dialog closes and the Send Quote form remains editable with previously-entered (empty) values intact

#### 7.2. Phone field rejects a "+" country-code prefix

**File:** `tests/tricentis-insurance/send-quote.spec.ts`

**Steps:**
  1. On "Send Quote", type "+34600000000" into "Phone" and blur
    - expect: The field is marked invalid (its wrapper element carries an "invalid" state) — no inline error text is shown for this step, but attempting to submit will be blocked by this field
  2. Replace the value with digits only, e.g. "600000000", and blur
    - expect: The field becomes valid — confirms the "+" prefix specifically, not the phone number itself, is rejected

#### 7.3. Mismatched Confirm Password blocks submission

**File:** `tests/tricentis-insurance/send-quote.spec.ts`

**Steps:**
  1. Fill "E-Mail" = "ana.prueba@example.com", "Phone" = "600000000", "Username" = "anaprueba", "Password" = "Test1234!", "Confirm Password" = "Test1234" (deliberately different), "Comments" = a short synthetic sentence, then click "« Send »"
    - expect: The "Not finished yet..." / "There is still some data missing!" modal reappears because Confirm Password does not match Password
    - expect: Dismissing the modal ("OK") returns to the form with the mismatched values still present
  2. Correct "Confirm Password" to exactly match "Password" ("Test1234!") and click "« Send »" again
    - expect: No "Not finished yet..." modal appears this time

#### 7.4. Full happy path: valid synthetic data submits successfully

**File:** `tests/tricentis-insurance/send-quote.spec.ts`

**Steps:**
  1. Complete Vehicle Data, Insurant Data and Product Data validly (synthetic data only), select a price option (e.g. Gold), then on "Send Quote" fill E-Mail = "ana.prueba@example.com", Phone = "600000000", Username = "anaprueba", Password = "Test1234!", Confirm Password = "Test1234!", Comments = a short synthetic note, and click "« Send »"
    - expect: A brief "Loading PDF..." / "Loading..." overlay appears (the app generates a quote PDF)
    - expect: Once loading completes, a modal appears with heading "Sending e-mail success!" and an "OK" button
    - expect: NOTE (defect candidate): the same modal template's leftover elements (an exclamation icon and the text "Not valid!") are also visible on this SUCCESS dialog — an apparent UI inconsistency worth flagging, since "Not valid!" reads as contradictory on a success confirmation
    - expect: A JavaScript console error is emitted during this action: "ReferenceError: e is not defined" at forms/customization/calculations.js:489 — record this as a defect candidate; it does not prevent the visible success outcome
  2. Click "OK" on the success modal
    - expect: The modal closes; the "Send Quote" step nav badge reads "0"

### 8. Cross-cutting: navigation and session persistence

**Seed:** ``

#### 8.1. In-wizard navigation preserves entered data; full reload does not

**File:** `tests/tricentis-insurance/navigation-session.spec.ts`

**Steps:**
  1. On "Enter Vehicle Data", fill in several fields, then click "Next »" to Insurant Data, then click "« Prev" back to Vehicle Data
    - expect: All previously entered Vehicle Data values are still present
  2. From any step, click directly on a non-adjacent step in the top step-nav (e.g. jump from "Enter Vehicle Data" straight to "Enter Product Data")
    - expect: Navigation succeeds immediately (no confirmation prompt) and any data already entered on other steps is retained
  3. With several fields filled across multiple steps, perform a full browser navigation/reload of https://sampleapp.tricentis.com/101/app.php (address bar / F5, not an in-app link)
    - expect: The wizard resets entirely: step nav returns to "Enter Vehicle Data" as active, and all step badges return to their original just-loaded values (e.g. "7"/"7"/"6"/"1"/"4" pattern) — no previously entered data survives a real page reload

#### 8.2. Switching the vehicle-type tab resets the entire wizard

**File:** `tests/tricentis-insurance/navigation-session.spec.ts`

**Steps:**
  1. While on the Automobile wizard with several fields filled in on any step, click the "Truck" tab in the top nav
    - expect: The wizard jumps back to step 1 "Enter Vehicle Data" for Truck, with the Truck-specific field set, and none of the previously entered Automobile data is present anywhere in the wizard
