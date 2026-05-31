/**
 * @criterion parabank-plan.md § 2.1 (Transfer happy-path)
 *            parabank-plan.md § 2.2 (Auth-handler guard — unauthenticated direct access redirects to login)
 * @writer-iterations 0
 * @reviewer-verdict pass
 *
 * EXECUTION ORDER: login.spec.ts MUST run before this file.
 * login.spec.ts saves playwright/.auth/john.json (storageState) after a successful
 * authentication. The happy-path describe (§ 2.1) consumes that file via test.use().
 * Without the prior login run the happy-path test will fail because the auth file
 * will not exist on disk.
 *
 * If a setup project is later configured in playwright.config.ts to produce the
 * storageState as a dependency, remove this comment and the explicit ordering
 * requirement. Current plumbing has no setup project — the file ordering / serial
 * execution is the only guarantee.
 *
 * Style Contract: style-contracts/parabank.yaml
 *   - Locator priority: getByLabel > getByRole > getByText (no data-test on JSP legacy)
 *   - fail_on_violations: false  → axe-core injected as WARNING, not blocker
 *   - Forbidden: CSS selectors, XPath, page.waitForTimeout, assert.equal
 *   - Synthetic fixtures only: john / demo (Parasoft public demo account)
 *   - No balance assertions — shared environment, balance changes across runs
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { TransferPage } from '../pages/transfer.page';

// ---------------------------------------------------------------------------
// § 2.1  Happy-path — authenticated transfer between accounts
// ---------------------------------------------------------------------------
// Prerequisite: playwright/.auth/john.json must exist (produced by login.spec.ts).
// storageState is loaded at describe level so ALL tests inside share the session.
// ---------------------------------------------------------------------------
test.describe('Feature: Transfer Funds — happy-path (§ 2.1)', () => {
  test.use({ storageState: 'playwright/.auth/john.json' });

  test('Scenario: transfer 10.00 from account 13344 to 15564 and confirm completion', async ({ page }) => {
    const transferPage = new TransferPage(page);

    // Step 1 — navigate to protected screen using the reused session
    await transferPage.goto();

    // A11y check — injected per style-contract; fail_on_violations=false
    // ParaBank is legacy JSP with known violations: capture count, do not abort.
    const a11yResults = await new AxeBuilder({ page }).analyze();
    const violationCount = a11yResults.violations.length;
    if (violationCount > 0) {
      console.warn(
        `[a11y] transfer.htm — ${violationCount} violation(s) detected (fail_on_violations=false, SDET decision Fase B)`
      );
    }

    // Step 2 — page should NOT have redirected back to login
    // If the session was not reused correctly, ParaBank redirects to index.htm.
    await expect(page).toHaveTitle('ParaBank | Transfer Funds');
    await expect(page.getByRole('heading', { name: 'Transfer Funds' })).toBeVisible();

    // Confirm the Amount textbox is present (proves the form loaded, not the login page)
    await expect(transferPage.amount).toBeVisible();

    // Step 3-5 — fill and submit the transfer form via POM action
    await transferPage.transferFunds('10.00', '13344', '15564');

    // Step 6 — confirm transfer completion
    // "Transfer Complete!" heading must appear on the page after submission.
    // No balance assertion — shared environment, balance changes across runs.
    await expect(transferPage.transferComplete).toBeVisible();

    // The echoed amount and account numbers must appear in the confirmation text.
    // Use the full confirmation sentence fragment to avoid matching combobox DOM residuals
    // ('13344' alone would also match the still-rendered select option).
    await expect(page.getByText('$10.00 has been transferred from account #13344 to account #15564')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// § 2.2  Auth-handler guard — unauthenticated direct access blocked by error-page gate
// ---------------------------------------------------------------------------
// Fresh browser context with NO storageState.
// ParaBank legacy JSP does NOT redirect to login on unauthenticated access.
// Instead it serves an inline error-page at the same URL (transfer.htm) with:
//   - heading "Error!" (h1) + error message paragraph
//   - heading "Customer Login" (h2) + login form
// The Transfer Funds form (Amount textbox) is NOT rendered.
// ---------------------------------------------------------------------------
test.describe('Feature: Transfer Funds — auth-handler guard (§ 2.2)', () => {
  // Explicit empty storageState — overrides any project-level default.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Scenario: unauthenticated direct access to transfer.htm shows error-page gate with login form', async ({ page }) => {
    // Navigate directly to the protected screen without a session.
    // No POM goto() used here because the intent is to assert the redirect behaviour,
    // not to use the TransferPage as an authenticated user would.
    await page.goto('https://parabank.parasoft.com/parabank/transfer.htm');

    // A11y check on whichever page is actually rendered (likely login).
    const a11yResults = await new AxeBuilder({ page }).analyze();
    const violationCount = a11yResults.violations.length;
    if (violationCount > 0) {
      console.warn(
        `[a11y] auth-guard redirect target — ${violationCount} violation(s) detected (fail_on_violations=false)`
      );
    }

    // GUARD BEHAVIOUR — catalogued Fase B, sitio 3 (ParaBank).
    // ParaBank legacy JSP does NOT redirect on unauthenticated access to protected screens.
    // The URL stays at transfer.htm. Instead, the server returns the page title "ParaBank | Error"
    // and renders: heading "Error!" (h1) + "An internal error has occurred and has been logged."
    // alongside the Customer Login form (heading "Customer Login", h2).
    // The transfer form itself is NOT rendered (no input[name="amount"] in the DOM).
    // Asserting a URL-redirect would be wrong; we assert the inline error-page guard instead.

    // The transfer form must NOT be visible — the guard blocked it.
    const transferPage = new TransferPage(page);
    await expect(transferPage.amount).not.toBeVisible();

    // ParaBank serves an inline error-page at the same URL — both headings must be visible.
    // These are the canonical indicators that the guard fired (not a redirect, an error-page gate).
    await expect(page.getByRole('heading', { name: 'Error!' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Customer Login' })).toBeVisible();
  });
});
