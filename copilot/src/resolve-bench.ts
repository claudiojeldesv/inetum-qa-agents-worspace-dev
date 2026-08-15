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
import { existsSync, readFileSync, mkdtempSync } from 'node:fs';
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

export type BenchOutcome = 'acierto' | 'EQUIVOCADO' | 'planta';

export interface BenchResult {
  id: string;
  site: string;
  outcome: BenchOutcome;
  via?: string;
  /** Qué resolvió cuando se equivocó: sin esto, un EQUIVOCADO no se puede depurar. */
  got?: string;
  /** Por qué no hay veredicto posible (target inexistente en la foto, HTML ilegible). */
  invalid?: string;
  /** Caso de control: qué se esperaba y si el arnés lo cumplió. No puntúa al walker. */
  control?: { expected: BenchOutcome; ok: boolean };
}

/** Atributo con el que se marca la verdad anotada dentro de la foto. */
const TARGET_ATTR = 'data-bench-target';

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

  const esElBueno = await resolved.locator
    .evaluate((el, attr: string) => el.hasAttribute(attr), TARGET_ATTR)
    .catch(() => false);
  if (esElBueno) return { id: c.id, site, outcome: 'acierto', via: resolved.via };
  const got = await resolved.locator
    .evaluate((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(el.textContent ?? '').trim().slice(0, 40)}"`)
    .catch(() => '(ilegible)');
  return { id: c.id, site, outcome: 'EQUIVOCADO', via: resolved.via, got };
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
    `acierto        ${by('acierto').length}  (${pct(by('acierto').length)})`,
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
    for (const m of malos.slice(0, 20)) lines.push(`  ${m.id} [${m.site}] ${m.via} → ${m.got}`);
    if (malos.length > 20) lines.push(`  … y ${malos.length - 20} más`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const manifestPath = args.find((a) => !a.startsWith('--'));
  if (!manifestPath) {
    console.error('uso: tsx copilot/src/resolve-bench.ts <manifest.jsonl> [--contract=<yaml>] [--json] [--limit=N]');
    process.exit(1);
  }
  const contractPath = args.find((a) => a.startsWith('--contract='))?.slice('--contract='.length);
  const limit = Number(args.find((a) => a.startsWith('--limit='))?.slice('--limit='.length) ?? '0');
  const asJson = args.includes('--json');

  const contract: StyleContract = contractPath
    ? (parseYaml(readFileSync(resolve(contractPath), 'utf8')) as StyleContract)
    : { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

  const abs = resolve(manifestPath);
  const casos = parseManifest(readFileSync(abs, 'utf8'));
  const trabajo = limit > 0 ? casos.slice(0, limit) : casos;
  const dir = dirname(abs);
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-bench-'));

  const browser: Browser = await chromium.launch();
  const page = await browser.newPage();
  await prepareBenchPage(page);
  // sin memoria de cliente: el banco mide la ESCALERA, no los alias aprendidos
  const walker = DomWalker.forBench(page, contract, workDir, resolve(workDir, 'sin-alias.json'));
  const results: BenchResult[] = [];
  for (const c of trabajo) {
    const html = loadHtml(c, dir);
    if (html === null) {
      results.push({ id: c.id, site: c.site ?? '?', outcome: 'planta', invalid: 'html ausente' });
      continue;
    }
    results.push(await runCase(page, walker, c, html));
  }
  await browser.close();

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
