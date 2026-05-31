import { type Locator, type Page } from '@playwright/test';

/**
 * ProductPage — Page Object Model for the "product" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class ProductPage {
  readonly page: Page;
  readonly quantity: Locator;
  readonly addToCart: Locator;
  readonly navCart: Locator;
  readonly cartQuantity: Locator;

  constructor(page: Page) {
    this.page = page;
    this.quantity = this.page.getByTestId('quantity');
    this.addToCart = this.page.getByTestId('add-to-cart');
    this.navCart = this.page.getByTestId('nav-cart');
    this.cartQuantity = this.page.getByTestId('cart-quantity');
  }

  async goto() {
    await this.page.goto('/product/:id');
  }

  async addToCartAndWaitForBadge(): Promise<void> {
    await this.addToCart.click();
    // nav-cart and cart-quantity are conditionally rendered (SPA, Angular).
    // They do NOT exist in the DOM before the first add — do not assert their
    // absence prior to this call. After click, wait for them to be visible.
    await this.cartQuantity.waitFor({ state: 'visible' });
  }
}
