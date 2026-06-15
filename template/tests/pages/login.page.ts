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
  // Error state locators — present after a failed login attempt (plan §2.1)
  readonly errorContainer: Locator;
  readonly errorButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.username = this.page.getByTestId('username');
    this.password = this.page.getByTestId('password');
    this.loginButton = this.page.getByTestId('login-button');
    this.errorContainer = this.page.getByTestId('error');
    this.errorButton = this.page.getByTestId('error-button');
  }

  async goto() {
    await this.page.goto('/');
  }

  async loginAs(user: string, pass: string): Promise<void> {
    await this.username.fill(user);
    await this.password.fill(pass);
    await this.loginButton.click();
  }
}
