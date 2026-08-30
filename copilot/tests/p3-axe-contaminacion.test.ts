/**
 * P3 — ¿el panel contamina el scan de accesibilidad?
 *
 * El plan lo exigía MEDIDO antes de afirmarlo: axe atraviesa shadow DOM por
 * defecto, y el shadow CERRADO protege de los locators de Playwright — no
 * necesariamente de axe. La vergüenza a evitar: una demo donde el scan A11y
 * del producto reporta violaciones que son del PROPIO panel del producto.
 *
 * El test mide la misma página con y sin panel (modo producción: shadow
 * cerrado) y exige que el CONJUNTO de violaciones sea idéntico. Si algún
 * cambio del panel introduce una violación nueva, esto se pone rojo con el
 * id de la regla delante.
 */
import { describe, it, expect } from 'vitest';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { assistOverlayScript, verdictOverlayScript, TESTID_ATTR_CANDIDATES } from '../src/dom-walker.ts';
import type { WalkStep } from '../src/walk-types.ts';

const FIXTURE = pathToFileURL(resolve(__dirname, '../fixtures/veredicto-autopilot.html')).href;
const STEP: WalkStep = { id: 's1', action: 'expect_text', value: 'Solicitud aprobada' };

describe('P3 — el panel y axe, medidos juntos', () => {
  it('MEDICIÓN: las violaciones con panel (asistencia + veredicto) son EXACTAMENTE las de la página', async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(FIXTURE);
    const sinPanel = (await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id).sort();

    // producción de verdad: shadow CERRADO, sin parche de apertura
    await page.exposeFunction('__qaVerdictSubmit', () => {});
    await page.evaluate(verdictOverlayScript(TESTID_ATTR_CANDIDATES, STEP, 'x', 'diag', ['Solicitud rechazada']));
    const conVeredicto = (await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id).sort();

    await page.exposeFunction('__qaAssistSubmit', () => {});
    await page.exposeFunction('__qaAssistTrack', () => {});
    await page.evaluate(assistOverlayScript(TESTID_ATTR_CANDIDATES, { id: 's2', action: 'click', hint: { name: 'x' } }, 'motivo'));
    const conAsistencia = (await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id).sort();
    await browser.close();

    expect(conVeredicto, 'el panel de VEREDICTO añade violaciones al scan de la app').toEqual(sinPanel);
    expect(conAsistencia, 'el panel de ASISTENCIA añade violaciones al scan de la app').toEqual(sinPanel);
  }, 180_000);
});
