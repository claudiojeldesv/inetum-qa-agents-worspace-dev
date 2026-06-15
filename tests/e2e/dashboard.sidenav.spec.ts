/**
 * @criterion dashboard.sidenav (coverage 2.3)
 * @plan-ref D-03
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Verifies that, after navigating to the dashboard as an authenticated user,
 * the sidepanel navigation is present, the search textbox is accessible,
 * and all 12 expected menu links are visible.
 *
 * Auth: inherits storageState from auth setup project — no login in this spec.
 * A11y: axe-core scan injected per hard rule. fail_on_violations=false (contract);
 * violations are annotated as warnings, not thrown.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DashboardPage } from '../pages/dashboard.page';

test.describe('Feature: Dashboard side navigation', () => {
  test('Scenario: Sidepanel navigation and search field are present with all expected menu items', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await dashboardPage.goto();

    // A11y check — immediately after page load; violations annotated, not thrown
    const a11yResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    if (a11yResults.violations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: JSON.stringify(
          a11yResults.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description })),
          null,
          2
        ),
      });
    }

    // Sidepanel navigation container is present
    await expect(dashboardPage.sidepanel).toBeVisible();

    // Search textbox in the sidebar is accessible
    // Primary locator: getByRole('textbox', { name: 'Search' }) — from POM.
    // If this fails in vivo, the Healer should upgrade to getByPlaceholder('Search').
    await expect(dashboardPage.search).toBeVisible();

    // All 12 expected menu links are visible within the sidepanel
    const menuLinks = [
      dashboardPage.admin,
      dashboardPage.pim,
      dashboardPage.leave,
      dashboardPage.time,
      dashboardPage.recruitment,
      dashboardPage.myInfo,
      dashboardPage.performance,
      dashboardPage.dashboard2,
      dashboardPage.directory,
      dashboardPage.maintenance,
      dashboardPage.claim,
      dashboardPage.buzz,
    ];

    for (const link of menuLinks) {
      await expect(link).toBeVisible();
    }
  });
});
