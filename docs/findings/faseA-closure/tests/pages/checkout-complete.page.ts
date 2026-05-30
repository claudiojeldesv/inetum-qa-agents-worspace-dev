import { type Locator, type Page } from '@playwright/test';

/**
 * CheckoutCompletePage — Page Object Model for the "checkout-complete" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CheckoutCompletePage {
  readonly page: Page;
  readonly backToProducts: Locator;
  readonly reactBurgerMenuBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.backToProducts = this.page.getByTestId('back-to-products');
    this.reactBurgerMenuBtn = this.page.getByTestId('open-menu');
  }

  async goto() {
    await this.page.goto('/checkout-complete.html');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
