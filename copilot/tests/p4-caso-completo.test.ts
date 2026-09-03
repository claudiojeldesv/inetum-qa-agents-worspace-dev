/**
 * P4 — la postura de CASO COMPLETO, y la única adición a mano que sobrevivió.
 *
 * El plan del panel (§P4) pide «los pasos del caso con su resultado esperado
 * SOLO en los que llevan un expect_*, su procedencia y la línea del FD». La
 * auditoría de maquetas ya había retirado «debería aparecer» de los doce pasos
 * por inventado: los de acción pura no tienen nada que comprobar, y decir lo
 * contrario invita a exigir aserciones donde el plan no las pide.
 *
 * Estos tests fijan las dos mitades:
 *  - los DATOS (puros): qué dice cada fila y de dónde sale, sin navegador;
 *  - la INTERFAZ: que eso llega de verdad a la pantalla del QA. La lección de
 *    D81 es que un camino sin test de punta a punta se rompe en manos de otro,
 *    así que el panel se abre en un navegador real y se leen sus filas.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { filasDelCaso, frasePaso, oraculoDelPaso } from '../src/walk-core.ts';
import { assistOverlayScript, TESTID_ATTR_CANDIDATES } from '../src/dom-walker.ts';
import type { WalkStep } from '../src/walk-types.ts';

const PASOS: WalkStep[] = [
  { id: 's1', action: 'goto', target: '/alta' },
  { id: 's2', action: 'fill', hint: { label: 'Nombre' }, value: 'Ana' },
  { id: 's3', action: 'fill', hint: { label: 'Clave' }, value: 'secreta', secret: true },
  { id: 's4', action: 'click', hint: { role: 'button', name: 'Guardar' }, scope: { text: 'Datos del tomador' } },
  { id: 's5', action: 'expect_text', value: 'Alta registrada' },
  { id: 's6', action: 'select', hint: { label: 'País' }, value: 'España' },
  { id: 's7', action: 'expect_value', hint: { label: 'Prima' }, value: '88.00' },
  { id: 's8', action: 'click', hint: { role: 'link', name: 'Salir' }, expect_after: 'Sesión cerrada' },
];

describe('P4 — los datos de la fila salen del guion y de nada más', () => {
  it('cada acción se dice en palabras, con lo que el paso trae — Y CON SU TIPO', () => {
    // D92: «pulsar el botón «Guardar»» dice más que «pulsar «Guardar»». El tipo
    // sale del rol declarado o del verbo, y si no se sabe, no se afirma.
    // Las postcondiciones NO repiten su valor en la frase: lo lleva la línea del
    // oráculo, debajo y con realce. Decirlo dos veces alarga la fila y no añade.
    expect(frasePaso(PASOS[1])).toBe('rellenar el campo «Nombre» con «Ana»');
    expect(frasePaso(PASOS[4])).toBe('comprobar el texto que muestra la pantalla');
    expect(frasePaso(PASOS[5])).toBe('elegir «España» en la lista «País»');
  });

  it('el ámbito del paso se dice, porque es la mitad de la instrucción', () => {
    // «pulsar Guardar» a secas es ambiguo en una pantalla con tres Guardar; el
    // guion ya sabe en cuál, y callarlo en la vista del caso sería esconderlo.
    expect(frasePaso(PASOS[3])).toBe('pulsar el botón «Guardar» (en «Datos del tomador»)');
  });

  it('un valor secreto NO se pinta: el panel vive en la página de la aplicación', () => {
    expect(frasePaso(PASOS[2])).toBe('rellenar el campo «Clave» con «••••»');
    expect(frasePaso(PASOS[2])).not.toContain('secreta');
  });

  it('el oráculo SOLO existe donde el guion lo pide', () => {
    expect(oraculoDelPaso(PASOS[0])).toBeUndefined();
    expect(oraculoDelPaso(PASOS[1])).toBeUndefined();
    expect(oraculoDelPaso(PASOS[4])).toBe('Alta registrada');
    expect(oraculoDelPaso(PASOS[6])).toBe('88.00');
  });

  it('una postcondición INLINE de un paso de acción también cuenta (K0.13 capa 3)', () => {
    // s8 es un click Y tiene algo que comprobar detrás. Tratarlo como acción
    // pura escondería un oráculo que el FD sí pide.
    expect(oraculoDelPaso(PASOS[7])).toBe('Sesión cerrada');
  });

  it('los estados son los de la tira: hecho, aquí, no cuadra, pendiente', () => {
    const filas = filasDelCaso(PASOS, {
      pasoActual: 's4',
      completados: new Set(['s1', 's2', 's3']),
      bloqueados: new Set(['s7']),
    });
    expect(filas.map((f) => f.estado)).toEqual([
      'hecho', 'hecho', 'hecho', 'aqui', 'pend', 'pend', 'nocuadra', 'pend',
    ]);
  });

  it('«aquí» gana a cualquier otro estado: es donde está el QA ahora', () => {
    const filas = filasDelCaso(PASOS, {
      pasoActual: 's7',
      completados: new Set(['s7']),
      bloqueados: new Set(['s7']),
    });
    expect(filas.find((f) => f.id === 's7')!.estado).toBe('aqui');
  });
});

describe('P4 — y eso llega a la pantalla del QA', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await (await browser.newContext()).newPage();
    await page.goto(pathToFileURL(resolve(__dirname, '../fixtures/cuatro-iguales.html')).href);
    // El panel vive en un shadow root CERRADO a propósito (el CSS de la app no
    // puede romperlo, ni él filtrarse a la app). Para poder leerlo desde el test
    // se fuerza a abierto ANTES de inyectarlo: así se prueba el panel de verdad
    // y no una copia suya escrita para el test.
    await page.evaluate(() => {
      const orig = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (init: ShadowRootInit) {
        return orig.call(this, { ...init, mode: 'open' });
      };
    });
    const caso = filasDelCaso(PASOS, {
      pasoActual: 's4',
      completados: new Set(['s1', 's2', 's3']),
      bloqueados: new Set(['s7']),
    });
    await page.evaluate(
      assistOverlayScript(
        TESTID_ATTR_CANDIDATES,
        PASOS[3],
        'no encuentro Guardar',
        false,
        [],
        { caso, casoRef: { flujo: 'cp042-alta', criterios: ['RF-014'] } },
      ),
    );
  }, 60_000);

  afterAll(async () => { await browser?.close(); });

  const sombra = async (sel: string): Promise<string[]> =>
    page.evaluate((s) => {
      const host = document.querySelector('[data-qa-assist-host]') as Element & { shadowRoot: ShadowRoot };
      return Array.from(host.shadowRoot.querySelectorAll(s)).map((e) =>
        ((e as HTMLElement).innerText || e.textContent || '').replace(/\s+/g, ' ').trim(),
      );
    }, sel);

  it('el botón de caso completo abre la vista Y EL PANEL SIGUE AHÍ', async () => {
    /**
     * La segunda mitad de este test no es retórica: la primera versión pasaba
     * con el panel APAGADO. El contenedor del caso se llamaba `caso` igual que
     * la clase de la postura, así que la regla que lo oculta casaba también con
     * el panel (`class="p caso"`) y al pulsar el botón desaparecía todo. El QA
     * lo vio a la primera: «toqué ese botón y se cerró el modal».
     *
     * Consultar el DOM NO prueba que se vea: `querySelectorAll` devuelve nodos
     * con `display:none` igual de contentos. Hay que medir la caja.
     */
    await page.evaluate(() => {
      const host = document.querySelector('[data-qa-assist-host]') as Element & { shadowRoot: ShadowRoot };
      (host.shadowRoot.getElementById('po-c') as HTMLElement).click();
    });
    const visto = await page.evaluate(() => {
      const host = document.querySelector('[data-qa-assist-host]') as Element & { shadowRoot: ShadowRoot };
      const panel = host.shadowRoot.querySelector('.p') as HTMLElement;
      const caja = host.shadowRoot.querySelector('.casobox') as HTMLElement;
      const r = panel.getBoundingClientRect(), c = caja.getBoundingClientRect();
      return { clases: panel.className, panelAlto: r.height, panelAncho: r.width, casoAlto: c.height };
    });
    expect(visto.clases).toContain('caso');
    expect(visto.panelAlto, 'el panel se apagó al cambiar de postura').toBeGreaterThan(100);
    expect(visto.panelAncho, 'la postura de caso ensancha el panel').toBeGreaterThan(400);
    expect(visto.casoAlto, 'la lista del caso no se ve').toBeGreaterThan(100);
  }, 60_000);

  it('se ven los ocho pasos, con su frase', async () => {
    const filas = await sombra('.casobox ol li .tx');
    expect(filas).toHaveLength(8);
    expect(filas[1]).toBe('rellenar el campo «Nombre» con «Ana»');
    expect(filas[3]).toBe('pulsar el botón «Guardar» (en «Datos del tomador»)');
  }, 60_000);

  it('los pasos de acción pura DICEN que no tienen nada que comprobar', async () => {
    // es el elemento que la auditoría corrigió: no se les inventa un oráculo
    const sin = await sombra('.casobox ol li .sin');
    expect(sin.length).toBeGreaterThan(0);
    expect(sin[0]).toContain('sin resultado que comprobar');
  }, 60_000);

  it('y los que sí lo tienen enseñan el texto exacto que se espera', async () => {
    const or = (await sombra('.casobox ol li .or')).join(' | ');
    expect(or).toContain('Alta registrada');
    expect(or).toContain('88.00');
  }, 60_000);

  it('la cabecera dice el caso, cuántos pasos y cuántos llevan comprobación', async () => {
    const cab = (await sombra('.casobox .cab')).join(' ');
    expect(cab).toContain('cp042-alta');
    expect(cab).toContain('8 pasos');
    expect(cab).toContain('3 con comprobación');
  }, 60_000);

  it('sin criteria.json se enseña al menos el criterio que declara el guion', async () => {
    // Es la única trazabilidad disponible en ese caso, y esconderla no ayuda: la
    // línea con fichero y línea del FD llega cuando hay criteria.json, no antes.
    const fd = (await sombra('.casobox .fd')).join(' ');
    expect(fd).toContain('RF-014');
  }, 60_000);

  it('dónde está el QA se ve sin leer: la fila en curso va marcada', async () => {
    const marcadas = await page.evaluate(() => {
      const host = document.querySelector('[data-qa-assist-host]') as Element & { shadowRoot: ShadowRoot };
      return Array.from(host.shadowRoot.querySelectorAll('.casobox ol li')).map((li) => li.className);
    });
    expect(marcadas[3]).toBe('aqui');
    expect(marcadas[6]).toBe('nocuadra');
    expect(marcadas[0]).toBe('hecho');
  }, 60_000);
});
