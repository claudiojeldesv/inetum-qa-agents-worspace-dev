#!/usr/bin/env node
/**
 * walk-to-spec — emisor determinístico ($0 tokens) de specs Playwright desde un
 * walk verificado. Sustituye al Writer LLM en la fracción verde: el walk-script
 * es la INTENCIÓN (viene del FD vía refiner) y el dom-map es la EVIDENCIA
 * (locators resueltos en vivo por la escalera, outcomes por paso). Se emite
 * desde el guion y la evidencia solo aporta el locator y la confirmación —
 * emitir desde lo observado produciría overfit a la instancia (asertar "31
 * filas" porque hoy había 31 cuando el guion decía `> 0`).
 *
 * Unidad de emisión: el FLUJO. Un flujo es emisible si todos sus pasos
 * no-opcionales cerraron ok/ok_after_retry, ninguna aserción que pasó lleva
 * `after_blocked` (K0.39: un verde sospechoso no se industrializa) y todas sus
 * acciones tienen locator autoritativo. Lo demás va a la cola del Writer CON el
 * motivo — información que el Writer hoy no tiene.
 *
 * La forma del output es el golden de docs/references/spec-template.md, por
 * construcción: su suite exige que el emitido pase pre-review con 0 findings.
 *
 * Límites v1, declarados (el emit-report los lista, nunca en silencio):
 *  - `expect_text`/`wait_text` con `scope` → cola del Writer (el walker no
 *    registra el locator del ámbito y emitir búsqueda a página completa sería
 *    reintroducir el verde falso de K0.30).
 *  - `select` se emite como selectOption nativo; sobre fachada no nativa
 *    fallará EN ROJO (visible), nunca en verde falso. Warning en el report.
 *  - `scroll_until`/`expect_each` → cola (su semántica es un bucle del walker,
 *    no una llamada Playwright).
 *  - iframes: los locators se emiten contra `page` (sin frameLocator).
 *  - flujos emitidos como casos independientes desde `entry`: un flujo que
 *    dependa del estado dejado por otro necesita la precondición de sesión (v2).
 *
 * Uso:  tsx copilot/src/walk-to-spec.ts --walk-script=<path> --dom-map=<path>
 *       [--style-contract=<path>] [--out-specs=<dir>] [--out-pages=<dir>]
 * Exit: 0 (aunque haya flujos encolados: la cola es un desenlace, no un error) · 1 error de entrada.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';

import { appendAuditEntry } from '../../src/audit-log.ts';
import { fileNameFor } from '../../src/pom-scaffolder.ts';
import { parseLocatorChain, resolveFixtureRef } from './walk-core.ts';
import type { DomMap, StepReport, WalkFlow, WalkScript, WalkStep } from './walk-types.ts';

// ------------------------------------------------------------- contrato

export interface EmitContract {
  class_suffix: string;
  inject_axe: boolean;
  fail_on_violations: boolean;
  evidence_level: 'minimal' | 'steps' | 'full';
  synthetic_fixtures: Record<string, unknown>;
}

export function loadEmitContract(contractPath?: string): EmitContract {
  const defaults: EmitContract = {
    class_suffix: 'Page',
    inject_axe: true,
    fail_on_violations: false,
    evidence_level: 'steps',
    synthetic_fixtures: {},
  };
  if (!contractPath) return defaults;
  const path = resolve(process.cwd(), contractPath);
  if (!existsSync(path)) return defaults;
  const parsed = parseYaml(readFileSync(path, 'utf8')) as Record<string, any> | null;
  if (!parsed) return defaults;
  const level = parsed.evidence?.level;
  return {
    class_suffix: parsed.pom?.class_suffix ?? 'Page',
    inject_axe: parsed.a11y?.inject_axe_check !== false,
    fail_on_violations: parsed.a11y?.fail_on_violations === true,
    evidence_level: level === 'minimal' || level === 'full' ? level : 'steps',
    synthetic_fixtures: parsed.synthetic_fixtures ?? {},
  };
}

// ------------------------------------------------------------- elegibilidad

const SUPPORTED: ReadonlySet<string> = new Set([
  'goto', 'fill', 'click', 'hover', 'select', 'check', 'uncheck', 'press',
  'wait_url', 'wait_text', 'expect_text', 'expect_state', 'expect_value',
  'expect_count', 'capture',
]);

const NEEDS_LOCATOR: ReadonlySet<string> = new Set([
  'fill', 'click', 'hover', 'select', 'check', 'uncheck',
  'expect_state', 'expect_value', 'expect_count',
]);

const IS_ASSERT: ReadonlySet<string> = new Set([
  'expect_text', 'expect_state', 'expect_value', 'expect_count', 'wait_text', 'wait_url',
]);

export interface QueuedFlow {
  flow: string;
  reasons: string[];
}

interface EligibleStep {
  step: WalkStep;
  report: StepReport;
  chain?: string;
}

/**
 * Decide si el flujo se emite y con qué pasos. Un paso `optional` bloqueado se
 * SALTA (anotado como warning), como hace el walker; cualquier otro defecto
 * encola el flujo entero — emitir un caso a medias sería un test que afirma
 * cubrir el FD sin cubrirlo.
 */
