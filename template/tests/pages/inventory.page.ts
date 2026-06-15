import { type Locator, type Page } from '@playwright/test';

/**
 * InventoryPage — Page Object Model for the "inventory" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class InventoryPage {
  readonly page: Page;
  readonly title: Locator;
  readonly inventoryList: Locator;
  readonly shoppingCartLink: Locator;
  readonly addToCartSauceLabsBackpack: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = this.page.getByTestId('title');
    this.inventoryList = this.page.getByTestId('inventory-list');
    this.shoppingCartLink = this.page.getByTestId('shopping-cart-link');
    this.addToCartSauceLabsBackpack = this.page.getByTestId('add-to-cart-sauce-labs-backpack');
  }

  async goto() {
    await this.page.goto('/inventory.html');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
