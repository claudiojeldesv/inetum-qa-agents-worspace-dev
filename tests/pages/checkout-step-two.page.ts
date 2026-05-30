import { type Locator, type Page } from '@playwright/test';

/**
 * CheckoutStepTwoPage — Page Object Model for the "checkout-step-two" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CheckoutStepTwoPage {
  readonly page: Page;
  readonly finish: Locator;

  constructor(page: Page) {
    this.page = page;
    this.finish = this.page.getByTestId('finish');
  }

  async goto() {
    await this.page.goto('https://www.saucedemo.com/checkout-step-two.html');
  }

  async finishOrder() {
    await this.finish.click();
  }
}
