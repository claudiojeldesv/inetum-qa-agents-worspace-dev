/**
 * BANCO DE RESCATES — mide qué hace el rescate LLM cuando la escalera se planta.
 *
 * Existe porque la única evidencia que teníamos eran DOS rescates, los dos
 * declinados, y con n=2 no se decide si el rescate se queda, se rediseña o se
 * sustituye por el panel asistido.
 *
 * TAXONOMÍA — y es lo único importante de este fichero. "Tasa de acierto" no
 * sirve, porque la mayoría de los pasos que el walker bloquea son AMBIGÜEDAD
 * REAL, donde declinar es la respuesta correcta. Se clasifica en cuatro:
 *
 *   acierto          resolvió, y al elemento que un humano marcó como correcto
 *   EQUIVOCADO       resolvió, y a OTRO elemento — el fallo mudo, la métrica que manda
 *   planta-correcta  declinó, y el caso no tenía respuesta única (control)
 *   planta-cobarde   declinó, y sí la había
 *
 * Un rescate que declina mucho no es malo por declinar: es malo si declina donde
 * había respuesta. Y uno que responde mucho es inservible si parte de lo que
 * responde está mal, porque nada aguas abajo lo detecta.
 *
 * La verdad la marca una PERSONA (copilot/bench/rescates/verdad.jsonl), nunca el
 * walker: si la pusiera el walker, el banco mediría al walker contra sí mismo.
 * Misma disciplina que el corpus de resolución (K0.32).
 *
 * Uso:
 *   tsx copilot/src/rescue-bench.ts emitir --corpus=<dir> --out=<dir> [--podado|--completo]
 *   tsx copilot/src/rescue-bench.ts puntuar --corpus=<dir> --respuestas=<dir>
 *
 * `emitir` produce las peticiones de rescate (una por caso) para delegarlas a un
 * LLM. `puntuar` resuelve cada respuesta CONTRA LA MISMA FOTO y clasifica. Las
 * dos mitades deterministas son offline y cuestan $0; lo único que cuesta es
 * responder.
 */
import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { pruneAriaSnapshot, rescueInstructions } from './walk-core.ts';

interface CasoBloqueado {
  id: string;
  site: string;
  task: string;
  html_path: string;
  action: string;
  hint: Record<string, string>;
  scope?: Record<string, string>;
  motivo: string;
}

interface Verdad {
  id: string;
  dir: string;
  desenlace_correcto: 'resoluble' | 'declinar';
  expr?: string;
  porque: string;
}

export type Desenlace = 'acierto' | 'EQUIVOCADO' | 'planta-correcta' | 'planta-cobarde' | 'sin-verdad';

/**
 * Clasificador PURO — aparte del navegador a propósito, porque es el criterio que
 * decide si el banco mide algo. `mismoElemento` es null cuando el LLM declinó.
 */
export function clasificar(
  desenlaceCorrecto: 'resoluble' | 'declinar',
  respondio: boolean,
  mismoElemento: boolean | null,
): Desenlace {
  if (!respondio) return desenlaceCorrecto === 'declinar' ? 'planta-correcta' : 'planta-cobarde';
  if (desenlaceCorrecto === 'declinar') return 'EQUIVOCADO'; // eligió donde no había a quién elegir
  return mismoElemento ? 'acierto' : 'EQUIVOCADO';
}

function leerCorpus(raiz: string): CasoBloqueado[] {
  const out: CasoBloqueado[] = [];
  for (const dir of readdirSync(raiz).filter((d) => d.startsWith('c-'))) {
    const f = resolve(raiz, dir, 'bloqueados.jsonl');
    if (!existsSync(f)) continue;
    for (const linea of readFileSync(f, 'utf8').trim().split('\n')) {
      if (!linea.trim()) continue;
      try {
        out.push({ ...(JSON.parse(linea) as CasoBloqueado), html_path: resolve(raiz, dir, JSON.parse(linea).html_path) });
      } catch {
        console.error(`[rescue-bench] linea ilegible descartada en ${f}`);
      }
    }
  }
  return out;
}

