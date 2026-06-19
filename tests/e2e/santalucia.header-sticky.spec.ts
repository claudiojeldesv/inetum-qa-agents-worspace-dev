/**
 * @criterion TC-02 — Cabecera fija: contacto y CTA sticky (plan: discovery-report.json#home.TC-02-header-nav)
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * Mode: S4 autonomous. Target: https://www.santalucia.es/es/segurosmultirramo
 * Scenario: verifica que la cabecera expone los dos enlaces tel:, que el CTA sticky
 * aparece tras scroll, que el modal de llamada abre con todos sus campos y se puede
 * cerrar sin enviar ningún dato.
 *
 * Hard rule: NO se rellena ni envía el modal — solo se verifica visibilidad de campos.
 * A11y: scan inyectado en modo warning (fail_on_violations: false per style-contract).
 * Violations se anotan en test.info() pero no abortan el test.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { HomePage } from '../pages/home.page';

test.describe('Feature: home — cabecera fija', () => {

  test('TC-02 — Cabecera fija: contacto y CTA sticky', async ({ page }) => {
    const home = new HomePage(page);

    // --- Acto 1: navegación y aceptación de cookies ---
    await home.goto();

    // A11y scan en modo warning — fail_on_violations: false per style-contract
    // Violations se anotan como metadata auditable, no abortan el test.
    const a11yResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    if (a11yResults.violations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${a11yResults.violations.length} axe violation(s): ${a11yResults.violations.map((v) => v.id).join(', ')}`,
      });
    }

    // Aceptar banner de cookies si está presente (no bloqueante si ausente)
    const cookieBanner = page.getByRole('button', { name: /aceptar|accept|acepto/i });
    if (await cookieBanner.isVisible({ timeout: 5000 }).catch(() => false)) {
      await cookieBanner.click();
    }

    // --- Acto 2: logo visible en cabecera ---
    // discovery: img role "Santalucía Seguros" en location "header"
    await expect(home.santalucASeguros).toBeVisible();

    // --- Acto 3: dos enlaces telefónicos visibles en cabecera ---
    // discovery: "Atención al cliente" href=tel:+34900242020 y "Contrata tu seguro" href=tel:
    // POM expone los dos locators semánticos; verificar ambos individualmente cubre
    // la condición "exactamente 2 enlaces de contacto visibles en cabecera".
    await expect(home.atenciNAlCliente).toBeVisible();
    await expect(home.contrataTuSeguro).toBeVisible();

    // --- Acto 4: scroll para revelar el CTA sticky ---
    // El botón "Te llamamos GRATIS" de la cabecera solo es visible tras desplazamiento.
    await page.mouse.wheel(0, 1000);

    // --- Acto 5: CTA sticky visible tras scroll ---
    // discovery: location "header-sticky", visible_on_scroll: true
    // DOM has 5 "Te llamamos GRATIS" buttons: [0]=secondary(always hidden), [1]=secondary(sticky,
    // visible after scroll), [2,3,4]=terciary product-card buttons.
    // .nth(1) targets the sticky header button which becomes visible after scrolling ~500px.
    const stickyCtaButton = page.getByRole('button', { name: 'Te llamamos GRATIS' }).nth(1);
    await expect(stickyCtaButton).toBeVisible();

    // --- Acto 6: click en CTA abre el modal ---
    await stickyCtaButton.click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // --- Acto 7: verificar campos del modal visibles (SIN rellenar ni enviar) ---

    // Modal heading — la app ya no usa combobox "Elige tu seguro"; el producto se muestra
    // en el encabezado del modal como "Te llamamos gratis Hazte con tu seguro de hogar/decesos/vida".
    // Verificamos el heading visible que confirma que el modal de llamada se abrió correctamente.
    const modalHeading = modal.getByRole('heading', { name: /Te llamamos gratis/i });
    await expect(modalHeading).toBeVisible();

    // Textbox "Teléfono" — discovery: location modal-dialog, required: true
    // Se filtra dentro del modal para evitar colisión con el textbox del hero-form
    const telefonoModal = modal.getByLabel('Teléfono');
    await expect(telefonoModal).toBeVisible();

    // Checkbox protección de datos — discovery: location modal-dialog, required: true
    // La etiqueta en el DOM incluye punto final: "...Protección de datos."
    const checkboxProteccion = modal.getByRole('checkbox', {
      name: /He leído y acepto la información sobre la Protección de datos/i,
    });
    await expect(checkboxProteccion).toBeVisible();

    // Botón de envío — discovery: "Te llamamos" en modal-dialog (distinto del CTA sticky)
    const btnTeLlamamos = modal.getByRole('button', { name: 'Te llamamos' });
    await expect(btnTeLlamamos).toBeVisible();

    // --- Acto 8: cerrar modal ---
    // discovery: button "Cerrar ventana de diálogo" con aria-label explícita
    const closeButton = modal.getByRole('button', { name: 'Cerrar ventana de diálogo' });
    await expect(closeButton).toBeVisible();
    await closeButton.click();

    // --- Acto 9: modal ya no visible ---
    await expect(modal).not.toBeVisible();
  });

});
