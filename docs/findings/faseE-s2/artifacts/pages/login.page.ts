import { type Locator, type Page } from '@playwright/test';

/**
 * LoginPage — Page Object Model for the "login" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions filled by ia4d-writer (S3 mode, RF-001).
 *
 * Locator note: ParaBank JSP legacy has no labels on the credential inputs — the
 * inputs are identified via name attribute (css_fallback:name declared in style-contract).
 * getByRole('textbox') would match both fields; css_fallback by name is the correct
 * unambiguous selector here per contract whitelist.
 */
export class LoginPage {
  readonly page: Page;
  // css-fallback: name — no label/aria on these inputs (ParaBank JSP legacy); css_fallback_attributes.name declared in style-contract
  readonly username: Locator;
  // css-fallback: name — same reason as above
  readonly password: Locator;
  // getByRole resolves the submit button semantically
  readonly logIn: Locator;
  /** Heading "Customer Login" — presence confirms the unauthenticated login screen is displayed. */
  readonly customerLoginHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    // css-fallback: name
    this.username = this.page.locator("input[name='username']");
    // css-fallback: name
    this.password = this.page.locator("input[name='password']");
    this.logIn = this.page.getByRole('button', { name: 'Log In' });
    this.customerLoginHeading = this.page.getByRole('heading', { name: 'Customer Login' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/parabank/index.htm', { waitUntil: 'domcontentloaded' });
  }

  /**
   * Fills the credential form and submits it.
   * Used by both login.spec.ts and auth.setup.ts.
   */
  async login(username: string, password: string): Promise<void> {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.logIn.click();
  }
}
