import { type Locator, type Page } from '@playwright/test';

/**
 * TransferPage — Page Object Model for the "transfer" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions filled by ia4d-writer (S3 mode, RF-002).
 *
 * Locator note: ParaBank JSP legacy has no data-testid. Amount input and account
 * selects are identified via id attribute (css_fallback:id declared in style-contract).
 * The submit button is resolved semantically via getByRole.
 */
export class TransferPage {
  readonly page: Page;
  readonly transferFundsHeading: Locator;
  // css-fallback: id — no semantic label on amount input in legacy JSP
  readonly amountInput: Locator;
  // css-fallback: id — dynamic combobox, options populated at runtime
  readonly fromAccountSelect: Locator;
  // css-fallback: id — dynamic combobox, options populated at runtime
  readonly toAccountSelect: Locator;
  // getByRole — button has accessible name 'Transfer'
  readonly submitButton: Locator;
  // getByRole — confirmation heading visible after successful transfer
  readonly transferCompleteHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.transferFundsHeading = this.page.getByRole('heading', { name: 'Transfer Funds' });
    // css-fallback: id
    this.amountInput = this.page.locator("input[id='amount']");
    // css-fallback: id
    this.fromAccountSelect = this.page.locator("select[id='fromAccountId']");
    // css-fallback: id
    this.toAccountSelect = this.page.locator("select[id='toAccountId']");
    this.submitButton = this.page.getByRole('button', { name: 'Transfer' });
    this.transferCompleteHeading = this.page.getByRole('heading', { name: 'Transfer Complete!' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/parabank/transfer.htm', { waitUntil: 'domcontentloaded' });
  }

  /**
   * Executes a fund transfer between two distinct accounts.
   *
   * Accounts are selected by option index (not hardcoded IDs) because ParaBank
   * account numbers are dynamic across environments and reset cycles.
   * Default: fromIndex=0 (first option), toIndex=1 (second option).
   * This guarantees distinct accounts as long as john has at least two accounts
   * (RF-002 given: "el cliente ... dispone de al menos dos cuentas").
   *
   * @param amount    - transfer amount string, e.g. "1" or "2"
   * @param fromIndex - option index for source account in fromAccountId select (default 0)
   * @param toIndex   - option index for destination account in toAccountId select (default 1)
   */
  async doTransfer(amount: string, fromIndex = 0, toIndex = 1): Promise<void> {
    await this.amountInput.fill(amount);
    await this.fromAccountSelect.selectOption({ index: fromIndex });
    await this.toAccountSelect.selectOption({ index: toIndex });
    await this.submitButton.click();
  }

  /**
   * Returns a locator for the confirmation text containing the transferred amount.
   *
   * Uses getByText with a regex partial match — no CSS descendant selector.
   * Discovery does not map this paragraph as a named element; getByText is the
   * highest-priority semantic locator available for unlabelled confirmation text
   * in this legacy JSP page.
   *
   * @param amount - the transfer amount, e.g. "1" or "2"
   */
  confirmationAmount(amount: string): Locator {
    return this.page.getByText(new RegExp(`\\$${amount}\\.00`));
  }
}
