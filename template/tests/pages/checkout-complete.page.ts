import { type Locator, type Page } from '@playwright/test';

/**
 * CheckoutCompletePage — Page Object Model for the "checkout-complete" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CheckoutCompletePage {
  readonly page: Page;
  readonly backHome: Locator;

  constructor(page: Page) {
    this.page = page;
    this.backHome = this.page.getByRole('button', { name: 'Back Home' });
  }

  async goto() {
    await this.page.goto('/checkout-complete.html');
  }

  confirmationHeading() {
    return this.page.getByRole('heading', { name: 'Thank you for your order!' });
  }
}
