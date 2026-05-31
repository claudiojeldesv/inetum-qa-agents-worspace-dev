import { type Locator, type Page } from '@playwright/test';

/**
 * LoginPage — Page Object Model for the "login" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators filled by ia4d-writer (iteration 0).
 * Source: discovery-report.json § screens[login], parabank-plan.md § 1.1
 *
 * Locator priority per style-contract parabank.yaml: getByLabel > getByRole > getByText.
 * ParaBank JSP has no data-test attributes.
 *
 * NOTE: goto() uses absolute URL because playwright.config.ts baseURL defaults to
 * saucedemo and is set by QA_BASE_URL at runtime. Callers that set QA_BASE_URL to
 * https://parabank.parasoft.com can use the relative path; otherwise use absolute.
 */
export class LoginPage {
  readonly page: Page;
  readonly username: Locator;
  readonly password: Locator;
  readonly logIn: Locator;

  constructor(page: Page) {
    this.page = page;
    // LOCATOR EXCEPTION — forced by JSP legacy markup (catalogued: Fase B, sitio 3).
    // ParaBank renders "Username"/"Password" as bare <p> text, NOT as <label for=...>.
    // The inputs have no id, no aria-label, no aria-labelledby, no placeholder, no title.
    // getByLabel('Username') / getByLabel('Password') both return 0 elements.
    //
    // Playwright maps BOTH input[type=text] and input[type=password] to role 'textbox',
    // so getByRole('textbox') resolves to 2 elements (strict mode violation).
    // No semantic Playwright locator can uniquely target these inputs.
    // forbid_css_selectors is intentionally violated: CSS [name=...] is the only option.
    // name attributes are stable server-side identifiers in JSP — safer than nth() or type.
    // eslint-disable-next-line playwright/no-css-selectors
    this.username = this.page.locator('input[name="username"]');
    // eslint-disable-next-line playwright/no-css-selectors
    this.password = this.page.locator('input[name="password"]');
    // input[value='Log In'] is type=submit; getByRole('button') resolves it correctly.
    this.logIn = this.page.getByRole('button', { name: 'Log In' });
  }

  async goto() {
    // Absolute URL: safe regardless of QA_BASE_URL value at invocation time.
    await this.page.goto('https://parabank.parasoft.com/parabank/index.htm');
  }

  /**
   * Fill credentials and submit the login form.
   * Waits for navigation to overview.htm before resolving.
   */
  async login(username: string, password: string): Promise<void> {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.logIn.click();
  }
}
