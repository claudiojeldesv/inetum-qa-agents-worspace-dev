import { type Locator, type Page } from '@playwright/test';

/**
 * LoginPage — Page Object Model for the "login" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class LoginPage {
  readonly page: Page;
  readonly userName: Locator;
  readonly password: Locator;
  readonly loginButton: Locator;
  readonly errorButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.userName = this.page.getByTestId('username');
    this.password = this.page.getByTestId('password');
    this.loginButton = this.page.getByTestId('login-button');
    this.errorButton = this.page.getByTestId('error-button');
  }

  async goto() {
    await this.page.goto('/');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
