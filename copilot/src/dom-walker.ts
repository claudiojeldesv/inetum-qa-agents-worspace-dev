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
 *     [--cap=60] [--headed]
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
  buildLocatorCandidates,
  dedupeAndPrune,
  hashScript,
  hintLocatorPlan,
  isLandmarkRole,
  locatorSource,
  pruneAriaSnapshot,
  resolveFixtureRef,
  slugFromUrl,
  validateWalkScript,
  type LocatorAttempt,
} from './walk-core.ts';
import {
  EXIT_ERROR,
  EXIT_OK,
  EXIT_RESCUE_NEEDED,
  type DomElement,
  type DomForm,
  type DomMap,
  type DomScreen,
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
}

/** Corre DENTRO del frame. Aproximación determinística de rol + accessible name. */
function captureScript(testidAttrs: string[]): string {
  // Serializado como string para frame.evaluate — sin closures externas.
  return `(() => {
    const ATTRS = ${JSON.stringify(testidAttrs)};
    const ROLE_BY_TAG = { a: 'link', button: 'button', select: 'combobox', textarea: 'textbox', nav: 'navigation', main: 'main', header: 'banner', footer: 'contentinfo', form: 'form', dialog: 'dialog', summary: 'button' };
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
    const forms = Array.from(document.querySelectorAll('form'));
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role], nav, main, header, footer, form';
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      if (!isVisible(el)) continue;
      const role = roleOf(el);
      if (role === 'generic' || role === 'presentation' || role === 'none') continue;
      let test_id, test_attr;
      for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { test_id = v; test_attr = a; break; } }
      const landmark = ['navigation', 'banner', 'main', 'contentinfo', 'search', 'form', 'region'].includes(role);
      const item = { role, landmark };
      const nm = nameOf(el); if (nm) item.name = nm;
      if (test_id) { item.test_id = test_id; item.test_attr = test_attr; }
      const lab = labelOf(el); if (lab && lab !== nm) item.label = lab;
      if (el.disabled === true) item.disabled = true;
      const f = el.closest('form'); if (f) item.formIndex = forms.indexOf(f);
      out.push(item);
    }
    return out;
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

  constructor(opts: WalkerOptions, script: WalkScript, contract: StyleContract, state: WalkState) {
    this.opts = opts;
    this.script = script;
    this.contract = contract;
    this.priority = contract.locators?.priority ?? ['getByTestId', 'getByRole', 'getByLabel', 'getByText'];
    this.auditPath = resolve(opts.workDir, 'audit-log.json');
    this.state = state;
    this.testidAttr = opts.testidAttr ?? state.testid_attr;
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
    switch (a.kind) {
      case 'test_id': {
        const attr = this.testidAttr ?? 'data-testid';
        return scope.locator(`[${attr}="${a.value}"]`);
      }
      case 'role':
        return scope.getByRole(a.role as Parameters<Page['getByRole']>[0], a.name ? { name: a.name } : undefined);
      case 'label':
        return scope.getByLabel(a.value);
      case 'text':
        return scope.getByText(a.value);
    }
  }

  /** Locator desde string de rescate: getBy*(...) o `css=<selector>` (escape hatch del rescate). */
  private locatorFromSource(scope: Page | Frame, src: string): Locator | null {
    const css = src.match(/^css=(.+)$/);
    if (css) return scope.locator(css[1]);
    const testId = src.match(/^getByTestId\('([^']+)'\)$/);
    if (testId) return this.attemptToLocator(scope, { kind: 'test_id', value: testId[1] });
    const role = src.match(/^getByRole\('([^']+)'(?:,\s*\{\s*name:\s*'((?:[^'\\]|\\.)*)'\s*\})?\)$/);
    if (role) return this.attemptToLocator(scope, { kind: 'role', role: role[1], name: role[2]?.replace(/\\'/g, "'") });
    const label = src.match(/^getByLabel\('((?:[^'\\]|\\.)*)'\)$/);
    if (label) return this.attemptToLocator(scope, { kind: 'label', value: label[1].replace(/\\'/g, "'") });
    const text = src.match(/^getByText\('((?:[^'\\]|\\.)*)'\)$/);
    if (text) return this.attemptToLocator(scope, { kind: 'text', value: text[1].replace(/\\'/g, "'") });
    return null;
  }

  /**
   * Resuelve un hint contra page + frames en el orden del contract.
   * Devuelve el locator único visible o null (→ rescate / open_question).
   */
  private async resolveHint(step: WalkStep): Promise<{ locator: Locator; via: string; frame_path: string[] } | null> {
    const plan = hintLocatorPlan(step.hint ?? {}, this.priority);
    const scopes: Array<{ scope: Page | Frame; path: string[] }> = [{ scope: this.page, path: [] }];
    for (const f of this.page.frames()) {
      if (f === this.page.mainFrame()) continue;
      scopes.push({ scope: f, path: await framePath(f) });
    }
    for (const attempt of plan) {
      for (const { scope, path } of scopes) {
        const loc = this.attemptToLocator(scope, attempt);
        const count = await loc.count().catch(() => 0);
        if (count === 1) return { locator: loc, via: locatorSource(attempt), frame_path: path };
        if (count > 1) {
          const visible = loc.filter({ visible: true });
          const vcount = await visible.count().catch(() => 0);
          if (vcount === 1) return { locator: visible, via: locatorSource(attempt), frame_path: path };
          // ambiguo: NO adivinar con .first() — siguiente intento o rescate
        }
      }
    }
    return null;
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
    const res = JSON.parse(readFileSync(path, 'utf8')) as RescueResponse;
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

    const screen: DomScreen = {
      name,
      url_pattern: url,
      flow: flow.flow,
      elements,
      forms: [...formsAcc.values()],
      landmarks: prunedLandmarks,
      ...(truncated > 0 ? { truncated } : {}),
      ...(this.lastDialogs.length ? { dialogs: [...this.lastDialogs] } : {}),
    };
    this.lastDialogs = [];

    const existing = this.state.screens.findIndex((s) => s.name === name);
    if (existing >= 0) this.state.screens[existing] = screen;
    else this.state.screens.push(screen);

    this.state.current_screen = name;
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
    const prev = JSON.parse(readFileSync(statePath, 'utf8')) as WalkState;
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
    },
  });

  if (!values.script || !values.contract) {
    console.error('Uso: tsx copilot/src/dom-walker.ts --script=<walk-script.json> --contract=<style.yaml> [--base-url=...]');
    process.exit(EXIT_ERROR);
  }

  const rawScript = JSON.parse(readFileSync(resolve(values.script), 'utf8')) as WalkScript;
  const validation = validateWalkScript(rawScript);
  if (!validation.ok) {
    console.error('[dom-walker] walk-script inválido:');
    for (const e of validation.errors) console.error(`  - ${e}`);
    process.exit(EXIT_ERROR);
  }

  const contract = parseYaml(readFileSync(resolve(values.contract), 'utf8')) as StyleContract;
  const workDir = resolve(values['work-dir'] ?? process.env.QA_WORK_DIR ?? `.work/${rawScript.site_id}`);
  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

  const opts: WalkerOptions = {
    scriptPath: values.script,
    contractPath: values.contract,
    baseUrl: values['base-url'],
    workDir,
    rescueBudget: Number(values['rescue-budget'] ?? process.env.QA_RESCUE_BUDGET ?? 3),
    testidAttr: values['testid-attr'],
    screenCap: Number(values.cap ?? 60),
    headed: values.headed ?? false,
    storageState: values['storage-state'] ?? process.env.QA_STORAGE_STATE,
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

export { DomWalker, loadState };
export type { WalkerOptions, StyleContract };
