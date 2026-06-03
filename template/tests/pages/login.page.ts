import { type Locator, type Page } from '@playwright/test';

/**
 * LoginPage — Page Object Model for the "login" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 *
 * Locator note: ParaBank is JSP legacy with no accessible labels on form inputs and
 * no data-test attributes. CSS attribute selectors for `name` are used per the
 * css_fallback_attributes whitelist declared in style-contracts/parabank.yaml.
 * The Log In button is input[type=submit], not a role=button — getByRole falls back
 * to the CSS fallback per contract.
 */
export class LoginPage {
  readonly page: Page;
  // css_fallback: name (whitelist: parabank.yaml › locators.css_fallback_attributes)
  readonly username: Locator;
  readonly password: Locator;
  readonly logIn: Locator;
  readonly customerLoginHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    // css_fallback: name — no semantic label available (JSP legacy, discovery-report.json)
    this.username = this.page.locator("input[name='username']");
    this.password = this.page.locator("input[name='password']");
    // Playwright exposes input[type=submit] as role=button; preferred over css_fallback.
    this.logIn = this.page.getByRole('button', { name: 'Log In' });
    this.customerLoginHeading = this.page.getByRole('heading', { name: 'Customer Login' });
  }

  async goto() {
    await this.page.goto('/parabank/index.htm');
  }

  async login(username: string, password: string) {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.logIn.click();
  }
}