function leerVerdad(): Map<string, Verdad> {
  const f = resolve('copilot/bench/rescates/verdad.jsonl');
  const m = new Map<string, Verdad>();
  if (!existsSync(f)) return m;
  for (const l of readFileSync(f, 'utf8').trim().split('\n')) {
    if (!l.trim()) continue;
    const v = JSON.parse(l) as Verdad;
    m.set(v.id, v);
  }
  return m;
}

/** Foco del rescate: el mismo que arma el walker (K0.29) — vocabulario del paso. */
function focoDe(c: CasoBloqueado): string {
  const h = c.hint ?? {};
  return [h.test_id, h.role, h.name, h.label, h.text].filter(Boolean).join(' ');
}

async function emitir(corpus: string, out: string, podar: boolean): Promise<void> {
  mkdirSync(out, { recursive: true });
  const casos = leerCorpus(corpus);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  for (const c of casos) {
    await p.setContent(readFileSync(c.html_path, 'utf8'));
    const completo = await p.locator('body').ariaSnapshot();
    const snapshot = podar ? pruneAriaSnapshot(completo, 120, focoDe(c)) : completo;
    const step = c.task.split('/')[1] ?? 's1';
    writeFileSync(
      resolve(out, `${c.id}.json`),
      JSON.stringify(
        {
          version: 1,
          site_id: c.site,
          flow: c.task.split('/')[0],
          step,
          action: c.action,
          hint: c.hint,
          ...(c.scope ? { scope: c.scope } : {}),
          aria_snapshot: snapshot,
          frame_path: [],
          budget_remaining: 1,
          instructions: rescueInstructions(step, c.action),
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`  ${c.id}  ${podar ? 'podado' : 'completo'}: ${snapshot.length} caracteres`);
  }
  await b.close();
  console.log(`[rescue-bench] ${casos.length} peticion(es) → ${out}`);
}

/**
 * Traduce la gramática de respuesta a un locator de Playwright. Deliberadamente
 * estricta: lo que el banco acepta es lo que el walker acepta, ni una forma más.
 */
function aLocator(page: Page, cadena: string) {
  let m = /^getByTestId\('(.+)'\)$/.exec(cadena);
  if (m) return page.getByTestId(m[1]);
  m = /^getByRole\('([^']+)',\s*\{\s*name:\s*'(.*)'\s*\}\)$/.exec(cadena);
  if (m) return page.getByRole(m[1] as Parameters<Page['getByRole']>[0], { name: m[2] });
  m = /^getByRole\('([^']+)'\)$/.exec(cadena);
  if (m) return page.getByRole(m[1] as Parameters<Page['getByRole']>[0]);
  m = /^getByLabel\('(.*)'\)$/.exec(cadena);
  if (m) return page.getByLabel(m[1]);
  m = /^getByText\('(.*)'\)$/.exec(cadena);
  if (m) return page.getByText(m[1]);
  m = /^css=(.+)$/.exec(cadena);
  if (m) return page.locator(m[1]);
  return null;
}

