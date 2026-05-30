import { type Locator, type Page } from '@playwright/test';

/**
 * CheckoutStepOnePage — Page Object Model for the "checkout-step-one" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CheckoutStepOnePage {
  readonly page: Page;
  readonly firstname: Locator;
  readonly lastname: Locator;
  readonly postalcode: Locator;
  readonly continue: Locator;

  constructor(page: Page) {
    this.page = page;
    this.firstname = this.page.getByTestId('firstName');
    this.lastname = this.page.getByTestId('lastName');
    this.postalcode = this.page.getByTestId('postalCode');
    this.continue = this.page.getByTestId('continue');
  }

  async goto() {
    await this.page.goto('https://www.saucedemo.com/checkout-step-one.html');
  }

  async fillCustomerInfo(firstName: string, lastName: string, postalCode: string) {
    await this.firstname.fill(firstName);
    await this.lastname.fill(lastName);
    await this.postalcode.fill(postalCode);
    await this.continue.click();
  }
}
