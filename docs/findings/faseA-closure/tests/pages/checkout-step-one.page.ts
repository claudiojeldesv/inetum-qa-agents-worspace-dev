import { type Locator, type Page } from '@playwright/test';

/**
 * CheckoutStepOnePage — Page Object Model for the "checkout-step-one" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CheckoutStepOnePage {
  readonly page: Page;
  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly postalCode: Locator;
  readonly continue: Locator;
  readonly cancel: Locator;
  readonly errorButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.firstName = this.page.getByTestId('firstName');
    this.lastName = this.page.getByTestId('lastName');
    this.postalCode = this.page.getByTestId('postalCode');
    this.continue = this.page.getByTestId('continue');
    this.cancel = this.page.getByTestId('cancel');
    this.errorButton = this.page.getByTestId('error-button');
  }

  async goto() {
    await this.page.goto('/checkout-step-one.html');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
