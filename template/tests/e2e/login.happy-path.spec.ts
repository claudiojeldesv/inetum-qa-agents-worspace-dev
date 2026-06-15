/**
 * @criterion RF-001 (saucedemo.feature:10 (REQ-LOGIN))
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * RF-001 — Inicio de sesion con credenciales validas
 * Given: un usuario no ha iniciado sesion en la tienda
 * When:  el usuario introduce el usuario standard_user y la contrasena secret_sauce; confirma el acceso
 * Then:  el sistema autentica al usuario y muestra el listado de productos
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../pages/login.page';
import { InventoryPage } from '../pages/inventory.page';

test.describe('Feature: Login', () => {
  test('Inicio de sesion con credenciales validas', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const inventoryPage = new InventoryPage(page);

    // Given: usuario no autenticado en la landing page
    await loginPage.goto();

    // Axe check: accesibilidad de la pantalla de login (gate off por defecto; scan siempre activo)
    const loginA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    test.info().annotations.push({
      type: 'a11y-login-violations',
      description: String(loginA11y.violations.length),
    });

    // Verify login page is ready
    await expect(loginPage.username).toBeVisible();
    await expect(loginPage.password).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();

    // When: introduce credenciales válidas y confirma
    await loginPage.username.fill('standard_user');
    await loginPage.password.fill('secret_sauce');
    await loginPage.loginButton.click();

    // Then: el sistema autentica y muestra el listado de productos
    await expect(page).toHaveURL(/\/inventory\.html$/);
    await expect(inventoryPage.title).toBeVisible();
    await expect(inventoryPage.title).toHaveText('Products');
    await expect(inventoryPage.inventoryList).toBeVisible();
    await expect(inventoryPage.shoppingCartLink).toBeVisible();

    // Axe check: accesibilidad de la pantalla de inventario post-login
    const inventoryA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    test.info().annotations.push({
      type: 'a11y-inventory-violations',
      description: String(inventoryA11y.violations.length),
    });

    // Evidencia visual (evidence.screenshots: on en el style-contract)
    await page.screenshot({ path: 'test-results/login-happy-path-inventory.png', fullPage: false });
  });
});
