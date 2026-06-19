/**
 * @criterion TC004 — Seguro de Ahorro (PIAS / Unit-linked) — Ficha y Solicitud de Información
 *   Source: .work/discovery-report.json › scenarios_recommended[3] (TC004-seguro-ahorro-contacto)
 *   Mode: S4 Autonomous. Target: https://www.mapfre.es/ahorro-inversion/ (prod real Mapfre)
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Scope:
 *   1. Landing → accept cookie consent → click Seguro de Ahorro link
 *   2. Verify seguro-ahorro-ficha page (heading contains 'Seguro de Ahorro' | 'PIAS' | 'Unit-linked')
 *   3. Click contact / solicitar-información CTA
 *   4. Verify contact form renders with nombre, email, teléfono fields + submit button
 *   5. Negative validation: submit empty form → assert at least one validation error visible
 *
 * CAPTCHA note: this test does NOT submit any real user data. The negative-validation
 * step triggers browser-side / server-side required-field checks only (empty payload).
 * No PII is introduced at any point.
 *
 * Anti-bot note: Mapfre production may return anti-bot responses after repeated runs
 * from the same fingerprint (same pattern as mapfre-hogar.wizard.spec.ts E0006).
 * If that occurs, wrap the failing step in test.fixme and document as acceso-restringido.
 *
 * Style contract: config/style-contracts/mapfre-ahorro-inversion.yaml
 *   locators.priority: getByLabel > getByRole > getByPlaceholder > getByText > getByTestId
 *   locators.forbid_css_selectors: true  (css_fallback_attributes: [name, id] allowed)
 *   locators.forbid_xpath: true
 *   waits.forbid_wait_for_timeout: true
 *   a11y.inject_axe_check: true, fail_on_violations: false (mode: warning annotation)
 */

import { test, expect }  from '@playwright/test';
import AxeBuilder        from '@axe-core/playwright';

import { LandingPage }           from '../pages/landing.page';
import { SeguroAhorroFichaPage } from '../pages/seguro-ahorro-ficha.page';
import { ContactFormPage }       from '../pages/contact-form.page';

// ── Base URL ──────────────────────────────────────────────────────────────────
const BASE_URL = process.env['QA_BASE_URL'] ?? 'https://www.mapfre.es';

test.describe('Feature: Seguro de Ahorro (PIAS / Unit-linked) — Ficha y Solicitud de Información', () => {

  test('Scenario: TC004 — ficha-seguro-ahorro-y-validacion-contacto', async ({ page }) => {

    // ── STEP 1: Goto landing ──────────────────────────────────────────────────
    const landingPage = new LandingPage(page);
    await page.goto(`${BASE_URL}/ahorro-inversion/`);

    // ── A11y check (landing) — gate off: fail_on_violations: false ────────────
    // Severity threshold: [serious, critical]. Mode: warning annotation only.
    const axeLanding = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const a11yLanding = axeLanding.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    );
    if (a11yLanding.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `Landing: ${a11yLanding.length} serious/critical violation(s): ` +
          a11yLanding.map(v => v.id).join(', '),
      });
    }

    // ── STEP 2: Accept cookie consent ─────────────────────────────────────────
    // Uses POM action — acceptCookieConsentIfVisible() guards isVisible() internally.
    await landingPage.acceptCookieConsentIfVisible();

    // ── STEP 3: Navigate to Seguro de Ahorro ficha ────────────────────────────
    // POM locator: getByRole('link', { name: /seguro.*ahorro/i }).first()
    // Fallback handled by POM: if the specific link is not found, the discovery
    // broadens to /más información/i (see landing.page.ts).
    await expect(landingPage.seguroDeAhorroProductCategory).toBeVisible();
    await landingPage.seguroDeAhorroProductCategory.click();

    // ── STEP 4: Verify seguro-ahorro-ficha page ───────────────────────────────
    // Identity assertion: URL contains 'ahorro' AND h1 identifies the product.
    const fichaPage = new SeguroAhorroFichaPage(page);
    await expect(page).toHaveURL(/ahorro/i);
    await expect(fichaPage.productHeading).toBeVisible();
    // Heading text must name the product — not just assert navigation.
    await expect(fichaPage.productHeading).toHaveText(/Seguro de Ahorro|PIAS|Unit.linked/i);

    // ── STEP 5: Click contact / solicitar-información CTA ─────────────────────
    // POM action: clickContactCta() tries button first, falls back to link.
    await fichaPage.clickContactCta();

    // ── STEP 6: Verify contact form fields are rendered ───────────────────────
    // POM action: assertFieldsVisible() waits for each field in turn.
    const contactFormPage = new ContactFormPage(page);
    await contactFormPage.assertFieldsVisible();

    // Explicit field assertions (functional content, not just navigation).
    await expect(contactFormPage.nombreApellidos).toBeVisible();
    await expect(contactFormPage.email).toBeVisible();
    await expect(contactFormPage.telFono).toBeVisible();
    await expect(contactFormPage.submit).toBeVisible();

    // ── A11y check (contact form) — gate off: fail_on_violations: false ────────
    const axeForm = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const a11yForm = axeForm.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    );
    if (a11yForm.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `ContactForm: ${a11yForm.length} serious/critical violation(s): ` +
          a11yForm.map(v => v.id).join(', '),
      });
    }

    // ── STEP 7: Negative validation — submit empty form ───────────────────────
    // SAFE: no fields are filled. Triggers required-field validation only.
    // Browser-side HTML5 validation fires before any network request;
    // server-side validation (if reached) also returns errors for empty required fields.
    await contactFormPage.submitForm();

    // Assert at least one validation error becomes visible.
    // Strategy (per style-contract asserts.semantic_only, priority order):
    //   1. role=alert — ARIA live region for form errors (preferred)
    //   2. Text /obligatorio|requerido|campo/i — common ES validation label text
    //   CSS :invalid pseudo-class is NOT used (CSS selector forbidden by contract).
    const alertError = page.getByRole('alert').first();
    const textError  = page.getByText(/obligatorio|requerido|campo/i).first();

    // Annotate if neither error surface is found (discovery gap).
    const alertVisible = await alertError.isVisible().catch(() => false);
    const textVisible  = await textError.isVisible().catch(() => false);
    if (!alertVisible && !textVisible) {
      // TODO writer: locator missing from discovery — no role=alert or
      //   /obligatorio|requerido|campo/i text found after empty submit.
      //   Inspect actual error element in live DOM and update strategy.
      test.info().annotations.push({
        type: 'writer-gap',
        description:
          'TC004 negative-validation: no role=alert or /obligatorio|requerido|campo/i ' +
          'error visible after empty submit. Discovery may be incomplete for this form state.',
      });
    }

    // Hard assert: at least one error surface must be present.
    await expect(alertError.or(textError).first()).toBeVisible();

    // Confirm form is recoverable: submit button still present (not navigated away).
    await expect(contactFormPage.submit).toBeVisible();

  });

});
