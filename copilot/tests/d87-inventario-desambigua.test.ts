/**
 * D87 — el inventario proponía locators AMBIGUOS y los pintaba «estables».
 *
 * Medido en campo (Restful Booker, 2026-09-02): la portada tiene CUATRO enlaces
 * «Book now». El inventario de D81 prefería el nombre accesible sin comprobar
 * que resolviera único, así que las cuatro filas ofrecían el MISMO locator; al
 * elegir una, la validación en vivo la rechazaba, no se creaba fila, y el QA
 * enviaba el panel vacío creyendo que había señalado algo. El registro de D86
 * lo dejó en una línea: `enviado=true, gestos=0`.
 *
 * Dos lecciones, y la segunda es la que casi se me escapa:
 *
 *  1. **Estable, correcto y único son tres ejes distintos.** El semáforo decía
 *     «estable · nombre accesible» en verde sobre un locator que apuntaba a
 *     cuatro cosas.
 *  2. **Verificar con una semántica distinta a la del consumidor es no
 *     verificar.** La primera versión comparaba nombres con `===`, pero el
 *     `getByRole` de Playwright casa SIN distinguir mayúsculas: sobre una
 *     página con «Book Now» y tres «Book now», el check decía «único» de algo
 *     que en ejecución resuelve cuatro.
 */
import { describe, it, expect } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { inventoryScript, TESTID_ATTR_CANDIDATES } from '../src/dom-walker.ts';
import type { ElementoInventario } from '../src/walk-core.ts';

let browser: Browser;
let page: Page;
let inv: ElementoInventario[];

beforeAll(async () => {
  browser = await chromium.launch();
  page = await (await browser.newContext()).newPage();
  await page.goto(pathToFileURL(resolve(__dirname, '../fixtures/cuatro-iguales.html')).href);
  inv = (await page.evaluate(inventoryScript(TESTID_ATTR_CANDIDATES, []))) as ElementoInventario[];
}, 60_000);

afterAll(async () => { await browser?.close(); });

/** Resuelve el locator propuesto CON la gramática real, no con una imitación. */
async function resuelve(locator: string): Promise<number> {
  const m = /^getByRole\('([^']+)', \{ name: '(.*)' \}\)(?:\.nth\((\d+)\))?$/.exec(locator);
  if (m) {
    let l = page.getByRole(m[1] as Parameters<Page['getByRole']>[0], { name: m[2] });
    if (m[3] !== undefined) l = l.nth(Number(m[3]));
    return l.count();
  }
  if (locator.startsWith('css=')) return page.locator(locator.slice(4)).count();
  const pos = /^getByRole\('([^']+)'\)\.nth\((\d+)\)$/.exec(locator);
  if (pos) return page.getByRole(pos[1] as Parameters<Page['getByRole']>[0]).nth(Number(pos[2])).count();
  return -1;
}

describe('D87 — cada fila del inventario resuelve a UN elemento', () => {
  it('los cuatro enlaces duplicados reciben locators distintos y únicos', async () => {
    const books = inv.filter((e) => /book\s*now/i.test(e.name ?? ''));
    expect(books, 'el fixture tiene cuatro').toHaveLength(4);
    const vistos = new Set<string>();
    for (const e of books) {
      expect(await resuelve(e.locator), `${e.locator} debe resolver a 1`).toBe(1);
      vistos.add(e.locator);
    }
    expect(vistos.size, 'cada fila necesita su propio locator').toBe(4);
  }, 60_000);

  it('el desambiguado CONSERVA el significado: sigue diciendo qué es, y además cuál', async () => {
    // `getByRole('link').nth(7)` —posición entre TODOS los enlaces— también
    // resolvería único, y sería mucho peor: no dice nada de qué se está
    // pulsando y se rompe al añadir cualquier enlace antes en la página.
    const books = inv.filter((e) => /book\s*now/i.test(e.name ?? ''));
    for (const e of books) expect(e.locator, e.locator).toMatch(/name: 'Book\s*[Nn]ow'/);
  }, 60_000);

  it('un posicional NO se declara estable: el semáforo tiene que avisar', async () => {
    const books = inv.filter((e) => /book\s*now/i.test(e.name ?? ''));
    for (const e of books) expect(e.estable, e.locator).toBe(false);
  }, 60_000);

  it('la caja del nombre no engaña: «Book Now» no se da por único habiendo tres «Book now»', async () => {
    // El getByRole de Playwright casa sin distinguir mayúsculas. Comparar con
    // === decía «único» de algo que en ejecución resuelve cuatro.
    const distinto = inv.find((e) => e.name === 'Book Now');
    expect(distinto, 'el fixture lo trae a propósito').toBeTruthy();
    expect(distinto!.estable, 'no puede declararse estable').toBe(false);
    expect(await resuelve(distinto!.locator)).toBe(1);
  }, 60_000);

  it('lo que SÍ tiene identidad propia sigue saliendo estable: el arreglo no degrada lo bueno', async () => {
    const unico = inv.find((e) => e.locator === 'css=#unico');
    expect(unico, 'el enlace con id debe estar en el inventario').toBeTruthy();
    expect(unico!.estable).toBe(true);
    expect(await resuelve(unico!.locator)).toBe(1);
  }, 60_000);
});
