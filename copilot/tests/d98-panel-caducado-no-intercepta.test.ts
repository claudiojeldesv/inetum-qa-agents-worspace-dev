/**
 * D98 — un panel que caduca deja de interceptar los clics de la aplicación.
 *
 * El panel vive en la página (`position:fixed`, arriba a la derecha, 390 px de
 * ancho) y **sobrevive a la espera**: nadie lo quita cuando el plazo se agota.
 * D64 ya había medido que un panel encima del objetivo mata la acción, y puso
 * `panelDejaDeInterceptar()` en los dos caminos de ÉXITO — secuencia entregada y
 * veredicto firmado. Los desenlaces SIN entrega se quedaron fuera.
 *
 * Medido en el estreno del lab (2026-09-04): tres paneles caducados en `cp007` y
 * después el paso `s10` murió con
 *
 *   la acción 'click' falló sobre getByRole('button', { name: 'Create' }):
 *   Timeout 10000ms exceeded. (<div data-qa-assist-host="1"> intercepts pointer events)
 *
 * Un fallo del walker con cara de fallo de la aplicación, sobre un botón que no
 * tenía nada malo — y que además infla la cuenta de bloqueados y manda a quien lo
 * lea a depurar donde no hay nada.
 *
 * El test mide LO QUE IMPORTA, que es si el clic llega al botón de debajo: se
 * pone un botón real donde el panel se pinta, se pulsa, y se cuenta. Comprobar
 * la propiedad CSS sería comprobar el arreglo, no el efecto.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

import { assistOverlayScript, TESTID_ATTR_CANDIDATES } from '../src/dom-walker.ts';
import type { WalkStep } from '../src/walk-types.ts';

const PASO: WalkStep = {
  id: 's6',
  action: 'select',
  hint: { test_id: 'type' },
  value: 'Twin',
};

/** Un botón puesto DONDE SE PINTA EL PANEL: arriba a la derecha, como el «Create» de campo. */
const PAGINA = `
  <!doctype html><meta charset="utf-8"><title>d99</title>
  <body style="margin:0">
    <button id="crear" style="position:fixed;top:40px;right:40px;width:120px;height:36px">Create</button>
    <script>window.__pulsado = 0; document.getElementById('crear').onclick = () => { window.__pulsado += 1; };</script>
  </body>`;

describe('D98 — el clic de la app llega al botón que el panel tapa', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await page.setContent(PAGINA);
    await page.evaluate(assistOverlayScript(TESTID_ATTR_CANDIDATES, PASO, 'motivo de prueba', false, []));
  }, 60_000);

  afterAll(async () => { await browser?.close(); });

  it('el panel se pinta encima del botón: si no, el test no probaría nada', async () => {
    // Cerrojo del propio test. Sin esta comprobación, el caso siguiente podría
    // pasar simplemente porque el panel cayó en otro sitio.
    const solapan = await page.evaluate(() => {
      const h = document.querySelector('[data-qa-assist-host]') as HTMLElement;
      const b = document.getElementById('crear') as HTMLElement;
      const a = h.getBoundingClientRect();
      const c = b.getBoundingClientRect();
      return !(a.right < c.left || a.left > c.right || a.bottom < c.top || a.top > c.bottom);
    });
    expect(solapan, 'el panel tiene que caer sobre el botón para que esto mida algo').toBe(true);
  }, 60_000);

  it('MIENTRAS la espera está viva, el panel SÍ recibe: sus botones tienen que funcionar', async () => {
    const puedeRecibir = await page.evaluate(() => {
      const h = document.querySelector('[data-qa-assist-host]') as HTMLElement;
      return getComputedStyle(h).pointerEvents !== 'none';
    });
    expect(puedeRecibir, 'con pointer-events:none desde el principio, Grabar y Parar no se podrían pulsar').toBe(true);
  }, 60_000);

  it('cuando la espera acaba sin entrega, el clic pasa al botón de la app', async () => {
    // Lo que hace el walker al cerrar la espera, sea cual sea el desenlace.
    await page.evaluate((attr) => {
      document.querySelectorAll(`[${attr}]`).forEach((h) => {
        (h as HTMLElement).style.pointerEvents = 'none';
      });
    }, 'data-qa-assist-host');

    // El clic real de Playwright, con su hit-test: es el que fallaba en campo.
    await page.click('#crear', { timeout: 5_000 });
    expect(await page.evaluate(() => (window as any).__pulsado)).toBe(1);
  }, 60_000);
});

describe('D98 — falsificable: sin el arreglo, el clic muere', () => {
  it('con el panel interceptando, el mismo clic da timeout citando el host', async () => {
    // La otra mitad de la prueba: que el defecto EXISTE. Si esto pasara, el
    // arreglo no estaría arreglando nada.
    const b = await chromium.launch();
    const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await p.setContent(PAGINA);
    await p.evaluate(assistOverlayScript(TESTID_ATTR_CANDIDATES, PASO, 'motivo', false, []));
    let error = '';
    await p.click('#crear', { timeout: 3_000 }).catch((e) => { error = String(e); });
    await b.close();
    expect(error, 'el clic tenía que morir interceptado').toContain('intercepts pointer events');
    expect(error).toContain('data-qa-assist-host');
  }, 60_000);
});
