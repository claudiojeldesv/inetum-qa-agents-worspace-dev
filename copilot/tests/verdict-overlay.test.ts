/**
 * El panel de veredicto, mirado de cerca (fase B).
 *
 * Los tests de camino completo (`fase-b-veredicto.test.ts`) prueban que el veredicto
 * llega al acta. Aquí se prueba lo que esos NO ven porque nunca llegan a esa
 * pantalla: **qué dice el panel cuando no tiene nada que ofrecer**.
 *
 * Esa es una regla dura del plan, no un detalle de interfaz: «si no hay candidatos,
 * **eso es información**» — la aplicación no muestra ningún resultado, y eso empuja
 * hacia *es un defecto*. Un panel que ante una lista vacía se limita a enseñar un
 * hueco deja al QA pensando que la herramienta falló, cuando lo que ha ocurrido es
 * un hallazgo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { verdictOverlayScript, TESTID_ATTR_CANDIDATES } from '../src/dom-walker.ts';
import type { VerdictSubmission } from '../src/walk-verdict.ts';
import type { WalkStep } from '../src/walk-types.ts';

const FIXTURE = pathToFileURL(resolve(__dirname, '../fixtures/veredicto-autopilot.html')).href;
const STEP: WalkStep = { id: 's15', action: 'expect_text', value: 'Solicitud aprobada' };
const ESPERADO = 'Solicitud aprobada';

let browser: Browser;
let page: Page;

/** Monta el panel con el puente que en producción expone el walker. */
async function montar(candidatos: string[], rechazo?: string): Promise<VerdictSubmission[]> {
  const sent: VerdictSubmission[] = [];
  await page.exposeFunction('__qaVerdictSubmit', (p: VerdictSubmission) => {
    sent.push(p);
  });
  await page.goto(`${FIXTURE}`); // sin ?cmd: el autopiloto no toca nada
  await abrirShadow();
  await page.evaluate(
    verdictOverlayScript(
      TESTID_ATTR_CANDIDATES,
      STEP,
      ESPERADO,
      `El plan esperaba '${ESPERADO}' y no aparece.`,
      candidatos,
      rechazo,
    ),
  );
  return sent;
}

/**
 * ABRIR EL SHADOW ROOT, solo aquí.
 *
 * El panel nace con `attachShadow({ mode: 'closed' })` a propósito: así los locators de
 * Playwright no lo atraviesan y no interfiere con la resolución del walker. El precio es
 * que desde fuera **no se puede leer nada** — `host.shadowRoot` es `null`, y un test que
 * lo intente no falla: obtiene `undefined` y pasa por vacuidad, que es peor.
 *
 * Se fuerza `open` ANTES de inyectar el panel. Lo que se mira aquí —qué texto enseña— no
 * depende del modo del shadow root; el aislamiento sí depende, y lo protegen los tests que
 * comprueban que el walker no resuelve elementos del panel.
 */
const abrirShadow = (): Promise<void> =>
  page.evaluate(() => {
    const orig = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init: ShadowRootInit) {
      return orig.call(this, { ...init, mode: 'open' });
    };
  });

interface Vista {
  texto: string;
  visible: boolean;
}

const ver = (sel: string): Promise<Vista> =>
  page.evaluate((s) => {
    const host = document.querySelector('[data-qa-assist-host]');
    const el = host?.shadowRoot?.querySelector(s as string) as HTMLElement | null | undefined;
    if (!el) return { texto: '(no existe)', visible: false };
    return { texto: el.textContent ?? '', visible: getComputedStyle(el).display !== 'none' };
  }, sel);
const cmd = (c: unknown): Promise<void> =>
  page.evaluate((detail) => {
    document.querySelector('[data-qa-assist-host]')?.dispatchEvent(new CustomEvent('qa-assist-cmd', { detail }));
  }, c);

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

