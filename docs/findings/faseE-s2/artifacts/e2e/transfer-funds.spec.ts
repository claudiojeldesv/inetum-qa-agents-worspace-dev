/**
 * @criterion RF-002 (parabank.feature:15 (REQ-TRANSFER))
 * @writer-iterations 2
 * @reviewer-verdict pass
 *
 * RF-002 — Transferencia de fondos entre cuentas propias
 * Given: el cliente ha iniciado sesion y dispone de al menos dos cuentas
 * When:  el cliente transfiere <amount> de una cuenta de origen a una cuenta de destino;
 *        confirma la transferencia
 * Then:  el sistema ejecuta la transferencia y muestra la confirmacion con el importe
 *
 * DATA-DRIVEN: examples.rows from RF-002 in criteria.json — amounts "1" and "2" only.
 * No additional rows invented.
 *
 * Session: spec depends on auth.setup.ts (storageState playwright/.auth/john.json).
 * No re-login in this file — assumes active session via storageState dependency.
 *
 * Style contract: style-contracts/parabank.yaml
 * Discovery:      discovery-report.json screen 'transfer'
 * Synthetic data: synthetic_fixtures.credentials[0] — john/demo (parabank.yaml)
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { TransferPage } from '../pages/transfer.page';

// Cases taken EXCLUSIVELY from RF-002 examples.rows in criteria.json.
// Do not add or change amounts — state is shared across ParaBank runs.
const cases = [
  { amount: '1' },
  { amount: '2' },
];

test.describe('Feature: Transfer Funds', () => {
  // The data-driven cases mutate the SAME shared account (john, index 0→1) on a shared
  // ParaBank backend. Running them in parallel races on that account and the server's
  // confirmation render. Serial mode runs them one after another — the domain-correct
  // ordering for mutable shared balance. (Inter-file parallelism is unaffected.)
  test.describe.configure({ mode: 'serial' });

  for (const data of cases) {
    test(`Scenario: complete transfer — amount ${data.amount} — RF-002`, async ({ page }) => {
      const transferPage = new TransferPage(page);

      // Step 1: navigate to the transfer screen (session already active via storageState)
      await transferPage.goto();

      // A11y check — injected per hard rule (SPEC §4).
      // fail_on_violations=false in style-contract: violations are annotated as warnings,
      // they do not abort the test under test (ParaBank is legacy JSP, a11y issues expected).
      const a11yResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      if (a11yResults.violations.length > 0) {
        const serious = a11yResults.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        );
        test.info().annotations.push({
          type: 'a11y-warning',
          description: `${a11yResults.violations.length} violation(s) found (${serious.length} serious/critical): ${serious.map((v) => v.id).join(', ')}`,
        });
      }

      // Step 2: verify the transfer form is loaded (screen guard)
      await expect(transferPage.transferFundsHeading).toBeVisible();

      // Step 3: execute the transfer
      // Accounts selected by index (0=from, 1=to) — dynamic IDs, not hardcoded.
      // Distinct accounts guaranteed: john has >= 2 accounts per RF-002 given.
      await transferPage.doTransfer(data.amount);

      // Step 4: assert confirmation heading (RF-002 then: "muestra la confirmacion")
      await expect(transferPage.transferCompleteHeading).toBeVisible();

      // Step 5: assert the confirmation body mentions the transferred amount.
      // Do NOT assert exact balance — ParaBank state is shared across runs.
      // Pattern: "$X.00 has been transferred from account #NNNNN to account #MMMMM."
      await expect(transferPage.confirmationAmount(data.amount)).toBeVisible();
    });
  }
});
