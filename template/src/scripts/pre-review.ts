#!/usr/bin/env node
/**
 * pre-review — checks objetivos del Reviewer, determinísticos (Fase 3 token-efficiency, R6).
 *
 * Extrae del ia4d-reviewer los criterios que no requieren juicio: locators prohibidos (MF-1/MF-1b),
 * waits hardcodeados (MF-2), banned APIs del contract, scan a11y (MF-4, delegado en verify-a11y),
 * cita @criterion (MF-5), conteo de asserts funcionales (parte mecánica de MF-3/MF-9), uso de POM
 * (MF-8, proxy por import), toHaveClass con regex sin anclas (MF-regex-anchor, Q3), naturaleza
 * en el título (should-fix de naming) y los checks de FORMA de spec-template.md (SF-generated-by,
 * SF-step-lang, SF-steps, SF-a11y-step — should-fix: tres runs produjeron tres dialectos).
 *
 * Desde 2026-08 incluye MF-tsc: el veredicto del COMPILADOR, atribuido por spec. Nada en el
 * flujo corria tsc (verificado: cero invocaciones en commands y agentes) y dos defectos de
 * campo salieron por ahi — D24 (un nombre accesible numerico generaba `readonly 12345: Locator`)
 * y D29 (una propiedad `readonly transferFunds: Locator` del scaffolder tapaba el metodo de
 * negocio del mismo nombre: «no es una funcion» en ejecucion). Los dos los caza `tsc --noEmit`
 * en 6 s. D29 costo una reanudacion de Writer y ~4 turnos de orquestador por no ejecutarlo.
 *
 * NO es un gate ni sustituye al Reviewer: es la red determinística que corre tras el Writer+Reviewer
 * (Acto 4, junto a verify-a11y) y garantiza que ningún must-fix objetivo llegó al final del run.
 * El juicio (calidad de la post-condición de negocio, datos sintéticos, estado compartido,
 * should-fix contextuales) sigue siendo del ia4d-reviewer per-spec. El "Reviewer de lote" que
 * habría consumido este output fue DESCARTADO por A/B en la Fase 3 (ver token-efficiency-plan.md).
 *
 * Uso:  tsx src/scripts/pre-review.ts <spec.ts|dir>... [--style-contract=<path>]
 *       [--discovery-report=<path>] [--out-dir=<dir>] [--no-tsc]
 *       (--discovery-report activa MF-postcondition, K0.7: exige assert sobre el
 *        texto de resultado que el walker observó — sin él, el check no aplica)
 * Output: un JSON por spec en <out-dir>/<basename>.json (default: $QA_WORK_DIR/pre-review/ o
 * .work/pre-review/) + resumen JSON por stdout. Exit 0 siempre (informa, no bloquea).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

import { appendAuditEntry } from '../audit-log.ts';
import { extractTestBlocks, loadA11yContract, verifySpec } from './verify-a11y.ts';

export interface PreReviewContract {
  forbid_css_selectors: boolean;
  forbid_xpath: boolean;
  css_fallback_attributes: string[];
  banned_apis: string[];
  pom_enabled: boolean;
  require_business_postcondition: boolean;
  min_functional_asserts: number;
  /** evidence.level del contract — decide si los checks de forma SF-steps/SF-a11y-step aplican. */
  evidence_level: 'minimal' | 'steps' | 'full';
}

export interface PreReviewFinding {
  criterion_id: string; // MF-N para los must-fix, SF-naming para el should-fix
  category:
    | 'locator-strategy'
    | 'wait-strategy'
    | 'assert-quality'
    | 'a11y-missing'
    | 'criterion-not-cited'
    | 'pom-violation'
    | 'style-contract'
    | 'compile';
  severity: 'must-fix' | 'should-fix';
  location: { line: number };
  description: string;
}

export interface PreReviewResult {
  test_file: string;
  source: 'pre-review-deterministic';
  skipped: boolean;
  findings: PreReviewFinding[];
  must_fix: number;
  should_fix: number;
  clean: boolean;
}

/**
 * Postcondiciones de negocio observadas por el walker (K0.7): textos de resultado
 * no interactivos que el dom-map capturó como `business_text` y el adapter propagó
 * al discovery (role 'text' o 'heading'/'alert'/'status'). Son la evidencia contra
 * la que se mide si el spec asserta el RESULTADO o solo el mueble de la pantalla.
 */
export interface BusinessPostcondition {
  screen: string;
  text: string;
  test_id?: string;
}

const BUSINESS_ROLES = new Set(['text', 'heading', 'alert', 'status']);

/**
 * Extrae las postcondiciones de negocio de un discovery-report. Solo cuenta las
 * VERIFICADAS contra el DOM real (verify-locators): exigir un assert sobre un
 * texto que no resuelve sería pedirle al Writer que invente.
 */
export function loadBusinessPostconditions(discoveryPath?: string): BusinessPostcondition[] {
  if (!discoveryPath) return [];
  const path = resolve(process.cwd(), discoveryPath);
  if (!existsSync(path)) return [];
  let parsed: Record<string, any> | null = null;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;
  } catch {
    return []; // discovery ilegible: el check no aplica (no inventamos exigencias)
  }
  const out: BusinessPostcondition[] = [];
  for (const screen of parsed?.screens ?? []) {
    for (const el of screen.interactive_elements ?? []) {
      if (!BUSINESS_ROLES.has(el.role) || !el.name) continue;
      if (el.verified === false) continue;
      out.push({ screen: screen.name, text: el.name, ...(el.test_id ? { test_id: el.test_id } : {}) });
    }
  }
  return out;
}

/** Normalización laxa para comparar el texto del discovery con el del spec. */
function laxText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * ¿El spec asserta alguna de las postcondiciones de negocio disponibles?
 * Cuenta como assert válido tanto el texto literal (getByText / toContainText /
 * toHaveText) como el test_id del elemento que lo porta (el locator más fuerte
 * del mismo hecho: `getByTestId('complete-header')` ES la confirmación).
 */
export function assertsSomePostcondition(source: string, posts: BusinessPostcondition[]): boolean {
  const haystack = laxText(source);
  const rawSource = source;
  return posts.some((p) => {
    if (p.test_id && rawSource.includes(p.test_id)) return true;
    const needle = laxText(p.text);
    return needle.length > 0 && haystack.includes(needle);
  });
}

/** Un diagnostico de `tsc --noEmit`. `file` vacio = error global del proyecto (sin fichero). */
export interface TscDiagnostic {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

const TSC_CON_FICHERO = /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.*)$/;
const TSC_GLOBAL = /^error\s+(TS\d+):\s*(.*)$/;

