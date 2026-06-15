/**
 * @criterion RF-002 (saucedemo.feature:17 (REQ-LOGIN-LOCKED))
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Given: un usuario no ha iniciado sesion en la tienda
 * When:  el usuario introduce el usuario locked_out_user y la contrasena secret_sauce; confirma el acceso
 * Then:  el sistema rechaza el acceso y muestra el mensaje de error de usuario bloqueado
 *
 * Exact error text observed by planner: "Epic sadface: Sorry, this user has been locked out."
 * The page stays at / — no redirect to /inventory.html.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';

test.describe('Feature: login-locked', () => {
  test('Scenario: acceso rechazado para usuario bloqueado', async ({ page }) => {
    const loginPage = new LoginPage(page);

    // ── Step 1: Navigate and run axe immediately after goto ──────────────────
    await loginPage.goto();

    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    // fail_on_violations: false in style-contract → annotate, do not throw
    if (axeResults.violations.length > 0) {
      const serious = axeResults.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      test.info().annotations.push({
        type: 'a11y-violations',
        description: JSON.stringify(
          serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
        ),
      });
    }

    // ── Step 1 assertions: form is ready ────────────────────────────────────
    await expect(page).toHaveURL('https://www.saucedemo.com/');
    await expect(loginPage.username).toBeVisible();
    await expect(loginPage.password).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();

    // ── Step 2 & 3: Fill credentials for locked user ─────────────────────────
    // Credentials from style-contract synthetic_fixtures — not PII
    await loginPage.loginAs('locked_out_user', 'secret_sauce');

    // ── Step 4 assertions: access is rejected, stay at / ────────────────────
    await expect(page).toHaveURL('https://www.saucedemo.com/');

    await expect(loginPage.errorContainer).toBeVisible();

    await expect(loginPage.errorContainer).toContainText(
      'Epic sadface: Sorry, this user has been locked out.',
    );

    await expect(loginPage.errorButton).toBeVisible();

    // No navigation to inventory occurred
    await expect(page).not.toHaveURL(/\/inventory\.html/);
  });
});
