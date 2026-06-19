import { type Locator, type Page } from '@playwright/test';

/**
 * PlanesPensionesFichaPage — Page Object Model for the "planes-pensiones-ficha" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators updated by ia4d-writer (TC003)
 * to match discovery-report strategies.
 *
 * Discovery screen: "planes-pensiones-ficha"
 *   url_pattern: /ahorro-inversion/planes-de-pensiones
 *   identity_assertion: h1 or h2 contains 'Planes de Pensiones'
 */
export class PlanesPensionesFichaPage {
  readonly page: Page;

  /** Discovery: getByRole('heading', { level: 1 }) */
  readonly productHeading: Locator;

  /**
   * Simulator / calculator CTA (preferred).
   * Discovery: getByRole('button', { name: /simula|calcula|simulador/i })
   */
  readonly simulatorCtaButton: Locator;

  /**
   * Simulator CTA as anchor link (alternative when not a button).
   * Discovery: getByRole('link', { name: /simula|calcula|simulador/i })
   */
  readonly simulatorCtaLink: Locator;

  /**
   * Contratar / información CTA (fallback).
   * Discovery: getByRole('button', { name: /contratar|solicitar|información/i })
   */
  readonly contratarCtaButton: Locator;

  /**
   * Contratar / información CTA as anchor link (alternative when not a button).
   * Discovery: getByRole('link', { name: /contratar|solicitar|información/i })
   */
  readonly contratarCtaLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.productHeading      = this.page.getByRole('heading', { level: 1 });
    this.simulatorCtaButton  = this.page.getByRole('button', { name: /simula|calcula|simulador/i });
    this.simulatorCtaLink    = this.page.getByRole('link',   { name: /simula|calcula|simulador/i });
    this.contratarCtaButton  = this.page.getByRole('button', { name: /contratar|solicitar|información/i });
    this.contratarCtaLink    = this.page.getByRole('link',   { name: /contratar|solicitar|información/i });
  }

  async goto(baseUrl = '') {
    await this.page.goto(`${baseUrl}/ahorro-inversion/planes-de-pensiones`);
  }

  /**
   * Clicks the simulator CTA if visible (button or link).
   * Returns 'simulator' if clicked, 'not-found' otherwise.
   */
  async clickSimulatorCtaIfVisible(): Promise<'simulator' | 'not-found'> {
    const buttonVisible = await this.simulatorCtaButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (buttonVisible) {
      await this.simulatorCtaButton.first().click();
      return 'simulator';
    }
    const linkVisible = await this.simulatorCtaLink.isVisible({ timeout: 3000 }).catch(() => false);
    if (linkVisible) {
      await this.simulatorCtaLink.first().click();
      return 'simulator';
    }
    return 'not-found';
  }

  /**
   * Clicks the contratar/información CTA (button or link).
   * Used as fallback when no simulator CTA is found.
   */
  async clickContratarCta(): Promise<void> {
    const buttonVisible = await this.contratarCtaButton.isVisible({ timeout: 3000 }).catch(() => false);
    if (buttonVisible) {
      await this.contratarCtaButton.first().click();
    } else {
      await this.contratarCtaLink.first().click();
    }
  }
}
