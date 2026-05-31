import { type Locator, type Page } from '@playwright/test';

/**
 * CartPage — Page Object Model for the "cart" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CartPage {
  readonly page: Page;
  readonly productQuantity: Locator;
  readonly cartQuantity: Locator;

  constructor(page: Page) {
    this.page = page;
    this.productQuantity = this.page.getByTestId('product-quantity');
    this.cartQuantity = this.page.getByTestId('cart-quantity');
  }

  async goto() {
    await this.page.goto('/checkout');
  }

  async getLineItemQuantity(): Promise<string | null> {
    return this.productQuantity.inputValue();
  }
}
