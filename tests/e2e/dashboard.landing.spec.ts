/**
 * @criterion dashboard.landing (coverage 2.1, source: discovery-report.json, plan_ref: D-01)
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Scenario: post-login navigation to /web/index.php/dashboard/index shows the
 * correct URL, the topbar 'Dashboard' heading (h6), and the page title 'OrangeHRM'.
 * auth_required=true — storageState inherited from the auth setup project
 * (playwright/.auth/admin.json); no explicit login performed in this test.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DashboardPage } from '../pages/dashboard.page';

test.describe('Feature: Dashboard landing', () => {
  test('Scenario: dashboard loads with correct URL, heading and page title', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    // Step 1: navigate to dashboard (auth inherited via storageState from setup project)
    await dashboardPage.goto();

    // A11y scan (gate off per contract — fail_on_violations: false → annotation, not assert)
    const a11yResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    test.info().annotations.push({
      type: 'a11y-violations',
      description: JSON.stringify(
        a11yResults.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      ),
    });

    // Step 2: URL matches the dashboard route
    await expect(page).toHaveURL(/\/web\/index\.php\/dashboard\/index/);

    // Step 3: topbar heading 'Dashboard' (h6) is visible — primary functional signal
    await expect(dashboardPage.topbarHeading).toBeVisible();

    // Step 4: browser tab title is 'OrangeHRM'
    await expect(page).toHaveTitle('OrangeHRM');
  });
});
