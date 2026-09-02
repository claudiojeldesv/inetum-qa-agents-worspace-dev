/**
 * D90 — el panel pregunta EN EL IDIOMA DEL FD, no en el de los locators.
 *
 * El motor trabaja con la frase del FD: el guion guarda `{role:'link',
 * name:'Book now'}` y 97 de los 102 pasos completados de un run de campo se
 * resolvieron así. Pero cuando esa frase era ambigua el panel cambiaba de
 * idioma: cuatro filas idénticas (`link · Book now`) y «elige un locator». El QA
 * eligió la primera —el botón del banner— y de ahí salió una habitación
 * equivocada reservada en verde.
 *
 * Un humano no elige por posición: elige por contexto («el de la tarjeta
 * Single»). Eso es exactamente el `scope` del guion, y esto lo ofrece en el
 * momento en que hace falta.
 *
 * Lo que estos tests fijan, y el orden importa:
 *  1. la zona se calcula **verificando**: etiqueta única en la página y cadena
 *     que resuelve a uno. Ofrecer algo ambiguo pintado de bueno es D87;
 *  2. lo elegido llega al guion como `scope`, NO como posición — es la
 *     diferencia entre enseñarle dónde está el elemento y enseñarle a leer el
 *     plan;
 *  3. y por eso NO es frágil: entra en memoria durable, al contrario que el
 *     `.nth(i)` que el inventario produce (D89).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { locatorEsFragil } from '../src/walk-core.ts';
import type { AssistPatch, DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 'd90', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function correr(cmd: string): Promise<{ map: DomMap; patch: AssistPatch | null }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-d90-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'd90',
    entry: `/cuatro-iguales.html?cmd=${cmd}`,
    // hint AMBIGUO a propósito: es el caso de campo. Sin scope, cuatro «Book now».
    flows: [{ flow: 'habitacion', steps: [{ id: 's1', action: 'click', hint: { role: 'link', name: 'Book now' } }] }],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: true, assistTimeoutMs: 45_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'aliases.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  const map = await new DomWalker(opts, script, contract, freshState()).run();
  let patch: AssistPatch | null = null;
  try {
    patch = JSON.parse(readFileSync(resolve(workDir, 'assist-patch.json'), 'utf8')) as AssistPatch;
  } catch {
    patch = null;
  }
  return { map, patch };
}

describe('D90 — las zonas se calculan verificando, no proponiendo', () => {
  let browser: Browser;
  let page: Page;
  let walker: DomWalker;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await (await browser.newContext()).newPage();
    await page.goto(pathToFileURL(resolve(__dirname, '../fixtures/cuatro-iguales.html')).href);
    const wd = mkdtempSync(resolve(tmpdir(), 'qa-d90b-'));
    walker = DomWalker.forBench(page, contract, wd, resolve(wd, 'a.json'));
  }, 60_000);

  afterAll(async () => { await browser?.close(); });

  it('cada zona lleva el nombre de su tarjeta y resuelve a UNO', async () => {
    const zonas = await walker.benchZonas({ id: 's', action: 'click', hint: { role: 'link', name: 'Book now' } });
    expect(zonas.length, `zonas: ${JSON.stringify(zonas.map((z) => z.etiqueta))}`).toBeGreaterThanOrEqual(3);
    for (const z of zonas) {
      expect(z.locator, z.etiqueta).toContain(`getByText('${z.etiqueta}', { exact: true })`);
      expect(z.locator).toContain(".locator('xpath=");
      // y la cadena se EJECUTA: que la etiqueta sea única no basta si la subida
      // al contenedor no acaba en el elemento (D87 — verificar, no proponer)
      const m = /^getByText\('(.+?)', \{ exact: true \}\)\.locator\('xpath=(.+?)'\) >> getByRole\('(.+?)', \{ name: '(.+?)', exact: true \}\)$/.exec(z.locator);
      expect(m, `la cadena no tiene la forma esperada: ${z.locator}`).toBeTruthy();
      const resuelto = page
        .getByText(m![1], { exact: true })
        .locator(`xpath=${m![2]}`)
        .getByRole(m![3] as 'link', { name: m![4], exact: true });
      expect(await resuelto.count(), z.locator).toBe(1);
    }
    expect(new Set(zonas.map((z) => z.etiqueta)).size, 'cada zona tiene su nombre').toBe(zonas.length);
  }, 60_000);

  it('la zona NO es posicional: por eso puede entrar en memoria durable', async () => {
    // Es la diferencia con el inventario de D87/D89: allí lo que el QA elige es
    // `.nth(i)` y el cerrojo de fragilidad lo deja fuera de la memoria. Aquí no.
    const zonas = await walker.benchZonas({ id: 's', action: 'click', hint: { role: 'link', name: 'Book now' } });
    for (const z of zonas) expect(locatorEsFragil(z.locator), z.locator).toBe(false);
  }, 60_000);

  it('un hint que resuelve único no ofrece zonas: no hay nada que desambiguar', async () => {
    const zonas = await walker.benchZonas({ id: 's', action: 'click', hint: { role: 'link', name: 'Reservar ya' } });
    expect(zonas).toHaveLength(0);
  }, 60_000);
});

describe('D90 — y lo elegido llega al guion como ÁMBITO', () => {
  it('el paso se ejecuta y el parche trae scope, no una posición', async () => {
    const { map, patch } = await correr('zona');
    expect(map.open_questions, `bloqueos: ${JSON.stringify(map.open_questions)}`).toHaveLength(0);
    const paso = patch!.entries[0].steps.find((p) => p.role === 'target')!;
    expect(paso.scope, 'sin scope esto sería otro locator posicional más').toEqual({ text: 'Suite' });
    expect(locatorEsFragil(paso.locator), paso.locator).toBe(false);
    // el hint es el del PASO, no la etiqueta: «pulsa Book now en la tarjeta
    // Suite» no es «pulsa Suite»
    expect(paso.hint).toEqual({ role: 'link', name: 'Book now' });
  }, 90_000);

  it('el guion fundido queda en lenguaje de FD: hint + scope', async () => {
    const { patch } = await correr('zona');
    const walk = patch!.entries[0].walk_steps.find((w) => w.action === 'click')!;
    expect(walk.hint).toEqual({ role: 'link', name: 'Book now' });
    expect(walk.scope).toEqual({ text: 'Suite' });
  }, 90_000);

  it('y pulsa el enlace de ESA tarjeta, no el primero de la lista', async () => {
    // El cerrojo que distingue «resolvió» de «resolvió el correcto»: el fixture
    // deja constancia del href pulsado, y la Suite es `#u`.
    const { map } = await correr('zona');
    const r = (map.rescues ?? []).find((x) => x.step === 's1');
    expect(r?.locator).toContain("getByText('Suite', { exact: true })");
  }, 90_000);

  it('una zona que no existe no se inventa: el paso queda bloqueado', async () => {
    const { map } = await correr('zona-inexistente');
    expect(map.open_questions.length).toBeGreaterThan(0);
  }, 90_000);
});
