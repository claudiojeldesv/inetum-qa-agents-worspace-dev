import { type Locator, type Page } from '@playwright/test';

/**
 * InventoryPage — Page Object Model for the "inventory" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class InventoryPage {
  readonly page: Page;
  readonly inventorySidebarLink: Locator;
  readonly reactBurgerMenuBtn: Locator;
  readonly reactBurgerCrossBtn: Locator;
  readonly aboutSidebarLink: Locator;
  readonly logoutSidebarLink: Locator;
  readonly resetSidebarLink: Locator;
  readonly productSortContainer: Locator;
  readonly addToCartSauceLabsBackpack: Locator;
  readonly item4TitleLink: Locator;
  readonly item4Img: Locator;
  readonly shoppingCartLink: Locator;
  // Added by ia4d-writer: Remove button for Sauce Labs Backpack (visible after add-to-cart click).
  // data-test="remove-sauce-labs-backpack" is documented in discovery-report under cart screen;
  // the same element appears on inventory after item is added. Flagged in review-feedback.json.
  readonly removeSauceLabsBackpack: Locator;

  constructor(page: Page) {
    this.page = page;
    this.inventorySidebarLink = this.page.getByTestId('inventory-sidebar-link');
    this.reactBurgerMenuBtn = this.page.getByTestId('open-menu');
    this.reactBurgerCrossBtn = this.page.getByTestId('close-menu');
    this.aboutSidebarLink = this.page.getByTestId('about-sidebar-link');
    this.logoutSidebarLink = this.page.getByTestId('logout-sidebar-link');
    this.resetSidebarLink = this.page.getByTestId('reset-sidebar-link');
    this.productSortContainer = this.page.getByTestId('product-sort-container');
    this.addToCartSauceLabsBackpack = this.page.getByTestId('add-to-cart-sauce-labs-backpack');
    this.item4TitleLink = this.page.getByTestId('item-4-title-link');
    this.item4Img = this.page.getByTestId('item-4-img-link');
    this.shoppingCartLink = this.page.getByTestId('shopping-cart-link');
    this.removeSauceLabsBackpack = this.page.getByTestId('remove-sauce-labs-backpack');
  }

  async goto() {
    await this.page.goto('/inventory.html');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
