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
 *     [--cap=60] [--headed] [--assist] [--assist-timeout=600]
 *
 * Escalera de resolución: determinístico → normalizador (acentos) → aliases del
 * cliente → ASISTIDO (--assist, $0, capta también la coreografía) → rescate LLM
 * (presupuesto) → open_questions. Nunca adivina.
 *
 * Exit codes: 0 ok · 1 error · 42 rescate pendiente (reanudar tras rescue-response.json)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { chromium, type BrowserContext, type Frame, type Locator, type Page } from '@playwright/test';
import { appendAuditEntry } from '../../src/audit-log.ts';
import { proxyFromEnv } from '../../src/proxy-env.ts';
import {
  accentInsensitivePattern,
  aliasKey,
  buildAssistSteps,
  buildLocatorCandidates,
  dedupeAndPrune,
  hashScript,
  hintLocatorPlan,
  isLandmarkRole,
  locatorSource,
  normalizedPlan,
  parseJsonLoose,
  pruneAriaSnapshot,
  pruneAssistSequence,
  resolveFixtureRef,
  slugFromUrl,
  validateWalkScript,
  type LocatorAttempt,
} from './walk-core.ts';
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
  type HintAliasFile,
  type PickedElement,
  type RescueRequest,
  type RescueResponse,
  type WalkFlow,
  type WalkScript,
  type WalkState,
  type WalkStep,
} from './walk-types.ts';

// ------------------------------------------------------------------ config

const TESTID_ATTR_CANDIDATES = ['data-test', 'data-testid', 'data-test-id', 'data-cy', 'data-qa'];
const STEP_TIMEOUT_MS = 10_000;
const GOTO_TIMEOUT_MS = 30_000;

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
}

interface StyleContract {
  locators?: { priority?: string[] };
  synthetic_fixtures?: Record<string, unknown>;
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
}

/** Marcador del host del panel asistido: la captura lo salta (K0.10). */
const ASSIST_HOST_ATTR = 'data-qa-assist-host';

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
function extractionHelpers(testidAttrs: string[]): string {
  return `
    const ATTRS = ${JSON.stringify(testidAttrs)};
    const ASSIST_HOST = '${ASSIST_HOST_ATTR}';
    const ROLE_BY_TAG = { a: 'link', button: 'button', select: 'combobox', textarea: 'textbox', nav: 'navigation', main: 'main', header: 'banner', footer: 'contentinfo', form: 'form', dialog: 'dialog', summary: 'button', h1: 'heading', h2: 'heading', h3: 'heading' };
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
      return out;
    };
  `;
}

/** Corre DENTRO del frame. Aproximación determinística de rol + accessible name. */
function captureScript(testidAttrs: string[]): string {
  // Serializado como string para frame.evaluate — sin closures externas.
  return `(() => {
    ${extractionHelpers(testidAttrs)}
    const forms = Array.from(document.querySelectorAll('form'));
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role], nav, main, header, footer, form, h1, h2, h3';
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
      if (el.disabled === true) item.disabled = true;
      const f = el.closest('form'); if (f) item.formIndex = forms.indexOf(f);
      if (el.closest('[role=dialog], dialog[open]')) item.inDialog = true;
      out.push(item);
    }
    return out;
  })()`;
}

// -------------------------------------- overlay del modo asistido (K0.10c)

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
 */