describe('el panel de veredicto — la lista vacía es un hallazgo, no un hueco', () => {
  it('EL PAR: sin candidatos, el panel DICE que eso es un dato y hacia dónde empuja', async () => {
    page = await browser.newPage();
    await montar([]);
    const v = await ver('#empty');
    expect(v.visible, 'con la lista vacía el panel se quedaba mudo').toBe(true);
    expect(v.texto).toMatch(/no muestra ning/i);
    // lo que convierte el hueco en información: adónde lleva
    expect(v.texto).toMatch(/defecto/i);
    await page.close();
  }, 120_000);

  it('el panel dice CÓMO SE SALE: los tres botones, y no hay otra', async () => {
    /**
     * Medido en campo el 2026-08-29. El QA capturó el texto y preguntó «¿ahora cómo
     * cierro el modal?»; acabó pulsando *Luego* para salir — o sea, firmando «lo dejo
     * sin resolver» cuando ya tenía la decisión tomada. El panel no tiene X ni Escape
     * a propósito (el run está parado esperando y no existe un «cerrar sin decidir»),
     * pero eso no estaba escrito en ninguna parte.
     */
    page = await browser.newPage();
    await montar(['Solicitud rechazada']);
    const v = await ver('.cierre');
    expect(v.visible, 'no se dice cómo se sale').toBe(true);
    expect(v.texto).toMatch(/tres botones/i);
    await page.close();
  }, 120_000);

  it('SIN JERGA NI MOJIBAKE: los textos del panel llevan sus tildes', async () => {
    /**
     * El panel de veredicto nació sin acentos —«lo senalo yo», «La aplicacion tiene
     * razon»— mientras el de asistencia sí los llevaba. En un producto que se le
     * enseña a un cliente regulado, eso canta; y la inconsistencia entre los dos
     * paneles canta más.
     */
    page = await browser.newPage();
    await montar([]);
    const todo = await page.evaluate(() => {
      const host = document.querySelector('[data-qa-assist-host]');
      return host?.shadowRoot?.querySelector('.p')?.textContent ?? '';
    });
    for (const bueno of ['lo señalo yo', 'La aplicación tiene razón', 'ningún texto de resultado']) {
      expect(todo, `falta la forma acentuada: ${bueno}`).toContain(bueno);
    }
    for (const malo of ['senalo yo', 'aplicacion tiene razon', 'ningun texto']) {
      expect(todo, `quedó sin acentuar: ${malo}`).not.toContain(malo);
    }
    await page.close();
  }, 120_000);

  it('elegir de la lista dice cuál es el gesto siguiente', async () => {
    page = await browser.newPage();
    await montar(['Solicitud rechazada']);
    await cmd({ choose: 0 });
    const v = await ver('#hint');
    expect(v.texto, 'tras elegir, el panel no dice qué hacer').toMatch(/La aplicación tiene razón/);
    await page.close();
  }, 120_000);

  it('CONTROL: con candidatos ese aviso NO sale — si saliera siempre, no significaría nada', async () => {
    page = await browser.newPage();
    await montar(['Solicitud rechazada', 'Listado de peticiones']);
    expect((await ver('#empty')).visible).toBe(false);
    await page.close();
  }, 120_000);

  it('los tres botones mandan su veredicto, y solo «app» lleva literal', async () => {
    for (const [orden, esperado] of [
      ['fd', 'fd'],
      ['defer', 'defer'],
    ] as const) {
      page = await browser.newPage();
      const sent = await montar(['Solicitud rechazada']);
      // se elige un literal ANTES a propósito: aunque el QA hubiera tocado la lista,
      // un "es un defecto" no puede viajar con una propuesta de texto pegada
      await cmd({ choose: 0 });
      await cmd(orden);
      await page.waitForFunction(() => true, undefined, { timeout: 300 }).catch(() => {});
      expect(sent).toHaveLength(1);
      expect(sent[0].verdict).toBe(esperado);
      expect(sent[0].value, `${orden} no puede llevar literal`).toBeUndefined();
      await page.close();
    }
  }, 120_000);

  it('«app» viaja con el literal elegido y con su procedencia', async () => {
    page = await browser.newPage();
    const sent = await montar(['Solicitud rechazada', 'Listado de peticiones']);
    await cmd({ choose: 0 });
    await cmd('app');
    await page.waitForFunction(() => true, undefined, { timeout: 300 }).catch(() => {});
    expect(sent[0]).toMatchObject({ verdict: 'app', value: 'Solicitud rechazada', source: 'candidato' });
    await page.close();
  }, 120_000);

  it('«app» sin haber elegido nada sale SIN literal: quien juzga es Node, no el panel', async () => {
    /**
     * La tentación es que el panel se niegue aquí mismo. No: `veredictoADecision` es
     * el único juez, y duplicar su regla dentro de la página sería la familia D2 —
     * el día que una de las dos cambie, el panel y el acta discreparán en silencio.
     * El panel manda el gesto tal cual y Node lo devuelve con el motivo.
     */
    page = await browser.newPage();
    const sent = await montar(['Solicitud rechazada']);
    await cmd('app');
    await page.waitForFunction(() => true, undefined, { timeout: 300 }).catch(() => {});
    expect(sent[0].verdict).toBe('app');
    expect(sent[0].value).toBeUndefined();
    await page.close();
  }, 120_000);

  it('el motivo del rechazo se enseña al reabrir, o el QA no sabría qué corregir', async () => {
    page = await browser.newPage();
    await montar(['Solicitud rechazada'], 'Para adoptar lo que dice la aplicación hace falta saber QUÉ dice.');
    const v = await ver('.err');
    expect(v.visible).toBe(true);
    expect(v.texto).toMatch(/QUÉ dice/);
    // y se lee COMO devuelto: reinyectado es identico al anterior, y en campo eso
    // se leyo como «el boton no cierra» en vez de «lo que hiciste no valia»
    expect(v.texto, 'no se dice que el panel ha VUELTO').toMatch(/ha vuelto/i);
    await page.close();
  }, 120_000);

  it('señalar en la página toma el TEXTO del elemento, no un locator', async () => {
    page = await browser.newPage();
    const sent = await montar([]);
    await cmd('pick');
    await page.click('#resultado');
    await cmd('app');
    await page.waitForFunction(() => true, undefined, { timeout: 300 }).catch(() => {});
    expect(sent[0]).toMatchObject({ verdict: 'app', value: 'Solicitud rechazada', source: 'senalado' });
    await page.close();
  }, 120_000);

  it('el panel no se señala a sí mismo: pulsar dentro de él no captura nada', async () => {
    page = await browser.newPage();
    const sent = await montar([]);
    await cmd('pick');
    /**
     * El panel vive pegado arriba a la derecha (`top:12px; right:12px`, 400px de
     * ancho), así que se pulsa DENTRO de él. La primera versión de este test pulsaba
     * en (200,40) creyendo que era el panel y estaba pulsando la página: capturaba el
     * `<h1>` y el test fallaba culpando al código.
     */
    const caja = await page.evaluate(() => {
      const r = document.querySelector('[data-qa-assist-host]')!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + 20 };
    });
    await page.mouse.click(caja.x, caja.y);
    await cmd('app');
    await page.waitForFunction(() => true, undefined, { timeout: 300 }).catch(() => {});
    expect(sent[0].value, 'el panel se capturó a sí mismo').toBeUndefined();
    await page.close();
  }, 120_000);
});
