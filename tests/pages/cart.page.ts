import { type Locator, type Page } from '@playwright/test';

/**
 * CartPage — Page Object Model for the "cart" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CartPage {
  readonly page: Page;
  readonly checkout: Locator;
  readonly continueShopping: Locator;

  constructor(page: Page) {
    this.page = page;
    this.checkout = this.page.getByTestId('checkout');
    this.continueShopping = this.page.getByTestId('continue-shopping');
  }

  async goto() {
    await this.page.goto('https://www.saucedemo.com/cart.html');
  }

  async proceedToCheckout() {
    await this.checkout.click();
  }
}
