# Mapfre Ahorro e Inversión — Golden Path Test Plan

## Application Overview

Target: https://www.mapfre.es/ahorro-inversion/ — commercial landing section of mapfre.es dedicated to savings and investment products (fondos de inversión, planes de pensiones, seguros de ahorro, unit-linked). This is a production regulated site (financial services / insurance domain). The section is a public commercial funnel: landing → product category → product ficha → CTA (contratar / simular / contacto). Some CTAs redirect to dedicated simulator tools or lead capture forms. A cookie consent banner (OneTrust) is expected on first load and must be accepted before interacting with the page, but the consent interaction itself is NOT a test criterion. Anti-bot protections may be present; tests should use realistic interaction patterns. No authentication is required to explore the funnel. Scope is limited to the ahorro-inversión section only — other Mapfre product lines (hogar, auto, salud), blog, footer corporate links, and legal/cookie policies are out of scope. Assumptions: fresh browser state (no cookies, no prior session); desktop viewport (1280×720); synthetic data used for any simulator inputs — no real PII.

## Test Scenarios

### 1. Landing Page — Aterrizaje y Navegación de Sección

**Seed:** `tests/e2e/seed.spec.ts`

#### 1.1. Aterrizaje en la landing de ahorro e inversión y verificación de estructura principal

**File:** `tests/e2e/mapfre-ahorro-inversion/TC001-landing-structure.spec.ts`

**Steps:**
  1. Navigate to https://www.mapfre.es/ahorro-inversion/
    - expect: The page loads successfully with HTTP 200
    - expect: The browser tab title contains 'ahorro' or 'inversión' (case-insensitive)
    - expect: A cookie consent banner is present on the page (OneTrust or equivalent overlay)
  2. Accept the cookie consent banner by clicking the primary accept button (e.g., 'Aceptar todas', 'Aceptar', or equivalent)
    - expect: The cookie consent banner disappears from the DOM or becomes hidden
    - expect: The main page content is fully visible and not obscured by any overlay
  3. Inspect the main heading (h1) of the page
    - expect: An h1 heading is present and visible
    - expect: The h1 text is non-empty and relates to ahorro or inversión (e.g., contains 'Ahorro', 'Inversión', or a commercial tagline)
  4. Inspect the product navigation or category cards/links visible on the landing (fondos de inversión, planes de pensiones, seguro de ahorro, etc.)
    - expect: At least two product category sections or cards are visible on the page
    - expect: Each product category has a visible label or heading (e.g., 'Fondos de Inversión', 'Planes de Pensiones', 'Seguro de Ahorro')
    - expect: Each product category section contains at least one actionable CTA link or button leading deeper into the section
  5. Verify the primary navigation or breadcrumb identifies the user as being within the ahorro-inversión section
    - expect: A breadcrumb, section header, or nav element indicates 'Ahorro e Inversión' or equivalent
    - expect: No other main product-line section (hogar, auto, salud) is rendered as active in the primary nav

### 2. Fondos de Inversión — Ficha de Producto y CTA Principal

**Seed:** `tests/e2e/seed.spec.ts`

#### 2.1. Acceso a la ficha de Fondos de Inversión desde la landing y verificación de CTA de contratación o más información

**File:** `tests/e2e/mapfre-ahorro-inversion/TC002-fondos-inversion-ficha.spec.ts`

