import { type Locator, type Page } from '@playwright/test';

/**
 * CartPage — Page Object Model for the "cart" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CartPage {
  readonly page: Page;
  readonly title: Locator;
  readonly cartList: Locator;
  readonly checkout: Locator;
  readonly continueShopping: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = this.page.getByTestId('title');
    this.cartList = this.page.getByTestId('cart-list');
    this.checkout = this.page.getByTestId('checkout');
    this.continueShopping = this.page.getByTestId('continue-shopping');
  }

  async goto() {
    await this.page.goto('/cart.html');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
