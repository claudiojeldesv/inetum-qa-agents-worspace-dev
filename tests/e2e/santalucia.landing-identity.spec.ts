/**
 * @criterion TC-01 — Feature: home — "Aterrizaje e identidad"
 *   Source: .work/discovery-report.json → scenarios_recommended[0]
 *           (home.TC-01-landing-identity)
 *   Steps: navigate to /es/segurosmultirramo, accept cookie consent if visible,
 *          verify page title, canonical URL, h1, h2, and logo visibility.
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Target: https://www.santalucia.es/es/segurosmultirramo (baseURL via QA_BASE_URL env-var)
 * Style Contract: config/style-contracts/santalucia-segurosmultirramo.yaml
 * Mode: S4 Autonomous (no criteria.json)
 *
 * Locator exceptions declared in this file:
 *   - page.locator('link[rel=canonical]'): CSS meta-tag selector with no semantic
 *     equivalent in Playwright. <link rel="canonical"> lives in <head>, outside the
 *     accessible tree. SPEC exception §4 / style-contract css_fallback_attributes.
 *     Tagged below as: // css-exception: head meta tag — no semantic locator available
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { HomePage } from '../pages/home.page';

test.describe('Feature: home — Aterrizaje e identidad (www.santalucia.es)', () => {

  test('Scenario: TC-01 — Aterrizaje e identidad de la landing Santalucía Seguros', async ({ page }) => {

    const homePage = new HomePage(page);

    // ── Step 1: Navigate to the Santalucía Seguros Multirramo landing ────────────
    await homePage.goto();

    // ── A11y check — gate off (fail_on_violations: false), modo WARNING auditable ─
    // Injected immediately after goto per SPEC §4 and style-contract a11y settings.
    // Severity threshold: [serious, critical]. Violations annotate, do not abort.
    const axeResults = await new AxeBuilder({ page }).analyze();
    const a11yViolations = axeResults.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (a11yViolations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${a11yViolations.length} serious/critical violation(s): ` +
          a11yViolations.map(v => v.id).join(', '),
      });
    }

    // ── Step 2: Accept cookie consent if visible ──────────────────────────────────
    // OneTrust or Cookiebot banner is expected on first load on production.
    // Guard: does not fail if consent was already recorded in storage state.
    // Discovery did not expose the exact button name; trying most common variants.
    const acceptButton = page.getByRole('button', { name: /Aceptar|Accept all|Acepto/i });
    if (await acceptButton.isVisible()) {
      await acceptButton.click();
    }

    // ── Step 3: Verify page title contains "Santalucía" ──────────────────────────
    // discovery identity_assertion.page_title: "Seguros Santalucía"
    await expect(page).toHaveTitle(/Santalucía/i);

    // ── Step 4: Verify canonical URL ─────────────────────────────────────────────
    // css-exception: head meta tag — no semantic locator available for <link rel="canonical">
    // This is the ONLY CSS selector in this file; justified per style-contract
    // css_fallback_attributes (the element has no accessible role).
    const canonical = page.locator('link[rel=canonical]');
    await expect(canonical).toHaveAttribute(
      'href',
      'https://www.santalucia.es/es/segurosmultirramo'
    );

    // ── Step 5: Verify h1 contains "SANTALUCÍA SEGUROS" ──────────────────────────
    // discovery identity_assertion.h1_text: "SANTALUCÍA SEGUROS"
    // forbid_text_equality: true → containText assertion, not strict equality.
    const h1 = page.getByRole('heading', { name: /SANTALUCÍA SEGUROS/i, level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText('SANTALUCÍA SEGUROS');

    // ── Step 6: Verify h2 contains "La tranquilidad de tenerlo todo previsto" ─────
    // discovery identity_assertion.h2_text: "La tranquilidad de tenerlo todo previsto"
    const h2 = page.getByRole('heading', {
      name: /La tranquilidad de tenerlo todo previsto/i,
      level: 2,
    });
    await expect(h2).toBeVisible();
    await expect(h2).toContainText('La tranquilidad de tenerlo todo previsto');

    // ── Step 7: Verify logo visibility ───────────────────────────────────────────
    // discovery: role=img, name="Santalucía Seguros", location=header, strategy=getByRole
    // POM exposes this as homePage.santalucASeguros (getByRole img).
    // Using POM locator directly — first() guards against duplicate img roles in DOM.
    await expect(homePage.santalucASeguros.first()).toBeVisible();

  });

});
