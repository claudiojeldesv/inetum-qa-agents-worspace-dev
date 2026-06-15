import { type Locator, type Page } from '@playwright/test';

/**
 * CheckoutStepOnePage — Page Object Model for the "checkout-step-one" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CheckoutStepOnePage {
  readonly page: Page;
  readonly title: Locator;
  readonly firstname: Locator;
  readonly lastname: Locator;
  readonly postalcode: Locator;
  readonly continue: Locator;
  readonly cancel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = this.page.getByTestId('title');
    this.firstname = this.page.getByTestId('firstName');
    this.lastname = this.page.getByTestId('lastName');
    this.postalcode = this.page.getByTestId('postalCode');
    this.continue = this.page.getByTestId('continue');
    this.cancel = this.page.getByTestId('cancel');
  }

  async goto() {
    await this.page.goto('/checkout-step-one.html');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
