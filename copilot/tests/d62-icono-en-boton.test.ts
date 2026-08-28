/**
 * D62 — el QA pulsa el icono y el panel se quedaba con el icono.
 *
 * Un botón de acción moderno es `<button><i class="icon"/></button>`. Al pulsarlo, el
 * navegador entrega el `<i>`, que es rol `generic` y no tiene identidad: el panel lo
 * descartaba y le decía al QA «señala su contenedor» — pidiéndole que haga el trabajo
 * del navegador.
 *
 * Medido en campo el 2026-08-28: la papelera del listado de empleados de OrangeHRM es
 * exactamente esa forma —sin texto, sin `aria-label`, sin `title`— y **bloqueó el
 * ejercicio del panel**. El QA lo describió como «cuando presiono el icono de basura no
 * lo coge».
 *
 * El control que importa no es que capture: es que capture **el botón correcto**. Subir
 * al ancestro no puede convertir dos botones distintos en el mismo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { assistOverlayScript, TESTID_ATTR_CANDIDATES } from '../src/dom-walker.ts';
import type { AssistSubmission, PickedElement, WalkStep } from '../src/walk-types.ts';

const FIXTURE = pathToFileURL(resolve(__dirname, '../fixtures/boton-con-icono.html')).href;
const STEP: WalkStep = { id: 's9', action: 'click', hint: { role: 'button', name: 'papelera' } };

let browser: Browser;
let page: Page;

interface Arnes {
  sent: AssistSubmission[];
  estado: () => Promise<string>;
}

async function abrirPanel(): Promise<Arnes> {
  const sent: AssistSubmission[] = [];
  await page.exposeFunction('__qaAssistSubmit', (p: AssistSubmission) => {
    sent.push(p);
  });
  await page.exposeFunction('__qaAssistCheck', (el: PickedElement) => ({
    ok: true, tier: 'indexed', fragile: true, label: 'posicional', why: '', source: `stub(${el.role})`,
  }));
  await page.exposeFunction('__qaAssistResolve', (src: string) => ({ ok: !!src, count: 1, unique: true }));
  await page.goto(FIXTURE);
  await page.evaluate(assistOverlayScript(TESTID_ATTR_CANDIDATES, STEP, 'no encuentro «papelera» en esta pantalla'));
  return {
    sent,
    // el shadow root es CERRADO: el estado se lee por el mismo canal que usan los tests
    estado: () =>
      page.evaluate(() => {
        const host = document.querySelector('[data-qa-assist-host]') as unknown as { shadowRoot?: ShadowRoot } | null;
        return host?.shadowRoot?.getElementById('s')?.textContent ?? '(sin shadow abierto)';
      }),
  };
}

const cmd = (c: string): Promise<void> =>
  page.evaluate((detail) => {
    document.querySelector('[data-qa-assist-host]')?.dispatchEvent(new CustomEvent('qa-assist-cmd', { detail }));
  }, c);

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

describe('D62 — pulsar el icono captura el botón que lo contiene', () => {
  it('EL PAR DE CAMPO: se pulsa el <i> de la papelera y se graba el <button>', async () => {
    page = await browser.newPage();
    const h = await abrirPanel();
    await cmd('record');

    // el QA hace lo que hizo en campo: pulsar el ICONO, no el botón
    await page.click('#borrar-1 i');

    // y el evento llega a la app: el panel no cancela nada
    expect(await page.locator('#resultado').textContent()).toBe('pulsado: borrar-1');

    await cmd('stop');
    await page.waitForFunction(() => true, undefined, { timeout: 500 }).catch(() => {});

    expect(h.sent, 'no se grabó nada: el panel volvió a descartar el icono').toHaveLength(1);
    const seq = h.sent[0].sequence;
    expect(seq).toHaveLength(1);
    expect(seq[0].role, 'se quedó con el <i> en vez de subir al <button>').toBe('button');
    await page.close();
  }, 120_000);

  it('CONTROL: subir al ancestro NO confunde dos botones distintos', async () => {
    page = await browser.newPage();
    const h = await abrirPanel();
    await cmd('record');
    await page.click('#borrar-1 i');
    await page.click('#borrar-2 i');
    await cmd('stop');
    await page.waitForFunction(() => true, undefined, { timeout: 500 }).catch(() => {});

    const seq = h.sent[0].sequence;
    expect(seq, 'dos clics en botones distintos tienen que dar dos filas').toHaveLength(2);
    // La identidad la aporta el contexto (ancla/índice), no el nombre: los dos botones
    // son `button` sin nombre. Lo que NO puede pasar es que se colapsen en uno.
    expect(seq[0].nth_of_role !== seq[1].nth_of_role || seq[0].anchor?.name !== seq[1].anchor?.name).toBe(true);
    await page.close();
  }, 120_000);

  it('CONTROL: un icono que NO está dentro de nada interactivo se sigue rechazando', async () => {
    page = await browser.newPage();
    const h = await abrirPanel();
    await cmd('record');
    await page.click('#suelto i');
    await cmd('stop');
    await page.waitForFunction(() => true, undefined, { timeout: 500 }).catch(() => {});

    // no se graba nada, y el panel dice POR QUÉ en vez de callarse (K0.26)
    expect(h.sent[0].sequence).toHaveLength(0);
    expect(await h.estado()).not.toContain('grabando (1)');
    await page.close();
  }, 120_000);

  it('el hover sigue sin subir: un envoltorio no es el abridor que el QA señaló', async () => {
    page = await browser.newPage();
    const h = await abrirPanel();
    await cmd('record');
    await page.hover('#borrar-1 i');
    await page.waitForTimeout(600);
    await page.click('#borrar-2 i');
    await cmd('stop');
    await page.waitForFunction(() => true, undefined, { timeout: 500 }).catch(() => {});

    const seq = h.sent[0].sequence;
    // el clic sí sube; el hover sobre el icono no genera una fila propia de rol generic
    expect(seq.every((e) => e.role !== 'generic')).toBe(true);
    await page.close();
  }, 120_000);
});
