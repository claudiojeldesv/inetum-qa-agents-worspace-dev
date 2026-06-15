/**
 * @criterion dashboard.user-dropdown (coverage 2.4, source: discovery-report.json, plan_ref: D-04)
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Scenario: user dropdown in topbar shows profile picture and accessible menu items
 * (About, Support, Change Password, Logout) after clicking the trigger.
 *
 * AUTH: post-login session. Inherits storageState from global setup project.
 * No test.use storageState override — this test requires an authenticated session.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DashboardPage } from '../pages/dashboard.page';

test.describe('Feature: Dashboard user dropdown', () => {
  test('Scenario: topbar profile picture and user dropdown menu items are accessible', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    // Navigate to dashboard (auth session inherited from storageState)
    await dashboardPage.goto();

    // Verify we landed on the dashboard
    await expect(page).toHaveURL(/\/web\/index\.php\/dashboard\/index/);

    // A11y scan — gate off per contract (fail_on_violations: false) → annotation, not assert
    const a11yResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    test.info().annotations.push({
      type: 'a11y-violations',
      description: JSON.stringify(
        a11yResults.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      ),
    });

    // Assert: profile picture is present in the topbar
    await expect(dashboardPage.profilePicture).toBeVisible();

    // Open the user dropdown by clicking the profile picture (topbar user identity trigger).
    // OrangeHRM SPA: the user dropdown is toggled by clicking the profile picture area.
    // element17 (listitem trigger) had no accessible name and was not refinable from discovery;
    // profilePicture is the stable semantic handle for the same clickable zone.
    await dashboardPage.profilePicture.click();

    // Assert: all four menu items are visible after dropdown opens
    await expect(dashboardPage.about).toBeVisible();
    await expect(dashboardPage.support).toBeVisible();
    await expect(dashboardPage.changePassword).toBeVisible();
    await expect(dashboardPage.logout).toBeVisible();
  });
});
