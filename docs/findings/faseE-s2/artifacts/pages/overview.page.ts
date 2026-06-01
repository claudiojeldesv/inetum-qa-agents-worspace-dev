import { type Locator, type Page } from '@playwright/test';

/**
 * OverviewPage — Page Object Model for the "overview" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class OverviewPage {
  readonly page: Page;
  readonly accountsOverview: Locator;
  readonly welcomeJohnSmith: Locator;
  readonly accountServices: Locator;
  readonly accounts: Locator;
  readonly transferFunds: Locator;
  readonly logOut: Locator;

  constructor(page: Page) {
    this.page = page;
    this.accountsOverview = this.page.getByRole('heading', { name: 'Accounts Overview' });
    this.welcomeJohnSmith = this.page.getByText('Welcome John Smith');
    this.accountServices = this.page.getByRole('heading', { name: 'Account Services' });
    this.accounts = this.page.getByRole('table', { name: 'Accounts' });
    this.transferFunds = this.page.getByRole('link', { name: 'Transfer Funds' });
    this.logOut = this.page.getByRole('link', { name: 'Log Out' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/parabank/overview.htm', { waitUntil: 'domcontentloaded' });
  }

  /** Clicks the Log Out link in the sidebar, initiating session termination. */
  async clickLogOut(): Promise<void> {
    await this.logOut.click();
  }
}
