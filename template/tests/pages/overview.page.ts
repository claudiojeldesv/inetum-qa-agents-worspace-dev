import { type Locator, type Page } from '@playwright/test';

/**
 * OverviewPage — Page Object Model for the "overview" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class OverviewPage {
  readonly page: Page;
  readonly openNewAccount: Locator;
  readonly accountsOverview: Locator;
  readonly transferFunds: Locator;
  readonly billPay: Locator;
  readonly findTransactions: Locator;
  readonly updateContactInfo: Locator;
  readonly requestLoan: Locator;
  readonly logOut: Locator;
  readonly accountsOverviewHeading: Locator;
  // The accounts table has no id/data-test; located by role in the main content area.
  readonly accountsTable: Locator;
  readonly welcomeMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.openNewAccount = this.page.getByRole('link', { name: 'Open New Account' });
    this.accountsOverview = this.page.getByRole('link', { name: 'Accounts Overview' });
    this.transferFunds = this.page.getByRole('link', { name: 'Transfer Funds' });
    this.billPay = this.page.getByRole('link', { name: 'Bill Pay' });
    this.findTransactions = this.page.getByRole('link', { name: 'Find Transactions' });
    this.updateContactInfo = this.page.getByRole('link', { name: 'Update Contact Info' });
    this.requestLoan = this.page.getByRole('link', { name: 'Request Loan' });
    this.logOut = this.page.getByRole('link', { name: 'Log Out' });
    this.accountsOverviewHeading = this.page.getByRole('heading', { name: 'Accounts Overview' });
    this.accountsTable = this.page.getByRole('table');
    this.welcomeMessage = this.page.getByText('Welcome');
  }

  async goto() {
    await this.page.goto('/parabank/overview.htm');
  }
}
