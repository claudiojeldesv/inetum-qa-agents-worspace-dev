import { type Locator, type Page } from '@playwright/test';

/**
 * TransferPage — Page Object Model for the "transfer" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 *
 * Locator note: ParaBank JSP has no data-test attrs. `amount`, `fromAccount`,
 * `toAccount` use id-attribute selectors per css_fallback_attributes whitelist
 * in style-contracts/parabank.yaml (css_fallback_attributes: [name, id]).
 * `transfer` button is located by role+value, consistent with discovery-report.
 */
export class TransferPage {
  readonly page: Page;
  // css_fallback: id — whitelisted in style-contracts/parabank.yaml
  readonly amount: Locator;
  // css_fallback: id — whitelisted in style-contracts/parabank.yaml
  readonly fromAccount: Locator;
  // css_fallback: id — whitelisted in style-contracts/parabank.yaml
  readonly toAccount: Locator;
  readonly transfer: Locator;
  readonly transferCompleteHeading: Locator;
  // TODO writer: locator missing from discovery — #showResult not in discovery-report.json
  // confirmationParagraph omitted until discovery is updated with the result container id.

  constructor(page: Page) {
    this.page = page;
    this.amount = this.page.locator('#amount');
    this.fromAccount = this.page.locator('#fromAccountId');
    this.toAccount = this.page.locator('#toAccountId');
    this.transfer = this.page.getByRole('button', { name: 'Transfer' });
    // 'Transfer Complete!' h1 is the post-submit success indicator per plan scenario 2.1 step 6
    this.transferCompleteHeading = this.page.getByRole('heading', { name: 'Transfer Complete!' });
  }

  async goto() {
    await this.page.goto('/parabank/transfer.htm');
  }

  /**
   * Fills the amount field, picks the first available from-account and a
   * different to-account, then clicks Transfer.
   * Accounts are populated dynamically by ParaBank — we pick by index so the
   * test is independent of actual account numbers (no hardcoded IDs).
   */
  async transferFunds(amount: string): Promise<void> {
    await this.amount.fill(amount);

    // Select first option for fromAccount (index 0)
    const fromOptions = this.fromAccount.locator('option');
    const fromCount = await fromOptions.count();
    if (fromCount === 0) {
      throw new Error('TransferPage: no options found in fromAccountId select');
    }
    const fromValue = await fromOptions.nth(0).getAttribute('value');
    await this.fromAccount.selectOption({ value: fromValue! });

    // Select a different (second) option for toAccount to avoid same-account transfer
    const toOptions = this.toAccount.locator('option');
    const toCount = await toOptions.count();
    const toIndex = toCount > 1 ? 1 : 0;
    const toValue = await toOptions.nth(toIndex).getAttribute('value');
    await this.toAccount.selectOption({ value: toValue! });

    await this.transfer.click();
  }
}
