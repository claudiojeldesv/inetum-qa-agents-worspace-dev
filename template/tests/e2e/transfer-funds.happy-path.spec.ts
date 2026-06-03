/**
 * @criterion RF-002 (parabank.feature:15 (REQ-TRANSFER))
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Feature: Transferencia de fondos entre cuentas propias (S2 / Scenario Outline)
 *
 * Criterio RF-002 — when: "el cliente transfiere <amount> de una cuenta de origen a una
 * cuenta de destino; confirma la transferencia"
 * then: "el sistema ejecuta la transferencia y muestra la confirmacion con el importe"
 *
 * Parameterización: dos test cases (amounts: 1, 2) provenientes exclusivamente del bloque
 * examples en criteria/criteria.json. No se añaden filas adicionales.
 *
 * Contexto de ejecución: el project chromium corre con storageState autenticado (john)
 * generado por auth.setup.ts. Este spec NO hace login; navega directamente a
 * /parabank/transfer.htm asumiendo sesión activa.
 *
 * A11y: scan axe-core inyectado (hard rule SPEC). fail_on_violations=false en el
 * style-contract de parabank → modo warning, no aborta el flujo.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { TransferPage } from '../pages/transfer.page';

// Filas del bloque examples en criteria/criteria.json → RF-002.
// Valores SÓLO de la tabla; no se añaden filas propias.
const cases = [
  { amount: '1' },
  { amount: '2' },
];

test.describe('Feature: Transferencia de fondos entre cuentas propias', () => {
  for (const data of cases) {
    test(`Scenario: transferencia de $${data.amount} entre cuentas propias`, async ({ page }) => {
      const transferPage = new TransferPage(page);

      // Navega directamente — storageState inyectado por el auth.setup.ts project
      await transferPage.goto();

      // A11y check inmediato tras goto (hard rule). ParaBank JSP legacy → warnings esperados.
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      // fail_on_violations=false en el contract: se anota como warning, no aborta
      const a11yViolations = accessibilityScanResults.violations.filter(v =>
        ['serious', 'critical'].includes(v.impact ?? '')
      );
      if (a11yViolations.length > 0) {
        test.info().annotations.push({
          type: 'a11y-warning',
          description: `${a11yViolations.length} serious/critical violation(s): ` +
            a11yViolations.map(v => v.id).join(', '),
        });
      }

      // Verifica que la sesión está activa: la página de transfer debe ser accesible
      await expect(page).toHaveTitle(/Transfer Funds/);
      await expect(page.getByRole('heading', { name: 'Transfer Funds' })).toBeVisible();

      // Verifica que el formulario de transferencia está presente y los combos tienen opciones
      await expect(transferPage.amount).toBeVisible();
      await expect(transferPage.fromAccount).toBeVisible();
      await expect(transferPage.toAccount).toBeVisible();
      await expect(transferPage.transfer).toBeVisible();

      // Los selects deben estar poblados con al menos una cuenta (sesión activa de john)
      const fromOptionCount = await transferPage.fromAccount.locator('option').count();
      expect(fromOptionCount).toBeGreaterThan(0);

      // Acción principal: rellenar importe, seleccionar cuentas, confirmar transferencia
      await transferPage.transferFunds(data.amount);

      // Asertos de confirmación — RF-002 then:
      // "el sistema ejecuta la transferencia y muestra la confirmacion con el importe"
      await expect(transferPage.transferCompleteHeading).toBeVisible();

      // El importe transferido debe aparecer en la confirmación.
      // No se assertea balance exacto (estado compartido demo — nota en style-contract).
      // Formato ParaBank: "$X.00 has been transferred from account #... to account #..."
      const amountFormatted = `$${data.amount}.00`;
      await expect(page.getByText(amountFormatted, { exact: false })).toBeVisible();
    });
  }
});
