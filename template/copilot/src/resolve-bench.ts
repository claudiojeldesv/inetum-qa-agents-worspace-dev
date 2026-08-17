/**
 * BANCO DE RESOLUCIÓN (K0.31) — el arnés con el que la escalera se mide contra
 * un corpus grande de páginas reales (Mind2Web y los que vengan), offline y a $0.
 *
 * Qué mide y por qué así:
 *  - Corre la escalera REAL del producto (`DomWalker.forBench`), no una copia:
 *    un banco que evalúa una reimplementación mide la reimplementación.
 *  - Sobre FOTOGRAFÍAS del DOM (`page.setContent`), sin red y sin ejecutar la
 *    acción: en una página muerta un clic no prueba nada y puede navegar.
 *  - La métrica que manda NO es el acierto, es `EQUIVOCADO`: resolver el
 *    elemento que no era, en silencio. Un walker que se planta mucho es lento;
 *    uno que acierta el 95% y falla mudo el 5% es inservible para QA regulado.
 *    Por eso el informe separa tres desenlaces y nunca los suma:
 *      acierto    — resolvió, y es el elemento anotado como verdadero
 *      EQUIVOCADO — resolvió otro elemento (el fallo que no se puede tolerar)
 *      planta     — no resolvió: honesto, va al panel o al rescate
 *
 * Formato de entrada (JSONL, una caso por línea) — deliberadamente agnóstico del
 * dataset, para que adaptar Mind2Web (o un corpus corporativo propio) sea un
 * trabajo de DATOS y no de código:
 *   {
 *     "id": "task42-step1",
 *     "site": "united.com",
 *     "task": "Book a flight from NYC to Miami",   // opcional, para el informe
 *     "html": "<!doctype html>…",                  // o "html_path": "rel/al/manifest.html"
 *     "action": "click" | "fill" | "select" | …,   // decide qué peldaños entran (K0.28)
 *     "hint": { "role": "button", "name": "Search" },
 *     "target": "#search-btn"                      // CSS de la verdad anotada
 *   }
 *
 * Uso:
 *   tsx copilot/src/resolve-bench.ts <manifest.jsonl> [--contract=<yaml>] [--json] [--limit=N]
 */
