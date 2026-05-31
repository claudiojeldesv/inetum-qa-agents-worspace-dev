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
  readonly login: Locator;

  constructor(page: Page) {
    this.page = page;
    this.username = this.page.getByRole('textbox', { name: 'Username' });
    // type=password inputs are not exposed as role=textbox; getByLabel is the correct semantic fallback
    this.password = this.page.getByLabel('Password');
    this.login = this.page.getByRole('button', { name: 'Login' });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async loginWith(username: string, password: string): Promise<void> {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.login.click();
  }
}