/**
 * Parsea la salida de `tsc --noEmit --pretty false`. Los errores globales (TS18003
 * «no inputs were found», TS5083 config ilegible) se conservan con `file` vacio: no
 * pertenecen a ningun spec pero significan que el typecheck NO cubrio nada, y
 * descartarlos produciria un verde falso.
 */
export function parseTscOutput(raw: string): TscDiagnostic[] {
  const out: TscDiagnostic[] = [];
  for (const linea of raw.split(/\r?\n/)) {
    const l = linea.trim();
    if (!l) continue;
    const m = TSC_CON_FICHERO.exec(l);
    if (m) {
      out.push({
        file: m[1].replace(/\\/g, '/'),
        line: Number(m[2]),
        column: Number(m[3]),
        code: m[4],
        message: m[5],
      });
      continue;
    }
    const g = TSC_GLOBAL.exec(l);
    if (g) out.push({ file: '', line: 1, column: 1, code: g[1], message: g[2] });
  }
  return out;
}

/** Imports relativos del spec: por ahi entra el POM, que es donde vivian D24 y D29. */
export function relativeImportsOf(source: string, specPath: string): string[] {
  const dir = resolve(specPath, '..');
  const out: string[] = [];
  for (const m of source.matchAll(/from\s*['"](\.[^'"]*)['"]/g)) {
    const base = resolve(dir, m[1]);
    for (const cand of [base, base + '.ts', base.replace(/\.js$/, '.ts'), join(base, 'index.ts')]) {
      out.push(cand.replace(/\\/g, '/'));
    }
  }
  return out;
}

/**
 * Reparte los diagnosticos de tsc entre los specs. Un spec se lleva los errores de su
 * propio fichero Y los de los ficheros que importa: si el POM que usa no compila, el
 * spec no corre, y el Writer que lo escribio es quien puede arreglarlo — atribuirlo a
 * un fichero que nadie esta revisando lo deja huerfano, que es como D29 llego a la
 * ejecucion.
 */
export function attributeDiagnostics(
  specPath: string,
  source: string,
  diagnostics: TscDiagnostic[],
): TscDiagnostic[] {
  const propio = resolve(specPath).replace(/\\/g, '/');
  const suyos = new Set<string>([propio, ...relativeImportsOf(source, specPath)]);
  return diagnostics.filter((d) => d.file && suyos.has(resolve(d.file).replace(/\\/g, '/')));
}

/**
 * Corre el compilador UNA vez por invocacion, no una por spec: `tsc` es de proyecto y
 * tarda ~6 s. Se invoca el binario local con `process.execPath` en vez de `npx` porque
 * el shim de npx falla segun la shell (medido en este mismo ciclo, git-bash en Windows).
 *
 * Si tsc no puede correr, se DECLARA. Un typecheck ausente reportado como limpio es
 * exactamente la mentira que este check viene a matar.
 */
export function runTsc(cwd: string = process.cwd()): {
  diagnostics: TscDiagnostic[];
  ran: boolean;
  note?: string;
} {
  const bin = resolve(cwd, 'node_modules/typescript/bin/tsc');
  if (!existsSync(bin)) {
    return {
      diagnostics: [],
      ran: false,
      note: 'typescript no esta instalado en el workspace (npm install) — MF-tsc no aplica',
    };
  }
  try {
    execFileSync(process.execPath, [bin, '--noEmit', '--pretty', 'false'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300_000,
    });
    return { diagnostics: [], ran: true };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    const diagnostics = parseTscOutput((e.stdout ?? '') + '\n' + (e.stderr ?? ''));
    // exit != 0 CON diagnosticos es el caso normal de un typecheck que encuentra errores
    if (diagnostics.length > 0) return { diagnostics, ran: true };
    return {
      diagnostics: [],
      ran: false,
      note: 'tsc no pudo correr: ' + String(err instanceof Error ? err.message.split('\n')[0] : err),
    };
  }
}

/**
 * Un resultado se persiste salvo que se haya saltado Y este limpio. Vive aparte y
 * exportado porque la condicion contraria (`if (r.skipped) continue`) descarto en
 * campo los findings de MF-tsc de un `.setup.ts`: se calculaban y se tiraban, que es
 * el patron D2. Cazado en el run de verificacion del 2026-08-21.
 */
export function debeEscribirse(r: Pick<PreReviewResult, 'skipped' | 'clean'>): boolean {
  return !(r.skipped && r.clean);
}

