import { type Locator, type Page } from '@playwright/test';

/**
 * LoginPage — Page Object Model for the "login" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class LoginPage {
  readonly page: Page;
  readonly username: Locator;
  readonly password: Locator;
  readonly loginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.username = this.page.getByTestId('username');
    this.password = this.page.getByTestId('password');
    this.loginButton = this.page.getByTestId('login-button');
  }

  async goto() {
    await this.page.goto('https://www.saucedemo.com/');
  }

  async loginAs(username: string, password: string) {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.loginButton.click();
  }
}
