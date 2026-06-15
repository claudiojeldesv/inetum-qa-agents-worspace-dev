/**
 * @criterion login.happy-path (coverage 1.1, source: discovery-report.json, plan_ref: L-01)
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Scenario: successful login with valid credentials (Admin/admin123) navigates
 * to Dashboard and shows heading + sidenav. Runs logged-out via storageState
 * override so it exercises the login form, not an auth-seeded session.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';
import { DashboardPage } from '../pages/dashboard.page';

test.describe('Feature: Login happy-path', () => {
  // Override any global storageState so this test always starts logged-out.
  // OrangeHRM redirects authenticated sessions away from /auth/login — without
  // this the test would skip the login form entirely.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Scenario: successful login with valid credentials navigates to Dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboardPage = new DashboardPage(page);

    // Step 1: navigate to login screen
    await loginPage.goto();

    // A11y scan on login page (gate off per contract — annotation, not assert)
    const loginA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    test.info().annotations.push({
      type: 'a11y-violations',
      description: JSON.stringify(
        loginA11y.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      ),
    });

    // Step 2: verify URL and login form is visible
    await expect(page).toHaveURL(/\/web\/index\.php\/auth\/login/);
    await expect(loginPage.login2).toBeVisible();   // heading 'Login' (h5)
    await expect(loginPage.username).toBeVisible();
    await expect(loginPage.password).toBeVisible();
    await expect(loginPage.login).toBeVisible();    // button 'Login'

    // Step 3: submit valid credentials (from style-contract synthetic_fixtures.credentials[0])
    await loginPage.doLogin('Admin', 'admin123');

    // Step 4: assert successful navigation to dashboard
    await expect(page).toHaveURL(/\/web\/index\.php\/dashboard\/index/);

    // Step 5: primary functional signal — topbar heading 'Dashboard' (h6)
    await expect(dashboardPage.topbarHeading).toBeVisible();

    // Step 6: sidenav present with expected menu items
    await expect(dashboardPage.sidepanel).toBeVisible();
    await expect(dashboardPage.admin).toBeVisible();
    await expect(dashboardPage.pim).toBeVisible();
    await expect(dashboardPage.leave).toBeVisible();
    await expect(dashboardPage.time).toBeVisible();

    // A11y scan on dashboard (gate off per contract — annotation, not assert)
    const dashboardA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    test.info().annotations.push({
      type: 'a11y-violations',
      description: JSON.stringify(
        dashboardA11y.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      ),
    });
  });
});