function assistOverlayScript(testidAttrs: string[], step: WalkStep, hintText: string): string {
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
           border-radius:8px;width:330px;box-shadow:0 6px 24px rgba(0,0,0,.4);overflow:hidden}
        .h{padding:8px 10px;background:#1f2937;cursor:move;font-weight:500;display:flex;justify-content:space-between}
        .b{padding:10px}
        .ctx{color:#9ca3af;margin-bottom:8px}
        .ctx b{color:#f9fafb}
        .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
        button{font:12px system-ui;padding:5px 9px;border-radius:5px;border:1px solid #4b5563;
               background:#374151;color:#f9fafb;cursor:pointer}
        button:hover{background:#4b5563}
        .rec{background:#065f46;border-color:#047857}
        .stop{background:#7f1d1d;border-color:#991b1b}
        .drift{background:#78350f;border-color:#92400e}
        ol{margin:8px 0 0;padding-left:18px;color:#d1d5db;max-height:130px;overflow:auto}
        li{margin:2px 0}
        .st{margin-top:6px;color:#9ca3af;font-size:11px}
      </style>
      <div class="p">
        <div class="h"><span>Asistencia QA</span><span id="s">esperando</span></div>
        <div class="b">
          <div class="ctx">Paso <b>\${'${step.id}'}</b> bloqueado.<br>El FD dice: <b>\${'${hintText.replace(/'/g, '&#39;').replace(/</g, '&lt;')}'}</b></div>
          <div class="st">Pulsa Grabar, navega hasta el elemento y púlsalo. Luego Parar.</div>
          <ol id="l"></ol>
          <div class="row">
            <button id="r" class="rec">Grabar</button>
            <button id="t" class="stop" disabled>Parar</button>
            <button id="d" class="drift">No existe aquí</button>
            <button id="b">Bloquear paso</button>
          </div>
        </div>
      </div>\`;
    const $ = (id) => root.getElementById(id);
    const list = $('l'), status = $('s');
    let recording = false;
    const seq = [];
    let hoverTimer = null, hoverEl = null;

    const sameAsLast = (f) => {
      const p = seq[seq.length - 1];
      if (!p) return false;
      return p.role === f.role && (p.name || '') === (f.name || '') && (p.test_id || '') === (f.test_id || '');
    };
    const render = () => {
      list.innerHTML = seq.map((s) => '<li>' + s.via + ' ' + (s.name || s.test_id || s.role) + '</li>').join('');
      status.textContent = recording ? 'grabando (' + seq.length + ')' : 'parado';
    };
    const push = (el, via) => {
      if (!recording) return;
      if (el.closest && el.closest('[' + ASSIST_HOST + ']')) return;
      const f = fieldsOf(el);
      if (!f.role || f.role === 'generic') return;
      f.via = via;
      if (via === 'hover' && sameAsLast(f)) return;
      seq.push(f);
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

    const submit = (kind, reason) => {
      recording = false;
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mouseover', onOver, true);
      if (hoverTimer) clearTimeout(hoverTimer);
      host.remove();
      window.__qaAssistSubmit({ kind, step: '${step.id}', sequence: seq, reason });
    };
    const startRec = () => { recording = true; $('t').disabled = false; $('r').disabled = true; render(); };
    $('r').onclick = startRec;
    $('t').onclick = () => submit('recorded');
    $('d').onclick = () => submit('drift', 'el QA confirma que el elemento no existe en esta pantalla');
    $('b').onclick = () => submit('block', 'el QA decidió bloquear el paso');

    // Canal de comandos: el shadow root es CERRADO (los locators de Playwright no lo
    // atraviesan, así no interfiere con la resolución del walker), así que los botones
    // no son alcanzables desde fuera. Este evento sobre el host da la misma
    // funcionalidad de forma programática — lo usan los tests y permitiría guiar el
    // panel desde el orquestador.
    host.addEventListener('qa-assist-cmd', (ev) => {
      const cmd = ev && ev.detail;
      if (cmd === 'record') startRec();
      else if (cmd === 'stop') submit('recorded');
      else if (cmd === 'drift') submit('drift', 'comando: elemento no presente');
      else if (cmd === 'block') submit('block', 'comando: bloquear paso');
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
    document.addEventListener('mouseup', () => { drag = null; });
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

// -------------------------------------------------------------- el walker

class DomWalker {
  private readonly opts: WalkerOptions;
  private readonly script: WalkScript;
  private readonly contract: StyleContract;
  private readonly priority: string[];
  private readonly auditPath: string;
  private state: WalkState;
  private page!: Page;
  private context!: BrowserContext;
  private testidAttr: string | undefined;
  private lastDialogs: string[] = [];
  private aliases: HintAliasFile;
  private readonly aliasesPath: string;
  /** Resolver del envío del overlay (K0.10): lo rellena assistResolve por paso. */
  private assistPending: ((p: AssistSubmission) => void) | null = null;
  private assistBridgeReady = false;
  private readonly assistPatch: AssistPatch;

  constructor(opts: WalkerOptions, script: WalkScript, contract: StyleContract, state: WalkState) {
    this.opts = opts;
    this.script = script;
    this.contract = contract;
    this.priority = contract.locators?.priority ?? ['getByTestId', 'getByRole', 'getByLabel', 'getByText'];
    this.auditPath = resolve(opts.workDir, 'audit-log.json');
    this.state = state;
    this.testidAttr = opts.testidAttr ?? state.testid_attr;
    this.aliasesPath = resolve(opts.aliasesPath ?? `config/hint-aliases/${script.site_id}.json`);
    this.aliases = this.loadAliases();
    this.assistPatch = { version: 1, site_id: script.site_id, generated_at: '', entries: [] };
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
    appendAuditEntry(
      { source: 'command', action, target: 'dom-walker', reason, ...(metadata ? { metadata } : {}) },
      this.auditPath,
    );
  }

  // ------------------------------------------------------- resolución hints

  private attemptToLocator(scope: Page | Frame, a: LocatorAttempt): Locator {
    // K0.1: intento normalizado → matching por regex accent-insensitive
    const val = (v: string): string | RegExp =>
      'normalized' in a && a.normalized ? new RegExp(accentInsensitivePattern(v), 'i') : v;
    switch (a.kind) {
      case 'test_id': {
        const attr = this.testidAttr ?? 'data-testid';
        return scope.locator(`[${attr}="${a.value}"]`);
      }
      case 'role':
        return scope.getByRole(a.role as Parameters<Page['getByRole']>[0], a.name ? { name: val(a.name) } : undefined);
      case 'label':
        return scope.getByLabel(val(a.value));
      case 'text':
        return scope.getByText(val(a.value));
    }
  }

  /**
   * Locator desde string: getBy*('...') literal, getBy*(/re/i) normalizado (K0.1),
   * o `css=<selector>` (escape hatch del rescate). Grammar compartida por
   * rescates, aliases y replay.
   */
  private locatorFromSource(scope: Page | Frame, src: string): Locator | null {
    const css = src.match(/^css=(.+)$/);
    if (css) return scope.locator(css[1]);
    const testId = src.match(/^getByTestId\('([^']+)'\)$/);
    if (testId) return this.attemptToLocator(scope, { kind: 'test_id', value: testId[1] });
    const roleRe = src.match(/^getByRole\('([^']+)',\s*\{\s*name:\s*\/(.+)\/i\s*\}\)$/);
    if (roleRe) return scope.getByRole(roleRe[1] as Parameters<Page['getByRole']>[0], { name: new RegExp(roleRe[2], 'i') });
    const role = src.match(/^getByRole\('([^']+)'(?:,\s*\{\s*name:\s*'((?:[^'\\]|\\.)*)'\s*\})?\)$/);
    if (role) return this.attemptToLocator(scope, { kind: 'role', role: role[1], name: role[2]?.replace(/\\'/g, "'") });
    const labelRe = src.match(/^getByLabel\(\/(.+)\/i\)$/);
    if (labelRe) return scope.getByLabel(new RegExp(labelRe[1], 'i'));
    const label = src.match(/^getByLabel\('((?:[^'\\]|\\.)*)'\)$/);
    if (label) return this.attemptToLocator(scope, { kind: 'label', value: label[1].replace(/\\'/g, "'") });
    const textRe = src.match(/^getByText\(\/(.+)\/i\)$/);
    if (textRe) return scope.getByText(new RegExp(textRe[1], 'i'));
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

  /** Único visible o null. Nunca .first() sobre ambiguos (regla dura). */
  private async uniqueOrNull(loc: Locator): Promise<Locator | null> {
    const count = await loc.count().catch(() => 0);
    if (count === 1) return loc;
    if (count > 1) {
      const visible = loc.filter({ visible: true });
      if ((await visible.count().catch(() => 0)) === 1) return visible;
    }
    return null;
  }

  /**
   * Escalera v2 (K0.1/K0.5): aliases del cliente → plan crudo del contract →
   * plan normalizado (accent-insensitive). Devuelve el locator único visible o
   * null (→ rescate / open_question). El walker nunca decide equivalencias:
   * el alias viene de un rescate ya verificado; el normalizado es una función.
   */
  private async resolveHint(step: WalkStep): Promise<{ locator: Locator; via: string; frame_path: string[] } | null> {
    const scopes = await this.scopes();

    if (step.hint) {
      const alias = this.aliases.aliases[aliasKey(step.hint)];
      if (alias) {
        for (const { scope, path } of scopes) {
          const loc = this.locatorFromSource(scope, alias.locator);
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

    const rawPlan = hintLocatorPlan(step.hint ?? {}, this.priority);
    for (const plan of [rawPlan, normalizedPlan(rawPlan)]) {
      for (const attempt of plan) {
        for (const { scope, path } of scopes) {
          const unique = await this.uniqueOrNull(this.attemptToLocator(scope, attempt));
          if (unique) return { locator: unique, via: locatorSource(attempt), frame_path: path };
          // ambiguo o ausente: siguiente intento — jamás adivinar
        }
      }
    }
    return null;
  }

  // -------------------------------------------------- modo asistido (K0.10d)

  /** Descripción legible del hint, para que el QA sepa qué le pide el FD. */
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
    this.assistBridgeReady = true;
  }

  /** Resuelve los campos de un elemento señalado a un locator único verificado. */
  private async locatorForPicked(el: PickedElement): Promise<{ locator: Locator; source: string } | null> {
    for (const candidate of buildLocatorCandidates(el, this.priority)) {
      const loc = this.locatorFromSource(this.page, candidate);
      if (!loc) continue;
      const unique = await this.uniqueOrNull(loc);
      if (unique) return { locator: unique, source: candidate };
    }
    return null;
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
  ): Promise<{ locator: Locator; via: string; frame_path: string[] } | null> {
    await this.ensureAssistBridge();
    console.error(`[dom-walker] ASISTENCIA ${flow.flow}/${step.id}: panel abierto en el navegador, esperando al QA...`);
    this.audit('llm_call', `asistencia solicitada: ${flow.flow}/${step.id}`, { phase: 'assist', source_hint: this.hintText(step) });

    const submission = await new Promise<AssistSubmission | null>((res) => {
      const timer = setTimeout(() => {
        this.assistPending = null;
        res(null);
      }, this.opts.assistTimeoutMs);
      this.assistPending = (p) => {
        clearTimeout(timer);
        res(p);
      };
      void this.page
        .evaluate(assistOverlayScript(TESTID_ATTR_CANDIDATES, step, this.hintText(step)))
        .catch((err) => console.error(`[dom-walker] no se pudo inyectar el panel: ${String(err).split('\n')[0]}`));
    });

    if (!submission) {
      this.blockStep(flow, step, `asistencia sin respuesta en ${Math.round(this.opts.assistTimeoutMs / 1000)}s (timeout)`, false);
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
      this.blockStep(flow, step, 'asistencia: no se grabó ninguna interacción', false);
      return null;
    }

    // resolver un locator único para cada elemento de la secuencia
    const locators: string[] = [];
    let target: { locator: Locator; source: string } | null = null;
    for (let i = 0; i < sequence.length; i++) {
      const resolved = await this.locatorForPicked(sequence[i]);
      locators.push(resolved?.source ?? '');
      if (i === sequence.length - 1) target = resolved;
    }
    if (!target) {
      this.blockStep(flow, step, 'asistencia: el elemento señalado no tiene identidad única (rol/nombre/test-id ambiguos)', false);
      this.audit('block', `asistencia sin locator único en ${flow.flow}/${step.id}`, { phase: 'assist', source: 'human' });
      return null;
    }

    const steps = buildAssistSteps(sequence, locators);
    const verify = await this.verifyAssistPatch(flow, step, steps);
    this.assistPatch.entries.push({
      flow: flow.flow,
      replaces_step: step.id,
      ...(step.hint ? { original_hint: step.hint } : {}),
      steps,
      verified: verify.ok,
      ...(verify.reason ? { verify_reason: verify.reason } : {}),
    });
    this.writeAssistPatch();

    // el objetivo entra en la memoria del cliente igual que un rescate (promoción
    // condicional al cierre del flujo), pero con procedencia humana
    if (step.hint) {
      this.state.rescues.push({ flow: flow.flow, step: step.id, resolved: true, locator: target.source, audit_logged: true });
    }
    this.audit('allow', `asistencia resuelta ${flow.flow}/${step.id} → ${target.source}`, {
      phase: 'assist',
      source: 'human',
      steps: steps.length,
      patch_verified: verify.ok,
    });
    console.error(
      `[dom-walker] asistencia OK: ${steps.length} paso(s) propuestos, parche ${verify.ok ? 'VERIFICADO' : 'SIN VERIFICAR'} → assist-patch.json`,
    );
    return { locator: target.locator, via: target.source, frame_path: [] };
  }

  /**
   * Verificación por replay en contexto FRESCO: re-ejecuta el flujo desde entry
   * con el parche aplicado y comprueba que el objetivo es realmente accionable.
   * Sin esto, un parche que "funcionó porque el QA tenía el menú abierto" se
   * propondría como bueno y fallaría en el siguiente run automático.
   */
  private async verifyAssistPatch(
    flow: WalkFlow,
    failed: WalkStep,
    steps: AssistPatchStep[],
  ): Promise<{ ok: boolean; reason?: string }> {
    const browser = this.page.context().browser();
    if (!browser) return { ok: false, reason: 'sin navegador para el replay de verificación' };
    const ctx = await browser.newContext(
      this.opts.storageState && existsSync(this.opts.storageState) ? { storageState: this.opts.storageState } : {},
    );
    const page = await ctx.newPage();
    const mainPage = this.page;
    try {
      this.page = page; // executeStep opera sobre this.page
      await page.goto(this.resolveTarget(this.script.entry), { timeout: GOTO_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
      // pasos previos al fallido, tal cual estaban en el guion
      for (const s of flow.steps) {
        if (s.id === failed.id) break;
        if (this.state.open_questions.some((q) => q.flow === flow.flow && q.step === s.id)) continue;
        await this.executeStep(flow, s);
      }
      // y ahora los pasos propuestos por la asistencia
      for (const [i, ps] of steps.entries()) {
        const probe: WalkStep = { id: `${failed.id}-assist${i}`, action: ps.action, hint: ps.hint };
        const resolved = await this.resolveHint(probe);
        if (!resolved) return { ok: false, reason: `el paso propuesto ${i + 1} (${ps.action}) no resuelve en un contexto limpio` };
        if (ps.action === 'hover') await resolved.locator.hover({ timeout: STEP_TIMEOUT_MS });
        else await resolved.locator.click({ timeout: STEP_TIMEOUT_MS });
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      return { ok: false, reason: `replay falló: ${msg}` };
    } finally {
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
    const snapshot = await this.page.locator('body').ariaSnapshot({ timeout: STEP_TIMEOUT_MS }).catch(() => '');
    const req: RescueRequest = {
      version: 1,
      site_id: this.script.site_id,
      flow: flow.flow,
      step: step.id,
      action: step.action,
      hint: step.hint,
      aria_snapshot: pruneAriaSnapshot(snapshot),
      frame_path: [],
      budget_remaining: this.opts.rescueBudget - this.state.rescues_used,
      instructions:
        `Resuelve el locator Playwright del elemento que este paso necesita (action='${step.action}'). ` +
        `Responde SOLO escribiendo el archivo rescue-response.json en este mismo directorio con ` +
        `{"step":"${step.id}","locator":"getByRole('...', { name: '...' })"} — grammar permitida: ` +
        `getByTestId('x') | getByRole('r', { name: 'n' }) | getByLabel('x') | getByText('x') | css=<selector>. ` +
        `Si el elemento NO existe en el snapshot, locator=null (el paso quedará bloqueado, no lo inventes).`,
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
    const url = this.page.url();
    const name = step.screen ?? slugFromUrl(url);
    if (this.state.current_screen === name) return; // misma pantalla, sin recaptura

    const rawByFrame: Array<{ raw: RawElement[]; path: string[] }> = [];
    for (const f of this.page.frames()) {
      const path = f === this.page.mainFrame() ? [] : await framePath(f);
      const raw = (await f
        .evaluate(captureScript(TESTID_ATTR_CANDIDATES))
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
    const to = step.screen ?? slugFromUrl(this.page.url());
    const exists = this.state.transitions.some((t) => t.flow === flow.flow && t.step === step.id);
    if (from && from !== to && !exists) {
      this.state.transitions.push({ from, to, flow: flow.flow, step: step.id, via });
    }
  }

  // ------------------------------------------------------------- ejecución

  private async executeStep(flow: WalkFlow, step: WalkStep): Promise<void> {
    const stepKey = `${flow.flow}/${step.id}`;
    const fixtures = this.contract.synthetic_fixtures ?? {};

    if (step.dialog) {
      this.page.once('dialog', async (d) => {
        this.lastDialogs.push(`${d.type()}: ${d.message()}`);
        if (step.dialog === 'accept') await d.accept().catch(() => {});
        else await d.dismiss().catch(() => {});
      });
    }

    switch (step.action) {
      case 'goto': {
        await this.page.goto(this.resolveTarget(step.target!), { timeout: GOTO_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
        await this.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
        this.state.current_screen = null;
        await this.captureScreen(flow, step);
        return;
      }
      case 'capture': {
        this.state.current_screen = null;
        await this.captureScreen(flow, step);
        return;
      }
      case 'press': {
        await this.page.keyboard.press(step.value!);
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
        const value = resolveFixtureRef(step.value!, fixtures);
        const found = await this.findVisibleText(value);
        if (!found) {
          this.blockStep(flow, step, `drift: postcondición del FD no observada — texto '${value}' no visible`, false);
          this.audit('block', `expect_text fallido ${stepKey}: '${value}'`, { phase: 'expect' });
          return;
        }
        // éxito → el texto queda como business_text de la pantalla con locator verificado en vivo
        this.recordBusinessText(value, found.via, found.frame_path);
        return;
      }
      case 'expect_state': {
        const want = step.value!;
        const resolved = await this.resolveHint(step); // aliases + escalera; sin rescate para expects
        if (!resolved) {
          this.blockStep(flow, step, `drift: elemento de la postcondición no resuelto en el DOM`, false);
          this.audit('block', `expect_state fallido ${stepKey}: hint irresoluble`, { phase: 'expect' });
          return;
        }
        const ok = await this.checkState(resolved.locator, want);
        if (!ok) {
          this.blockStep(flow, step, `drift: postcondición del FD no cumplida — ${resolved.via} no está '${want}'`, false);
          this.audit('block', `expect_state fallido ${stepKey}: ${resolved.via} != ${want}`, { phase: 'expect' });
        }
        return;
      }
      default: {
        // acciones con hint: fill/click/select/check/uncheck
        // rescate ya resuelto en un run anterior (replay tras reanudación): reutilizar sin gastar presupuesto
        const prior = this.state.rescues.find(
          (r) => r.flow === flow.flow && r.step === step.id && r.resolved && r.locator,
        );
        let resolved: { locator: Locator; via: string; frame_path: string[] } | null = null;
        if (prior?.locator) {
          const loc = this.locatorFromSource(this.page, prior.locator);
          if (loc && (await loc.count().catch(() => 0)) >= 1) {
            resolved = { locator: loc.first(), via: prior.locator, frame_path: [] };
          }
        }
        if (!resolved) resolved = await this.resolveHint(step);

        if (!resolved) {
          // ¿hay respuesta de rescate esperando para este paso?
          const rescue = this.consumeRescueResponse(step);
          if (rescue) {
            if (rescue.locator === null) {
              this.blockStep(flow, step, `rescate LLM respondió locator=null: ${rescue.reason ?? 'elemento no presente en el snapshot'}`, true);
              this.state.rescues.push({ flow: flow.flow, step: step.id, resolved: false, audit_logged: true });
              this.audit('block', `rescate fallido ${stepKey}: paso a open_questions`, { phase: 'rescue-response' });
              return;
            }
            const loc = this.locatorFromSource(this.page, rescue.locator);
            const count = loc ? await loc.count().catch(() => 0) : 0;
            if (loc && count >= 1) {
              resolved = { locator: count === 1 ? loc : loc.first(), via: rescue.locator, frame_path: [] };
              this.state.rescues.push({ flow: flow.flow, step: step.id, resolved: true, locator: rescue.locator, audit_logged: true });
              this.audit('allow', `rescate resuelto ${stepKey} → ${rescue.locator}`, { phase: 'rescue-response' });
            } else {
              this.blockStep(flow, step, `el locator del rescate no resuelve en el DOM: ${rescue.locator}`, true);
              this.state.rescues.push({ flow: flow.flow, step: step.id, resolved: false, locator: rescue.locator, audit_logged: true });
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
          // K0.10: peldaño asistido ANTES del rescate LLM. Con el QA delante, resolver
          // visualmente cuesta $0 y captura además la coreografía (hover de menús).
          if (this.opts.assist) {
            resolved = await this.assistResolve(flow, step);
            if (!resolved) return; // drift, block o timeout: ya anotado
          }
        }

        if (!resolved) {
          if (this.state.rescues_used >= this.opts.rescueBudget) {
            this.blockStep(flow, step, `hint irresoluble y presupuesto de rescates agotado (${this.opts.rescueBudget})`, false);
            this.audit('block', `presupuesto de rescates agotado en ${stepKey}`, { budget: this.opts.rescueBudget });
            return;
          }
          return this.requestRescue(flow, step); // exit 42
        }

        const from = this.state.current_screen;
        const preUrl = this.page.url();
        const value = step.value !== undefined ? resolveFixtureRef(step.value, fixtures) : undefined;
        switch (step.action) {
          case 'fill':
            await resolved.locator.fill(value!, { timeout: STEP_TIMEOUT_MS });
            break;
          case 'click':
            await resolved.locator.click({ timeout: STEP_TIMEOUT_MS });
            break;
          case 'hover':
            await resolved.locator.hover({ timeout: STEP_TIMEOUT_MS });
            break;
          case 'select':
            await resolved.locator.selectOption(value!, { timeout: STEP_TIMEOUT_MS });
            break;
          case 'check':
            await resolved.locator.check({ timeout: STEP_TIMEOUT_MS });
            break;
          case 'uncheck':
            await resolved.locator.uncheck({ timeout: STEP_TIMEOUT_MS });
            break;
        }

        if (step.expect_transition) {
          // SPAs: domcontentloaded ya disparó — la señal de transición es el cambio de URL
          await this.page.waitForURL((u) => u.toString() !== preUrl, { timeout: STEP_TIMEOUT_MS }).catch(() => {});
          await this.page.waitForLoadState('domcontentloaded', { timeout: STEP_TIMEOUT_MS }).catch(() => {});
          await this.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
          this.state.current_screen = null;
          await this.captureScreen(flow, step);
          this.recordTransition(flow, step, resolved.via, from);
        }
      }
    }
  }

  /** Texto visible en page/frames: literal primero, regex normalizado después (K0.1). */
  private async findVisibleText(value: string): Promise<{ via: string; frame_path: string[] } | null> {
    const scopes = await this.scopes();
    const attempts: Array<{ needle: string | RegExp; via: string }> = [
      { needle: value, via: `getByText('${value.replace(/'/g, "\\'")}')` },
      { needle: new RegExp(accentInsensitivePattern(value), 'i'), via: `getByText(/${accentInsensitivePattern(value)}/i)` },
    ];
    for (const { needle, via } of attempts) {
      for (const { scope, path } of scopes) {
        const visible = await scope
          .getByText(needle)
          .first()
          .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
          .then(() => true)
          .catch(() => false);
        if (visible) return { via, frame_path: path };
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
  private recordBusinessText(value: string, via: string, frame_path: string[]): void {
    const screen = this.state.screens.find((s) => s.name === this.state.current_screen);
    if (!screen) return;
    screen.business_text = screen.business_text ?? [];
    if (screen.business_text.some((b) => b.name === value)) return;
    screen.business_text.push({
      role: 'text',
      name: value,
      ...(frame_path.length ? { frame_path } : {}),
      locator_candidates: [via],
    });
  }

  private blockStep(flow: WalkFlow, step: WalkStep, reason: string, rescueAttempted: boolean): void {
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
   * K0.5 — promoción CONDICIONAL de rescates a hint-aliases: solo si el paso
   * rescatado completó, su postcondición se cumplió (transición registrada si
   * expect_transition) y ningún expect_* posterior del flujo quedó en drift.
   * Un rescate que resolvió pero llevó al sitio equivocado NO contamina la
   * memoria. Aliases existentes nunca se sobrescriben (cambiarlos = PR humano).
   */
  private promoteRescues(flow: WalkFlow): void {
    const flowExpectsFailed = this.state.open_questions.some(
      (q) => q.flow === flow.flow && q.action.startsWith('expect'),
    );
    for (const rescue of this.state.rescues) {
      if (rescue.flow !== flow.flow || !rescue.resolved || !rescue.locator) continue;
      const step = flow.steps.find((s) => s.id === rescue.step);
      if (!step?.hint) continue;
      const key = aliasKey(step.hint);
      if (this.aliases.aliases[key]) continue;
      const blocked = this.state.open_questions.some((q) => q.flow === flow.flow && q.step === step.id);
      const transitionOk =
        !step.expect_transition ||
        this.state.transitions.some((t) => t.flow === flow.flow && t.step === step.id);
      if (blocked || !transitionOk || flowExpectsFailed) {
        this.audit('skip', `rescate NO promovido a alias ${flow.flow}/${step.id}: postcondición no confirmada`, {
          phase: 'alias-promotion',
          locator: rescue.locator,
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
    this.context = await browser.newContext(storageState ? { storageState } : {});
    this.page = await this.context.newPage();
    // diálogos no declarados por el paso: registrar y cerrar (determinista, no colgar)
    this.page.on('dialog', async (d) => {
      this.lastDialogs.push(`${d.type()}: ${d.message()}`);
      await d.dismiss().catch(() => {});
    });

    try {
      for (const flow of this.script.flows) {
        const keys = ['__entry', ...flow.steps.map((s) => s.id)].map((id) => `${flow.flow}/${id}`);
        // flujo 100% completado en un run anterior: se salta (sesión restaurada de walk-session.json)
        if (keys.every((k) => this.state.completed.includes(k))) continue;

        // pasos que quedaron bloqueados en un run anterior: siguen bloqueados, no se re-intentan
        const blocked = new Set(
          this.state.open_questions.filter((q) => q.flow === flow.flow).map((q) => q.step),
        );

        // cada flujo parte de entry; en reanudación los pasos ya completados se REPLAYEAN
        // (proceso de navegador nuevo → hay que reconstruir el estado in-page)
        const entryStep: WalkStep = { id: '__entry', action: 'goto', target: this.script.entry };
        await this.executeStep(flow, entryStep);
        this.markCompleted(`${flow.flow}/__entry`);
        await this.persist();

        for (const step of flow.steps) {
          if (blocked.has(step.id)) continue;
          try {
            await this.executeStep(flow, step);
          } catch (err) {
            const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
            this.blockStep(flow, step, `fallo de ejecución: ${msg}`, false);
          }
          this.markCompleted(`${flow.flow}/${step.id}`);
          await this.persist();
        }

        // flujo cerrado: los rescates con postcondición confirmada pasan a la memoria del cliente
        this.promoteRescues(flow);
      }
    } finally {
      await browser.close().catch(() => {});
    }

    const stepsTotal = this.script.flows.reduce((n, f) => n + f.steps.length, 0);
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
      },
      screens: this.state.screens,
      transitions: this.state.transitions,
      open_questions: this.state.open_questions,
      rescues: this.state.rescues,
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
  };
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
  };

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
  process.exit(EXIT_OK);
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '');
if (isDirectRun) {
  main().catch((err) => {
    console.error(`[dom-walker] ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT_ERROR);
  });
}

export { DomWalker, loadState, assistOverlayScript, extractionHelpers, TESTID_ATTR_CANDIDATES };
export type { WalkerOptions, StyleContract };
