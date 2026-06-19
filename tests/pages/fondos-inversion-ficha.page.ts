import { type Locator, type Page } from '@playwright/test';

/**
 * FondosInversionFichaPage — Page Object Model for the "fondos-inversion-ficha" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators refined by ia4d-writer (TC002).
 * Source: discovery-report.json → screens[1] (fondos-inversion-ficha).
 *
 * URL pattern: /ahorro-inversion/fondos-de-inversion
 */
export class FondosInversionFichaPage {
  readonly page: Page;
  /** Main product page heading (h1). discovery strategy: getByRole('heading', { level: 1 }) */
  readonly mainHeading: Locator;
  /**
   * Primary CTA button: "Contratar", "Solicitar información", or "Simulador".
   * discovery strategy: getByRole('button', { name: /contratar|solicitar|simulador/i })
   */
  readonly primaryCta: Locator;

  constructor(page: Page) {
    this.page = page;
    this.mainHeading = this.page.getByRole('heading', { level: 1 });
    this.primaryCta = this.page.getByRole('button', { name: /contratar|solicitar|simulador/i }).first();
  }

  async goto() {
    await this.page.goto('/ahorro-inversion/fondos-de-inversion');
  }

  /**
   * Click the primary CTA and wait for any resulting navigation or modal.
   * The exact destination is unknown at spec-write time (lead form, wizard, or modal).
   */
  async clickPrimaryCta(): Promise<void> {
    await this.primaryCta.click();
  }
}
