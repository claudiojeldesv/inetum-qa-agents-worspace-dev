import { type Locator, type Page } from '@playwright/test';

/**
 * CheckoutCompletePage — Page Object Model for the "checkout-complete" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CheckoutCompletePage {
  readonly page: Page;
  readonly title: Locator;
  readonly completeHeader: Locator;
  readonly completeText: Locator;
  readonly ponyExpress: Locator;
  readonly backToProducts: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = this.page.getByTestId('title');
    this.completeHeader = this.page.getByTestId('complete-header');
    this.completeText = this.page.getByTestId('complete-text');
    this.ponyExpress = this.page.getByTestId('pony-express');
    this.backToProducts = this.page.getByTestId('back-to-products');
  }

  async goto() {
    await this.page.goto('/checkout-complete.html');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