async function puntuar(corpus: string, respuestas: string): Promise<number> {
  const casos = leerCorpus(corpus);
  const verdades = leerVerdad();
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const filas: Array<{ id: string; desenlace: Desenlace; detalle: string }> = [];

  for (const c of casos) {
    const v = verdades.get(c.id);
    if (!v) {
      filas.push({ id: c.id, desenlace: 'sin-verdad', detalle: 'no hay entrada en verdad.jsonl — marca la verdad a mano' });
      continue;
    }
    const rf = resolve(respuestas, `${c.id}.json`);
    if (!existsSync(rf)) {
      filas.push({ id: c.id, desenlace: 'sin-verdad', detalle: 'sin respuesta del LLM para este caso' });
      continue;
    }
    const cadena = (JSON.parse(readFileSync(rf, 'utf8')) as { locator: string | null }).locator;
    await p.setContent(readFileSync(c.html_path, 'utf8'));

    if (!cadena) {
      filas.push({
        id: c.id,
        desenlace: clasificar(v.desenlace_correcto, false, null),
        detalle: 'declinó (locator=null)',
      });
      continue;
    }
    const loc = aLocator(p, cadena);
    if (!loc) {
      // Una respuesta fuera de gramática no se interpreta con benevolencia: el
      // walker tampoco la sabría leer, así que en producción el paso queda igual
      // de bloqueado. Cuenta como planta, no como acierto a medias.
      filas.push({
        id: c.id,
        desenlace: clasificar(v.desenlace_correcto, false, null),
        detalle: `respuesta fuera de gramática: ${cadena}`,
      });
      continue;
    }
    const visibles = loc.filter({ visible: true });
    const n = await visibles.count().catch(() => 0);
    if (n !== 1) {
      // No resuelve único = el walker la habría rechazado igual. Planta.
      filas.push({
        id: c.id,
        desenlace: clasificar(v.desenlace_correcto, false, null),
        detalle: `su locator resuelve a ${n} elementos visibles: ${cadena}`,
      });
      continue;
    }
    if (v.desenlace_correcto === 'declinar') {
      filas.push({ id: c.id, desenlace: 'EQUIVOCADO', detalle: `eligió donde no había a quién elegir: ${cadena}` });
      continue;
    }
    // ¿es EL elemento que marcó la persona? Se compara por un atributo LEÍDO con
    // getAttribute, no con `evaluate`: `Locator.evaluate(<string>)` nunca recibe
    // el elemento como argumento (hallazgo de Fase 6), así que devolvía undefined
    // y este banco marcaba EQUIVOCADO un acierto — justo el fallo que existe para
    // detectar. Se comprueba además que la marca se puso.
    const marca = 'data-rescue-truth';
    const marcados = await p.evaluate(
      `(() => { const el = ${v.expr}; if (!el) return 0; el.setAttribute('${marca}', '1'); return 1; })()`,
    );
    if (marcados !== 1) {
      filas.push({ id: c.id, desenlace: 'sin-verdad', detalle: `la expresión de verdad no resolvió a ningún elemento en la foto` });
      continue;
    }
    const esElMismo = (await visibles.first().getAttribute(marca).catch(() => null)) !== null;
    filas.push({
      id: c.id,
      desenlace: clasificar(v.desenlace_correcto, true, Boolean(esElMismo)),
      detalle: cadena,
    });
  }
  await b.close();

  const cuenta = (d: Desenlace) => filas.filter((f) => f.desenlace === d).length;
  console.log('\n=== BANCO DE RESCATES ===');
  for (const f of filas) console.log(`  ${f.desenlace.padEnd(16)} ${f.id}\n      ${f.detalle}`);
  console.log(
    `\n  acierto=${cuenta('acierto')}  EQUIVOCADO=${cuenta('EQUIVOCADO')}  ` +
      `planta-correcta=${cuenta('planta-correcta')}  planta-cobarde=${cuenta('planta-cobarde')}  ` +
      `sin-verdad=${cuenta('sin-verdad')}`,
  );
  // Exit 1 SOLO por EQUIVOCADO: es el único desenlace que hace inservible al
  // componente. Plantarse es lento; equivocarse en silencio es otra cosa.
  return cuenta('EQUIVOCADO') > 0 ? 1 : 0;
}

const arg = (n: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');

async function main(): Promise<void> {
  const modo = process.argv[2];
  const corpus = arg('corpus') ?? '.work/banco-rescates';
  if (modo === 'emitir') {
    await emitir(corpus, arg('out') ?? '.work/banco-rescates/peticiones', !process.argv.includes('--completo'));
    return;
  }
  if (modo === 'puntuar') {
    process.exitCode = await puntuar(corpus, arg('respuestas') ?? '.work/banco-rescates/respuestas');
    return;
  }
  console.error('Uso: tsx copilot/src/rescue-bench.ts emitir|puntuar --corpus=<dir> [--out=<dir>] [--respuestas=<dir>] [--completo]');
  process.exitCode = 2;
}

if (process.argv[1]?.includes('rescue-bench')) void main();
