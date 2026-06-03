import { type Locator, type Page } from '@playwright/test';

/**
 * CheckoutStepTwoPage — Page Object Model for the "checkout-step-two" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CheckoutStepTwoPage {
  readonly page: Page;
  readonly cancel: Locator;
  readonly finish: Locator;

  constructor(page: Page) {
    this.page = page;
    this.cancel = this.page.getByRole('button', { name: 'Cancel' });
    this.finish = this.page.getByTestId('finish');
  }

  async goto() {
    await this.page.goto('/checkout-step-two.html');
  }

  async placeOrder(): Promise<void> {
    await this.finish.click();
  }
}