import { appendFileSync, existsSync, readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { chromium, type Browser, type Page } from '@playwright/test';

import { DomWalker, type StyleContract } from './dom-walker.ts';
import type { WalkAction, WalkStep } from './walk-types.ts';

export interface BenchCase {
  id: string;
  site?: string;
  task?: string;
  html?: string;
  html_path?: string;
  action: WalkAction;
  hint: WalkStep['hint'];
  scope?: WalkStep['scope'];
  target: string;
  /**
   * CASO DE CONTROL: desenlace que este caso DEBE producir. Sirve para
   * autocomprobar el arnés — un banco incapaz de detectar un fallo mudo daría
   * 100% de acierto siempre. Los casos de control NO puntúan al walker (no son
   * medida, son termómetro), pero si dejan de cumplirse el banco está roto y
   * eso sí es un fallo: se avisa y el CLI sale con error.
   */
  expect?: BenchOutcome;
}

/**
 * K0.40 — el cuarto desenlace, y hay que justificarlo porque es el único que
 * podría estar inventado para que la cifra quede bonita.
 *
 * En un corpus real la mitad de los controles son `<a><span>Texto</span></a>`, y
 * el peldaño de texto resuelve al nodo MÁS PROFUNDO que contiene el texto: el
 * `<span>`, no el `<a>` que anotó la persona. Medido en Mind2Web: 8 de los 9
 * primeros "EQUIVOCADO" eran exactamente eso.
 *
 * Eso no es un fallo mudo. Un clic sobre el `<span>` BURBUJEA hasta el `<a>`: se
 * ejecuta el mismo manejador y el negocio ocurre igual. Cuál de los dos nodos es
 * "el elemento" es una decisión de modelado del dataset, no un hecho de la
 * página.
 *
 * Tres cautelas que hacen que la categoría no sea una amnistía:
 *  - Solo cuenta HACIA DENTRO. Resolver un ANCESTRO del anotado es EQUIVOCADO y
 *    se queda así: pulsar el contenedor pulsa su centro, que puede ser otro hijo.
 *  - Solo para acciones cuyo efecto propaga (`click`/`hover`). Escribir o
 *    seleccionar sobre un descendiente no equivale a nada.
 *  - Nunca se suma al acierto. Va en su propia línea y con su propio recuento.
 *
 * Límite declarado: offline no se puede comprobar que el descendiente no pare la
 * propagación (`stopPropagation`, `pointer-events:none`). Es la parte de esta
 * categoría que se sostiene por argumento y no por medida.
 */
export type BenchOutcome = 'acierto' | 'dentro' | 'EQUIVOCADO' | 'planta';

/** Acciones cuyo efecto alcanza al elemento anotado desde un descendiente. */
const ACCIONES_QUE_PROPAGAN = new Set<WalkAction>(['click', 'hover']);

export interface BenchResult {
  id: string;
  site: string;
  outcome: BenchOutcome;
  via?: string;
  /** Qué resolvió cuando se equivocó: sin esto, un EQUIVOCADO no se puede depurar. */
  got?: string;
  /** Por qué no hay veredicto posible (target inexistente en la foto, HTML ilegible). */
  invalid?: string;
  /** Relación con lo anotado cuando el desenlace es EQUIVOCADO: `ajeno` o `ancestro`. */
  relacion?: string;
  /** Caso de control: qué se esperaba y si el arnés lo cumplió. No puntúa al walker. */
  control?: { expected: BenchOutcome; ok: boolean };
}

/** Atributo con el que se marca la verdad anotada dentro de la foto. */
const TARGET_ATTR = 'data-bench-target';

/**
 * VIGILANTE (K0.40). Un tope de Playwright no basta: entre miles de páginas
 * reales hay volcados que dejan al navegador VIVO PERO SORDO — `isConnected()`
 * sigue diciendo que sí y la siguiente petición no vuelve nunca. Medido tres
 * veces con la misma firma: el reloj corriendo y la CPU al 3%.
 *
 * Un corpus de miles no puede depender de que las miles contesten. El plazo va
 * FUERA del navegador para no depender de que el navegador conteste.
 */
export function conTope<T>(p: Promise<T>, ms: number, que: string): Promise<T> {
  // el rechazo tardío de la promesa abandonada no puede tumbar el proceso
  p.catch(() => undefined);
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(`${que}: tope de ${ms} ms agotado`)), ms); }),
  ]);
}

export function parseManifest(text: string): BenchCase[] {
  const out: BenchCase[] = [];
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    try {
      const c = JSON.parse(t) as BenchCase;
      if (!c.id || !c.action || !c.target) throw new Error('faltan id/action/target');
      out.push(c);
    } catch (e) {
      // una línea rota no puede tumbar un corpus de miles: se reporta y se sigue
      console.error(`[bench] línea ${i + 1} descartada: ${(e as Error).message}`);
    }
  });
  return out;
}

export function loadHtml(c: BenchCase, manifestDir: string): string | null {
  if (typeof c.html === 'string') return c.html;
  if (!c.html_path) return null;
  const p = isAbsolute(c.html_path) ? c.html_path : resolve(manifestDir, c.html_path);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

/**
 * Deja la página lista para el banco: **offline de verdad**. Las fotos de un
 * corpus real (Mind2Web) traen `<link>`, `<script>` e `<img>` a dominios que ya
 * no existen o que no queremos tocar; sin cortarlos, cada caso paga esperas de
 * red contra terceros y el banco deja de ser reproducible (y de ser $0). El DOM
 * que se mide es el del HTML capturado, no el que un CDN decida servir hoy.
 */
export async function prepareBenchPage(page: Page): Promise<void> {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('about:')) return route.continue();
    return route.abort();
  });
}

/**
 * Un caso. El orden importa: primero se marca la verdad EN LA FOTO y solo
 * después corre la escalera, para que el veredicto sea una comparación de
 * identidad de nodo y no de selectores parecidos.
 */
export async function runCase(page: Page, walker: DomWalker, c: BenchCase, html: string): Promise<BenchResult> {
  const r = await evaluarCaso(page, walker, c, html);
  return c.expect ? { ...r, control: { expected: c.expect, ok: r.outcome === c.expect } } : r;
}

