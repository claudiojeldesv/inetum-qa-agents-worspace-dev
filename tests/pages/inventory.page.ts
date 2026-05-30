import { type Locator, type Page } from '@playwright/test';

/**
 * InventoryPage — Page Object Model for the "inventory" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class InventoryPage {
  readonly page: Page;
  readonly addToCartSauceLabsBackpack: Locator;
  readonly shoppingCartLink: Locator;
  readonly shoppingCartBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addToCartSauceLabsBackpack = this.page.getByTestId('add-to-cart-sauce-labs-backpack');
    this.shoppingCartLink = this.page.getByTestId('shopping-cart-link');
    this.shoppingCartBadge = this.page.getByTestId('shopping-cart-badge');
  }

  async goto() {
    await this.page.goto('https://www.saucedemo.com/inventory.html');
  }

  async addBackpackToCart() {
    await this.addToCartSauceLabsBackpack.click();
  }

  async openCart() {
    await this.shoppingCartLink.click();
  }
}
