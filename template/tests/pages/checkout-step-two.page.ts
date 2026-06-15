import { type Locator, type Page } from '@playwright/test';

/**
 * CheckoutStepTwoPage — Page Object Model for the "checkout-step-two" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CheckoutStepTwoPage {
  readonly page: Page;
  readonly title: Locator;
  readonly subtotalLabel: Locator;
  readonly taxLabel: Locator;
  readonly totalLabel: Locator;
  readonly finish: Locator;
  readonly cancel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = this.page.getByTestId('title');
    this.subtotalLabel = this.page.getByTestId('subtotal-label');
    this.taxLabel = this.page.getByTestId('tax-label');
    this.totalLabel = this.page.getByTestId('total-label');
    this.finish = this.page.getByTestId('finish');
    this.cancel = this.page.getByTestId('cancel');
  }

  async goto() {
    await this.page.goto('/checkout-step-two.html');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