**Steps:**
  1. Navigate to https://www.mapfre.es/ahorro-inversion/ and accept the cookie consent banner
    - expect: Page loads and consent banner is dismissed
  2. Locate the 'Fondos de Inversión' product category section or card on the landing. Click the primary CTA or link within that section (e.g., 'Ver fondos', 'Descubre nuestros fondos', 'Más información', or the card/section link itself)
    - expect: The browser navigates to a Fondos de Inversión product page or listing page within the mapfre.es/ahorro-inversion/ path hierarchy
    - expect: The URL changes to a path containing 'fondos' or 'fondos-de-inversion' (e.g., /ahorro-inversion/fondos-de-inversion/)
    - expect: The page title or main heading references 'Fondos de Inversión'
  3. On the Fondos de Inversión product page, inspect the page structure to confirm key commercial elements are present
    - expect: A main heading (h1 or h2) describing Fondos de Inversión is visible
    - expect: A descriptive section (product description or benefit highlights) is present and non-empty
    - expect: At least one primary CTA button is visible — expected candidates: 'Contratar', 'Solicitar información', 'Más información', 'Simulador' or equivalent
  4. Locate the primary CTA button on the Fondos de Inversión ficha page (the most prominent action button, typically 'Contratar' or 'Solicitar información'). Verify it is interactable
    - expect: The CTA button is visible and enabled (not disabled, not hidden behind an overlay)
    - expect: Hovering over the CTA button changes its visual state (cursor pointer, color change) — this confirms it is a live interactive element
    - expect: The button has an accessible name readable by screen readers (aria-label or visible text)
  5. Click the primary CTA button on the Fondos de Inversión ficha page
    - expect: The user is taken to a lead capture form, a contratación wizard, or an informational request page — OR a new overlay/modal with contact or contracting options appears
    - expect: If navigation occurs: the new URL is within mapfre.es or a known Mapfre subdomain (e.g., contratacion.mapfre.es, clientes.mapfre.es)
    - expect: If a modal opens: the modal has a title or heading relevant to contratar or solicitar información
    - expect: The destination page or modal does NOT display a generic 404 or error page

### 3. Planes de Pensiones — Ficha de Producto y CTA Principal

**Seed:** `tests/e2e/seed.spec.ts`

#### 3.1. Acceso a la ficha de Planes de Pensiones desde la landing y verificación de CTA de simulación o contratación

**File:** `tests/e2e/mapfre-ahorro-inversion/TC003-planes-pensiones-ficha.spec.ts`

**Steps:**
  1. Navigate to https://www.mapfre.es/ahorro-inversion/ and accept the cookie consent banner
    - expect: Page loads and consent banner is dismissed
  2. Locate the 'Planes de Pensiones' product category section or card on the landing. Click the primary CTA or link within that section (e.g., 'Ver planes', 'Conoce nuestros planes', 'Más información', or the card/section link itself)
    - expect: The browser navigates to a Planes de Pensiones product page within the mapfre.es/ahorro-inversion/ path hierarchy
    - expect: The URL changes to a path containing 'planes-de-pensiones' or 'pensiones'
    - expect: The page title or main heading references 'Planes de Pensiones'
  3. On the Planes de Pensiones product page, inspect the page for a simulator or calculator CTA (e.g., 'Simula tu pensión', 'Calcula tu ahorro', 'Simulador de pensiones', 'Calcular')
    - expect: At least one simulator or calculator CTA is present on the page OR a direct 'Contratar' / 'Solicitar información' button is present
    - expect: The CTA is visible, enabled, and has an accessible name
  4. Click the simulator/calculator CTA (preferred) or the primary contratar/información CTA if no simulator is present
    - expect: If simulator CTA clicked: a simulation widget loads on the same page (embedded) OR the browser navigates to a dedicated simulator tool (e.g., a subdomain or /simulador/ path)
    - expect: If contratar/información CTA clicked: a lead form, contratación wizard, or informational modal appears
    - expect: No 404 or error page is displayed
    - expect: The destination content is visually related to planes de pensiones (heading, labels reference pensiones or jubilación)
  5. If a simulator widget is present and loaded: inspect its initial state (input fields visible, submit/calculate button visible)
    - expect: The simulator widget contains at least one input field (e.g., edad actual, aportación mensual, objetivo de ahorro)
    - expect: A 'Calcular' or 'Simular' action button is present within the widget
    - expect: No JavaScript error overlay or broken widget state is displayed

### 4. Seguro de Ahorro (PIAS / Unit-linked) — Ficha y Solicitud de Información

**Seed:** `tests/e2e/seed.spec.ts`

#### 4.1. Acceso a la ficha de Seguro de Ahorro y envío de solicitud de información o contacto

