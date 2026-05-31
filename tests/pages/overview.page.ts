import { type Locator, type Page } from '@playwright/test';

/**
 * OverviewPage — Page Object Model for the "overview" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators filled by ia4d-writer (iteration 0).
 * Source: discovery-report.json § screens[overview], parabank-plan.md § 1.1
 *
 * Locator priority per style-contract parabank.yaml: getByLabel > getByRole > getByText.
 * ParaBank JSP has no data-test attributes.
 *
 * KNOWN: accountsOverview uses getByRole('table'). ParaBank's table may lack an accessible
 * name — if assertion fails with exact match, the caller should fall back to asserting
 * row content (account numbers 13344, 15564) via getByText. See spec for row-level asserts.
 */
export class OverviewPage {
  readonly page: Page;
  readonly welcomeMessage: Locator;
  readonly transferFunds: Locator;
  readonly logOut: Locator;
  readonly accountsTable: Locator;
  // Scoped to #leftPanel — avoids matching SOAP service links in the footer of index.htm
  // that also carry the text "Transfer Funds". Use these for not.toBeVisible() assertions
  // after logout so the broad locator above does not cause strict-mode violations.
  readonly transferFundsNav: Locator;
  readonly logOutNav: Locator;

  constructor(page: Page) {
    this.page = page;
    // "Welcome John Smith" appears in the left sidebar as text. getByText with exact=false
    // handles the sidebar span wrapping. Discovery annotates it as role=heading but sidebar
    // markup is typically a <p> or <span> in ParaBank JSP; getByText is safer.
    this.welcomeMessage = this.page.getByText('Welcome John Smith', { exact: false });
    this.transferFunds = this.page.getByRole('link', { name: 'Transfer Funds' });
    this.logOut = this.page.getByRole('link', { name: 'Log Out' });
    // Table may not have an accessible name in JSP markup. Primary assertion is via row text.
    this.accountsTable = this.page.getByRole('table').first();
    this.transferFundsNav = this.page.locator('#leftPanel').getByRole('link', { name: 'Transfer Funds' });
    this.logOutNav = this.page.locator('#leftPanel').getByRole('link', { name: 'Log Out' });
  }

  async goto() {
    // Absolute URL: safe regardless of QA_BASE_URL value at invocation time.
    await this.page.goto('https://parabank.parasoft.com/parabank/overview.htm');
  }
}
