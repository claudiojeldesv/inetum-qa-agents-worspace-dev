/**
 * @criterion TC003 — Planes de Pensiones — Ficha de Producto y CTA Principal
 * @mode S4 autonomous (production real: www.mapfre.es/ahorro-inversion/)
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Scenario: From the Ahorro e Inversión landing, navigate to the Planes de Pensiones
 * product page, verify the page identity, then interact with the preferred CTA
 * (simulator/calculator). Falls back to contratar/información CTA if simulator is
 * not present. Verifies the destination loads without error and exposes the expected
 * interface (input fields for the simulator, or a non-404 informational page).
 *
 * POM pages used:
 *   - LandingPage                (tests/pages/landing.page.ts)
 *   - PlanesPensionesFichaPage   (tests/pages/planes-pensiones-ficha.page.ts)
 *
 * Style Contract: config/style-contracts/mapfre-ahorro-inversion.yaml
 *   - forbid_css_selectors: true
 *   - forbid_wait_for_timeout: true
 *   - a11y: inject_axe_check: true, fail_on_violations: false (warning mode)
 *
 * NOTE: This test runs against Mapfre production. Anti-bot fingerprinting may
 * intercept repeated runs from the same IP/profile. The test structure is correct;
 * green requires a clean browser profile / IP. See docs/findings/faseF-mapfre/.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LandingPage } from '../pages/landing.page';
import { PlanesPensionesFichaPage } from '../pages/planes-pensiones-ficha.page';

const BASE_URL = 'https://www.mapfre.es';

test.describe('Feature: planes-pensiones', () => {
  test('Planes de Pensiones — Ficha de Producto y CTA Principal', async ({ page }, testInfo) => {

    // ── Step 1: Navigate to the Ahorro e Inversión landing ──────────────────
    const landing = new LandingPage(page);
    await page.goto(`${BASE_URL}/ahorro-inversion/`);

    // ── A11y scan (landing) — warning mode, gate off per style contract ──────
    // Style contract: a11y.inject_axe_check = true, fail_on_violations = false
    const a11yLanding = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    if (a11yLanding.violations.length > 0) {
      const criticalLanding = a11yLanding.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      testInfo.annotations.push({
        type: 'a11y-warning',
        description: `Landing: ${criticalLanding.length} serious/critical a11y violations (gate off — see style contract)`,
      });
    }

    // ── Step 2: Accept cookie consent (OneTrust banner, first load) ──────────
    // POM method: landing.acceptCookieConsentIfVisible()
    // Discovery: getByRole('button', { name: /aceptar/i })
    await landing.acceptCookieConsentIfVisible();

    // ── Step 3: Click the "Planes de Pensiones" link ─────────────────────────
    // POM locator: landing.planesDePensionesProductCategory
    // Discovery: getByRole('link', { name: /planes/i })
    await expect(landing.planesDePensionesProductCategory).toBeVisible();
    await landing.planesDePensionesProductCategory.click();

    // ── Step 4: Verify URL and heading on the Planes de Pensiones ficha ──────
    await expect(page).toHaveURL(/planes-de-pensiones/i);

    const ficha = new PlanesPensionesFichaPage(page);
    // POM locator: ficha.productHeading
    // Discovery: getByRole('heading', { level: 1 })
    // identity_assertion: h1 or h2 contains 'Planes de Pensiones'
    await expect(ficha.productHeading).toBeVisible();
    await expect(ficha.productHeading).toContainText(/planes de pensiones/i);

    // ── A11y scan (ficha page) — warning mode ────────────────────────────────
    const a11yFicha = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    if (a11yFicha.violations.length > 0) {
      const criticalFicha = a11yFicha.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      testInfo.annotations.push({
        type: 'a11y-warning',
        description: `PlanesPensionesFicha: ${criticalFicha.length} serious/critical a11y violations (gate off)`,
      });
    }

    // ── Step 5: Locate and click CTA — simulator preferred, contratar fallback
    // POM methods: ficha.clickSimulatorCtaIfVisible() / ficha.clickContratarCta()
    // Discovery:
    //   simulator: getByRole('button'|'link', { name: /simula|calcula|simulador/i })
    //   contratar: getByRole('button'|'link', { name: /contratar|solicitar|información/i })
    const ctaResult = await ficha.clickSimulatorCtaIfVisible();
    let ctaClicked: 'simulator' | 'contratar';

    if (ctaResult === 'simulator') {
      ctaClicked = 'simulator';
    } else {
      await ficha.clickContratarCta();
      ctaClicked = 'contratar';
    }

    testInfo.annotations.push({
      type: 'cta-branch',
      description: `TC003: CTA clicked = ${ctaClicked}`,
    });

    // ── Step 6: Verify destination ───────────────────────────────────────────
    // Simulator branch: at least one numeric input OR calculate button visible.
    // Contratar branch: page has a heading and it is not a 404.
    // No waitForTimeout — waits are locator-assertion-based (style contract).
    if (ctaClicked === 'simulator') {
      // Discovery (simulador-ahorro): getByLabel(/aportación|capital|plazo|años/i)
      //   and getByRole('button', { name: /calcular|simular|resultados/i })
      const simulatorInput   = page.getByLabel(/aportación|capital|plazo|años/i).first();
      const calculateButton  = page.getByRole('button', { name: /calcular|simular|resultados/i });

      const inputVisible  = await simulatorInput.isVisible({ timeout: 8000 }).catch(() => false);
      const buttonVisible = await calculateButton.isVisible({ timeout: 3000 }).catch(() => false);

      // At least one simulator UI element must be present (widget or dedicated page)
      expect(
        inputVisible || buttonVisible,
        'Simulator destination: expected at least one input field or calculate button to be visible',
      ).toBe(true);

      testInfo.annotations.push({
        type: 'simulator-check',
        description: `input visible: ${inputVisible}, calculate button visible: ${buttonVisible}`,
      });
    } else {
      // Contratar / información branch: page navigated, heading present, no 404
      const anyHeading = page.getByRole('heading').first();
      await expect(anyHeading).toBeVisible({ timeout: 8000 });

      const headingText = (await anyHeading.textContent()) ?? '';
      expect(headingText).not.toMatch(/404|no encontrado|not found/i);

      testInfo.annotations.push({
        type: 'contratar-check',
        description: `Destination URL: ${page.url()}, heading: "${headingText.trim()}"`,
      });
    }

    // ── Screenshot evidence (style contract: evidence.screenshots = on) ──────
    await page.screenshot({
      path: '.work/tc003-planes-pensiones-cta.png',
      fullPage: false,
    });
  });
});
