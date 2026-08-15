import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from '@playwright/test';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, StepReport, WalkScript, WalkState } from '../src/walk-types.ts';

/**
 * K0.33 — las clases medidas en el sitio 2 de la gira (SAP UI5, app Shopping
 * Cart), todas genéricas y todas con par falsable sobre la misma página:
 *
 *   A. el peldaño EXACTO no era solo del texto: `getByLabel`/`getByRole({name})`
 *      también matchean por substring, y una región cuyo nombre CONTIENE la
 *      palabra del hint plantaba el paso.
 *   B. un hint de NOMBRE no puede terminar en un substring de TEXTO: es cambiar
 *      de atributo Y aflojar el matching. Produjo el peor desenlace posible —
 *      resolver otro elemento, pulsarlo y duplicar una acción de negocio.
 *   C. el barrido de consentimiento corría ANTES de que el CMP existiera.
 */
const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function walk(
  entry: string,
  steps: WalkScript['flows'][0]['steps'],
): Promise<{ map: DomMap }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-k033-'));
  const script: WalkScript = { version: 1, site_id: 'k033', entry, flows: [{ flow: 'f', steps }] };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  return { map: await new DomWalker(opts, script, contract, freshState()).run() };
}

const report = (m: DomMap, id: string): StepReport | undefined => (m.step_reports ?? []).find((r) => r.step === id);

describe('K0.33-A — exacto antes que substring también en label y role', () => {
  it('la clase existe: getByLabel ve dos, el exacto ve uno', async () => {
    const browser: Browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(`${FIX}/nombre-substring.html`);
      // la región que envuelve al control lleva un nombre que CONTIENE el del hint
      expect(await page.getByLabel('Search').count()).toBe(2);
      expect(await page.getByLabel('Search', { exact: true }).count()).toBe(1);
      expect(await page.getByLabel('Search', { exact: true }).getAttribute('id')).toBe('buscador');
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('el walker rellena el campo y dice por qué peldaño lo resolvió', async () => {
    const { map } = await walk('/nombre-substring.html', [
      { id: 's1', action: 'fill', hint: { label: 'Search' }, value: 'Astro' },
    ]);
    const r = report(map, 's1')!;
    expect(r.outcome).toBe('ok');
    expect(r.resolved_via).toBe("getByLabel('Search', { exact: true })");
    expect(map.open_questions).toEqual([]);
  }, 120_000);
});

describe('K0.33-B — un hint de NOMBRE no cae a substring de texto', () => {
  it('la clase existe: substring de texto encuentra UNO solo, y es el botón equivocado', async () => {
    const browser: Browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(`${FIX}/nombre-substring.html`);
      // dos botones cuyo NOMBRE contiene 'Cart'; el hint es genuinamente ambiguo
      expect(await page.getByRole('button', { name: 'Cart' }).count()).toBe(2);
      // pero por TEXTO visible solo hay uno... el de añadir. Ese era el puente.
      const porTexto = page.getByText('Cart').filter({ visible: true });
      expect(await porTexto.count()).toBe(1);
      expect(await porTexto.first().innerText()).toBe('Add to Cart');
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('el paso se planta y NO dispara la acción de negocio', async () => {
    const { map } = await walk('/nombre-substring.html', [
      { id: 's1', action: 'click', hint: { name: 'Cart' } },
      // si s1 hubiera pulsado "Add to Cart", el contador valdría 1
      { id: 's2', action: 'expect_text', value: 'Unidades añadidas: 0' },
    ]);
    expect(report(map, 's1')).toBeUndefined(); // bloqueado, no ejecutado
    const bloqueado = map.open_questions.find((q) => q.step === 's1');
    expect(bloqueado).toBeDefined();
    expect(report(map, 's2')!.outcome).toBe('ok');
  }, 120_000);

  it('par falsable: con el hint de TEXTO correcto, el mismo paso sí actúa', async () => {
    const { map } = await walk('/nombre-substring.html', [
      { id: 's1', action: 'click', hint: { text: 'Add to Cart' }, expect_after: 'Unidades añadidas: 1' },
    ]);
    expect(report(map, 's1')!.outcome).toBe('ok');
    expect(map.open_questions).toEqual([]);
  }, 120_000);

  it('y con el nombre COMPLETO del icono resuelve sin ambigüedad', async () => {
    const { map } = await walk('/nombre-substring.html', [
      { id: 's1', action: 'click', hint: { role: 'button', name: 'Show Shopping Cart' }, expect_after: 'Total: 989,00 EUR' },
    ]);
    const r = report(map, 's1')!;
    expect(r.outcome).toBe('ok');
    expect(r.resolved_via).toBe("getByRole('button', { name: 'Show Shopping Cart', exact: true })");
  }, 120_000);
});

describe('K0.33-C — el consentimiento que se inyecta TARDE', () => {
  it('se rechaza aunque no existiera al navegar, y jamás se acepta', async () => {
    const { map } = await walk('/consent-tardio.html', [
      { id: 's1', action: 'click', hint: { text: 'Continuar' }, expect_after: 'continuado' },
      // el testigo distingue rechazo de aceptación: "el banner ya no está" no basta
      { id: 's2', action: 'expect_text', value: 'consentimiento rechazado' },
    ]);
    expect(report(map, 's1')!.outcome).toBe('ok');
    expect(report(map, 's2')!.outcome).toBe('ok');
    // guarda innegociable: jamás por la vía de aceptar
    expect(JSON.stringify(map.screens)).not.toContain('CONSENTIMIENTO ACEPTADO');
  }, 120_000);

  it('el banner colgado de un envoltorio de ALTURA CERO también se rechaza', async () => {
    const { map } = await walk('/consent-envoltorio-invisible.html', [
      { id: 's1', action: 'click', hint: { text: 'Continuar' }, expect_after: 'continuado' },
      { id: 's2', action: 'expect_text', value: 'consentimiento rechazado' },
    ]);
    expect(report(map, 's1')!.outcome).toBe('ok');
    expect(report(map, 's2')!.outcome).toBe('ok');
    expect(JSON.stringify(map.screens)).not.toContain('CONSENTIMIENTO ACEPTADO');
  }, 120_000);

  it('la clase existe: el más externo es el envoltorio y NO se ve', async () => {
    const browser: Browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(`${FIX}/consent-envoltorio-invisible.html`);
      // el ancla exterior no tiene caja: la puerta de visibilidad la descarta bien
      expect(await page.locator('#consent_blackbar').isVisible()).toBe(false);
      // ...y el banner de verdad, que es su hijo, sí se ve. Elegir "el más
      // externo" a secas lo perdía por anidado.
      expect(await page.locator('#truste-consent-track').isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('par falsable: mirando SOLO al navegar (como antes), el banner sobrevive', async () => {
    // sin el barrido post-settle, cuando el CMP se inyecta a 1,2 s el walker ya
    // había mirado y no vuelve a mirar: el testigo se queda en 'pendiente'.
    const browser: Browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(`${FIX}/consent-tardio.html`);
      expect(await page.locator('#truste-consent-track').count()).toBe(0); // aún no existe
      await page.waitForTimeout(2_000);
      expect(await page.locator('#truste-consent-track').count()).toBe(1); // llegó después
      expect(await page.locator('#cmp').innerText()).toBe('consentimiento pendiente');
    } finally {
      await browser.close();
    }
  }, 120_000);
});
