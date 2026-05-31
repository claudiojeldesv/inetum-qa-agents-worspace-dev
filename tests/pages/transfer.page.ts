import { type Locator, type Page } from '@playwright/test';

/**
 * TransferPage — Page Object Model for the "transfer" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 *
 * LOCATOR EXCEPTION — forced by JSP legacy markup (catalogued: Fase B, sitio 3).
 * ParaBank's transfer.htm renders no <label for=...>, no aria-label, no placeholder,
 * and no data-test attributes on its form inputs/selects.
 * getByRole('textbox', { name: 'Amount' }) and getByRole('combobox', { name: ... })
 * both return 0 elements because there is no accessible name attached.
 * CSS [name=...] selectors are the only stable option; name attributes are server-side
 * JSP identifiers, not presentation details — equivalent safety to data-test in this context.
 * forbid_css_selectors is intentionally violated for all form locators below.
 * Same exception pattern already applied in login.page.ts.
 *
 * NOTE: goto() uses absolute URL because playwright.config.ts baseURL defaults to
 * saucedemo and is set by QA_BASE_URL at runtime. Absolute URL is safe regardless.
 */
export class TransferPage {
  readonly page: Page;
  readonly amount: Locator;
  readonly fromAccount: Locator;
  readonly toAccount: Locator;
  readonly transfer: Locator;
  readonly transferComplete: Locator;

  constructor(page: Page) {
    this.page = page;
    // DOM inspection (Fase B, sitio 3): amount input has id="amount", name="input" (misleading).
    // Selects have id="fromAccountId" / id="toAccountId" with empty name attributes.
    // Targeting by id via CSS — stable JSP identifiers, equivalent to data-test safety.
    // eslint-disable-next-line playwright/no-css-selectors
    this.amount = this.page.locator('#amount');
    // eslint-disable-next-line playwright/no-css-selectors
    this.fromAccount = this.page.locator('#fromAccountId');
    // eslint-disable-next-line playwright/no-css-selectors
    this.toAccount = this.page.locator('#toAccountId');
    // input[type=submit][value='Transfer'] — getByRole('button') resolves submit inputs correctly.
    this.transfer = this.page.getByRole('button', { name: 'Transfer' });
    this.transferComplete = this.page.getByRole('heading', { name: 'Transfer Complete!' });
  }

  async goto() {
    // Absolute URL: safe regardless of QA_BASE_URL value at invocation time.
    await this.page.goto('https://parabank.parasoft.com/parabank/transfer.htm');
  }

  /**
   * Fills the transfer form and submits it.
   * Combobox values are the raw option values ('13344', '15564').
   */
  async transferFunds(amount: string, fromAccount: string, toAccount: string): Promise<void> {
    await this.amount.fill(amount);
    await this.fromAccount.selectOption(fromAccount);
    await this.toAccount.selectOption(toAccount);
    await this.transfer.click();
  }
}