export function flowEligibility(
  flow: WalkFlow,
  reports: Map<string, StepReport>,
  warnings: string[],
): { steps: EligibleStep[]; reasons: string[] } {
  const steps: EligibleStep[] = [];
  const reasons: string[] = [];
  for (const step of flow.steps) {
    const report = reports.get(`${flow.flow}/${step.id}`);
    if (!report || report.outcome === 'action_failed' || report.outcome === 'postcondition_unmet') {
      const why = report ? `outcome ${report.outcome}` : 'sin step_report (el walk no lo alcanzó)';
      if (step.optional) {
        warnings.push(`${flow.flow}/${step.id}: paso optional saltado (${why})`);
        continue;
      }
      reasons.push(`paso ${step.id}: ${why}`);
      continue;
    }
    if (!SUPPORTED.has(step.action)) {
      reasons.push(`paso ${step.id}: acción '${step.action}' no soportada por el emisor v1`);
      continue;
    }
    if ((step.action === 'expect_text' || step.action === 'wait_text') && step.scope) {
      reasons.push(
        `paso ${step.id}: ${step.action} con scope — el walker no registra el locator del ámbito y ` +
          `emitir búsqueda a página completa reintroduciría el verde falso de K0.30`,
      );
      continue;
    }
    if (IS_ASSERT.has(step.action) && report.after_blocked) {
      reasons.push(
        `paso ${step.id}: la aserción pasó con el paso previo '${report.after_blocked}' bloqueado ` +
          `(posible verde falso, K0.39) — reconciliar antes de emitir`,
      );
      continue;
    }
    /**
     * D20 — `emit_locator` ANTES de `resolved_via`, y por qué existe ese campo:
     * `resolved_via` es DIAGNÓSTICO (lo parsea `classifyVia` para el marcador de
     * peldaños, K0.27a), no código. El tier anclado emite su propia notación
     * —`anchored(label:'Usuario')`— y hasta aquí se volcaba verbatim al fichero
     * generado: `page.anchored(label:'Usuario')`, que no compila. Un solo paso
     * resuelto por ese peldaño mataba el POM y con él TODOS los specs del sitio,
     * justo en el legacy que es la razón de existir del peldaño.
     */
    const chain = step.locator ?? report.emit_locator ?? report.resolved_via;
    if (NEEDS_LOCATOR.has(step.action) && !chain) {
      reasons.push(`paso ${step.id}: acción '${step.action}' sin locator autoritativo (ni step.locator ni resolved_via)`);
      continue;
    }
    const noCodigo = chain ? primerSegmentoNoExpresable(chain) : null;
    if (noCodigo) {
      reasons.push(
        `paso ${step.id}: '${noCodigo}' es notación de diagnóstico, no código Playwright — ` +
          `el walker no dejó locator emisible para este paso (D20)`,
      );
      continue;
    }
    steps.push({ step, report, chain });
  }
  return { steps, reasons };
}

