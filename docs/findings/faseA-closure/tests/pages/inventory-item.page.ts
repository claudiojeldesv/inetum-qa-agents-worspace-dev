import { type Locator, type Page } from '@playwright/test';

/**
 * InventoryItemPage — Page Object Model for the "inventory-item" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class InventoryItemPage {
  readonly page: Page;
  readonly addToCart: Locator;
  readonly backToProducts: Locator;
  readonly reactBurgerMenuBtn: Locator;
  readonly shoppingCartLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addToCart = this.page.getByTestId('add-to-cart');
    this.backToProducts = this.page.getByTestId('back-to-products');
    this.reactBurgerMenuBtn = this.page.getByTestId('react-burger-menu-btn');
    this.shoppingCartLink = this.page.getByTestId('shopping_cart_link');
  }

  async goto() {
    await this.page.goto('/inventory-item.html?id=');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
