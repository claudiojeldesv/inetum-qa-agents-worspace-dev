import { type Locator, type Page } from '@playwright/test';

/**
 * CheckoutCompletePage — Page Object Model for the "checkout-complete" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CheckoutCompletePage {
  readonly page: Page;
  /** h2 heading: "Thank you for your order!" */
  readonly thankYouHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.thankYouHeading = this.page.getByRole('heading', { name: 'Thank you for your order!' });
  }

  async goto() {
    await this.page.goto('https://www.saucedemo.com/checkout-complete.html');
  }
}