async function evaluarCaso(page: Page, walker: DomWalker, c: BenchCase, html: string): Promise<BenchResult> {
  const site = c.site ?? '(sin sitio)';
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  const marcados = await page
    .evaluate(
      ({ sel, attr }) => {
        const nodes = Array.from(document.querySelectorAll(sel));
        nodes.forEach((n) => n.setAttribute(attr, '1'));
        return nodes.length;
      },
      { sel: c.target, attr: TARGET_ATTR },
    )
    .catch(() => -1);
  if (marcados <= 0) {
    // sin verdad anotada no hay veredicto: contarlo como acierto o como fallo
    // sería inventar la mitad del banco
    return { id: c.id, site, outcome: 'planta', invalid: `el target '${c.target}' no existe en la foto` };
  }

  const step: WalkStep = { id: c.id, action: c.action, hint: c.hint, scope: c.scope, value: 'x' };
  const resolved = await walker.benchResolve(step).catch(() => null);
  if (!resolved) return { id: c.id, site, outcome: 'planta' };

  // Un solo viaje al navegador: relación con lo anotado + descripción de lo
  // resuelto, en una cadena (devolver un objeto obliga a una función auxiliar
  // dentro del `evaluate`, y esbuild la envuelve con `__name`, que no existe en
  // la página — la trampa de la Fase 6, ya pisada dos veces).
  const crudo = await resolved.locator
    .evaluate((el, attr: string) => {
      const t = document.querySelector(`[${attr}]`);
      let rel = 'ajeno';
      if (el.hasAttribute(attr)) rel = 'es';
      else if (t && t.contains(el)) rel = 'dentro';
      else if (t && el.contains(t)) rel = 'ancestro';
      const d = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}"`;
      return `${rel}||${d}`;
    }, TARGET_ATTR)
    .catch(() => 'ajeno||(ilegible)');
  const [rel, got] = crudo.split('||');
  if (rel === 'es') return { id: c.id, site, outcome: 'acierto', via: resolved.via };
  if (rel === 'dentro' && ACCIONES_QUE_PROPAGAN.has(c.action)) {
    return { id: c.id, site, outcome: 'dentro', via: resolved.via, got };
  }
  return { id: c.id, site, outcome: 'EQUIVOCADO', via: resolved.via, got, relacion: rel };
}

/** ¿Falló alguna autocomprobación? Si el termómetro miente, la medida no vale. */
export function controlRoto(results: BenchResult[]): BenchResult[] {
  return results.filter((r) => r.control && !r.control.ok);
}

