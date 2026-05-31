/**
 * @criterion parabank-plan.md § 2.1 (Transfer happy-path)
 *            parabank-plan.md § 2.2 (Auth-handler guard — unauthenticated direct access)
 * @style-contract style-contracts/parabank.yaml
 *
 * AUTH-HANDLER (v0.2 Fase C): the happy-path describe (§ 2.1) inherits the authenticated
 * session from the project-level storageState wired in playwright.config.ts. The setup
 * project (auth.setup.ts) runs first as a dependency and writes playwright/.auth/john.json;
 * Playwright guarantees the ordering under fullyParallel — no --workers=1 needed.
 * The guard describe (§ 2.2) explicitly overrides with an empty storageState.
 *
 * Locator strategy: getByLabel > getByRole > getByText. ParaBank JSP legacy has no
 * data-test; form locators live in TransferPage via the sanctioned css_fallback_attributes
 * (name/id) declared in the style-contract.
 *
 * A11Y: axe-core scan injected by ia4d-a11y-injector; fail_on_violations=false → warning
 * mode (annotation, does not abort). No balance assertions — shared environment.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { TransferPage } from '../pages/transfer.page';

// ---------------------------------------------------------------------------
// § 2.1  Happy-path — authenticated transfer between accounts
// Inherits the project-level storageState (setup dependency). No test.use here.
// ---------------------------------------------------------------------------
test.describe('Feature: Transfer Funds — happy-path (§ 2.1)', () => {
  test('Scenario: transfer 10.00 from account 13344 to 15564 and confirm completion', async ({ page }) => {
    const transferPage = new TransferPage(page);

    // Step 1 — navigate to protected screen using the inherited session
    await transferPage.goto();

    // Accessibility scan (a11y gate: warning mode, no abort)
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    const a11yViolations = accessibilityScanResults.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (a11yViolations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${a11yViolations.length} serious/critical violation(s): ` +
          a11yViolations.map(v => v.id).join(', '),
      });
    }

    // Step 2 — page should NOT have redirected back to login
    // If the session was not reused correctly, ParaBank serves the error-page gate.
    await expect(page).toHaveTitle('ParaBank | Transfer Funds');
    await expect(page.getByRole('heading', { name: 'Transfer Funds' })).toBeVisible();

    // Confirm the Amount textbox is present (proves the form loaded, not the login page)
    await expect(transferPage.amount).toBeVisible();

    // Shared demo env (discovery shared_environment_warning): account numbers churn
    // across runs — john may have a different/variable set. Read the live <option>
    // values instead of hardcoding 13344/15564 (which went stale between Fase B and now).
    const accounts = await transferPage.fromAccount
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    expect(accounts.length).toBeGreaterThan(0);
    const fromAcct = accounts[0];
    const toAcct = accounts.length > 1 ? accounts[1] : accounts[0];

    // Step 3-5 — fill and submit the transfer form via POM action
    await transferPage.transferFunds('10.00', fromAcct, toAcct);

    // Step 6 — confirm transfer completion
    // No balance assertion — shared environment, balance changes across runs.
    await expect(transferPage.transferComplete).toBeVisible();

    // The echoed amount and account numbers must appear in the confirmation text.
    // Full sentence fragment avoids matching combobox DOM residuals (the bare number
    // would also match the still-rendered select option).
    await expect(
      page.getByText(`$10.00 has been transferred from account #${fromAcct} to account #${toAcct}`),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// § 2.2  Auth-handler guard — unauthenticated direct access blocked by error-page gate
// Fresh browser context with NO storageState (overrides the project default).
// ParaBank legacy JSP does NOT redirect on unauthenticated access: it serves an inline
// error-page at the same URL (transfer.htm) with heading "Error!" + the login form.
// The Transfer Funds form (Amount textbox) is NOT rendered.
// ---------------------------------------------------------------------------
test.describe('Feature: Transfer Funds — auth-handler guard (§ 2.2)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Scenario: unauthenticated direct access to transfer.htm shows error-page gate with login form', async ({ page }) => {
    // Navigate directly to the protected screen without a session.
    await page.goto('https://parabank.parasoft.com/parabank/transfer.htm');

    // Accessibility scan (a11y gate: warning mode, no abort)
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    const a11yViolations = accessibilityScanResults.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (a11yViolations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${a11yViolations.length} serious/critical violation(s): ` +
          a11yViolations.map(v => v.id).join(', '),
      });
    }

    // GUARD BEHAVIOUR — catalogued Fase B, sitio 3 (ParaBank).
    // ParaBank legacy JSP does NOT redirect on unauthenticated access to protected screens.
    // The URL stays at transfer.htm; the server returns "ParaBank | Error" and renders
    // heading "Error!" (h1) alongside the Customer Login form (heading "Customer Login", h2).
    // The transfer form itself is NOT rendered. Asserting a URL-redirect would be wrong;
    // we assert the inline error-page guard instead.
    const transferPage = new TransferPage(page);
    await expect(transferPage.amount).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Error!' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Customer Login' })).toBeVisible();
  });
});
