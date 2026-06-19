/**
 * @criterion TC001 — Landing Page — Aterrizaje y Navegación de Sección
 *   Source: .work/discovery-report.json → scenarios_recommended[0] (feature: landing)
 *   Steps: navigate to /, accept cookie consent, verify h1 identity, verify product
 *   category links (fondos, planes, seguro de ahorro), verify section nav/breadcrumb.
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Target: https://www.mapfre.es/ahorro-inversion/ (baseURL via QA_BASE_URL env-var)
 * Style Contract: config/style-contracts/mapfre-ahorro-inversion.yaml
 * Mode: S4 Autonomous (no criteria.json)
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { LandingPage } from '../pages/landing.page';

test.describe('Feature: landing — Ahorro e Inversión (www.mapfre.es)', () => {

  test('Scenario: Landing Page — Aterrizaje y Navegación de Sección', async ({ page }) => {

    const landingPage = new LandingPage(page);

    // ── Step 1: Navigate to ahorro-inversion landing ──────────────────────────
    await landingPage.goto();

    // ── A11y check — gate off (fail_on_violations: false), modo WARNING auditable
    // Injected immediately after goto per SPEC §4 and style-contract a11y settings.
    // Severity threshold: [serious, critical]
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

    // ── Step 2: Accept cookie consent (OneTrust) if visible ───────────────────
    // Precondition: OneTrust banner appears on first load.
    // Guard: does not fail if consent was already accepted (remembered by browser).
    await landingPage.acceptCookieConsentIfVisible();

    // ── Step 3: Verify h1 contains "Ahorro" or "Inversión" ───────────────────
    // The discovery identity assertion: h1 text contains 'Ahorro' or 'Inversión'
    await expect(landingPage.mainHeading).toBeVisible();
    await expect(landingPage.mainHeading).toContainText(/Ahorro|Inversión/i);

    // ── Step 4: Verify product category links are visible ─────────────────────
    // Fondos de Inversión — discovery strategy: getByRole('link', { name: /fondos/i })
    await expect(landingPage.fondosDeInversiNProductCategory).toBeVisible();

    // Planes de Pensiones — discovery strategy: getByRole('link', { name: /planes/i })
    await expect(landingPage.planesDePensionesProductCategory).toBeVisible();

    // Seguro de Ahorro — discovery strategy: getByRole('link', { name: /seguro.*ahorro/i })
    await expect(landingPage.seguroDeAhorroProductCategory).toBeVisible();

    // ── Step 5: Verify breadcrumb / section nav for "Ahorro e Inversión" ─────
    // discovery strategy: getByText(/Ahorro e Inversión/i) — nav or breadcrumb element
    await expect(landingPage.breadcrumbOrSectionHeader).toBeVisible();
  });

});
