import { type Locator, type Page } from '@playwright/test';

/**
 * CartPage — Page Object Model for the "cart" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CartPage {
  readonly page: Page;
  readonly removeSauceLabsBackpack: Locator;
  readonly continueShopping: Locator;
  readonly checkout: Locator;
  readonly reactBurgerMenuBtn: Locator;
  readonly shoppingCartLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.removeSauceLabsBackpack = this.page.getByTestId('remove-sauce-labs-backpack');
    this.continueShopping = this.page.getByTestId('continue-shopping');
    this.checkout = this.page.getByTestId('checkout');
    this.reactBurgerMenuBtn = this.page.getByTestId('open-menu');
    this.shoppingCartLink = this.page.getByTestId('shopping-cart-link');
  }

  async goto() {
    await this.page.goto('/cart.html');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
