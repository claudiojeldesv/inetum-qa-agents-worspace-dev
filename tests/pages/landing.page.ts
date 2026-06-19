import { type Locator, type Page } from '@playwright/test';

/**
 * LandingPage — Page Object Model for the "landing" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class LandingPage {
  readonly page: Page;
  readonly cookieConsentAccept: Locator;
  readonly mainHeading: Locator;
  readonly fondosDeInversiNProductCategory: Locator;
  readonly planesDePensionesProductCategory: Locator;
  readonly seguroDeAhorroProductCategory: Locator;
  readonly breadcrumbOrSectionHeader: Locator;

  constructor(page: Page) {
    this.page = page;
    // discovery-report strategy: getByRole('button', { name: /aceptar/i }) — OneTrust consent
    this.cookieConsentAccept = this.page.getByRole('button', { name: /aceptar/i });
    // landing screen identity heading — h1 contains 'Ahorro' or 'Inversión'
    this.mainHeading = this.page.getByRole('heading', { level: 1 });
    // discovery-report strategy: getByRole('link', { name: /fondos/i })
    this.fondosDeInversiNProductCategory = this.page.getByRole('link', { name: /fondos/i }).first();
    // discovery-report strategy: getByRole('link', { name: /planes/i })
    this.planesDePensionesProductCategory = this.page.getByRole('link', { name: /planes/i }).first();
    // discovery-report strategy: getByRole('link', { name: /ahorro/i }) — Seguro de Ahorro
    this.seguroDeAhorroProductCategory = this.page.getByRole('link', { name: /seguro.*ahorro/i }).first();
    // discovery-report strategy: getByRole('navigation') or getByText(/Ahorro e Inversión/i)
    this.breadcrumbOrSectionHeader = this.page.getByText(/Ahorro e Inversión/i).first();
  }

  async goto() {
    await this.page.goto('/ahorro-inversion/');
  }

  /**
   * Accept OneTrust cookie consent banner if present.
   * Uses isVisible() guard — does not fail if banner has already been dismissed.
   */
  async acceptCookieConsentIfVisible(): Promise<void> {
    if (await this.cookieConsentAccept.isVisible()) {
      await this.cookieConsentAccept.click();
    }
  }

  /** Click the Fondos de Inversión product category link and wait for navigation. */
  async clickFondosDeInversion(): Promise<void> {
    await this.fondosDeInversiNProductCategory.click();
  }
}
