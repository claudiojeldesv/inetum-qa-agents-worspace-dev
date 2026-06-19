import { type Locator, type Page } from '@playwright/test';

/**
 * SeguroAhorroFichaPage — Page Object Model for the "seguro-ahorro-ficha" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators refined by ia4d-writer (TC004).
 * Discovery-report strategies: discovery-report.json › screens[3] (seguro-ahorro-ficha).
 */
export class SeguroAhorroFichaPage {
  readonly page: Page;
  readonly productHeading: Locator;
  readonly contactOrInformationCta: Locator;

  constructor(page: Page) {
    this.page = page;
    // Discovery strategy: getByRole('heading', { level: 1 })
    // Identity assertion: h1 contains 'Seguro de Ahorro' | 'PIAS' | 'Unit-linked'
    this.productHeading = this.page.getByRole('heading', { level: 1 });
    // Discovery strategy: getByRole('button', { name: /solicitar|te llamamos|contacto|información/i })
    // CTA may also be a link — use .or() in the spec where link variant is needed.
    this.contactOrInformationCta = this.page.getByRole('button', {
      name: /solicitar|te llamamos|contacto|información/i,
    });
  }

  async goto() {
    await this.page.goto('/ahorro-inversion/seguro-ahorro');
  }

  /**
   * Click the primary contact / solicitar-información CTA.
   * Falls back to link variant if no matching button is found.
   */
  async clickContactCta(): Promise<void> {
    const ctaPattern = /solicitar|te llamamos|contacto|información/i;
    const btnVisible = await this.contactOrInformationCta.isVisible().catch(() => false);
    if (btnVisible) {
      await this.contactOrInformationCta.click();
    } else {
      await this.page.getByRole('link', { name: ctaPattern }).first().click();
    }
  }
}
