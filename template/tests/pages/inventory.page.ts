import { type Locator, type Page } from '@playwright/test';

/**
 * InventoryPage — Page Object Model for the "inventory" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class InventoryPage {
  readonly page: Page;
  readonly addToCartSauceLabsBackpack: Locator;
  readonly addToCartSauceLabsBikeLight: Locator;
  readonly shoppingCartIcon: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addToCartSauceLabsBackpack = this.page.getByTestId('add-to-cart-sauce-labs-backpack');
    this.addToCartSauceLabsBikeLight = this.page.getByTestId('add-to-cart-sauce-labs-bike-light');
    this.shoppingCartIcon = this.page.getByTestId('shopping-cart-link');
  }

  async goto() {
    await this.page.goto('/inventory.html');
  }

  heading() {
    // The title element is a <span data-test="title">, not a heading role.
    return this.page.getByTestId('title');
  }

  // TODO writer: locator missing from discovery — no data-test attr on product card container;
  // .inventory_item CSS forbidden by style contract. Use data-test when discovery is updated.

  async addBackpackToCart(): Promise<void> {
    await this.addToCartSauceLabsBackpack.click();
  }

  async addBikeLightToCart(): Promise<void> {
    await this.addToCartSauceLabsBikeLight.click();
  }

  async openCart(): Promise<void> {
    await this.shoppingCartIcon.click();
  }
}
