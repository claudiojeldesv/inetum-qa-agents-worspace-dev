/**
 * dom-walker — Acto 2 de la edición Copilot (S3): ejecuta el guion de pasos del
 * FD (walk-script.json, extraído por el refiner) contra el DOM vivo con
 * Playwright puro y emite dom-map.json. Camino feliz: 0 tokens.
 *
 * Requisitos duros (plan H1):
 *  (a) iframes: resolución y captura por-frame, frame_path en cada locator;
 *  (b) poda determinística (interactivos/landmarks, dedupe con count, cap por pantalla);
 *  (c) rescate LLM ACOTADO por handoff de archivos: paso irresoluble →
 *      rescue-request.json + exit 42 + checkpoint; el orquestador delega la
 *      micro-llamada (Haiku) y escribe rescue-response.json; re-ejecutar reanuda.
 *      Presupuesto por run (QA_RESCUE_BUDGET, default 3), contado y auditado.
 *      Agotado o fallido → paso bloqueado a open_questions. NUNCA adivinar.
 *  (d) waits/dialogs deterministas; "then" ambiguos no se resuelven — se anotan.
 *
 * Uso:
 *   tsx copilot/src/dom-walker.ts --script=<walk-script.json> --contract=<style.yaml> \
 *     [--base-url=<url>] [--work-dir=<dir>] [--rescue-budget=N] [--testid-attr=data-test] \
 *     [--cap=60] [--headed] [--assist] [--assist-timeout=600] [--no-minimize] \
 *     [--quiet-ms=400] [--settle-timeout=10000] [--max-mutations=2] \
 *     [--busy-selector=<sel> ...] [--timing-profile=<file>] [--no-calibrate] \
 *     [--from=<stepId>] [--to=<stepId>] [--step-delay=<ms>] [--capture-corpus=<dir>]
 *
 *   --from/--to acotan la ventana de pasos ejecutados (entry siempre corre). --to=<id>
 *   es la vía segura de llegar a una pantalla e iterar sin pasar de ella (p. ej. parar
 *   antes de "Finalizar"). --step-delay pausa entre pasos, tras el settle.
 *   --capture-corpus fotografía el DOM donde la escalera resolvió y emite casos para
 *   el banco (K0.32). OFF por defecto: una foto es HTML CRUDO de la pantalla.
 *
 * Escalera de resolución: determinístico → normalizador (acentos) → aliases del
 * cliente → ASISTIDO (--assist, $0, capta también la coreografía) → rescate LLM
 * (presupuesto) → open_questions. Nunca adivina.
 *
 * Sincronización (K0.13): ventana de quietud en vez de "el spinner ya no está"
 * (capa 2), postcondición del paso como ORÁCULO con reintento discriminado por
 * huella de pantalla (capa 3), y timeouts calibrados con el p95 observado en runs
 * anteriores (capa 4). El desenlace de cada paso se clasifica: `ok_after_retry` es
 * ruido de entorno, `postcondition_unmet` es candidato a drift. No son lo mismo.
 *
 * Exit codes: 0 ok · 1 error · 42 rescate pendiente (reanudar tras rescue-response.json)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { chromium, expect, type BrowserContext, type Frame, type Locator, type Page } from '@playwright/test';
import { appendAuditEntry } from '../../src/audit-log.ts';
import { proxyFromEnv } from '../../src/proxy-env.ts';
import {
  accentInsensitiveExactPattern,
  accentInsensitivePattern,
  aliasKey,
  assistStepsToWalkSteps,
  buildAssistSteps,
  buildFallbackCandidates,
  buildLocatorCandidates,
  calibratedTimeout,
  compareCount,
  consentSelector,
  corpusVerdict,
  CONSENT_ACCEPT,
  CONSENT_CLOSE,
  CONSENT_REJECT,
  dedupeAndPrune,
  effectiveDebounceMs,
  fingerprintHash,
  hashScript,
  pedidoDelPaso,
  textoAsistencia,
  hintLocatorPlan,
  isLandmarkRole,
  isRetrySafe,
  locatorSource,
  mergeSettle,
  normalizedPlan,
  normalizeText,
  recuperarGrabacion,
  type AssistMarker,
  parseJsonLoose,
  parseLocatorChain,
  pruneAriaSnapshot,
  attemptLlevaPalabras,
  describirElemento,
  esCampoEtiquetable,
  pruneAssistSequence,
  rescueInstructions,
  assistMarkerPayload,
  resolveFixtureRef,
  slugFromUrl,
  updateTimingProfile,
  validateWalkScript,
  aliasPromotionVerdict,
  type LocatorAttempt,
  urlEstable,
  primerSegmentoNoExpresable,
  debeReiniciarSesionAlReanudar,
  debeAislarFlujos,
  esEcoDelHint,
  resolveViewport,
  notaTextoOculto,
  type Viewport,
  puertaBloqueadaAntes,
  triajeDelBloqueo,
} from './walk-core.ts';
// el marcador de peldaños (K0.27a) ya sabe leer una cadena de locator: reimplementar
// esa clasificación aquí sería tener dos verdades sobre qué peldaño resolvió el paso
import { classifyVia } from './walk-scoreboard.ts';
import { candidatosParaInforme, pedidoSinPalabrasUtiles, resultadosOrdenados } from '../../src/locator-candidates.ts';
import {
  appendDecision,
  claveDecision,
  decisionsPathFor,
  effectiveDecisions,
  huellaDeArtefacto,
  normalizeActor,
  parseDecisions,
  verifyChain,
} from '../../src/decisions.ts';
import { anclarDecisionEnAudit } from '../../src/decisions-audit.ts';
import {
  causaCaminoRoto,
  faltaParaFirmar,
  motivoConVeredicto,
  motivoSinVeredicto,
  rompeElCamino,
  porQueNoSeAbre,
  veredictoADecision,
  pararRelojes,
  type Relojes,
  type VerdictSubmission,
} from './walk-verdict.ts';
import {
  EXIT_ERROR,
  EXIT_OK,
  EXIT_RESCUE_NEEDED,
  type AssistPatch,
  type AssistPatchStep,
  type AssistSubmission,
  type DomElement,
  type DomForm,
  type DomMap,
  type DomScreen,
  type DomTable,
  type HintAliasFile,
  type LocatorCandidate,
  type PickedElement,
  type RescueRequest,
  type RescueResponse,
  type SettleObservation,
  type SettleProfile,
  type StepHint,
  type StepOutcome,
  type StepReport,
  type TimingProfile,
  type WalkAction,
  type WalkFlow,
  type WalkScript,
  type WalkState,
  type WalkStep,
} from './walk-types.ts';

// ------------------------------------------------------------------ config

const TESTID_ATTR_CANDIDATES = ['data-test', 'data-testid', 'data-test-id', 'data-cy', 'data-qa'];
const STEP_TIMEOUT_MS = 10_000;
const GOTO_TIMEOUT_MS = 30_000;
/** Espera del oráculo de postcondición: la pantalla ya está estable (K0.13 capa 3). */
const ORACLE_TIMEOUT_MS = 1_500;
/** Fase 4 — tope por defecto de `scroll_until` cuando el paso no declara `max_steps`. */
const DEFAULT_SCROLL_MAX_STEPS = 40;
/**
 * K0.28 — acciones a las que se les aplica el tier ANCLADO (K0.19). El tier
 * trepa de una etiqueta visible al control que etiqueta, así que solo tiene
 * sentido cuando el paso opera sobre un CONTROL. `click`/`hover` quedan fuera:
 * su objetivo puede ser un enlace, un botón o una fila, y saltar de la palabra
 * al siguiente input es adivinar (medido: en tufarmacia clicó un campo ajeno).
 * `expect_state` fuera: su hint puede apuntar a cualquier cosa (un botón, una
 * fila), y ahí un puente equivocado no falla, MIENTE — da un veredicto sobre
 * otro elemento. `expect_value` sí entra (K0.30): su objetivo es por definición
 * un control con valor, exactamente la pregunta que el tier sabe contestar.
 */
const ANCHORED_ACTIONS = new Set<WalkAction>(['fill', 'select', 'check', 'uncheck', 'press', 'expect_value']);
/** Pasos que solo COMPRUEBAN: no tocan la aplicación, solo juzgan lo que hay (K0.39). */
const ASSERTION_ACTIONS = new Set<WalkAction>([
  'expect_text',
  'expect_state',
  'expect_value',
  'expect_count',
  'expect_each',
]);

interface WalkerOptions {
  scriptPath: string;
  contractPath: string;
  baseUrl?: string;
  workDir: string;
  rescueBudget: number;
  testidAttr?: string;
  screenCap: number;
  headed: boolean;
  storageState?: string;
  /** hint-aliases durable del sitio (K0.5). Default: config/hint-aliases/<site_id>.json */
  aliasesPath?: string;
  /** Modo asistido (K0.10): panel Record en el navegador cuando un hint no resuelve. */
  assist: boolean;
  assistTimeoutMs: number;
  /** Minimizar el parche por replay (K0.11e). Off con --no-minimize. */
  assistMinimize: boolean;
  /**
   * Fase B — lo que hace falta para poder FIRMAR un veredicto del QA sobre una
   * postcondición incumplida. Los tres son fail-closed: sin ellos el panel de
   * veredicto no se abre y el paso se bloquea como siempre. No se inventan defaults
   * (D45): una decisión de auditoría con un actor o un criterio fabricados no vale
   * nada, y firmar contra un FD desconocido tampoco.
   */
  actor?: string;
  /** Huella del FD contra el que se decide, o 'sin-fd' declarado (modo S4). */
  fdHash?: string;
  /** Criterio explícito, para flujos que no declaran exactamente uno. */
  rf?: string;
  /** Acta del sitio. Default `config/decisions/<site_id>.jsonl`, como los hint-aliases. */
  decisionsPath?: string;
  /** Override global de settle por CLI/env (K0.13). Pisa contract y script, no el paso. */
  settleOverride?: SettleProfile;
  /** D71 — viewport EFECTIVO del run (null = default de Playwright, sin declarar). */
  viewport?: Viewport | null;
  /** Perfil de tiempos durable. Default config/timing-profiles/<site_id>.json */
  timingProfilePath?: string;
  /** Calibrar timeouts con lo observado en runs anteriores. Off con --no-calibrate. */
  calibrate: boolean;
  /**
   * Ventana de pasos (K0.24): ejecuta solo el rango [fromStep..toStep] de cada flujo.
   * `toStep` es la vía SEGURA de llegar a una pantalla e iterar sin pasar de ella
   * (p. ej. parar antes de "Finalizar"). `fromStep` salta los previos ASUMIENDO que
   * el estado ya está en esa pantalla (el navegador nuevo arranca en `entry`: en apps
   * con sesión server-side sin deep-link no aterrizará solo, para eso está `toStep`).
   */
  fromStep?: string;
  toStep?: string;
  /** Pausa fija entre pasos, TRAS el settle (K0.24). Ritmo/observabilidad, no sync. Default 0. */
  stepDelayMs?: number;
  /**
   * K0.32 — directorio donde volcar el CORPUS del banco (fotos del DOM + casos
   * con verdad anotada). Presencia = activado; ausencia = no se captura nada.
   *
   * OFF por defecto, y no por comodidad: una foto del DOM es el HTML CRUDO de
   * la pantalla, con los datos que hubiera dentro. Contra un entorno con datos
   * reales eso es una decisión del QA, no un efecto colateral de correr el
   * walker (regla dura #6 del proyecto).
   */
  corpusDir?: string;
}

interface StyleContract {
  locators?: { priority?: string[] };
  synthetic_fixtures?: Record<string, unknown>;
  /** Señales de ocupado y ventana de quietud del sitio (K0.13) — home del client pack. */
  settle?: SettleProfile;
  /**
   * Fase 2 (SPEC-caos-corporativo §4) — estorbos que la ventana de quietud NO
   * puede ver por diseño (el DOM está quieto, el overlay solo está ENCIMA
   * interceptando el puntero: backdrop fantasma, snackbar, banner de cookies).
   * OFF por defecto: sin selectores declarados aquí, un estorbo no descrito
   * bloquea el paso con el motivo de Playwright — nunca se barre en silencio.
   * Cada descarte es auditado (`phase: 'obstruction-dismiss'`).
   */
  obstructions?: { dismiss?: string[] };
  /**
   * K0.30 — consentimiento. ON por diseño: el banner de cookies sale en la
   * mayoría de los portales corporativos y no tiene sentido que cada client pack
   * lo redescubra. `enabled: false` lo apaga (p. ej. cuando el propio banner ES
   * el objeto de la prueba); `extra_selectors` añade el CMP casero que no esté
   * en el catálogo de familias. El walker NUNCA pulsa "aceptar", con knob o sin él.
   */
  consent?: { enabled?: boolean; extra_selectors?: string[] };
}

// ------------------------------------------------- captura in-page (frame)

interface RawElement {
  role: string;
  name?: string;
  test_id?: string;
  test_attr?: string;
  label?: string;
  disabled?: boolean;
  landmark?: boolean;
  formIndex?: number;
  /** Texto de resultado no interactivo (heading/alert/status) — K0.3. */
  business?: boolean;
  /** El elemento vive dentro de un role=dialog abierto — K0.3 (sub-pantalla). */
  inDialog?: boolean;
  /** Fallback por atributo declarado, ya comprobado UNICO y visible en la pagina. */
  css_attr?: { attr: string; value: string };
}

/** Marcador del host del panel asistido: la captura lo salta (K0.10). */
const ASSIST_HOST_ATTR = 'data-qa-assist-host';

/**
 * K0.44 (D10) — cada cuánto se comprueba que el panel SIGUE en pantalla.
 *
 * El panel se inyecta con `page.evaluate` sobre el documento actual y NO sobrevive
 * a una navegación (los puentes de `exposeFunction` sí, ver ensureAssistBridge).
 * Los puentes vivos y la interfaz muerta es la peor combinación posible: la espera
 * solo puede resolverla una pulsación dentro de un panel que ya no existe, así que
 * el walker se quedaba plantado el timeout ENTERO (600 s por defecto) sin decir
 * nada. Medido en campo: el QA demostró el paso pulsando el enlace de logout, la
 * navegación se llevó el panel por delante, y hubo que abortar el run.
 *
 * El panel NO se retira solo al enviar (lo cierra el walker, para que el QA vea el
 * resultado de la verificación), así que "el host no está" significa exactamente
 * una cosa: el panel murió. No hay carrera con el envío.
 */
const ASSIST_WATCHDOG_MS = 500;

/**
 * Re-inyecciones permitidas antes de rendirse. Acotado a propósito: sin tope, una
 * página que redirige sola dejaría al QA en un bucle infinito de paneles.
 */
const ASSIST_MAX_REINJECTIONS = 3;

/**
 * Cuántas veces se le puede devolver el panel al QA porque su veredicto no era una
 * decisión (un «la aplicación tiene razón» sin decir qué dice, por ejemplo). Acotado
 * porque el bucle vive con un navegador abierto y una persona delante: si a la
 * tercera sigue sin salir, algo va mal en la pregunta, no en la respuesta.
 */
const VERDICT_MAX_RECHAZOS = 3;

/**
 * Helpers de extracción in-page, COMPARTIDOS por la captura del dom-map y el
 * overlay del modo asistido (K0.10b). Deliberadamente un único fragmento: si el
 * picker extrajera los campos con otro código, el locator que propone al QA no
 * coincidiría con el que el dom-map registra para el mismo elemento — divergencia
 * silenciosa y muy difícil de diagnosticar.
 *
 * Expone: clean, isVisible, nameOf, labelOf, roleOf, fieldsOf, ATTRS,
 * BUSINESS_ROLES, LANDMARK_ROLES_JS.
 */
function extractionHelpers(testidAttrs: string[], cssFallbackAttrs: string[] = []): string {
  return `
    const ATTRS = ${JSON.stringify(testidAttrs)};
    const CSS_FALLBACK_ATTRS = ${JSON.stringify(cssFallbackAttrs)};
    const ASSIST_HOST = '${ASSIST_HOST_ATTR}';
    // h1..h6 son TODOS 'heading' en ARIA. Faltaban h4-h6 y no era teorico: los rotulos
    // de OrangeHRM son h5/h6, asi que su cubo de texto de negocio salia VACIO y el
    // panel llegaba a afirmar "esta pantalla no muestra ningun resultado" sobre una
    // pantalla con dos titulos. Medido el 2026-08-24 montando el ejercicio del panel.
    const ROLE_BY_TAG = { a: 'link', button: 'button', select: 'combobox', textarea: 'textbox', nav: 'navigation', main: 'main', header: 'banner', footer: 'contentinfo', form: 'form', dialog: 'dialog', summary: 'button', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading' };
    const BUSINESS_ROLES = ['heading', 'alert', 'status'];
    const LANDMARK_ROLES_JS = ['navigation', 'banner', 'main', 'contentinfo', 'search', 'form', 'region'];
    const INPUT_ROLE = { checkbox: 'checkbox', radio: 'radio', submit: 'button', button: 'button', reset: 'button', search: 'searchbox', number: 'spinbutton', range: 'slider' };
    const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
    const NO_TEXT_NAME = ['select', 'textarea', 'nav', 'main', 'header', 'footer', 'form', 'dialog'];
    const isVisible = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
    const nameOf = (el) => {
      const aria = el.getAttribute('aria-label'); if (aria) return clean(aria);
      const lb = el.getAttribute('aria-labelledby');
      if (lb) { const t = lb.split(/\\s+/).map((id) => { const n = document.getElementById(id); return n ? n.textContent : ''; }).join(' '); if (clean(t)) return clean(t); }
      if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) return clean(l.textContent); }
      const pl = el.closest('label'); if (pl) return clean(pl.textContent);
      const tag = el.tagName.toLowerCase();
      if (tag === 'input') { if (el.type === 'submit' || el.type === 'button') return clean(el.value); return clean(el.getAttribute('placeholder') || el.getAttribute('title') || ''); }
      if (tag === 'img') return clean(el.getAttribute('alt') || '');
      // contenedores y selects: textContent concatena hijos/options — no es un accessible name útil
      if (NO_TEXT_NAME.includes(tag) || el.getAttribute('role')) {
        const roleAttr = el.getAttribute('role');
        if (NO_TEXT_NAME.includes(tag) && !roleAttr) return '';
        if (roleAttr && ['navigation','banner','main','contentinfo','form','region','dialog','listbox','combobox'].includes(roleAttr)) return '';
      }
      return clean(el.textContent);
    };
    const labelOf = (el) => {
      if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) return clean(l.textContent); }
      const pl = el.closest('label'); if (pl) return clean(pl.textContent);
      return undefined;
    };
    const roleOf = (el) => {
      const explicit = el.getAttribute('role'); if (explicit) return explicit.split(/\\s+/)[0];
      const tag = el.tagName.toLowerCase();
      if (tag === 'input') return INPUT_ROLE[el.type] || 'textbox';
      if (tag === 'a') return el.hasAttribute('href') ? 'link' : 'generic';
      return ROLE_BY_TAG[tag] || 'generic';
    };
    /** Campos de identidad de UN elemento — la unidad que comparten capture y assist. */
    const fieldsOf = (el) => {
      const role = roleOf(el);
      const out = { role };
      const nm = nameOf(el); if (nm) out.name = nm;
      for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { out.test_id = v; out.test_attr = a; break; } }
      const lab = labelOf(el); if (lab && lab !== nm) out.label = lab;
      /**
       * Fallback por atributo declarado (whitelist del contract). SOLO para el
       * elemento sin identidad semántica ninguna: si tiene test-id, nombre o label,
       * hay locator semántico y el CSS sobra.
       *
       * La unicidad se mide AQUÍ, dentro de la página, contra los elementos
       * VISIBLES — la misma garantia que exige derivarEmitLocator, y por el mismo
       * motivo: un "name" repetido (radios, filas de tabla) produciria un candidato
       * que resuelve a varios y un POM que revienta en strict mode la primera vez.
       * Hacerlo en el extractor y no desde Node ahorra un viaje de red por elemento.
       */
      if (!out.test_id && !out.name && !out.label && CSS_FALLBACK_ATTRS.length) {
        for (const a of CSS_FALLBACK_ATTRS) {
          const v = el.getAttribute(a);
          if (!v || /["\\\\]/.test(v)) continue;          // un valor con comillas rompe el selector
          if (a === 'id' && looksGenerated(v)) continue;  // un id de framework no es identidad
          let n = 0;
          for (const c of document.querySelectorAll('[' + a + '="' + v + '"]')) if (isVisible(c)) n++;
          if (n !== 1) continue;
          out.css_attr = { attr: a, value: v };
          break;
        }
      }
      return out;
    };

    // ---- contexto de fallback (K0.11b). Solo lo usa el modo asistido: cuando el
    // elemento NO tiene identidad semántica (input sin name/label/test-id, la norma
    // en formularios Java corporativos) esto es lo único que permite construir un
    // locator en vez de rendirse tras el trabajo del humano.
    const ANCHOR_ROLES = ['region','form','dialog','navigation','main','table','row','group','tabpanel','article'];
    const looksGenerated = (id) => !id || /^:.+:$/.test(id) || /ng-tns-|ng-reflect-|cdk-|mat-\\d/.test(id)
      || /[-_]\\d{2,}$/.test(id) || /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(id) || /^[a-z]{1,3}\\d{3,}$/i.test(id) || /^\\d/.test(id);
    /** Ancestro más cercano con rol de contenedor Y nombre accesible. */
    /**
     * Posicion del ancla entre los VISIBLES de su mismo rol, en orden de documento.
     * D63 — el "name" de un contenedor no siempre es un nombre accesible que
     * Playwright acepte (para un role=row devolvemos su textContent y
     * getByRole con ese name da CERO), asi que hace falta un ancla estructural de
     * respaldo. Se acota el barrido a los sospechosos habituales de ser contenedor.
     */
    const nthDelAncla = (nodo, rol) => {
      const todos = document.querySelectorAll('[role], table, tr, form, dialog, nav, main, article, section, ul, ol, li');
      let i = 0;
      for (const c of todos) {
        if (roleOf(c) !== rol || !isVisible(c)) continue;
        if (c === nodo) return i;
        i++;
      }
      return undefined;
    };
    const anchorOf = (el) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const r = roleOf(p);
        if (ANCHOR_ROLES.includes(r)) {
          const n = nameOf(p);
          if (n) {
            const nth = nthDelAncla(p, r);
            return nth === undefined ? { role: r, name: n } : { role: r, name: n, nth };
          }
        }
        p = p.parentElement;
      }
      return undefined;
    };
    /** Texto previo más cercano: la etiqueta en la celda/hermano de al lado. */
    const nearbyTextOf = (el) => {
      const cell = el.closest('td, th, li, div');
      if (cell) {
        const prev = cell.previousElementSibling;
        if (prev) { const t = clean(prev.textContent); if (t && t.length <= 60) return t; }
      }
      let sib = el.previousElementSibling;
      while (sib) {
        const t = clean(sib.textContent);
        if (t && t.length <= 60 && !sib.querySelector('input, select, textarea, button')) return t;
        sib = sib.previousElementSibling;
      }
      const row = el.closest('tr');
      if (row) { const t = clean(row.textContent); if (t && t.length <= 60) return t; }
      return undefined;
    };
    /** Índice del elemento entre los de su mismo rol dentro del ancla (o del doc). */
    const nthOfRole = (el, anchorEl) => {
      const scope = anchorEl || document;
      const role = roleOf(el);
      const all = Array.from(scope.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role]'))
        .filter((c) => roleOf(c) === role && isVisible(c));
      const i = all.indexOf(el);
      return i >= 0 ? i : undefined;
    };
    /** fieldsOf + todo el contexto de fallback. */
    const fieldsWithContext = (el) => {
      const out = fieldsOf(el);
      let anchorEl = el.parentElement;
      while (anchorEl && anchorEl !== document.body && !ANCHOR_ROLES.includes(roleOf(anchorEl))) anchorEl = anchorEl.parentElement;
      const a = anchorOf(el); if (a) out.anchor = a;
      const nt = nearbyTextOf(el); if (nt && nt !== out.name && nt !== out.label) out.nearby_text = nt;
      const n = nthOfRole(el, anchorEl && anchorEl !== document.body ? anchorEl : null);
      if (typeof n === 'number') out.nth_of_role = n;
      if (el.id) { out.dom_id = el.id; out.id_stable = !looksGenerated(el.id); }
      return out;
    };
  `;
}

/** Corre DENTRO del frame. Aproximación determinística de rol + accessible name. */
function captureScript(testidAttrs: string[], cssFallbackAttrs: string[] = []): string {
  // Serializado como string para frame.evaluate — sin closures externas.
  return `(() => {
    ${extractionHelpers(testidAttrs, cssFallbackAttrs)}
    const forms = Array.from(document.querySelectorAll('form'));
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role], nav, main, header, footer, form, h1, h2, h3, h4, h5, h6';
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      if (!isVisible(el)) continue;
      // el panel del modo asistido no es parte de la app (K0.10): jamás al dom-map
      if (el.closest('[' + ASSIST_HOST + ']')) continue;
      const role = roleOf(el);
      if (role === 'generic' || role === 'presentation' || role === 'none') continue;
      const landmark = LANDMARK_ROLES_JS.includes(role);
      const item = { role, landmark };
      // K0.3: headings/alerts/status = postcondiciones de negocio (texto no interactivo)
      if (BUSINESS_ROLES.includes(role)) {
        const txt = clean(el.textContent);
        if (!txt) continue;
        item.business = true;
        item.name = txt;
      }
      const f2 = fieldsOf(el);
      if (!item.name && f2.name) item.name = f2.name;
      if (f2.test_id) { item.test_id = f2.test_id; item.test_attr = f2.test_attr; }
      if (f2.label && f2.label !== item.name) item.label = f2.label;
      if (f2.css_attr) item.css_attr = f2.css_attr;
      if (el.disabled === true) item.disabled = true;
      const f = el.closest('form'); if (f) item.formIndex = forms.indexOf(f);
      if (el.closest('[role=dialog], dialog[open]')) item.inDialog = true;
      out.push(item);
    }
    return out;
  })()`;
}

// -------------------------------------- overlay del modo asistido (K0.10c)

// ----------------------------------------------------- P3: posturas del panel

/** Preferencias del panel, POR SITIO (`config/panel-prefs/<site>.json`): postura
 * y posición. Durables como los hint-aliases y por la misma razón — son del QA
 * sobre este sitio, no de un run. */
export interface PanelPrefs {
  postura?: 'normal' | 'barra' | 'fantasma';
  left?: string | null;
  top?: string | null;
}

/** Una marca de la tira de pasos: el caso entero de un vistazo. */
export interface MarcaDeTira {
  id: string;
  e: 'hecho' | 'aqui' | 'nocuadra' | 'pend';
}

export interface P3Opts {
  prefs?: PanelPrefs;
  tira?: MarcaDeTira[];
}

/** CSS de las posturas y la tira — UNO para los dos paneles (familia D2: si cada
 * panel llevara su copia, derivarían). `.post` va con float para no tocar el
 * layout existente de `.h`. */
const POSTURAS_CSS = `
        .post{float:right;display:inline-flex;gap:4px;margin-left:8px}
        .post button{padding:0 6px;font-size:11px;line-height:16px;background:#1f2937;border:1px solid #4b5563;color:#9ca3af;border-radius:3px;cursor:pointer}
        .post button.on{background:#4b5563;color:#f9fafb}
        .p.barra .b,.p.barra .tira{display:none}
        .p.fantasma{opacity:.35}
        .tira{display:flex;gap:3px;margin-top:4px}
        .tira i{width:10px;height:10px;border-radius:2px;display:inline-block}
        .tira i.hecho{background:#059669}
        .tira i.aqui{background:#2563eb;box-shadow:0 0 0 1px #93c5fd}
        .tira i.nocuadra{background:#b91c1c}
        .tira i.pend{background:#374151}`;

/** Botones de postura para la cabecera. `─` colapsa a barra; `◌` fantasma. */
const POSTURAS_HTML = `<span class="post"><button id="po-b" title="Colapsar a barra (Alt+P alterna posturas)">─</button><button id="po-f" title="Modo fantasma: se ve, no estorba (Alt+P alterna)">◌</button></span>`;

/**
 * El comportamiento de las posturas, compartido por los dos paneles. Requiere en
 * scope: `host`, `root`. Reglas que no son cosmética:
 *  - **fantasma** = opacidad baja Y transparente a los clics (el QA trabaja con
 *    la app detrás); la CABECERA queda viva para volver — sin eso, el fantasma
 *    sería una trampa sin salida;
 *  - **Escape jamás toca el panel**: el QA lo usa para cerrar modales de la app
 *    y el manejador de cookies también lo pulsa. El atajo es Alt+P, que alterna
 *    normal → barra → fantasma;
 *  - cada cambio (postura o arrastre) se informa a Node por `__qaPanelPrefs`,
 *    que lo hace durable POR SITIO.
 */
function posturasScript(p3?: P3Opts): string {
  return `
    const P3 = ${JSON.stringify({ prefs: p3?.prefs ?? {}, tira: p3?.tira ?? [] })};
    (() => {
      const tiraEl = root.querySelector('.tira');
      if (tiraEl) {
        if (!P3.tira.length) { tiraEl.style.display = 'none'; }
        const rotulo = { hecho: 'hecho', aqui: 'aquí', nocuadra: 'no cuadra', pend: 'pendiente' };
        for (const m of P3.tira) {
          const i = document.createElement('i');
          i.className = m.e;
          i.title = m.id + ' — ' + rotulo[m.e];
          tiraEl.appendChild(i);
        }
      }
      if (P3.prefs.left) { host.style.left = P3.prefs.left; host.style.right = 'auto'; }
      if (P3.prefs.top) { host.style.top = P3.prefs.top; }
      let postura = P3.prefs.postura || 'normal';
      const caja = root.querySelector('.p');
      const reportar = () => {
        try { window.__qaPanelPrefs && window.__qaPanelPrefs({ postura, left: host.style.left || null, top: host.style.top || null }); } catch (e) {}
      };
      const aplicar = () => {
        caja.classList.toggle('barra', postura === 'barra');
        caja.classList.toggle('fantasma', postura === 'fantasma');
        // fantasma: el host deja pasar los clics y la cabecera se re-arma sola.
        // Tras la entrega el walker apaga el host (D64); la ventana en que un
        // Alt+P podría re-armarlo dura lo que el panel tarda en cerrarse solo.
        host.style.pointerEvents = postura === 'fantasma' ? 'none' : '';
        const h = root.querySelector('.h'); if (h) h.style.pointerEvents = 'auto';
        const pb = root.getElementById('po-b'), pf = root.getElementById('po-f');
        if (pb) pb.className = postura === 'barra' ? 'on' : '';
        if (pf) pf.className = postura === 'fantasma' ? 'on' : '';
      };
      window.__qaPostura = (p) => { postura = p; aplicar(); reportar(); };
      window.__qaPanelMovido = reportar;
      const pb = root.getElementById('po-b'), pf = root.getElementById('po-f');
      if (pb) pb.onclick = (e) => { e.stopPropagation(); window.__qaPostura(postura === 'barra' ? 'normal' : 'barra'); };
      if (pf) pf.onclick = (e) => { e.stopPropagation(); window.__qaPostura(postura === 'fantasma' ? 'normal' : 'fantasma'); };
      document.addEventListener('keydown', (e) => {
        if (!e.altKey || (e.key !== 'p' && e.key !== 'P')) return;
        window.__qaPostura(postura === 'normal' ? 'barra' : postura === 'barra' ? 'fantasma' : 'normal');
      }, true);
      aplicar();
    })();`;
}

/** Los comandos de postura del canal \`qa-assist-cmd\` — mismos en ambos paneles. */
const POSTURAS_CMD = `
      if (cmd === 'postura-barra') { window.__qaPostura && window.__qaPostura('barra'); return; }
      if (cmd === 'postura-fantasma') { window.__qaPostura && window.__qaPostura('fantasma'); return; }
      if (cmd === 'postura-normal') { window.__qaPostura && window.__qaPostura('normal'); return; }`;

/**
 * Panel de asistencia inyectado en la página de la app. Vive en un **shadow root
 * cerrado** con el marcador `data-qa-assist-host` por dos razones:
 *  1. el CSS de la app no puede romperlo ni él filtrarse a la app;
 *  2. la captura del dom-map lo salta — si no, los botones del panel acabarían
 *     como elementos de la app en el dom-map y en los POMs generados.
 *
 * Modelo Record: los clicks del QA **pasan a la app** (así navega y abre menús) y
 * se van registrando. Al pulsar Parar, el último click es el objetivo del paso y
 * lo anterior es el camino. Los hovers sostenidos (>400 ms) se registran porque el
 * abridor de un menú hover no genera click — el hueco que el recorder de Playwright
 * no cubre (issues microsoft/playwright#5177, #5481).
 *
 * `mutating` (K0.14): el paso NO es reintentable, o sea que su acción cambia estado
 * de negocio. El panel lo dice y ofrece "Capturar sin ejecutar" como salida, porque
 * capturar el locator de un "Finalizar" no puede costar una declaración real.
 */
function assistOverlayScript(
  testidAttrs: string[],
  step: WalkStep,
  hintText: string,
  mutating = false,
  /**
   * D10/D23 — secuencia con la que NACE el panel: lo conservado a través de una
   * navegación que lo destruyó, o lo recuperado de una sesión que alguien mató. Los
   * elementos vienen serializados desde Node, así que no traen su nodo del DOM: la
   * lista los muestra y se pueden quitar, pero el resaltado al pasar el ratón solo
   * funciona sobre los que se señalen en ESTA vida del panel. Se dice en la interfaz.
   */
  grabado: PickedElement[] = [],
  p3?: P3Opts,
): string {
  return `(() => {
    ${extractionHelpers(testidAttrs)}
    const prev = document.querySelector('[' + ASSIST_HOST + ']');
    if (prev) prev.remove();
    const host = document.createElement('div');
    host.setAttribute(ASSIST_HOST, '1');
    host.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;';
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = \`
      <style>
        .p{font:13px/1.45 system-ui,sans-serif;background:#111827;color:#f9fafb;border:1px solid #374151;
           border-radius:8px;width:390px;box-shadow:0 6px 24px rgba(0,0,0,.4);overflow:hidden}
        .h{padding:8px 10px;background:#1f2937;cursor:move;font-weight:500;display:flex;justify-content:space-between}
        .b{padding:10px}
        .ctx{color:#9ca3af;margin-bottom:8px}
        .ctx .ref{color:#6b7280;font-size:11px}
        .ctx .dx{margin-top:5px;color:#e5e7eb;white-space:pre-line}
        .ctx b{color:#f9fafb}
        .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
        button{font:12px system-ui;padding:5px 9px;border-radius:5px;border:1px solid #4b5563;
               background:#374151;color:#f9fafb;cursor:pointer}
        button:hover{background:#4b5563}
        button:disabled{opacity:.45;cursor:default}
        .rec{background:#065f46;border-color:#047857}
        .stop{background:#7f1d1d;border-color:#991b1b}
        .drift{background:#78350f;border-color:#92400e}
        .safe{background:#1e3a8a;border-color:#2563eb}
        .mut{margin-bottom:8px;padding:6px 8px;border-radius:5px;background:#78350f;color:#fed7aa;font-size:12px}
        .mut code{background:rgba(0,0,0,.25);padding:0 3px;border-radius:3px}
        ul{list-style:none;margin:8px 0 0;padding:0;color:#d1d5db;max-height:190px;overflow:auto}
        li{display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:4px;margin:1px 0;cursor:default}
        li:hover{background:#1f2937}
        li .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        li .via{color:#6b7280;font-size:11px;min-width:38px}
        li .q{font-size:10px;padding:1px 5px;border-radius:3px;background:#374151;color:#9ca3af}
        li .q.bad{background:#7f1d1d;color:#fecaca}
        li .q.warn{background:#78350f;color:#fed7aa}
        li.tgt{background:#064e3b;outline:1px solid #059669}
        li.asr{background:#1e3a5f;outline:1px solid #2563eb}
        li button{padding:1px 5px;font-size:11px}
        .st{margin-top:6px;color:#9ca3af;font-size:11px}
        .warn{color:#fca5a5}${POSTURAS_CSS}
      </style>
      <div class="p">
        <div class="h"><span>Asistencia QA</span><span id="s">esperando</span>${POSTURAS_HTML}</div>
        <div class="tira"></div>
        <div class="b">
          <div class="ctx"><b>Necesito que me eches una mano.</b> <span class="ref">paso \${'${step.id}'}</span><div class="dx">\${${JSON.stringify(
            // K0.44 — se embebe con JSON.stringify y no como literal entrecomillado a
            // mano: el escapado manual cubría la comilla y el '<' pero NO el salto de
            // línea, y un motivo multilínea reventaba el panel entero con
            // "SyntaxError: Invalid or unexpected token" — o sea, sin panel y sin
            // saber por qué. Lo cazó el aviso de panel perdido de D10, que es el
            // primer motivo de varias líneas que existe.
            hintText.replace(/</g, '&lt;').replace(/\n/g, '<br>'),
          )}}</div></div>
          ${
            mutating
              ? `<div class="mut">Ojo: este paso hace algo de verdad en la aplicación y no se puede
                 repetir sin consecuencias. <b>No pulses el elemento</b>: pasa el ratón por encima
                 un segundo y márcalo con <b>&#9678;</b>. Si prefieres capturarlo sin dispararlo,
                 usa <b>Capturar sin ejecutar</b>.</div>`
              : ''
          }
          <div class="st" id="hint">Explora libre con la grabación PARADA. Cuando sepas el camino, pulsa Grabar y hazlo del tirón.</div>
          <ul id="l"></ul>
          <div class="row">
            <button id="r" class="rec">Grabar</button>
            <button id="p" disabled>Pausa</button>
            <button id="c" disabled>Limpiar</button>
            <button id="t" class="stop" disabled>Parar</button>
          </div>
          <div class="row">
            <button id="x" class="${mutating ? 'safe' : ''}" disabled>Capturar sin ejecutar</button>
          </div>
          <div class="row">
            <button id="d" class="drift">No existe aquí</button>
            <button id="b">Bloquear paso</button>
          </div>
        </div>
      </div>\`;
    const $ = (id) => root.getElementById(id);
    const list = $('l'), status = $('s'), hintBox = $('hint');
    let recording = false;
    // D10/D23: el panel nace con lo ya grabado. \`nodes\` va en paralelo y arranca
    // vacío para los recuperados (no hay nodo del DOM al que apuntar tras navegar).
    const seq = ${JSON.stringify(grabado)};
    const nodes = seq.map(() => null);
    // D10/D23: cada cambio de la secuencia sale de la página por el puente, que
    // sobrevive a la navegación. Si el puente no está (paneles de test), no pasa nada.
    const track = () => { try { window.__qaAssistTrack && window.__qaAssistTrack(seq.map((s) => { const c = Object.assign({}, s); delete c._q; delete c._editErr; return c; })); } catch (e) {} };
    let hoverTimer = null, hoverEl = null;
    let hl = null;        // caja de resaltado
    let repick = null;    // K0.20-B: índice de la fila que se está re-capturando
    let editing = -1;     // K0.20-A: índice de la fila cuyo locator se edita a mano

    // K0.20-A: aplica un locator tecleado por el QA, validándolo en vivo contra el DOM
    const applyManual = async (i, value) => {
      let res;
      try { res = await window.__qaAssistResolve(value); } catch (e) { res = { ok: false, count: 0 }; }
      if (res && res.ok) {
        seq[i].manual_locator = value;
        seq[i]._q = { ok: true, tier: 'manual', fragile: false, label: 'manual', source: value };
        delete seq[i]._editErr;
        editing = -1; render(); return true;
      }
      seq[i]._editErr = 'ese locator no resuelve único (' + ((res && res.count) || 0) + ' coincidencias)';
      render(); return false;
    };

    const sameAsLast = (f) => {
      const p = seq[seq.length - 1];
      if (!p) return false;
      return p.role === f.role && (p.name || '') === (f.name || '') && (p.test_id || '') === (f.test_id || '');
    };
    const setStatus = (t) => { status.textContent = t; };

    const render = () => {
      // D10/D23: TODAS las mutaciones de la secuencia (añadir, quitar, re-capturar,
      // editar el locator, limpiar) desembocan aquí, así que este es el único punto
      // donde hay que persistir — y no se puede olvidar ninguna.
      track();
      list.innerHTML = '';
      seq.forEach((s, i) => {
        const li = document.createElement('li');
        if (s.as === 'target') li.className = 'tgt';
        if (s.as === 'assertion') li.className = 'asr';
        const mk = (txt, title, fn) => { const b = document.createElement('button'); b.textContent = txt; b.title = title; b.onclick = fn; return b; };

        // K0.20-A: fila en modo edición → input para teclear el locator a mano
        if (editing === i) {
          const inp = document.createElement('input');
          inp.value = s.manual_locator || (s._q && s._q.source) || '';
          inp.style.cssText = 'flex:1;min-width:0;font:11px monospace;padding:2px 4px';
          inp.setAttribute('spellcheck', 'false');
          inp.onkeydown = (e) => { if (e.key === 'Enter') applyManual(i, inp.value); if (e.key === 'Escape') { editing = -1; render(); } };
          li.appendChild(inp);
          li.appendChild(mk('✔', 'validar y aceptar', () => applyManual(i, inp.value)));
          li.appendChild(mk('⨯', 'cancelar edición', () => { editing = -1; render(); }));
          if (s._editErr) { const e = document.createElement('span'); e.className = 'q bad'; e.textContent = s._editErr; li.appendChild(e); }
          list.appendChild(li);
          setTimeout(() => inp.focus(), 0);
          return;
        }

        const q = s._q || {};
        const cls = !q.ok ? 'q bad' : q.fragile ? 'q warn' : 'q';
        const loc = s.manual_locator || (q.source || '');
        li.innerHTML = '<span class="via">' + s.via + '</span>'
          + '<span class="nm">' + (s.name || s.test_id || s.role) + '</span>'
          + '<span class="' + cls + '" title="' + (q.why || '') + '">' + (q.label || '?') + '</span>';
        // K0.20-A: la CADENA del locator visible (antes solo se veía el badge)
        if (loc) {
          const lc = document.createElement('span');
          lc.style.cssText = 'flex-basis:100%;font:10px monospace;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          lc.textContent = (s.manual_locator ? '✎ ' : '') + loc;
          lc.title = loc;
          li.appendChild(lc);
        }
        li.appendChild(mk('◎', 'marcar como objetivo del paso', () => {
          seq.forEach((x) => { if (x.as === 'target') delete x.as; });
          s.as = 'target'; render();
        }));
        li.appendChild(mk('✓', 'marcar como comprobación (expect_text)', () => {
          s.as = s.as === 'assertion' ? undefined : 'assertion'; render();
        }));
        li.appendChild(mk('✎', 'editar el locator a mano', () => { editing = i; render(); }));
        li.appendChild(mk('⟳', 're-capturar: señala otra vez este elemento', () => {
          repick = i; recording = true; setStatus('recapturando fila ' + (i + 1) + ': señala el elemento');
        }));
        li.appendChild(mk('×', 'quitar de la secuencia', () => { seq.splice(i, 1); nodes.splice(i, 1); render(); }));
        // resaltado del elemento real al pasar por la fila
        li.onmouseenter = () => {
          const node = nodes[i];
          if (!node || !node.getBoundingClientRect) return;
          const r = node.getBoundingClientRect();
          if (!hl) { hl = document.createElement('div'); hl.setAttribute(ASSIST_HOST, '1');
            hl.style.cssText = 'position:fixed;z-index:2147483646;border:2px solid #10b981;background:rgba(16,185,129,.15);pointer-events:none';
            document.documentElement.appendChild(hl); }
          hl.style.left = r.left + 'px'; hl.style.top = r.top + 'px';
          hl.style.width = r.width + 'px'; hl.style.height = r.height + 'px';
          hl.style.display = 'block';
        };
        li.onmouseleave = () => { if (hl) hl.style.display = 'none'; };
        list.appendChild(li);
      });
      setStatus(recording ? 'grabando (' + seq.length + ')' : (seq.length ? 'pausado (' + seq.length + ')' : 'esperando'));
      const frag = seq.some((s) => s._q && !s._q.ok);
      hintBox.className = frag ? 'st warn' : 'st';
      if (frag) hintBox.textContent = 'Ojo: hay un elemento SIN identidad única (marcado en rojo). Señala otro, o su contenedor.';
    };

    const push = async (el, via) => {
      if (!recording) return;
      if (el.closest && el.closest('[' + ASSIST_HOST + ']')) return;
      /**
       * D62 — el QA pulsa el ICONO y el navegador nos da el icono, no el boton.
       *
       * Un boton de accion moderno es <button><i class="icon"/></button>: el <i> es
       * rol generic y no tiene identidad, asi que el panel lo descartaba y le pedia al
       * QA que "senalara su contenedor" — pidiendole que haga el trabajo del navegador.
       * Medido en campo el 2026-08-28 con la papelera de OrangeHRM, que es exactamente
       * esa forma y bloqueo el ejercicio.
       *
       * Solo en CLICK y solo hacia arriba hasta el primer ancestro interactivo: un
       * hover sobre un envoltorio es otra cosa (avisaria en cada wrapper al mover el
       * raton), y subir sin limite acabaria capturando el <body>.
       */
      let objetivo = el;
      if (via === 'click' && el.closest) {
        const rolDirecto = fieldsWithContext(el).role;
        if (!rolDirecto || rolDirecto === 'generic') {
          const arriba = el.closest('button, a[href], input, select, textarea, summary, [role]');
          if (arriba && arriba !== el && !arriba.closest('[' + ASSIST_HOST + ']')) objetivo = arriba;
        }
      }
      const f = fieldsWithContext(objetivo);
      el = objetivo;
      if (!f.role || f.role === 'generic') {
        // K0.26: antes se descartaba EN SILENCIO y el QA veía "el grabador no
        // registra" (campo, PrestaShop: opciones de menú sin rol). El hover
        // sigue callado (avisaría en cada wrapper al mover el ratón); el CLIC
        // deliberado sobre un elemento inanclable sí explica el porqué.
        if (via === 'click') setStatus('ese elemento no tiene identidad anclable (rol genérico): señala su contenedor, o captura otra fila y edítala con ✎');
        return;
      }
      f.via = via;
      // K0.20-B: re-captura — sustituye la fila en curso en vez de añadir, y
      // conserva su marca (objetivo/comprobación). Un hover repetido igual al
      // anterior se ignora, salvo que estemos re-capturando esa fila.
      if (repick === null && via === 'hover' && sameAsLast(f)) return;
      if (repick !== null) {
        const old = seq[repick];
        if (old && old.as) f.as = old.as;
        seq[repick] = f; nodes[repick] = el;
        setStatus('fila ' + (repick + 1) + ' recapturada');
        repick = null;
      } else {
        seq.push(f); nodes.push(el);
      }
      render();
      // calidad del locator EN VIVO: el walker responde tier + fragilidad
      try {
        const { via: _v, as: _a, _q: _o, manual_locator: _m, ...clean } = f;
        f._q = await window.__qaAssistCheck({ ...clean, role: f.role });
      } catch { f._q = { ok: false, label: 'sin verificar', fragile: true }; }
      render();
    };
    const onClick = (e) => { if (e.target !== host) push(e.target, 'click'); };
    const onOver = (e) => {
      if (!recording || e.target === host) return;
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverEl = e.target;
      hoverTimer = setTimeout(() => { if (hoverEl) push(hoverEl, 'hover'); }, 400);
    };
    // captura: se registra ANTES de que la app procese, pero NO se cancela el evento
    document.addEventListener('click', onClick, true);
    document.addEventListener('mouseover', onOver, true);

    const submit = (kind, reason, execute) => {
      recording = false;
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mouseover', onOver, true);
      if (hoverTimer) clearTimeout(hoverTimer);
      if (hl) hl.remove();
      // el panel se queda: el walker informa del resultado de la verificación y lo
      // cierra él. Antes desaparecía al instante y el QA no veía qué había pasado.
      $('r').disabled = true; $('p').disabled = true; $('c').disabled = true; $('t').disabled = true;
      $('x').disabled = true;
      setStatus('verificando...');
      hintBox.className = 'st';
      hintBox.textContent = execute === false
        ? 'Capturando el locator sin ejecutar la acción. El flujo se detendrá aquí.'
        : 'Verificando el camino grabado por replay en un contexto limpio...';
      const targetIndex = seq.findIndex((s) => s.as === 'target');
      // K0.47 — performed: el objetivo se señaló con un CLIC REAL, que propaga a la
      // app (por eso demostrar un logout navega, D10). Si el walker lo re-dispara
      // después, la acción de negocio ocurre DOS veces. Con ◎ sobre un hover no hay
      // clic y la acción sigue pendiente. Sin objetivo explícito, el objetivo es el
      // último clic por definición → performed.
      const tgt = targetIndex >= 0 ? seq[targetIndex] : [...seq].reverse().find((s) => s.via === 'click');
      const performed = !!tgt && tgt.via === 'click';
      // se limpian los campos internos del panel (_q, _editErr); manual_locator viaja
      const clean = seq.map(({ _q, _editErr, ...rest }) => rest);
      window.__qaAssistSubmit({ kind, step: '${step.id}', sequence: clean, target_index: targetIndex, reason, execute, performed });
    };
    const startRec = () => {
      recording = true;
      $('r').disabled = true; $('p').disabled = false; $('c').disabled = false; $('t').disabled = false;
      $('x').disabled = false;
      hintBox.className = 'st';
      hintBox.textContent = 'Grabando. Navega y pulsa el elemento. ◎ marca objetivo, ✓ comprobación, × quita.';
      render();
    };
    const pauseRec = () => {
      recording = !recording;
      $('p').textContent = recording ? 'Pausa' : 'Reanudar';
      render();
    };
    $('r').onclick = startRec;
    $('p').onclick = pauseRec;
    $('c').onclick = () => { seq.length = 0; nodes.length = 0; render(); };
    $('t').onclick = () => submit('recorded');
    $('x').onclick = () => submit('recorded', 'el QA pidió capturar sin ejecutar la acción', false);
    $('d').onclick = () => submit('drift', 'el QA confirma que el elemento no existe en esta pantalla');
    $('b').onclick = () => submit('block', 'el QA decidió bloquear el paso');
    // el walker llama a esto al terminar de verificar, y luego cierra
    window.__qaAssistResult = (msg, ok) => {
      setStatus(ok ? 'verificado' : 'sin verificar');
      hintBox.className = ok ? 'st' : 'st warn';
      hintBox.textContent = msg;
      setTimeout(() => host.remove(), ok ? 1200 : 3500);
    };

    // Canal de comandos: el shadow root es CERRADO (los locators de Playwright no lo
    // atraviesan, así no interfiere con la resolución del walker), así que los botones
    // no son alcanzables desde fuera. Este evento sobre el host da la misma
    // funcionalidad de forma programática — lo usan los tests y permitiría guiar el
    // panel desde el orquestador.
    host.addEventListener('qa-assist-cmd', (ev) => {
      const cmd = ev && ev.detail;${POSTURAS_CMD}
      if (cmd === 'record') startRec();
      else if (cmd === 'pause') pauseRec();
      else if (cmd === 'clear') { seq.length = 0; nodes.length = 0; render(); }
      else if (cmd === 'stop') submit('recorded');
      else if (cmd === 'capture-only') submit('recorded', 'comando: capturar sin ejecutar', false);
      else if (cmd === 'drift') submit('drift', 'comando: elemento no presente');
      else if (cmd === 'block') submit('block', 'comando: bloquear paso');
      else if (cmd && cmd.target !== undefined) {
        seq.forEach((x) => { if (x.as === 'target') delete x.as; });
        if (seq[cmd.target]) seq[cmd.target].as = 'target';
        render();
      }
      else if (cmd && cmd.remove !== undefined) { seq.splice(cmd.remove, 1); nodes.splice(cmd.remove, 1); render(); }
      else if (cmd && cmd.assert !== undefined) { if (seq[cmd.assert]) seq[cmd.assert].as = 'assertion'; render(); }
      // K0.20: editar el locator de una fila a mano (validado en vivo) y re-capturar
      else if (cmd && cmd.edit !== undefined) { if (seq[cmd.edit.row]) applyManual(cmd.edit.row, cmd.edit.locator); }
      else if (cmd && cmd.recapture !== undefined) { repick = cmd.recapture; recording = true; render(); }
    });

    // arrastre del panel por la cabecera
    const head = root.querySelector('.h');
    let drag = null;
    head.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, r: host.getBoundingClientRect() }; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => {
      if (!drag) return;
      host.style.left = (drag.r.left + e.clientX - drag.x) + 'px';
      host.style.top = (drag.r.top + e.clientY - drag.y) + 'px';
      host.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { if (drag) { drag = null; window.__qaPanelMovido && window.__qaPanelMovido(); } drag = null; });
${posturasScript(p3)}
    render();
  })()`;
}

/**
 * El panel de VEREDICTO: el que se abre cuando una postcondición del FD no se
 * cumple (fase B de `docs/tasks/plan-panel-y-acta.md`).
 *
 * Es otro panel, no un modo del de asistencia, y la diferencia no es cosmética:
 * allí el QA **demuestra un camino** para que el walker construya un locator; aquí
 * el QA **dicta quién tiene razón**, la aplicación o el FD. No hay secuencia que
 * grabar ni locator que construir — hay un literal que adoptar, o no.
 *
 * Lo que la interfaz tiene que conseguir, por orden:
 *
 *  1. Que se vea **lo que la pantalla sí dice**, medido en vivo. Sin eso, «la
 *     aplicación tiene razón» es una casilla que se marca a ciegas.
 *  2. Que se pueda **señalar** un texto que la lista no trajo. La lista sale de los
 *     textos de negocio (heading/alert/status) y un resultado puede vivir fuera de
 *     ese cubo; sin salida, el QA se queda atrapado entre opciones equivocadas.
 *  3. Que los tres botones estén **al mismo nivel**. Si «la aplicación tiene razón»
 *     fuera el botón grande y verde, el panel estaría empujando a adoptar la
 *     aplicación, y la suite se convertiría en un espejo de la app — que es
 *     exactamente lo que P6 existe para contar.
 *
 * La validación NO está aquí. La hace `veredictoADecision` en Node y, si rechaza,
 * el panel se reinyecta con el motivo delante. Un solo juez: duplicar la regla en
 * la página para «avisar antes» es la familia D2 con otro nombre.
 */
function verdictOverlayScript(
  testidAttrs: string[],
  step: WalkStep,
  esperado: string,
  diagnostico: string,
  candidatos: string[],
  rechazo?: string,
  p3?: P3Opts,
): string {
  return `(() => {
    ${extractionHelpers(testidAttrs)}
    const prev = document.querySelector('[' + ASSIST_HOST + ']');
    if (prev) prev.remove();
    const host = document.createElement('div');
    host.setAttribute(ASSIST_HOST, '1');
    host.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;';
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = \`
      <style>
        .p{font:13px/1.45 system-ui,sans-serif;background:#111827;color:#f9fafb;border:1px solid #374151;
           border-radius:8px;width:400px;box-shadow:0 6px 24px rgba(0,0,0,.4);overflow:hidden}
        .h{padding:8px 10px;background:#1f2937;cursor:move;font-weight:500;display:flex;justify-content:space-between}
        .b{padding:10px}
        .ctx{color:#9ca3af;margin-bottom:8px}
        .ctx .ref{color:#6b7280;font-size:11px}
        .ctx .dx{margin-top:5px;color:#e5e7eb;white-space:pre-line}
        .ctx b{color:#f9fafb}
        .err{margin-bottom:8px;padding:6px 8px;border-radius:5px;background:#7f1d1d;color:#fecaca;font-size:12px}
        .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
        button{font:12px system-ui;padding:5px 9px;border-radius:5px;border:1px solid #4b5563;
               background:#374151;color:#f9fafb;cursor:pointer}
        button:hover{background:#4b5563}
        button:disabled{opacity:.45;cursor:default}
        .pick.on{background:#1e3a8a;border-color:#2563eb}
        ul{list-style:none;margin:8px 0 0;padding:0;color:#d1d5db;max-height:170px;overflow:auto}
        li{display:flex;align-items:center;gap:6px;padding:4px 5px;border-radius:4px;margin:1px 0;cursor:pointer}
        li:hover{background:#1f2937}
        li.sel{background:#064e3b;outline:1px solid #059669}
        li .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .none{color:#fca5a5;font-size:12px;margin-top:8px}
        .chosen{margin-top:8px;padding:6px 8px;border-radius:5px;background:#064e3b;color:#d1fae5;font-size:12px;
                word-break:break-word}
        .st{margin-top:8px;color:#9ca3af;font-size:11px}
        .cierre{color:#6b7280;border-top:1px solid #374151;padding-top:6px}${POSTURAS_CSS}
      </style>
      <div class="p">
        <div class="h"><span>Veredicto QA</span><span id="s">esperando</span>${POSTURAS_HTML}</div>
        <div class="tira"></div>
        <div class="b">
          \${${JSON.stringify(
            /**
             * «Ha vuelto» y no solo el motivo. Reinyectado, el panel es idéntico al
             * anterior, y en campo eso se leyó como «el botón no cierra» en vez de
             * como «lo que hiciste no valía» — el QA acabó pulsando Luego para salir.
             * Decirlo cuesta una línea.
             */
            rechazo
              ? `<div class="err"><b>Este panel ha vuelto porque falta algo.</b><br>${rechazo
                  .replace(/</g, '&lt;')
                  .replace(/\n/g, '<br>')}</div>`
              : '',
          )}}
          <div class="ctx"><b>Esto no cuadra y no lo puedo decidir yo.</b>
            <span class="ref">paso \${'${step.id}'}</span>
            <div class="dx">\${${JSON.stringify(
              // Mismo escapado que el panel de asistencia y por el mismo motivo (K0.44):
              // un motivo multilinea sin escapar revienta el panel entero con un
              // SyntaxError, o sea, sin panel y sin saber por que.
              diagnostico.replace(/</g, '&lt;').replace(/\n/g, '<br>'),
            )}}</div></div>
          <ul id="l"></ul>
          <div id="empty" class="none" style="display:none">Esta pantalla no muestra ningún texto de resultado.
            Eso no es un fallo de la lista: es un dato, y empuja a «Es un defecto».</div>
          <div class="row"><button id="pk" class="pick">Ninguno de estos, lo señalo yo</button></div>
          <div id="ch" class="chosen" style="display:none"></div>
          <div class="st" id="hint">Elige qué dice de verdad la pantalla, o declara que la aplicación está mal.</div>
          <div class="row">
            <button id="va">La aplicación tiene razón</button>
            <button id="vf">Es un defecto</button>
            <button id="vl">Luego</button>
          </div>
          <!--
            Medido en campo el 2026-08-29: el QA capturó el texto y preguntó «¿ahora
            cómo se cierra esto?». Los tres botones SON la salida —no hay X ni Escape,
            porque el run está parado esperando y no existe un «cerrar sin decidir»—
            pero eso no estaba escrito en ninguna parte. En el panel de asistencia
            «Parar» se explica solo; aquí no.
          -->
          <div class="st cierre">Los tres botones cierran el panel y siguen con el caso. No hay otra salida:
            el run está parado esperando tu decisión.</div>
        </div>
      </div>\`;
    const $ = (id) => root.getElementById(id);
    const cands = ${JSON.stringify(candidatos)};
    const status = $('s'), hintBox = $('hint'), chosenBox = $('ch');
    let elegido = null;      // literal adoptado
    let origen = null;       // 'candidato' | 'senalado'
    let picking = false;
    let hl = null;

    const pintarElegido = () => {
      if (elegido === null) { chosenBox.style.display = 'none'; return; }
      chosenBox.style.display = 'block';
      chosenBox.textContent = 'Adoptado: ' + JSON.stringify(elegido);
    };
    /**
     * Elegir de la lista, en UN solo sitio.
     *
     * El clic del QA y el comando \`{choose:N}\` de los tests entran por aquí los dos.
     * Antes cada uno hacía lo suyo, y el test que comprobaba que tras elegir el panel
     * dice qué pulsar pasaba por un camino que el QA no recorre nunca: el mensaje que
     * de verdad importaba no se estaba probando.
     */
    const elegir = (i) => {
      if (cands[i] === undefined) return;
      elegido = cands[i];
      origen = 'candidato';
      // Sin esto el QA se queda mirando el panel sin saber que el gesto siguiente es
      // un botón y no un aspa. Medido en campo el 2026-08-29.
      hintBox.textContent = 'Elegido. Ahora pulsa «La aplicación tiene razón» para firmarlo.';
      render();
    };
    const render = () => {
      const list = $('l');
      list.innerHTML = '';
      for (let i = 0; i < cands.length; i += 1) {
        const li = document.createElement('li');
        if (origen === 'candidato' && elegido === cands[i]) li.className = 'sel';
        const nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = cands[i];
        nm.title = cands[i];
        li.appendChild(nm);
        li.onclick = () => elegir(i);
        list.appendChild(li);
      }
      $('empty').style.display = cands.length ? 'none' : 'block';
      pintarElegido();
    };

    // --- senalar un texto en la pagina -------------------------------------
    // Se registra en CAPTURA y no se cancela el evento: el panel observa, no
    // secuestra. Cancelar el clic dejaria la app en un estado que el QA no ve.
    const onPick = (e) => {
      if (!picking) return;
      const el = e.target;
      if (!el || el.closest('[' + ASSIST_HOST + ']')) return;
      const txt = (nameOf(el) || clean(el.textContent) || '').trim();
      if (!txt) {
        hintBox.textContent = 'Ese elemento no tiene texto legible. Señala el texto del resultado.';
        return;
      }
      elegido = txt; origen = 'senalado'; picking = false;
      $('pk').className = 'pick';
      if (hl) { hl.remove(); hl = null; }
      hintBox.textContent = 'Texto tomado. Compruébalo arriba y, si es el resultado, pulsa «La aplicación tiene razón».';
      render();
    };
    const onOver = (e) => {
      if (!picking) return;
      const el = e.target;
      if (!el || el.closest('[' + ASSIST_HOST + ']')) return;
      if (!hl) {
        hl = document.createElement('div');
        hl.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #2563eb;background:rgba(37,99,235,.12)';
        document.documentElement.appendChild(hl);
      }
      const r = el.getBoundingClientRect();
      hl.style.left = r.left + 'px'; hl.style.top = r.top + 'px';
      hl.style.width = r.width + 'px'; hl.style.height = r.height + 'px';
    };
    document.addEventListener('click', onPick, true);
    document.addEventListener('mouseover', onOver, true);

    const togglePick = () => {
      picking = !picking;
      $('pk').className = picking ? 'pick on' : 'pick';
      hintBox.textContent = picking
        ? 'Pulsa en la pantalla el texto que dice el resultado de verdad.'
        : 'Elige qué dice de verdad la pantalla, o declara que la aplicación está mal.';
      if (!picking && hl) { hl.remove(); hl = null; }
    };

    const submit = (verdict) => {
      document.removeEventListener('click', onPick, true);
      document.removeEventListener('mouseover', onOver, true);
      if (hl) hl.remove();
      $('va').disabled = true; $('vf').disabled = true; $('vl').disabled = true; $('pk').disabled = true;
      status.textContent = 'firmando...';
      hintBox.textContent = 'Registrando la decisión en el acta.';
      window.__qaVerdictSubmit({
        step: '${step.id}',
        verdict,
        // El literal viaja SOLO con 'app'. Un "es un defecto" que ademas propone
        // texto son dos decisiones contradictorias en una firma.
        value: verdict === 'app' && elegido !== null ? elegido : undefined,
        source: verdict === 'app' && origen !== null ? origen : undefined,
      });
    };

    $('pk').onclick = togglePick;
    $('va').onclick = () => submit('app');
    $('vf').onclick = () => submit('fd');
    $('vl').onclick = () => submit('defer');

    // El walker responde aqui cuando la decision queda firmada, y luego cierra.
    window.__qaVerdictResult = (msg, ok) => {
      status.textContent = ok ? 'firmado' : 'sin firmar';
      hintBox.className = ok ? 'st' : 'st none';
      hintBox.textContent = msg;
      setTimeout(() => host.remove(), ok ? 1400 : 3500);
    };

    // Mismo canal de comandos que el panel de asistencia: el shadow root es CERRADO,
    // asi que sin esto los tests no podrian pulsar nada.
    host.addEventListener('qa-assist-cmd', (ev) => {
      const cmd = ev && ev.detail;${POSTURAS_CMD}
      if (cmd === 'app') submit('app');
      else if (cmd === 'fd') submit('fd');
      else if (cmd === 'defer') submit('defer');
      else if (cmd === 'pick') togglePick();
      else if (cmd && cmd.choose !== undefined) elegir(cmd.choose);
    });

    const head = root.querySelector('.h');
    let drag = null;
    head.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, r: host.getBoundingClientRect() }; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => {
      if (!drag) return;
      host.style.left = (drag.r.left + e.clientX - drag.x) + 'px';
      host.style.top = (drag.r.top + e.clientY - drag.y) + 'px';
      host.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { if (drag) { drag = null; window.__qaPanelMovido && window.__qaPanelMovido(); } drag = null; });
${posturasScript(p3)}
    render();
  })()`;
}

// ------------------------------------------------------------- frame paths

async function framePath(frame: Frame): Promise<string[]> {
  const path: string[] = [];
  let current: Frame | null = frame;
  while (current && current.parentFrame()) {
    const el = await current.frameElement().catch(() => null);
    let seg = 'iframe';
    if (el) {
      const name = await el.getAttribute('name').catch(() => null);
      const id = await el.getAttribute('id').catch(() => null);
      const src = await el.getAttribute('src').catch(() => null);
      if (name) seg = `iframe[name="${name}"]`;
      else if (id) seg = `iframe#${id}`;
      else if (src) seg = `iframe[src*="${src.split('/').pop()?.slice(0, 40) ?? ''}"]`;
    }
    path.unshift(seg);
    current = current.parentFrame();
  }
  return path;
}

// ------------------------------------------------ settle in-page (K0.13 c2)

interface SettleArgs {
  busySel: string[];
  ignoreSel: string[];
  quietMs: number;
  timeoutMs: number;
  maxMut: number;
}

/**
 * Observador de quietud, ejecutado DENTRO de la página (top o iframe).
 *
 * Se emite como STRING y no como referencia de función, igual que el resto del
 * código in-page de este fichero, y no por gusto: `page.evaluate(fn)` serializa
 * `fn.toString()`, y esbuild (que es lo que usa `tsx` en producción) envuelve las
 * declaraciones con su helper `__name` de keepNames. Ese helper no existe en la
 * página → `ReferenceError: __name is not defined`, settle silenciosamente inerte.
 * El transform de vitest NO lo añade, así que la variante por referencia pasaba los
 * tests en verde y fallaba solo al ejecutar el CLI. Un string no depende del
 * transpilador de nadie.
 *
 * Dos señales conjugadas:
 *  (a) señales de "ocupado" VISIBLES (spinners, aria-busy, progressbar);
 *  (b) TASA de mutaciones del DOM — agnóstica de la señal, que es lo que cubre el
 *      spinner que nadie declaró. Como es tasa y no presencia, un reloj que
 *      tictaquea o un contador de polling no cuelgan la espera para siempre.
 *
 * La ventana se REINICIA con cualquiera de las dos. Ahí muere el ciclo múltiple.
 */
function settleScript(args: SettleArgs): string {
  return `(() => {
  const { busySel, ignoreSel, quietMs, timeoutMs, maxMut } = ${JSON.stringify(args)};
  const start = performance.now();
  const signals = new Set();
  let mutations = 0, resets = 0, busyCycles = 0, wasBusy = false, quietSince = start;
  const ignoreQuery = ignoreSel.join(',');

  /**
   * K0.17 — "todavía no ha empezado" NO es "ya terminó". Medido contra OrangeHRM:
   * una SPA Vue tarda segundos en montar y hasta entonces el documento está vacío,
   * sin spinner y sin mutaciones — o sea, máximamente quieto. La ventana lo
   * declaraba estable en 400 ms y todos los pasos siguientes fallaban con "hint
   * irresoluble" sobre una pantalla en blanco.
   *
   * Si al empezar a observar no hay NADA, la quietud exige además haber visto al
   * menos una mutación. Si la página está vacía de verdad, se agota el tope y se
   * reporta — que es la respuesta correcta, no un falso "estable".
   *
   * "Nada" se mide como CONTENIDO, no como interactivos (K0.18). Medir solo
   * interactivos tenía un coste real que los fixtures escondían con un botón
   * fantasma: una pantalla estática rica en contenido pero SIN controles (un
   * informe, una tabla de resultados, una confirmación de solo texto) arranca sin
   * interactivos y ya no vuelve a mutar → exigir una mutación que no llega hacía
   * pagar el timeout completo en cada paso. Una tabla con filas es contenido: la
   * página ya arrancó. Solo el documento genuinamente en blanco (SPA sin montar)
   * debe esperar la mutación.
   */
  const interactivos = () =>
    document.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="link"],[role="textbox"]').length;
  const hayContenido = () => interactivos() > 0 || (document.body?.innerText ?? '').trim().length > 0;
  /**
   * La regla SOLO aplica al documento principal. Aplicada a los frames hijos era una
   * regresión seria, y la cazó el banco corporativo: un \`<iframe hidden>\` sin
   * contenido está vacío y NUNCA muta, así que no alcanzaba la quietud jamás, agotaba
   * el tope, y como el agregado hace some(timed_out) envenenaba los 30 pasos del
   * flujo (10 minutos de run y todo en settle_timeout). "La app no ha montado" es una
   * preocupación del top, no de un iframe oculto que legítimamente no tiene nada.
   */
  const esPrincipal = window.top === window;
  const habiaContenido = hayContenido();
  let mutacionesTotal = 0;   // nunca se resetea: "¿ha pasado algo alguna vez?"

  const observer = new MutationObserver((records) => {
    for (const rec of records) {
      const node = rec.target;
      const el = node.nodeType === 1 ? node : node.parentElement;
      if (el && ignoreQuery) {
        try { if (el.closest(ignoreQuery)) continue; } catch (e) { /* selector del pack inválido */ }
      }
      mutations += 1;
      mutacionesTotal += 1;
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });

  const busyNow = () => {
    for (const sel of busySel) {
      let list;
      try { list = document.querySelectorAll(sel); } catch (e) { continue; }
      for (const el of Array.from(list)) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const st = getComputedStyle(el);
        if (st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') continue;
        signals.add(sel);
        return true;
      }
    }
    return false;
  };

  return new Promise((resolveOuter) => {
    const done = (timedOut) => {
      observer.disconnect();
      resolveOuter({
        waited_ms: Math.round(performance.now() - start),
        busy_cycles: busyCycles,
        resets,
        timed_out: timedOut,
        signals: Array.from(signals),
        started_empty: esPrincipal && !habiaContenido,
      });
    };
    const tick = () => {
      const now = performance.now();
      if (now - start >= timeoutMs) return done(true);
      const busy = busyNow();
      if (busy && !wasBusy) busyCycles += 1;   // un ciclo de spinner contado
      wasBusy = busy;
      // K0.17: si el TOP arranca en blanco, no hay quietud válida hasta que algo ocurra
      const arrancado = !esPrincipal || habiaContenido || mutacionesTotal > 0;
      if (busy || mutations > maxMut) {
        if (!busy) resets += 1;                // la ventana cayó por mutaciones, sin señal declarada
        mutations = 0;
        quietSince = now;
      } else if (arrancado && now - quietSince >= quietMs) {
        return done(false);
      }
      setTimeout(tick, 50);
    };
    tick();
  });
})()`;
}

// ------------------------------------------ matar animaciones (Fase 3)

/**
 * CSS que anula transición/animación/scroll suave. Se registra vía
 * `context.addInitScript` (corre antes de que cargue cualquier script de la
 * página, en CADA documento — incluidas recargas duras de apps JSF/PrimeFaces
 * que no son SPA) y no vía `page.addStyleTag` tras cada `goto`, porque un
 * style tag inyectado se pierde en la siguiente navegación dura y habría que
 * reinyectarlo por cada paso `goto`.
 *
 * `document.documentElement` (y `document.head`) son NULL en el momento en
 * que un init script corre — es "antes de que cargue cualquier script",
 * literal: antes de que el parser haya insertado siquiera el `<html>`.
 * Insertar el `<style>` a ciegas revienta con
 * `Cannot read properties of null (reading 'appendChild')`, silenciosamente
 * (el error queda en la consola de la página, no en Node): medido en vivo,
 * la animación seguía corriendo entera con el knob "activado". Un
 * `MutationObserver` sobre `document` detecta el instante en que el parser
 * crea `<html>` y ahí sí hay dónde colgar el `<style>` — mucho antes de
 * `DOMContentLoaded`, que llegaría a tiempo aquí pero no en general (una
 * animación podría empezar apenas se pinta el primer frame).
 *
 * Emitido como STRING, no como referencia de función: mismo motivo que
 * `settleScript` (comentario ahí). `addInitScript` acepta una cadena de
 * fuente JS igual que `evaluate`, y así se evita el problema de raíz en vez
 * de confiar en que esta función en particular no sea "named" para esbuild.
 */
function killAnimationsScript(): string {
  return `(() => {
    const inject = () => {
      const style = document.createElement('style');
      style.setAttribute('data-qa-kill-animations', '1');
      style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }';
      (document.head || document.documentElement).appendChild(style);
    };
    if (document.documentElement) { inject(); return; }
    const mo = new MutationObserver(() => {
      if (document.documentElement) { mo.disconnect(); inject(); }
    });
    mo.observe(document, { childList: true });
  })()`;
}

// --------------------------------------- accionable sin ejecutar (K0.14)

/**
 * ¿Es accionable, SIN ejecutar la acción? `trial` de Playwright corre las mismas
 * comprobaciones que la acción real (visible, estable, habilitado, recibe eventos
 * de puntero) y se detiene ahí. Lanza si no lo es.
 *
 * Es lo que permite verificar el parche del modo asistido sin pagar la operación de
 * negocio: antes, capturar el locator de un "Finalizar" lo disparaba 4 veces (clic
 * del QA + verificación + minimización + ejecución real), y hasta 9 con un camino
 * de varios abridores.
 *
 * `fill`/`select`/`press` no tienen `trial`, así que se usa el de `click`: es un
 * envoltorio MÁS estricto que lo que un fill necesita (exige además recibir eventos
 * de puntero). Un falso negativo deja el parche marcado sin verificar, que es el
 * lado seguro del error.
 */
async function assertActionable(loc: Locator, action: WalkAction, timeoutMs = STEP_TIMEOUT_MS): Promise<void> {
  const opts = { timeout: timeoutMs, trial: true };
  switch (action) {
    case 'hover':
      return loc.hover(opts);
    case 'check':
      return loc.check(opts);
    case 'uncheck':
      return loc.uncheck(opts);
    default:
      return loc.click(opts);
  }
}

/**
 * K0.15 — ¿el objetivo es alcanzable, y si no lo es, lo recupera el camino grabado?
 *
 * Existe porque el estado en el que el QA señaló el elemento NO es nuestro: **el
 * panel de asistencia vive en la página**, así que pulsar `◎` o `Parar` es un clic
 * sobre el documento y cierra cualquier menú off-canvas que escuche clics fuera
 * (react-burger-menu, drawers de Material, paneles laterales de los DS
 * corporativos). Medido en SauceDemo: el parche se verificaba y la acción real
 * fallaba con el menú ya cerrado.
 *
 * Los abridores solo se re-ejecutan CUANDO hacen falta: un abridor suele ser un
 * toggle, y pulsarlo con el menú ya abierto lo cerraría.
 *
 * `resolve` se inyecta para poder probar el mecanismo sin montar el walker entero.
 */
async function ensureReachable(
  target: Locator,
  action: WalkAction,
  openers: AssistPatchStep[],
  resolve: (source: string) => Promise<Locator | null>,
  opts: { reachTimeoutMs?: number; stepTimeoutMs?: number } = {},
): Promise<{ ok: boolean; reason?: string; reopened: boolean }> {
  const reachTimeout = opts.reachTimeoutMs ?? 3_000;
  const stepTimeout = opts.stepTimeoutMs ?? STEP_TIMEOUT_MS;
  const reachable = (): Promise<boolean> =>
    assertActionable(target, action, reachTimeout)
      .then(() => true)
      .catch(() => false);

  if (await reachable()) return { ok: true, reopened: false };
  if (openers.length === 0) {
    return { ok: false, reopened: false, reason: 'el camino grabado no tiene abridores con los que recuperarlo' };
  }

  for (const [i, op] of openers.entries()) {
    const unique = op.locator ? await resolve(op.locator) : null;
    if (!unique) {
      return { ok: false, reopened: true, reason: `el abridor ${i + 1} (${op.locator}) no resuelve en la pantalla actual` };
    }
    try {
      if (op.action === 'hover') await unique.hover({ timeout: stepTimeout });
      else await unique.click({ timeout: stepTimeout });
    } catch (err) {
      const m = err instanceof Error ? err.message.split('\n')[0] : String(err);
      return { ok: false, reopened: true, reason: `el abridor ${i + 1} (${op.locator}) falló: ${m}` };
    }
  }
  return { ok: await reachable(), reopened: true };
}

/**
 * Enriquece el mensaje corto de un fallo de acción con la línea de diagnóstico
 * de Playwright que dice POR QUÉ, cuando la trae (p.ej. "intercepts pointer
 * events" — Fase 2, SPEC-caos-corporativo). Esa línea vive en el call log
 * MULTILÍNEA que el resto del código descarta con `.split('\n')[0]` a
 * propósito, para no llenar el audit-log de ruido; sin ella, un backdrop
 * fantasma no declarado bloqueaba el paso con un "timeout 10000ms exceeded"
 * desnudo que no dice nada de por qué.
 */
function actionFailureDetail(err: unknown): string {
  // el call log de Playwright viene con códigos ANSI de color (dim) por línea
  const full = (err instanceof Error ? err.message : String(err)).replace(/\x1b\[[0-9;]*m/g, '');
  const lines = full.split('\n');
  const first = lines[0];
  const cause = lines.find((l) => l.includes('intercepts pointer events'))?.replace(/^\s*-\s*/, '').trim();
  return cause ? `${first} (${cause})` : first;
}

// -------------------------------------------------------------- el walker

class DomWalker {
  private readonly opts: WalkerOptions;
  private readonly script: WalkScript;
  private readonly contract: StyleContract;
  private readonly priority: string[];
  /** D46 — atributos con los que se puede derivar un locator emisible. Ver el constructor. */
  private readonly cssFallbackAttrs: string[];
  /** D48 — idioma que se le pide a la aplicacion. Ver el constructor. */
  private readonly locale: string | undefined;
  private readonly auditPath: string;
  private state: WalkState;
  private page!: Page;
  private context!: BrowserContext;
  private testidAttr: string | undefined;
  /**
   * K0.25 — true mientras corre el replay de verificación de un parche (contexto
   * fantasma). Silencia panel/rescate y TODA mutación de estado: el rodaje contra
   * SauceDemo demostró que el replay abría paneles de asistencia para OTROS pasos
   * (s9 tras s14), pisaba step_reports/current_screen del run principal y
   * re-ejecutaba el guion con el ejecutor completo. En verificación, un paso que
   * no resuelve es "no reproducible en limpio", nunca una conversación con el QA.
   */
  private verifying = false;
  private lastDialogs: string[] = [];
  /** Paso en curso (Fase 2): el handler de estorbos lo usa para auditar "selector + paso". */
  private currentStepKey: string | null = null;
  /**
   * K0.34 — por qué se plantó la última resolución, cuando fue por AMBIGÜEDAD.
   * `resolveHint` devuelve null para dos cosas que piden acciones opuestas del QA
   * (capturar un locator vs. acotar con `scope`), y el informe las contaba igual.
   */
  private ultimaAmbiguedad: string | null = null;
  /**
   * K0.41 — descripción en castellano de lo último que resolvió el peldaño débil.
   * Vive en la instancia porque `resolveHint` es quien tiene el locator y
   * `pushReport` quien escribe el informe, y hay diez sitios que reportan: pasarla
   * por parámetro obligaría a tocarlos todos para un dato que solo usa uno.
   * Se reinicia en cada resolución, para que no se herede del paso anterior.
   */
  private ultimaDescripcion: string | null = null;
  /**
   * K0.36 — motivo de bloqueo cuando el ÁMBITO resolvió pero no contenía el hint.
   * Campo aparte y no reutilizando `ultimaAmbiguedad`: son dos hallazgos distintos
   * con dos remedios distintos, y meterlos en la misma variable acabaría poniendo
   * la palabra "ambiguo" en un informe donde no hay ninguna ambigüedad.
   */
  private ultimoAmbitoFallido: string | null = null;
  /**
   * K0.35 — código HTTP del último documento navegado. Es la señal OBJETIVA de
   * "página de error"... cuando el contenedor la da: medido en el banco JSF, la
   * página de error de MyFaces llega con 200 porque se sirve por forward. Por eso
   * es una señal más, no la única.
   */
  private ultimoEstadoDoc: number | null = null;
  /** Estorbos declarados que resistieron el descarte (K0.29): su manejador queda inerte. */
  private readonly undismissable = new Set<string>();
  /** Banners de consentimiento ya resueltos (K0.30): no se re-intentan ni se re-auditan. */
  private readonly consentHandled = new Set<string>();
  /**
   * K0.32 — candidatos a caso del banco, capturados en el momento en que la
   * escalera resolvió (que es el estado del DOM que hay que fotografiar) y
   * decididos al final, cuando ya se sabe si algo INDEPENDIENTE los corrobora.
   */
  private readonly corpusPendiente: Array<{
    id: string;
    flow: string;
    step: string;
    archivo: string;
    action: WalkAction;
    hint?: StepHint;
    scope?: StepHint;
    via: string;
    frame_path: string[];
    tienePostcondicion: boolean;
  }> = [];
  /**
   * Pasos que la escalera NO resolvió, fotografiados para el BANCO DE RESCATES.
   * Van aparte del corpus de resolución y sin `target`: aquí la verdad no puede
   * salir del walker —si supiera cuál es el elemento no se habría plantado—, así
   * que la marca la pone una persona después. Es la misma disciplina de K0.32:
   * un banco que anota como verdad lo que decidió el propio walker se estaría
   * midiendo a sí mismo.
   */
  private readonly bloqueadosPendiente: Array<{
    id: string;
    flow: string;
    step: string;
    archivo: string;
    action: WalkAction;
    hint?: StepHint;
    scope?: StepHint;
    motivo: string;
  }> = [];
  private aliases: HintAliasFile;
  private readonly aliasesPath: string;
  /** Resolver del envío del overlay (K0.10): lo rellena assistResolve por paso. */
  /**
   * D10/D23 — lo grabado por el QA, EN NODE. Vive aquí y no en la página porque
   * el contexto de la página se destruye con cada navegación, y ahí se perdía.
   */
  private assistRecorded: PickedElement[] = [];
  /** Sumidero del puente de grabación: lo pone la espera activa. */
  private assistTrack: ((seq: PickedElement[]) => void) | null = null;
  private assistPending: ((p: AssistSubmission) => void) | null = null;
  /** Sumidero del panel de VEREDICTO (fase B). Aparte del de asistencia: otro payload. */
  private verdictPending: ((p: VerdictSubmission) => void) | null = null;
  private assistBridgeReady = false;
  private readonly assistPatch: AssistPatch;
  /** El flujo en curso se detiene (K0.14: capturar sin ejecutar). Se resetea por flujo. */
  private flowAborted = false;
  /** URL en el momento de abrir el panel (K0.15): distingue "navegó" de "cambió de estado". */
  private assistOpenUrl: string | null = null;
  /** Perfil de tiempos observados (K0.13 capas 4/6) y su ruta durable. */
  private timing: TimingProfile;
  private readonly timingPath: string;

  constructor(opts: WalkerOptions, script: WalkScript, contract: StyleContract, state: WalkState) {
    this.opts = opts;
    this.script = script;
    this.contract = contract;
    this.priority = contract.locators?.priority ?? ['getByTestId', 'getByRole', 'getByLabel', 'getByText'];
    /**
     * D46 — la whitelist de atributos con la que se puede FABRICAR un locator emisible
     * cuando el elemento no tiene identidad semántica. El contract ya la declaraba
     * (`locators.css_fallback_attributes`, con enum [name, id]) y el walker no la leía.
     */
    this.cssFallbackAttrs = (contract.locators as { css_fallback_attributes?: string[] } | undefined)
      ?.css_fallback_attributes ?? [];
    /**
     * D48 — el idioma que sirve la aplicacion depende de una cabecera que hasta ahora
     * nadie fijaba. Medido en el demo de Dolibarr el 2026-08-23: la MISMA URL devuelve
     * la interfaz en castellano con `Accept-Language: es-ES` y en ingles con `en-US`.
     * Un plan con literales medidos en un idioma y un run que pide otro no fallan por
     * el producto: fallan porque son dos aplicaciones distintas para el buscador de
     * texto, y el diagnostico que sale ("hint irresoluble") manda a mirar el hint.
     *
     * Sin declarar, no se toca nada: Playwright usa el idioma del navegador y el
     * comportamiento es el de siempre.
     */
    this.locale = (contract as { locale?: string }).locale ?? process.env.QA_LOCALE ?? undefined;
    this.auditPath = resolve(opts.workDir, 'audit-log.json');
    this.state = state;
    this.state.step_reports = this.state.step_reports ?? [];
    this.testidAttr = opts.testidAttr ?? state.testid_attr;
    this.aliasesPath = resolve(opts.aliasesPath ?? `config/hint-aliases/${script.site_id}.json`);
    this.aliases = this.loadAliases();
    this.assistPatch = { version: 1, site_id: script.site_id, generated_at: '', entries: [] };
    this.timingPath = resolve(opts.timingProfilePath ?? `config/timing-profiles/${script.site_id}.json`);
    this.timing = this.loadTiming();
  }

  // ------------------------------------------------- corpus del banco (K0.32)

  /**
   * Fotografía el DOM en el instante en que la escalera resolvió, marcando el
   * elemento resuelto. Esa marca es la que el banco usará como objetivo: un
   * atributo inyectado en la propia foto no puede volverse ambiguo ni caducar,
   * a diferencia de un selector reconstruido a posteriori.
   *
   * Se captura ANTES de ejecutar la acción a propósito: el estado del DOM sobre
   * el que hay que medir la resolución es en el que se resolvió, no el que deja
   * la acción. Y solo se guarda la foto; si el caso entra o no en el corpus se
   * decide al final (ver flushCorpus), cuando ya se sabe si algo lo corrobora.
   */
  private async captureCorpusCandidate(
    flow: WalkFlow,
    step: WalkStep,
    resolved: { locator: Locator; via: string; frame_path: string[] },
  ): Promise<void> {
    if (!this.opts.corpusDir || this.verifying) return;
    const id = `${this.script.site_id}-${flow.flow}-${step.id}`;
    const marca = `data-corpus-target`;
    try {
      await resolved.locator.evaluate((el, attr: string) => el.setAttribute(attr, '1'), marca);
      await this.freezeVisibility(true);
      const html = await this.page.content();
      const shadow = await this.contarShadowConContenido();
      await this.freezeVisibility(false);
      if (shadow > 0) this.avisoShadow(id, shadow);
      // la marca se retira de la página VIVA: la foto ya la lleva dentro, pero
      // dejarla puesta sería mutar la app bajo prueba más allá del paso
      await resolved.locator.evaluate((el, attr: string) => el.removeAttribute(attr), marca).catch(() => {});
      const archivo = `${id}.html`;
      mkdirSync(this.opts.corpusDir, { recursive: true });
      writeFileSync(resolve(this.opts.corpusDir, archivo), html, 'utf8');
      this.corpusPendiente.push({
        id,
        flow: flow.flow,
        step: step.id,
        archivo,
        action: step.action,
        hint: step.hint,
        scope: step.scope,
        via: resolved.via,
        frame_path: resolved.frame_path,
        tienePostcondicion: typeof step.expect_after === 'string' && step.expect_after.length > 0,
      });
    } catch {
      // capturar corpus JAMÁS puede tumbar un run: es telemetría, no producto
    }
  }

  /**
   * Fotografía el DOM de un paso que la escalera NO resolvió, para el banco de
   * rescates. Sin marca de objetivo: el walker no sabe cuál era, y esa es
   * exactamente la razón por la que el paso está aquí.
   */
  private async captureBlockedForRescue(flow: WalkFlow, step: WalkStep, motivo: string): Promise<void> {
    if (!this.opts.corpusDir || this.verifying) return;
    const id = `${this.script.site_id}-${flow.flow}-${step.id}`;
    try {
      await this.freezeVisibility(true);
      const html = await this.page.content();
      const shadow = await this.contarShadowConContenido();
      await this.freezeVisibility(false);
      if (shadow > 0) this.avisoShadow(id, shadow);
      const archivo = `bloqueado-${id}.html`;
      mkdirSync(this.opts.corpusDir, { recursive: true });
      writeFileSync(resolve(this.opts.corpusDir, archivo), html, 'utf8');
      this.bloqueadosPendiente.push({
        id,
        flow: flow.flow,
        step: step.id,
        archivo,
        action: step.action,
        hint: step.hint,
        scope: step.scope,
        motivo,
      });
    } catch {
      // telemetría, no producto: capturar jamás puede tumbar un run
    }
  }

  /**
   * K0.38 — LA FOTO NO LLEVA LO QUE HAY DENTRO DE UN SHADOW ROOT, y callarlo
   * convierte el corpus en basura silenciosa. Medido en Vaadin: `page.content()`
   * serializa el documento pero NO los árboles de sombra, así que la etiqueta
   * "Email" —que vive dentro del `<vaadin-text-field>`— desaparece de la foto y
   * el caso resuelve en vivo y se planta offline, sin que nada lo diga.
   *
   * Serializar shadow es trabajo aparte (y decidirlo, también). Lo que no puede
   * quedarse es la omisión muda: se cuenta y se declara, en el audit y en la
   * consola. Vale para el banco de resolución y para el corpus de Mind2Web.
   */
  private async contarShadowConContenido(): Promise<number> {
    return (await this.page
      .evaluate(
        `(() => {
          let n = 0;
          const visitar = (raiz) => {
            for (const el of raiz.querySelectorAll('*')) {
              if (el.shadowRoot) {
                if ((el.shadowRoot.textContent || '').trim().length > 0) n++;
                visitar(el.shadowRoot);
              }
            }
          };
          visitar(document);
          return n;
        })()`,
      )
      .catch(() => 0)) as number;
  }

  private avisoShadow(id: string, cuantos: number): void {
    this.audit('skip', `foto del corpus INCOMPLETA en ${id}: ${cuantos} shadow root(s) con contenido no serializado`, {
      phase: 'corpus',
      shadow_roots: cuantos,
    });
    console.error(
      `[dom-walker] AVISO corpus ${id}: la pantalla tiene ${cuantos} shadow root(s) con contenido y page.content() NO los serializa — ` +
        `la foto NO reproduce lo que vio la escalera.`,
    );
  }

  /**
   * K0.32 — CONGELA la visibilidad dentro de la foto. Medido con el primer
   * corpus real (tufarmacia): dos de tres casos que resolvían EN VIVO se
   * plantaban sobre su propia fotografía, y la causa era la misma en los dos —
   * la foto no lleva las hojas de estilo (son peticiones externas), y sin CSS
   * lo que estaba oculto pasa a estar visible: donde en vivo había UNA
   * coincidencia visible, offline había dos, y la regla dura se plantaba.
   *
   * Como la visibilidad es carga estructural de esa regla, la foto tiene que
   * llevarla dentro. Se marcan los elementos que AHORA MISMO están ocultos y se
   * inyecta una regla que los mantenga ocultos sin depender de ningún CSS
   * externo. Aplicarlo en vivo no cambia nada de lo que se ve —solo se marca lo
   * que ya estaba oculto— y se retira justo después de serializar.
   *
   * No pretende conservar el aspecto de la página: conserva lo único que la
   * escalera mira.
   */
  private async freezeVisibility(on: boolean): Promise<void> {
    const STYLE_ID = 'qa-corpus-visibility';
    const ATTR = 'data-corpus-hidden';
    await this.page
      .evaluate(
        ({ activar, styleId, attr }) => {
          if (!activar) {
            document.getElementById(styleId)?.remove();
            for (const el of Array.from(document.querySelectorAll(`[${attr}]`))) el.removeAttribute(attr);
            return;
          }
          /**
           * CAJA CERO NO ES OCULTO. Medido montando el banco de rescates: el
           * `<p-dialog>` de PrimeNG es un elemento anfitrión de caja 0×0 cuyo
           * contenido va posicionado — la regla vieja lo marcaba oculto y, al
           * inyectar `display:none`, hundía el diálogo ENTERO dentro de la foto.
           * El caso quedaba inservible para el banco: el objetivo aparecía
           * invisible en una pantalla donde estaba a la vista.
           *
           * Es la misma trampa que el envoltorio de altura cero de TrustArc
           * (K0.33/D4). La condición correcta no es "este elemento no se ve",
           * es "no se ve Y no contiene nada que se vea": ocultar un envoltorio
           * cambia la visibilidad de sus hijos, y la foto existe justo para
           * conservarla.
           */
          const VIS = 'data-corpus-vis-tmp';
          const todos = Array.from(document.body.querySelectorAll('*'));
          for (const el of todos) {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const seVe = cs.display !== 'none' && cs.visibility !== 'hidden' && (r.width > 0 || r.height > 0);
            if (seVe) el.setAttribute(VIS, '1');
          }
          for (const el of todos) {
            if (el.hasAttribute(VIS)) continue;
            if (el.querySelector(`[${VIS}]`)) continue; // envoltorio de algo que sí se ve
            el.setAttribute(attr, '1');
          }
          for (const el of todos) el.removeAttribute(VIS);
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = `[${attr}]{display:none !important}`;
          document.head.appendChild(style);
        },
        { activar: on, styleId: STYLE_ID, attr: ATTR },
      )
      .catch(() => {});
  }

  /**
   * Reparte los candidatos entre el corpus (verdad corroborada) y los
   * pendientes de revisión humana, con el motivo de cada exclusión. El veredicto
   * lo da `corpusVerdict`, que es puro y está aparte precisamente porque es el
   * criterio que decide si el banco mide algo o se mide a sí mismo.
   */
  private flushCorpus(): void {
    if (!this.opts.corpusDir || this.corpusPendiente.length === 0) return;
    const reports = this.state.step_reports ?? [];
    const casos: string[] = [];
    const pendientes: string[] = [];
    for (const c of this.corpusPendiente) {
      const r = reports.find((x) => x.flow === c.flow && x.step === c.step);
      const v = corpusVerdict({
        outcome: r?.outcome ?? 'action_failed',
        tienePostcondicion: c.tienePostcondicion,
        via: c.via,
        frame_path: c.frame_path,
      });
      const base = {
        id: c.id,
        site: this.script.site_id,
        task: `${c.flow}/${c.step}`,
        html_path: c.archivo,
        action: c.action,
        hint: c.hint ?? {},
        ...(c.scope ? { scope: c.scope } : {}),
        target: '[data-corpus-target]',
      };
      if (v.incluir) casos.push(JSON.stringify({ ...base, verdad: v.motivo }));
      else pendientes.push(JSON.stringify({ ...base, excluido: v.motivo, resuelto_como: c.via }));
    }
    const dir = this.opts.corpusDir;
    if (casos.length > 0) writeFileSync(resolve(dir, 'manifest.jsonl'), `${casos.join('\n')}\n`, 'utf8');
    if (pendientes.length > 0) writeFileSync(resolve(dir, 'pendientes.jsonl'), `${pendientes.join('\n')}\n`, 'utf8');
    if (this.bloqueadosPendiente.length > 0) {
      const bl = this.bloqueadosPendiente.map((b) =>
        JSON.stringify({
          id: b.id,
          site: this.script.site_id,
          task: `${b.flow}/${b.step}`,
          html_path: b.archivo,
          action: b.action,
          hint: b.hint ?? {},
          ...(b.scope ? { scope: b.scope } : {}),
          motivo: b.motivo,
          target: null, // lo marca una persona: el walker no sabe cuál era
        }),
      );
      writeFileSync(resolve(dir, 'bloqueados.jsonl'), `${bl.join('\n')}\n`, 'utf8');
      console.error(`[dom-walker] banco de rescates: ${bl.length} paso(s) bloqueado(s) fotografiado(s) → ${dir}`);
    }
    this.audit('allow', `corpus del banco: ${casos.length} casos con verdad, ${pendientes.length} pendientes de revisión`, {
      phase: 'corpus',
      casos: casos.length,
      pendientes: pendientes.length,
      dir,
    });
    console.error(
      `[dom-walker] corpus: ${casos.length} caso(s) con verdad corroborada, ${pendientes.length} pendiente(s) → ${dir}`,
    );
  }

  // ------------------------------------------------- banco de resolución

  /**
   * K0.31 — punto de entrada del BANCO (Mind2Web y cualquier corpus de páginas
   * estáticas). Corre la escalera REAL sobre una página ya cargada y devuelve
   * qué resolvió, sin ejecutar nada.
   *
   * Que sea un método del propio walker y no una reimplementación es la única
   * forma de que la medida signifique algo: un banco que evalúa una copia de la
   * escalera mide la copia. Y sin ejecutar la acción porque el corpus son
   * FOTOGRAFÍAS del DOM — clicar en una página muerta no prueba nada y puede
   * navegar. La acción del paso sí importa, porque desde K0.28 decide qué
   * peldaños entran (el anclado no corre para un click).
   */
  static forBench(page: Page, contract: StyleContract, workDir: string, aliasesPath: string): DomWalker {
    const script: WalkScript = { version: 1, site_id: 'bench', entry: '/', flows: [] };
    const state: WalkState = {
      script_hash: 'bench', completed: [], rescues_used: 0, screens: [], transitions: [],
      open_questions: [], rescues: [], current_screen: null, step_reports: [],
    };
    const opts: WalkerOptions = {
      scriptPath: 'bench', contractPath: 'bench', workDir, rescueBudget: 0, screenCap: 0,
      headed: false, assist: false, assistTimeoutMs: 0, assistMinimize: false,
      aliasesPath, timingProfilePath: resolve(workDir, 'timing.json'), calibrate: false,
    };
    const walker = new DomWalker(opts, script, contract, state);
    walker.page = page;
    return walker;
  }

  /** Resuelve un paso contra la página del banco. Devuelve la cadena y el locator. */
  async benchResolve(step: WalkStep): Promise<{ locator: Locator; via: string } | null> {
    const r = await this.resolveHint(step);
    return r ? { locator: r.locator, via: r.via } : null;
  }

  // ------------------------------------------- sincronización (K0.13)

  /** Perfil de tiempos durable. Ausente o corrupto → vacío (nunca revienta el run). */
  private loadTiming(): TimingProfile {
    try {
      if (existsSync(this.timingPath)) {
        const parsed = parseJsonLoose<TimingProfile>(readFileSync(this.timingPath, 'utf8'));
        if (parsed.version === 1 && parsed.steps) return parsed;
      }
    } catch {
      console.error(`[dom-walker] timing-profile ilegible (${this.timingPath}) — se ignora`);
    }
    return { version: 1, site_id: this.script.site_id, steps: {} };
  }

  private saveTiming(): void {
    if (Object.keys(this.timing.steps).length === 0) return;
    const dir = resolve(this.timingPath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const sorted: TimingProfile = {
      version: 1,
      site_id: this.timing.site_id,
      steps: Object.fromEntries(Object.entries(this.timing.steps).sort(([a], [b]) => (a < b ? -1 : 1))),
    };
    writeFileSync(this.timingPath, JSON.stringify(sorted, null, 2), 'utf8');
  }

  /**
   * Settle efectivo del paso. Precedencia: DEFAULT < contract < script < CLI < paso.
   * El timeout se CALIBRA con lo observado en runs anteriores (capa 4) salvo que el
   * paso declare el suyo: una declaración explícita del QA no se pisa con estadística.
   *
   * Fase 5 (SPEC-caos-corporativo §4) — `debounced`/`debounce_ms` ELEVAN el piso
   * de `quiet_ms` al intervalo del debounce. Tras teclear hay un hueco de calma
   * IGUAL al debounce antes de que salga la petición, y ese hueco es calma FALSA
   * (la clase K0.17 "todavía no ha empezado" reubicada en inputs): con
   * `quiet_ms` genérico (400 ms) más corto que el debounce, la ventana se cierra
   * DENTRO del hueco y el paso siguiente actúa contra un resultado que aún no
   * llegó. Elevar el piso no "espera el debounce y ya" — el algoritmo de la capa
   * 2 hace el resto solo: si el resultado tarda más que el piso, su mutación
   * REINICIA la cuenta de quietud igual que un ciclo de spinner, así que
   * "aparece el oráculo del resultado" (b) queda cubierto por el mecanismo de
   * siempre, no por código nuevo — esta es la única pieza que faltaba (a).
   */
  private settleProfileFor(flow: WalkFlow, step: WalkStep): Required<SettleProfile> {
    const profile = mergeSettle(this.contract.settle, this.script.settle, this.opts.settleOverride, step.settle);
    const debounceMs = effectiveDebounceMs(step);
    if (debounceMs > 0) profile.quiet_ms = Math.max(profile.quiet_ms, debounceMs);
    if (this.opts.calibrate && step.settle?.timeout_ms === undefined) {
      const samples = this.timing.steps[`${flow.flow}/${step.id}`]?.samples ?? [];
      const calibrated = calibratedTimeout(samples);
      if (calibrated !== null) profile.timeout_ms = calibrated;
    }
    return profile;
  }

  /**
   * Capa 2 — espera a que la pantalla esté QUIETA durante `quiet_ms` seguidos, no a
   * que el spinner desaparezca una vez. Esa es toda la diferencia: en una SPA que
   * abre el spinner 2 o 3 veces por carga, el hueco entre ciclos es una ventana
   * falsa de calma, y actuar dentro de ella es el fallo intermitente clásico
   * ("el clic ocurrió y no sirvió de nada").
   *
   * Devuelve OBSERVACIÓN, no veredicto: agotar el tope no bloquea el paso — el
   * oráculo es la postcondición (capa 3). Y los ciclos contados son el dato que
   * alimenta la calibración (capa 4) y el informe de flakiness del entorno.
   *
   * Se observa el frame principal Y los iframes accesibles: un MutationObserver del
   * top no ve dentro de un iframe, y en corporativo el spinner suele vivir ahí.
   */
  private async waitForSettle(profile: Required<SettleProfile>): Promise<SettleObservation> {
    const IFRAME_CAP = 4;
    const scopes: Array<Page | Frame> = [this.page];
    for (const f of this.page.frames()) {
      if (f === this.page.mainFrame()) continue;
      if (scopes.length > IFRAME_CAP) break;
      scopes.push(f);
    }

    const script = settleScript({
      busySel: profile.busy_selectors,
      ignoreSel: [...profile.ignore_selectors, `[${ASSIST_HOST_ATTR}]`],
      quietMs: profile.quiet_ms,
      timeoutMs: profile.timeout_ms,
      maxMut: profile.max_mutations,
    });

    const observe = async (scope: Page | Frame): Promise<SettleObservation> => {
      // red de seguridad de Node: el bucle in-page se autolimita, pero si el
      // contexto muere a media navegación evaluate puede quedar colgado. El timer
      // se CANCELA al ganar la carrera; si no, cada settle deja 12 s de timer vivo.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const guard = new Promise<SettleObservation>((r) => {
        timer = setTimeout(
          () => r({ waited_ms: profile.timeout_ms, busy_cycles: 0, resets: 0, timed_out: true, signals: [] }),
          profile.timeout_ms + 2_000,
        );
      });
      try {
        return await Promise.race([scope.evaluate<SettleObservation>(script), guard]);
      } catch (err) {
        // el contexto murió a media navegación: se sigue, pero NO en silencio —
        // un settle inerte es indistinguible de una app rápida en el informe.
        const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
        console.error(`[dom-walker] settle no observado (${msg}) — se continúa sin ventana de quietud`);
        return { waited_ms: 0, busy_cycles: 0, resets: 0, timed_out: false, signals: [] };
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    const results = await Promise.all(scopes.map(observe));

    /**
     * K0.33 — el barrido de consentimiento, TAMBIÉN aquí. Medido en campo (UI5,
     * sitio 2): el CMP era TrustArc, estaba en el catálogo de familias y su banner
     * era `position: fixed`, o sea que la detección habría funcionado — lo que
     * falló fue el MOMENTO. El barrido iba pegado al `goto`, y los gestores de
     * consentimiento se cargan asíncronos: cuando miramos, el banner todavía no
     * existía. Después nada volvió a mirar (el `addLocatorHandler` solo dispara en
     * comprobaciones de accionabilidad, y hasta el primer paso no hay ninguna), así
     * que el run terminó con CERO apuntes de consentimiento y el banner intacto: un
     * fallo por silencio, no por rojo.
     *
     * Aquí no cuesta nada y llega justo a tiempo: la pantalla acaba de quedarse
     * quieta —o sea que el CMP ya se inyectó— y todavía no hemos actuado sobre
     * ella. El caso residual conocido: una página en la que el guion no da ningún
     * paso (la de entrada, aquí) no se barre; es inocuo, porque se abandona sin
     * tocarla, y arreglarlo costaría una espera fija en CADA navegación.
     */
    await this.dismissConsent();

    return {
      waited_ms: Math.max(...results.map((r) => r.waited_ms)),
      busy_cycles: results.reduce((n, r) => n + r.busy_cycles, 0),
      resets: results.reduce((n, r) => n + r.resets, 0),
      timed_out: results.some((r) => r.timed_out),
      signals: [...new Set(results.flatMap((r) => r.signals))],
      // K0.17: se perdía al agregar los frames, y es justo el dato que explica
      // por qué un paso falló sobre una pantalla que aún no había montado
      ...(results.some((r) => r.started_empty) ? { started_empty: true } : {}),
    };
  }

  /**
   * Huella de pantalla. Es lo que convierte el reintento en algo seguro: si la
   * postcondición falla y la huella NO cambió, la acción no surtió efecto y
   * repetirla es inocuo. Si la huella cambió, algo pasó — y repetir podría
   * duplicar una operación de negocio, así que no se repite: es candidato a drift.
   */
  private async fingerprint(): Promise<string> {
    const sig = await this.page
      .evaluate(() => {
        const visible = (el: Element): boolean => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const els = Array.from(
          document.querySelectorAll('h1,h2,h3,[role="heading"],button,a,input,select,textarea,[role="status"],[role="alert"]'),
        ).filter(visible);
        const names = els
          .slice(0, 80)
          .map((e) => e.getAttribute('aria-label') ?? e.textContent ?? e.getAttribute('name') ?? e.tagName)
          .map((s) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 40));
        return `${els.length}|${names.join('~')}`;
      })
      .catch(() => '');
    return fingerprintHash(`${this.page.url()}#${this.page.frames().length}#${sig}`);
  }

  /** Registra la telemetría del paso y alimenta el perfil de tiempos. */
  private pushReport(flow: WalkFlow, step: WalkStep, r: Omit<StepReport, 'flow' | 'step' | 'action'>): void {
    // K0.25: el replay de verificación no reporta — sobrescribiría por clave los
    // reports del run principal (el rodaje: s1 asistido ~15s quedó como 563 ms).
    if (this.verifying) return;
    const reports = (this.state.step_reports ??= []);
    const at = reports.findIndex((x) => x.flow === flow.flow && x.step === step.id);
    const report: StepReport = { flow: flow.flow, step: step.id, action: step.action, ...r };
    /**
     * K0.39 — LA POSTCONDICIÓN QUE PUEDE ESTAR MIRANDO EL ESTADO ANTERIOR. Tercera
     * instancia de la familia del verde falso en dos sesiones, y esta se cazó en mi
     * propio guion de Vaadin: `expect_text 'Storefront'` pasó porque un flujo previo
     * ya había entrado, y `expect_text 'Vanilla Cracker'` pasó porque la rejilla NO
     * se había filtrado — el paso que debía filtrarla estaba bloqueado.
     *
     * No hace falta adivinar nada: el walker SABE que un paso anterior del mismo
     * flujo quedó bloqueado. Una aserción que pasa después de eso puede estar
     * observando lo que ya había, y decirlo es citar un hecho. El veredicto no
     * cambia —igual que en K0.37—: la aserción se cumplió, y puede ser legítima.
     */
    if (ASSERTION_ACTIONS.has(step.action) && report.outcome === 'ok') {
      const previo = this.state.open_questions.find((q) => q.flow === flow.flow);
      if (previo) report.after_blocked = previo.step;
    }
    /**
     * K0.41 — EL PELDAÑO DÉBIL SE AUTODELATA. Medido contra 6.249 páginas reales
     * (§30): el peldaño de rol dio 2.954 aciertos y 5 fallos; el de texto, 1.216
     * y 33. Treinta y tres de los treinta y ocho fallos del corpus salieron de
     * aquí, y hasta ahora se reportaban igual que los demás.
     *
     * Y `sin_red` es la combinación que de verdad preocupa: resuelto por el
     * vocabulario más flojo y sin ninguna aserción de negocio detrás. Con red, un
     * elemento equivocado suele hacer fallar la postcondición; sin red no lo caza
     * nadie — y el Reviewer tampoco, porque audita el código, no la pantalla.
     */
    /**
     * Solo pasos que ACTÚAN. Una aserción resuelta por texto no es un riesgo
     * silencioso: comprobar texto ES buscar texto, y marcarla «sin red» es
     * absurdo porque la red es ella. Lo cazó el simulacro en su primer run — el
     * aviso salía sobre tres `expect_text` y habría enseñado al QA a ignorarlo.
     */
    if (!ASSERTION_ACTIONS.has(step.action) && classifyVia(report.resolved_via).startsWith('texto')) {
      report.peldano_debil = true;
      if (this.ultimaDescripcion) report.resolved_desc = this.ultimaDescripcion;
      const yo = flow.steps.findIndex((s) => s.id === step.id);
      const hayRed = yo >= 0 && flow.steps.slice(yo + 1).some((s) => ASSERTION_ACTIONS.has(s.action));
      if (!hayRed) report.sin_red = true;
    }
    if (at >= 0) reports[at] = report;
    else reports.push(report);
    /**
     * K0.17 — la muestra se registra TAMBIÉN cuando se agotó el tope. Antes solo se
     * guardaban los settles limpios, con el efecto perverso de que los pasos que más
     * necesitan tiempo (los que agotan el tope) eran exactamente los que nunca lo
     * aprendían: su timeout se quedaba clavado para siempre. Medido en OrangeHRM,
     * donde "My Info" no se estabiliza en 10 s y jamás dejaba muestra.
     *
     * Un paso que cuelga de verdad hace subir su tope run a run hasta el techo de
     * 60 s, y eso queda visible en `stats.settle_timeouts`: se paga en reloj, no en
     * un diagnóstico falso.
     */
    if (r.settle) {
      updateTimingProfile(this.timing, `${flow.flow}/${step.id}`, r.settle.waited_ms, {
        screen: step.screen ?? this.state.current_screen ?? undefined,
      });
    }
  }

  /** hint-aliases durable (K0.5): memoria de instancias del cliente. Ausente o corrupto → vacío. */
  private loadAliases(): HintAliasFile {
    try {
      if (existsSync(this.aliasesPath)) {
        const parsed = parseJsonLoose<HintAliasFile>(readFileSync(this.aliasesPath, 'utf8'));
        if (parsed.version === 1 && parsed.aliases) return parsed;
      }
    } catch {
      console.error(`[dom-walker] hint-aliases ilegible (${this.aliasesPath}) — se ignora`);
    }
    return { version: 1, site_id: this.script.site_id, aliases: {} };
  }

  private saveAliases(): void {
    const sorted: HintAliasFile = {
      version: 1,
      site_id: this.aliases.site_id,
      aliases: Object.fromEntries(Object.entries(this.aliases.aliases).sort(([a], [b]) => (a < b ? -1 : 1))),
    };
    mkdirSync(resolve(this.aliasesPath, '..'), { recursive: true });
    writeFileSync(this.aliasesPath, JSON.stringify(sorted, null, 2), 'utf8');
  }

  private baseUrl(): string {
    const base = this.opts.baseUrl ?? this.script.base_url;
    if (!base) throw new Error('base_url no definida (ni en el script ni por --base-url)');
    return base.replace(/\/+$/, '');
  }

  private resolveTarget(target: string): string {
    if (/^https?:\/\//.test(target)) return target;
    return this.baseUrl() + (target.startsWith('/') ? target : `/${target}`);
  }

  /** Checkpoint: estado + sesión del navegador (cookies/localStorage) para reanudar. */
  private async persist(): Promise<void> {
    this.state.testid_attr = this.testidAttr;
    if (this.context) {
      await this.context
        .storageState({ path: resolve(this.opts.workDir, 'walk-session.json') })
        .catch(() => {});
    }
    writeFileSync(resolve(this.opts.workDir, 'walk-state.json'), JSON.stringify(this.state, null, 2), 'utf8');
  }

  private markCompleted(key: string): void {
    if (!this.state.completed.includes(key)) this.state.completed.push(key);
  }

  private audit(action: 'llm_call' | 'allow' | 'block' | 'skip', reason: string, metadata?: Record<string, unknown>): void {
    // K0.25: lo ocurrido en el replay de verificación queda auditado (es evidencia)
    // pero MARCADO — tres "select drift tolerado" idénticos sin marca costaron el
    // diagnóstico del rodaje.
    const meta = this.verifying ? { ...(metadata ?? {}), verifying: true } : metadata;
    appendAuditEntry(
      { source: 'command', action, target: 'dom-walker', reason, ...(meta ? { metadata: meta } : {}) },
      this.auditPath,
    );
  }

  // ---------------------------------------------- estorbos opt-in (Fase 2)

  /**
   * Fase 2 (SPEC-caos-corporativo §4) — auto-descarte de estorbos que la
   * ventana de quietud NO PUEDE VER por diseño: el DOM está quieto, el overlay
   * solo está ENCIMA interceptando el puntero. `page.addLocatorHandler` dispara
   * cuando el selector declarado está visible, ANTES de que Playwright reintente
   * la accionabilidad del paso real — es el único sitio donde puede vivir esto:
   * una vez por página, no por paso.
   *
   * OFF por defecto: sin `contract.obstructions.dismiss`, este método no
   * registra nada, y un estorbo no descrito bloquea el paso con el motivo de
   * Playwright (pointer events interceptados) — nunca se barre en silencio.
   * Declararlo puede enmascarar un bug real (barrer un overlay que no debía
   * estar); por eso cada descarte es un evento de primera clase en el
   * audit-log, no una decisión callada del código.
   */
  /**
   * K0.30 — CONSENTIMIENTO POR DISEÑO. El banner de cookies no es una rareza de
   * un sitio: sale en la mayoría de los portales corporativos, y hasta ahora
   * cada cliente tenía que redescubrirlo y declararlo a mano en su pack (con el
   * riesgo, medido en §20, de envenenar el run si el selector no se podía
   * descartar). El walker lo trata como trata las fachadas de los desplegables:
   * conociendo la FAMILIA (el CMP) y comprobando el DOM.
   *
   * Reglas duras, en este orden:
   *  1. Solo actúa sobre algo que ESTÁ SUPERPUESTO (position fixed/sticky, o
   *     absolute con z-index alto). Un `<section>` estático que hable de cookies
   *     —la política de la propia web— no es un estorbo y no se toca. Esta es la
   *     guarda que evita que la detección por familia se coma contenido legítimo.
   *  2. RECHAZAR antes que cerrar: ante un consentimiento, la opción correcta es
   *     la que menos datos cede.
   *  3. Cerrar / Escape.
   *  4. Si lo único que queda es ACEPTAR, no se pulsa NUNCA — el consentimiento
   *     lo da el usuario, no el walker. El banner se neutraliza localmente
   *     (ocultándolo y devolviendo el scroll al documento), lo cual no envía
   *     ninguna señal al sitio, y queda AUDITADO diciendo exactamente eso.
   */
  private async dismissConsent(): Promise<void> {
    if (this.contract.consent?.enabled === false) return;
    const selector = consentSelector(this.contract.consent?.extra_selectors ?? []);
    const stepKey = this.currentStepKey ?? '(fuera de un paso)';
    for (const { scope } of await this.scopes()) {
      const banners = scope.locator(selector);
      const total = Math.min(await banners.count().catch(() => 0), 8);
      /**
       * Solo los contenedores más externos QUE SE VEAN (K0.30 + K0.33). Los
       * patrones genéricos por `aria-label*="cookie"` matchean también los
       * enlaces de DENTRO del banner ("learn more about cookies", "dismiss
       * cookie message"): medido en vivo, un solo banner producía tres apuntes y
       * tres barridos. El banner es el contenedor; sus hijos no son banners
       * distintos.
       *
       * K0.33 — pero "más externo" NO es lo mismo que "el banner". Medido en
       * campo (UI5, sitio 2): TrustArc cuelga su barra de un envoltorio
       * `div#consent_blackbar` de ALTURA CERO, y el banner de verdad
       * (`#truste-consent-track`, 1442x126, fixed) es hijo suyo. Con la regla
       * anterior se elegía el envoltorio, la puerta de visibilidad lo descartaba
       * —correctamente, no se ve— y el banner real se saltaba por anidado: las
       * dos reglas juntas dejaban el CMP intacto y el run sin un solo apunte. El
       * ancestro solo tapa a su hijo si él mismo se ve.
       */
      const outer: number[] = [];
      for (let i = 0; i < total; i += 1) {
        const anidado = await banners
          .nth(i)
          .evaluate((el, sel: string) => {
            const seVe = (n: Element): boolean => {
              const cs = getComputedStyle(n);
              if (cs.visibility === 'hidden' || cs.display === 'none') return false;
              const r = n.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            };
            for (let p = el.parentElement; p; p = p.parentElement) if (p.matches(sel) && seVe(p)) return true;
            return false;
          }, selector)
          .catch(() => false);
        if (!anidado) outer.push(i);
      }
      for (const i of outer) {
        const banner = banners.nth(i);
        if (!(await banner.isVisible().catch(() => false))) continue;
        if (!(await this.isOverlaying(banner))) continue; // contenido estático: no es un estorbo
        const key = await banner.evaluate((el) => `${el.tagName}#${el.id}.${el.className}`).catch(() => selector);
        if (this.consentHandled.has(key)) continue;

        const botones = banner.getByRole('button').or(banner.getByRole('link'));
        const rechazo = botones.filter({ hasText: CONSENT_REJECT }).first();
        let via = '';
        if ((await rechazo.count().catch(() => 0)) > 0) {
          await rechazo.click({ timeout: 3_000 }).catch(() => {});
          via = 'rechazo';
        }
        if (await banner.isVisible().catch(() => false)) {
          const cerrar = botones
            .filter({ hasText: CONSENT_CLOSE })
            .or(banner.locator('[aria-label*="cerrar" i], [aria-label*="close" i], .close'))
            .first();
          /**
           * Guarda innegociable (K0.30): pase lo que pase, no se pulsa algo que
           * LEE como aceptación. Hay CMP que etiquetan su botón de aceptar como
           * "dismiss cookie message" (medido en vivo en la gira) — sin esta
           * comprobación, la estrategia de "cerrar" otorgaría el consentimiento
           * creyendo que solo cierra. El texto manda sobre el aria-label.
           *
           * El `count()` va PRIMERO y el `textContent` con tope corto: leer el
           * texto de un locator que matchea CERO elementos no devuelve vacío, se
           * queda esperando a que aparezca el tope entero (30 s por defecto) — y
           * como este barrido corre dentro de la espera de accionabilidad del
           * paso, se comía su presupuesto. Cazado en el primer run de campo tras
           * escribirlo: una postcondición que sí estaba en pantalla se declaró
           * incumplida por culpa del reloj, no del DOM.
           */
          if ((await cerrar.count().catch(() => 0)) > 0) {
            const texto = ((await cerrar.textContent({ timeout: 1_000 }).catch(() => '')) ?? '').trim();
            if (!CONSENT_ACCEPT.test(texto)) {
              await cerrar.click({ timeout: 3_000 }).catch(() => {});
              via = via || 'cierre';
            }
          }
        }
        if (await banner.isVisible().catch(() => false)) {
          await this.page.keyboard.press('Escape').catch(() => {});
          via = via || 'escape';
        }
        if (await banner.isVisible().catch(() => false)) {
          // Solo queda aceptar — y eso no lo hace el walker.
          const soloAceptar = (await botones.filter({ hasText: CONSENT_ACCEPT }).count().catch(() => 0)) > 0;
          await banner
            .evaluate((el) => {
              (el as HTMLElement).style.setProperty('display', 'none', 'important');
              // los CMP suelen bloquear el scroll del documento mientras deciden
              for (const node of [document.documentElement, document.body]) {
                node.style.removeProperty('overflow');
                node.style.setProperty('overflow', 'auto');
              }
            })
            .catch(() => {});
          this.consentHandled.add(key);
          this.audit(
            'skip',
            `consentimiento NO otorgado en ${stepKey}: el banner (${key}) solo ofrecía ` +
              `${soloAceptar ? 'aceptar' : 'opciones no reconocidas'}; aceptar es decisión del usuario, ` +
              'así que se ha neutralizado localmente (ocultado, sin enviar ninguna señal al sitio)',
            { phase: 'consent', outcome: 'neutralizado-sin-consentir', cmp: key, step: stepKey },
          );
          continue;
        }
        this.consentHandled.add(key);
        this.audit('skip', `banner de consentimiento descartado en ${stepKey} por ${via}: ${key}`, {
          phase: 'consent',
          outcome: via,
          cmp: key,
          step: stepKey,
        });
      }
    }
  }

  /**
   * ¿Está SUPERPUESTO al contenido? Es la diferencia entre un banner de cookies
   * y la sección de la política de cookies: el primero flota encima (fixed /
   * sticky / absolute con z-index), la segunda fluye con el documento. Sin esta
   * comprobación, la detección por familia se comería contenido legítimo — y un
   * walker que borra contenido de la página bajo prueba no vale nada.
   */
  private async isOverlaying(locator: Locator): Promise<boolean> {
    return locator
      .evaluate((el) => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          const cs = getComputedStyle(node);
          if (cs.position === 'fixed' || cs.position === 'sticky') return true;
          if (cs.position === 'absolute' && Number(cs.zIndex) >= 100) return true;
        }
        return false;
      })
      .catch(() => false);
  }

  /**
   * K0.30 — red de seguridad del consentimiento: el banner que aparece TARDE
   * (los CMP se cargan asíncronos y muchos entran segundos después del load, ya
   * en mitad del flujo). Un único manejador para todas las familias, con
   * `noWaitAfter` por la lección de K0.29: si el barrido no lo quita, la acción
   * no se cuelga esperando a que se oculte.
   */
  private async installConsentHandler(): Promise<void> {
    if (this.contract.consent?.enabled === false) return;
    const selector = consentSelector(this.contract.consent?.extra_selectors ?? []);
    await this.page.addLocatorHandler(
      this.page.locator(selector).first(),
      async () => {
        await this.dismissConsent();
      },
      { noWaitAfter: true },
    );
  }

  private async installObstructionHandlers(): Promise<void> {
    const selectors = this.contract.obstructions?.dismiss ?? [];
    for (const selector of selectors) {
      const obstruction = this.page.locator(selector);
      await this.page.addLocatorHandler(
        obstruction,
        async (locator) => {
          /**
           * K0.29 — un estorbo que ya se midió como INDESCARTABLE no se vuelve a
           * intentar: el manejador se dispara antes de CADA acción, y repetir una
           * estrategia que no funcionó solo añade latencia y ruido al audit.
           */
          if (this.undismissable.has(selector)) return;
          const stepKey = this.currentStepKey ?? '(fuera de un paso)';
          // Escape primero: cierra la mayoría de overlays/backdrops sin necesitar
          // un control de cierre propio. Si el estorbo trae uno (banner de
          // cookies, snackbar con acción "Cerrar"), es el respaldo cuando Escape
          // no hizo nada; si no hay ninguno de los dos, el último recurso es
          // clicar el estorbo mismo (backdrops que cierran al clicar fuera).
          await this.page.keyboard.press('Escape').catch(() => {});
          if (await locator.count().catch(() => 0)) {
            const closeBtn = locator
              .locator(
                '[aria-label*="cerrar" i], [aria-label*="close" i], button:has-text("Cerrar"), button:has-text("Close"), .close, .cerrar, .dismiss',
              )
              .first();
            if (await closeBtn.count().catch(() => 0)) await closeBtn.click({ timeout: 2_000 }).catch(() => {});
            else await locator.click({ timeout: 2_000 }).catch(() => {});
          }
          /**
           * K0.29 — y se COMPRUEBA. Antes se auditaba "estorbo descartado" ANTES
           * de intentarlo: el audit afirmaba un hecho que nadie había verificado.
           * Medido en la gira (BootsFaces, banner `cookieconsent`): la estrategia
           * genérica no puede quitarlo —y no debe: el único botón es "Accept
           * Cookies", y aceptar el consentimiento no es decisión del walker—, así
           * que el estorbo seguía ahí con el audit diciendo que se había ido.
           */
          if (await locator.first().isVisible().catch(() => false)) {
            this.undismissable.add(selector);
            this.audit(
              'skip',
              `estorbo NO descartado en ${stepKey}: ${selector} — sigue visible tras Escape/cierre/clic; ` +
                'el manejador queda inerte (si tapa un objetivo, el paso fallará con el motivo real de Playwright)',
              { phase: 'obstruction-dismiss', selector, step: stepKey, dismissed: false },
            );
            return;
          }
          this.audit('skip', `estorbo descartado en ${stepKey}: ${selector}`, {
            phase: 'obstruction-dismiss',
            selector,
            step: stepKey,
            dismissed: true,
          });
        },
        /**
         * K0.29 — `noWaitAfter` es la diferencia entre "un paso interceptado" y
         * "el run entero envenenado". Por defecto, tras correr el manejador
         * Playwright ESPERA a que el estorbo se oculte; si no se oculta nunca,
         * TODA acción y TODA espera de accionabilidad agotan su tope — incluido
         * el `ariaSnapshot` con el que se arma la petición de rescate, que
         * llegaba VACÍA. Medido en la gira: el propio call log lo cantaba
         * ("waiting for .cc-window to be hidden — 19 × locator resolved to
         * visible"). Con esto, un estorbo indescartable solo molesta si de
         * verdad tapa el objetivo, y entonces el error dice la verdad.
         */
        { noWaitAfter: true },
      );
    }
  }

  // ------------------------------------------------------- resolución hints

  private attemptToLocator(scope: Page | Frame | Locator, a: LocatorAttempt): Locator {
    // K0.1: intento normalizado → matching por regex accent-insensitive
    // K0.33: y si además es exacto, la regex va ANCLADA (una regex sin anclar
    // matchea substring, así que sin esto la pasada normalizada desharía el
    // peldaño exacto). Con string, `exact: true` hace ese trabajo.
    const exact = 'exact' in a && a.exact === true;
    const val = (v: string): string | RegExp =>
      'normalized' in a && a.normalized
        ? new RegExp(exact ? accentInsensitiveExactPattern(v) : accentInsensitivePattern(v), 'i')
        : v;
    const opcionExacta = exact && !('normalized' in a && a.normalized) ? { exact: true } : {};
    switch (a.kind) {
      case 'test_id': {
        const attr = this.testidAttr ?? 'data-testid';
        return scope.locator(`[${attr}="${a.value}"]`);
      }
      case 'role':
        return scope.getByRole(
          a.role as Parameters<Page['getByRole']>[0],
          a.name ? { name: val(a.name), ...opcionExacta } : undefined,
        );
      case 'label':
        return scope.getByLabel(val(a.value), opcionExacta);
      case 'text':
        // K0.28: `exact` = texto completo. Normalizado + exacto = regex anclada.
        if (a.normalized) {
          const pattern = a.exact ? accentInsensitiveExactPattern(a.value) : accentInsensitivePattern(a.value);
          return scope.getByText(new RegExp(pattern, 'i'));
        }
        return a.exact ? scope.getByText(a.value, { exact: true }) : scope.getByText(a.value);
      case 'placeholder':
        return scope.getByPlaceholder(val(a.value), opcionExacta);
    }
  }

  /**
   * Resuelve una CADENA de locators (K0.11a): `A >> B >> C` busca B dentro de A y C
   * dentro de B, con sufijo `.nth(N)` opcional por segmento. Es lo que permite
   * expresar los tiers scoped/anchored/indexed que Playwright genera y nosotros no
   * teníamos. Un solo segmento = comportamiento de siempre.
   */
  private locatorFromChain(scope: Page | Frame, src: string): Locator | null {
    let current: Page | Frame | Locator = scope;
    for (const { segment, nth } of parseLocatorChain(src)) {
      const filterMatch = segment.match(/^(.*)\.filter\(\{\s*hasText:\s*'((?:[^'\\]|\\.)*)'\s*\}\)$/);
      const base = filterMatch ? filterMatch[1] : segment;
      let loc = this.locatorFromSource(current, base);
      if (!loc) return null;
      if (filterMatch) loc = loc.filter({ hasText: filterMatch[2].replace(/\\'/g, "'") });
      if (typeof nth === 'number') loc = loc.nth(nth);
      current = loc;
    }
    return current === scope ? null : (current as Locator);
  }

  /**
   * Locator desde string: getBy*('...') literal, getBy*(/re/i) normalizado (K0.1),
   * o `css=<selector>` (escape hatch del rescate). Grammar compartida por
   * rescates, aliases y replay.
   */
  private locatorFromSource(scope: Page | Frame | Locator, src: string): Locator | null {
    const css = src.match(/^css=(.+)$/);
    if (css) return scope.locator(css[1]);
    const testId = src.match(/^getByTestId\('([^']+)'\)$/);
    if (testId) return this.attemptToLocator(scope, { kind: 'test_id', value: testId[1] });
    const roleRe = src.match(/^getByRole\('([^']+)',\s*\{\s*name:\s*\/(.+)\/i\s*\}\)$/);
    if (roleRe) return scope.getByRole(roleRe[1] as Parameters<Page['getByRole']>[0], { name: new RegExp(roleRe[2], 'i') });
    // K0.33 — las formas EXACTAS de role/label se parsean antes que las planas,
    // por la misma razón que la del texto en K0.28: sin esto un alias o un
    // `step.locator` emitido por la escalera nueva no se podría releer.
    const roleExact = src.match(/^getByRole\('([^']+)',\s*\{\s*name:\s*'((?:[^'\\]|\\.)*)',\s*exact:\s*true\s*\}\)$/);
    if (roleExact) {
      return this.attemptToLocator(scope, { kind: 'role', role: roleExact[1], name: roleExact[2].replace(/\\'/g, "'"), exact: true });
    }
    const role = src.match(/^getByRole\('([^']+)'(?:,\s*\{\s*name:\s*'((?:[^'\\]|\\.)*)'\s*\})?\)$/);
    if (role) return this.attemptToLocator(scope, { kind: 'role', role: role[1], name: role[2]?.replace(/\\'/g, "'") });
    const labelRe = src.match(/^getByLabel\(\/(.+)\/i\)$/);
    if (labelRe) return scope.getByLabel(new RegExp(labelRe[1], 'i'));
    const labelExact = src.match(/^getByLabel\('((?:[^'\\]|\\.)*)',\s*\{\s*exact:\s*true\s*\}\)$/);
    if (labelExact) {
      return this.attemptToLocator(scope, { kind: 'label', value: labelExact[1].replace(/\\'/g, "'"), exact: true });
    }
    const label = src.match(/^getByLabel\('((?:[^'\\]|\\.)*)'\)$/);
    if (label) return this.attemptToLocator(scope, { kind: 'label', value: label[1].replace(/\\'/g, "'") });
    // K0.39 — el marcador, con sus tres formas, y ANTES del texto para que la
    // exacta no la absorba una regla más laxa. Sin esta lectura, un alias emitido
    // por el peldaño nuevo no se podría releer y la memoria del cliente caería en
    // silencio, que es el mismo defecto que este ciclo viene a cerrar.
    const phRe = src.match(/^getByPlaceholder\(\/(.+)\/i\)$/);
    if (phRe) return scope.getByPlaceholder(new RegExp(phRe[1], 'i'));
    const phExact = src.match(/^getByPlaceholder\('((?:[^'\\]|\\.)*)',\s*\{\s*exact:\s*true\s*\}\)$/);
    if (phExact) {
      return this.attemptToLocator(scope, { kind: 'placeholder', value: phExact[1].replace(/\\'/g, "'"), exact: true });
    }
    const ph = src.match(/^getByPlaceholder\('((?:[^'\\]|\\.)*)'\)$/);
    if (ph) return this.attemptToLocator(scope, { kind: 'placeholder', value: ph[1].replace(/\\'/g, "'") });
    const textRe = src.match(/^getByText\(\/(.+)\/i\)$/);
    if (textRe) return scope.getByText(new RegExp(textRe[1], 'i'));
    // K0.28 — la forma exacta debe parsearse ANTES que la plana (y existir: sin
    // esto, un alias o un `step.locator` emitido por la escalera nueva no se
    // podría releer y el peldaño 0 caería en silencio).
    const textExact = src.match(/^getByText\('((?:[^'\\]|\\.)*)',\s*\{\s*exact:\s*true\s*\}\)$/);
    if (textExact) {
      return this.attemptToLocator(scope, { kind: 'text', value: textExact[1].replace(/\\'/g, "'"), exact: true });
    }
    const text = src.match(/^getByText\('((?:[^'\\]|\\.)*)'\)$/);
    if (text) return this.attemptToLocator(scope, { kind: 'text', value: text[1].replace(/\\'/g, "'") });
    return null;
  }

  private async scopes(): Promise<Array<{ scope: Page | Frame; path: string[] }>> {
    const out: Array<{ scope: Page | Frame; path: string[] }> = [{ scope: this.page, path: [] }];
    for (const f of this.page.frames()) {
      if (f === this.page.mainFrame()) continue;
      out.push({ scope: f, path: await framePath(f) });
    }
    return out;
  }

  /**
   * K0.33 — el desenlace de un intento, DISTINGUIENDO ausente de ambiguo. Los dos
   * devuelven "no resuelto", pero no significan lo mismo y por eso no pueden
   * tratarse igual: ausente = este vocabulario no aplica aquí (tiene sentido
   * probar otro peldaño), ambiguo = la palabra del guion designa a varias cosas
   * (ningún otro peldaño puede arreglar eso; solo elegir una por su cuenta).
   */
  private async intento(loc: Locator): Promise<Locator | 'ausente' | 'ambiguo'> {
    const count = await loc.count().catch(() => 0);
    if (count === 0) return 'ausente';
    if (count === 1) return (await loc.isVisible().catch(() => false)) ? loc : 'ausente';
    const visible = loc.filter({ visible: true });
    const nVisibles = await visible.count().catch(() => 0);
    if (nVisibles === 1) return visible;
    return nVisibles === 0 ? 'ausente' : 'ambiguo';
  }

  /**
   * K0.41 — ¿el elemento resuelto es un campo? Se lee del DOM en un solo viaje y
   * el juicio vive en `esCampoEtiquetable` (puro y con test). El `evaluate`
   * devuelve una CADENA a propósito: componer un objeto obliga a una función
   * auxiliar dentro, y esbuild la envuelve con `__name`, que no existe en la
   * página (la trampa de la Fase 6).
   */
  private async esCampo(loc: Locator): Promise<boolean> {
    const crudo = await loc
      .evaluate((el) => `${el.tagName.toLowerCase()}|${el.getAttribute('role') ?? ''}|${el.getAttribute('type') ?? ''}`)
      .catch(() => '');
    if (!crudo) return false;
    const [tag, role, tipo] = crudo.split('|');
    return esCampoEtiquetable(tag, role || null, tipo || null);
  }

  /**
   * K0.41 — descripción en castellano del elemento resuelto, para el informe.
   * Un solo viaje al DOM, y solo cuando resolvió el peldaño débil: el resto no lo
   * necesita y cobrarlo en cada paso sería pagar por nada. La cadena se compone
   * fuera (`describirElemento`, puro y con test) — aquí solo se leen los datos.
   */
  private async describir(loc: Locator): Promise<string | null> {
    const crudo = await loc
      .evaluate((el) => {
        const cont = el.closest('nav,header,footer,main,aside,form,table,dialog,section,article');
        const txt = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
        return `${el.tagName.toLowerCase()}|${txt}|${cont && cont !== el ? cont.tagName.toLowerCase() : ''}`;
      })
      .catch(() => '');
    if (!crudo) return null;
    const [tag, texto, contenedor] = crudo.split('|');
    return describirElemento(tag, texto ?? '', contenedor ?? '');
  }

  /**
   * K0.41 — el campo al que se refiere la etiqueta, o null si lo que salió no es
   * un campo en absoluto.
   *
   * El segundo paso no es nuevo: es `controlDelDestino`, la misma regla de K0.36.
   * Allí la etiqueta apuntaba con `for` a un COMPONENTE de PrimeNG y había que
   * bajar al control nativo de dentro; aquí la etiqueta llega por `aria-label`
   * sobre un `<div role="combobox">` que envuelve al `<input>` — el patrón ARIA
   * 1.1 que usa delta, y que produjo SEIS resoluciones equivocadas en el corpus.
   *
   * Distinguir "declara ser un campo y lo es" de "declara serlo y envuelve al
   * verdadero" no se puede por atributos, pero sí por estructura: si dentro hay un
   * control nativo único, ese es el campo. Si no hay ninguno —el `p-select` de
   * PrimeNG, el widget de Material—, el componente ES el campo y se queda.
   */
  private async campoDeEtiqueta(loc: Locator): Promise<Locator | null> {
    if (!(await this.esCampo(loc))) return null;
    const dentro = await this.controlDelDestino(loc);
    return dentro === 'ambiguo' ? null : dentro;
  }

  /** Único visible o null. Nunca .first() sobre ambiguos (regla dura). */
  private async uniqueOrNull(loc: Locator): Promise<Locator | null> {
    const count = await loc.count().catch(() => 0);
    // K0.26b (campo, PrestaShop): con UNA coincidencia también se exige visible.
    // El tier anclado puenteó "Ordenar por" al <select> OCULTO tras la fachada y
    // el walker quemó el tope clicando un invisible con error engañoso ("click:
    // Timeout"). "Único visible" es el contrato declarado de este método; un
    // único oculto no es resolución — es caer al siguiente peldaño o al panel.
    if (count === 1) return (await loc.isVisible().catch(() => false)) ? loc : null;
    if (count > 1) {
      const visible = loc.filter({ visible: true });
      if ((await visible.count().catch(() => 0)) === 1) return visible;
    }
    return null;
  }

  /**
   * Fase 1 (SPEC-caos-corporativo §4) — `select` inteligente. `selectOption()` a
   * ciegas revienta contra cualquier desplegable que no sea un `<select>` real
   * (Angular Material, PrimeFaces): la clase "selectOption lanzó sobre un div" que
   * bloqueaba onesait. El driver ramifica por tagName REAL del disparador, no por
   * vocabulario del guion — `select` sigue siendo hint + value, sin campo nuevo.
   */
  private async selectSmart(trigger: Locator, value: string): Promise<void> {
    const tag = await trigger.evaluate((el) => el.tagName).catch(() => '');
    if (tag === 'SELECT') {
      // `selectOption(value)` a ciegas hace match EXACTO por value/label y se cuelga
      // el tope entero si el guion trae "Rescate Total" y la página ofrece "Rescate
      // total" (drift de mayúscula/acento FD↔app). Resolvemos contra las opciones
      // REALES del <select>: exacto primero; si no, normalizado (accent+case+espacios,
      // el mismo `normalizeText` de la escalera) a UNA única opción. Con dos que
      // normalizan igual → planta; con ninguna → reporta las opciones reales como
      // drift. Nunca se adivina. Genérico para cualquier <select>, no específico.
      const opts = await trigger.evaluate((el) =>
        Array.from((el as HTMLSelectElement).options).map((o) => ({ text: o.text, value: o.value })),
      );
      let match = opts.filter((o) => o.text === value || o.value === value);
      let viaNormalizado = false;
      if (match.length === 0) {
        const nv = normalizeText(value);
        match = opts.filter((o) => normalizeText(o.text) === nv || normalizeText(o.value) === nv);
        viaNormalizado = true;
      }
      const visibles = opts.map((o) => o.text).filter((t) => t.trim().length > 0);
      if (match.length === 0) {
        throw new Error(
          `la opción '${value}' no existe en el <select> (opciones reales: ${visibles.join(' | ') || '∅'}) — nunca se adivina`,
        );
      }
      if (match.length > 1) {
        throw new Error(
          `la opción '${value}' calza con ${match.length} opciones del <select> tras normalizar (ambigua) — nunca se adivina`,
        );
      }
      if (viaNormalizado && match[0].text !== value) {
        this.audit('allow', `select drift tolerado: guion '${value}' → opción real '${match[0].text}'`, {
          phase: 'select-normalizado',
        });
      }
      await trigger.selectOption({ value: match[0].value }, { timeout: STEP_TIMEOUT_MS });
      return;
    }
    // Widget no nativo (K0.26, generaliza la Fase 1 §4): abrir y resolver la
    // OPCIÓN, no el contenedor. La versión anterior exigía role="listbox" tras
    // abrir — un sobreajuste a Angular Material/PrimeFaces que PrestaShop/
    // Bootstrap falsó en campo (sus menús no exponen rol ninguno). Regla por
    // capas: si el widget SÍ declara un listbox único, la opción se resuelve
    // SOLO dentro de él (el contenedor declarado manda, nunca se puentea a
    // texto suelto de la página); sin listbox, la opción es el texto que se
    // hizo visible al abrir, único a nivel de página entera. En ambos casos
    // decide la regla dura: único → clic; ≥2 → planta; 0 → drift.
    await trigger.click({ timeout: STEP_TIMEOUT_MS });
    const found = await this.waitForVisibleOption(value, STEP_TIMEOUT_MS);
    if (!found.locator) {
      throw new Error(
        `la opción '${value}' no resuelve única tras abrir el desplegable: ${found.detail} — nunca se adivina`,
      );
    }
    if (found.viaNormalizado) {
      const real = (await found.locator.innerText().catch(() => '')).trim();
      this.audit('allow', `select drift tolerado: guion '${value}' → texto real '${real}'`, {
        phase: 'select-normalizado',
      });
    }
    await found.locator.click({ timeout: STEP_TIMEOUT_MS });
  }

  /**
   * K0.26 — espera a que la opción pedida sea resoluble tras abrir un widget no
   * nativo. Capa 1: con un único `role="listbox"` visible (Material, PrimeFaces;
   * alcance página-entera + frames, §3 K0.16), la opción se busca SOLO dentro —
   * saltarse un contenedor declarado hacia texto suelto sería adivinar. Capa 2:
   * sin listbox (Bootstrap, PrestaShop: menús sin rol), texto visible único a
   * nivel de página, exacto primero y normalizado (accent+case) después. El
   * polling cubre la animación de apertura; al agotar el tope devuelve el
   * diagnóstico (ausente vs ambigua) para que el informe no mienta.
   */
  private async waitForVisibleOption(
    value: string,
    timeoutMs: number,
  ): Promise<{ locator: Locator | null; viaNormalizado: boolean; detail: string }> {
    const deadline = Date.now() + timeoutMs;
    const normRe = new RegExp(accentInsensitivePattern(value), 'i');
    for (;;) {
      const scopes = await this.scopes();
      let listbox: Locator | null = null;
      for (const { scope } of scopes) {
        listbox = await this.uniqueOrNull(scope.getByRole('listbox'));
        if (listbox) break;
      }
      if (listbox) {
        const literal = await this.uniqueOrNull(listbox.getByRole('option', { name: value }));
        if (literal) return { locator: literal, viaNormalizado: false, detail: '' };
        const norm = await this.uniqueOrNull(listbox.getByRole('option', { name: normRe }));
        if (norm) return { locator: norm, viaNormalizado: true, detail: '' };
        const textual = await this.uniqueOrNull(listbox.getByText(normRe));
        if (textual) return { locator: textual, viaNormalizado: true, detail: '' };
      } else {
        for (const { scope } of scopes) {
          const exact = await this.uniqueOrNull(scope.getByText(value, { exact: true }));
          if (exact) return { locator: exact, viaNormalizado: false, detail: '' };
        }
        for (const { scope } of scopes) {
          const norm = await this.uniqueOrNull(scope.getByText(normRe));
          if (norm) return { locator: norm, viaNormalizado: true, detail: '' };
        }
      }
      if (Date.now() >= deadline) {
        let visibles = 0;
        if (listbox) {
          visibles = await listbox.getByText(normRe).filter({ visible: true }).count().catch(() => 0);
        } else {
          for (const { scope } of scopes) {
            visibles += await scope.getByText(normRe).filter({ visible: true }).count().catch(() => 0);
          }
        }
        const detail =
          visibles >= 2
            ? `ambigua (${visibles} coincidencias visibles${listbox ? ' en el listbox' : ' en la página'})`
            : `no apareció como texto visible${listbox ? ' dentro del listbox' : ''}`;
        return { locator: null, viaNormalizado: false, detail };
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /**
   * Escalera v2 (K0.1/K0.5): aliases del cliente → plan crudo del contract →
   * plan normalizado (accent-insensitive). Devuelve el locator único visible o
   * null (→ rescate / open_question). El walker nunca decide equivalencias:
   * el alias viene de un rescate ya verificado; el normalizado es una función.
   */
  /**
   * D46 — el peldaño que RESUELVE pero no deja nada que emitir.
   *
   * Medido en ParaBank el 2026-08-22, con el FD citado: el walker hizo 17/18 pasos y
   * `walk-to-spec` emitió **cero** specs. Los tres flujos se encolaron para el Writer
   * por el mismo motivo — `anchored(label:'Username')` es notación de diagnóstico, no
   * código Playwright. O sea: el peldaño que existe precisamente para el legacy
   * corporativo hace que el camino determinista no entregue nada justo ahí.
   *
   * `StepReport.emit_locator` estaba DECLARADO en `walk-types.ts` con su docstring,
   * lo CONSUMÍA `walk-to-spec` y lo probaba un test... con el campo puesto a mano en
   * el fixture. **Nadie lo producía.** Es la familia D2 en su forma más pura: un test
   * que le da al consumidor la salida del productor prueba el consumidor y crea la
   * ilusión de que la función existe.
   *
   * Esto lo produce. Del elemento ya resuelto se lee el primer atributo de la
   * whitelist del contract (`locators.css_fallback_attributes`, que el contract de
   * ParaBank declara como [name, id] desde hace meses) y se acepta SOLO si identifica
   * a exactamente un elemento. Si no, se queda ausente y `walk-to-spec` sigue
   * rehusando con motivo — que es mejor que emitir un fichero que no compila.
   *
   * No toca `resolved_via`: la medición del peldaño anclado es una de las cifras del
   * producto y meterle CSS la falsearía.
   */
  private async derivarEmitLocator(loc: Locator): Promise<string | undefined> {
    if (this.cssFallbackAttrs.length === 0) return undefined;
    for (const attr of this.cssFallbackAttrs) {
      const valor = await loc.getAttribute(attr).catch(() => null);
      if (!valor || /["\\]/.test(valor)) continue; // un valor con comillas rompería el selector
      const selector = `[${attr}="${valor}"]`;
      // unicidad comprobada CONTRA LA PÁGINA, no supuesta: un `name` repetido
      // (radios, tablas) produciría un locator que resuelve a varios y un spec
      // que revienta en strict mode la primera vez que se ejecuta.
      const n = await this.page
        .locator(selector)
        .filter({ visible: true })
        .count()
        .catch(() => 0);
      if (n !== 1) continue;
      this.audit('allow', `locator emisible derivado por atributo '${attr}': css=${selector}`, { phase: 'emit-locator' });
      return `css=${selector}`;
    }
    return undefined;
  }

  private async resolveHint(step: WalkStep): Promise<{ locator: Locator; via: string; frame_path: string[]; emit?: string } | null> {
    const r = await this.resolveHintRaw(step);
    if (!r) return null;
    // solo cuando la notación del peldaño NO es código: la regla la manda
    // `walk-to-spec` (misma función), para que no haya dos definiciones de
    // "emisible" que puedan separarse.
    if (!primerSegmentoNoExpresable(r.via)) return r;
    const emit = await this.derivarEmitLocator(r.locator);
    return emit ? { ...r, emit } : r;
  }

  private async resolveHintRaw(step: WalkStep): Promise<{ locator: Locator; via: string; frame_path: string[] } | null> {
    this.ultimaAmbiguedad = null; // por-llamada: nunca arrastrar el motivo de otro paso
    this.ultimoAmbitoFallido = null;
    const scopes = await this.scopes();

    /**
     * K0.16 — peldaño 0: el locator autoritativo del paso. Es lo que un parche del
     * modo asistido deja fundido en el guion. Si deja de resolver NO bloquea: se
     * sigue la escalera, igual que con un alias que drifteó.
     */
    if (step.locator) {
      for (const { scope, path } of scopes) {
        const loc = this.locatorFromChain(scope, step.locator);
        if (!loc) break; // gramática ilegible: que decida la escalera normal
        const unique = await this.uniqueOrNull(loc);
        if (unique) return { locator: unique, via: step.locator, frame_path: path };
      }
      this.audit('skip', `locator declarado no resuelve en ${step.id}: ${step.locator}`, { phase: 'locator-declarado' });
    }

    if (step.hint) {
      const alias = this.aliases.aliases[aliasKey(step.hint, step.scope)];
      if (alias) {
        for (const { scope, path } of scopes) {
          const loc = this.locatorFromChain(scope, alias.locator);
          if (!loc) break; // grammar ilegible: la escalera normal decide
          const unique = await this.uniqueOrNull(loc);
          if (unique) {
            this.audit('allow', `alias-hit ${step.id}: ${alias.locator}`, { phase: 'alias' });
            return { locator: unique, via: alias.locator, frame_path: path };
          }
        }
        // el alias dejó de resolver (drift del DOM): sigue la escalera, no bloquea
      }
    }

    /**
     * K0.16 — la escalera corre DENTRO del contenedor cuando el paso declara scope.
     * Un contenedor ambiguo no se adivina: si hay dos diálogos que encajan, el paso
     * queda sin resolver y sube a la asistencia. Es la misma regla dura de siempre.
     */
    const containers: Array<{ scope: Page | Frame | Locator; path: string[]; via?: string }> = step.scope
      ? await this.resolveScope(step.scope, scopes)
      : scopes;
    if (step.scope && containers.length === 0) {
      this.audit('skip', `scope irresoluble en ${step.id}`, { phase: 'scope', scope: JSON.stringify(step.scope) });
      return null;
    }

    /**
     * K0.33 — LA AMBIGÜEDAD NO SE REPARA DESCENDIENDO DE PELDAÑO. Medido en campo
     * (UI5, sitio 2): el hint {name:'Cart'} del icono del carrito daba DOS botones
     * con `getByRole` ("Show Shopping Cart" y "Add to Cart", ambos contienen la
     * palabra), así que la escalera siguió bajando y el peldaño de texto encontró
     * UNA sola coincidencia visible... el botón "Add to Cart". El walker resolvió,
     * pulsó, reportó `ok` — y añadió una segunda unidad al carrito. Fallo mudo con
     * duplicación de negocio: lo peor que puede hacer este componente.
     *
     * La distinción es estructural, no una heurística de tuning:
     *  - CERO coincidencias = este vocabulario no describe al elemento aquí. Otro
     *    peldaño (otra forma de nombrarlo) puede acertar → se sigue bajando.
     *  - DOS O MÁS = la palabra del guion designa a varias cosas de la pantalla.
     *    Ningún peldaño más flojo puede resolver eso: solo puede elegir una por su
     *    cuenta, que es exactamente lo prohibido. Y como cada peldaño busca en un
     *    ATRIBUTO distinto (nombre accesible ≠ texto visible), el que "desatasca"
     *    puede estar señalando otro elemento, como aquí.
     *
     * La escalera para y el paso sube al panel asistido / rescate, que es donde un
     * humano desambigua. Plantarse es lento; equivocarse en silencio es inservible.
     */
    const rawPlan = hintLocatorPlan(step.hint ?? {}, this.priority);
    // se reinicia por paso: una descripción heredada del paso anterior mentiría
    this.ultimaDescripcion = null;
    let ambiguo: string | null = null;
    for (const plan of [rawPlan, normalizedPlan(rawPlan)]) {
      for (const attempt of plan) {
        for (const { scope, path, via } of containers) {
          const res = await this.intento(this.attemptToLocator(scope, attempt));
          if (res === 'ambiguo') {
            /**
             * K0.41 — un intento SIN palabras del guion (rol pelado) no detiene la
             * escalera. Ver `attemptLlevaPalabras`: "hay tres campos de texto" no
             * es que la palabra del QA designe varias cosas, es que aún no se ha
             * preguntado por ella. Medido: 304 pasos (4,9% del corpus) se
             * plantaban ahí con el marcador del propio hint sin llegar a probarse.
             */
            if (attemptLlevaPalabras(attempt)) ambiguo ??= locatorSource(attempt);
            continue; // otro contenedor/frame todavía puede tener UNA sola
          }
          if (res === 'ausente') continue;
          /**
           * K0.41 — el peldaño de ETIQUETA solo puede entregar un CAMPO.
           * `getByLabel` significa "el campo etiquetado X"; un `<div>` que
           * envuelve al control, un enlace cuyo nombre contiene la palabra o el
           * propio `<label>` no son campos. Se trata como AUSENTE, no como
           * resolución: la escalera sigue bajando, que es lo que hace cuando un
           * vocabulario no describe al elemento aquí.
           */
          let elegido = res;
          if (attempt.kind === 'label') {
            const campo = await this.campoDeEtiqueta(res);
            if (!campo) continue;
            elegido = campo;
          }
          // solo el peldaño débil paga el viaje: es el único cuyo resultado hay que juzgar a mano
          if (attempt.kind === 'text') this.ultimaDescripcion = await this.describir(elegido);
          const source = via ? `${via} >> ${locatorSource(attempt)}` : locatorSource(attempt);
          return { locator: elegido, via: source, frame_path: path };
        }
        if (ambiguo) {
          /**
           * K0.34 — y el motivo viaja al informe, no solo al audit. Medido en el
           * banco JSF: el enlace "Show" existe una vez POR FILA, el paso se plantó
           * correctamente... y el QA leyó "hint irresoluble", que es el diagnóstico
           * equivocado y manda a la acción equivocada. Irresoluble se arregla
           * capturando un locator; ambiguo se arregla acotando con `scope`.
           */
          this.ultimaAmbiguedad = `${ambiguo} matchea VARIOS elementos visibles: el hint designa a más de una cosa en la pantalla (acótalo con 'scope')`;
          this.audit('block', `hint ambiguo en ${step.id}: ${ambiguo} matchea varios elementos visibles`, {
            phase: 'ambiguo',
            hint: JSON.stringify(step.hint ?? {}),
          });
          return null;
        }
      }
    }

    /**
     * K0.19 — tier ANCLADO en la escalera determinista. Último peldaño antes de
     * rendirse: la clase "campo con etiqueta visible NO asociada" (label-en-celda de
     * JSF/JSP/legacy). El nombre accesible es vacío —la app rompe el contrato de
     * accesibilidad—, así que role/name/label devuelven 0; pero la etiqueta visible
     * ("Usuario") está en un contenedor vecino y COINCIDE con el vocabulario del FD.
     *
     * Se trepa desde el texto visible al contenedor (fila/item/grupo) y se coge el
     * control único de dentro. Genérico: cualquier app con label-en-celda. NO
     * adivina: si el contenedor tiene ≥2 controles, uniqueOrNull se planta. Existía
     * solo en el camino asistido (buildFallbackCandidates); esto lo sube al guion.
     *
     * K0.28 — y NO se aplica a acciones de puntero. Medido en campo (tufarmacia,
     * CP02-s1): un `click` sobre el hint de texto 'Medicamentos' se puenteó al
     * primer `input` que seguía a la palabra —un campo sin relación con el enlace
     * del menú— y se clicó; lo cazó la postcondición, no la resolución. La razón
     * es estructural: este tier responde a "¿qué CONTROL etiqueta este texto
     * visible?", y esa pregunta solo tiene sentido cuando el paso opera sobre un
     * control (fill/select/check/uncheck/press). Un `click` puede ir a un enlace,
     * un botón o una fila; trepar de su texto al siguiente input es adivinar. Sin
     * el tier, el paso se planta y sube al panel: honesto.
     */
    /**
     * K0.36 — LA ETIQUETA APUNTA A UN COMPONENTE, NO A UN CONTROL. Medido en campo
     * (Sakai, la plantilla de back-office oficial de PrimeNG): el diálogo declara
     * `<label for="price">Price</label>` y el `id="price"` lo lleva el componente
     * `<p-inputnumber>`, no el `<input>` que hay dentro. `getByLabel` devuelve CERO
     * — y con razón, porque el HTML solo reconoce la asociación cuando apunta a un
     * control etiquetable —, así que la escalera se plantaba en cuatro campos de
     * una pantalla en la que la aplicación SÍ había declarado a qué se refiere cada
     * etiqueta. La misma forma sale en Angular Material, Vuetify o Ant: el
     * envoltorio se queda el id.
     *
     * Esto NO es una heurística como el anclado: el autor escribió `for="price"`,
     * o sea que la asociación texto→cosa es un dato de la aplicación, tan
     * autoritativo como un `aria-label`. Por eso va ANTES del anclado y sin
     * restricción de acción — pulsar la etiqueta es lo que hace un usuario.
     *
     * Y no se adivina en ningún tramo: la etiqueta debe ser única visible, el
     * destino único, y dentro del destino el control nativo también único (≥2 → se
     * planta). Si el destino no tiene control nativo dentro —el caso del `p-select`,
     * que es un `<span role="combobox">— se devuelve el componente, que es
     * exactamente el elemento que hay que pulsar para desplegarlo.
     */
    if (step.hint) {
      const porEtiqueta = await this.resolveLabelFor(step.hint, containers);
      /**
       * Y si la asociación declarada existe pero no dice a CUÁL de los controles
       * del componente se refiere, la escalera PARA. Es el principio de K0.33
       * aplicado aquí: la ambigüedad no se repara descendiendo de peldaño. Sin
       * esto el tier anclado la "resolvía" cogiendo el primero que seguía a la
       * etiqueta — deshaciendo en el peldaño de abajo la regla dura que este
       * acababa de aplicar. Cazado por su propio test, no en campo.
       */
      if (porEtiqueta === 'ambiguo') {
        const texto = step.hint.label ?? step.hint.text ?? step.hint.name;
        this.ultimaAmbiguedad =
          `la etiqueta '${texto}' apunta con 'for' a un componente que contiene VARIOS controles: ` +
          `la asociación declarada no dice a cuál (acótalo con 'scope' o captura el locator)`;
        this.audit('block', `etiqueta a componente ambiguo en ${step.id}: '${texto}'`, {
          phase: 'label-for',
          hint: JSON.stringify(step.hint),
        });
        return null;
      }
      if (porEtiqueta) return porEtiqueta;
    }

    /**
     * K0.38 — LA REFERENCIA ARIA QUE CRUZA LA FRONTERA DEL SHADOW. Medido en campo
     * (Vaadin Flow, aplicación Bakery): el `<input>` vive en el DOM normal y declara
     * `aria-labelledby="vaadin-text-field-label-0"`, pero ESE id está dentro del
     * shadow root del `<vaadin-text-field>`. Las referencias ARIA se resuelven en el
     * árbol del propio elemento, así que la del input no encuentra nada y **el
     * nombre accesible queda vacío**: `getByLabel` da 0, `getByRole({name})` da 0, y
     * el tier anclado tampoco puede — su `following::` se queda dentro del árbol de
     * la etiqueta y nunca llega al control, que está en el otro.
     *
     * La asociación EXISTE y la escribió el autor; lo único que falla es dónde se
     * resuelve. Completarla es lo mismo que honrar un `for` (K0.36): un dato de la
     * aplicación, no una conjetura. Se va del texto visible a su `id`, y de ahí al
     * único control que lo referencia.
     *
     * Es inerte donde no aplica: si la etiqueta no tiene `id`, no hay peldaño. Y
     * mantiene la regla dura — dos controles que reclamen la misma etiqueta se
     * plantan, no se elige.
     */
    if (step.hint) {
      const porAria = await this.resolveAriaLabelledby(step.hint, containers);
      if (porAria) return porAria;
    }

    if (step.hint && ANCHORED_ACTIONS.has(step.action)) {
      const anchored = await this.resolveAnchored(step.hint, containers);
      if (anchored) return anchored;
    }

    /**
     * K0.36 — EL ÁMBITO QUE RESUELVE PERO NO CONTIENE. Medido en el mismo diálogo:
     * `scope:{text:'Product Details'}` resuelve a UNA cosa (el título del diálogo)
     * y dentro de un título no hay campos, así que el paso se bloqueaba con "hint
     * irresoluble" — el diagnóstico que manda al QA a arreglar el hint cuando el
     * hint era correcto y lo que sobraba era el ámbito.
     *
     * No se trepa del título a su contenedor: elegir qué ancestro es "el diálogo"
     * sería adivinar. Lo que sí se puede hacer sin adivinar es CONTAR fuera y
     * decir lo que se ha medido, igual que la nota de página de error de K0.35:
     * el walker no afirma que el ámbito esté mal, dice dónde está y dónde no.
     */
    if (step.scope && !this.ultimaAmbiguedad) {
      const fuera = await this.cuentaFueraDelAmbito(rawPlan, scopes);
      if (fuera > 0) {
        this.ultimoAmbitoFallido =
          `el hint NO está dentro del ámbito ${JSON.stringify(step.scope)}, pero sí aparece ` +
          `${fuera} ${fuera === 1 ? 'vez' : 'veces'} fuera de él — ¿el ámbito señala al CONTENEDOR o solo a su título?`;
        this.audit('block', `ámbito sin el hint dentro en ${step.id}: ${fuera} coincidencia(s) fuera`, {
          phase: 'scope',
          scope: JSON.stringify(step.scope),
        });
      }
    }
    return null;
  }

  /**
   * K0.36 — cuenta las coincidencias VISIBLES del hint a nivel de frame, es decir
   * fuera del ámbito declarado. Solo se llama cuando el paso ya está perdido, así
   * que su coste no entra en el camino feliz.
   */
  private async cuentaFueraDelAmbito(
    rawPlan: LocatorAttempt[],
    scopes: Array<{ scope: Page | Frame; path: string[] }>,
  ): Promise<number> {
    for (const plan of [rawPlan, normalizedPlan(rawPlan)]) {
      for (const attempt of plan) {
        // por INTENTO, no acumulando el plan entero: los intentos exacto y substring
        // de K0.33 encuentran el MISMO elemento, y sumarlos diría "aparece 2 veces"
        // de algo que aparece una. Un número inflado en el informe es otra mentira.
        let n = 0;
        for (const f of scopes) {
          n += await this.attemptToLocator(f.scope, attempt)
            .filter({ visible: true })
            .count()
            .catch(() => 0);
        }
        if (n > 0) return n;
      }
    }
    return 0;
  }

  /**
   * K0.36 — resuelve por la asociación DECLARADA `<label for>` cuando el destino
   * no es un control etiquetable (el patrón de las librerías de componentes: el
   * envoltorio se queda el id). Ver el razonamiento largo en `resolveHint`.
   */
  private async resolveLabelFor(
    hint: StepHint,
    containers: Array<{ scope: Page | Frame | Locator; path: string[]; via?: string }>,
  ): Promise<{ locator: Locator; via: string; frame_path: string[] } | 'ambiguo' | null> {
    const texto = hint.label ?? hint.text ?? hint.name;
    if (!texto) return null;
    const needles: Array<string | RegExp> = [texto, new RegExp(accentInsensitivePattern(texto), 'i')];
    for (const needle of needles) {
      const exacts = typeof needle === 'string' ? [true, false] : [false];
      for (const exact of exacts) {
        for (const { scope, path, via } of containers) {
          const txt = typeof needle === 'string' ? scope.getByText(needle, { exact }) : scope.getByText(needle);
          const etiqueta = await this.uniqueOrNull(txt.locator('xpath=ancestor-or-self::label[1]'));
          if (!etiqueta) continue;
          const id = await etiqueta.getAttribute('for').catch(() => null);
          if (!id) continue;
          const destino = await this.uniqueOrNull(scope.locator(`[id="${id.replace(/["\\]/g, '\\$&')}"]`));
          if (!destino) continue;
          const elegido = await this.controlDelDestino(destino);
          if (elegido === 'ambiguo') return 'ambiguo';
          if (!elegido) continue;
          const src = `${via ? via + ' >> ' : ''}labelFor('${texto}')`;
          return { locator: elegido, via: src, frame_path: path };
        }
      }
    }
    return null;
  }

  /**
   * K0.38 — del texto visible a su `id`, y de ahí al control que lo declara como su
   * etiqueta mediante `aria-labelledby`. Ver el razonamiento largo en `resolveHint`.
   */
  private async resolveAriaLabelledby(
    hint: StepHint,
    containers: Array<{ scope: Page | Frame | Locator; path: string[]; via?: string }>,
  ): Promise<{ locator: Locator; via: string; frame_path: string[] } | null> {
    const texto = hint.label ?? hint.text ?? hint.name;
    if (!texto) return null;
    const needles: Array<string | RegExp> = [texto, new RegExp(accentInsensitivePattern(texto), 'i')];
    for (const needle of needles) {
      const exacts = typeof needle === 'string' ? [true, false] : [false];
      for (const exact of exacts) {
        for (const { scope, path, via } of containers) {
          const txt = typeof needle === 'string' ? scope.getByText(needle, { exact }) : scope.getByText(needle);
          const etiqueta = await this.uniqueOrNull(txt);
          if (!etiqueta) continue;
          const id = await etiqueta.getAttribute('id').catch(() => null);
          if (!id) continue;
          // `~=` porque aria-labelledby admite VARIOS ids separados por espacios y
          // el control puede citar a su etiqueta junto a otras referencias.
          const destino = await this.uniqueOrNull(
            scope.locator(`[aria-labelledby~="${id.replace(/["\\]/g, '\\$&')}"]`),
          );
          if (!destino) continue;
          const src = `${via ? via + ' >> ' : ''}ariaLabelledby('${texto}')`;
          return { locator: destino, via: src, frame_path: path };
        }
      }
    }
    return null;
  }

  /**
   * Del destino de un `for`, el elemento sobre el que hay que actuar: él mismo si
   * ya es un control nativo, el control nativo ÚNICO que contenga si es un
   * envoltorio, o el propio envoltorio si no contiene ninguno (el `p-select`, que
   * se despliega pulsándolo). Dos o más controles dentro → null: se planta.
   */
  private async controlDelDestino(destino: Locator): Promise<Locator | 'ambiguo' | null> {
    const propio = await this.uniqueOrNull(destino.locator('xpath=self::input|self::select|self::textarea'));
    if (propio) return propio;
    const dentro = destino.locator('input:not([type="hidden"]), select, textarea');
    if ((await dentro.count().catch(() => 0)) > 0) {
      const unico = await this.uniqueOrNull(dentro);
      if (unico) return unico;
      // 'ambiguo' SOLO si de verdad hay dos o más a la vista. Uno solo y oculto no
      // es ambigüedad: es un control que no se ve, y decir "ambiguo" ahí mandaría
      // al QA a desambiguar algo que tiene una sola respuesta.
      const visibles = await dentro.filter({ visible: true }).count().catch(() => 0);
      return visibles >= 2 ? 'ambiguo' : null;
    }
    return this.uniqueOrNull(destino);
  }

  /**
   * Resuelve por etiqueta visible vecina cuando no hay asociación formal (K0.19).
   * Control-agnóstico dentro del contenedor: un input de texto, uno de contraseña
   * (que NO tiene rol textbox), un select o un textarea resuelven igual. Dos pasadas
   * de texto: literal y accent-insensitive (misma tolerancia que el resto).
   */
  private async resolveAnchored(
    hint: StepHint,
    containers: Array<{ scope: Page | Frame | Locator; path: string[]; via?: string }>,
  ): Promise<{ locator: Locator; via: string; frame_path: string[] } | null> {
    const label = hint.label ?? hint.text ?? hint.name;
    if (!label) return null;
    // K0.21 — NO depende de roles ARIA de contenedor. Medido contra el login real de
    // onesait: la etiqueta es un <h5> hermano del input dentro de un <div> pelado
    // (sin role), no una fila de tabla. Se parte del elemento de texto MÁS INTERNO
    // que coincide (.last() en orden de documento) y se coge:
    //   (a) el primer control que SIGUE a la etiqueta (label-antes-de-control: el
    //       patrón universal, cubre div-hermano y celda-hermana por igual), o
    //   (b) el control único DENTRO del ancestro común (por si va antes o al lado).
    // Control-agnóstico (la contraseña, sin rol textbox, resuelve igual). uniqueOrNull
    // se planta ante ≥2: no adivina.
    const CONTROL = 'input:not([type="hidden"]), select, textarea, [role="textbox"], [role="combobox"], [contenteditable="true"]';
    const FOLLOWING = 'xpath=following::*[self::input or self::select or self::textarea][1]';
    const ANCESTOR = 'xpath=ancestor::*[.//input or .//select or .//textarea][1]';
    const needles: Array<string | RegExp> = [
      label, // se prueba primero exacto, luego substring (ver mk)
      new RegExp(accentInsensitivePattern(label), 'i'),
    ];
    const mk = (scope: Page | Frame | Locator, needle: string | RegExp, exact: boolean): Locator =>
      typeof needle === 'string' ? scope.getByText(needle, { exact }) : scope.getByText(needle);
    for (const needle of needles) {
      const exacts = typeof needle === 'string' ? [true, false] : [false];
      for (const exact of exacts) {
        for (const { scope, path, via } of containers) {
          /**
           * K0.25/D4 — guarda de ambigüedad del ANCLA. `.last()` elegía por decreto
           * ante duplicados REALES ('Remove' ×2, 'Add to cart' ×6) y puenteaba al
           * único control "cercano" — en el rodaje clicó el <select> de ordenación
           * en silencio. Medido (probe): el text engine NO matchea a los wrappers
           * (solo al portador más profundo del texto), así que el anidamiento que
           * justificaba `.last()` no produce matches múltiples — la guarda correcta
           * es la regla dura de siempre: `uniqueOrNull` (visible único = ancla;
           * ≥2 visibles = ambigua, se planta; duplicado invisible tipo <option> lo
           * absorbe el filtro de visibilidad). No se adivina.
           */
          const lbl = await this.uniqueOrNull(mk(scope, needle, exact));
          if (!lbl) continue;
          for (const rel of [FOLLOWING, ANCESTOR]) {
            const cand = rel === ANCESTOR ? lbl.locator(rel).locator(CONTROL) : lbl.locator(rel);
            const unique = await this.uniqueOrNull(cand).catch(() => null);
            /**
             * K0.36 — EL PUENTE NO CRUZA A OTRO CAMPO. Medido en campo (Sakai): el
             * ancla "Inventory Status" es única, su widget es un `<p-select>` que
             * este tier no reconoce como control, y `following::` saltó por encima
             * hasta el primer `<input>` que había después — un radio del grupo
             * "Category", que es de OTRO campo. El paso lo pulsó, marcó una
             * categoría y luego reportó `action_failed`: un fallo que además dejó
             * estado de negocio cambiado, que es lo peor que puede hacer esto.
             *
             * La guarda es un hecho estructural, no un umbral: si el control al
             * que se ha llegado vive dentro de algo a lo que apunta OTRA etiqueta,
             * ese control ya tiene dueño y el puente se ha metido en campo ajeno.
             * La premisa del tier ("la etiqueta precede a SU control") queda
             * falsada, así que se planta. No toca el caso para el que existe
             * (onesait, JSF): allí los controles no son destino de ninguna
             * etiqueta, precisamente porque la app no las asocia.
             */
            if (unique && rel === FOLLOWING && (await this.puenteCruzaOtroCampo(unique, lbl, scope))) continue;
            if (unique) {
              const src = `${via ? via + ' >> ' : ''}anchored(label:'${label}')`;
              return { locator: unique, via: src, frame_path: path };
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * K0.36 — ¿el control al que ha llegado el puente pertenece ya a otra etiqueta?
   * Se mira si él o alguno de sus ancestros con `id` es destino de un `<label for>`
   * distinto del de la propia ancla. Solo corre en el camino anclado, que ya es el
   * último peldaño.
   */
  private async puenteCruzaOtroCampo(
    candidato: Locator,
    ancla: Locator,
    scope: Page | Frame | Locator,
  ): Promise<boolean> {
    const propio = await ancla
      .locator('xpath=ancestor-or-self::label[1]')
      .getAttribute('for')
      .catch(() => null);
    const conId = await candidato.locator('xpath=ancestor-or-self::*[@id]').all().catch(() => []);
    for (const nodo of conId) {
      const id = await nodo.getAttribute('id').catch(() => null);
      if (!id || id === propio) continue;
      const n = await scope
        .locator(`label[for="${id.replace(/["\\]/g, '\\$&')}"]`)
        .count()
        .catch(() => 0);
      if (n > 0) return true;
    }
    return false;
  }

  /**
   * Contenedores donde buscar cuando el paso declara `scope` (K0.16). Devuelve el
   * contenedor único por frame, con su `via` para que el locator reportado sea la
   * cadena completa (`contenedor >> elemento`) y el dom-map/audit digan la verdad.
   */
  private async resolveScope(
    scope: StepHint,
    frames: Array<{ scope: Page | Frame; path: string[] }>,
  ): Promise<Array<{ scope: Page | Frame | Locator; path: string[]; via?: string }>> {
    const out: Array<{ scope: Page | Frame | Locator; path: string[]; via?: string }> = [];
    const plan = hintLocatorPlan(scope, this.priority);
    for (const p of [plan, normalizedPlan(plan)]) {
      for (const attempt of p) {
        for (const f of frames) {
          const unique = await this.uniqueOrNull(this.attemptToLocator(f.scope, attempt));
          if (unique) out.push({ scope: unique, path: f.path, via: locatorSource(attempt) });
        }
        if (out.length > 0) return out;
      }
    }
    return out;
  }

  // ----------------------------------------------- cardinalidad (Fase 6)

  /**
   * Resuelve la COLECCIÓN de `expect_count`/`expect_each` (el `hint` apunta a
   * "las filas", "las opciones" — deliberadamente plural, a diferencia de
   * `resolveHint`). La regla dura no cambia de forma: no es "cuántos hay" lo
   * que se adivina, es "en cuál contenedor/frame contarlos" — si el hint
   * matchea con >0 elementos en DOS contenedores a la vez, no hay forma de
   * saber cuál es "la" colección y el paso se planta, igual que con un
   * elemento singular ambiguo.
   *
   * Un hint que no matchea en NINGÚN contenedor no es ambiguo: es la
   * colección vacía (0), y ESO es el dato — `expect_count rows > 0` debe
   * poder reportar "incumplido" sobre una tabla sin resultados, no bloquear
   * como si fuera un hint irresoluble.
   *
   * Cuenta solo lo VISIBLE: una tabla oculta (`[hidden]` tras una búsqueda sin
   * resultados) puede conservar filas de la búsqueda anterior en el DOM —
   * contarlas sería "trae 2 registros" sobre una pantalla que en realidad
   * muestra "No hay datos". `count()`/`toHaveCount()` sin filtrar cuentan
   * elementos ausentes de la vista igual que los presentes.
   */
  private async resolveCollection(
    step: WalkStep,
  ): Promise<{ locator: Locator; via: string; frame_path: string[] } | { fallo: 'ambito' | 'ambiguo' }> {
    const scopes = await this.scopes();
    const containers: Array<{ scope: Page | Frame | Locator; path: string[]; via?: string }> = step.scope
      ? await this.resolveScope(step.scope, scopes)
      : scopes;
    /**
     * K0.33 — "no encontré DÓNDE contar" y "no sé en CUÁL de dos contar" son
     * hallazgos distintos y hasta ahora se reportaban con la misma frase
     * ("ambigua entre contenedores/frames"), que además era falsa en el primer
     * caso. Es el mismo principio que separó ámbito-irresoluble de texto-ausente
     * en K0.30: mezclarlos envenena la reconciliación, porque uno apunta al
     * guion y el otro a la pantalla.
     */
    if (step.scope && containers.length === 0) return { fallo: 'ambito' };

    const visible = (scope: Page | Frame | Locator, attempt: LocatorAttempt): Locator =>
      this.attemptToLocator(scope, attempt).filter({ visible: true });

    const rawPlan = hintLocatorPlan(step.hint ?? {}, this.priority);
    for (const plan of [rawPlan, normalizedPlan(rawPlan)]) {
      for (const attempt of plan) {
        const hits: Array<(typeof containers)[number]> = [];
        for (const container of containers) {
          const count = await visible(container.scope, attempt).count().catch(() => 0);
          if (count > 0) hits.push(container);
        }
        if (hits.length > 1) return { fallo: 'ambiguo' }; // no se adivina en cuál contar
        if (hits.length === 1) {
          const container = hits[0];
          const source = container.via ? `${container.via} >> ${locatorSource(attempt)}` : locatorSource(attempt);
          return { locator: visible(container.scope, attempt), via: source, frame_path: container.path };
        }
      }
    }
    // ningún intento resolvió en ningún contenedor: colección VACÍA — es el dato, no un fallo de locator
    const attempt = rawPlan[0];
    const container = containers[0];
    if (!attempt || !container) return { fallo: 'ambito' };
    const source = container.via ? `${container.via} >> ${locatorSource(attempt)}` : locatorSource(attempt);
    return { locator: visible(container.scope, attempt), via: source, frame_path: container.path };
  }

  /**
   * Cuenta elementos VISIBLES que matchean `hint` DENTRO de un `scope` ya
   * resuelto (usado por `expect_each` para el sub-conteo de cada contenedor).
   * Aquí no hay ambigüedad de "en cuál contenedor": `scope` ya es uno
   * concreto — solo se prueba la escalera de intentos hasta que uno cuenta >0.
   */
  private async countMatches(scope: Page | Frame | Locator, hint: StepHint): Promise<number> {
    const rawPlan = hintLocatorPlan(hint, this.priority);
    for (const plan of [rawPlan, normalizedPlan(rawPlan)]) {
      for (const attempt of plan) {
        const n = await this.attemptToLocator(scope, attempt).filter({ visible: true }).count().catch(() => 0);
        if (n > 0) return n;
      }
    }
    return 0;
  }

  /**
   * Captura de tabla como DATOS (Fase 6) — sube desde la PRIMERA fila
   * resuelta hasta su ancestro `<table>`/`role=table|grid` y copia
   * headers+rows en un único `evaluate`. Nunca antes de que la colección haya
   * pasado por una espera de visibilidad/`toHaveCount` (evaluate no
   * auto-espera): llamar esto sobre una tabla a medio cargar es el falso 0 que
   * la spec pide evitar — por eso el caller solo la invoca tras contar.
   */
  private async captureTable(rowsLocator: Locator, frame_path: string[]): Promise<void> {
    const screen = this.state.screens.find((s) => s.name === this.state.current_screen);
    if (!screen) return;
    /**
     * Sube desde la primera fila resuelta hasta su ancestro `<table>`/
     * `role=table|grid` vía XPath `ancestor::` NATIVO, encadenado sobre el
     * locator (sin `evaluate`, cero riesgo del bug `__name`/esbuild de K0.13:
     * medido en vivo, hasta un arrow ANÓNIMO inline revienta bajo `tsx` real
     * dentro de este fichero — el transform de vitest no lo reproduce, y por
     * eso NINGUNA función de este fichero pasa una referencia a `evaluate`).
     * `ancestor::` se evalúa respecto al nodo de CONTEXTO (la fila), que es
     * justo lo que un `.locator()` encadenado le da.
     */
    const table = rowsLocator.first().locator('xpath=ancestor::*[self::table or @role="table" or @role="grid"][1]');
    if ((await table.count().catch(() => 0)) !== 1) return; // sin tabla ancestro reconocible: nada que capturar

    const headers = await table
      .locator('thead th, thead [role="columnheader"], [role="columnheader"]')
      .allTextContents()
      .catch(() => []);
    // filas de negocio = todas las role=row MENOS las de <thead> (que van
    // primero en el orden del DOM en cualquier tabla nativa)
    const allRows = await table.getByRole('row').all().catch(() => []);
    const headerRowCount = await table.locator('thead').getByRole('row').count().catch(() => 0);
    const rows: string[][] = [];
    for (const r of allRows.slice(headerRowCount)) {
      rows.push(await r.locator('td, th, [role="cell"], [role="gridcell"]').allTextContents().catch(() => []));
    }
    if (headers.length === 0 && rows.length === 0) return; // nada reconocible: no inventar estructura vacía

    const dt: DomTable = { headers, rows, ...(frame_path.length ? { frame_path } : {}) };
    screen.tables = screen.tables ?? [];
    screen.tables.push(dt);
  }

  // ----------------------------------------------- virtual scroll (Fase 4)

  /**
   * Resuelve `hint` DENTRO de un contenedor ya concreto (usado por
   * `scroll_until` en cada iteración: la fila objetivo puede no existir aún
   * en el DOM). Misma regla dura que siempre — una coincidencia visible =
   * adelante, dos o más = se planta —, con un tercer estado explícito:
   * `not_found` no es ambigüedad, es "todavía no renderizado" (o
   * genuinamente ausente; `scroll_until` es quien decide cuándo darse por
   * vencido, no esta función).
   */
  private async resolveWithinContainer(
    container: Locator,
    hint: StepHint,
  ): Promise<{ status: 'found'; locator: Locator } | { status: 'ambiguous' } | { status: 'not_found' }> {
    const rawPlan = hintLocatorPlan(hint, this.priority);
    for (const plan of [rawPlan, normalizedPlan(rawPlan)]) {
      for (const attempt of plan) {
        const loc = this.attemptToLocator(container, attempt);
        const count = await loc.count().catch(() => 0);
        if (count === 1) return { status: 'found', locator: loc };
        if (count > 1) {
          const visible = loc.filter({ visible: true });
          const vc = await visible.count().catch(() => 0);
          if (vc === 1) return { status: 'found', locator: visible };
          if (vc > 1) return { status: 'ambiguous' };
          // count>1 pero 0 visibles: aún no renderizado de forma visible — not_found, sigue la escalera
        }
      }
    }
    return { status: 'not_found' };
  }

  /**
   * Un "paso" de scroll dentro del viewport virtualizado. `mouse.wheel` (no
   * `evaluate`, ni fijar `scrollTop` a mano): es la vía que Playwright
   * documenta para listas virtualizadas, porque dispara los mismos handlers
   * de `scroll`/`wheel` que un usuario real — fijar `scrollTop` por código a
   * veces no dispara el recálculo del rango visible.
   */
  private async scrollContainer(container: Locator): Promise<void> {
    await container.hover({ timeout: STEP_TIMEOUT_MS }).catch(() => {});
    const box = await container.boundingBox().catch(() => null);
    // varios "viewports" por salto: a 20-30 filas visibles por pantalla, un
    // objetivo a miles de filas de distancia con un salto de una pantalla
    // por iteración agotaría max_steps sin necesidad — el bucle sigue
    // acotado por max_steps, solo se cubre más terreno por vuelta.
    const deltaY = Math.max((box?.height ?? 400) * 3, 800);
    await this.page.mouse.wheel(0, deltaY);
  }

  // -------------------------------------------------- modo asistido (K0.10d)

  /** Descripción legible del hint, para que el QA sepa qué le pide el FD. */
  /**
   * Qué le decimos al QA cuando se le pide ayuda: la causa medida contra la página
   * y los nombres de pantalla que se parecen a lo que el plan pedía.
   *
   * El ranking sale de `candidatosParaInforme`, la MISMA función que usa el informe
   * del verificador (G3). Deliberado: si el panel y el informe ordenaran distinto, el
   * QA y el Writer verían pantallas que no cuadran.
   *
   * Nunca lanza. Un diagnóstico es una ayuda; si no se puede medir, el panel se abre
   * igual con lo que había antes — quedarse sin panel por no poder contar sería
   * cambiar una molestia por una parada.
   */
  /**
   * Lo que dice la pantalla cuando una postcondición no se cumple: la prosa del panel
   * y la lista elegible, **de una sola lectura**.
   *
   * Que salgan juntas no es comodidad. El panel de veredicto enseña las dos a la vez
   * —la frase «lo que hay es…» arriba y la lista debajo—, y con dos capturas podían
   * discrepar: entre una y otra la aplicación sigue viva, un spinner termina, un
   * toast se desvanece. Un panel que dice una cosa en la frase y otra en la lista
   * destruye la confianza que necesita para que su firma valga algo.
   *
   * Ordenados, NO filtrados: aquí la pregunta es qué dice la pantalla, y un resultado
   * que no se parece a lo esperado sigue siendo la respuesta.
   */
  private async diagnosticoDeResultado(esperado: string): Promise<{ texto: string; candidatos: string[] }> {
    const candidatos = resultadosOrdenados(await this.nombresDePantalla(true), esperado);
    return { texto: textoAsistencia({ causa: 'resultado-ausente', pedido: esperado, candidatos }), candidatos };
  }

  private async diagnosticarParaPanel(step: WalkStep): Promise<string> {
    const pedido = pedidoDelPaso(step.hint);
    const esResultado = step.action === 'expect_text';
    try {
      if (esResultado) return (await this.diagnosticoDeResultado(step.value ?? pedido)).texto;
      const nombres = await this.nombresDePantalla(false, step.hint?.role);
      const n = step.hint ? await this.countMatches(this.page, step.hint) : 0;
      const causa = n > 1 ? 'ambiguo' : n === 1 ? 'unico-pero-falla' : 'ausente';
      /**
       * Con un pedido demasiado corto para emparejar por palabras («X», el boton de
       * cerrar que el FD de onesait nombra tres veces) la lista sale vacia SIEMPRE, y
       * el panel concluia «ni nada que se le parezca» con el boton delante. Ahi la
       * lista vacia no es un hallazgo, es una comparacion que no se puede hacer: se
       * ensena lo que hay del rol pedido y que elija el QA.
       */
      const candidatos = pedidoSinPalabrasUtiles(pedido)
        ? resultadosOrdenados(nombres, pedido)
        : candidatosParaInforme(nombres, pedido, n > 1);
      return textoAsistencia({ causa, pedido, coincidencias: n, candidatos });
    } catch {
      return this.hintText(step);
    }
  }

  /**
   * Nombres visibles de la pantalla actual, leídos EN VIVO y no del dom-map: en el
   * momento en que un paso se planta, la pantalla puede no estar capturada todavía
   * (la captura va por transiciones), y un candidato rancio es peor que ninguno.
   * Reutiliza el mismo extractor que la captura, así que ve exactamente lo mismo.
   *
   * `resultado` elige el cubo: para una postcondición interesan los textos de
   * negocio (heading/alert/status), que ya distinguen resultado de mueble; para una
   * acción, los elementos con los que se puede interactuar.
   */
  private async nombresDePantalla(resultado: boolean, rol?: string): Promise<string[]> {
    const raw = (await this.page.evaluate(captureScript(TESTID_ATTR_CANDIDATES, this.cssFallbackAttrs))) as RawElement[];
    const vivos: RawElement[] = [];
    for (const el of raw) {
      if (!el.name) continue;
      if (resultado ? !el.business : el.business || el.landmark) continue;
      vivos.push(el);
    }
    /**
     * Si el plan dice «botón», una celda de la tabla NO es un candidato.
     *
     * Medido montando el ejercicio de OrangeHRM: pidiendo el botón «Search Employee»
     * la lista salía con 8 entradas y 5 eran **nombres de empleados** del listado,
     * colados porque comparten la palabra «employee». Es exactamente el criterio de
     * muerte que el plan puso a P2 («si los candidatos salen ruidosos, la lista no
     * sirve») asomando a la primera en una app real.
     *
     * Acotar por rol es la poda barata y principiada: el rol lo declara el propio
     * plan. Si no queda ninguno del rol pedido, se devuelve todo — más vale una lista
     * ruidosa que una vacía cuando el rol del plan estaba equivocado, que es
     * justamente uno de los motivos por los que el paso se plantó.
     */
    /**
     * Con una ventana flotante abierta, lo de detrás no se puede pulsar: los
     * candidatos son los de la ventana. Sin esto la lista se llenaba con los botones
     * de la pantalla de fondo y el botón de cerrar del modal caía fuera del tope —
     * medido en OrangeHRM con el modal de confirmación abierto.
     *
     * Es el escenario de onesait, donde el caso pasa por cinco ventanas anidadas y
     * tres de sus pasos son «pulsar el botón de cerrar X» de ventanas distintas.
     */
    const enVentana = vivos.filter((el) => el.inDialog);
    const superficie = enVentana.length > 0 ? enVentana : vivos;

    const delRol = rol ? superficie.filter((el) => el.role === rol) : [];
    const elegidos = delRol.length > 0 ? delRol : superficie;
    return [...new Set(elegidos.map((el) => el.name as string))];
  }

  private hintText(step: WalkStep): string {
    const h = step.hint ?? {};
    const parts = [h.test_id && `test-id "${h.test_id}"`, h.role, h.name && `"${h.name}"`, h.label && `label "${h.label}"`, h.text && `texto "${h.text}"`];
    return `${step.action} sobre ${parts.filter(Boolean).join(' ') || '(sin hint)'}`;
  }

  /** exposeFunction una sola vez: sobrevive navegaciones; registrarla dos veces lanza. */
  private async ensureAssistBridge(): Promise<void> {
    if (this.assistBridgeReady) return;
    await this.page.exposeFunction('__qaAssistSubmit', (payload: AssistSubmission) => {
      const pending = this.assistPending;
      this.assistPending = null;
      pending?.(payload);
    });
    /**
     * Tercer puente (D10/D23) — escritura al vuelo de lo grabado. Los puentes de
     * `exposeFunction` SOBREVIVEN a una navegación (la interfaz no), así que este es
     * el único sitio por donde la evidencia puede salir de la página antes de que la
     * página desaparezca. El panel lo llama en cada gesto; el walker lo persiste.
     */
    await this.page.exposeFunction('__qaAssistTrack', (seq: PickedElement[]) => {
      this.assistTrack?.(Array.isArray(seq) ? seq : []);
    });
    /**
     * P3 — las preferencias del panel (postura y posicion), POR SITIO. El panel
     * informa en cada cambio y esto las hace durables en config/panel-prefs/,
     * como los hint-aliases y por la misma razon: son del QA sobre este sitio,
     * no de un run. Solo se persisten los campos conocidos — el puente es una
     * superficie que la pagina puede llamar, y no se escribe lo que la pagina
     * quiera sino lo que el schema dice.
     */
    await this.page.exposeFunction('__qaPanelPrefs', (p: PanelPrefs) => {
      try {
        const ruta = this.panelPrefsPath;
        mkdirSync(dirname(ruta), { recursive: true });
        const limpio: PanelPrefs = {
          ...(p && (p.postura === 'normal' || p.postura === 'barra' || p.postura === 'fantasma') ? { postura: p.postura } : {}),
          ...(p && typeof p.left === 'string' && p.left.length < 32 ? { left: p.left } : {}),
          ...(p && typeof p.top === 'string' && p.top.length < 32 ? { top: p.top } : {}),
        };
        writeFileSync(ruta, JSON.stringify(limpio, null, 2), 'utf8');
      } catch {
        // preferencias son conveniencia: un fallo de escritura no puede tocar el run
      }
    });
    /**
     * Fase B — el puente del panel de VEREDICTO. Aparte del de asistencia a
     * propósito: aquel transporta una secuencia de elementos para construir un
     * locator, éste un veredicto sobre quién tiene razón. Compartir el canal
     * obligaría a cada consumidor a comprobar cuál de las dos formas le ha llegado.
     */
    await this.page.exposeFunction('__qaVerdictSubmit', (payload: VerdictSubmission) => {
      const pending = this.verdictPending;
      this.verdictPending = null;
      pending?.(payload);
    });
    /**
     * Segundo puente (K0.11c): el panel pregunta EN VIVO por la calidad del locator
     * de un elemento recién señalado y el walker responde con tier + fragilidad. Así
     * el QA se entera de que un campo no tiene identidad única con la pantalla
     * delante, no media hora después leyendo un JSON — que fue lo que pasó en s7.
     * El Inspector de Playwright muestra el locator pero no juzga su fragilidad.
     */
    await this.page.exposeFunction('__qaAssistCheck', async (el: PickedElement) => {
      const resolved = await this.locatorForPicked(el).catch(() => null);
      if (!resolved) return { ok: false, label: 'sin identidad única', fragile: true };
      const { candidate } = resolved;
      return {
        ok: true,
        tier: candidate.tier,
        fragile: candidate.fragile,
        label: candidate.fragile ? `frágil (${candidate.tier})` : candidate.tier,
        why: candidate.why ?? '',
        source: candidate.source,
      };
    });
    /**
     * Tercer puente (K0.20 A) — el QA teclea un locator a mano en el panel y el
     * walker lo valida EN VIVO contra el DOM antes de aceptarlo: cuántos elementos
     * resuelve. La página es la fuente de la verdad, pero no se acepta un locator a
     * ciegas — se comprueba que resuelve único aquí mismo.
     */
    await this.page.exposeFunction('__qaAssistResolve', async (src: string) => {
      const loc = this.locatorFromChain(this.page, src);
      if (!loc) return { ok: false, count: 0, reason: 'gramática de locator no reconocida' };
      const count = await loc.count().catch(() => 0);
      const unique = await this.uniqueOrNull(loc).catch(() => null);
      return { ok: unique !== null, count, unique: unique !== null };
    });
    this.assistBridgeReady = true;
  }

  /**
   * Escalera COMPLETA sobre un elemento señalado (K0.11a): semantic → scoped →
   * anchored → css → indexed. Devuelve el primero que resuelve único, con su tier y
   * su fragilidad, para que el parche y el panel puedan decir la verdad sobre él.
   */
  private async locatorForPicked(
    el: PickedElement,
  ): Promise<{ locator: Locator; candidate: LocatorCandidate } | null> {
    /**
     * K0.20 (A) — si el QA tecleó un locator a mano, es AUTORITATIVO: se usa ese y
     * solo ese. Si no resuelve único, se devuelve null (el badge lo dirá en rojo y
     * el QA lo corrige) — no se cae de vuelta a la escalera a escondidas, porque el
     * QA eligió explícitamente y merece saber si su elección resuelve o no.
     */
    if (el.manual_locator) {
      const loc = this.locatorFromChain(this.page, el.manual_locator);
      const unique = loc ? await this.uniqueOrNull(loc).catch(() => null) : null;
      if (unique) {
        return {
          locator: unique,
          candidate: { source: el.manual_locator, tier: 'manual', fragile: false, why: 'introducido por el QA' },
        };
      }
      return null;
    }
    for (const candidate of buildFallbackCandidates(el, this.priority)) {
      const loc = this.locatorFromChain(this.page, candidate.source);
      if (!loc) continue;
      const unique = await this.uniqueOrNull(loc).catch(() => null);
      if (unique) return { locator: unique, candidate };
    }
    return null;
  }

  /** P3 — preferencias del panel por sitio, al lado de los hint-aliases. */
  private get panelPrefsPath(): string {
    const seguro = this.script.site_id.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
    return resolve(process.cwd(), 'config/panel-prefs', `${seguro}.json`);
  }

  /**
   * P3 — lo que el panel necesita saber del caso para pintarse: las preferencias
   * durables del sitio y la tira de pasos (hecho / aqui / no cuadra / pendiente),
   * derivada de lo que el estado YA tiene — completed, open_questions — sin
   * inventar nada nuevo que mantener.
   */
  private p3DelPaso(flow: WalkFlow, step: WalkStep): P3Opts {
    let prefs: PanelPrefs = {};
    try {
      if (existsSync(this.panelPrefsPath)) prefs = parseJsonLoose<PanelPrefs>(readFileSync(this.panelPrefsPath, 'utf8'));
    } catch {
      prefs = {}; // preferencias ilegibles: el panel nace con las de fabrica
    }
    const bloqueados = new Set(this.state.open_questions.filter((q) => q.flow === flow.flow).map((q) => q.step));
    const tira: MarcaDeTira[] = flow.steps.map((s) => ({
      id: s.id,
      e: s.id === step.id ? 'aqui' : bloqueados.has(s.id) ? 'nocuadra' : this.state.completed.includes(`${flow.flow}/${s.id}`) ? 'hecho' : 'pend',
    }));
    return { prefs, tira };
  }

  /** Ruta del marcador de asistencia en curso (K0.45/D12). */
  private get assistMarkerPath(): string {
    return resolve(this.opts.workDir, 'assist-pending.json');
  }

  /**
   * Deja constancia EN DISCO de que hay un panel abierto esperando a una persona.
   * No sustituye al aviso por consola: lo respalda. Un fallo de escritura aquí no
   * puede tumbar la asistencia —el panel ya está en pantalla y el QA puede
   * atenderlo igual—, así que se degrada a aviso y se sigue.
   */
  private writeAssistMarker(flow: WalkFlow, step: WalkStep, motivo: string): void {
    try {
      const payload = assistMarkerPayload({
        flow: flow.flow,
        step: step.id,
        action: step.action,
        motivo,
        url: this.page.url(),
        mutating: !isRetrySafe(step),
        timeoutMs: this.opts.assistTimeoutMs,
        now: Date.now(),
        ...(this.assistRecorded.length ? { grabado: this.assistRecorded } : {}),
        scriptHash: this.state.script_hash,
      });
      writeFileSync(this.assistMarkerPath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.error(`[dom-walker] no se pudo escribir assist-pending.json: ${String(err).split('\n')[0]}`);
    }
  }

  /**
   * D10/D23 — lo grabado, a disco EN EL MOMENTO DEL GESTO.
   *
   * El panel llama a este puente cada vez que su secuencia cambia. Se escribe
   * entero el marcador (es pequeño y los gestos van a ritmo humano: no hay nada
   * que optimizar) y así lo grabado sobrevive a las dos formas de morir que se
   * midieron en campo — la navegación que destruye el panel y el SIGTERM que mata
   * el proceso a los diez minutos. Antes de esto el arreglo de K0.44 solo sabía
   * avisar de la pérdida; avisar no es conservar.
   */
  private trackAssistRecording(flow: WalkFlow, step: WalkStep, motivo: string, seq: PickedElement[]): void {
    this.assistRecorded = seq;
    this.writeAssistMarker(flow, step, motivo);
  }

  /** Retira el marcador. Se llama desde el ÚNICO punto de cierre de la espera. */
  private clearAssistMarker(): void {
    rmSync(this.assistMarkerPath, { force: true });
    this.assistRecorded = [];
  }

  /**
   * Lo grabado que dejó una sesión interrumpida, si es de ESTE paso y ESTE guion
   * (los cerrojos viven en `recuperarGrabacion`, pura y con sus tests). Se anuncia
   * siempre: resucitar en silencio pasos que el QA no recuerda haber demostrado
   * sería peor que perderlos.
   */
  private recuperarAssistRecording(flow: WalkFlow, step: WalkStep): PickedElement[] {
    if (!existsSync(this.assistMarkerPath)) return [];
    let previo: Partial<AssistMarker> | null = null;
    try {
      previo = JSON.parse(readFileSync(this.assistMarkerPath, 'utf8')) as Partial<AssistMarker>;
    } catch {
      return []; // marcador ilegible: no se recupera nada y no se inventa
    }
    const rec = recuperarGrabacion(previo, {
      flow: flow.flow,
      step: step.id,
      scriptHash: this.state.script_hash,
    });
    if (!rec) return [];
    console.error(
      `[dom-walker] recuperados ${rec.length} paso(s) grabados de una sesión anterior interrumpida ` +
        `(${flow.flow}/${step.id}). Revísalos en el panel antes de enviar.`,
    );
    this.audit('allow', `grabación recuperada tras interrupción en ${flow.flow}/${step.id}: ${rec.length} paso(s)`, {
      phase: 'assist',
      source: 'human',
      recovered: rec.length,
    });
    return rec;
  }

  /**
   * Peldaño asistido de la escalera. Abre el panel Record sobre la app, espera al
   * QA, y con la secuencia grabada: resuelve el objetivo, propone el parche (camino
   * + objetivo), lo verifica por replay en contexto fresco y promueve el alias.
   * Devuelve el locator del objetivo si se resolvió, o null (drift/block/timeout).
   */
  private async assistResolve(
    flow: WalkFlow,
    step: WalkStep,
    contextReason?: string,
  ): Promise<{ locator: Locator; via: string; frame_path: string[]; performed?: boolean } | null> {
    await this.ensureAssistBridge();
    this.assistOpenUrl = this.page.url();
    this.audit('llm_call', `asistencia solicitada: ${flow.flow}/${step.id}`, { phase: 'assist', source_hint: this.hintText(step) });

    const mutating = !isRetrySafe(step);
    /**
     * D27 — el panel recibe la CAUSA, no la pista. Antes esto era `hintText(step)`:
     * la forma del hint tal cual, sin decir si el elemento faltaba o sobraba. En
     * campo un QA respondio "No existe" a un elemento que existia TRES veces, y esa
     * respuesta se promueve a memoria durable. La causa se MIDE contra la pagina
     * justo antes de abrir el panel; si la medicion falla, se caee al texto de antes
     * en vez de inventar un diagnostico.
     */
    const baseReason = contextReason ?? (await this.diagnosticarParaPanel(step));
    const segundos = Math.round(this.opts.assistTimeoutMs / 1000);
    let endReason = `asistencia sin respuesta en ${segundos}s (timeout)`;
    let reinjections = 0;

    /**
     * D23 — lo grabado en una sesión que alguien mató. El marcador es lo único que
     * queda de ella, y si es de ESTE paso y ESTE guion se devuelve al panel en vez
     * de pedirle al QA que vuelva a demostrar lo mismo. Va ANTES de escribir el
     * marcador de esta espera, que lo sobrescribe.
     */
    this.assistRecorded = this.recuperarAssistRecording(flow, step);
    this.assistTrack = (seq) => this.trackAssistRecording(flow, step, baseReason, seq);

    // K0.45 (D12) — el aviso por consola YA existía y aun así el QA no se enteró: quien
    // lanzó el walker canalizó la salida por un `Select-Object`, que no emite hasta que el
    // proceso termina. Puentes vivos, panel abierto, y diez minutos de silencio. La espera
    // tiene que ser observable FUERA de stdout, así que se deja marcador en disco — mismo
    // patrón que `rescue-request.json`, que ya resolvió esto para el rescate.
    this.writeAssistMarker(flow, step, baseReason);
    console.error(
      `[dom-walker] ASISTENCIA ${flow.flow}/${step.id}: PANEL ABIERTO en la ventana del navegador. ` +
        `Ve a esa ventana y atiéndelo (Grabar → hazlo en la app → Parar). El walker está BLOQUEADO ` +
        `hasta entonces, o ${segundos}s. Escrito assist-pending.json.`,
    );

    const submission = await new Promise<AssistSubmission | null>((res) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout>;
      let watchdog: ReturnType<typeof setInterval>;
      const finish = (p: AssistSubmission | null, reason?: string): void => {
        if (done) return;
        done = true;
        if (reason) endReason = reason;
        clearTimeout(timer);
        clearInterval(watchdog);
        this.assistPending = null;
        this.assistTrack = null;
        this.clearAssistMarker();
        res(p);
      };
      timer = setTimeout(() => finish(null), this.opts.assistTimeoutMs);
      this.assistPending = (p) => finish(p);

      const inject = (note: string): Promise<void> =>
        this.page
          // D10/D23 — el panel nace con lo ya grabado dentro (recuperado de una
          // sesion interrumpida, o conservado a traves de la navegacion que lo mato).
          .evaluate(assistOverlayScript(TESTID_ATTR_CANDIDATES, step, note, mutating, this.assistRecorded, this.p3DelPaso(flow, step)))
          .then(() => undefined)
          // K0.44 (D10) — antes esto solo se escribía por consola y la espera seguía
          // viva: el walker aguardaba el timeout entero por un panel que no llegó a
          // existir. El silencio era peor que el fallo (clase K0.29/D2).
          .catch((err) => finish(null, `no se pudo inyectar el panel de asistencia: ${String(err).split('\n')[0]}`));
      void inject(baseReason);

      watchdog = setInterval(() => {
        if (done) return;
        void this.page
          .locator(`[${ASSIST_HOST_ATTR}]`)
          .count()
          .then((n) => {
            if (done || n > 0) return;
            if (reinjections >= ASSIST_MAX_REINJECTIONS) {
              finish(
                null,
                `el panel de asistencia desapareció ${reinjections} veces (la página navega o se recarga sola); ` +
                  `no se pudo mantener en pantalla`,
              );
              return;
            }
            reinjections += 1;
            /**
             * D10 — lo grabado YA NO vive dentro del panel: sale por el puente
             * `__qaAssistTrack` en cada gesto, así que la navegación se lleva la
             * interfaz y no la evidencia. El panel se reinyecta CON la secuencia
             * dentro, y el aviso dice lo que de verdad ha pasado.
             *
             * Lo que NO cambia: si el paso muta negocio hay que decirlo con todas las
             * letras, porque la acción demostrada pudo ejecutarse al navegar y
             * repetirla la dispararía dos veces. Para eso está "capturar sin
             * ejecutar" (K0.14), que el panel ofrece cuando `mutating`.
             */
            const conservados = this.assistRecorded.length;
            const nota =
              `${baseReason}\n\n⚠ La página cambió y el panel se ha reabierto` +
              (conservados
                ? ` CON los ${conservados} paso(s) que ya habías grabado (se conservan).`
                : ` (todavía no habías grabado nada).`) +
              ` Intento ${reinjections}/${ASSIST_MAX_REINJECTIONS}.` +
              (mutating
                ? ' OJO: este paso modifica datos de negocio — si la acción ya se ejecutó al navegar, usa "capturar sin ejecutar" en vez de repetirla.'
                : '');
            console.error(
              `[dom-walker] el panel de asistencia desapareció (la página navegó); re-inyectando ` +
                `${reinjections}/${ASSIST_MAX_REINJECTIONS} — ${conservados} paso(s) grabados CONSERVADOS`,
            );
            // 'skip' y no 'warn': la unión de acciones del walker no tiene 'warn' y
            // ampliarla es decisión aparte (familia D2). El mensaje lleva el sentido.
            this.audit('skip', `panel de asistencia perdido por navegación en ${flow.flow}/${step.id}`, {
              phase: 'assist',
              source: 'human',
              reinjection: reinjections,
              mutating,
            });
            void inject(nota);
          })
          // la página está navegando justo ahora: no es un diagnóstico, se reintenta
          // en el siguiente tick del vigilante
          .catch(() => undefined);
      }, ASSIST_WATCHDOG_MS);
    });

    if (!submission) {
      this.blockStep(flow, step, endReason, false);
      return null;
    }
    if (submission.kind === 'drift') {
      this.blockStep(flow, step, `drift: ${submission.reason ?? 'el QA confirma que el elemento no existe'}`, false);
      this.audit('block', `drift confirmado por el QA en ${flow.flow}/${step.id}`, { phase: 'assist', source: 'human' });
      return null;
    }
    if (submission.kind === 'block') {
      this.blockStep(flow, step, submission.reason ?? 'el QA bloqueó el paso', false);
      this.audit('block', `paso bloqueado por el QA: ${flow.flow}/${step.id}`, { phase: 'assist', source: 'human' });
      return null;
    }

    const sequence = pruneAssistSequence(submission.sequence ?? []);
    if (sequence.length === 0) {
      await this.assistTell('No se grabó ninguna interacción. Vuelvo a intentarlo en el siguiente paso.', false);
      this.blockStep(flow, step, 'asistencia: no se grabó ninguna interacción', false);
      return null;
    }

    // escalera completa por elemento (K0.11a)
    const candidates: Array<LocatorCandidate | null> = [];
    const resolvedByIdx: Array<{ locator: Locator; candidate: LocatorCandidate } | null> = [];
    for (const el of sequence) {
      const r = await this.locatorForPicked(el);
      candidates.push(r?.candidate ?? null);
      resolvedByIdx.push(r);
    }

    let steps = buildAssistSteps(sequence, candidates, {
      targetIndex: submission.target_index !== undefined && submission.target_index >= 0 ? submission.target_index : undefined,
      targetAction: step.action,
    });
    const targetIdx = steps.findIndex((s) => s.role === 'target');
    const target = targetIdx >= 0 ? resolvedByIdx[targetIdx] : null;

    if (!target) {
      const why = candidates[targetIdx] === null
        ? 'el elemento señalado no tiene identidad única ni por ancla, texto vecino, id estable o posición'
        : 'no se pudo determinar el objetivo de la secuencia';
      await this.assistTell(`No pude construir un locator: ${why}.`, false);
      this.blockStep(flow, step, `asistencia: ${why}`, false);
      this.audit('block', `asistencia sin locator único en ${flow.flow}/${step.id}`, { phase: 'assist', source: 'human' });
      return null;
    }

    // D64: la entrega ya está en manos del walker — el panel no puede interceptar
    // ni la verificación en vivo ni la acción real que viene después.
    await this.panelDejaDeInterceptar();

    let verify = await this.verifyAssistPatch(flow, step, steps);
    // minimización por replay (K0.11e): quitar abridores de uno en uno mientras siga
    // verificando. El QA exploró antes de dar con el camino; no tiene por qué saber
    // cuáles de sus pasos eran necesarios — se PRUEBA, no se pregunta.
    // K0.25/D2: sin replay limpio (camino previo con negocio) no hay minimización —
    // la verificación en vivo pasaría con cualquier subconjunto y podaría de más.
    if (verify.ok && this.opts.assistMinimize && !this.hasMutatingPrior(flow, step)) {
      const min = await this.minimizeAssistSteps(flow, step, steps);
      if (min.steps.length < steps.length) {
        steps = min.steps;
        console.error(`[dom-walker] parche minimizado: ${min.dropped} paso(s) innecesario(s) descartados por replay`);
      }
    }

    this.assistPatch.entries.push({
      flow: flow.flow,
      replaces_step: step.id,
      ...(step.hint ? { original_hint: step.hint } : {}),
      steps,
      // K0.16: los mismos pasos ya en forma de guion, listos para pegar
      walk_steps: assistStepsToWalkSteps(steps, step.id),
      verified: verify.ok,
      ...(verify.reason ? { verify_reason: verify.reason } : {}),
    });
    this.writeAssistPatch();

    const frag = steps.filter((s) => s.fragile);
    await this.assistTell(
      verify.ok
        ? `Parche verificado: ${steps.length} paso(s)${frag.length ? `, ${frag.length} con locator frágil` : ''}.`
        : `El camino grabado NO reproduce en limpio: ${verify.reason ?? 'motivo desconocido'}`,
      verify.ok,
    );

    /**
     * K0.14 — "capturar sin ejecutar": el parche ya está escrito y verificado, pero
     * la acción NO se ejecuta y el flujo se aborta. Seguir con los pasos siguientes
     * sobre un estado que no corresponde produciría hallazgos de drift falsos, que
     * es exactamente el veneno que el informe de reconciliación no puede permitirse.
     * El locator TAMPOCO se promueve a alias: sin acción no hay postcondición que lo
     * confirme, y la promoción es condicional por diseño.
     */
    if (submission.execute === false) {
      this.flowAborted = true;
      /**
       * K0.47 — la enseñanza del QA ya NO se evapora con el flujo abortado. Antes
       * aquí no se empujaba registro de rescate y el parche moría con la limpieza
       * de `.work/` del run siguiente: cuanto más delicado el paso (los que mueven
       * negocio, que son exactamente donde el panel recomienda esta salida), menos
       * sobrevivía lo enseñado. El registro viaja con `executed: 'none'` — el
       * veredicto de promoción sabe que no puede exigir transición de una acción
       * que se impidió a propósito — y con la fragilidad que el panel ya midió.
       */
      if (step.hint) {
        this.state.rescues.push({
          flow: flow.flow, step: step.id, resolved: true, locator: target.candidate.source,
          audit_logged: true, source: 'human', executed: 'none',
          ...(target.candidate.fragile ? { fragile: true } : {}),
        });
      }
      this.blockStep(
        flow,
        step,
        `capturado sin ejecutar por decisión del QA (${step.action} cambia estado de negocio); ` +
          `parche ${verify.ok ? 'verificado' : 'SIN verificar'} en assist-patch.json — el resto del flujo se detiene`,
        false,
      );
      this.audit('skip', `capturado sin ejecutar ${flow.flow}/${step.id} → ${target.candidate.source}`, {
        phase: 'assist',
        source: 'human',
        patch_verified: verify.ok,
        flow_aborted: true,
      });
      console.error(
        `[dom-walker] CAPTURADO SIN EJECUTAR ${flow.flow}/${step.id}: locator ${target.candidate.tier} en assist-patch.json. ` +
          `El flujo se detiene aquí: el estado de la app no se ha alterado y los pasos siguientes no serían fiables.`,
      );
      return null;
    }

    // el objetivo entra en la memoria del cliente igual que un rescate (promoción
    // condicional al cierre del flujo), pero con procedencia humana. K0.47: la
    // fragilidad viaja (antes se tiraba aquí y la promoción no podía filtrarla), y
    // `executed` distingue si la acción la disparará el walker con su bracket o ya
    // la disparó el clic del QA durante la grabación.
    const performed = submission.performed === true;
    if (step.hint) {
      this.state.rescues.push({
        flow: flow.flow, step: step.id, resolved: true, locator: target.candidate.source,
        audit_logged: true, source: 'human',
        executed: performed && !isRetrySafe(step) ? 'human' : 'walker',
        ...(target.candidate.fragile ? { fragile: true } : {}),
      });
    }
    this.audit('allow', `asistencia resuelta ${flow.flow}/${step.id} → ${target.candidate.source}`, {
      phase: 'assist',
      source: 'human',
      steps: steps.length,
      tier: target.candidate.tier,
      fragile: target.candidate.fragile,
      patch_verified: verify.ok,
    });
    console.error(
      `[dom-walker] asistencia OK: ${steps.length} paso(s), locator ${target.candidate.tier}` +
        `${target.candidate.fragile ? ' (FRÁGIL)' : ''}, parche ${verify.ok ? 'VERIFICADO' : 'SIN VERIFICAR'} → assist-patch.json`,
    );
    return { locator: target.locator, via: target.candidate.source, frame_path: [], performed };
  }

  /**
   * K0.15 — el objetivo que el QA señaló puede haber dejado de ser alcanzable entre
   * el señalamiento y el momento de actuar, y no por su culpa: **el panel vive en la
   * página**, así que pulsar `◎` o `Parar` es un clic sobre el documento y cierra
   * cualquier menú off-canvas que escuche clics fuera (react-burger-menu, drawers de
   * Material, paneles laterales de los DS corporativos). Medido en SauceDemo.
   *
   * El parche recién construido YA contiene el camino. Antes se ignoraba y se
   * ejecutaba solo el objetivo, confiando en el estado residual de la UI: un
   * descuido, porque ese estado no es nuestro. Ahora, si el objetivo no es
   * accionable, se re-ejecutan los abridores grabados y se vuelve a comprobar.
   *
   * Solo se re-ejecutan CUANDO hacen falta: un abridor suele ser un toggle, y
   * pulsarlo con el menú ya abierto lo cerraría.
   */
  private async ensureAssistedTargetReachable(
    flow: WalkFlow,
    step: WalkStep,
    target: { locator: Locator; via: string },
  ): Promise<{ ok: boolean; reason?: string }> {
    const entry = this.assistPatch.entries.find((e) => e.flow === flow.flow && e.replaces_step === step.id);
    const openers = (entry?.steps ?? []).filter((s) => s.role === 'opener');
    const navigated = this.assistOpenUrl !== null && this.page.url() !== this.assistOpenUrl;

    const r = await ensureReachable(target.locator, step.action, openers, async (src) => {
      const loc = this.locatorFromChain(this.page, src);
      return loc ? await this.uniqueOrNull(loc).catch(() => null) : null;
    });

    if (r.reopened) {
      console.error(
        `[dom-walker] el objetivo de ${flow.flow}/${step.id} ya no era accionable; ` +
          `re-ejecutados ${openers.length} abridor(es) del camino grabado → ${r.ok ? 'recuperado' : 'sigue inalcanzable'}`,
      );
      this.audit(r.ok ? 'allow' : 'block', `abridores del camino grabado re-ejecutados en ${flow.flow}/${step.id}`, {
        phase: 'assist-reach',
        openers: openers.length,
        recovered: r.ok,
        navigated,
      });
    }
    if (r.ok) return { ok: true };

    // la causa se ATRIBUYE, no se adivina: navegar y cerrarse un menú son cosas distintas
    const causa = navigated
      ? `la grabación navegó fuera de la pantalla (${this.assistOpenUrl} → ${this.page.url()})`
      : `el estado de la pantalla cambió (un menú o panel se cerró) y ${target.via} dejó de ser accionable`;
    return { ok: false, reason: `${causa}; ${r.reason}` };
  }

  /** Devuelve el resultado al panel para que el QA lo vea antes de que se cierre. */
  // ------------------------------------- veredicto sobre una postcondición (fase B)

  /** Ruta del acta durable del sitio. `config/` sobrevive a la limpieza de `.work/`. */
  private get actaPath(): string {
    return this.opts.decisionsPath ?? decisionsPathFor(this.script.site_id);
  }

  /**
   * El criterio contra el que se decide. Uno solo declarado en el flujo, o el que
   * pase el operador. **Nunca se fabrica**: una decisión de auditoría con un `rf`
   * inventado no vale nada, y un flujo que cubre tres criterios no dice cuál de los
   * tres se acaba de incumplir.
   */
  private rfDelFlujo(flow: WalkFlow): string | null {
    if (this.opts.rf?.trim()) return this.opts.rf.trim();
    return flow.criteria?.length === 1 ? flow.criteria[0] : null;
  }

  /**
   * ¿Se puede encadenar en el acta? `appendDecision` se niega igualmente sobre una
   * cadena rota, pero eso ocurriría DESPUÉS de que el QA haya decidido: su veredicto
   * se perdería con una excepción. Se comprueba en la puerta.
   */
  private actaEncadenable(): boolean {
    const p = this.actaPath;
    if (!existsSync(p)) return true;
    try {
      const { entries, malformed } = parseDecisions(readFileSync(p, 'utf8'));
      return verifyChain(entries, malformed).ok;
    } catch {
      return false;
    }
  }

  /**
   * Abre el panel de veredicto y devuelve lo que el QA pulsó, o null si la espera
   * se agotó o el panel no se pudo mantener en pantalla.
   *
   * Misma maquinaria de supervivencia que la asistencia —marcador en disco y
   * vigilante de reinyección— porque las dos formas de morir que se midieron en
   * campo son las mismas: la página que navega y se lleva la interfaz, y el proceso
   * que alguien mata. Lo que NO hay aquí es conservación de lo grabado: no hay nada
   * grabado que conservar, solo un botón que pulsar.
   */
  private async esperarVeredicto(
    flow: WalkFlow,
    step: WalkStep,
    args: { esperado: string; diagnostico: string; candidatos: string[]; rechazo?: string; deadline: number },
  ): Promise<VerdictSubmission | null> {
    const restante = args.deadline - Date.now();
    if (restante <= 0) return null;

    this.writeAssistMarker(flow, step, args.diagnostico);
    let reinjections = 0;

    const sub = await new Promise<VerdictSubmission | null>((res) => {
      let done = false;
      const relojes: Relojes = {};
      const finish = (p: VerdictSubmission | null): void => {
        if (done) return;
        done = true;
        pararRelojes(relojes);
        this.verdictPending = null;
        res(p);
      };
      relojes.espera = setTimeout(() => finish(null), restante);
      this.verdictPending = (p) => finish(p);

      const inject = (rechazo?: string): Promise<void> =>
        this.page
          .evaluate(
            verdictOverlayScript(TESTID_ATTR_CANDIDATES, step, args.esperado, args.diagnostico, args.candidatos, rechazo, this.p3DelPaso(flow, step)),
          )
          .then(() => undefined)
          // K0.44/D10 — si el panel no llega a existir, la espera NO puede seguir
          // viva: el walker aguardaría el timeout entero por una interfaz que no
          // está. El silencio es peor que el fallo.
          .catch((err) => {
            console.error(`[dom-walker] no se pudo inyectar el panel de veredicto: ${String(err).split('\n')[0]}`);
            finish(null);
          });
      void inject(args.rechazo);

      relojes.vigilante = setInterval(() => {
        if (done) return;
        void this.page
          .locator(`[${ASSIST_HOST_ATTR}]`)
          .count()
          .then((n) => {
            if (done || n > 0) return;
            if (reinjections >= ASSIST_MAX_REINJECTIONS) {
              finish(null);
              return;
            }
            reinjections += 1;
            console.error(
              `[dom-walker] el panel de veredicto desapareció (la página navegó); re-inyectando ` +
                `${reinjections}/${ASSIST_MAX_REINJECTIONS}`,
            );
            this.audit('skip', `panel de veredicto perdido por navegación en ${flow.flow}/${step.id}`, {
              phase: 'verdict',
              source: 'human',
              reinjection: reinjections,
            });
            void inject(args.rechazo);
          })
          .catch(() => undefined);
      }, ASSIST_WATCHDOG_MS);
    });

    this.clearAssistMarker();
    return sub;
  }

  /**
   * FASE B — la postcondición incumplida deja de morir en el informe.
   *
   * Hasta aquí, un `expect_text` que no se cumplía llamaba a `blockStep` y volvía.
   * Era el único drift que no podía llegar al acta, y es el que más falta hace que
   * llegue: un literal que no aparece no es un problema de locator, es el negocio
   * diciendo algo distinto de lo que el FD escribió. Quién tiene razón lo decide el
   * QA (decisión 1 del plan), y aquí se le pregunta con la pantalla delante.
   *
   * Devuelve el motivo de bloqueo AMPLIADO con el veredicto, o `null` si no hubo
   * decisión — y en los dos casos **el paso sigue bloqueado**. Esto es deliberado y
   * es la parte que más fácil sería estropear: un veredicto `app` NO pinta el paso
   * de verde. Lo que se midió es que el texto del FD no está; que el QA adopte otro
   * literal no cambia lo medido, cambia el criterio del PRÓXIMO run (fase C). Darlo
   * por bueno aquí sería fabricar exactamente el verde falso que este trabajo existe
   * para cazar.
   *
   * Los tres veredictos continúan el run, igual que antes: bloquear un paso nunca
   * abortó el flujo.
   */
  private async veredictoSobrePostcondicion(
    flow: WalkFlow,
    step: WalkStep,
    motivoOriginal: string,
    esperado: string,
  ): Promise<string | null> {
    if (!this.opts.assist || this.verifying) return null;

    /**
     * EL CAMINO ROTO, antes que ningún cerrojo.
     *
     * Si un paso ANTERIOR del mismo flujo quedó bloqueado, la pantalla que hay
     * delante no es la que el caso describe: el clic que abría el modal no ocurrió,
     * la búsqueda no se lanzó. Que el texto del FD no aparezca ahí **no dice nada**
     * sobre quién tiene razón.
     *
     * Preguntarlo igualmente sería peor que callarse, y no un poco: la respuesta se
     * firma en un acta append-only y encadenada, y de ahí sale la propuesta de FD de
     * la fase C. Una decisión tomada sobre una premisa falsa no se distingue después
     * de una buena — lleva el mismo actor, el mismo grado y el mismo hash.
     *
     * No se pregunta, y el informe dice por qué: quien lo lea tiene que poder
     * separar esto de un drift de verdad.
     */
    const previos = this.state.open_questions
      .filter((q) => q.flow === flow.flow && q.step !== step.id && rompeElCamino(q.action))
      .map((q) => q.step);
    if (previos.length) {
      const causa = causaCaminoRoto(previos);
      console.error(`[dom-walker] ${flow.flow}/${step.id}: no se pide veredicto — ${causa.split(',')[0]}.`);
      this.audit('skip', `veredicto NO pedido en ${flow.flow}/${step.id}: camino roto por ${previos.join(', ')}`, {
        phase: 'verdict',
      });
      return motivoSinVeredicto(motivoOriginal, causa);
    }

    // ---- cerrojos EN LA PUERTA. Mismo principio que la fusión de parches: pedirle
    // un veredicto al QA para descubrir después que no se puede firmar tira su
    // trabajo y pierde la decisión en silencio, que es lo que el acta impide.
    const actor = normalizeActor(this.opts.actor ?? process.env.QA_ACTOR);
    const rf = this.rfDelFlujo(flow);
    const faltan = faltaParaFirmar({
      actor,
      fdHash: this.opts.fdHash ?? null,
      rf,
      actaSana: this.actaEncadenable(),
    });
    if (faltan.length) {
      console.error(porQueNoSeAbre(faltan));
      this.audit('skip', `panel de veredicto NO abierto en ${flow.flow}/${step.id}: ${faltan.join('; ')}`, {
        phase: 'verdict',
      });
      return null;
    }

    await this.ensureAssistBridge();
    /**
     * La prosa y la lista salen de UNA lectura de la pantalla, para que no puedan
     * discrepar. Y se leen EN VIVO, no del dom-map (P2): cuando un paso se planta la
     * pantalla puede no estar capturada todavía, y un candidato rancio es peor que
     * ninguno. Si la lectura falla, el panel se abre igual con lo que se sepa —
     * quedarse sin panel por no poder listar sería cambiar una molestia por una parada.
     */
    const { texto: diagnostico, candidatos } = await this.diagnosticoDeResultado(esperado).catch(() => ({
      texto: `El plan esperaba '${esperado}' y no aparece en esta pantalla.`,
      candidatos: [] as string[],
    }));

    const segundos = Math.round(this.opts.assistTimeoutMs / 1000);
    console.error(
      `[dom-walker] VEREDICTO ${flow.flow}/${step.id}: PANEL ABIERTO en la ventana del navegador. ` +
        `La postcondición del FD no se cumple y hay que decidir quién tiene razón. El walker está ` +
        `BLOQUEADO hasta entonces, o ${segundos}s. Escrito assist-pending.json.`,
    );
    this.audit('llm_call', `veredicto solicitado: ${flow.flow}/${step.id}`, { phase: 'verdict', esperado });

    const ctx = {
      rf: rf!,
      flow: flow.flow,
      step: step.id,
      fdHash: this.opts.fdHash!,
      scriptHash: this.state.script_hash,
      actor: actor!,
      esperado,
    };
    const deadline = Date.now() + this.opts.assistTimeoutMs;

    /**
     * El bucle de rechazo. `veredictoADecision` es el ÚNICO juez —duplicar su regla
     * dentro del panel para «avisar antes» sería la familia D2—, así que cuando
     * rechaza, el panel se reabre con el motivo delante y el QA corrige sin salir.
     * Acotado por intentos Y por el mismo reloj de la espera: un rechazo sistemático
     * no puede convertirse en un bucle infinito con un navegador abierto.
     */
    let rechazo: string | undefined;
    for (let intento = 0; intento < VERDICT_MAX_RECHAZOS; intento += 1) {
      const sub = await this.esperarVeredicto(flow, step, { esperado, diagnostico, candidatos, rechazo, deadline });
      if (!sub) {
        this.audit('skip', `veredicto sin respuesta en ${flow.flow}/${step.id}`, { phase: 'verdict', source: 'human' });
        return null;
      }
      const r = veredictoADecision(sub, ctx);
      if (!r.ok) {
        rechazo = r.motivo;
        console.error(`[dom-walker] veredicto no admitido: ${r.motivo.split('\n')[0]}`);
        /**
         * EL RECHAZO SE AUDITA. Antes solo se imprimía por consola, y eso dejó una
         * sesión de campo imposible de reconstruir: el QA dijo que había capturado
         * el texto y que el botón no cerraba, y en los artefactos no había NADA —
         * ni acta, ni audit-log— que dijera si llegó a pulsar y se le rechazó, o si
         * nunca pulsó. Tuve que adivinar, en un producto cuyo argumento entero es
         * que las decisiones del QA dejan rastro.
         *
         * Un gesto rechazado ES un gesto: no cambia el plan, pero cuenta cuántas
         * veces el panel devolvió el trabajo, que es la medida de si la pregunta
         * está bien hecha.
         */
        this.audit('skip', `veredicto no admitido en ${flow.flow}/${step.id}: ${r.motivo.split(':')[0]}`, {
          phase: 'verdict',
          source: 'human',
          intento: intento + 1,
          veredicto: sub.verdict,
          con_literal: Boolean(sub.value),
        });
        continue;
      }

      /**
       * Firmar y ANCLAR, en ese orden y sin nada en medio. El ancla en el audit-log
       * es lo único que caza la cola truncada del acta (ver `decisions-audit.ts`).
       * Si la firma falla, el paso queda bloqueado como siempre y se dice por qué:
       * lo que no puede pasar es que el QA crea que decidió y no haya decisión.
       */
      try {
        const previa = effectiveDecisions(
          existsSync(this.actaPath) ? parseDecisions(readFileSync(this.actaPath, 'utf8')).entries : [],
        ).get(claveDecision(ctx.rf, `${ctx.flow}/${ctx.step}`));
        const { entry } = appendDecision(
          { ...r.input, ...(previa ? { supersedes: previa.hash } : {}) },
          this.actaPath,
        );
        anclarDecisionEnAudit(entry, this.script.site_id, this.auditPath, { origen: 'panel-veredicto' });
        await this.verdictTell(`Decisión firmada: ${entry.decision} (${entry.evidencia}). El paso queda como hallazgo.`, true);
        console.error(`[dom-walker] veredicto '${entry.decision}' firmado en ${this.actaPath} (${entry.hash})`);
        this.audit('allow', `veredicto '${entry.decision}' firmado en ${flow.flow}/${step.id}`, {
          phase: 'verdict',
          source: 'human',
          hash: entry.hash,
          ...(entry.valor_nuevo !== undefined ? { valor_nuevo: entry.valor_nuevo } : {}),
        });
        return motivoConVeredicto(motivoOriginal, r.nota, entry.hash);
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        await this.verdictTell(`No se pudo firmar: ${m.split('\n')[0]}`, false);
        console.error(`[dom-walker] la firma del veredicto FALLÓ, el paso queda bloqueado: ${m}`);
        this.audit('block', `firma del veredicto fallida en ${flow.flow}/${step.id}: ${m.split('\n')[0]}`, {
          phase: 'verdict',
        });
        return null;
      }
    }

    await this.verdictTell('No se registró ninguna decisión. El paso queda bloqueado.', false);
    this.audit('skip', `veredicto descartado tras ${VERDICT_MAX_RECHAZOS} intentos en ${flow.flow}/${step.id}`, {
      phase: 'verdict',
      source: 'human',
    });
    return null;
  }

  /** Habla con el panel de veredicto (que se cierra solo tras enseñar el mensaje). */
  private async verdictTell(message: string, ok: boolean): Promise<void> {
    // D64: si el veredicto quedó firmado, el run continúa YA y el panel aún vive
    // ~1,4 s enseñando el resultado — que no pueda interceptar el paso siguiente.
    if (ok) await this.panelDejaDeInterceptar();
    await this.page
      .evaluate(
        ([m, o]) =>
          (window as unknown as { __qaVerdictResult?: (a: string, b: boolean) => void }).__qaVerdictResult?.(
            m as string,
            o as boolean,
          ),
        [message, ok] as const,
      )
      .catch(() => {});
  }

  /**
   * D64 — el panel CRECE al grabar (fila de secuencia + estado) y puede acabar
   * TAPANDO el objetivo. Medido en OrangeHRM con sonda: Search vive en y≈406, el
   * panel compacto no llega (por eso el clic del QA al grabar SÍ funciona) y el
   * panel crecido sí — el trial-click de la verificación y la acción real morían
   * por timeout, interceptadas, un segundo después del gesto bueno. En cuanto la
   * entrega del QA está en manos del walker, el panel deja de ser superficie de
   * entrada: transparente al hit-test, visible para que se lea el resultado.
   */
  private async panelDejaDeInterceptar(): Promise<void> {
    await this.page
      .evaluate((attr) => {
        document.querySelectorAll(`[${attr}]`).forEach((h) => {
          (h as HTMLElement).style.pointerEvents = 'none';
        });
      }, ASSIST_HOST_ATTR)
      .catch(() => {
        // la página pudo navegar y llevarse el panel; no hay nada que apartar
      });
  }

  /**
   * D65 — este motivo decía «el parche se verificó… ES válido» sin mirar
   * `verified`: en campo (2026-08-29) un parche SIN VERIFICAR salió anunciado
   * como verificado, dos frases y las dos falsas. Se construye del estado real,
   * y en un solo sitio para que los dos disparadores no deriven (familia D2).
   */
  private motivoParcheInalcanzable(flow: WalkFlow, step: WalkStep, reason: string): string {
    const entry = this.assistPatch.entries.find((e) => e.flow === flow.flow && e.replaces_step === step.id);
    return entry?.verified === true
      ? `el parche se verificó pero no se pudo actuar sobre la pantalla actual: ${reason}. ` +
          `El parche ES válido y está en assist-patch.json — fúndelo en el guion y relanza.`
      : `el parche quedó SIN VERIFICAR y tampoco se pudo actuar sobre la pantalla actual: ${reason}. ` +
          `El parche está en assist-patch.json — fundirlo pide revisión y se firmará sin-verificar.`;
  }

  private async assistTell(message: string, ok: boolean): Promise<void> {
    await this.page
      .evaluate(([m, o]) => (window as unknown as { __qaAssistResult?: (a: string, b: boolean) => void }).__qaAssistResult?.(m as string, o as boolean), [message, ok] as const)
      .catch(() => {});
  }

  /**
   * Delta-debugging acotado del parche: intenta quitar cada abridor y re-verifica.
   * Se queda con el conjunto mínimo que sigue reproduciendo. Cap de replays porque
   * cada uno re-ejecuta el flujo entero desde entry.
   */
  private async minimizeAssistSteps(
    flow: WalkFlow,
    failed: WalkStep,
    steps: AssistPatchStep[],
  ): Promise<{ steps: AssistPatchStep[]; dropped: number }> {
    const MAX_REPLAYS = 6;
    let best = steps;
    let replays = 0;
    let i = 0;
    while (i < best.length && replays < MAX_REPLAYS) {
      if (best[i].role !== 'opener') { i += 1; continue; }
      const trial = best.filter((_, k) => k !== i);
      replays += 1;
      const v = await this.verifyAssistPatch(flow, failed, trial);
      if (v.ok) best = trial; // sobraba: no avanzamos i, el siguiente ocupa su sitio
      else i += 1;
    }
    if (replays >= MAX_REPLAYS) {
      console.error(`[dom-walker] minimización cortada en ${MAX_REPLAYS} replays (cap); el parche puede tener pasos de más`);
    }
    return { steps: best, dropped: steps.length - best.length };
  }

  /**
   * Verificación por replay en contexto FRESCO: re-ejecuta el flujo desde entry
   * con el parche aplicado y comprueba que el objetivo es realmente accionable.
   * Sin esto, un parche que "funcionó porque el QA tenía el menú abierto" se
   * propondría como bueno y fallaría en el siguiente run automático.
   */
  /**
   * K0.25/D2 — ¿el camino previo al paso contiene acciones de NEGOCIO? (click/
   * check/uncheck sin retry_safe). Si sí, el replay en limpio las re-ejecutaría —
   * en onesait, verificar un parche tras Finalizar re-crearía la declaración.
   */
  private hasMutatingPrior(flow: WalkFlow, failed: WalkStep): boolean {
    const MUTATING = new Set<WalkStep['action']>(['click', 'check', 'uncheck']);
    for (const s of flow.steps) {
      if (s.id === failed.id) break;
      if (MUTATING.has(s.action) && !isRetrySafe(s)) return true;
    }
    return false;
  }

  private async verifyAssistPatch(
    flow: WalkFlow,
    failed: WalkStep,
    steps: AssistPatchStep[],
  ): Promise<{ ok: boolean; reason?: string }> {
    /**
     * K0.25/D2 — replay-si-no-muta. Con negocio en el camino previo NO hay replay
     * en limpio: la verificación degrada a EN VIVO — el objetivo (y las
     * comprobaciones) se resuelven contra la página actual, donde el QA acaba de
     * señalarlos; los abridores no se tocan (ya los ejecutó él). Garantía más
     * débil que "reproduce desde cero", y se dice: el motivo viaja al parche como
     * verify_reason. Nunca se re-ejecuta negocio para verificar.
     */
    if (this.hasMutatingPrior(flow, failed)) {
      try {
        for (const [i, ps] of steps.entries()) {
          if (ps.role === 'opener') continue;
          if (ps.action === 'expect_text') {
            const found = ps.value ? await this.findVisibleText(ps.value) : null;
            if (!found) return { ok: false, reason: `la comprobación propuesta ("${ps.value}") no se observa en la página actual` };
            continue;
          }
          const loc = ps.locator ? this.locatorFromChain(this.page, ps.locator) : null;
          let unique = loc ? await this.uniqueOrNull(loc) : null;
          if (!unique) {
            const probe: WalkStep = { id: `${failed.id}-assist${i}`, action: ps.action, hint: ps.hint };
            const byHint = await this.resolveHint(probe);
            unique = byHint?.locator ?? null;
          }
          if (!unique) return { ok: false, reason: `el paso propuesto ${i + 1} (${ps.action}) no resuelve en la página actual (verificación en vivo)` };
          if (ps.role === 'target') await assertActionable(unique, ps.action);
        }
        return {
          ok: true,
          reason:
            'verificado SOLO EN VIVO: el camino previo contiene pasos de negocio y el replay en limpio los re-ejecutaría — nunca se re-ejecuta negocio para verificar',
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
        return { ok: false, reason: `verificación en vivo falló: ${msg}` };
      }
    }

    const browser = this.page.context().browser();
    if (!browser) return { ok: false, reason: 'sin navegador para el replay de verificación' };
    const ctx = await browser.newContext({
      ...(this.opts.storageState && existsSync(this.opts.storageState)
        ? { storageState: this.opts.storageState }
        : {}),
      // D48 — el replay tiene que hablar el MISMO idioma que el run, o verificaria
      // el parche contra una pagina traducida y concluiria que no resuelve.
      ...(this.locale ? { locale: this.locale } : {}),
    });
    const page = await ctx.newPage();
    const mainPage = this.page;
    try {
      this.page = page; // executeStep opera sobre this.page
      this.verifying = true; // K0.25: replay mudo — sin panel, sin rescate, sin tocar estado
      await page.goto(this.resolveTarget(this.script.entry), { timeout: GOTO_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
      // pasos previos al fallido, tal cual estaban en el guion
      for (const s of flow.steps) {
        if (s.id === failed.id) break;
        /**
         * K0.25 — un paso previo BLOQUEADO no se salta: saltarlo deja el replay en
         * la pantalla equivocada y la cascada culpa a pasos inocentes (el rodaje:
         * s7 bloqueado era LA navegación al carrito; saltarlo dejó el replay en el
         * inventario y s9 "no resolvía"). Sin camino previo íntegro no hay replay
         * fiable: se reporta honesto y el parche queda capturado SIN verificar.
         */
        if (this.state.open_questions.some((q) => q.flow === flow.flow && q.step === s.id)) {
          return {
            ok: false,
            reason: `no reproducible en limpio: el paso previo ${s.id} está bloqueado — el parche queda capturado sin verificar; fúndelo con revisión`,
          };
        }
        await this.executeStep(flow, s);
      }
      // y ahora los pasos propuestos por la asistencia
      for (const [i, ps] of steps.entries()) {
        if (ps.action === 'expect_text') {
          const found = ps.value ? await this.findVisibleText(ps.value) : null;
          if (!found) return { ok: false, reason: `la comprobación propuesta ("${ps.value}") no se observa en limpio` };
          continue;
        }
        // el locator del parche es autoritativo (puede ser scoped/anchored/indexed:
        // el hint solo no lo reproduce); el hint queda como fallback
        let loc = ps.locator ? this.locatorFromChain(page, ps.locator) : null;
        let unique = loc ? await this.uniqueOrNull(loc) : null;
        if (!unique) {
          const probe: WalkStep = { id: `${failed.id}-assist${i}`, action: ps.action, hint: ps.hint };
          const byHint = await this.resolveHint(probe);
          unique = byHint?.locator ?? null;
        }
        if (!unique) return { ok: false, reason: `el paso propuesto ${i + 1} (${ps.action}) no resuelve en un contexto limpio` };
        /**
         * K0.14 — el OBJETIVO nunca se ejecuta al verificar. La verificación solo
         * necesita saber que es accionable, y ejecutarlo costaba una operación de
         * negocio real por replay: capturar el locator de un "Finalizar" disparaba
         * la acción 4 veces (clic del QA + verificación + minimización + ejecución
         * real), y hasta 9 con un camino de varios abridores.
         *
         * Los ABRIDORES sí se ejecutan: sin ellos el objetivo no existe. Ese es el
         * residuo que ningún mecanismo elimina — si el camino muta negocio, cada
         * replay lo muta. Con --no-minimize se limita a uno.
         */
        if (ps.role === 'target') await assertActionable(unique, ps.action);
        else if (ps.action === 'hover') await unique.hover({ timeout: STEP_TIMEOUT_MS });
        else await unique.click({ timeout: STEP_TIMEOUT_MS });
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      return { ok: false, reason: `replay falló: ${msg}` };
    } finally {
      this.verifying = false;
      this.page = mainPage;
      await ctx.close().catch(() => {});
    }
  }

  private writeAssistPatch(): void {
    if (this.assistPatch.entries.length === 0) return;
    const out = { ...this.assistPatch, generated_at: new Date().toISOString() };
    writeFileSync(resolve(this.opts.workDir, 'assist-patch.json'), JSON.stringify(out, null, 2), 'utf8');
  }

  // ------------------------------------------------------------ rescate LLM

  private async requestRescue(flow: WalkFlow, step: WalkStep): Promise<never> {
    /**
     * K0.29 — el snapshot NO se traga su error. `catch(() => '')` convertía un
     * fallo diagnosticable en una petición de rescate MUDA: medido en la gira
     * (BootsFaces), tres peticiones seguidas con `aria_snapshot: ""` porque el
     * manejador de estorbos colgaba toda espera de accionabilidad. Un rescate a
     * ciegas solo puede responder `null` honesto o inventarse el locator, y lo
     * segundo es justo lo que el protocolo prohíbe: si el walker se queda sin
     * evidencia, tiene que DECIRLO, en el archivo y en el audit.
     */
    const snap = await this.page
      .locator('body')
      .ariaSnapshot({ timeout: STEP_TIMEOUT_MS })
      .then((text) => ({ text, error: '' }))
      .catch((e: unknown) => ({ text: '', error: (e instanceof Error ? e.message : String(e)).split('\n')[0] }));
    // El vocabulario del paso enfoca la poda (K0.29). El `value` entra solo si no
    // es secreto: un rescate no es sitio para volcar una contraseña.
    const focus = [
      step.hint?.test_id,
      step.hint?.role,
      step.hint?.name,
      step.hint?.label,
      step.hint?.text,
      // D68 — el vocabulario del SCOPE también enfoca la poda: sin él, el snapshot
      // podado puede perder justo las líneas del contenedor que desambiguan.
      step.scope?.test_id,
      step.scope?.role,
      step.scope?.name,
      step.scope?.label,
      step.scope?.text,
      step.secret ? undefined : step.value,
    ]
      .filter(Boolean)
      .join(' ');
    const pruned = pruneAriaSnapshot(snap.text, 120, focus);
    const snapshotError = snap.error || (pruned.length === 0 ? 'el snapshot podado quedó vacío' : '');
    if (snapshotError) {
      this.audit('block', `rescate SIN evidencia en ${flow.flow}/${step.id}: ${snapshotError}`, {
        phase: 'rescue-request',
        snapshot_error: snapshotError,
      });
    }
    const req: RescueRequest = {
      version: 1,
      site_id: this.script.site_id,
      flow: flow.flow,
      step: step.id,
      action: step.action,
      hint: step.hint,
      // D68 — el scope ES la información que desambigua: sin él, el subagente
      // recibía «Book now» y veía cuatro; declinar era su única respuesta legal.
      ...(step.scope ? { scope: step.scope } : {}),
      aria_snapshot: pruned,
      ...(snapshotError ? { snapshot_error: snapshotError } : {}),
      frame_path: [],
      budget_remaining: this.opts.rescueBudget - this.state.rescues_used,
      instructions: rescueInstructions(step.id, step.action, snapshotError, step.scope),
    };
    writeFileSync(resolve(this.opts.workDir, 'rescue-request.json'), JSON.stringify(req, null, 2), 'utf8');
    await this.persist();
    this.audit('llm_call', `rescate solicitado: ${flow.flow}/${step.id} (${step.action})`, {
      phase: 'rescue-request',
      budget_remaining: req.budget_remaining,
    });
    console.error(
      `[dom-walker] RESCATE PENDIENTE ${flow.flow}/${step.id}: hint irresoluble. ` +
        `Escrito rescue-request.json; delega la micro-llamada y re-ejecuta para reanudar.`,
    );
    process.exit(EXIT_RESCUE_NEEDED);
  }

  private consumeRescueResponse(step: WalkStep): RescueResponse | null {
    const path = resolve(this.opts.workDir, 'rescue-response.json');
    if (!existsSync(path)) return null;
    let res: RescueResponse;
    try {
      res = parseJsonLoose<RescueResponse>(readFileSync(path, 'utf8'));
    } catch (err) {
      // JSON corrupto del subagent: se descarta con diagnóstico explícito. Sin este
      // catch la excepción escapaba a run() y el paso quedaba con un
      // "fallo de ejecución: Unexpected token" que no dice nada del origen real.
      rmSync(path, { force: true });
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      this.audit('block', `rescue-response.json ilegible (${msg}) — descartado`, { phase: 'rescue-response' });
      return null;
    }
    if (res.step !== step.id) {
      rmSync(path); // respuesta de otro paso = basura; no debe bloquear rescates futuros
      return null;
    }
    rmSync(path);
    rmSync(resolve(this.opts.workDir, 'rescue-request.json'), { force: true });
    this.state.rescues_used += 1;
    return res;
  }

  // ---------------------------------------------------------------- captura

  private async captureScreen(flow: WalkFlow, step: WalkStep): Promise<void> {
    if (this.verifying) return; // K0.25: cinturón — el replay no captura pantallas
    // K0.35 — sin el testigo de sesión: lo que se anota tiene que poder compararse
    // entre runs. La navegación sigue usando la URL real.
    const url = urlEstable(this.page.url());
    const name = step.screen ?? slugFromUrl(url);
    if (this.state.current_screen === name) return; // misma pantalla, sin recaptura

    const rawByFrame: Array<{ raw: RawElement[]; path: string[] }> = [];
    for (const f of this.page.frames()) {
      const path = f === this.page.mainFrame() ? [] : await framePath(f);
      const raw = (await f
        .evaluate(captureScript(TESTID_ATTR_CANDIDATES, this.cssFallbackAttrs))
        .catch(() => [])) as RawElement[];
      rawByFrame.push({ raw, path });
    }

    // autodetección del atributo test-id (primera captura, si no vino por CLI)
    if (!this.testidAttr) {
      const freq = new Map<string, number>();
      for (const { raw } of rawByFrame)
        for (const el of raw) if (el.test_attr) freq.set(el.test_attr, (freq.get(el.test_attr) ?? 0) + 1);
      this.testidAttr =
        TESTID_ATTR_CANDIDATES.find((a) => freq.get(a) === Math.max(...freq.values(), 0) && freq.has(a)) ??
        'data-testid';
    }

    const all: DomElement[] = [];
    const landmarks: DomElement[] = [];
    const business: DomElement[] = [];
    const dialogEls: DomElement[] = [];
    const dialogBusiness: DomElement[] = [];
    const formsAcc = new Map<string, DomForm>();
    for (const { raw, path } of rawByFrame) {
      for (const el of raw) {
        const dom: DomElement = {
          role: el.role,
          ...(el.name ? { name: el.name } : {}),
          ...(el.test_id ? { test_id: el.test_id } : {}),
          ...(el.label ? { label: el.label } : {}),
          ...(path.length ? { frame_path: path } : {}),
          ...(el.disabled ? { disabled: true } : {}),
          ...(el.css_attr ? { css_attr: el.css_attr } : {}),
          locator_candidates: [],
        };
        dom.locator_candidates = buildLocatorCandidates(dom, this.priority);
        // K0.3: texto de negocio y contenido de diálogo van a sus propios cubos
        if (el.business) {
          (el.inDialog ? dialogBusiness : business).push(dom);
          continue;
        }
        if (el.inDialog) {
          dialogEls.push(dom);
          continue;
        }
        if (el.landmark || isLandmarkRole(el.role)) {
          if (el.role !== 'form') landmarks.push(dom);
        } else {
          all.push(dom);
        }
        if (el.formIndex !== undefined && el.formIndex >= 0 && !el.landmark) {
          const key = `${path.join('>')}#${el.formIndex}`;
          if (!formsAcc.has(key))
            formsAcc.set(key, { name: `form${el.formIndex}`, ...(path.length ? { frame_path: path } : {}), fields: [] });
          const form = formsAcc.get(key)!;
          if (el.role === 'button' && !form.submit) form.submit = dom;
          else if (el.role !== 'button') form.fields.push(dom);
        }
      }
    }

    const { elements, truncated } = dedupeAndPrune(all, this.opts.screenCap);
    const { elements: prunedLandmarks } = dedupeAndPrune(landmarks, 15);
    const { elements: prunedBusiness } = dedupeAndPrune(business, 10);

    const screen: DomScreen = {
      name,
      url_pattern: url,
      flow: flow.flow,
      elements,
      forms: [...formsAcc.values()],
      landmarks: prunedLandmarks,
      ...(prunedBusiness.length ? { business_text: prunedBusiness } : {}),
      ...(truncated > 0 ? { truncated } : {}),
      ...(this.lastDialogs.length ? { dialogs: [...this.lastDialogs] } : {}),
    };
    this.lastDialogs = [];

    this.upsertScreen(screen);

    // K0.3: diálogo abierto = sub-pantalla propia — locators scoped, sin mezclar con el fondo
    if (dialogEls.length || dialogBusiness.length) {
      const { elements: dEls } = dedupeAndPrune(dialogEls, this.opts.screenCap);
      const { elements: dBiz } = dedupeAndPrune(dialogBusiness, 10);
      this.upsertScreen({
        name: `${name}-dialog`,
        url_pattern: url,
        flow: flow.flow,
        elements: dEls,
        forms: [],
        landmarks: [],
        ...(dBiz.length ? { business_text: dBiz } : {}),
      });
    }

    this.state.current_screen = name;
  }

  private upsertScreen(screen: DomScreen): void {
    const existing = this.state.screens.findIndex((s) => s.name === screen.name);
    if (existing >= 0) this.state.screens[existing] = screen;
    else this.state.screens.push(screen);
  }

  private recordTransition(flow: WalkFlow, step: WalkStep, via: string, from: string | null): void {
    if (this.verifying) return; // K0.25: cinturón — el replay no registra transiciones
    const to = step.screen ?? slugFromUrl(this.page.url());
    const exists = this.state.transitions.some((t) => t.flow === flow.flow && t.step === step.id);
    if (from && from !== to && !exists) {
      this.state.transitions.push({ from, to, flow: flow.flow, step: step.id, via });
    }
  }

  // ------------------------------------------------------------- ejecución

  /**
   * K0.17 — `goto` con reintento y backoff. El SPEC §8 lo declaraba desde el
   * principio y NO estaba implementado: un `goto` fallido lanzaba y, como el paso
   * `__entry` se ejecuta fuera del try/catch del bucle, tumbaba el run entero con
   * exit 1 y sin dejar dom-map. Encontrado en OrangeHRM al segundo run seguido
   * (`page.goto: Timeout 30000ms exceeded`); en un PRE corporativo eso es rutina.
   */
  private async gotoWithRetry(url: string): Promise<void> {
    const INTENTOS = 3; // el declarado en el SPEC: inicial + 2 reintentos
    const BACKOFF_MS = [1_000, 3_000];
    let ultimo: unknown = null;
    for (let i = 0; i < INTENTOS; i += 1) {
      try {
        await this.page.goto(url, { timeout: GOTO_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
        /**
         * K0.30 — el barrido de consentimiento va PEGADO a la navegación, no solo
         * colgado del manejador de accionabilidad: la captura de pantalla del
         * dom-map no ejecuta ninguna acción, así que sin esto el banner entraría
         * en el mapa como si fuera contenido de la aplicación.
         */
        await this.dismissConsent();
        if (i > 0) {
          this.audit('allow', `goto recuperado al intento ${i + 1}: ${url}`, { phase: 'goto-retry', attempt: i + 1 });
          console.error(`[dom-walker] goto recuperado al intento ${i + 1} de ${INTENTOS}`);
        }
        return;
      } catch (err) {
        ultimo = err;
        const m = err instanceof Error ? err.message.split('\n')[0] : String(err);
        if (i < INTENTOS - 1) {
          const espera = BACKOFF_MS[i];
          console.error(`[dom-walker] goto falló (${m}); reintento ${i + 2}/${INTENTOS} en ${espera} ms`);
          await this.page.waitForTimeout(espera);
        }
      }
    }
    this.audit('block', `goto agotó ${INTENTOS} intentos: ${url}`, { phase: 'goto-retry' });
    throw ultimo;
  }

  private async executeStep(flow: WalkFlow, step: WalkStep): Promise<void> {
    const stepKey = `${flow.flow}/${step.id}`;
    this.currentStepKey = stepKey;
    const fixtures = this.contract.synthetic_fixtures ?? {};

    if (step.dialog) {
      this.page.once('dialog', async (d) => {
        this.lastDialogs.push(`${d.type()}: ${d.message()}`);
        if (step.dialog === 'accept') await d.accept().catch(() => {});
        else await d.dismiss().catch(() => {});
      });
    }

    const settle = this.settleProfileFor(flow, step);
    const startedAt = Date.now();

    switch (step.action) {
      case 'goto': {
        await this.gotoWithRetry(this.resolveTarget(step.target!));
        /**
         * SIN `waitForLoadState('networkidle')` a propósito. La ventana de quietud lo
         * sustituye —networkidle no llega nunca en una app con polling, y cuando llega
         * es antes del segundo ciclo de spinner— pero además ESPERARLO HACÍA DAÑO: el
         * observador arrancaba medio segundo tarde y se perdía el primer ciclo de la
         * carga. Todo lo que ocurre antes de empezar a mirar es invisible, y si el
         * observador entra dentro del hueco entre ciclos puede cerrar la ventana ahí.
         * Observar lo antes posible es parte de la garantía, no una optimización.
         */
        const obs = await this.waitForSettle(settle);
        this.state.current_screen = null;
        await this.captureScreen(flow, step);
        this.pushReport(flow, step, {
          outcome: obs.timed_out ? 'settle_timeout' : 'ok',
          action_ms: Date.now() - startedAt,
          settle: obs,
          retried: false,
        });
        return;
      }
      case 'capture': {
        // capturar una pantalla a medio pintar produce un dom-map con elementos
        // que no existen media pantalla después: se estabiliza primero.
        const obs = await this.waitForSettle(settle);
        this.state.current_screen = null;
        await this.captureScreen(flow, step);
        this.pushReport(flow, step, {
          outcome: obs.timed_out ? 'settle_timeout' : 'ok',
          action_ms: Date.now() - startedAt,
          settle: obs,
          retried: false,
        });
        return;
      }
      case 'press': {
        await this.page.keyboard.press(step.value!);
        // el Tab de onesait dispara la consulta de la póliza: aquí es donde el
        // spinner múltiple hace más daño, porque el paso siguiente asserta el resultado.
        const obs = await this.waitForSettle(settle);
        this.pushReport(flow, step, {
          outcome: obs.timed_out ? 'settle_timeout' : 'ok',
          action_ms: Date.now() - startedAt,
          settle: obs,
          retried: false,
        });
        break;
      }
      case 'wait_url': {
        await this.page.waitForURL((u) => u.toString().includes(step.target!), { timeout: STEP_TIMEOUT_MS });
        break;
      }
      case 'wait_text': {
        await this.page.getByText(step.value!).first().waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
        break;
      }
      case 'expect_text': {
        // K0.2: postcondición del FD. Fallo = DRIFT (hallazgo), no problema de locator → sin rescate.
        // K0.13: se estabiliza ANTES de juzgar. Declarar drift sobre una pantalla a
        // medio pintar es la forma más rápida de mentir en el informe.
        const obs = await this.waitForSettle(settle);
        const value = resolveFixtureRef(step.value!, fixtures);
        /**
         * K0.30 (F4) — el ÁMBITO de la aserción. `expect_text` es una búsqueda en
         * TODA la página, y eso se cobró un verde falso en la gira (§20): el texto
         * esperado ya estaba visible en el bloque de código con que la propia web
         * documentaba su ejemplo, así que la postcondición se habría cumplido
         * aunque la acción no hubiera hecho nada. Con `scope` —el mismo campo que
         * el refiner ya emite desde el FD ("en el panel Resumen, aparece…")— el
         * texto tiene que estar DONDE dice el negocio. Sin `scope`, comportamiento
         * de siempre; el ámbito no se inventa.
         */
        let containers: Array<{ scope: Page | Frame | Locator; path: string[]; via?: string }> | undefined;
        if (step.scope) {
          containers = await this.resolveScope(step.scope, await this.scopes());
          if (containers.length === 0) {
            // distinción que importa: el ámbito irresoluble NO es drift del texto.
            // Decir "el texto no aparece" cuando no se encontró dónde mirar sería
            // culpar al negocio de un problema del locator.
            this.blockStep(flow, step, `ámbito de la postcondición irresoluble: no se encontró el contenedor declarado`, false);
            this.audit('block', `expect_text sin ámbito ${stepKey}`, { phase: 'expect', settle: obs });
            this.pushReport(flow, step, { outcome: 'postcondition_unmet', action_ms: Date.now() - startedAt, settle: obs, retried: false });
            return;
          }
        }
        const found = await this.findVisibleText(value, STEP_TIMEOUT_MS, containers);
        const report = { action_ms: Date.now() - startedAt, settle: obs, retried: false };
        if (!found) {
          const suffix = obs.timed_out
            ? ` (la pantalla NO se estabilizó en ${settle.timeout_ms} ms, ${obs.busy_cycles} ciclos de ocupado: el hallazgo puede ser de sincronización)`
            : '';
          // K0.35 — y si la pantalla es un volcado de excepción, decirlo: "el
          // negocio no ocurrió" y "la aplicación se cayó" no son el mismo hallazgo.
          const error = await this.notaPaginaError();
          // D71 — ¿el texto NO está, o está y no se ve? Son dos hallazgos distintos
          // y solo uno es del negocio. Contarlo cuesta una llamada al DOM.
          const ocultos = await this.page
            .getByText(value)
            .count()
            .then(async (n) => {
              let escondidos = 0;
              for (let i = 0; i < Math.min(n, 5); i++) {
                if (!(await this.page.getByText(value).nth(i).isVisible().catch(() => true))) escondidos++;
              }
              return escondidos;
            })
            .catch(() => 0);
          const oculto = notaTextoOculto({ nodosOcultos: ocultos, viewport: this.opts.viewport ?? null });
          const motivo = `drift: postcondición del FD no observada — texto '${value}' no visible${suffix}${error}${oculto}`;
          /**
           * FASE B — aquí moría el único drift que no podía llegar al acta. El
           * veredicto se pide ANTES de bloquear, con la pantalla delante, y lo que
           * devuelve es el mismo motivo AMPLIADO: el mensaje de siempre sigue entero
           * (dos tests de K0.35 lo fijan) y el veredicto va detrás. Sin `--assist`, o
           * sin con qué firmar, esto devuelve null y todo queda como estaba.
           */
          const conVeredicto = await this.veredictoSobrePostcondicion(flow, step, motivo, value);
          this.blockStep(flow, step, conVeredicto ?? motivo, false);
          this.audit('block', `expect_text fallido ${stepKey}: '${value}'`, { phase: 'expect', settle: obs });
          this.pushReport(flow, step, { ...report, outcome: 'postcondition_unmet' });
          return;
        }
        /**
         * K0.37 — LA EVIDENCIA DICE LO QUE HABÍA, NO LO QUE SE BUSCÓ. Medido en
         * campo (OrangeHRM, comparativa walker vs LLM): el criterio del FD pedía
         * "Records Found", la pantalla decía "(0) No Records Found" — el literal
         * aparecía, el filtro no había encontrado nada, y el caso salía VERDE. El
         * `business_text` registraba el texto BUSCADO, así que el artefacto de
         * evidencia escondía justo el dato que delataba el problema.
         *
         * El veredicto NO cambia: decidir que "No X" niega a "X" es específico del
         * idioma y sería adivinar (en español "0 resultados encontrados" contiene
         * "resultados encontrados", y "No hay movimientos" no niega a "movimientos"
         * de la misma forma). Se cita lo medido y se deja juzgar a quien puede.
         */
        const parcial = found.matched_text !== '' && found.matched_text !== value;
        this.recordBusinessText(value, found.via, found.frame_path, parcial ? found.matched_text : undefined);
        if (parcial) {
          this.audit('allow', `expect_text por coincidencia PARCIAL en ${stepKey}: '${value}' dentro de '${found.matched_text}'`, {
            phase: 'expect',
          });
        }
        // K0.30 — y DÓNDE se cumplió viaja al informe: una aserción que pasa sin
        // decir dónde pasó es la que esconde los verdes falsos (§20).
        this.pushReport(flow, step, {
          ...report,
          outcome: obs.timed_out ? 'settle_timeout' : 'ok',
          resolved_via: found.via,
          ...(parcial ? { matched_text: found.matched_text, value_searched: value } : {}),
        });
        return;
      }
      case 'expect_value': {
        /**
         * K0.30 (F5) — el resultado que vive en el `value` de un control. En JSF/
         * ADF/UI5 corporativo el importe calculado, el número de expediente o la
         * prima aterrizan en un campo deshabilitado; `expect_text` no los ve.
         * Mismo criterio de comparación que el resto de la escalera: exacto
         * primero, normalizado (acentos/caja/espacios) después y AUDITADO, nunca
         * "parecido". Fallo = drift del FD, no problema de locator → sin rescate.
         */
        const obs = await this.waitForSettle(settle);
        const want = resolveFixtureRef(step.value!, fixtures);
        const report = { action_ms: Date.now() - startedAt, settle: obs, retried: false };
        const resolved = await this.resolveHint(step);
        if (!resolved) {
          this.blockStep(flow, step, `drift: campo de la postcondición no resuelto en el DOM`, false);
          this.audit('block', `expect_value fallido ${stepKey}: hint irresoluble`, { phase: 'expect-value', settle: obs });
          this.pushReport(flow, step, { ...report, outcome: 'postcondition_unmet' });
          return;
        }
        const actual = await this.readValue(resolved.locator);
        if (actual === null) {
          // el elemento resuelto no tiene valor que leer: decirlo tal cual, no
          // convertirlo en "el valor no coincide" (sería culpar al negocio).
          this.blockStep(flow, step, `el elemento resuelto (${resolved.via}) no es un control con valor legible`, false);
          this.audit('block', `expect_value sin valor ${stepKey}: ${resolved.via}`, { phase: 'expect-value', settle: obs });
          this.pushReport(flow, step, { ...report, outcome: 'postcondition_unmet', resolved_via: resolved.via });
          return;
        }
        let ok = actual === want;
        if (!ok && normalizeText(actual) === normalizeText(want)) {
          ok = true;
          this.audit('allow', `valor normalizado tolerado ${stepKey}: '${actual}' ≈ '${want}'`, { phase: 'value-normalizado' });
        }
        if (!ok) {
          this.blockStep(
            flow,
            step,
            `drift: postcondición del FD no cumplida — ${resolved.via} vale '${actual}', el FD espera '${want}'`,
            false,
          );
          this.audit('block', `expect_value fallido ${stepKey}: '${actual}' != '${want}'`, { phase: 'expect-value', settle: obs });
        }
        this.pushReport(flow, step, {
          ...report,
          outcome: ok ? (obs.timed_out ? 'settle_timeout' : 'ok') : 'postcondition_unmet',
          resolved_via: resolved.via,
          // D46 — el locator EMISIBLE, cuando la notacion del peldano no es codigo.
          ...(resolved.emit ? { emit_locator: resolved.emit } : {}),
        });
        return;
      }
      case 'expect_state': {
        const obs = await this.waitForSettle(settle);
        const want = step.value!;
        const report = { action_ms: Date.now() - startedAt, settle: obs, retried: false };
        const resolved = await this.resolveHint(step); // aliases + escalera; sin rescate para expects
        if (!resolved) {
          this.blockStep(flow, step, `drift: elemento de la postcondición no resuelto en el DOM`, false);
          this.audit('block', `expect_state fallido ${stepKey}: hint irresoluble`, { phase: 'expect', settle: obs });
          this.pushReport(flow, step, { ...report, outcome: 'postcondition_unmet' });
          return;
        }
        const ok = await this.checkState(resolved.locator, want);
        if (!ok) {
          this.blockStep(flow, step, `drift: postcondición del FD no cumplida — ${resolved.via} no está '${want}'`, false);
          this.audit('block', `expect_state fallido ${stepKey}: ${resolved.via} != ${want}`, { phase: 'expect', settle: obs });
        }
        /**
         * D5 — el locator autoritativo VIAJA en el report, como en expect_value.
         * Sin él, un expect_state VERDE se caía del emisor («sin locator
         * autoritativo») y arrastraba su flujo entero a la cola del Writer: un
         * paso correcto costaba una pasada de planner (~130k tokens). El espejo
         * de expect_value, que lo hacía bien desde D46.
         */
        this.pushReport(flow, step, {
          ...report,
          outcome: ok ? (obs.timed_out ? 'settle_timeout' : 'ok') : 'postcondition_unmet',
          resolved_via: resolved.via,
          ...(resolved.emit ? { emit_locator: resolved.emit } : {}),
        });
        return;
      }
      case 'expect_count': {
        // Fase 6 — el hint apunta a la COLECCIÓN (filas, opciones), no a un
        // elemento singular. Se estabiliza primero: leer count() sobre una
        // tabla a medio cargar es el falso 0 contra el que avisa la spec.
        const obs = await this.waitForSettle(settle);
        const report = { action_ms: Date.now() - startedAt, settle: obs, retried: false };
        const operator = step.operator!;
        const threshold = Number(step.value!);
        const resolved = await this.resolveCollection(step);
        if ('fallo' in resolved) {
          const why =
            resolved.fallo === 'ambito'
              ? `el contenedor declarado de expect_count no está en pantalla: no hay dónde contar (distinto de "cuenta 0")`
              : `drift: colección de expect_count ambigua entre contenedores/frames`;
          this.blockStep(flow, step, why, false);
          this.audit('block', `expect_count sin colección (${resolved.fallo}) ${stepKey}`, { phase: 'expect-count', settle: obs });
          this.pushReport(flow, step, { ...report, outcome: 'postcondition_unmet' });
          return;
        }
        let count: number;
        if (operator === '=') {
          // toHaveCount es la aserción web-first: reintenta sola hasta el número
          // exacto, en vez de leer count() a ciegas contra una tabla que aún carga.
          try {
            await expect(resolved.locator).toHaveCount(threshold, { timeout: ORACLE_TIMEOUT_MS });
            count = threshold;
          } catch {
            count = await resolved.locator.count().catch(() => 0);
          }
        } else {
          // >, >=, < no tienen un número exacto que esperar con reintento: se
          // espera por VISIBILIDAD (la colección ya renderizó algo, o de verdad
          // no hay nada) y solo ENTONCES se lee count() — leerlo antes es el
          // falso 0 sobre una tabla que aún está cargando (§4 Fase 6).
          await resolved.locator.first().waitFor({ state: 'visible', timeout: ORACLE_TIMEOUT_MS }).catch(() => {});
          count = await resolved.locator.count().catch(() => 0);
        }
        // captura de tabla como datos: SOLO si hay al menos una fila de donde
        // subir al ancestro <table> — "no hay datos" ya lo dice el outcome.
        if (count > 0) await this.captureTable(resolved.locator, resolved.frame_path);
        const ok = compareCount(count, operator, threshold);
        if (!ok) {
          this.blockStep(
            flow,
            step,
            `incumplido: ${resolved.via} cuenta ${count}, se esperaba ${operator} ${threshold}`,
            false,
          );
          this.audit('block', `expect_count incumplido ${stepKey}: ${count} ${operator} ${threshold} = false`, {
            phase: 'expect-count',
            settle: obs,
          });
        }
        this.pushReport(flow, step, { ...report, outcome: ok ? (obs.timed_out ? 'settle_timeout' : 'ok') : 'postcondition_unmet' });
        return;
      }
      case 'expect_each': {
        // Fase 6 — el hint del paso apunta a los CONTENEDORES (p.ej. "cada
        // listbox"); `each` es la condición que se comprueba DENTRO de cada uno.
        const obs = await this.waitForSettle(settle);
        const report = { action_ms: Date.now() - startedAt, settle: obs, retried: false };
        const each = step.each!;
        const operator = each.operator;
        const threshold = Number(each.value);
        const outer = await this.resolveCollection(step);
        if ('fallo' in outer) {
          const why =
            outer.fallo === 'ambito'
              ? `el contenedor declarado de expect_each no está en pantalla: no hay dónde mirar`
              : `drift: contenedores de expect_each ambiguos entre frames`;
          this.blockStep(flow, step, why, false);
          this.audit('block', `expect_each sin contenedores (${outer.fallo}) ${stepKey}`, { phase: 'expect-each', settle: obs });
          this.pushReport(flow, step, { ...report, outcome: 'postcondition_unmet' });
          return;
        }
        const n = await outer.locator.count().catch(() => 0);
        const failures: string[] = [];
        for (let i = 0; i < n; i += 1) {
          const item = outer.locator.nth(i);
          await item.waitFor({ state: 'visible', timeout: ORACLE_TIMEOUT_MS }).catch(() => {});
          const subCount = await this.countMatches(item, each.hint);
          if (!compareCount(subCount, operator, threshold)) failures.push(`#${i} cuenta ${subCount}`);
        }
        const ok = n > 0 && failures.length === 0;
        if (!ok) {
          const why =
            n === 0
              ? `incumplido: ${outer.via} no resolvió ningún contenedor`
              : `incumplido: ${failures.length}/${n} contenedor(es) no cumplen ${operator} ${threshold} — ${failures.join(', ')}`;
          this.blockStep(flow, step, why, false);
          this.audit('block', `expect_each incumplido ${stepKey}: ${failures.length}/${n}`, { phase: 'expect-each', settle: obs });
        }
        this.pushReport(flow, step, { ...report, outcome: ok ? (obs.timed_out ? 'settle_timeout' : 'ok') : 'postcondition_unmet' });
        return;
      }
      case 'scroll_until': {
        // Fase 4 — listas virtualizadas (cdk-virtual-scroll): la fila objetivo
        // no existe en el DOM hasta hacer scroll. Bucle ACOTADO por max_steps
        // (regla dura del tradeoff: sin tope, un objetivo ausente cuelga el walk).
        const maxSteps = step.max_steps ?? DEFAULT_SCROLL_MAX_STEPS;
        const scopes = await this.scopes();
        const containers = await this.resolveScope(step.container!, scopes);
        if (containers.length !== 1) {
          const why = containers.length === 0 ? 'irresoluble' : 'ambiguo entre contenedores/frames';
          this.blockStep(flow, step, `drift: container de scroll_until ${why}`, false);
          this.audit('block', `scroll_until container ${why} ${stepKey}`, { phase: 'scroll-until' });
          this.pushReport(flow, step, { outcome: 'postcondition_unmet', action_ms: Date.now() - startedAt, retried: false });
          return;
        }
        // resolveScope solo empuja entradas cuya `scope` es el Locator único que
        // devolvió uniqueOrNull — nunca un Page/Frame crudo; el cast documenta esa
        // garantía de la propia función, no una suposición nueva aquí.
        const container = containers[0].scope as Locator;

        let outcome: StepOutcome = 'postcondition_unmet';
        let stepsUsed = 0;
        let stopReason = '';
        for (; stepsUsed < maxSteps; stepsUsed += 1) {
          const found = await this.resolveWithinContainer(container, step.hint!);
          if (found.status === 'found') {
            outcome = 'ok';
            break;
          }
          if (found.status === 'ambiguous') {
            stopReason = 'ambiguo: más de un elemento visible matchea el hint dentro del contenedor — no se adivina cuál es';
            break;
          }
          await this.scrollContainer(container);
          await this.waitForSettle(settle);
        }

        if (outcome === 'ok') {
          this.pushReport(flow, step, { outcome, action_ms: Date.now() - startedAt, retried: false });
          return;
        }
        // "no encontrado tras N scrolls" es AMBIGUO entre ausencia real y N
        // pequeño — se reporta como tal, nunca se afirma que el registro no existe.
        const why =
          stopReason ||
          `ambiguo: no encontrado tras ${stepsUsed} scroll(s) (tope ${maxSteps}) — no se afirma que el registro no exista`;
        this.blockStep(flow, step, `drift: ${why}`, false);
        this.audit('block', `scroll_until sin resolver ${stepKey}: ${why}`, { phase: 'scroll-until', steps: stepsUsed });
        this.pushReport(flow, step, { outcome, action_ms: Date.now() - startedAt, retried: false });
        return;
      }
      default: {
        // acciones con hint: fill/click/select/check/uncheck
        // rescate ya resuelto en un run anterior (replay tras reanudación): reutilizar sin gastar presupuesto
        const prior = this.state.rescues.find(
          (r) => r.flow === flow.flow && r.step === step.id && r.resolved && r.locator,
        );
        let resolved: { locator: Locator; via: string; frame_path: string[]; emit?: string } | null = null; // reasignable: la asistencia puede sustituirlo (K0.11d)
        if (prior?.locator) {
          const loc = this.locatorFromChain(this.page, prior.locator);
          if (loc && (await loc.count().catch(() => 0)) >= 1) {
            resolved = { locator: loc.first(), via: prior.locator, frame_path: [] };
          }
        }
        if (!resolved) resolved = await this.resolveHint(step);

        if (!resolved) {
          // ¿hay respuesta de rescate esperando para este paso? (nunca durante el
          // replay de verificación: consumirla ahí la robaría al run principal)
          const rescue = this.verifying ? null : this.consumeRescueResponse(step);
          if (rescue) {
            if (rescue.locator === null) {
              this.blockStep(flow, step, `rescate LLM respondió locator=null: ${rescue.reason ?? 'elemento no presente en el snapshot'}`, true);
              this.state.rescues.push({ flow: flow.flow, step: step.id, resolved: false, audit_logged: true, source: 'llm' });
              this.audit('block', `rescate fallido ${stepKey}: paso a open_questions`, { phase: 'rescue-response' });
              return;
            }
            // Anti-ECO (conducta medida en RBP, 3 de 13 respuestas): devolver el
            // locator que el hint ya expresa no aporta información — si hubiera
            // resuelto, no habría habido rescate. Se rechaza SIN ejecutar, con el
            // desenlace nombrando la conducta y no disfrazado de «locator inválido».
            if (esEcoDelHint(step.hint, rescue.locator)) {
              this.blockStep(flow, step, `rescate LLM devolvió el ECO del hint que ya falló (${rescue.locator}): rechazado sin ejecutar`, true);
              this.state.rescues.push({ flow: flow.flow, step: step.id, resolved: false, locator: rescue.locator, audit_logged: true, source: 'llm' });
              this.audit('block', `eco del hint en rescate ${stepKey}: rechazado`, { phase: 'rescue-response' });
              return;
            }
            const loc = this.locatorFromChain(this.page, rescue.locator);
            const count = loc ? await loc.count().catch(() => 0) : 0;
            if (loc && count >= 1) {
              resolved = { locator: count === 1 ? loc : loc.first(), via: rescue.locator, frame_path: [] };
              this.state.rescues.push({ flow: flow.flow, step: step.id, resolved: true, locator: rescue.locator, audit_logged: true, source: 'llm' });
              this.audit('allow', `rescate resuelto ${stepKey} → ${rescue.locator}`, { phase: 'rescue-response' });
            } else {
              this.blockStep(flow, step, `el locator del rescate no resuelve en el DOM: ${rescue.locator}`, true);
              this.state.rescues.push({ flow: flow.flow, step: step.id, resolved: false, locator: rescue.locator, audit_logged: true, source: 'llm' });
              this.audit('block', `locator de rescate inválido ${stepKey}`, { phase: 'rescue-response' });
              return;
            }
          }
        }

        if (!resolved) {
          if (step.optional) {
            this.blockStep(flow, step, 'hint irresoluble; paso marcado optional → anotado sin rescate', false);
            return;
          }
          // K0.25: en el replay de verificación no hay QA que consultar ni rescate
          // que pedir — un hint que no resuelve ahí es "no reproducible en limpio".
          if (this.verifying) {
            throw new Error(`hint irresoluble en ${step.id} durante el replay de verificación`);
          }
          // K0.10: peldaño asistido ANTES del rescate LLM. Con el QA delante, resolver
          // visualmente cuesta $0 y captura además la coreografía (hover de menús).
          if (this.opts.assist) {
            const assisted = await this.assistResolve(flow, step);
            if (!assisted) return; // drift, block, timeout o captura-sin-ejecutar: ya anotado
            /**
             * K0.15 — misma guarda que en el disparador por acción fallida. Sin ella,
             * un objetivo que dejó de ser alcanzable hacía fallar el `runAction` del
             * bucle de abajo, cuyo catch vuelve a llamar a la asistencia: el panel se
             * reabría para el MISMO paso y el QA lo grababa dos veces.
             */
            const reach = await this.ensureAssistedTargetReachable(flow, step, assisted);
            if (!reach.ok) {
              this.blockStep(flow, step, this.motivoParcheInalcanzable(flow, step, reach.reason ?? ''), false);
              this.audit('block', `objetivo asistido inalcanzable ${stepKey}: ${reach.reason}`, {
                phase: 'assist-postaction',
                matched: assisted.via,
              });
              this.pushReport(flow, step, { outcome: 'action_failed', action_ms: Date.now() - startedAt, retried: false });
              return;
            }
            /**
             * K0.47 — anti DOBLE DISPARO: `performed` = el QA señaló el objetivo con
             * un clic real durante la grabación, y ese clic propaga a la app (es la
             * misma física por la que demostrar un logout mataba el panel, D10). En
             * un paso no reintenable, volver a ejecutarla aquí crearía la segunda
             * declaración/transferencia/baja. El campo existía en el tipo desde
             * K0.14 y no lo consumía nadie — familia D2, tercera instancia de campo.
             */
            if (assisted.performed && !isRetrySafe(step)) {
              this.audit('allow', `acción ejecutada por el QA durante la grabación en ${stepKey}: no se re-dispara (paso no reintenable)`, {
                phase: 'assist-postaction',
                matched: assisted.via,
              });
              this.pushReport(flow, step, { outcome: 'ok', action_ms: Date.now() - startedAt, retried: false, resolved_via: assisted.via });
              return;
            }
            resolved = assisted;
          }
        }

        if (!resolved) {
          // K0.34 — ambiguo NO es irresoluble: son dos hallazgos con dos remedios
          // distintos, y hasta aquí llegaban con la misma frase.
          const causa = this.ultimaAmbiguedad ?? this.ultimoAmbitoFallido ?? 'hint irresoluble';
          // El DOM del paso que no resolvió es la materia prima del banco de
          // rescates: sin la foto solo se puede medir si el LLM responde algo, no
          // si responde LO CORRECTO, y esa es la única cifra que decide.
          await this.captureBlockedForRescue(flow, step, causa);
          /**
           * D68 (triaje) — el rescate LLM solo puede resolver UNA clase de
           * bloqueo (hint limpio, posible vocabulario no enseñado). Ambigüedad,
           * ámbito fallido y cascada se enrutan a su remedio sin gastar
           * micro-llamada. La clase la decide walk-core con su tabla.
           */
          const bloqueadosDelFlujo = new Set(
            this.state.open_questions.filter((q) => q.flow === flow.flow).map((q) => q.step),
          );
          const triaje = triajeDelBloqueo({
            ambiguo: Boolean(this.ultimaAmbiguedad),
            fueraDeAmbito: Boolean(this.ultimoAmbitoFallido),
            puertaBloqueada: puertaBloqueadaAntes(flow.steps, bloqueadosDelFlujo, step.id),
          });
          if (triaje.destino !== 'rescate') {
            this.blockStep(flow, step, `${causa} — ${triaje.motivo}`, false);
            this.audit('block', `triaje del bloqueo en ${stepKey}: ${triaje.destino}, sin gasto de rescate`, {
              phase: 'rescue-triage',
              destino: triaje.destino,
            });
            return;
          }
          if (this.state.rescues_used >= this.opts.rescueBudget) {
            // K0.35 — un hint ambiguo resolvió DE MÁS, así que la pantalla es la
            // que se esperaba; las notas de "aquí no hay aplicación" solo tienen
            // sentido cuando no resolvió nada.
            const nota =
              this.ultimaAmbiguedad || this.ultimoAmbitoFallido
                ? ''
                : (await this.emptyScreenNote()) + (await this.notaPaginaError());
            this.blockStep(flow, step, `${causa} y presupuesto de rescates agotado (${this.opts.rescueBudget})${nota}`, false);
            this.audit('block', `presupuesto de rescates agotado en ${stepKey}`, { budget: this.opts.rescueBudget });
            return;
          }
          return this.requestRescue(flow, step); // exit 42
        }

        // K0.32 — la foto se toma AQUÍ: resolución hecha, acción todavía sin
        // ejecutar. Ese es el DOM sobre el que el banco tiene que medir.
        await this.captureCorpusCandidate(flow, step, resolved);

        const from = this.state.current_screen;
        const preUrl = this.page.url();
        /**
         * K0.34 — MARCA DE DOCUMENTO. La transición no siempre se ve en la URL: en
         * JSF clásico (y en cualquier stack que navegue por POST) la página cambia
         * entera y la URL se queda EXACTAMENTE igual. Sellamos el documento actual
         * antes de actuar; si después la marca ya no está, es que el navegador
         * cargó un documento nuevo — que es la definición de haber transicionado.
         *
         * Se inyecta como CADENA, no como función: el `evaluate` con función se
         * rompe bajo `tsx` porque esbuild la envuelve con `__name`, que no existe
         * en la página (la trampa documentada en la Fase 6).
         */
        if (step.expect_transition) {
          await this.page.evaluate('window.__qaDocMark = 1').catch(() => {});
        }
        const value = step.value !== undefined ? resolveFixtureRef(step.value, fixtures) : undefined;

        const runAction = async (loc: Locator): Promise<void> => {
          switch (step.action) {
            case 'fill':
              await loc.fill(value!, { timeout: STEP_TIMEOUT_MS });
              break;
            case 'click':
              await loc.click({ timeout: STEP_TIMEOUT_MS });
              break;
            case 'hover':
              await loc.hover({ timeout: STEP_TIMEOUT_MS });
              break;
            case 'select':
              await this.selectSmart(loc, value!);
              break;
            case 'check':
              await loc.check({ timeout: STEP_TIMEOUT_MS });
              break;
            case 'uncheck':
              await loc.uncheck({ timeout: STEP_TIMEOUT_MS });
              break;
          }
        };

        /**
         * K0.13 capa 3 — la acción y su POSTCONDICIÓN son una unidad. El intento
         * puede repetirse una vez, pero solo cuando repetirlo es demostrablemente
         * inocuo: huella de pantalla intacta (la acción no surtió efecto) Y acción
         * declarada segura. Cualquier otra combinación no se reintenta y se reporta.
         */
        const fpBefore = await this.fingerprint();
        const MAX_ATTEMPTS = 2;
        let attempt = 0;
        let outcome: StepOutcome = 'ok';
        let obs: SettleObservation | undefined;
        let retried = false;
        let retryReason: string | undefined;
        let retryRefused: string | undefined;

        for (;;) {
          attempt += 1;
          try {
            await runAction(resolved.locator);
          } catch (err) {
            /**
             * K0.11d — el elemento SE RESOLVIÓ pero la acción falló. Es la clase de
             * COREOGRAFÍA (el caso onesait s6: item de submenú presente en el DOM pero
             * nunca clicable) y hasta ahora caía en el catch genérico de run(): el paso
             * quedaba bloqueado con un timeout opaco y la asistencia ni se enteraba,
             * porque solo se disparaba cuando el elemento no se encontraba.
             *
             * El `via` va SIEMPRE en el motivo: saber QUÉ matcheó es lo que distingue
             * "no es clicable" de "matcheé el elemento equivocado" — un hint por texto
             * puede resolver único sobre un título o un div oculto.
             */
            // K0.25: en verificación el fallo sube tal cual — el catch de
            // verifyAssistPatch lo convierte en "replay falló: ...".
            if (this.verifying) throw err;
            const msg = actionFailureDetail(err);
            const detail = `la acción '${step.action}' falló sobre ${resolved.via}: ${msg}`;
            if (this.opts.assist) {
              this.audit('block', `action_failed en ${flow.flow}/${step.id}: ${detail}`, {
                phase: 'assist-trigger',
                matched: resolved.via,
              });
              const assisted = await this.assistResolve(flow, step, detail);
              if (!assisted) {
                this.pushReport(flow, step, { outcome: 'action_failed', action_ms: Date.now() - startedAt, settle: obs, retried, resolved_via: resolved.via });
                return; // drift/block/timeout/captura-sin-ejecutar: ya anotado
              }
              /**
               * K0.15 — el estado en el que el QA señaló el elemento NO se da por
               * bueno: se comprueba y, si hace falta, se recupera re-ejecutando los
               * abridores del camino que él acaba de grabar.
               */
              const reach = await this.ensureAssistedTargetReachable(flow, step, assisted);
              if (!reach.ok) {
                this.blockStep(flow, step, this.motivoParcheInalcanzable(flow, step, reach.reason ?? ''), false);
                this.audit('block', `objetivo asistido inalcanzable ${stepKey}: ${reach.reason}`, {
                  phase: 'assist-postaction',
                  matched: assisted.via,
                });
                this.pushReport(flow, step, { outcome: 'action_failed', action_ms: Date.now() - startedAt, settle: obs, retried, resolved_via: assisted.via });
                return;
              }
              /**
               * K0.14 — envuelta porque un fallo aquí NO es un fallo de locator: el
               * parche acaba de verificarse. Sin envolver subía al catch genérico del
               * bucle como "fallo de ejecución: Timeout" justo después de que el panel
               * dijera "Parche verificado" — el diagnóstico más desconcertante posible.
               */
              // K0.47 — misma guarda anti doble disparo que en el disparador de
              // resolución: aquí es aún más delicada, porque la PRIMERA ejecución del
              // walker ya falló y la del QA es la única que ocurrió de verdad.
              if (assisted.performed && !isRetrySafe(step)) {
                this.audit('allow', `acción ejecutada por el QA durante la grabación en ${stepKey}: no se re-dispara (paso no reintenable)`, {
                  phase: 'assist-postaction',
                  matched: assisted.via,
                });
                this.pushReport(flow, step, { outcome: 'ok', action_ms: Date.now() - startedAt, settle: obs, retried, resolved_via: assisted.via });
                return;
              }
              try {
                await runAction(assisted.locator);
              } catch (err2) {
                const m2 = err2 instanceof Error ? err2.message.split('\n')[0] : String(err2);
                this.blockStep(
                  flow,
                  step,
                  `el objetivo era accionable pero la acción '${step.action}' falló sobre ${assisted.via}: ${m2}. ` +
                    `El parche está en assist-patch.json; fúndelo y relanza.`,
                  false,
                );
                this.audit('block', `acción post-asistencia fallida ${stepKey}`, {
                  phase: 'assist-postaction',
                  matched: assisted.via,
                });
                this.pushReport(flow, step, { outcome: 'action_failed', action_ms: Date.now() - startedAt, settle: obs, retried, resolved_via: assisted.via });
                return;
              }
              resolved = assisted;
            } else {
              this.blockStep(flow, step, detail, false);
              this.pushReport(flow, step, { outcome: 'action_failed', action_ms: Date.now() - startedAt, settle: obs, retried, resolved_via: resolved.via });
              return;
            }
          }

          if (step.expect_transition) {
            // SPAs: domcontentloaded ya disparó — ahí la señal de transición es el
            // cambio de URL. El settle va DESPUÉS de las esperas de navegación y solo
            // una vez: la pantalla que interesa estabilizar es la nueva, y estabilizar
            // la vieja de paso solo añade la ventana de quietud a cada transición.
            /**
             * K0.34 — pero la URL NO es la única señal, y creérselo costaba diez
             * segundos por transición. Medido en el banco JSF 1.2: al enviar el
             * formulario y al paginar, la página cambia entera y la URL se queda
             * igual, así que este `waitForURL` agotaba su tope entero y se lo
             * tragaba el `.catch()`. El paso salía `ok` — no había rojo que mirar —
             * pero cada acción con transición pagaba 10 s. En un caso corporativo
             * de 30 pasos eso son cinco minutos de espera pura, invisibles en el
             * recuento de verdes.
             *
             * Se corre contra la marca de documento: gana la primera de las dos
             * señales. URL distinta (SPA) o documento nuevo (POST de toda la vida).
             */
            await Promise.race([
              this.page.waitForURL((u) => u.toString() !== preUrl, { timeout: STEP_TIMEOUT_MS }),
              this.page.waitForFunction('window.__qaDocMark === undefined', undefined, { timeout: STEP_TIMEOUT_MS }),
            ]).catch(() => {});
            await this.page.waitForLoadState('domcontentloaded', { timeout: STEP_TIMEOUT_MS }).catch(() => {});
            // networkidle fuera por lo mismo que en 'goto': retrasa el inicio de la
            // observación, que es justo lo que no podemos permitirnos.
            obs = await this.waitForSettle(settle);
            // K0.25: el replay de verificación NO toca current_screen/screens/transitions
            // (el rodaje: el replay fantasma pisó current_screen y el run principal
            // registró una transición con `from` falso).
            if (!this.verifying) {
              this.state.current_screen = null;
              await this.captureScreen(flow, step);
              this.recordTransition(flow, step, resolved.via, from);
            }
          } else {
            obs = await this.waitForSettle(settle);
          }

          if (step.expect_after === undefined) {
            outcome = obs.timed_out ? 'settle_timeout' : 'ok';
            break;
          }

          const wanted = resolveFixtureRef(step.expect_after, fixtures);
          const found = await this.findVisibleText(wanted, ORACLE_TIMEOUT_MS);
          if (found) {
            this.recordBusinessText(wanted, found.via, found.frame_path);
            outcome = attempt > 1 ? 'ok_after_retry' : obs.timed_out ? 'settle_timeout' : 'ok';
            break;
          }

          const fpAfter = await this.fingerprint();
          const unchanged = fpAfter === fpBefore;
          const safe = isRetrySafe(step);

          if (unchanged && safe && attempt < MAX_ATTEMPTS) {
            retried = true;
            retryReason =
              `postcondición '${wanted}' no observada y la huella de pantalla no cambió (${fpBefore}) ` +
              `→ la acción no surtió efecto; ${obs.busy_cycles} ciclos de ocupado observados`;
            this.audit('skip', `reintento por sincronización ${stepKey}: ${retryReason}`, {
              phase: 'retry',
              attempt,
              settle: obs,
            });
            continue;
          }

          // K0.25: en verificación, una postcondición que no aparece = replay divergente.
          if (this.verifying) {
            throw new Error(`postcondición '${wanted}' no observada en ${step.id} durante el replay de verificación`);
          }

          /**
           * K0.22 — el QA tiene la última decisión. Si el paso RESOLVIÓ y se ejecutó
           * pero la postcondición no apareció, con --assist se abre el panel ANTES de
           * darlo por bloqueado (antes esto se marcaba como hallazgo sin ofrecer
           * ayuda — el caso del menú de onesait: el click resolvió pero no navegó).
           *
           * Salvaguarda innegociable: la corrección del QA solo se RE-EJECUTA si es
           * seguro — la acción no surtió efecto (huella intacta) o es reintentable.
           * Una acción que ya mutó negocio (huella cambiada + no reintentable) NO se
           * re-dispara: el panel se abre igual, la corrección se captura al parche
           * para el próximo run, pero no se ejecuta ahora. Nunca dos "Finalizar".
           */
          if (this.opts.assist) {
            /**
             * Guarda conservadora: solo re-ejecuto lo DECLARADO seguro (isRetrySafe:
             * navegación/idempotente). NO uso "huella intacta" para permitir
             * re-ejecutar un paso de negocio, porque huella-intacta puede ser un falso
             * negativo (la acción mutó el backend sin cambiar la UI) y re-disparar un
             * "Finalizar" crearía una segunda declaración. Un paso que solo navega se
             * declara retry_safe: true en el guion — y entonces sí se re-ejecuta.
             */
            const canReexec = safe;
            const nota = unchanged
              ? `el paso resolvió y se ejecutó pero '${wanted}' no apareció y la pantalla NO cambió — probablemente el camino o el elemento no eran los correctos; enséñame el bueno, o marca drift`
              : `el paso resolvió y se ejecutó, la pantalla cambió pero '${wanted}' no apareció — posible drift del plan`;
            const aviso = canReexec
              ? ''
              : ' — AVISO: este paso ya modificó estado de negocio; capturo tu corrección para el próximo run pero NO la re-ejecuto ahora';
            const assisted = await this.assistResolve(flow, step, nota + aviso);
            if (assisted && canReexec) {
              try {
                await runAction(assisted.locator);
              } catch {
                /* la corrección tampoco pudo ejecutarse: cae al bloqueo de abajo */
              }
              obs = await this.waitForSettle(settle);
              const f2 = await this.findVisibleText(wanted, ORACLE_TIMEOUT_MS);
              if (f2) {
                this.recordBusinessText(wanted, f2.via, f2.frame_path);
                resolved = assisted;
                retried = true;
                retryReason = 'corregido por el QA en el panel asistido (la página es la fuente de la verdad)';
                outcome = 'ok_after_retry';
                if (step.expect_transition) {
                  this.state.current_screen = null;
                  await this.captureScreen(flow, step);
                  this.recordTransition(flow, step, assisted.via, from);
                }
                break;
              }
              // corregido pero aún no aparece: sigue al bloqueo de abajo
            } else if (assisted && !canReexec) {
              this.audit('skip', `corrección del QA capturada sin re-ejecutar (acción mutante ya disparada) ${stepKey}`, {
                phase: 'assist-postcondition',
              });
            } else {
              // assisted === null: el QA marcó drift/block o hubo timeout; assistResolve
              // ya anotó el open_question. Reportamos y salimos sin re-bloquear.
              this.pushReport(flow, step, { outcome: 'postcondition_unmet', action_ms: Date.now() - startedAt, settle: obs, retried, resolved_via: resolved.via });
              return;
            }
          }

          outcome = 'postcondition_unmet';
          if (unchanged && !safe) {
            retryRefused =
              `acción '${step.action}' NO reintentable por defecto (repetirla podría duplicar estado de negocio); ` +
              `declara retry_safe: true en el guion si este paso es solo navegación`;
          }
          const why = unchanged
            ? `la acción no surtió efecto: postcondición '${wanted}' no observada y la pantalla no cambió` +
              (retryRefused ? ` — ${retryRefused}` : ` (ya reintentado ${attempt} veces)`)
            : `drift candidato: la pantalla cambió (huella ${fpBefore} → ${fpAfter}) pero la postcondición ` +
              `'${wanted}' no se observa — NO se reintenta: repetir sobre un estado ya alterado duplicaría la operación`;
          this.blockStep(flow, step, why, false);
          this.audit('block', `postcondición no cumplida ${stepKey}`, {
            phase: 'postcondition',
            fingerprint_before: fpBefore,
            fingerprint_after: fpAfter,
            retried,
            settle: obs,
          });
          break;
        }

        this.pushReport(flow, step, {
          outcome,
          action_ms: Date.now() - startedAt,
          settle: obs,
          retried,
          resolved_via: resolved.via,
          // D46 — el locator EMISIBLE, cuando la notacion del peldano no es codigo.
          ...(resolved.emit ? { emit_locator: resolved.emit } : {}),
          ...(retryReason ? { retry_reason: retryReason } : {}),
          ...(retryRefused ? { retry_refused: retryRefused } : {}),
        });
      }
    }
  }

  /**
   * Texto visible en page/frames: literal primero, regex normalizado después (K0.1).
   * `timeoutMs` acotado (K0.13): cuando esto se usa como ORÁCULO del paso la pantalla
   * ya se estabilizó, así que si el texto no está no va a llegar — y 10 s por intento
   * y por scope convertían el reintento en algo inasumible.
   */
  /**
   * K0.30 — lee el VALOR de un control. `inputValue()` cubre input/textarea/
   * select (incluido el `<select>` que hay detrás de una fachada). Si el
   * elemento no es ninguno de ésos, se intenta `contenteditable` y el atributo
   * `value`; si tampoco, devuelve null — "no tiene valor legible" es un
   * diagnóstico distinto de "el valor no coincide", y confundirlos es culpar al
   * negocio de un problema de locator.
   */
  private async readValue(locator: Locator): Promise<string | null> {
    const direct = await locator.inputValue({ timeout: ORACLE_TIMEOUT_MS }).catch(() => null);
    if (direct !== null) return direct;
    return locator
      .evaluate((el) => {
        if (el instanceof HTMLElement && el.isContentEditable) return el.textContent ?? '';
        const attr = el.getAttribute('value');
        return attr === null ? null : attr;
      })
      .catch(() => null);
  }

  private async findVisibleText(
    value: string,
    timeoutMs = STEP_TIMEOUT_MS,
    containers?: Array<{ scope: Page | Frame | Locator; path: string[]; via?: string }>,
  ): Promise<{ via: string; frame_path: string[]; matched_text: string } | null> {
    // K0.30 (F4): con ámbito declarado se busca SOLO dentro de él; sin ámbito,
    // toda la página como siempre.
    const scopes = containers ?? (await this.scopes());
    const attempts: Array<{ needle: string | RegExp; via: string }> = [
      { needle: value, via: `getByText('${value.replace(/'/g, "\\'")}')` },
      { needle: new RegExp(accentInsensitivePattern(value), 'i'), via: `getByText(/${accentInsensitivePattern(value)}/i)` },
    ];
    for (const { needle, via: rawVia } of attempts) {
      for (const container of scopes) {
        const { scope, path } = container;
        const via = 'via' in container && container.via ? `${container.via} >> ${rawVia}` : rawVia;
        /**
         * `.filter({ visible: true })` antes del `.first()` — K0.16, encontrado por el
         * banco corporativo: el texto de negocio "Rehusada" existe TAMBIÉN como
         * `<option>` del filtro de estado, y esa opción va antes en el DOM. Con
         * `.first()` a secas se elegía la opción (invisible por estar el select
         * cerrado) y se esperaba en vano a que se hiciera visible: la postcondición
         * salía incumplida teniendo el resultado delante. Clase real, no de fixture:
         * en un formulario de consulta el valor y su filtro comparten literal.
         */
        const nodo = scope.getByText(needle).filter({ visible: true }).first();
        const visible = await nodo
          .waitFor({ state: 'visible', timeout: timeoutMs })
          .then(() => true)
          .catch(() => false);
        if (visible) {
          // El texto ENTERO del nodo que satisfizo la búsqueda. La aserción es por
          // fragmento a propósito (un importe vive dentro de una frase), pero el
          // informe tiene que poder decir dentro de QUÉ frase apareció.
          const completo = ((await nodo.textContent().catch(() => null)) ?? '').replace(/\s+/g, ' ').trim();
          return { via, frame_path: path, matched_text: completo };
        }
      }
    }
    return null;
  }

  private async checkState(locator: Locator, want: string): Promise<boolean> {
    switch (want) {
      case 'visible':
        return locator.waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS }).then(() => true).catch(() => false);
      case 'enabled':
        return locator.isEnabled({ timeout: STEP_TIMEOUT_MS }).catch(() => false);
      case 'disabled':
        return locator.isDisabled({ timeout: STEP_TIMEOUT_MS }).catch(() => false);
      case 'checked':
        return locator.isChecked({ timeout: STEP_TIMEOUT_MS }).catch(() => false);
      case 'unchecked':
        return locator.isChecked({ timeout: STEP_TIMEOUT_MS }).then((v) => !v).catch(() => false);
      default:
        return false;
    }
  }

  /** Upsert de un texto de negocio verificado en la pantalla actual (K0.2/K0.3). */
  private recordBusinessText(value: string, via: string, frame_path: string[], matched_text?: string): void {
    if (this.verifying) return; // K0.25: cinturón — el replay no anota business_text
    const screen = this.state.screens.find((s) => s.name === this.state.current_screen);
    if (!screen) return;
    screen.business_text = screen.business_text ?? [];
    if (screen.business_text.some((b) => b.name === value)) return;
    screen.business_text.push({
      role: 'text',
      name: value,
      ...(frame_path.length ? { frame_path } : {}),
      ...(matched_text ? { matched_text } : {}),
      locator_candidates: [via],
    });
  }

  /**
   * K0.17 — nota de pantalla vacía. Cuando un hint no resuelve y la pantalla NO TIENE
   * elementos interactivos, la causa no es el hint: es que ahí no hay aplicación.
   * Medido contra OrangeHRM: el run reportó SIETE "hint irresoluble" cuando la verdad
   * era una sola, y el informe culpaba al guion en vez de a la pantalla.
   */
  private async emptyScreenNote(): Promise<string> {
    const n = await this.page
      .evaluate(
        () =>
          document.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="link"],[role="textbox"]')
            .length,
      )
      .catch(() => -1);
    if (n !== 0) return '';
    return (
      ' — ATENCIÓN: la pantalla no tiene NINGÚN elemento interactivo. El hint no es el problema: ' +
      'la aplicación puede no haber montado (SPA lenta), la sesión pudo rebotar al login, ' +
      'o el entorno está devolviendo una página en blanco'
    );
  }

  /**
   * K0.35 — ¿la pantalla es una página de ERROR del servidor? Hermana de
   * `emptyScreenNote`: no cambia el veredicto, añade la evidencia que impide leer
   * mal el que ya hay.
   *
   * Medido en el banco JSF 1.2: al reventar una acción, MyFaces sirve su página
   * de error con título "Error - Error calling action method…" y un volcado de
   * `java.lang.NullPointerException`. El walker reportaba "drift: postcondición
   * del FD no observada" y, en el paso siguiente, "hint irresoluble" — dos
   * diagnósticos que mandan al QA a revisar el plan y los locators cuando lo que
   * pasó es que la aplicación se cayó.
   *
   * El código HTTP NO basta y está medido: esa página llega con **200**, porque
   * los errores de servlet se sirven por forward, no por redirección. Así que se
   * miran tres señales, y se EXIGE una específica — nunca la simple palabra
   * "error", que aparece en pantallas legítimas:
   *   (a) el documento respondió >= 400 (objetivo, cuando el contenedor lo hace),
   *   (b) hay firma de volcado de pila (Java/.NET/Python: son literales del
   *       runtime, no del idioma de la aplicación),
   *   (c) el título tiene forma de página de error de contenedor.
   *
   * Y se cita lo encontrado en vez de afirmar la causa: el walker no sabe que la
   * app falló, sabe que la pantalla tiene esta pinta. La diferencia importa.
   */
  private async notaPaginaError(): Promise<string> {
    const señales: string[] = [];
    if (this.ultimoEstadoDoc !== null && this.ultimoEstadoDoc >= 400) {
      señales.push(`el documento respondió HTTP ${this.ultimoEstadoDoc}`);
    }
    const visto = await this.page
      .evaluate(`(function () {
        var t = document.title || '';
        var b = (document.body && document.body.innerText) || '';
        var pila = b.match(/\\b(?:java|javax|jakarta)\\.[a-z0-9.]+\\.[A-Za-z0-9_$]*(?:Exception|Error)\\b/)
          || b.match(/\\bat\\s+[\\w.$]+\\([\\w$]+\\.(?:java|kt|scala):\\d+\\)/)
          || b.match(/\\bSystem\\.[A-Za-z]+Exception\\b/)
          || b.match(/Traceback \\(most recent call last\\)/);
        var tituloError = /^\\s*(?:HTTP Status\\s+\\d{3}|Error\\s*[-–:])/.test(t);
        return { titulo: t.slice(0, 90), pila: pila ? pila[0] : null, tituloError: tituloError };
      })()`)
      .catch(() => null) as { titulo: string; pila: string | null; tituloError: boolean } | null;
    if (visto?.pila) señales.push(`el cuerpo contiene '${visto.pila}'`);
    if (visto?.tituloError) señales.push(`el título es '${visto.titulo}'`);
    if (señales.length === 0) return '';
    return (
      ` — AVISO: la pantalla tiene forma de PÁGINA DE ERROR del servidor (${señales.join('; ')}). ` +
      'Si es así, el fallo no está en el guion ni en el locator: la aplicación no llegó a responder lo que se le pedía'
    );
  }

  private blockStep(flow: WalkFlow, step: WalkStep, reason: string, rescueAttempted: boolean): void {
    if (this.verifying) return; // K0.25: cinturón — el replay no bloquea pasos del run
    if (this.state.open_questions.some((q) => q.flow === flow.flow && q.step === step.id)) return;
    this.state.open_questions.push({
      flow: flow.flow,
      step: step.id,
      action: step.action,
      ...(step.hint ? { hint: step.hint } : {}),
      reason,
      rescue_attempted: rescueAttempted,
    });
  }

  // ------------------------------------------------- promoción de rescates

  /**
   * K0.5 — promoción CONDICIONAL de rescates a hint-aliases. Aliases existentes
   * nunca se sobrescriben (cambiarlos = PR humano).
   *
   * Dos cerrojos valen SIEMPRE, porque son evidencia directa sobre el elemento
   * que se va a memorizar: el paso no quedó bloqueado, y si declaraba
   * `expect_transition` la transición se registró (si el clic no navegó, el
   * elemento era otro).
   *
   * K0.44 — el tercero, `flowExpectsFailed`, habla de OTRO paso del flujo y solo
   * frena al LLM. La regla original se escribió para rescates de subagente: un
   * modelo propone un locator sin haber visto la pantalla, y la postcondición del
   * FD es la corroboración independiente que hace falta antes de fiarse. Cuando
   * quien resolvió es el QA mirando la aplicación, la corroboración independiente
   * YA OCURRIÓ — exigir además el proxy es pedir dos veces lo mismo.
   *
   * Y el proxy falla justo donde más duele, medido en campo (ParaBank, S3): FD en
   * castellano contra app en inglés, el QA señala Username y Password en el panel,
   * y la postcondición del flujo —que está en castellano por la MISMA razón que
   * los hints— no se cumple. Resultado: el run en el que el QA más enseña es el
   * run en el que no se aprende nada, y a la siguiente vuelve a señalar lo mismo.
   *
   * El precedente es del propio producto: la captura de corpus (K0.32) ya admite
   * «corroboración INDEPENDIENTE — humana (panel/locator a mano) O postcondición
   * del FD cumplida» como ALTERNATIVAS. Aquí solo se admitía una de las dos.
   */
  private promoteRescues(flow: WalkFlow): void {
    const flowExpectsFailed = this.state.open_questions.some(
      (q) => q.flow === flow.flow && q.action.startsWith('expect'),
    );
    for (const rescue of this.state.rescues) {
      if (rescue.flow !== flow.flow || !rescue.resolved || !rescue.locator) continue;
      const step = flow.steps.find((s) => s.id === rescue.step);
      if (!step?.hint) continue;
      const key = aliasKey(step.hint, step.scope);
      if (this.aliases.aliases[key]) continue;
      const verdict = aliasPromotionVerdict({
        source: rescue.source,
        stepBlocked: this.state.open_questions.some((q) => q.flow === flow.flow && q.step === step.id),
        expectsTransition: step.expect_transition === true,
        transitionRecorded: this.state.transitions.some((t) => t.flow === flow.flow && t.step === step.id),
        flowExpectsFailed,
        // K0.47 — sin estos dos, la decisión se tomaba a ciegas: la fragilidad se
        // tiraba antes de llegar aquí, y a una captura-sin-ejecutar se le exigía la
        // transición de una acción que se impidió a propósito.
        executed: rescue.executed,
        fragile: rescue.fragile,
      });
      if (!verdict.promote) {
        this.audit('skip', `rescate NO promovido a alias ${flow.flow}/${step.id}: ${verdict.reason}`, {
          phase: 'alias-promotion',
          locator: rescue.locator,
          rescue_source: rescue.source ?? 'llm',
        });
        continue;
      }
      this.aliases.aliases[key] = {
        locator: rescue.locator,
        hint: step.hint,
        origin: { flow: flow.flow, step: step.id, date: new Date().toISOString().slice(0, 10) },
      };
      this.saveAliases();
      this.audit('allow', `rescate promovido a alias: ${key} → ${rescue.locator}`, {
        phase: 'alias-promotion',
        file: this.aliasesPath,
        rescue_source: rescue.source ?? 'llm',
        // por qué se admitió pese al drift del flujo: queda en la traza, no en la cabeza de nadie
        via_human_override: verdict.viaHumanOverride ? true : undefined,
      });
    }
  }

  // ----------------------------------------------------------------- run

  async run(): Promise<DomMap> {
    const browser = await chromium.launch({ headless: !this.opts.headed, proxy: proxyFromEnv() });
    // prioridad de sesión: checkpoint propio (reanudación) > QA_STORAGE_STATE (auth-handler Fase C)
    const sessionCheckpoint = resolve(this.opts.workDir, 'walk-session.json');
    const storageState =
      this.state.completed.length > 0 && existsSync(sessionCheckpoint)
        ? sessionCheckpoint
        : this.opts.storageState && existsSync(this.opts.storageState)
          ? this.opts.storageState
          : undefined;
    // Fase 3 (SPEC-caos-corporativo §4) — matar animaciones. Knob del CONTRACT (no
    // del paso: se decide una vez, al abrir el contexto), default ON en funcional.
    // contract+script son las únicas capas que existen antes de tener flow/step.
    const animProfile = mergeSettle(this.contract.settle, this.script.settle, this.opts.settleOverride);
    this.context = await browser.newContext({
      ...(storageState ? { storageState } : {}),
      ...(animProfile.disable_animations ? { reducedMotion: 'reduce' as const } : {}),
      ...(this.locale ? { locale: this.locale } : {}),
      // D71 — declarado o el default de Playwright, pero SIEMPRE dicho por pantalla:
      // un viewport invisible convierte cualquier maqueta responsiva en drift falso.
      ...(this.opts.viewport ? { viewport: this.opts.viewport } : {}),
    });
    console.log(
      `[dom-walker] viewport ${this.opts.viewport ? `${this.opts.viewport.width}×${this.opts.viewport.height} (declarado)` : '1280×720 (default de Playwright — sin declarar; ver D71)'}`
    );
    if (animProfile.disable_animations) {
      // string, no referencia de función — mismo motivo que settleScript: esbuild
      // (tsx en producción) envuelve funciones con __name, inexistente en la
      // página, y el transform de vitest no lo reproduce (ver K0.13).
      await this.context.addInitScript(killAnimationsScript());
    }
    this.page = await this.context.newPage();
    // K0.35 — el código del documento navegado, apuntado según llega: cuando el
    // contenedor SÍ devuelve 5xx es la señal objetiva de página de error, y en el
    // momento del fallo ya no se puede consultar.
    this.page.on('response', (r) => {
      if (r.request().isNavigationRequest() && r.frame() === this.page.mainFrame()) {
        this.ultimoEstadoDoc = r.status();
      }
    });
    // Fase 2: opt-in por client pack, sin efecto si el contract no declara nada
    await this.installObstructionHandlers();
    await this.installConsentHandler();
    // diálogos no declarados por el paso: registrar y cerrar (determinista, no colgar)
    this.page.on('dialog', async (d) => {
      this.lastDialogs.push(`${d.type()}: ${d.message()}`);
      await d.dismiss().catch(() => {});
    });

    /**
     * D42 — AISLAMIENTO ENTRE FLUJOS. Medido en OrangeHRM el 2026-08-22.
     *
     * El walker corria TODOS los flujos en un mismo contexto de navegador, y el refiner
     * emite un prefijo de login en CADA flujo (esta literalmente asi en los guiones de
     * SauceDemo y ParaBank). En cuanto el primer login funciona de verdad, el `goto` al
     * login del flujo siguiente cae en un contexto YA autenticado donde no hay formulario,
     * y sus pasos se reportan «hint irresoluble»: 21 bloqueos falsos de 26 en la bateria de
     * sonda. Estaba oculto porque en ParaBank y SauceDemo los hints en espanol nunca
     * resolvian, asi que nunca habia sesion — un defecto tapaba al otro.
     *
     * NO se aisla si el caller paso `storageState`: ahi la sesion esta pensada para
     * compartirse (proyecto de auth) y limpiarla romperia el reuso a proposito.
     *
     * Y el aislamiento es SECUENCIAL, no concurrente: un re-login por flujo es seguro
     * incluso en aplicaciones que no admiten dos sesiones simultaneas del mismo usuario.
     */
    // D69 — solo la sesión del CALLER desactiva el aislamiento; la del checkpoint
    // (reanudación) entra por `storageState` pero NO es una sesión compartida.
    const aislarFlujos = debeAislarFlujos({
      aislamientoDelContract:
        (this.contract as { walker?: { isolate_flows?: boolean } }).walker?.isolate_flows !== false,
      sesionDelCaller: Boolean(this.opts.storageState && existsSync(this.opts.storageState)),
    });
    let flujosVistos = 0;

    try {
      for (const flow of this.script.flows) {
        if (aislarFlujos && flujosVistos > 0) {
          await this.context.clearCookies().catch(() => {});
          // string, NO referencia de funcion: esbuild envuelve las funciones con __name,
          // inexistente en la pagina (mismo motivo que settleScript, ver K0.13).
          await this.page
            .evaluate('try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}')
            .catch(() => {});
          console.log(`[dom-walker] sesion reiniciada antes de '${flow.flow}' (aislamiento entre flujos)`);
        }
        flujosVistos += 1;

        const keys = ['__entry', ...flow.steps.map((s) => s.id)].map((id) => `${flow.flow}/${id}`);
        // flujo 100% completado en un run anterior: se salta (sesión restaurada de walk-session.json)
        if (keys.every((k) => this.state.completed.includes(k))) continue;

        /**
         * D66 — un flujo A MEDIAS se re-ejecuta desde su primer paso, y hacerlo
         * con la sesión del checkpoint restaurada envenenaba la reanudación: el
         * login sobre un dashboard ya logueado es irresoluble, el walker pedía
         * rescate de un paso YA completado y la respuesta legítima del paso
         * pendiente se descartaba como «respuesta de otro paso» (medido contra
         * OrangeHRM, bucle quema-tokens). La re-ejecución exige la sesión limpia
         * que midió el run original. El predicado —con sus dos excepciones,
         * sesión del caller y flujos no aislados— vive en walk-core con su tabla.
         */
        if (
          debeReiniciarSesionAlReanudar({
            flujoAMedias: keys.some((k) => this.state.completed.includes(k)),
            sesionEsCheckpoint: storageState === sessionCheckpoint,
            aislamientoDelContract:
              (this.contract as { walker?: { isolate_flows?: boolean } }).walker?.isolate_flows !== false,
            sesionDelCaller: Boolean(this.opts.storageState),
          })
        ) {
          await this.context.clearCookies().catch(() => {});
          await this.page
            .evaluate('try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}')
            .catch(() => {});
          console.error(
            `[dom-walker] sesión del checkpoint DESCARTADA para re-ejecutar '${flow.flow}' desde su primer paso (D66): ` +
              `la re-ejecución exige la sesión limpia que midió el run original`,
          );
        }

        // pasos que quedaron bloqueados en un run anterior: siguen bloqueados, no se re-intentan
        const blocked = new Set(
          this.state.open_questions.filter((q) => q.flow === flow.flow).map((q) => q.step),
        );

        // K0.24 — ventana de pasos [fromStep..toStep]. Se resuelve ANTES de navegar a
        // entry: si el flujo no contiene la ventana, se salta sin gastar navegación.
        let windowSteps = flow.steps;
        if (this.opts.fromStep || this.opts.toStep) {
          const fromIdx = this.opts.fromStep ? flow.steps.findIndex((s) => s.id === this.opts.fromStep) : 0;
          const toIdx = this.opts.toStep ? flow.steps.findIndex((s) => s.id === this.opts.toStep) : flow.steps.length - 1;
          if ((this.opts.fromStep && fromIdx === -1) || (this.opts.toStep && toIdx === -1)) continue;
          if (fromIdx > toIdx) continue;
          windowSteps = flow.steps.slice(fromIdx, toIdx + 1);
          console.error(
            `[dom-walker] ventana de pasos en '${flow.flow}': ${windowSteps[0].id}..${windowSteps[windowSteps.length - 1].id} ` +
              `(${windowSteps.length} de ${flow.steps.length}; entry siempre se ejecuta)`,
          );
        }

        // cada flujo parte de entry; en reanudación los pasos ya completados se REPLAYEAN
        // (proceso de navegador nuevo → hay que reconstruir el estado in-page)
        const entryStep: WalkStep = { id: '__entry', action: 'goto', target: this.script.entry };
        /**
         * K0.17 — el entry va envuelto. Antes estaba fuera del try/catch y su fallo
         * subía a main(): exit 1, sin dom-map y sin saber qué flujos habrían pasado.
         * Un entorno que no responde es un HALLAZGO del entorno, no el fin del run:
         * el flujo se anota y se sigue con el siguiente.
         */
        try {
          await this.executeStep(flow, entryStep);
        } catch (err) {
          const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
          this.blockStep(flow, entryStep, `el entorno no respondió al abrir la entrada: ${msg}`, false);
          this.audit('block', `entry inalcanzable en ${flow.flow}: ${msg}`, { phase: 'entry' });
          console.error(`[dom-walker] flujo '${flow.flow}' saltado: la entrada no respondió`);
          continue;
        }
        this.markCompleted(`${flow.flow}/__entry`);
        await this.persist();

        this.flowAborted = false;
        for (const step of windowSteps) {
          if (blocked.has(step.id)) continue;
          try {
            await this.executeStep(flow, step);
          } catch (err) {
            const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
            this.blockStep(flow, step, `fallo de ejecución: ${msg}`, false);
          }
          this.markCompleted(`${flow.flow}/${step.id}`);
          await this.persist();
          // K0.14: el QA capturó sin ejecutar → el estado ya no corresponde al guion
          if (this.flowAborted) {
            console.error(`[dom-walker] flujo '${flow.flow}' detenido tras ${step.id} (captura sin ejecución)`);
            break;
          }
          // K0.24: pausa entre pasos, TRAS el settle (ritmo/observabilidad, no sync).
          if (this.opts.stepDelayMs && this.opts.stepDelayMs > 0) {
            await new Promise((r) => setTimeout(r, this.opts.stepDelayMs));
          }
        }

        // flujo cerrado: los rescates con postcondición confirmada pasan a la memoria del cliente
        this.promoteRescues(flow);
      }
    } finally {
      await browser.close().catch(() => {});
    }

    // el perfil de tiempos se persiste al cerrar: cada run recalibra el siguiente
    this.saveTiming();
    // K0.32 — y el corpus se reparte al final, cuando ya se sabe qué pasos
    // tienen algo INDEPENDIENTE que corrobore su resolución
    this.flushCorpus();

    const stepsTotal = this.script.flows.reduce((n, f) => n + f.steps.length, 0);
    const reports = this.state.step_reports ?? [];
    const map: DomMap = {
      version: 1,
      site_id: this.script.site_id,
      generated_by: 'dom-walker',
      generated_at: new Date().toISOString(),
      target_url: this.baseUrl(),
      contract: this.opts.contractPath,
      testid_attribute: this.testidAttr ?? 'data-testid',
      stats: {
        flows: this.script.flows.length,
        steps_total: stepsTotal,
        steps_executed: stepsTotal - this.state.open_questions.length,
        steps_blocked: this.state.open_questions.length,
        rescues_used: this.state.rescues_used,
        rescue_budget: this.opts.rescueBudget,
        screens: this.state.screens.length,
        flaky_timing: reports.filter((r) => r.outcome === 'ok_after_retry').length,
        settle_timeouts: reports.filter((r) => r.outcome === 'settle_timeout').length,
        postcondition_unmet: reports.filter((r) => r.outcome === 'postcondition_unmet').length,
      },
      screens: this.state.screens,
      transitions: this.state.transitions,
      open_questions: this.state.open_questions,
      rescues: this.state.rescues,
      step_reports: reports,
    };
    return map;
  }
}

// -------------------------------------------------------------------- CLI

function loadState(workDir: string, script: WalkScript): WalkState {
  const statePath = resolve(workDir, 'walk-state.json');
  const hash = hashScript(script);
  if (existsSync(statePath)) {
    const prev = parseJsonLoose<WalkState>(readFileSync(statePath, 'utf8'));
    if (prev.script_hash === hash) {
      console.error(`[dom-walker] reanudando: ${prev.completed.length} pasos ya completados`);
      return prev;
    }
    console.error('[dom-walker] walk-state.json de un guion distinto — se descarta (run fresco)');
  }
  return {
    script_hash: hash,
    completed: [],
    rescues_used: 0,
    screens: [],
    transitions: [],
    open_questions: [],
    rescues: [],
    current_screen: null,
    step_reports: [],
  };
}

/** Override de settle por CLI/env. Sin ninguno de los tres → undefined (no pisa nada). */
function settleFromCli(values: Record<string, unknown>): SettleProfile | undefined {
  const num = (v: unknown, env?: string): number | undefined => {
    const raw = (v as string | undefined) ?? env;
    if (raw === undefined || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const profile: SettleProfile = {
    quiet_ms: num(values['quiet-ms'], process.env.QA_SETTLE_QUIET_MS),
    timeout_ms: num(values['settle-timeout'], process.env.QA_SETTLE_TIMEOUT_MS),
    max_mutations: num(values['max-mutations'], process.env.QA_SETTLE_MAX_MUTATIONS),
    busy_selectors: (values['busy-selector'] as string[] | undefined) ?? undefined,
  };
  const has = Object.values(profile).some((v) => v !== undefined);
  return has ? profile : undefined;
}

/**
 * Fase B — contra qué FD se decide, resuelto en el arranque y no cuando el QA ya
 * tiene el panel delante. Tres formas declaradas y **ninguna por defecto** (D45):
 * `--fd=<path>` (se calcula la huella), `--fd-hash=<hex>` (ya calculada) o
 * `--sin-fd` para el modo S4, donde no hay FD y hay que decirlo.
 *
 * Si el fichero no existe se devuelve `undefined` en vez de reventar el run: el FD
 * solo hace falta para firmar un veredicto, y tumbar un walk entero por un flag
 * mal escrito sería desproporcionado. El panel dirá lo que falta cuando toque.
 */
function fdHashDeCli(values: Record<string, unknown>): string | undefined {
  const directo = values['fd-hash'];
  if (typeof directo === 'string' && directo.trim()) return directo.trim();
  const path = values.fd;
  if (typeof path === 'string' && path) {
    try {
      return huellaDeArtefacto(path);
    } catch (err) {
      console.error(`[dom-walker] --fd no utilizable: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }
  if (values['sin-fd'] === true) return 'sin-fd';
  return undefined;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      script: { type: 'string' },
      contract: { type: 'string' },
      'base-url': { type: 'string' },
      'work-dir': { type: 'string' },
      'rescue-budget': { type: 'string' },
      'testid-attr': { type: 'string' },
      cap: { type: 'string' },
      headed: { type: 'boolean', default: false },
      'storage-state': { type: 'string' },
      aliases: { type: 'string' },
      assist: { type: 'boolean', default: false },
      'assist-timeout': { type: 'string' },
      'no-minimize': { type: 'boolean', default: false },
      // fase B: lo que hace falta para poder firmar un veredicto del QA
      actor: { type: 'string' },
      fd: { type: 'string' },
      'fd-hash': { type: 'string' },
      'sin-fd': { type: 'boolean', default: false },
      rf: { type: 'string' },
      decisions: { type: 'string' },
      'quiet-ms': { type: 'string' },
      'settle-timeout': { type: 'string' },
      'max-mutations': { type: 'string' },
      'busy-selector': { type: 'string', multiple: true },
      'timing-profile': { type: 'string' },
      'no-calibrate': { type: 'boolean', default: false },
      viewport: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      'step-delay': { type: 'string' },
      'capture-corpus': { type: 'string' },
    },
  });

  if (!values.script || !values.contract) {
    console.error('Uso: tsx copilot/src/dom-walker.ts --script=<walk-script.json> --contract=<style.yaml> [--base-url=...]');
    process.exit(EXIT_ERROR);
  }

  // parseJsonLoose: el walk-script lo escribe el REFINER (subagent, K0.8) — un BOM
  // de un editor o de PowerShell no puede tumbar el run entero.
  const rawScript = parseJsonLoose<WalkScript>(readFileSync(resolve(values.script), 'utf8'));
  const validation = validateWalkScript(rawScript);
  if (!validation.ok) {
    console.error('[dom-walker] walk-script inválido:');
    for (const e of validation.errors) console.error(`  - ${e}`);
    process.exit(EXIT_ERROR);
  }

  const contract = parseYaml(readFileSync(resolve(values.contract), 'utf8')) as StyleContract;
  const workDir = resolve(values['work-dir'] ?? process.env.QA_WORK_DIR ?? `.work/${rawScript.site_id}`);
  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

  // Modo asistido: opt-in explícito y NUNCA por defecto. En CI un navegador
  // esperando a una persona cuelga el pipeline; de ahí el flag aparte y el timeout.
  const assist = (values.assist ?? false) || process.env.QA_ASSIST === '1';

  const opts: WalkerOptions = {
    scriptPath: values.script,
    contractPath: values.contract,
    baseUrl: values['base-url'],
    workDir,
    rescueBudget: Number(values['rescue-budget'] ?? process.env.QA_RESCUE_BUDGET ?? 3),
    testidAttr: values['testid-attr'],
    screenCap: Number(values.cap ?? 60),
    headed: (values.headed ?? false) || assist,
    storageState: values['storage-state'] ?? process.env.QA_STORAGE_STATE,
    aliasesPath: values.aliases ?? process.env.QA_HINT_ALIASES,
    assist,
    assistTimeoutMs: Number(values['assist-timeout'] ?? process.env.QA_ASSIST_TIMEOUT ?? 600) * 1000,
    assistMinimize: !(values['no-minimize'] ?? false),
    actor: values.actor ?? process.env.QA_ACTOR,
    fdHash: fdHashDeCli(values),
    rf: values.rf,
    decisionsPath: values.decisions ?? process.env.QA_DECISIONS,
    settleOverride: settleFromCli(values),
    // D71 — declarado, no heredado: CLI > contract > default de Playwright.
    viewport: resolveViewport({
      cli: values.viewport ?? process.env.QA_VIEWPORT,
      contract: (contract as StyleContract & { viewport?: Viewport }).viewport ?? null,
    }),
    timingProfilePath: values['timing-profile'] ?? process.env.QA_TIMING_PROFILE,
    calibrate: !(values['no-calibrate'] ?? false),
    fromStep: values.from,
    toStep: values.to,
    stepDelayMs: values['step-delay'] !== undefined ? Number(values['step-delay']) : undefined,
    corpusDir: values['capture-corpus'],
  };

  /**
   * K0.32 — el aviso NO es decorativo. Una foto del corpus es el HTML crudo de
   * la pantalla: contra un entorno con datos reales, activarlo es una decisión
   * que el QA tiene que tomar sabiéndolo (regla dura #6).
   */
  if (opts.corpusDir) {
    console.error(
      `[dom-walker] CAPTURA DE CORPUS activada → ${opts.corpusDir}\n` +
        '            se guardará el HTML CRUDO de cada pantalla en la que la escalera resuelva.\n' +
        '            Contra un entorno con datos reales, revisa qué queda en esas fotos antes de compartirlas.',
    );
  }

  // K0.24 — si se pide una ventana, el id debe existir en algún flujo; si no, es un
  // typo y todos los flujos se saltarían en silencio. Falla claro y temprano.
  const allStepIds = new Set(rawScript.flows.flatMap((f) => f.steps.map((s) => s.id)));
  for (const [flag, id] of [['--from', opts.fromStep], ['--to', opts.toStep]] as const) {
    if (id !== undefined && !allStepIds.has(id)) {
      console.error(`[dom-walker] ${flag}=${id} no existe en ningún flujo del guion (pasos: ${[...allStepIds].join(', ')})`);
      process.exit(EXIT_ERROR);
    }
  }

  const state = loadState(workDir, rawScript);
  const walker = new DomWalker(opts, rawScript, contract, state);
  const map = await walker.run();

  const outPath = resolve(workDir, 'dom-map.json');
  writeFileSync(outPath, JSON.stringify(map, null, 2), 'utf8');
  rmSync(resolve(workDir, 'walk-state.json'), { force: true });
  rmSync(resolve(workDir, 'walk-session.json'), { force: true });
  console.log(
    `[dom-walker] OK  ${map.stats.screens} pantallas, ${map.stats.steps_executed}/${map.stats.steps_total} pasos, ` +
      `${map.stats.rescues_used} rescates, ${map.stats.steps_blocked} bloqueados → ${outPath}`,
  );
  // la sincronización se REPORTA aparte: un flaky no es un drift, y mezclarlos en
  // una sola cifra de "fallos" es exactamente lo que envenena el informe.
  if (map.stats.flaky_timing || map.stats.settle_timeouts || map.stats.postcondition_unmet) {
    console.log(
      `[dom-walker] sincronización: ${map.stats.flaky_timing} flaky (pasaron al reintentar), ` +
        `${map.stats.settle_timeouts} sin estabilizar, ${map.stats.postcondition_unmet} postcondiciones no cumplidas`,
    );
    for (const r of (map.step_reports ?? []).filter((x) => x.outcome !== 'ok')) {
      const cycles = r.settle ? `, ${r.settle.busy_cycles} ciclos de ocupado en ${r.settle.waited_ms} ms` : '';
      console.log(`  - ${r.flow}/${r.step} (${r.action}): ${r.outcome}${cycles}`);
    }
  }
  /**
   * K0.37 — las postcondiciones que pasaron por COINCIDENCIA PARCIAL se listan
   * aparte, con el texto que había en pantalla al lado del que pedía el FD. No son
   * fallos y no se cuentan como tales: son los verdes que hay que mirar dos veces.
   * El caso que motivó esto pedía "Records Found" y pasó con "(0) No Records Found".
   */
  const parciales = (map.step_reports ?? []).filter((r) => r.matched_text);
  if (parciales.length > 0) {
    console.log(
      `[dom-walker] ${parciales.length} postcondición(es) pasaron por COINCIDENCIA PARCIAL ` +
        `(el texto del FD es un fragmento del que hay en pantalla):`,
    );
    for (const r of parciales) {
      console.log(`  - ${r.flow}/${r.step}: el FD pedía '${r.value_searched ?? ''}' y en pantalla hay '${r.matched_text}'`);
    }
  }
  /**
   * K0.39 — y las que pasaron DESPUÉS de que un paso del mismo flujo quedara
   * bloqueado: si lo que debía cambiar la pantalla no se ejecutó, la aserción puede
   * estar mirando lo de antes. Tampoco son fallos; son los otros verdes que hay que
   * mirar dos veces.
   */
  const tardias = (map.step_reports ?? []).filter((r) => r.after_blocked);
  if (tardias.length > 0) {
    console.log(
      `[dom-walker] ${tardias.length} postcondición(es) pasaron con un paso ANTERIOR del mismo flujo bloqueado ` +
        `(pueden estar observando el estado previo):`,
    );
    for (const r of tardias) {
      console.log(`  - ${r.flow}/${r.step} pasó, pero ${r.flow}/${r.after_blocked} había quedado sin ejecutar`);
    }
  }
  /**
   * K0.41 — los pasos que resolvió el PELDAÑO DÉBIL. No son fallos ni bajan la
   * cobertura: resolvieron. Pero medido contra 6.249 páginas reales (§30), 33 de
   * los 38 fallos del corpus salieron de este peldaño y de ningún otro, así que
   * es exactamente aquí donde el QA tiene que mirar — unos pocos pasos de cada
   * cien en vez de todos. Los `SIN RED` van primero porque son los que nadie más
   * puede cazar.
   */
  const debiles = (map.step_reports ?? []).filter((r) => r.peldano_debil);
  if (debiles.length > 0) {
    const sinRed = debiles.filter((r) => r.sin_red);
    console.log(
      `[dom-walker] ${debiles.length} paso(s) los resolvió el PELDAÑO DÉBIL (texto visible), el último de la escalera` +
        `${sinRed.length > 0 ? ` — ${sinRed.length} SIN aserción de negocio detrás` : ''}:`,
    );
    for (const r of [...sinRed, ...debiles.filter((r2) => !r2.sin_red)]) {
      console.log(
        `  - ${r.flow}/${r.step}${r.sin_red ? ' [SIN RED]' : ''} → tocó ${r.resolved_desc ?? '(no descrito)'}`,
      );
    }
  }
  process.exit(EXIT_OK);
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '');
if (isDirectRun) {
  main().catch((err) => {
    console.error(`[dom-walker] ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT_ERROR);
  });
}

export {
  DomWalker,
  loadState,
  assertActionable,
  assistOverlayScript,
  verdictOverlayScript,
  ensureReachable,
  extractionHelpers,
  killAnimationsScript,
  settleScript,
  TESTID_ATTR_CANDIDATES,
};
export type { WalkerOptions, StyleContract };