export function loadPreReviewContract(
contractPath?: string): PreReviewContract {
  const defaults: PreReviewContract = {
    forbid_css_selectors: true,
    forbid_xpath: true,
    css_fallback_attributes: [],
    banned_apis: [],
    pom_enabled: true,
    require_business_postcondition: false,
    min_functional_asserts: 1,
    evidence_level: 'steps',
  };
  if (!contractPath) return defaults;
  const path = resolve(process.cwd(), contractPath);
  if (!existsSync(path)) return defaults;
  const parsed = parseYaml(readFileSync(path, 'utf8')) as Record<string, any> | null;
  if (!parsed) return defaults;
  const locators = parsed.locators ?? {};
  const testDesign = parsed.test_design ?? {};
  const level = parsed.evidence?.level;
  return {
    forbid_css_selectors: locators.forbid_css_selectors !== false,
    forbid_xpath: locators.forbid_xpath !== false,
    css_fallback_attributes: Array.isArray(locators.css_fallback_attributes)
      ? locators.css_fallback_attributes
      : [],
    banned_apis: Array.isArray(parsed.banned_apis) ? parsed.banned_apis : [],
    pom_enabled: parsed.pom?.enabled !== false,
    require_business_postcondition: testDesign.require_business_postcondition === true,
    min_functional_asserts:
      typeof testDesign.min_functional_asserts === 'number' ? testDesign.min_functional_asserts : 1,
    evidence_level: level === 'minimal' || level === 'full' ? level : 'steps',
  };
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function lineText(source: string, index: number): string {
  const start = source.lastIndexOf('\n', index) + 1;
  const end = source.indexOf('\n', index);
  return source.slice(start, end < 0 ? source.length : end);
}

const LOCATOR_CALL = /\.locator\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
const BOUNDED_ID = /^#[A-Za-z_][\w-]*$/;
const BOUNDED_ATTR = /^\[([a-zA-Z_-]+)\s*=\s*(?:"[^"]*"|'[^']*')\]$/;
const NATURE_IN_TITLE = /\b(happy[- ]?path|happy|negative|smoke)\b/i;
const TITLE_CALL = /\btest(?:\.describe)?(?:\.only|\.fixme)?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;

/**
 * MF-wait-budget — una espera de DISPONIBILIDAD tiene que declarar su presupuesto.
 *
 * Medido en campo el 2026-08-21 (D35): TC-002 pasó en la primera pasada y falló en la
 * segunda. El Writer había manejado bien la carga asíncrona —escribió un helper
 * `waitForAccountsLoaded()` citando la línea del plan donde el planner midió que los
 * combos llegan por XHR— pero lo dejó con el presupuesto por defecto:
 *
 *     Expected: not 0 | Received: 0 | Timeout: 5000ms
 *     13 x locator resolved to 0 elements
 *
 * El select estuvo vacío los 5 s enteros. La aserción no era débil: el presupuesto era
 * el default de Playwright, pensado para local, heredado en silencio porque
 * `playwright.config.ts` no declara `expect.timeout`. Una espera que existe justamente
 * porque el contenido tarda no puede heredar un presupuesto que nadie eligió.
 *
 * Dos formas, las dos mecánicas:
 *  - `not.toHaveCount(0)` es una guarda de disponibilidad por construcción — nadie
 *    asserta «no cero» como postcondición de negocio.
 *  - un método `waitFor*` cuyo cuerpo asserta sin declarar `timeout`.
 *
 * Se busca en el spec Y en los POM que importa, porque el helper vive en el POM: dejar
 * el check solo en el spec lo habría dejado pasar en el caso real que lo motivó.
 */
const GUARDA_NO_CERO = /\.not\s*\.\s*toHaveCount\s*\(\s*0\s*\)/g;
const METODO_ESPERA = /\basync\s+(waitFor\w*)\s*\(/g;

/** El texto del statement que rodea a `index`, para mirar si declara `timeout`. */
function statementAlrededor(source: string, index: number): string {
  let ini = index;
  while (ini > 0 && !';{}\n'.includes(source[ini - 1])) ini -= 1;
  let fin = source.indexOf(';', index);
  if (fin < 0) fin = source.length;
  return source.slice(ini, fin + 1);
}

/** Cuerpo de la función que arranca en la primera `{` tras `desde`, balanceando llaves. */
function cuerpoDesde(source: string, desde: number): string {
  const abre = source.indexOf('{', desde);
  if (abre < 0) return '';
  let nivel = 0;
  for (let i = abre; i < source.length; i++) {
    if (source[i] === '{') nivel += 1;
    else if (source[i] === '}') {
      nivel -= 1;
      if (nivel === 0) return source.slice(abre, i + 1);
    }
  }
  return source.slice(abre);
}

export interface GuardaSinPresupuesto {
  line: number;
  description: string;
}

/**
 * Guardas de disponibilidad sin presupuesto explícito en un fichero.
 * @param etiqueta cómo nombrar el fichero en el finding (vacío = el propio spec).
 */
export function scanReadinessGuards(source: string, etiqueta = ''): GuardaSinPresupuesto[] {
  const out: GuardaSinPresupuesto[] = [];
  const donde = etiqueta ? ` [en ${etiqueta}, importado por este spec]` : '';

  for (const m of source.matchAll(GUARDA_NO_CERO)) {
    const stmt = statementAlrededor(source, m.index!);
    if (/timeout\s*:/.test(stmt)) continue;
    out.push({
      line: lineOf(source, m.index!),
      description:
        `guarda de disponibilidad 'not.toHaveCount(0)' sin timeout explícito: hereda el default ` +
        `de Playwright (5 s), que no es un presupuesto elegido. Declara { timeout: N } acorde a lo ` +
        `que tarda la carga asíncrona que estás esperando${donde}`,
    });
  }

  for (const m of source.matchAll(METODO_ESPERA)) {
    const cuerpo = cuerpoDesde(source, m.index!);
    if (!/\bexpect\s*\(/.test(cuerpo)) continue;
    if (/timeout\s*:/.test(cuerpo)) continue;
    // ya reportado por la regla anterior sobre la misma línea: no se duplica
    if (GUARDA_NO_CERO.test(cuerpo)) {
      GUARDA_NO_CERO.lastIndex = 0;
      continue;
    }
    GUARDA_NO_CERO.lastIndex = 0;
    out.push({
      line: lineOf(source, m.index!),
      description:
        `'${m[1]}()' es una espera de disponibilidad y asserta sin declarar timeout: hereda los 5 s ` +
        `por defecto. Si existe es porque el contenido tarda — dale un presupuesto explícito${donde}`,
    });
  }
  return out;
}

/**
 * D37 — las postcondiciones que se le pueden exigir a un spec son las de SU pantalla.
 *
 * Medido en campo el 2026-08-21: `assertsSomePostcondition` comparaba contra las
 * postcondiciones de TODO el discovery, de cualquier pantalla. Cuando el analizador
 * emitió una pantalla `error` con el heading «Error!», el check se activó por primera
 * vez —hasta entonces no había ninguna postcondición y la guarda lo saltaba— y empezó a
 * exigirle al spec de login que asertara «Transfer Complete!» o «Error!». Dos Writers
 * independientes lo reportaron como falso positivo, y dos **editaron el discovery-report**
 * para poder pasarlo (D38). Un gate que no se puede satisfacer honestamente enseña a
 * manipular la evidencia.
 *
 * El acotado usa el dato que ya existe: el spec importa los POM de las pantallas que
 * toca, y el nombre del fichero se deriva del nombre de la pantalla con la misma regla
 * que el scaffolder (`fileNameFor`). Si no se puede acotar a ninguna pantalla, el check
 * **no aplica** — misma disciplina que con el discovery ausente: no se inventan
 * exigencias.
 */
// ---------------------------------------------------------------------------
// MF-locator-no-medido (G1, plan gate-locators-medidos) — la regla dura del walker
// en el camino del planner.
//
// La iteración 1 de Dolibarr dio SEIS puertas verdes con la suite entera en rojo, y
// el discovery-report YA contenía el veredicto de las tres causas (`heading` inexistente,
// `not-found`, `ambiguous(3)`). Nadie lo consultaba al revisar el spec: verify-locators
// nació declarando «el Writer tiene prohibido usarlos sin TODO» (quality-greens Q2 A.1)
// y solo se construyó la mitad que mide, nunca la que impide. Esta regla es el consumidor.
//
// Fuera del alcance A PROPÓSITO (K0.41): el rol pelado sin nombre (`getByRole('row')`)
// no lleva palabras del guion — marcarlo sería ruido; es territorio del smoke run (G2).
// Los nombres dinámicos (regex, template, variable) tampoco se evalúan estáticamente.
// ---------------------------------------------------------------------------

/** Un elemento del discovery con su pantalla y el veredicto de verify-locators. */
export interface ElementoMedido {
  screen: string;
  role?: string;
  name?: string;
  test_id?: string;
  label?: string;
  verified?: boolean | null;
  verify_reason?: string;
  accessible_names_found?: string[];
}

export interface MedicionDiscovery {
  elementos: ElementoMedido[];
  /** pantalla → dom_verified (true = alcanzada y medida contra el DOM real). */
  pantallas: Map<string, boolean | null>;
}

export function loadDiscoveryMeasurements(discoveryPath?: string): MedicionDiscovery | null {
  if (!discoveryPath) return null;
  const path = resolve(process.cwd(), discoveryPath);
  if (!existsSync(path)) return null;
  let parsed: Record<string, any> | null = null;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;
  } catch {
    return null; // discovery ilegible: el check no aplica (no inventamos exigencias)
  }
  const elementos: ElementoMedido[] = [];
  const pantallas = new Map<string, boolean | null>();
  for (const screen of parsed?.screens ?? []) {
    pantallas.set(screen.name, screen.dom_verified ?? null);
    for (const el of screen.interactive_elements ?? []) elementos.push({ ...el, screen: screen.name });
  }
  for (const comp of parsed?.components ?? []) {
    for (const el of comp.interactive_elements ?? []) elementos.push({ ...el, screen: `component:${comp.name}` });
  }
  return { elementos, pantallas };
}

export type AnclaKind = 'role' | 'label' | 'placeholder' | 'text' | 'testid';

export interface AnclaExtraida {
  kind: AnclaKind;
  /** Solo para kind 'role'. */
  role?: string;
  /** El texto pedido: name de getByRole, o el argumento de los demás getBy*. */
  name: string;
  /** exact:true, .first(), .last(), .nth() o .filter() sobre la llamada. */
  disambiguated: boolean;
  /**
   * La línea lleva la anotación sancionada del protocolo Q2 («el Writer usa unverified
   * solo con TODO o cita de evidencia»): un tag `verify-locators:` o un `TODO`. El uso
   * DECLARADO de un ancla no medida baja a should-fix — mismo diseño que la excepción
   * `// css-fallback:` de MF-1. Medido en I2: los tres POM verdes de SauceDemo llevaban
   * la anotación en cada ancla condicional o plural; sin esta vía, el gate marcaba 3/3
   * specs verdes y moría por su propio umbral.
   */
  sanctioned: boolean;
  line: number;
}

const GETBY_CALL = /\.getBy(Role|Label|Placeholder|Text|TestId)\(\s*(['"`])((?:\\.|(?!\2).)*)\2\s*(?:,\s*\{([^}]*)\})?\s*\)/g;

/**
 * Anclas getBy* evaluables estáticamente en un fuente (spec o POM). Lo que no es un
 * literal de string (regex, template con `${}`, variable) se omite: no se puede cruzar
 * contra el informe sin ejecutar, y un falso positivo aquí mata el gate (I2 del plan).
 */
export function extractGetByAnchors(source: string): AnclaExtraida[] {
  const out: AnclaExtraida[] = [];
  for (const m of source.matchAll(GETBY_CALL)) {
    const metodo = m[1];
    const arg = m[3];
    const opts = m[4] ?? '';
    if (arg.includes('${')) continue; // template: nombre dinámico
    const cola = source.slice(m.index! + m[0].length, m.index! + m[0].length + 30);
    const disambiguated = /^\s*\.(first|last|nth|filter)\s*\(/.test(cola) || /\bexact\s*:\s*true/.test(opts);
    const line = lineOf(source, m.index!);
    const sanctioned = /verify-locators:|\bTODO\b/.test(lineText(source, m.index!));
    if (metodo === 'Role') {
      const nameM = /\bname\s*:\s*(['"`])((?:\\.|(?!\1).)*)\1/.exec(opts);
      // Sin name literal: rol pelado (K0.41, fuera de alcance) o name regex/variable (dinámico)
      if (!nameM || nameM[2].includes('${')) continue;
      out.push({ kind: 'role', role: arg, name: nameM[2], disambiguated, sanctioned, line });
    } else {
      out.push({ kind: metodo.toLowerCase() as AnclaKind, name: arg, disambiguated, sanctioned, line });
    }
  }
  return out;
}

const normNombre = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Igualdad de nombres accesibles normalizada (espacios colapsados, case-insensitive). */
function nombresIguales(medido: string | undefined, pedido: string): boolean {
  return medido !== undefined && normNombre(medido) === normNombre(pedido);
}

/** La semántica de getByRole({name}): substring, case-insensitive, espacios colapsados. */
function nombresCasan(medido: string | undefined, pedido: string): boolean {
  if (!medido) return false;
  const a = normNombre(medido);
  const b = normNombre(pedido);
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Emparejamiento en DOS niveles, y no es un detalle: con substring plano, `Ref. customer`
 * (verified) AVALA a `Ref.` (ambiguous) — un elemento distinto responde por el ancla
 * pedida, y justo en la colisión que la regla existe para cazar (medido en I1: el
 * ambiguous(3) de TC-005 desaparecía). Primero igualdad normalizada; substring solo si
 * no hay ningún igual. Dentro del nivel, los elementos de las pantallas del spec van
 * primero: su veredicto es el relevante cuando el mismo nombre existe en varias.
 */
export function candidatosDeAncla(
  ancla: AnclaExtraida,
  med: MedicionDiscovery,
  pantallasDelSpec: Set<string> = new Set(),
): ElementoMedido[] {
  const els = med.elementos;
  const porNombre = (
    campo: (e: ElementoMedido) => string | undefined,
    extra: (e: ElementoMedido) => boolean = () => true,
  ): ElementoMedido[] => {
    const exactos = els.filter((e) => extra(e) && nombresIguales(campo(e), ancla.name));
    const cands = exactos.length > 0 ? exactos : els.filter((e) => extra(e) && nombresCasan(campo(e), ancla.name));
    return [...cands].sort((a, b) => Number(pantallasDelSpec.has(b.screen)) - Number(pantallasDelSpec.has(a.screen)));
  };
  switch (ancla.kind) {
    case 'role':
      return porNombre((e) => e.name, (e) => e.role === ancla.role);
    case 'testid':
      return els.filter((e) => e.test_id === ancla.name);
    case 'label': {
      const porLabel = porNombre((e) => e.label);
      return porLabel.length > 0 ? porLabel : porNombre((e) => e.name);
    }
    case 'placeholder': {
      // el nombre accesible de un textbox suele SER su placeholder; el discovery no
      // guarda placeholders como campo propio
      const porNom = porNombre((e) => e.name);
      return porNom.length > 0 ? porNom : porNombre((e) => e.label);
    }
    case 'text':
      return porNombre((e) => e.name, (e) => e.role === 'text');
  }
}

export interface VeredictoAncla {
  severity: 'must-fix' | 'should-fix';
  description: string;
}

/**
 * La tabla de veredictos del plan (§3 G1). null = pasa.
 *
 * Matiz deliberado sobre la fila «arreglo sin remedir»: solo aplica cuando HAY una
 * medida previa que el desambiguador invalida (ambiguous/not-found). Sobre un ancla
 * ausente o unknown, el veredicto de ausencia domina — extender el must-fix ahí
 * dispararía falsos positivos en pantallas que el verificador no alcanzó (I2).
 */
export function veredictoDeAncla(
  ancla: AnclaExtraida,
  med: MedicionDiscovery,
  pantallasDelSpec: Set<string>,
): VeredictoAncla | null {
  const v = veredictoCrudo(ancla, med, pantallasDelSpec);
  /**
   * La vía de escape del protocolo Q2: el uso DECLARADO (tag `verify-locators:` o TODO
   * en la línea del ancla) baja a should-fix. Nunca a silencio — el Reviewer sigue
   * viéndolo — pero no bloquea a quien cumplió el protocolo. Sin esto, I2 midió 3/3
   * specs VERDES de SauceDemo marcados must-fix por anclas condicionales (el banner de
   * error que solo existe tras fallar el login) y plurales (los 6 inventory-item):
   * anotadas todas, y el gate moría por su propio umbral de falsos positivos.
   */
  if (v && v.severity === 'must-fix' && ancla.sanctioned) {
    return { severity: 'should-fix', description: `(uso declarado con TODO/evidencia) ${v.description}` };
  }
  return v;
}

function veredictoCrudo(
  ancla: AnclaExtraida,
  med: MedicionDiscovery,
  pantallasDelSpec: Set<string>,
): VeredictoAncla | null {
  const render =
    ancla.kind === 'role'
      ? `getByRole('${ancla.role}', { name: '${ancla.name}' })`
      : `getBy${ancla.kind === 'testid' ? 'TestId' : ancla.kind[0].toUpperCase() + ancla.kind.slice(1)}('${ancla.name}')`;

  const cands = candidatosDeAncla(ancla, med, pantallasDelSpec);
  if (cands.length > 0) {
    if (cands.some((c) => c.verified === true)) return null;
    const medido = cands.find((c) => c.verified === false) ?? cands[0];
    if (medido.verified === false) {
      const razon = medido.verify_reason ?? 'sin motivo';
      const reales = medido.accessible_names_found?.length
        ? ` Nombres accesibles reales: ${medido.accessible_names_found.map((n) => `"${n}"`).join(', ')}.`
        : '';
      if (ancla.disambiguated) {
        return {
          severity: 'must-fix',
          description: `${render} — ARREGLO SIN REMEDIR: el discovery lo midió '${razon}' en '${medido.screen}' y el desambiguador (exact:true/.first()/.filter()) invalida esa medida sin volver a medir. Re-mide o cita evidencia nueva.${reales}`,
        };
      }
      return {
        severity: 'must-fix',
        description: `${render} — el discovery lo midió '${razon}' en '${medido.screen}'. Regla dura K0.33: ≥2 coincidencias → plántate; 0 → no afirmes.${reales}`,
      };
    }
    return {
      severity: 'should-fix',
      description: `${render} — medido como DESCONOCIDO ('${medido.verify_reason ?? 'unknown'}') en '${medido.screen}': hueco del verificador, no culpa del Writer. Úsalo solo con TODO o evidencia citada.`,
    };
  }

  // Ancla ausente del discovery
  const pantallas = [...pantallasDelSpec];
  const todasMedidas = pantallas.length > 0 && pantallas.every((p) => med.pantallas.get(p) === true);
  if (todasMedidas) {
    return {
      severity: 'must-fix',
      description: `${render} — ANCLA NO MEDIDA: las pantallas de este spec están alcanzadas y medidas, y este ancla no aparece en el discovery. Afirmar un (rol, nombre) sin medirlo es la clase que costó 4 specs en Dolibarr (el 'heading' inexistente).`,
    };
  }
  return {
    severity: 'should-fix',
    description: `${render} — ancla ausente del discovery y alguna pantalla de este spec sin medir: hueco de cobertura DECLARADO, no verde silencioso. Úsalo solo con TODO o evidencia citada.`,
  };
}

export function screenFileName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.page.ts';
}

export function postconditionsForSpec(
  source: string,
  specPath: string,
  todas: BusinessPostcondition[],
): BusinessPostcondition[] {
  if (todas.length === 0) return [];
  const importados = new Set(relativeImportsOf(source, specPath).map((p) => basename(p)));
  return todas.filter((p) => importados.has(screenFileName(p.screen)));
}

/**
 * MF-auth-landing (D39) — el setup de autenticación asserta la URL de destino.
 *
 * Medido en campo el 2026-08-21: `auth.setup.ts` pasó en VERDE contra una aplicación que
 * devolvía HTTP 500. El `success_signal` del contract era el enlace `Log Out`, que
 * ParaBank pinta en su barra de navegación **también en la página de error**. El gate dio
 * por buena una sesión inservible y el fallo salió tres pasos más tarde, en cada spec.
 *
 * Una señal de éxito que también aparece en la pantalla de fallo no es una señal de
 * éxito. Lo que sí distingue las dos pantallas es la URL, y eso es mecánico: el setup
 * debe asertar dónde aterrizó, no solo que hay un enlace en el menú.
 */
export function assertsLandingUrl(source: string): boolean {
  return /\btoHaveURL\s*\(/.test(source) || /\bwaitForURL\s*\(/.test(source);
}

export function preReviewSpec(
  filePath: string,
  contract: PreReviewContract,
  a11yContractPath?: string,
  postconditions: BusinessPostcondition[] = [],
  tscDiagnostics: TscDiagnostic[] = [],
  medicion: MedicionDiscovery | null = null,
): PreReviewResult {
  const file = filePath.replace(/\\/g, '/');
  const source = readFileSync(filePath, 'utf8');
  const findings: PreReviewFinding[] = [];
  const seen = new Set<string>();
  const add = (f: PreReviewFinding): void => {
    const key = `${f.criterion_id}:${f.location.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };

  /**
   * MF-tsc — el compilador va PRIMERO. Un spec que no compila no llega a ejecutarse y
   * analizarle el estilo es ruido. Se evalua tambien en los `.setup.ts`, que se saltan
   * los checks de contenido pero cuyo fallo de compilacion tumba el proyecto entero.
   */
  for (const d of attributeDiagnostics(filePath, source, tscDiagnostics)) {
    const mismo = resolve(d.file).replace(/\\/g, '/') === resolve(filePath).replace(/\\/g, '/');
    add({
      criterion_id: 'MF-tsc',
      category: 'compile',
      severity: 'must-fix',
      location: { line: d.line },
      description: d.code + ': ' + d.message + (mismo ? '' : ' [en ' + d.file + ', importado por este spec]'),
    });
  }

  if (/\.setup\.ts$/.test(file) || /import\s*\{\s*test\s+as\s+setup\s*\}/.test(source)) {
    /**
     * MF-auth-landing (D39) — el unico check de contenido que SI aplica a un setup.
     * Un setup que solo asserta un locator de navegacion pasa en verde sobre la pantalla
     * de error de la app; la URL es lo que distingue aterrizar de fallar.
     */
    if (!assertsLandingUrl(source)) {
      add({
        criterion_id: 'MF-auth-landing',
        category: 'assert-quality',
        severity: 'must-fix',
        location: { line: 1 },
        description:
          'el setup de autenticacion no asserta la URL de destino (toHaveURL / waitForURL): ' +
          'una senal basada solo en un locator de navegacion se satisface tambien en la pantalla ' +
          'de error de la app — medido, paso en verde contra un HTTP 500',
      });
    }
    // los checks de CONTENIDO restantes no aplican a un setup; los de compilacion si
    return {
      test_file: file,
      source: 'pre-review-deterministic',
      skipped: true,
      findings,
      must_fix: findings.length,
      should_fix: 0,
      clean: findings.length === 0,
    };
  }

  // MF-1 / MF-1b — locators CSS bruto / XPath en llamadas .locator('...')
  for (const m of source.matchAll(LOCATOR_CALL)) {
    const selector = m[2];
    const line = lineOf(source, m.index!);
    if (/^xpath=/i.test(selector) || selector.startsWith('//')) {
      if (contract.forbid_xpath) {
        add({ criterion_id: 'MF-1', category: 'locator-strategy', severity: 'must-fix', location: { line }, description: `Locator XPath prohibido: ${selector}` });
      }
      continue;
    }
    if (!contract.forbid_css_selectors) continue;
    const attrMatch = selector.match(BOUNDED_ATTR);
    const isBoundedId = BOUNDED_ID.test(selector);
    if (attrMatch || isBoundedId) {
      const attr = attrMatch ? attrMatch[1] : 'id';
      const tagged = /\/\/\s*css-fallback:/.test(lineText(source, m.index!));
      const sanctioned = contract.css_fallback_attributes.includes(attr);
      if (tagged && sanctioned) continue; // excepción legacy del contract (MF-1)
      add({
        criterion_id: 'MF-1', category: 'locator-strategy', severity: 'must-fix', location: { line },
        description: sanctioned
          ? `Selector de atributo acotado '${selector}' sin tag // css-fallback:`
          : `Selector CSS '${selector}' — atributo '${attr}' no declarado en locators.css_fallback_attributes`,
      });
    } else {
      add({ criterion_id: 'MF-1', category: 'locator-strategy', severity: 'must-fix', location: { line }, description: `Selector CSS bruto prohibido: ${selector}` });
    }
  }

  /**
   * MF-wait-budget (D35) — el spec y los POM que importa. El helper de espera vive en el
   * POM, asi que mirar solo el spec habria dejado pasar el caso real que motivo el check.
   */
  const ficherosDeEspera: Array<[string, string]> = [['', source]];
  for (const imp of relativeImportsOf(source, filePath)) {
    if (!existsSync(imp)) continue;
    if (ficherosDeEspera.some(([e]) => e === imp)) continue;
    try {
      ficherosDeEspera.push([imp, readFileSync(imp, 'utf8')]);
    } catch {
      /* ilegible: no se inventa un finding sobre lo que no se pudo leer */
    }
  }
  for (const [etiqueta, texto] of ficherosDeEspera) {
    for (const g of scanReadinessGuards(texto, etiqueta ? basename(etiqueta) : '')) {
      add({
        criterion_id: 'MF-wait-budget',
        category: 'wait-strategy',
        severity: 'must-fix',
        location: { line: etiqueta ? 1 : g.line },
        description: g.description,
      });
    }
  }

  /**
   * MF-locator-no-medido (G1) — cada ancla getBy* del spec Y de sus POM, cruzada contra
   * el veredicto de verify-locators. Mira los POM porque ahí viven los locators (medido
   * sobre el corpus de Dolibarr: los specs casi no contienen ninguno). La línea del
   * finding es la del fichero donde está el ancla; el fichero va en la descripción.
   */
  if (medicion) {
    const importados = new Set(relativeImportsOf(source, filePath).map((p) => basename(p)));
    const pantallasDelSpec = new Set<string>();
    for (const nombre of medicion.pantallas.keys()) {
      if (importados.has(screenFileName(nombre))) pantallasDelSpec.add(nombre);
    }
    for (const [etiqueta, texto] of ficherosDeEspera) {
      for (const ancla of extractGetByAnchors(texto)) {
        const v = veredictoDeAncla(ancla, medicion, pantallasDelSpec);
        if (!v) continue;
        add({
          criterion_id: v.severity === 'must-fix' ? 'MF-locator-no-medido' : 'SF-locator-no-medido',
          category: 'locator-strategy',
          severity: v.severity,
          location: { line: ancla.line },
          description: (etiqueta ? `[${basename(etiqueta)}] ` : '') + v.description,
        });
      }
    }
  }

  // MF-2 — waitForTimeout
  for (const m of source.matchAll(/\bwaitForTimeout\s*\(/g)) {
    add({ criterion_id: 'MF-2', category: 'wait-strategy', severity: 'must-fix', location: { line: lineOf(source, m.index!) }, description: 'page.waitForTimeout() prohibido — usar asserts semánticos sobre locators' });
  }

  // MF-regex-anchor — toHaveClass con regex sin anclas (Q3, clase del rojo TC-005 de Q2):
  // /error/ matchea por SUBSTRING contra clases compuestas siempre presentes ('input_error'
  // contiene 'error'), así que not.toHaveClass(/error/) falla aunque la clase suelta no esté.
  // Se exige ancla en el patrón: \b, \B, ^ o $.
  for (const m of source.matchAll(/\btoHaveClass\s*\(/g)) {
    const line = lineOf(source, m.index!);
    const text = lineText(source, m.index!).replace(/\/\/.*$/, ''); // sin el comentario de cola
    for (const re of text.matchAll(/\/((?:\\.|[^/\\\n])+)\/[a-z]*/g)) {
      const pattern = re[1];
      const anchored = /[\^$]/.test(pattern) || /\\[bB]/.test(pattern);
      if (!anchored) {
        add({
          criterion_id: 'MF-regex-anchor', category: 'assert-quality', severity: 'must-fix', location: { line },
          description: `toHaveClass(/${pattern}/) — regex sin anclas matchea substrings de clases compuestas (p.ej. 'input_error' contiene 'error'); ancla con \\b, ^ o $`,
        });
      }
    }
  }

  // banned_apis del contract (los ya cubiertos arriba se deduplican por línea)
  for (const api of contract.banned_apis) {
    if (api === 'xpath' || api === 'page.waitForTimeout') continue; // cubiertos por MF-1/MF-2
    let idx = source.indexOf(api);
    while (idx >= 0) {
      add({ criterion_id: 'MF-banned-api', category: 'style-contract', severity: 'must-fix', location: { line: lineOf(source, idx) }, description: `API prohibida por el contract: ${api}` });
      idx = source.indexOf(api, idx + api.length);
    }
  }

  // MF-4 — scan AxeBuilder por test() (delegado en verify-a11y: misma garantía, misma lógica)
  const a11y = verifySpec(filePath, loadA11yContract(a11yContractPath));
  for (const t of a11y.tests.filter((x) => !x.ok)) {
    add({ criterion_id: 'MF-4', category: 'a11y-missing', severity: 'must-fix', location: { line: 1 }, description: `test '${t.title}': ${t.problem}` });
  }

  // MF-5 — cita @criterion en JSDoc
  if (!/@criterion\s+\S/.test(source)) {
    add({ criterion_id: 'MF-5', category: 'criterion-not-cited', severity: 'must-fix', location: { line: 1 }, description: 'JSDoc sin cita @criterion' });
  }

  // MF-8 (proxy mecánico) — POM no importado con pom.enabled
  if (contract.pom_enabled && !/import\s+.*from\s+['"][^'"]*\.page(?:\.ts)?['"]/.test(source)) {
    add({ criterion_id: 'MF-8', category: 'pom-violation', severity: 'must-fix', location: { line: 1 }, description: 'pom.enabled:true pero el spec no importa ninguna clase *.page — verificar si existe Page para la pantalla' });
  }

  // Parte mecánica de MF-3/MF-9 — conteo de asserts funcionales por test()
  if (contract.require_business_postcondition) {
    for (const block of extractTestBlocks(source)) {
      let functional = 0;
      for (const em of block.body.matchAll(/\bexpect\s*(?:\.soft\s*)?\(/g)) {
        const stmt = block.body.slice(em.index!, block.body.indexOf('\n', em.index!) + 1 || undefined);
        if (/toHaveURL/.test(stmt)) continue; // navegación, no funcional (MF-3)
        if (/iolations|a11y/i.test(stmt)) continue; // gate a11y, no assert de negocio
        functional += 1;
      }
      if (functional < contract.min_functional_asserts) {
        add({
          criterion_id: 'MF-9', category: 'assert-quality', severity: 'must-fix', location: { line: 1 },
          description: `test '${block.title}': ${functional} assert(s) funcionales < min_functional_asserts (${contract.min_functional_asserts}) — solo navegación/a11y no basta`,
        });
      }
    }
  }

  /**
   * MF-postcondition (K0.7) — el hueco que MF-9 no cubre: MF-9 cuenta CANTIDAD de
   * asserts funcionales; esto mide su FUERZA SEMÁNTICA. Si el walker observó un
   * texto de resultado de negocio (business_text verificado) y el spec no asserta
   * sobre ninguno, el test cierra sobre el mueble de la pantalla (clase medida dos
   * veces en Fase A: `backToProducts` visible en vez de "Thank you for your
   * order!"). Pasa verde y no verifica el resultado. Con la evidencia disponible
   * en el discovery, no asertarla es un must-fix, no una preferencia.
   */
  const postsDeEsteSpec = postconditionsForSpec(source, filePath, postconditions);
  if (contract.require_business_postcondition && postsDeEsteSpec.length > 0) {
    if (!assertsSomePostcondition(source, postsDeEsteSpec)) {
      const sample = postsDeEsteSpec
        .slice(0, 3)
        .map((p) => `"${p.text}"${p.test_id ? ` (${p.test_id})` : ''}`)
        .join(', ');
      const total = postsDeEsteSpec.length;
      add({
        criterion_id: 'MF-postcondition',
        category: 'assert-quality',
        severity: 'must-fix',
        location: { line: 1 },
        description:
          `ningún assert sobre la postcondición de negocio observada por el walker — ` +
          `disponibles y verificadas EN LAS PANTALLAS DE ESTE SPEC: ${sample}${total > 3 ? ` (+${total - 3})` : ''}. ` +
          `Asertar estado/chrome en vez del resultado deja el test verde sin verificar el negocio`,
      });
    }
  }

  // Should-fix — naturaleza en el título/describe (la naturaleza vive solo en el tag @negative)
  for (const m of source.matchAll(TITLE_CALL)) {
    const title = m[2];
    if (NATURE_IN_TITLE.test(title)) {
      add({ criterion_id: 'SF-naming', category: 'style-contract', severity: 'should-fix', location: { line: lineOf(source, m.index!) }, description: `Título '${title}' nombra la naturaleza — describir condición → resultado` });
    }
  }

  // ---- Checks de FORMA (spec-template.md) — should-fix: la forma no bloquea un test
  // correcto, pero tres runs produjeron tres dialectos y el Reviewer debe verlo.

  // SF-generated-by — procedencia en el JSDoc (¿emisor determinista o Writer?)
  if (!/@generated-by\s+\S/.test(source)) {
    add({ criterion_id: 'SF-generated-by', category: 'style-contract', severity: 'should-fix', location: { line: 1 }, description: 'JSDoc sin @generated-by — la procedencia (walk-to-spec vN | ia4d-writer) es dato de auditoría' });
  }

  // SF-step-lang — marcador de paso en inglés (dialecto; el canon minimal es '// Paso N:')
  for (const m of source.matchAll(/\/\/\s*Step\s+\d+\s*:/gi)) {
    if (/paso/i.test(m[0])) continue;
    add({ criterion_id: 'SF-step-lang', category: 'style-contract', severity: 'should-fix', location: { line: lineOf(source, m.index!) }, description: `Marcador '${m[0].trim()}' en inglés — el canon es '// Paso N: <prosa>' (spec-template.md)` });
  }

  const usesTestStep = /\btest\.step\s*\(/.test(source);
  if (contract.evidence_level !== 'minimal') {
    // SF-steps — con evidence.level steps/full el cuerpo va en test.step() (timeline en Allure,
    // el fallo dice en qué paso de NEGOCIO rompió; spec-template.md)
    if (!usesTestStep) {
      add({ criterion_id: 'SF-steps', category: 'style-contract', severity: 'should-fix', location: { line: 1 }, description: `evidence.level '${contract.evidence_level}' pero el spec no usa test.step() — cuerpo plano es forma 'minimal'` });
    }
    // SF-a11y-step — el scan a11y vive en su step de título fijo, siempre en el mismo sitio
    if (usesTestStep && /AxeBuilder/.test(source) && !/test\.step\s*\(\s*(['"`])[^'"`]*a11y[^'"`]*\1/i.test(source)) {
      add({ criterion_id: 'SF-a11y-step', category: 'style-contract', severity: 'should-fix', location: { line: 1 }, description: `El scan AxeBuilder no está en su step canónico — título fijo 'Evidencia a11y (WCAG 2.1 AA)' (spec-template.md)` });
    }
  }

  const mustFix = findings.filter((f) => f.severity === 'must-fix').length;
  const shouldFix = findings.length - mustFix;
  return {
    test_file: file,
    source: 'pre-review-deterministic',
    skipped: false,
    findings,
    must_fix: mustFix,
    should_fix: shouldFix,
    clean: mustFix === 0,
  };
}

function collectSpecs(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const abs = resolve(process.cwd(), p);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isDirectory()) {
      for (const f of readdirSync(abs)) {
        if ((f.endsWith('.spec.ts') || f.endsWith('.setup.ts')) && f !== 'seed.spec.ts') out.push(join(abs, f));
      }
    } else {
      out.push(abs);
    }
  }
  return out.sort();
}

function main(): void {
  const args = process.argv.slice(2);
  const contractPath = args.find((a) => a.startsWith('--style-contract='))?.slice('--style-contract='.length);
  const outDirArg = args.find((a) => a.startsWith('--out-dir='))?.slice('--out-dir='.length);
  const discoveryArg = args
    .find((a) => a.startsWith('--discovery-report='))
    ?.slice('--discovery-report='.length);
  const targets = args.filter((a) => !a.startsWith('--'));

  if (targets.length === 0) {
    console.error(
      '[pre-review] uso: tsx src/scripts/pre-review.ts <spec.ts|dir>... [--style-contract=<path>] [--discovery-report=<path>] [--out-dir=<dir>]',
    );
    process.exit(1);
  }

  const contract = loadPreReviewContract(contractPath);
  // K0.7: sin discovery el check MF-postcondition no aplica (no se inventan exigencias)
  const postconditions = loadBusinessPostconditions(discoveryArg);
  const medicion = loadDiscoveryMeasurements(discoveryArg);
  const specs = collectSpecs(targets);
  if (specs.length === 0) {
    console.error(`[pre-review] no se encontraron specs en: ${targets.join(', ')}`);
    process.exit(1);
  }

  const outDir = resolve(process.cwd(), outDirArg || join(process.env.QA_WORK_DIR || '.work', 'pre-review'));
  mkdirSync(outDir, { recursive: true });

  /**
   * El compilador, UNA vez para todos los specs. Se puede omitir con --no-tsc para el
   * caso en que el typecheck esta roto por algo ajeno a los specs y no se quiere que
   * ahogue el resto de checks; la omision se DECLARA en el resumen, no se disfraza.
   */
  const tsc = args.includes('--no-tsc')
    ? { diagnostics: [] as TscDiagnostic[], ran: false, note: 'omitido por --no-tsc' }
    : runTsc();

  const results = specs.map((s) => preReviewSpec(s, contract, contractPath, postconditions, tsc.diagnostics, medicion));

  /**
   * Diagnosticos de tsc que no pertenecen a ningun spec revisado ni a nada que estos
   * importen: un POM huerfano que nadie usa, un helper roto, o un error global de
   * proyecto. No los arregla ningun Writer de este lote, asi que se REPORTAN aparte.
   * Descartarlos silenciosamente convertiria un proyecto que no compila en un
   * "specs_clean: N" tranquilizador.
   */
  const atribuidos = new Set<string>();
  for (let i = 0; i < specs.length; i++) {
    const src = readFileSync(specs[i], 'utf8');
    for (const d of attributeDiagnostics(specs[i], src, tsc.diagnostics)) {
      atribuidos.add(d.file + ':' + d.line + ':' + d.code);
    }
  }
  const huerfanos = tsc.diagnostics.filter((d) => !atribuidos.has(d.file + ':' + d.line + ':' + d.code));
  for (const r of results) {
    /**
     * Se omite el fichero solo si el spec se salto Y esta limpio. Un `.setup.ts` es
     * `skipped` para los checks de CONTENIDO pero puede traer findings de MF-tsc, y
     * descartarlos aqui los tiraria a la basura despues de calcularlos — el patron
     * D2 (declarado y nadie lo consume). Cazado en el run de verificacion del
     * 2026-08-21, en codigo escrito ese mismo dia.
     */
    if (!debeEscribirse(r)) continue;
    writeFileSync(join(outDir, `${basename(r.test_file)}.json`), JSON.stringify(r, null, 2), 'utf8');
    appendAuditEntry({
      source: 'command',
      action: r.clean ? 'allow' : 'warn',
      target: basename(r.test_file),
      rule: 'pre-review-deterministic',
      reason: r.clean
        ? 'checks objetivos OK (red determinística post-review)'
        : `${r.must_fix} must-fix determinísticos: ${[...new Set(r.findings.filter((f) => f.severity === 'must-fix').map((f) => f.criterion_id))].join(', ')}`,
      result: r.clean ? 'pass' : 'fail',
    });
  }

  const active = results.filter((r) => !r.skipped);
  console.log(
    JSON.stringify(
      {
        out_dir: outDir.replace(/\\/g, '/'),
        tsc: {
          ran: tsc.ran,
          ...(tsc.note ? { note: tsc.note } : {}),
          diagnostics_total: tsc.diagnostics.length,
          ...(huerfanos.length > 0
            ? {
                unattributed: huerfanos.slice(0, 10).map((d) => ({
                  file: d.file || '(proyecto)',
                  line: d.line,
                  code: d.code,
                  message: d.message,
                })),
                unattributed_note:
                  'errores de compilacion que NO pertenecen a los specs revisados: nadie de este lote los arregla, pero el proyecto no compila',
              }
            : {}),
        },
        specs_total: active.length,
        specs_clean: active.filter((r) => r.clean).length,
        must_fix_total: active.reduce((n, r) => n + r.must_fix, 0),
        should_fix_total: active.reduce((n, r) => n + r.should_fix, 0),
        dirty_specs: active.filter((r) => !r.clean).map((r) => ({
          file: r.test_file,
          criteria: [...new Set(r.findings.filter((f) => f.severity === 'must-fix').map((f) => f.criterion_id))],
        })),
      },
      null,
      2,
    ),
  );
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('pre-review.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
