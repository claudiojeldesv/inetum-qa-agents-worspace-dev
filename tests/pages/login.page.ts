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
  readonly login2: Locator;
  /** Alert shown when credentials are invalid. Text "Invalid credentials" verified in vivo by planner. */
  readonly invalidCredentialsAlert: Locator;
  /** Validation messages rendered by OrangeHRM below empty required fields.
   *  OrangeHRM renders the exact text "Required" (verified in vivo) as two
   *  separate span elements — one beneath Username, one beneath Password.
   *  Semantic locator via getByText; CSS class oxd-input--error is forbidden
   *  by contract (forbid_css_selectors: true). */
  readonly requiredMessages: Locator;

  constructor(page: Page) {
    this.page = page;
    this.username = this.page.getByRole('textbox', { name: 'Username' });
    this.password = this.page.getByRole('textbox', { name: 'Password' });
    this.login = this.page.getByRole('button', { name: 'Login' });
    this.login2 = this.page.getByRole('heading', { name: 'Login' });
    this.invalidCredentialsAlert = this.page.getByText('Invalid credentials');
    // { exact: true } prevents matching partial strings containing "Required"
    this.requiredMessages = this.page.getByText('Required', { exact: true });
  }

  async goto() {
    await this.page.goto('/web/index.php/auth/login');
  }

  async doLogin(username: string, password: string) {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.login.click();
  }

  async submitEmpty() {
    // Fields are already empty on a fresh page load; click Login to trigger client-side validation
    await this.login.click();
  }
}
