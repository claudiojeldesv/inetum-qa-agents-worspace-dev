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
 *     [--busy-selector=<sel> ...] [--timing-profile=<file>] [--no-calibrate]
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
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { chromium, type BrowserContext, type Frame, type Locator, type Page } from '@playwright/test';
import { appendAuditEntry } from '../../src/audit-log.ts';
import { proxyFromEnv } from '../../src/proxy-env.ts';
import {
  accentInsensitivePattern,
  aliasKey,
  assistStepsToWalkSteps,
  buildAssistSteps,
  buildFallbackCandidates,
  buildLocatorCandidates,
  calibratedTimeout,
  dedupeAndPrune,
  fingerprintHash,
  hashScript,
  hintLocatorPlan,
  isLandmarkRole,
  isRetrySafe,
  locatorSource,
  mergeSettle,
  normalizedPlan,
  parseJsonLoose,
  parseLocatorChain,
  pruneAriaSnapshot,
  pruneAssistSequence,
  resolveFixtureRef,
  slugFromUrl,
  updateTimingProfile,
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
  /** Override global de settle por CLI/env (K0.13). Pisa contract y script, no el paso. */
  settleOverride?: SettleProfile;
  /** Perfil de tiempos durable. Default config/timing-profiles/<site_id>.json */
  timingProfilePath?: string;
  /** Calibrar timeouts con lo observado en runs anteriores. Off con --no-calibrate. */
  calibrate: boolean;
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

    // ---- contexto de fallback (K0.11b). Solo lo usa el modo asistido: cuando el
    // elemento NO tiene identidad semántica (input sin name/label/test-id, la norma
    // en formularios Java corporativos) esto es lo único que permite construir un
    // locator en vez de rendirse tras el trabajo del humano.
    const ANCHOR_ROLES = ['region','form','dialog','navigation','main','table','row','group','tabpanel','article'];
    const looksGenerated = (id) => !id || /^:.+:$/.test(id) || /ng-tns-|ng-reflect-|cdk-|mat-\\d/.test(id)
      || /[-_]\\d{2,}$/.test(id) || /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(id) || /^[a-z]{1,3}\\d{3,}$/i.test(id) || /^\\d/.test(id);
    /** Ancestro más cercano con rol de contenedor Y nombre accesible. */
    const anchorOf = (el) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const r = roleOf(p);
        if (ANCHOR_ROLES.includes(r)) { const n = nameOf(p); if (n) return { role: r, name: n }; }
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
 *
 * `mutating` (K0.14): el paso NO es reintentable, o sea que su acción cambia estado
 * de negocio. El panel lo dice y ofrece "Capturar sin ejecutar" como salida, porque
 * capturar el locator de un "Finalizar" no puede costar una declaración real.
 */
function assistOverlayScript(testidAttrs: string[], step: WalkStep, hintText: string, mutating = false): string {
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
        .warn{color:#fca5a5}
      </style>
      <div class="p">
        <div class="h"><span>Asistencia QA</span><span id="s">esperando</span></div>
        <div class="b">
          <div class="ctx">Paso <b>\${'${step.id}'}</b> bloqueado.<br>El FD dice: <b>\${'${hintText.replace(/'/g, '&#39;').replace(/</g, '&lt;')}'}</b></div>
          ${
            mutating
              ? `<div class="mut">Este paso CAMBIA estado de negocio (<code>${step.action}</code> sin
                 <code>retry_safe</code>). No pulses el objetivo: pasa el ratón por encima
                 (1 s) y márcalo con <b>&#9678;</b>. Para capturarlo sin dispararlo, usa
                 <b>Capturar sin ejecutar</b>.</div>`
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
    const seq = [];       // campos capturados
    const nodes = [];     // el elemento real, para resaltar desde la lista
    let hoverTimer = null, hoverEl = null;
    let hl = null;        // caja de resaltado

    const sameAsLast = (f) => {
      const p = seq[seq.length - 1];
      if (!p) return false;
      return p.role === f.role && (p.name || '') === (f.name || '') && (p.test_id || '') === (f.test_id || '');
    };
    const setStatus = (t) => { status.textContent = t; };

    const render = () => {
      list.innerHTML = '';
      seq.forEach((s, i) => {
        const li = document.createElement('li');
        if (s.as === 'target') li.className = 'tgt';
        if (s.as === 'assertion') li.className = 'asr';
        const q = s._q || {};
        const cls = !q.ok ? 'q bad' : q.fragile ? 'q warn' : 'q';
        li.innerHTML = '<span class="via">' + s.via + '</span>'
          + '<span class="nm">' + (s.name || s.test_id || s.role) + '</span>'
          + '<span class="' + cls + '" title="' + (q.why || '') + '">' + (q.label || '?') + '</span>';
        const mk = (txt, title, fn) => { const b = document.createElement('button'); b.textContent = txt; b.title = title; b.onclick = fn; return b; };
        li.appendChild(mk('◎', 'marcar como objetivo del paso', () => {
          seq.forEach((x) => { if (x.as === 'target') delete x.as; });
          s.as = 'target'; render();
        }));
        li.appendChild(mk('✓', 'marcar como comprobación (expect_text)', () => {
          s.as = s.as === 'assertion' ? undefined : 'assertion'; render();
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
      const f = fieldsWithContext(el);
      if (!f.role || f.role === 'generic') return;
      f.via = via;
      if (via === 'hover' && sameAsLast(f)) return;
      seq.push(f); nodes.push(el);
      render();
      // calidad del locator EN VIVO: el walker responde tier + fragilidad
      try {
        const { via: _v, as: _a, _q: _o, ...clean } = f;
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
      const clean = seq.map(({ _q, ...rest }) => rest);
      window.__qaAssistSubmit({ kind, step: '${step.id}', sequence: clean, target_index: targetIndex, reason, execute });
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
      const cmd = ev && ev.detail;
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
   * Si al empezar a observar no hay NADA interactivo, la quietud exige además haber
   * visto al menos una mutación. Si la página está vacía de verdad, se agota el tope
   * y se reporta — que es la respuesta correcta, no un falso "estable".
   */
  const interactivos = () =>
    document.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="link"],[role="textbox"]').length;
  /**
   * La regla SOLO aplica al documento principal. Aplicada a los frames hijos era una
   * regresión seria, y la cazó el banco corporativo: un \`<iframe hidden>\` sin
   * contenido está vacío y NUNCA muta, así que no alcanzaba la quietud jamás, agotaba
   * el tope, y como el agregado hace some(timed_out) envenenaba los 30 pasos del
   * flujo (10 minutos de run y todo en settle_timeout). "La app no ha montado" es una
   * preocupación del top, no de un iframe oculto que legítimamente no tiene nada.
   */
  const esPrincipal = window.top === window;
  const habiaContenido = interactivos() > 0;
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
  private readonly auditPath: string;
  private state: WalkState;
  private page!: Page;
  private context!: BrowserContext;
  private testidAttr: string | undefined;
  private lastDialogs: string[] = [];
  /** Paso en curso (Fase 2): el handler de estorbos lo usa para auditar "selector + paso". */
  private currentStepKey: string | null = null;
  private aliases: HintAliasFile;
  private readonly aliasesPath: string;
  /** Resolver del envío del overlay (K0.10): lo rellena assistResolve por paso. */
  private assistPending: ((p: AssistSubmission) => void) | null = null;
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
   */
  private settleProfileFor(flow: WalkFlow, step: WalkStep): Required<SettleProfile> {
    const profile = mergeSettle(this.contract.settle, this.script.settle, this.opts.settleOverride, step.settle);
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
    const reports = (this.state.step_reports ??= []);
    const at = reports.findIndex((x) => x.flow === flow.flow && x.step === step.id);
    const report: StepReport = { flow: flow.flow, step: step.id, action: step.action, ...r };
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
    appendAuditEntry(
      { source: 'command', action, target: 'dom-walker', reason, ...(metadata ? { metadata } : {}) },
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
  private async installObstructionHandlers(): Promise<void> {
    const selectors = this.contract.obstructions?.dismiss ?? [];
    for (const selector of selectors) {
      const obstruction = this.page.locator(selector);
      await this.page.addLocatorHandler(obstruction, async (locator) => {
        const stepKey = this.currentStepKey ?? '(fuera de un paso)';
        this.audit('skip', `estorbo descartado en ${stepKey}: ${selector}`, {
          phase: 'obstruction-dismiss',
          selector,
          step: stepKey,
        });
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
      });
    }
  }

  // ------------------------------------------------------- resolución hints

  private attemptToLocator(scope: Page | Frame | Locator, a: LocatorAttempt): Locator {
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
   * Fase 1 (SPEC-caos-corporativo §4) — `select` inteligente. `selectOption()` a
   * ciegas revienta contra cualquier desplegable que no sea un `<select>` real
   * (Angular Material, PrimeFaces): la clase "selectOption lanzó sobre un div" que
   * bloqueaba onesait. El driver ramifica por tagName REAL del disparador, no por
   * vocabulario del guion — `select` sigue siendo hint + value, sin campo nuevo.
   */
  private async selectSmart(trigger: Locator, value: string): Promise<void> {
    const tag = await trigger.evaluate((el) => el.tagName).catch(() => '');
    if (tag === 'SELECT') {
      await trigger.selectOption(value, { timeout: STEP_TIMEOUT_MS });
      return;
    }
    // Widget no nativo: abrir y resolver el panel a nivel de PÁGINA ENTERA (§3 del
    // spec) — el panel de un CDK OverlayContainer o de un `…_panel` de PrimeFaces
    // cuelga de document.body, no del disparador, y `resolveScope`/`scopes()` ya
    // buscan así.
    await trigger.click({ timeout: STEP_TIMEOUT_MS });
    const listbox = await this.waitForVisibleListbox(STEP_TIMEOUT_MS);
    if (!listbox) {
      throw new Error(
        'el disparador no es un <select> y no se encontró un único role="listbox" visible tras abrirlo',
      );
    }
    const literal = listbox.getByRole('option', { name: value });
    const normalized = listbox.getByRole('option', { name: new RegExp(accentInsensitivePattern(value), 'i') });
    const option = (await this.uniqueOrNull(literal)) ?? (await this.uniqueOrNull(normalized));
    if (!option) {
      throw new Error(`la opción '${value}' no resuelve única dentro del listbox abierto (ambigua o ausente) — nunca se adivina`);
    }
    await option.click({ timeout: STEP_TIMEOUT_MS });
  }

  /**
   * Espera a que un único `role="listbox"` esté visible en page o en algún frame
   * (mismo alcance página-entera que `resolveScope`, K0.16 §3). Es el oráculo que
   * abre paso a resolver la opción: si nunca se materializa, o si hay dos a la vez,
   * no se adivina — se agota el tope y sube por la escalera (asistencia / rescate).
   */
  private async waitForVisibleListbox(timeoutMs: number): Promise<Locator | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const scopes = await this.scopes();
      for (const { scope } of scopes) {
        const unique = await this.uniqueOrNull(scope.getByRole('listbox'));
        if (unique) return unique;
      }
      if (Date.now() >= deadline) return null;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /**
   * Escalera v2 (K0.1/K0.5): aliases del cliente → plan crudo del contract →
   * plan normalizado (accent-insensitive). Devuelve el locator único visible o
   * null (→ rescate / open_question). El walker nunca decide equivalencias:
   * el alias viene de un rescate ya verificado; el normalizado es una función.
   */
  private async resolveHint(step: WalkStep): Promise<{ locator: Locator; via: string; frame_path: string[] } | null> {
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

    const rawPlan = hintLocatorPlan(step.hint ?? {}, this.priority);
    for (const plan of [rawPlan, normalizedPlan(rawPlan)]) {
      for (const attempt of plan) {
        for (const { scope, path, via } of containers) {
          const unique = await this.uniqueOrNull(this.attemptToLocator(scope, attempt));
          if (unique) {
            const source = via ? `${via} >> ${locatorSource(attempt)}` : locatorSource(attempt);
            return { locator: unique, via: source, frame_path: path };
          }
          // ambiguo o ausente: siguiente intento — jamás adivinar
        }
      }
    }
    return null;
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
    for (const candidate of buildFallbackCandidates(el, this.priority)) {
      const loc = this.locatorFromChain(this.page, candidate.source);
      if (!loc) continue;
      const unique = await this.uniqueOrNull(loc).catch(() => null);
      if (unique) return { locator: unique, candidate };
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
    contextReason?: string,
  ): Promise<{ locator: Locator; via: string; frame_path: string[] } | null> {
    await this.ensureAssistBridge();
    this.assistOpenUrl = this.page.url();
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
        .evaluate(
          assistOverlayScript(TESTID_ATTR_CANDIDATES, step, contextReason ?? this.hintText(step), !isRetrySafe(step)),
        )
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

    let verify = await this.verifyAssistPatch(flow, step, steps);
    // minimización por replay (K0.11e): quitar abridores de uno en uno mientras siga
    // verificando. El QA exploró antes de dar con el camino; no tiene por qué saber
    // cuáles de sus pasos eran necesarios — se PRUEBA, no se pregunta.
    if (verify.ok && this.opts.assistMinimize) {
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
    // condicional al cierre del flujo), pero con procedencia humana
    if (step.hint) {
      this.state.rescues.push({ flow: flow.flow, step: step.id, resolved: true, locator: target.candidate.source, audit_logged: true });
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
    return { locator: target.locator, via: target.candidate.source, frame_path: [] };
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
        const found = await this.findVisibleText(value);
        const report = { action_ms: Date.now() - startedAt, settle: obs, retried: false };
        if (!found) {
          const suffix = obs.timed_out
            ? ` (la pantalla NO se estabilizó en ${settle.timeout_ms} ms, ${obs.busy_cycles} ciclos de ocupado: el hallazgo puede ser de sincronización)`
            : '';
          this.blockStep(flow, step, `drift: postcondición del FD no observada — texto '${value}' no visible${suffix}`, false);
          this.audit('block', `expect_text fallido ${stepKey}: '${value}'`, { phase: 'expect', settle: obs });
          this.pushReport(flow, step, { ...report, outcome: 'postcondition_unmet' });
          return;
        }
        // éxito → el texto queda como business_text de la pantalla con locator verificado en vivo
        this.recordBusinessText(value, found.via, found.frame_path);
        this.pushReport(flow, step, { ...report, outcome: obs.timed_out ? 'settle_timeout' : 'ok' });
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
        this.pushReport(flow, step, { ...report, outcome: ok ? (obs.timed_out ? 'settle_timeout' : 'ok') : 'postcondition_unmet' });
        return;
      }
      default: {
        // acciones con hint: fill/click/select/check/uncheck
        // rescate ya resuelto en un run anterior (replay tras reanudación): reutilizar sin gastar presupuesto
        const prior = this.state.rescues.find(
          (r) => r.flow === flow.flow && r.step === step.id && r.resolved && r.locator,
        );
        let resolved: { locator: Locator; via: string; frame_path: string[] } | null = null; // reasignable: la asistencia puede sustituirlo (K0.11d)
        if (prior?.locator) {
          const loc = this.locatorFromChain(this.page, prior.locator);
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
            const loc = this.locatorFromChain(this.page, rescue.locator);
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
              this.blockStep(
                flow,
                step,
                `el parche se verificó pero no se pudo actuar sobre la pantalla actual: ${reach.reason}. ` +
                  `El parche ES válido y está en assist-patch.json — fúndelo en el guion y relanza.`,
                false,
              );
              this.audit('block', `objetivo asistido inalcanzable ${stepKey}: ${reach.reason}`, {
                phase: 'assist-postaction',
                matched: assisted.via,
              });
              this.pushReport(flow, step, { outcome: 'action_failed', action_ms: Date.now() - startedAt, retried: false });
              return;
            }
            resolved = assisted;
          }
        }

        if (!resolved) {
          if (this.state.rescues_used >= this.opts.rescueBudget) {
            const nota = await this.emptyScreenNote();
            this.blockStep(flow, step, `hint irresoluble y presupuesto de rescates agotado (${this.opts.rescueBudget})${nota}`, false);
            this.audit('block', `presupuesto de rescates agotado en ${stepKey}`, { budget: this.opts.rescueBudget });
            return;
          }
          return this.requestRescue(flow, step); // exit 42
        }

        const from = this.state.current_screen;
        const preUrl = this.page.url();
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
            const msg = actionFailureDetail(err);
            const detail = `la acción '${step.action}' falló sobre ${resolved.via}: ${msg}`;
            if (this.opts.assist) {
              this.audit('block', `action_failed en ${flow.flow}/${step.id}: ${detail}`, {
                phase: 'assist-trigger',
                matched: resolved.via,
              });
              const assisted = await this.assistResolve(flow, step, detail);
              if (!assisted) {
                this.pushReport(flow, step, { outcome: 'action_failed', action_ms: Date.now() - startedAt, settle: obs, retried });
                return; // drift/block/timeout/captura-sin-ejecutar: ya anotado
              }
              /**
               * K0.15 — el estado en el que el QA señaló el elemento NO se da por
               * bueno: se comprueba y, si hace falta, se recupera re-ejecutando los
               * abridores del camino que él acaba de grabar.
               */
              const reach = await this.ensureAssistedTargetReachable(flow, step, assisted);
              if (!reach.ok) {
                this.blockStep(
                  flow,
                  step,
                  `el parche se verificó pero no se pudo actuar sobre la pantalla actual: ${reach.reason}. ` +
                    `El parche ES válido y está en assist-patch.json — fúndelo en el guion y relanza.`,
                  false,
                );
                this.audit('block', `objetivo asistido inalcanzable ${stepKey}: ${reach.reason}`, {
                  phase: 'assist-postaction',
                  matched: assisted.via,
                });
                this.pushReport(flow, step, { outcome: 'action_failed', action_ms: Date.now() - startedAt, settle: obs, retried });
                return;
              }
              /**
               * K0.14 — envuelta porque un fallo aquí NO es un fallo de locator: el
               * parche acaba de verificarse. Sin envolver subía al catch genérico del
               * bucle como "fallo de ejecución: Timeout" justo después de que el panel
               * dijera "Parche verificado" — el diagnóstico más desconcertante posible.
               */
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
                this.pushReport(flow, step, { outcome: 'action_failed', action_ms: Date.now() - startedAt, settle: obs, retried });
                return;
              }
              resolved = assisted;
            } else {
              this.blockStep(flow, step, detail, false);
              this.pushReport(flow, step, { outcome: 'action_failed', action_ms: Date.now() - startedAt, settle: obs, retried });
              return;
            }
          }

          if (step.expect_transition) {
            // SPAs: domcontentloaded ya disparó — la señal de transición es el cambio de URL.
            // El settle va DESPUÉS de las esperas de navegación y solo una vez: la pantalla
            // que interesa estabilizar es la nueva, y estabilizar la vieja de paso solo
            // añade la ventana de quietud a cada transición sin comprar nada.
            await this.page.waitForURL((u) => u.toString() !== preUrl, { timeout: STEP_TIMEOUT_MS }).catch(() => {});
            await this.page.waitForLoadState('domcontentloaded', { timeout: STEP_TIMEOUT_MS }).catch(() => {});
            // networkidle fuera por lo mismo que en 'goto': retrasa el inicio de la
            // observación, que es justo lo que no podemos permitirnos.
            obs = await this.waitForSettle(settle);
            this.state.current_screen = null;
            await this.captureScreen(flow, step);
            this.recordTransition(flow, step, resolved.via, from);
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
  private async findVisibleText(
    value: string,
    timeoutMs = STEP_TIMEOUT_MS,
  ): Promise<{ via: string; frame_path: string[] } | null> {
    const scopes = await this.scopes();
    const attempts: Array<{ needle: string | RegExp; via: string }> = [
      { needle: value, via: `getByText('${value.replace(/'/g, "\\'")}')` },
      { needle: new RegExp(accentInsensitivePattern(value), 'i'), via: `getByText(/${accentInsensitivePattern(value)}/i)` },
    ];
    for (const { needle, via } of attempts) {
      for (const { scope, path } of scopes) {
        /**
         * `.filter({ visible: true })` antes del `.first()` — K0.16, encontrado por el
         * banco corporativo: el texto de negocio "Rehusada" existe TAMBIÉN como
         * `<option>` del filtro de estado, y esa opción va antes en el DOM. Con
         * `.first()` a secas se elegía la opción (invisible por estar el select
         * cerrado) y se esperaba en vano a que se hiciera visible: la postcondición
         * salía incumplida teniendo el resultado delante. Clase real, no de fixture:
         * en un formulario de consulta el valor y su filtro comparten literal.
         */
        const visible = await scope
          .getByText(needle)
          .filter({ visible: true })
          .first()
          .waitFor({ state: 'visible', timeout: timeoutMs })
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
      const key = aliasKey(step.hint, step.scope);
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
    // Fase 3 (SPEC-caos-corporativo §4) — matar animaciones. Knob del CONTRACT (no
    // del paso: se decide una vez, al abrir el contexto), default ON en funcional.
    // contract+script son las únicas capas que existen antes de tener flow/step.
    const animProfile = mergeSettle(this.contract.settle, this.script.settle, this.opts.settleOverride);
    this.context = await browser.newContext({
      ...(storageState ? { storageState } : {}),
      ...(animProfile.disable_animations ? { reducedMotion: 'reduce' as const } : {}),
    });
    if (animProfile.disable_animations) {
      // string, no referencia de función — mismo motivo que settleScript: esbuild
      // (tsx en producción) envuelve funciones con __name, inexistente en la
      // página, y el transform de vitest no lo reproduce (ver K0.13).
      await this.context.addInitScript(killAnimationsScript());
    }
    this.page = await this.context.newPage();
    // Fase 2: opt-in por client pack, sin efecto si el contract no declara nada
    await this.installObstructionHandlers();
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
          // K0.14: el QA capturó sin ejecutar → el estado ya no corresponde al guion
          if (this.flowAborted) {
            console.error(`[dom-walker] flujo '${flow.flow}' detenido tras ${step.id} (captura sin ejecución)`);
            break;
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
      'quiet-ms': { type: 'string' },
      'settle-timeout': { type: 'string' },
      'max-mutations': { type: 'string' },
      'busy-selector': { type: 'string', multiple: true },
      'timing-profile': { type: 'string' },
      'no-calibrate': { type: 'boolean', default: false },
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
    settleOverride: settleFromCli(values),
    timingProfilePath: values['timing-profile'] ?? process.env.QA_TIMING_PROFILE,
    calibrate: !(values['no-calibrate'] ?? false),
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
  ensureReachable,
  extractionHelpers,
  killAnimationsScript,
  settleScript,
  TESTID_ATTR_CANDIDATES,
};
export type { WalkerOptions, StyleContract };
