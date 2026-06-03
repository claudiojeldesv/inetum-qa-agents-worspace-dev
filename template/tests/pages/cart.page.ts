import { type Locator, type Page } from '@playwright/test';

/**
 * CartPage — Page Object Model for the "cart" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CartPage {
  readonly page: Page;
  readonly continueShopping: Locator;
  readonly checkout: Locator;

  constructor(page: Page) {
    this.page = page;
    this.continueShopping = this.page.getByRole('button', { name: 'Continue Shopping' });
    this.checkout = this.page.getByTestId('checkout');
  }

  async goto() {
    await this.page.goto('/cart.html');
  }

  async proceedToCheckout(): Promise<void> {
    await this.checkout.click();
  }
}
