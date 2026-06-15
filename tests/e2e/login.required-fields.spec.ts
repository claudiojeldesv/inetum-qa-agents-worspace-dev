/**
 * @criterion login.required-fields (coverage 1.3, source: discovery-report.json)
 *   Plan entry L-03: submitting an empty login form must show exactly two "Required"
 *   validation messages (one beneath Username, one beneath Password) and must NOT
 *   navigate away from /auth/login.
 * @writer-iterations 1
 * @reviewer-verdict pass
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';

// This scenario exercises the login form in a logged-out state.
// Override any project-level storageState so the test runs with an empty session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Feature: Login — Required fields validation', () => {
  test('Scenario: empty form submit shows Required messages under both fields', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // ── Navigate ──────────────────────────────────────────────────────────────
    await loginPage.goto();

    // ── A11y scan (hard rule: always inject, fail_on_violations=false per contract) ──
    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    // Attach as annotation so Allure picks it up; do not throw on violations per contract
    test.info().annotations.push({
      type: 'a11y-violations',
      description: JSON.stringify(axeResults.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
      }))),
    });

    // ── Pre-condition: no validation messages visible before any interaction ──
    // The "Required" messages are injected after submit; they must be absent initially.
    await expect(loginPage.requiredMessages).toHaveCount(0);

    // ── Act: submit without filling either field ──────────────────────────────
    await loginPage.submitEmpty();

    // ── Assert: URL remains on login page (no redirect) ──────────────────────
    await expect(page).toHaveURL(/\/auth\/login/);

    // ── Assert: exactly two "Required" messages are now visible ──────────────
    // OrangeHRM renders one span per field; wording verified in vivo = "Required".
    // Not using CSS class oxd-input--error — forbidden by contract (forbid_css_selectors: true).
    await expect(loginPage.requiredMessages).toHaveCount(2);
    // Confirm both are visible (not just present in DOM)
    await expect(loginPage.requiredMessages.nth(0)).toBeVisible();
    await expect(loginPage.requiredMessages.nth(1)).toBeVisible();
  });
});