export function renderBench(results: BenchResult[]): string {
  // Los casos de control son termómetro, no medida: se apartan del recuento
  // para que no ensucien la cifra del walker con un rojo que es deliberado.
  const controles = results.filter((r) => r.control);
  const medidos = results.filter((r) => !r.control);
  const n = medidos.length;
  const by = (o: BenchOutcome): BenchResult[] => medidos.filter((r) => r.outcome === o);
  const invalid = medidos.filter((r) => r.invalid).length;
  const pct = (x: number): string => (n === 0 ? '0%' : `${((x / n) * 100).toFixed(1)}%`);
  const lines = [
    `casos          ${n}${invalid ? `  (${invalid} sin verdad anotada: no puntúan a favor de nadie)` : ''}`,
    `acierto        ${by('acierto').length}  (${pct(by('acierto').length)})   ← el nodo anotado, exacto`,
    `dentro         ${by('dentro').length}  (${pct(by('dentro').length)})   ← un descendiente: el clic burbuja al anotado`,
    `planta         ${by('planta').length}  (${pct(by('planta').length)})   ← honesto: panel o rescate`,
    `EQUIVOCADO     ${by('EQUIVOCADO').length}  (${pct(by('EQUIVOCADO').length)})   ← el que tiene que ser CERO`,
  ];
  if (controles.length > 0) {
    const rotos = controlRoto(results);
    lines.push(
      '',
      rotos.length === 0
        ? `autocomprobación del banco: ${controles.length}/${controles.length} OK (casos de control, no puntúan)`
        : `BANCO ROTO: ${rotos.length} caso(s) de control no dieron su desenlace — la medida de arriba NO es fiable`,
    );
    for (const r of rotos) lines.push(`  ${r.id}: esperaba ${r.control!.expected}, salió ${r.outcome}`);
  }
  const malos = by('EQUIVOCADO');
  if (malos.length > 0) {
    lines.push('', 'elementos equivocados (cada uno es un fallo mudo — la clase que hay que matar):');
    for (const m of malos.slice(0, 20)) lines.push(`  ${m.id} [${m.site}] (${m.relacion ?? '?'}) ${m.via} → ${m.got}`);
    if (malos.length > 20) lines.push(`  … y ${malos.length - 20} más`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const manifestPath = args.find((a) => !a.startsWith('--'));
  if (!manifestPath) {
    console.error('uso: tsx copilot/src/resolve-bench.ts <manifest.jsonl> [--contract=<yaml>] [--json] [--json-out=<f.jsonl>] [--limit=N]');
    process.exit(1);
  }
  const contractPath = args.find((a) => a.startsWith('--contract='))?.slice('--contract='.length);
  const limit = Number(args.find((a) => a.startsWith('--limit='))?.slice('--limit='.length) ?? '0');
  const asJson = args.includes('--json');
  /**
   * Con un corpus de miles, un resultado que solo existe al final es un
   * resultado que se pierde entero cuando algo va mal a mitad — pasó: 68 minutos
   * de banco tirados al morir el proceso en el caso 4.000. Se escribe línea a
   * línea, según salen.
   */
  const jsonOut = args.find((a) => a.startsWith('--json-out='))?.slice('--json-out='.length);

  const contract: StyleContract = contractPath
    ? (parseYaml(readFileSync(resolve(contractPath), 'utf8')) as StyleContract)
    : { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

  const abs = resolve(manifestPath);
  const casos = parseManifest(readFileSync(abs, 'utf8'));
  const trabajo = limit > 0 ? casos.slice(0, limit) : casos;
  const dir = dirname(abs);
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-bench-'));

  let browser: Browser = await chromium.launch();
  let page = await browser.newPage();
  await prepareBenchPage(page);
  // sin memoria de cliente: el banco mide la ESCALERA, no los alias aprendidos
  let walker = DomWalker.forBench(page, contract, workDir, resolve(workDir, 'sin-alias.json'));
  /** Un navegador sordo no se cierra ni se comprueba: se abandona y se relanza. */
  const relanzar = async (): Promise<void> => {
    await conTope(browser.close(), 5_000, 'cierre').catch(() => undefined);
    browser = await chromium.launch();
    page = await browser.newPage();
    await prepareBenchPage(page);
    walker = DomWalker.forBench(page, contract, workDir, resolve(workDir, 'sin-alias.json'));
  };

  if (jsonOut) writeFileSync(resolve(jsonOut), '', 'utf8');
  const results: BenchResult[] = [];
  const anota = (r: BenchResult): void => {
    results.push(r);
    if (jsonOut) appendFileSync(resolve(jsonOut), `${JSON.stringify(r)}\n`, 'utf8');
    if (results.length % 250 === 0) console.error(`[bench] ${results.length}/${trabajo.length}`);
  };
  for (const c of trabajo) {
    const html = loadHtml(c, dir);
    if (html === null) {
      anota({ id: c.id, site: c.site ?? '?', outcome: 'planta', invalid: 'html ausente' });
      continue;
    }
    try {
      anota(await conTope(runCase(page, walker, c, html), 60_000, 'caso'));
    } catch (e) {
      // Sin veredicto posible, y se dice: contarlo como plantada culparía a la
      // escalera de una foto que ni siquiera llegó a cargarse.
      anota({ id: c.id, site: c.site ?? '?', outcome: 'planta', invalid: `la foto colgó el navegador (${(e as Error).message})` });
      await relanzar();
    }
  }
  await conTope(browser.close(), 5_000, 'cierre').catch(() => undefined);

  if (asJson) console.log(JSON.stringify(results, null, 2));
  else console.log(renderBench(results));
  // El banco no falla por plantarse: falla por equivocarse (fallo mudo del
  // walker) o porque su propia autocomprobación no se cumpla (termómetro roto).
  // Un caso de control que SÍ da su desenlace no es un fallo — es la prueba de
  // que la medida significa algo.
  const equivocados = results.filter((r) => !r.control && r.outcome === 'EQUIVOCADO');
  process.exit(equivocados.length > 0 || controlRoto(results).length > 0 ? 1 : 0);
}

const invoked = (process.argv[1] ?? '').replace(/\\/g, '/');
if (invoked.endsWith('resolve-bench.ts')) void main();