// ------------------------------------------------------------- locators → código

/**
 * `A >> B.nth(2)` / `css=#id` → expresión Playwright encadenada sobre `page`.
 *
 * El segmento final lleva `.filter({ visible: true })`: la regla dura de la
 * escalera es "única coincidencia VISIBLE", y la cadena sola no transporta esa
 * precondición — sin ella, el duplicado responsive oculto (menú desktop + móvil,
 * medido en tufarmacia) revienta el strict mode aunque el walker resolvió bien.
 * Con `.nth(N)` no se filtra: el índice se calculó sobre el DOM completo y
 * filtrar antes lo cambiaría.
 */
/**
 * D20 — los ÚNICOS prefijos de la gramática que producen código. Lista blanca y no
 * negra a propósito: con una lista negra, cada peldaño nuevo que emitiera notación
 * propia volvería a colarse verbatim, que es exactamente cómo llegó `anchored(...)`
 * al fichero generado sin que nada se quejara.
 */
const PREFIJOS_EMISIBLES = [
  'getByTestId(',
  'getByRole(',
  'getByLabel(',
  'getByPlaceholder(',
  'getByText(',
  'getByTitle(',
  'getByAltText(',
  'locator(',
  'css=',
  'frameLocator(',
];

/** Primer segmento de la cadena que NO es código Playwright, o `null` si todos lo son. */
export function primerSegmentoNoExpresable(chain: string): string | null {
  for (const { segment } of parseLocatorChain(chain)) {
    if (!PREFIJOS_EMISIBLES.some((p) => segment.startsWith(p))) return segment;
  }
  return null;
}

export function chainToCode(chain: string): string {
  // Cinturón: `flowEligibility` ya descarta el flujo, pero esta función es exportada
  // y el fallo silencioso es lo que produjo un POM que no parseaba y 0 tests.
  const malo = primerSegmentoNoExpresable(chain);
  if (malo) throw new Error(`chainToCode: '${malo}' no es código Playwright (notación de diagnóstico)`);
  return chainToCodeInterno(chain);
}

function chainToCodeInterno(chain: string): string {
  const segments = parseLocatorChain(chain);
  const parts = segments.map(({ segment, nth }, i) => {
    let code = segment.startsWith('css=')
      ? `locator('${segment.slice('css='.length).replace(/'/g, "\\'")}')`
      : segment;
    if (nth !== undefined) return `${code}.nth(${nth})`;
    if (i === segments.length - 1) code += `.filter({ visible: true })`;
    return code;
  });
  return parts.join('.');
}

