/**
 * @criterion dashboard.widgets (coverage 2.2, source: discovery-report.json, plan_ref: D-02)
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Scenario: after navigating to the dashboard as an authenticated user, the six
 * default widgets are visible in the main content area.
 *
 * Auth: inherited from storageState (auth.setup.ts seed) — no login in this test.
 * Dynamic content (counters, names, dates) is intentionally NOT asserted — the demo
 * is shared/resettable and values are volatile.
 *
 * Widget locators use getByRole('region', { name: '...' }) per POM scaffold and
 * discovery-report.json. OrangeHRM OS 5.8 may not expose all widgets as landmark
 * regions with accessible names at runtime; if a locator fails, run ia4d-healer to
 * remap to getByText('<widget title>') without modifying this file.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DashboardPage } from '../pages/dashboard.page';

test.describe('Feature: Dashboard widgets', () => {
  test('Scenario: six dashboard widgets are visible after authentication', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    // Navigate to dashboard (storageState already seeded by auth setup)
    await dashboardPage.goto();

    // Functional signal: topbar heading confirms we landed on the dashboard
    await expect(dashboardPage.topbarHeading).toBeVisible();

    // A11y scan — gate off per contract (fail_on_violations: false), stored as annotation
    const a11yResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    test.info().annotations.push({
      type: 'a11y-violations',
      description: JSON.stringify(
        a11yResults.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      ),
    });

    // Assert all six widgets are visible (presence only — no dynamic content)
    await expect(dashboardPage.timeAtWork).toBeVisible();
    await expect(dashboardPage.myActions).toBeVisible();
    await expect(dashboardPage.quickLaunch).toBeVisible();
    await expect(dashboardPage.buzzLatestPosts).toBeVisible();
    await expect(dashboardPage.employeesOnLeaveToday).toBeVisible();
    await expect(dashboardPage.employeeDistributionBySubUnit).toBeVisible();
  });
});
