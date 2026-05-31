/**
 * @criterion RF-003 (fd-parabank.md:30-35)
 *   Given:  El cliente ha iniciado sesión y dispone de al menos dos cuentas con saldo suficiente
 *   When:   El cliente selecciona la cuenta de origen, la cuenta de destino, introduce el importe y confirma la transferencia
 *   Then:   El sistema ejecuta la transferencia y muestra una confirmación al cliente indicando el importe transferido
 *
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * SCOPE: RF-003 happy-path ONLY. RF-002 (auth-guard) is blocked by open question Q-001;
 * no auth-guard test is included per S3 no-fabricate rule.
 *
 * AUTH: This spec inherits the project-level storageState written by auth.setup.ts
 * (playwright/.auth/john.json). No test.use({ storageState }) override here — do NOT
 * re-login, do NOT add a fresh-context block. Navigate directly to transfer.htm.
 *
 * DYNAMIC ACCOUNTS: ParaBank is a shared demo env. Account numbers for john change
 * across runs. The test reads <option> values from #fromAccountId at runtime and selects
 * accounts[0] / accounts[1] (or accounts[0] twice if only one exists). No hardcoded IDs.
 *
 * CONFIRMATION ASSERT: the full sentence "$10.00 has been transferred from account
 * #<fromAcct> to account #<toAcct>" is required. The bare number alone would also match
 * residual text in the combobox <option> elements.
 *
 * A11Y: axe-core scan injected immediately after goto(). fail_on_violations=false per
 * style-contract (ParaBank legacy JSP — WARNING mode, not blocker). Violations captured
 * as test annotations.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { TransferPage } from '../pages/transfer.page';

test.describe('Feature: Transfer Funds — happy-path (RF-003)', () => {
  test('Scenario: transfer $10.00 between own accounts and confirm completion', async ({ page }) => {
    const transferPage = new TransferPage(page);

    // Step 1 — navigate to the protected screen using the inherited session
    await transferPage.goto();

    // A11y scan — warning mode (fail_on_violations=false per style-contract)
    const axeResults = await new AxeBuilder({ page }).analyze();
    const a11yViolations = axeResults.violations.filter(
      (v) => ['serious', 'critical'].includes(v.impact ?? ''),
    );
    if (a11yViolations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description:
          `${a11yViolations.length} serious/critical violation(s): ` +
          a11yViolations.map((v) => v.id).join(', '),
      });
    }

    // Step 2 — confirm the form loaded (session was reused correctly)
    await expect(page).toHaveTitle('ParaBank | Transfer Funds');
    await expect(page.getByRole('heading', { name: 'Transfer Funds' })).toBeVisible();
    await expect(transferPage.amount).toBeVisible();

    // Step 3 — read available accounts at runtime (shared demo env, IDs change between runs)
    const accounts = await transferPage.fromAccount
      .locator('option')
      .evaluateAll((opts) =>
        opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
      );
    expect(accounts.length).toBeGreaterThan(0);
    const fromAcct = accounts[0];
    const toAcct = accounts.length > 1 ? accounts[1] : accounts[0];

    // Step 4 — fill and submit the transfer form
    await transferPage.transferFunds('10.00', fromAcct, toAcct);

    // Step 5 — assert confirmation (RF-003 then: system executes transfer and shows confirmation)
    // Heading confirms the operation completed.
    await expect(transferPage.transferComplete).toBeVisible();

    // Full-sentence assert avoids false positives from combobox option text in the DOM.
    await expect(
      page.getByText(
        `$10.00 has been transferred from account #${fromAcct} to account #${toAcct}`,
      ),
    ).toBeVisible();
  });
});
