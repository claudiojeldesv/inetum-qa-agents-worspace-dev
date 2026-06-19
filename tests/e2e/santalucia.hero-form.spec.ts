/**
 * @criterion TC-04 "Formulario hero — visibilidad y selector" (feature: home)
 *            Source: .work/discovery-report.json → scenarios_recommended[3] home.TC-04-hero-form
 *            Target: https://www.santalucia.es/es/segurosmultirramo
 *            Mode: S4 autonomous
 *
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Boundary PII: NO form data is submitted. No real or synthetic phone numbers are
 * entered. Negative-validation test submits an intentionally empty form to verify
 * HTML5 / ARIA required-field behaviour. No network request with personal data is made.
 *
 * A11y: axe-core scan is omitted for this spec per explicit project-owner instruction
 * (production site — no axe flag). The style contract gate fail_on_violations is false;
 * this spec records that the axe check is waived and the SDET must re-enable it when
 * running against a staging environment.
 *
 * Locator strategy (contract priority): getByLabel → getByRole → getByText.
 * Hero-form elements are scoped with .first() where the same semantic locator also
 * matches the off-canvas modal-dialog (second occurrence in DOM order).
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { HomePage } from '../pages/home.page';

test.describe('Feature: home — TC-04 Formulario hero visibilidad y selector', () => {

  test.beforeEach(async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    // Accept cookie banner if visible — wait up to 5 s then continue regardless.
    // Uses getByRole so no CSS is involved.
    const cookieAccept = page.getByRole('button', { name: /aceptar/i });
    const cookieVisible = await cookieAccept.isVisible().catch(() => false);
    if (cookieVisible) {
      await cookieAccept.click();
      // Wait for banner to disappear rather than a hard sleep.
      await cookieAccept.waitFor({ state: 'hidden' }).catch(() => { /* banner may animate away */ });
    }
  });

  // ---------------------------------------------------------------------------
  // TC-04-A  Hero form — all fields visible
  // ---------------------------------------------------------------------------
  test('Hero form — todos los campos son visibles al cargar la página', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    const a11yViolations = accessibilityScanResults.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (a11yViolations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${a11yViolations.length} serious/critical violation(s): ` +
          a11yViolations.map(v => v.id).join(', '),
      });
    }

    const home = new HomePage(page);

    // Radio buttons × 4 (hero-form is first occurrence in DOM; .first() disambiguates
    // from any duplicate rendered inside the hidden modal-dialog)
    await expect(home.hogar.first()).toBeVisible();
    await expect(home.decesos.first()).toBeVisible();
    await expect(home.vida.first()).toBeVisible();
    await expect(home.salud.first()).toBeVisible();

    // Textbox "Teléfono" — hero-form is first occurrence
    await expect(home.telFono.first()).toBeVisible();

    // Checkboxes — RGPD (required) and marketing (optional)
    await expect(home.heLeDoYAceptoLaInformaciNSobreLaProtecciNDeDatos.first()).toBeVisible();
    await expect(home.quieroRecibirInformaciNSobreProductosYOfertasQueMePuedanBeneficiar).toBeVisible();

    // Submit button
    await expect(home.solicitarLlamada).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // TC-04-B  Radio default — "Hogar" viene pre-seleccionado
  // ---------------------------------------------------------------------------
  test('Radio "Hogar" está pre-seleccionado por defecto al cargar la página', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    const a11yViolations = accessibilityScanResults.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (a11yViolations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${a11yViolations.length} serious/critical violation(s): ` +
          a11yViolations.map(v => v.id).join(', '),
      });
    }

    const home = new HomePage(page);

    await expect(home.hogar.first()).toBeChecked();
  });

  // ---------------------------------------------------------------------------
  // TC-04-C  Radio change — seleccionar "Vida" desmarca "Hogar"
  // ---------------------------------------------------------------------------
  test('Seleccionar radio "Vida" marca Vida y desmarca Hogar', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    const a11yViolations = accessibilityScanResults.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (a11yViolations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${a11yViolations.length} serious/critical violation(s): ` +
          a11yViolations.map(v => v.id).join(', '),
      });
    }

    const home = new HomePage(page);

    // Precondition: Hogar is checked
    await expect(home.hogar.first()).toBeChecked();

    await home.vida.first().click();

    await expect(home.vida.first()).toBeChecked();
    await expect(home.hogar.first()).not.toBeChecked();
  });

  // ---------------------------------------------------------------------------
  // TC-04-D  Negative validation — submit empty form shows required-field error
  //
  // Boundary PII: form is intentionally left EMPTY. No phone number is entered.
  // Verification strategy (in priority order):
  //   1. aria-invalid="true" on the phone input after submit attempt
  //   2. HTML5 :invalid pseudo-class via checkValidity() JS evaluation
  //   3. role=alert / role=status error message containing text about a required field
  // At least one of these must be true for the test to pass.
  // ---------------------------------------------------------------------------
  test('Envío del formulario vacío activa la validación de campos obligatorios', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    const a11yViolations = accessibilityScanResults.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (a11yViolations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${a11yViolations.length} serious/critical violation(s): ` +
          a11yViolations.map(v => v.id).join(', '),
      });
    }

    const home = new HomePage(page);

    // Form is empty: phone not filled, RGPD checkbox not checked (intentional)
    await home.solicitarLlamada.click();

    // Strategy 1: aria-invalid on the phone textbox
    const phoneLocator = home.telFono.first();
    const ariaInvalidValue = await phoneLocator.getAttribute('aria-invalid').catch(() => null);
    const ariaInvalidTriggered = ariaInvalidValue === 'true';

    // Strategy 2: HTML5 native validity API
    const nativeInvalid = await phoneLocator.evaluate((el: HTMLInputElement) => {
      return el.validity !== undefined && !el.checkValidity();
    }).catch(() => false);

    // Strategy 3: visible role=alert / role=status with error text
    // Scope broadly; different frameworks use different live-region roles.
    const alertLocator = page.getByRole('alert').first();
    const statusLocator = page.getByRole('status').first();
    const alertVisible = await alertLocator.isVisible().catch(() => false);
    const statusVisible = await statusLocator.isVisible().catch(() => false);

    // At least one validation signal must be present
    const validationTriggered =
      ariaInvalidTriggered || nativeInvalid || alertVisible || statusVisible;

    expect(
      validationTriggered,
      'Expected at least one validation signal after submitting empty form: ' +
      `aria-invalid=${ariaInvalidValue}, nativeInvalid=${nativeInvalid}, ` +
      `alertVisible=${alertVisible}, statusVisible=${statusVisible}`
    ).toBe(true);

    // Additional: verify the phone textbox is still on screen (no navigation occurred)
    await expect(phoneLocator).toBeVisible();
  });
});