function toPascal(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // 'Contraseña'→'Contrasena', no 'ContraseA'
    .replace(/[^a-zA-Z0-9\s\-_/]+/g, ' ')
    .split(/[-_\s/]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('');
}

function toCamel(input: string): string {
  const pascal = toPascal(input);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function hintKey(step: WalkStep): string {
  const h = step.hint ?? {};
  // el rol antes que el id del paso: 's6' no dice nada, 'row' al menos dice QUÉ es
  return h.test_id ?? h.name ?? h.label ?? h.text ?? h.role ?? step.id;
}

// ------------------------------------------------------------- prosa mecánica

const VERB: Record<string, string> = {
  fill: 'introduce', click: 'pulsa', hover: 'despliega', select: 'selecciona',
  check: 'marca', uncheck: 'desmarca', press: 'pulsa la tecla',
};

function actionDesc(step: WalkStep): string {
  const target = hintKey(step);
  if (step.action === 'press') return `${VERB.press} ${step.value ?? ''}`.trim();
  const v = VERB[step.action] ?? step.action;
  return `${v} '${target}'`;
}

function assertDesc(step: WalkStep): string {
  switch (step.action) {
    case 'expect_text':
    case 'wait_text':
      return `se observa "${step.value}"`;
    case 'expect_state':
      return `'${hintKey(step)}' está ${step.value}`;
    case 'expect_value':
      return `'${hintKey(step)}' vale "${step.value}"`;
    case 'expect_count':
      return `'${hintKey(step)}' cuenta ${step.operator} ${step.value}`;
    case 'wait_url':
      return `la URL contiene ${step.target}`;
    default:
      return step.action;
  }
}

function humanize(slug: string): string {
  const s = slug.replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ------------------------------------------------------------- emisión

export interface EmittedPage {
  file: string;
  className: string;
  content: string;
}

export interface EmittedSpec {
  flow: string;
  file: string;
  content: string;
}

export interface EmitResult {
  emitted: EmittedSpec[];
  pages: EmittedPage[];
  queued: QueuedFlow[];
  warnings: string[];
  /**
   * Variables de entorno que los specs emitidos NECESITAN para correr, con la ruta del
   * contract de donde sale cada valor.
   *
   * D43, medido en OrangeHRM el 2026-08-22: un paso con `secret: true` se emite como
   * referencia a variable de entorno —correcto, un secreto no se incrusta en un spec
   * versionado— pero nadie la declaraba, nadie la exportaba y nadie avisaba de que
   * existia. Los tres specs emitidos fallaban con «locator.fill: value: expected string,
   * got undefined», que no dice nada. El productor emitia un contrato y ningun consumidor
   * lo cumplia. Sobrevivio hasta hoy porque hasta este run walk-to-spec nunca habia
   * llegado a emitir NADA: el camino no se habia ejercitado de punta a punta.
   */
  required_env: Array<{ name: string; source: string }>;
}

interface PageModel {
  screen: string;
  className: string;
  file: string;
  props: Map<string, string>; // propName → cadena de locator
  hasGoto: boolean;
}

type Category = 'setup' | 'action' | 'assert';

function categoryOf(step: WalkStep): Category {
  if (step.action === 'goto' || step.action === 'capture') return 'setup';
  if (IS_ASSERT.has(step.action)) return 'assert';
  return 'action';
}

const A11Y_STEP_TITLE = 'Evidencia a11y (WCAG 2.1 AA)';

function a11yLines(contract: EmitContract): string[] {
  const scan = `const scan = await new AxeBuilder({ page }).analyze();`;
  if (contract.fail_on_violations) {
    return [scan, `expect(scan.violations).toEqual([]);`];
  }
  return [
    scan,
    `test.info().annotations.push({`,
    `  type: 'a11y-scan',`,
    `  description: \`\${scan.violations.length} violaciones (warning — a11y.fail_on_violations: false)\`,`,
    `});`,
  ];
}

function q(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Normaliza un destino de goto para que el ENTORNO lo gobierne baseURL
 * (QA_BASE_URL), no el código: una URL absoluta ataría el spec al entorno donde
 * corrió el walk. Absoluta con host == base_url del guion → se emite la RUTA.
 * Host distinto (o sin base_url declarada) → se conserva y se avisa: recortar
 * el origen de un cross-host (SSO, CDN) cambiaría la semántica.
 */
export function gotoTarget(
  target: string,
  baseUrl: string | undefined,
  warn: (msg: string) => void,
  context: string,
): string {
  if (!/^https?:\/\//i.test(target)) return target;
  try {
    const t = new URL(target);
    const base = baseUrl ? new URL(baseUrl) : null;
    if (base && t.host === base.host) {
      return `${t.pathname}${t.search}${t.hash}`;
    }
    warn(
      `${context}: goto absoluta '${target}' ${base ? `con host distinto de base_url (${base.host})` : 'sin base_url declarada en el guion'} — ` +
        `emitida tal cual: el spec queda atado a ese entorno`,
    );
    return target;
  } catch {
    return target;
  }
}

export function emitFromWalk(
  script: WalkScript,
  domMap: DomMap,
  contract: EmitContract,
  opts: { pagesImportPrefix?: string } = {},
): EmitResult {
  const importPrefix = opts.pagesImportPrefix ?? '../pages/';
  const reports = new Map<string, StepReport>();
  for (const r of domMap.step_reports ?? []) reports.set(`${r.flow}/${r.step}`, r);

  const warnings: string[] = [];
  const requiredEnv = new Map<string, string>();
  const queued: QueuedFlow[] = [];
  const emitted: EmittedSpec[] = [];
  const pagesByScreen = new Map<string, PageModel>();

  const pageFor = (screen: string): PageModel => {
    let page = pagesByScreen.get(screen);
    if (!page) {
      page = {
        screen,
        className: `${toPascal(screen)}${contract.class_suffix}`,
        file: fileNameFor(screen, 'page'),
        props: new Map(),
        hasGoto: false,
      };
      pagesByScreen.set(screen, page);
    }
    return page;
  };

  const propFor = (page: PageModel, step: WalkStep, chain: string): string => {
    for (const [name, c] of page.props) if (c === chain) return name;
    let base = toCamel(hintKey(step)) || `el${page.props.size}`;
    let name = base;
    let n = 2;
    while (page.props.has(name)) name = `${base}${n++}`;
    page.props.set(name, chain);
    return name;
  };

  for (const flow of script.flows) {
    const { steps, reasons } = flowEligibility(flow, reports, warnings);
    if (reasons.length > 0) {
      queued.push({ flow: flow.flow, reasons });
      continue;
    }
    if (steps.length === 0) {
      queued.push({ flow: flow.flow, reasons: ['flujo sin pasos emisibles'] });
      continue;
    }
    // un flujo roto (fixture irresoluble, dato malformado) se encola con su error,
    // nunca tumba el batch — misma política que las líneas rotas de resolve-bench
    try {
      emitOneFlow(flow, steps);
    } catch (err) {
      queued.push({ flow: flow.flow, reasons: [`emisión fallida: ${err instanceof Error ? err.message : String(err)}`] });
    }
  }

  function emitOneFlow(flow: WalkFlow, steps: EligibleStep[]): void {

    // pantalla por paso: el elemento sobre el que se actúa vive en la pantalla de
    // ORIGEN (la de ANTES del paso) — el report/step declaran la de DESTINO cuando
    // transicionan. Usar la de destino puso el botón Login en DashboardPage
    // (defecto cazado en el primer run de campo contra OrangeHRM).
    let currentScreen = domMap.screens[0]?.name ?? script.site_id;
    const screenOf: string[] = steps.map(({ step, report }) => {
      const pre = currentScreen;
      currentScreen = report.screen ?? step.screen ?? pre;
      return pre;
    });

    // el caso arranca en entry aunque el guion no lo declare (independencia del caso)
    const entryScreen = screenOf[0];
    const entryPage = pageFor(entryScreen);
    entryPage.hasGoto = true;

    // partición en runs de categoría → un test.step por run
    interface Block { title: string; lines: string[]; }
    const blocks: Block[] = [];
    let run: { cat: Category; items: Array<{ e: EligibleStep; screen: string }> } | null = null;
    const flushRun = (): void => {
      if (!run || run.items.length === 0) { run = null; return; }
      const { cat, items } = run;
      const first = items[0].e.step;
      const title =
        cat === 'setup'
          ? `Dado: la pantalla '${humanize(items[0].screen)}'`
          : cat === 'action'
            ? `Cuando: ${actionDesc(first)}${items.length > 1 ? ` y ${items.length - 1} acción(es) más` : ''}`
            : `Entonces: ${assertDesc(first)}${items.length > 1 ? ` (+${items.length - 1})` : ''}`;
      const lines: string[] = [];
      for (const { e } of items) lines.push(...stepLines(e));
      blocks.push({ title, lines });
      run = null;
    };

    const usedPages = new Map<string, string>(); // className → varName
    const varFor = (page: PageModel): string => {
      let v = usedPages.get(page.className);
      if (!v) {
        v = page.className.charAt(0).toLowerCase() + page.className.slice(1);
        usedPages.set(page.className, v);
      }
      return v;
    };

    const stepLines = (e: EligibleStep): string[] => {
      const { step, report, chain } = e;
      const idx = steps.indexOf(e);
      const screen = screenOf[idx];
      const lines: string[] = [];
      if (step.dialog) lines.push(`page.once('dialog', (d) => d.${step.dialog === 'accept' ? 'accept' : 'dismiss'}());`);

      const pom = chain ? `${varFor(pageFor(screen))}.${propFor(pageFor(screen), step, chain)}` : '';
      let value = '';
      if (step.value !== undefined && !step.secret) {
        value = `'${q(resolveFixtureRef(step.value, contract.synthetic_fixtures))}'`;
      } else if (step.secret) {
        const env = `QA_${script.site_id}_${hintKey(step)}`
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-zA-Z0-9]+/g, '_')
          .toUpperCase();
        requiredEnv.set(env, typeof step.value === 'string' ? step.value : 'synthetic_fixtures');
        /**
         * D43 — el secreto NO se incrusta (spec versionado), pero la ausencia de la
         * variable tiene que fallar diciendo QUE falta y DE DONDE sale. `process.env.X!`
         * producia «expected string, got undefined», que no ayuda a nadie.
         */
        value =
          `(process.env.${env} ?? (() => { throw new Error(` +
          `'falta la variable de entorno ${env}: es un secreto declarado (secret: true) y no se incrusta en el spec. ` +
          `Su valor lo declara el Style Contract (synthetic_fixtures); exportala antes de correr la suite. El emit-report lista la ruta exacta en required_env.'` +
          `); })())`;
      }

      switch (step.action) {
        case 'goto': {
          const target = gotoTarget(step.target ?? script.entry, script.base_url, (m) => warnings.push(m), `${flow.flow}/${step.id}`);
          lines.push(`await page.goto('${q(target)}');`);
          break;
        }
        case 'capture':
          break;
        case 'fill':
          lines.push(`await ${pom}.fill(${value});`);
          break;
        case 'click':
          lines.push(`await ${pom}.click();`);
          break;
        case 'hover':
          lines.push(`await ${pom}.hover();`);
          break;
        case 'select':
          lines.push(`await ${pom}.selectOption(${value});`);
          break;
        case 'check':
          lines.push(`await ${pom}.check();`);
          break;
        case 'uncheck':
          lines.push(`await ${pom}.uncheck();`);
          break;
        case 'press':
          lines.push(chain ? `await ${pom}.press('${q(step.value ?? '')}');` : `await page.keyboard.press('${q(step.value ?? '')}');`);
          break;
        case 'wait_url':
          lines.push(`await expect(page).toHaveURL(new RegExp('${q(step.target ?? '')}'));`);
          break;
        case 'wait_text':
        case 'expect_text': {
          if (report.matched_text && report.value_searched) {
            lines.push(`// texto completo observado: "${report.matched_text}" — el criterio pide "${report.value_searched}"`);
          }
          // .first(): la semántica de expect_text es PRESENCIA ("el texto aparece
          // visible"), no unicidad — sin él, un texto legítimamente repetido
          // (menú + breadcrumb) revienta en strict mode (rojo falso, campo OrangeHRM)
          lines.push(`await expect(page.getByText('${q(step.value ?? '')}').filter({ visible: true }).first()).toBeVisible();`);
          break;
        }
        case 'expect_state': {
          const matcher: Record<string, string> = {
            visible: 'toBeVisible()', enabled: 'toBeEnabled()', disabled: 'toBeDisabled()',
            checked: 'toBeChecked()', unchecked: 'not.toBeChecked()',
          };
          lines.push(`await expect(${pom}).${matcher[step.value ?? 'visible'] ?? 'toBeVisible()'};`);
          break;
        }
        case 'expect_value':
          lines.push(`await expect(${pom}).toHaveValue(${value});`);
          break;
        case 'expect_count': {
          const n = Number(step.value);
          if (step.operator === '=' || step.operator === undefined) {
            lines.push(`await expect(${pom}).toHaveCount(${n});`);
          } else {
            const poll: Record<string, string> = { '>': 'toBeGreaterThan', '>=': 'toBeGreaterThanOrEqual', '<': 'toBeLessThan' };
            lines.push(`await expect.poll(async () => ${pom}.count()).${poll[step.operator]}(${n});`);
          }
          break;
        }
      }
      if (step.expect_after) {
        lines.push(`await expect(page.getByText('${q(step.expect_after)}').filter({ visible: true }).first()).toBeVisible();`);
      }
      return lines;
    };

    // arranque: goto de entry si el primer paso no navega ya
    const startsWithGoto = steps[0].step.action === 'goto';
    if (!startsWithGoto) {
      blocks.push({
        title: `Dado: la pantalla '${humanize(entryScreen)}'`,
        lines: [`await ${varFor(entryPage)}.goto();`],
      });
    }

    for (let i = 0; i < steps.length; i++) {
      const cat = categoryOf(steps[i].step);
      if (!run || run.cat !== cat) {
        flushRun();
        run = { cat, items: [] };
      }
      run.items.push({ e: steps[i], screen: screenOf[i] });
    }
    flushRun();

    // step a11y en segunda posición, tras el bloque que contiene la navegación inicial
    if (contract.inject_axe) {
      blocks.splice(1, 0, { title: A11Y_STEP_TITLE, lines: a11yLines(contract) });
    }

    if (script.flows.some((f) => f !== flow && f.steps.length > 0) && !startsWithGoto) {
      warnings.push(
        `${flow.flow}: emitido como caso independiente desde entry — si depende del estado de un flujo previo, necesita precondición de sesión (v2)`,
      );
    }
    const selects = steps.filter((s) => s.step.action === 'select');
    if (selects.length > 0) {
      warnings.push(
        `${flow.flow}: ${selects.length} select emitido(s) como selectOption nativo — sobre fachada no nativa fallará en rojo (límite v1)`,
      );
    }

    // ensamblado del spec (golden de spec-template.md)
    const lastAssert = [...steps].reverse().find((s) => IS_ASSERT.has(s.step.action));
    const title = `${humanize(flow.flow).toLowerCase()} → ${lastAssert ? assertDesc(lastAssert.step) : 'el flujo completa'}`;
    const criterion = flow.criteria?.length
      ? `${flow.criteria.join(', ')} (walk-script: ${script.site_id})`
      : `${flow.flow} (walk-script: ${script.site_id})`;

    const pageImports = [...usedPages.keys()]
      .map((cls) => {
        const pg = [...pagesByScreen.values()].find((p) => p.className === cls)!;
        return `import { ${cls} } from '${importPrefix}${pg.file.replace(/\.ts$/, '')}';`;
      })
      .sort();

    const instances = [...usedPages.entries()].map(([cls, v]) => `const ${v} = new ${cls}(page);`);

    const useSteps = contract.evidence_level !== 'minimal';
    const attach = contract.evidence_level === 'full';
    const body: string[] = [];
    blocks.forEach((b, i) => {
      if (useSteps) {
        body.push(`await test.step('${q(b.title)}', async () => {`);
        for (const l of b.lines) body.push(`  ${l}`);
        if (attach) {
          const slug = b.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
          body.push(`  await test.info().attach('${slug}', { body: await page.screenshot(), contentType: 'image/png' });`);
        }
        body.push(`});`);
      } else {
        body.push(`// Paso ${i + 1}: ${b.title}`);
        body.push(...b.lines);
      }
      if (i < blocks.length - 1) body.push('');
    });

    const content = [
      `/**`,
      ` * @criterion ${criterion}`,
      ` * @generated-by walk-to-spec v1`,
      ` */`,
      `import { test, expect } from '@playwright/test';`,
      ...(contract.inject_axe ? [`import AxeBuilder from '@axe-core/playwright';`] : []),
      ...pageImports,
      ``,
      `test.describe('${q(humanize(flow.flow))}', () => {`,
      `  test('${q(title)}', async ({ page }) => {`,
      ...instances.map((l) => `    ${l}`),
      ``,
      ...body.map((l) => (l ? `    ${l}` : l)),
      `  });`,
      `});`,
      ``,
    ].join('\n');

    emitted.push({ flow: flow.flow, file: `${flow.flow}.spec.ts`, content });
  }

  const pages: EmittedPage[] = [...pagesByScreen.values()]
    .filter((p) => p.props.size > 0 || p.hasGoto)
    .map((p) => {
      const lines = [
        `import { type Locator, type Page } from '@playwright/test';`,
        ``,
        `/**`,
        ` * ${p.className} — pantalla '${p.screen}'. Emitido por walk-to-spec: cada locator`,
        ` * es el que la escalera del walker resolvió EN VIVO (resolved_via), no una convención.`,
        ` */`,
        `export class ${p.className} {`,
        ...[...p.props.keys()].map((name) => `  readonly ${name}: Locator;`),
        ``,
        `  constructor(private readonly page: Page) {`,
        ...[...p.props.entries()].map(([name, chain]) => `    this.${name} = page.${chainToCode(chain)};`),
        `  }`,
        ...(p.hasGoto
          ? [``, `  async goto(): Promise<void> {`, `    await this.page.goto('${q(gotoTarget(script.entry, script.base_url, (m) => warnings.push(m), `entry (${p.screen})`))}');`, `  }`]
          : []),
        `}`,
        ``,
      ];
      return { file: p.file, className: p.className, content: lines.join('\n') };
    });

  return {
    emitted,
    pages,
    queued,
    warnings,
    required_env: [...requiredEnv].map(([name, source]) => ({ name, source })),
  };
}

// ------------------------------------------------------------- CLI

function main(): void {
  const { values } = parseArgs({
    options: {
      'walk-script': { type: 'string' },
      'dom-map': { type: 'string' },
      'style-contract': { type: 'string' },
      'out-specs': { type: 'string' },
      'out-pages': { type: 'string' },
    },
  });
  const scriptPath = values['walk-script'];
  const domMapPath = values['dom-map'];
  if (!scriptPath || !domMapPath) {
    console.error('[walk-to-spec] uso: tsx copilot/src/walk-to-spec.ts --walk-script=<path> --dom-map=<path> [--style-contract=<path>] [--out-specs=<dir>] [--out-pages=<dir>]');
    process.exit(1);
  }
  const script = JSON.parse(readFileSync(resolve(process.cwd(), scriptPath), 'utf8')) as WalkScript;
  const domMap = JSON.parse(readFileSync(resolve(process.cwd(), domMapPath), 'utf8')) as DomMap;
  const contract = loadEmitContract(values['style-contract']);
  const outSpecs = resolve(process.cwd(), values['out-specs'] ?? `tests/e2e/${script.site_id}`);
  const outPages = resolve(process.cwd(), values['out-pages'] ?? `tests/pages/${script.site_id}`);

  const result = emitFromWalk(script, domMap, contract, { pagesImportPrefix: relImport(outSpecs, outPages) });

  mkdirSync(outSpecs, { recursive: true });
  mkdirSync(outPages, { recursive: true });
  for (const s of result.emitted) writeFileSync(join(outSpecs, s.file), s.content, 'utf8');
  for (const p of result.pages) writeFileSync(join(outPages, p.file), p.content, 'utf8');

  const report = {
    site_id: script.site_id,
    emitted: result.emitted.map((e) => ({ flow: e.flow, spec: `${values['out-specs'] ?? `tests/e2e/${script.site_id}`}/${e.file}` })),
    queued_for_writer: result.queued,
    required_env: result.required_env,
    warnings: result.warnings,
  };
  const reportPath = join(outSpecs, 'emit-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  for (const e of result.emitted) {
    appendAuditEntry({
      source: 'command', action: 'write_file', target: `${e.flow}.spec.ts`,
      rule: 'walk-to-spec', reason: 'spec emitido determinísticamente desde walk verificado ($0 tokens)', result: 'pass',
    });
  }
  for (const qf of result.queued) {
    appendAuditEntry({
      source: 'command', action: 'skip', target: qf.flow,
      rule: 'walk-to-spec', reason: `flujo a cola del Writer: ${qf.reasons.join(' · ')}`, result: 'fail',
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

function relImport(fromDir: string, toDir: string): string {
  const rel = relative(fromDir, toDir).replace(/\\/g, '/');
  if (!rel) return './';
  return rel.startsWith('.') ? `${rel}/` : `./${rel}/`;
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('walk-to-spec.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