**File:** `tests/e2e/mapfre-ahorro-inversion/TC004-seguro-ahorro-contacto.spec.ts`

**Steps:**
  1. Navigate to https://www.mapfre.es/ahorro-inversion/ and accept the cookie consent banner
    - expect: Page loads and consent banner is dismissed
  2. Locate the 'Seguro de Ahorro' (or 'PIAS', 'Plan de Ahorro', 'Unit-linked') product category section or card on the landing. Click its primary CTA or card link
    - expect: The browser navigates to a Seguro de Ahorro product detail page within mapfre.es/ahorro-inversion/
    - expect: The URL contains a path segment related to seguro-ahorro, pias, plan-ahorro, or unit-linked
    - expect: The page heading references the specific savings product type
  3. On the Seguro de Ahorro product page, locate a 'Solicitar información', 'Te llamamos', 'Contacto', or 'Más información' CTA button or link
    - expect: At least one contact or information-request CTA is present, visible, and enabled
  4. Click the 'Solicitar información', 'Te llamamos', or equivalent contact CTA
    - expect: A contact form or lead capture form becomes visible — either as a page navigation or as an inline/modal form
    - expect: The form contains fields for at minimum: nombre/apellidos and teléfono or email
    - expect: A submit button ('Enviar', 'Solicitar', 'Contactar') is present and visible
    - expect: No 404 or error page is shown
  5. Inspect the contact/lead form for required field validation without submitting. Click the submit button without filling any fields
    - expect: The form does NOT submit (no navigation away from the form, no success message)
    - expect: Visible validation error messages appear indicating which fields are required (e.g., 'Campo obligatorio', 'Este campo es requerido', or equivalent)
    - expect: The form remains in a recoverable state — all fields are still accessible and editable

### 5. Simulador de Ahorro / Calculadora — Flujo de Datos Sintéticos

**Seed:** `tests/e2e/seed.spec.ts`

#### 5.1. Interacción con simulador o calculadora de ahorro usando datos sintéticos hasta obtener resultado

**File:** `tests/e2e/mapfre-ahorro-inversion/TC005-simulador-ahorro.spec.ts`

**Steps:**
  1. Navigate to https://www.mapfre.es/ahorro-inversion/ and accept the cookie consent banner
    - expect: Page loads and consent banner is dismissed
  2. From the landing, locate any simulator, calculadora, or rentabilidad estimator CTA. This may be a dedicated 'Simulador' or 'Calculadora de ahorro' section on the landing or accessible from one of the product category cards. Click it to open the simulator
    - expect: The simulator widget or calculator page loads without error
    - expect: At least one numeric input field is visible (e.g., aportación inicial, aportación mensual, plazo en años, edad)
    - expect: A calculate/simulate action button is visible and enabled
  3. Fill in the simulator input fields with synthetic data: aportación inicial = 10000, aportación mensual = 100 (or equivalent fields that are present). Use only synthetic numeric values — no real personal data
    - expect: The input fields accept the entered numeric values
    - expect: No immediate validation error appears for the entered values (they are within acceptable ranges)
    - expect: The calculate/simulate button remains enabled after filling inputs
  4. Click the calculate/simulate action button ('Calcular', 'Simular', 'Ver resultados', or equivalent)
    - expect: The simulator produces a result — either displayed inline below/beside the inputs OR shown on a results screen
    - expect: The result area contains a projected value, a chart, or a textual estimate (e.g., 'Tu ahorro estimado es...', a euro amount, a percentage return)
    - expect: No JavaScript error, spinner stuck indefinitely, or empty result area is shown
    - expect: The result is numerically consistent with the inputs (a non-zero positive value given a positive initial contribution)
  5. After viewing the result, verify that a next-step CTA is present to progress toward contratación or contact
    - expect: A CTA button or link is visible on or near the results area (e.g., 'Contratar', 'Solicitar información', 'Hablar con un asesor', 'Más información')
    - expect: The CTA is enabled and has an accessible label
    - expect: Clicking the CTA initiates navigation or opens a contact form — no dead-end UI state (no enabled CTA that leads nowhere)
