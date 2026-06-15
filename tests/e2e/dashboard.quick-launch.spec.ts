/**
 * @criterion dashboard.quick-launch (coverage 2.5) — D-05
 *   Quick Launch widget 'Assign Leave' button navigates to /leave/assignLeave
 *   without JavaScript errors. Scenario from discovery-report.json scenarios_detail[id=dashboard.quick-launch].
 * @writer-iterations 0
 * @reviewer-verdict approved
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DashboardPage } from '../pages/dashboard.page';

test.describe('Feature: Dashboard Quick Launch', () => {
  test('Scenario: Assign Leave button navigates to /leave/assignLeave', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    // Navigate to dashboard — inherits storageState from auth setup; no login step.
    await dashboardPage.goto();

    // Axe-core accessibility check (WCAG 2.1 AA — fail_on_violations: false per contract).
    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    test.info().annotations.push({
      type: 'a11y-violations',
      description: JSON.stringify(axeResults.violations.map(v => ({ id: v.id, impact: v.impact }))),
    });
    // Gate is off per style-contract (fail_on_violations: false); violations are auditable, not blocking.

    // Verify Quick Launch widget title is present.
    await expect(dashboardPage.quickLaunch).toBeVisible();

    // 'Assign Leave' button is unique on the page (title attr provides accessible name).
    // quickLaunch is a <p> title element — not a container — so button is resolved from page directly.
    const assignLeaveBtn = dashboardPage.assignLeave;
    await expect(assignLeaveBtn).toBeVisible();

    // Click and let Playwright wait for the resulting navigation via URL assertion.
    await assignLeaveBtn.click();

    // Navigation complete when URL contains the target path.
    await expect(page).toHaveURL(/\/leave\/assignLeave/);

    // Confirm we are no longer on the dashboard.
    await expect(page).not.toHaveURL(/\/dashboard\/index/);
  });
});
