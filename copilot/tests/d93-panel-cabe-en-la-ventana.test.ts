/**
 * D93 — en una ventana pequeña, el panel era más alto que la pantalla y los
 * botones del final quedaban FUERA, sin scroll con el que llegar a ellos.
 *
 * Medido por el QA en campo (2026-09-03): «cuando se ejecutó en esta resolución
 * tan pequeña, el largo es un problema porque no se alcanza a escrollear». Los
 * grupos de D92 alargaron el panel y en su pantalla las salidas —«No existe
 * aquí», «Bloquear paso»— cayeron por debajo del borde. Un panel cuyas salidas
 * no se alcanzan no es un panel con un defecto visual: es un panel que solo
 * ofrece las opciones que caben.
 *
 * El arreglo, y por qué esta forma: el panel NUNCA supera la altura de la
 * ventana (max-height) y hace scroll el CUERPO, no la página — la cabecera y la
 * tira quedan fijas porque son el arrastre y las posturas. La alternativa que
 * se descartó es sacarlo a una ventana propia del navegador: el panel vive en
 * el DOM de la página a propósito (una ventana aparte fue exactamente lo que el
 * QA rechazó en el estreno del inventario, y con razón — sesiones de un solo
 * uso, datos que se queman).
 *
 * Y el arrastre queda SUJETO a la ventana: lo único que mueve el panel es su
 * propia cabecera, así que un panel arrastrado fuera no se puede recuperar.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { filasDelCaso } from '../src/walk-core.ts';
import { assistOverlayScript, TESTID_ATTR_CANDIDATES } from '../src/dom-walker.ts';
import type { WalkStep } from '../src/walk-types.ts';

// una pantalla pequeña de verdad, no un desktop recortado un poco
const VENTANA = { width: 900, height: 460 };

const PASOS: WalkStep[] = Array.from({ length: 24 }, (_, i) => ({
  id: `s${i + 1}`,
  action: 'fill' as const,
  hint: { label: `Campo ${i + 1}` },
  value: `v${i + 1}`,
}));

describe('D93 — el panel cabe en la ventana y todo es alcanzable', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await (await browser.newContext({ viewport: VENTANA })).newPage();
    await page.goto(pathToFileURL(resolve(__dirname, '../fixtures/cuatro-iguales.html')).href);
    await page.evaluate(() => {
      const orig = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (init: ShadowRootInit) {
        return orig.call(this, { ...init, mode: 'open' });
      };
    });
    const caso = filasDelCaso(PASOS, { pasoActual: 's12', completados: new Set(['s1']), bloqueados: new Set() });
    await page.evaluate(
      assistOverlayScript(TESTID_ATTR_CANDIDATES, PASOS[11], 'motivo de prueba', false, [], {
        caso,
        casoRef: { flujo: 'caso-largo', criterios: ['RF-001'] },
      }),
    );
  }, 60_000);

  afterAll(async () => { await browser?.close(); });

  const sombra = <T>(fn: (root: ShadowRoot, win: Window) => T): Promise<T> =>
    page.evaluate((src) => {
      const host = document.querySelector('[data-qa-assist-host]') as Element & { shadowRoot: ShadowRoot };
      // eslint-disable-next-line no-eval
      return (0, eval)(src)(host.shadowRoot, window);
    }, `(${fn.toString()})`);

  it('el panel nunca es más alto que la ventana', async () => {
    const r = await sombra((root, win) => {
      const p = root.querySelector('.p') as HTMLElement;
      return { alto: p.getBoundingClientRect().height, ventana: win.innerHeight };
    });
    expect(r.alto, `panel ${r.alto}px en ventana de ${r.ventana}px`).toBeLessThanOrEqual(r.ventana);
  }, 60_000);

  it('las SALIDAS del final se pueden alcanzar: el cuerpo hace scroll', async () => {
    // El defecto de campo, literal: «Bloquear paso» por debajo del borde y sin
    // scroll con el que llegar. Consultar el DOM no basta (la lección del panel
    // apagado): se scrollea y se mide la caja.
    const r = await sombra((root, win) => {
      const b = root.getElementById('b') as HTMLElement; // «Bloquear paso»
      b.scrollIntoView({ block: 'nearest' });
      const caja = b.getBoundingClientRect();
      return { arriba: caja.top, abajo: caja.bottom, ventana: win.innerHeight, alto: caja.height };
    });
    expect(r.alto, 'el botón tiene que existir y medir algo').toBeGreaterThan(10);
    expect(r.arriba).toBeGreaterThanOrEqual(0);
    expect(r.abajo, 'tras scrollear, el botón tiene que quedar DENTRO de la ventana').toBeLessThanOrEqual(r.ventana);
  }, 60_000);

  it('la cabecera no scrollea: el arrastre y las posturas siempre a mano', async () => {
    const r = await sombra((root) => {
      const body = root.querySelector('.b') as HTMLElement;
      body.scrollTop = body.scrollHeight;
      const h = root.querySelector('.h') as HTMLElement;
      return { cabeceraAlto: h.getBoundingClientRect().height, cabeceraArriba: h.getBoundingClientRect().top };
    });
    expect(r.cabeceraAlto).toBeGreaterThan(10);
    expect(r.cabeceraArriba).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it('la vista de caso también cabe, con sus 24 pasos scrolleables', async () => {
    const r = await sombra((root, win) => {
      (root.getElementById('po-c') as HTMLElement).click();
      const p = root.querySelector('.p') as HTMLElement;
      const caja = root.querySelector('.casobox') as HTMLElement;
      const filas = caja.querySelectorAll('ol li').length;
      // al fondo: la última fila tiene que poder verse
      caja.scrollTop = caja.scrollHeight;
      const ultima = caja.querySelector('ol li:last-child') as HTMLElement;
      const rect = ultima.getBoundingClientRect();
      const res = {
        filas,
        panelAlto: p.getBoundingClientRect().height,
        ventana: win.innerHeight,
        ultimaVisible: rect.top >= 0 && rect.bottom <= win.innerHeight,
      };
      (root.getElementById('po-c') as HTMLElement).click(); // volver
      return res;
    });
    expect(r.filas).toBe(24);
    expect(r.panelAlto).toBeLessThanOrEqual(r.ventana);
    expect(r.ultimaVisible, 'la fila 24 tiene que ser alcanzable con scroll').toBe(true);
  }, 60_000);

  it('el arrastre no puede perder el panel fuera de la ventana', async () => {
    // Se simula el gesto real: mousedown en la cabecera, arrastre exagerado
    // hacia abajo y a la derecha, mouseup. La cabecera tiene que seguir dentro.
    const head = await sombra((root) => {
      const h = root.querySelector('.h') as HTMLElement;
      const r = h.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(head.x, head.y);
    await page.mouse.down();
    await page.mouse.move(VENTANA.width + 900, VENTANA.height + 900, { steps: 4 });
    await page.mouse.up();
    const r = await sombra((root, win) => {
      const h = (root.querySelector('.h') as HTMLElement).getBoundingClientRect();
      return { arriba: h.top, izquierda: h.left, ventanaAlto: win.innerHeight, ventanaAncho: win.innerWidth };
    });
    expect(r.arriba, 'la cabecera se fue por abajo').toBeLessThan(r.ventanaAlto);
    expect(r.izquierda, 'la cabecera se fue por la derecha').toBeLessThan(r.ventanaAncho);
  }, 60_000);
});
