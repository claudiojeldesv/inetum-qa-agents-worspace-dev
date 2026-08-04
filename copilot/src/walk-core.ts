/**
 * Núcleo puro del dom-walker: sin Playwright, sin I/O. Todo lo de aquí es
 * determinístico y unit-testeable. El driver (dom-walker.ts) solo orquesta.
 */

import { createHash } from 'node:crypto';
import type {
  AssistPatchStep,
  DomElement,
  LocatorCandidate,
  PickedElement,
  StepHint,
  WalkAction,
  WalkScript,
  WalkStep,
} from './walk-types.ts';

// ---------------------------------------------------------------- fixtures

/**
 * Resuelve refs '$fixtures.<path>' contra el bloque synthetic_fixtures del
 * style contract. Path admite puntos e índices: credentials[0].username.
 * Valor sin prefijo $fixtures → literal (datos sintéticos declarados inline).
 * Ref irresoluble → error (nunca inventar datos).
 */
export function resolveFixtureRef(value: string, fixtures: Record<string, unknown>): string {
  if (!value.startsWith('$fixtures.')) return value;
  const path = value.slice('$fixtures.'.length);
  const segments = path.split('.').flatMap((seg) => {
    const parts: Array<string | number> = [];
    const re = /([^[\]]+)|\[(\d+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg)) !== null) {
      if (m[1] !== undefined) parts.push(m[1]);
      else parts.push(Number(m[2]));
    }
    return parts;
  });
  let cursor: unknown = fixtures;
  for (const s of segments) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') cursor = undefined;
    else cursor = (cursor as Record<string | number, unknown>)[s];
  }
  if (cursor === undefined || cursor === null || typeof cursor === 'object') {
    throw new Error(`Fixture ref irresoluble: '${value}' (synthetic_fixtures del contract no la contiene)`);
  }
  return String(cursor);
}

// -------------------------------------------------------------- JSON de I/O

/**
 * JSON.parse tolerante al BOM. Los contratos de entrada del walker
 * (`walk-script.json`, `rescue-response.json`, `hint-aliases.json`) los escriben
 * SUBAGENTES en Windows, y varios caminos habituales emiten BOM
 * (`Set-Content -Encoding utf8` de PowerShell 5.1, `Out-File`, editores).
 * `JSON.parse` muere con `Unexpected token BOM` y el fallo se disfrazaba de
 * "fallo de ejecución" en `open_questions` — diagnóstico opaco sobre una causa
 * trivial. Medido en el workspace de prueba de K0.
 */
export function parseJsonLoose<T = unknown>(text: string): T {
  // trimStart() basta: U+FEFF es WhiteSpace en ECMAScript, así que se va con él
  // (y el espacio en blanco al principio de un JSON es irrelevante).
  return JSON.parse(text.trimStart()) as T;
}

// ------------------------------------------------------------ normalizador

/**
 * Normalización determinística para comparar textos FD↔DOM (K0.1): acentos
 * fuera (NFD + strip de combinantes), lowercase, espacios plegados. Mata la
 * clase GESTIÓN-con-tilde sin tokens. NO se aplica a test_ids (atributos exactos).
 */
export function normalizeText(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      // Espacios alrededor de la puntuación (K0.12): el FD escribe
      // "Rescates/Reinversión" y el menú de la app muestra
      // "RESCATES / REINVERSIÓN". Colapsar espacios repetidos no bastaba —
      // aquí los espacios están AÑADIDOS, no duplicados. Patrón corporativo
      // habitual en etiquetas con separador.
      .replace(/\s*([/\-|·,;:])\s*/g, '$1')
      .trim()
  );
}

/** Puntuación que en las etiquetas aparece con o sin espacios alrededor. */
const SPACED_PUNCT = new Set(['/', '-', '|', '·', ',', ';', ':']);

/** Variantes con/sin diacrítico por letra base — cubre es/pt/fr/ca corporativo. */
const ACCENT_CLASS: Record<string, string> = {
  a: '[aáàäâã]', e: '[eéèëê]', i: '[iíìïî]', o: '[oóòöôõ]', u: '[uúùüû]',
  n: '[nñ]', c: '[cç]', y: '[yý]',
};

/**
 * Patrón regex accent-insensitive desde un texto ya normalizado: cada letra
 * base acepta sus variantes acentuadas, espacios = \s+. Con flag 'i' matchea
 * "GESTIÓN" desde el hint "gestion" y viceversa. Determinístico y testeable.
 */
export function accentInsensitivePattern(text: string): string {
  const normalized = normalizeText(text);
  let out = '';
  for (const ch of normalized) {
    if (ACCENT_CLASS[ch]) out += ACCENT_CLASS[ch];
    else if (ch === ' ') out += '\\s+';
    else if (SPACED_PUNCT.has(ch)) {
      // el separador puede venir pegado o con espacios: "a/b" ≡ "a / b"
      out += `\\s*${ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`;
    } else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return out;
}

// ---------------------------------------------------------- locator plans

export type LocatorAttempt =
  | { kind: 'test_id'; value: string }
  | { kind: 'role'; role: string; name?: string; normalized?: boolean }
  | { kind: 'label'; value: string; normalized?: boolean }
  | { kind: 'text'; value: string; normalized?: boolean };

const PRIORITY_TO_KIND: Record<string, LocatorAttempt['kind']> = {
  getByTestId: 'test_id',
  getByRole: 'role',
  getByLabel: 'label',
  getByText: 'text',
};

/**
 * Plan de intentos de resolución de un hint, en el ORDEN del locators.priority
 * del contract. Solo se emiten intentos para los que el hint aporta datos.
 */
export function hintLocatorPlan(hint: StepHint, priority: string[]): LocatorAttempt[] {
  const attempts: LocatorAttempt[] = [];
  for (const p of priority) {
    const kind = PRIORITY_TO_KIND[p];
    if (!kind) continue; // entradas desconocidas del contract se ignoran aquí; el validador del contract ya avisa
    if (kind === 'test_id' && hint.test_id) attempts.push({ kind, value: hint.test_id });
    if (kind === 'role' && hint.role) attempts.push({ kind, role: hint.role, name: hint.name });
    if (kind === 'label' && hint.label) attempts.push({ kind, value: hint.label });
    if (kind === 'text' && (hint.text ?? hint.name)) attempts.push({ kind, value: (hint.text ?? hint.name) as string });
  }
  return attempts;
}

/**
 * Segunda pasada de la escalera (K0.1): mismo plan con matching normalizado
 * (regex accent-insensitive). test_id queda fuera — es atributo exacto.
 */
export function normalizedPlan(attempts: LocatorAttempt[]): LocatorAttempt[] {
  const out: LocatorAttempt[] = [];
  for (const a of attempts) {
    if (a.kind === 'test_id') continue;
    if (a.kind === 'role' && !a.name) continue; // sin name no hay texto que normalizar
    out.push({ ...a, normalized: true });
  }
  return out;
}

/** Representación textual de un intento (para dom-map, transitions y audit). */
export function locatorSource(a: LocatorAttempt): string {
  const norm = (v: string) => `/${accentInsensitivePattern(v)}/i`;
  switch (a.kind) {
    case 'test_id':
      return `getByTestId('${a.value}')`;
    case 'role':
      if (a.normalized && a.name) return `getByRole('${a.role}', { name: ${norm(a.name)} })`;
      return a.name
        ? `getByRole('${a.role}', { name: '${a.name.replace(/'/g, "\\'")}' })`
        : `getByRole('${a.role}')`;
    case 'label':
      if (a.normalized) return `getByLabel(${norm(a.value)})`;
      return `getByLabel('${a.value.replace(/'/g, "\\'")}')`;
    case 'text':
      if (a.normalized) return `getByText(${norm(a.value)})`;
      return `getByText('${a.value.replace(/'/g, "\\'")}')`;
  }
}

/** Locators candidatos de un elemento capturado, ordenados por el priority del contract. */
export function buildLocatorCandidates(
  el: Pick<DomElement, 'role' | 'name' | 'test_id' | 'label'>,
  priority: string[],
): string[] {
  const out: string[] = [];
  for (const p of priority) {
    switch (PRIORITY_TO_KIND[p]) {
      case 'test_id':
        if (el.test_id) out.push(locatorSource({ kind: 'test_id', value: el.test_id }));
        break;
      case 'role':
        if (el.role && el.name) out.push(locatorSource({ kind: 'role', role: el.role, name: el.name }));
        break;
      case 'label':
        if (el.label) out.push(locatorSource({ kind: 'label', value: el.label }));
        break;
      case 'text':
        if (el.name && !el.test_id) out.push(locatorSource({ kind: 'text', value: el.name }));
        break;
    }
  }
  return out;
}

// ------------------------------------------------------------- poda/dedupe

const LANDMARK_ROLES = new Set(['navigation', 'banner', 'main', 'contentinfo', 'search', 'form', 'region']);

export function isLandmarkRole(role: string): boolean {
  return LANDMARK_ROLES.has(role);
}

function dedupeKey(el: DomElement): string {
  return [
    (el.frame_path ?? []).join('>'),
    el.role,
    el.test_id ?? '',
    el.name ?? '',
    el.label ?? '',
  ].join('|');
}

function elementSortKey(el: DomElement): string {
  // test_id primero (locator más fuerte), luego rol y nombre — orden estable entre runs
  return [el.test_id ? 0 : 1, (el.frame_path ?? []).join('>'), el.role, el.test_id ?? '', el.name ?? ''].join('|');
}

/**
 * Poda determinística del dom-map (requisito duro H1-b):
 *  - dedupe de componentes repetidos (mismo rol+nombre+test_id+frame) con `count`;
 *  - orden estable (dos runs = mismo output);
 *  - cap por pantalla con `truncated` explícito (no silent caps).
 */
export function dedupeAndPrune(
  elements: DomElement[],
  cap: number,
): { elements: DomElement[]; truncated: number } {
  const byKey = new Map<string, DomElement>();
  for (const el of elements) {
    const key = dedupeKey(el);
    const existing = byKey.get(key);
    if (existing) existing.count = (existing.count ?? 1) + 1;
    else byKey.set(key, { ...el, count: 1 });
  }
  const deduped = [...byKey.values()].sort((a, b) =>
    elementSortKey(a) < elementSortKey(b) ? -1 : elementSortKey(a) > elementSortKey(b) ? 1 : 0,
  );
  // count=1 es ruido: solo se conserva cuando hay repetición real
  for (const el of deduped) if (el.count === 1) delete el.count;
  const kept = deduped.slice(0, cap);
  return { elements: kept, truncated: deduped.length - kept.length };
}

// ---------------------------------------------------------------- naming

/** Nombre de pantalla desde la URL cuando el paso no declara `screen:`. */
const GENERIC_SEGMENTS = new Set(['index', 'view', 'default', 'main']);

export function slugFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const clean = (s: string) =>
      s
        .replace(/\.[a-z0-9]+$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const segments = u.pathname.split('/').filter(Boolean).map(clean).filter(Boolean);
    // segmentos genéricos ('/dashboard/index' → 'dashboard') no nombran pantallas
    while (segments.length > 1 && GENERIC_SEGMENTS.has(segments[segments.length - 1])) segments.pop();
    return segments.pop() || 'home';
  } catch {
    return 'home';
  }
}

// ------------------------------- escalera de fallback de locators (K0.11a)

/** Separador de cadena de locators. `A >> B` = B buscado DENTRO de A. */
export const CHAIN_SEP = ' >> ';

/**
 * ¿El `id` del DOM parece generado por el framework? Los ids autogenerados rotan
 * entre despliegues y son la trampa clásica del locator que funciona hoy y muere
 * mañana. Se descartan como locator: Angular (`ng-tns-c12-4`), React 18
 * (`:r3:`, `:R2ab:`), secuenciales (`input-347`, `field_12`), GUIDs.
 */
export function looksGeneratedId(id: string): boolean {
  if (!id) return true;
  return (
    /^:.+:$/.test(id) ||                            // React useId — :r3:, :R2ab:
    /^(mat|cdk|ng)[-_]/i.test(id) ||                // Angular Material / CDK — mat-input-3
    /ng-tns-|ng-reflect-/.test(id) ||               // Angular internals en cualquier posición
    /[-_]\d{2,}$/.test(id) ||                       // sufijo numérico largo — field_12, input-347
    /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(id) ||         // GUID
    /^[a-z]{1,4}([-_][a-z]{1,4})?\d{2,}$/i.test(id) || // JSF/JSP — j_id123, jid45, u1234
    /^\d/.test(id)                                  // empieza por dígito (ni siquiera es CSS-válido)
  );
}

/**
 * Escalera COMPLETA de candidatos para un elemento señalado por el QA.
 *
 * Motivación (K0.11a): el generador de Playwright produce un locator casi siempre
 * (usa scoping, filter y nth); el nuestro solo miraba identidad semántica y se
 * rendía. Ese fue el fallo real de onesait s7 — un input sin name, sin label y sin
 * test-id, que el QA había señalado con el dedo. Rendirse DESPUÉS de que el humano
 * hizo el trabajo es lo peor de los dos mundos.
 *
 * Orden: semantic → scoped → anchored → indexed → css. Todo lo que no es semantic
 * se marca `fragile` y la marca viaja al parche y al panel.
 */
export function buildFallbackCandidates(
  el: PickedElement,
  priority: string[],
): LocatorCandidate[] {
  const out: LocatorCandidate[] = [];
  const q = (s: string): string => s.replace(/'/g, "\\'");

  // 1. semantic — la escalera de siempre, del contract
  for (const source of buildLocatorCandidates(el, priority)) {
    out.push({ source, tier: 'semantic', fragile: false });
  }

  const anchorSrc = el.anchor
    ? `getByRole('${el.anchor.role}', { name: '${q(el.anchor.name)}' })`
    : null;

  // 2. scoped — dentro de un ancestro con identidad. Estable mientras la región
  //    conserve su nombre accesible, que es mucho más que un nth suelto.
  if (anchorSrc) {
    if (el.name) {
      out.push({
        source: `${anchorSrc}${CHAIN_SEP}getByRole('${el.role}', { name: '${q(el.name)}' })`,
        tier: 'scoped',
        fragile: false,
      });
    }
    if (el.label) {
      out.push({ source: `${anchorSrc}${CHAIN_SEP}getByLabel('${q(el.label)}')`, tier: 'scoped', fragile: false });
    }
  }

  // 3. anchored — patrón label-en-celda: se estrecha a la FILA (o al item de lista)
  //    que contiene el texto de la etiqueta, y dentro se busca el control. Filtrar
  //    el formulario entero por ese texto NO estrecha nada: el formulario contiene
  //    todas las etiquetas y devuelve todos sus campos (medido contra DOM real).
  if (el.nearby_text) {
    const prefix = anchorSrc ? `${anchorSrc}${CHAIN_SEP}` : '';
    for (const container of ['row', 'listitem', 'group']) {
      out.push({
        source: `${prefix}getByRole('${container}').filter({ hasText: '${q(el.nearby_text)}' })${CHAIN_SEP}getByRole('${el.role}')`,
        tier: 'anchored',
        fragile: false,
        why: `anclado a la etiqueta vecina "${el.nearby_text}" dentro de su ${container}`,
      });
    }
  }

  // 4. css — solo con id que NO parezca generado
  if (el.dom_id && el.id_stable) {
    out.push({ source: `css=#${el.dom_id}`, tier: 'css', fragile: false, why: 'id de aspecto estable' });
  }

  // 5. indexed — último recurso. Funciona hoy y se rompe al insertar una fila.
  if (typeof el.nth_of_role === 'number') {
    const scope = anchorSrc ? `${anchorSrc}${CHAIN_SEP}` : '';
    out.push({
      source: `${scope}getByRole('${el.role}').nth(${el.nth_of_role})`,
      tier: 'indexed',
      fragile: true,
      why: 'posicional: se rompe si cambia el orden o se añaden elementos',
    });
  }

  return out;
}

/**
 * Parte una cadena `A >> B >> C` en segmentos, extrayendo el sufijo `.nth(N)` de
 * cada uno. El driver resuelve segmento a segmento anidando scopes.
 */
export function parseLocatorChain(src: string): Array<{ segment: string; nth?: number }> {
  return src.split(CHAIN_SEP).map((raw) => {
    const m = raw.match(/^(.*)\.nth\((\d+)\)$/);
    return m ? { segment: m[1], nth: Number(m[2]) } : { segment: raw };
  });
}

// -------------------------------------------------- modo asistido (K0.10)

/**
 * Secuencia grabada por el QA → pasos de walk. Convención: el ÚLTIMO click es el
 * objetivo del paso bloqueado; todo lo anterior es el camino que hubo que recorrer
 * para que fuera alcanzable (abridores de menú). Un `via: 'hover'` se materializa
 * como acción `hover`, que es justo lo que el recorder de Playwright no sabe grabar.
 *
 * Pura y testeable: no toca navegador. El locator de cada paso lo resuelve el
 * driver (buildLocatorCandidates + verificación de unicidad) y se inyecta aquí.
 */
export function buildAssistSteps(
  sequence: PickedElement[],
  candidates: Array<LocatorCandidate | null>,
  opts: { targetIndex?: number; targetAction?: WalkAction } = {},
): AssistPatchStep[] {
  if (sequence.length === 0) return [];
  // objetivo: el que el QA marcó explícitamente en el panel; si no, el último click
  const explicit = sequence.findIndex((el) => el.as === 'target');
  const lastClickIdx = sequence.reduce((acc, el, i) => (el.via === 'click' ? i : acc), -1);
  const targetIdx =
    opts.targetIndex !== undefined && opts.targetIndex >= 0
      ? opts.targetIndex
      : explicit >= 0
        ? explicit
        : lastClickIdx >= 0
          ? lastClickIdx
          : sequence.length - 1;

  const steps: AssistPatchStep[] = [];
  sequence.forEach((el, i) => {
    // lo posterior al objetivo solo se conserva si es una comprobación marcada
    if (i > targetIdx && el.as !== 'assertion') return;
    const hint: StepHint = {
      ...(el.test_id ? { test_id: el.test_id } : {}),
      ...(el.role ? { role: el.role } : {}),
      ...(el.name ? { name: el.name } : {}),
      ...(el.label ? { label: el.label } : {}),
    };
    const cand = candidates[i] ?? null;
    const isTarget = i === targetIdx && el.as !== 'assertion';
    const role: AssistPatchStep['role'] = el.as === 'assertion' ? 'assertion' : isTarget ? 'target' : 'opener';
    const action: WalkAction =
      role === 'assertion' ? 'expect_text' : role === 'target' ? (opts.targetAction ?? 'click') : el.via === 'hover' ? 'hover' : 'click';
    steps.push({
      action,
      hint,
      locator: cand?.source ?? '',
      role,
      ...(cand ? { tier: cand.tier, fragile: cand.fragile } : {}),
      ...(cand?.why ? { fragile_why: cand.why } : {}),
      // una comprobación se materializa como expect_text del texto observado
      ...(role === 'assertion' && el.name ? { value: el.name } : {}),
    });
  });
  return steps;
}

/**
 * Poda de la secuencia grabada: quita repeticiones consecutivas del mismo
 * elemento (el QA mueve el ratón y re-entra) y los hovers sobre el elemento que
 * después clica (redundantes: el click ya implica estar encima).
 */
export function pruneAssistSequence(sequence: PickedElement[]): PickedElement[] {
  const key = (el: PickedElement): string =>
    [el.test_id ?? '', el.role, normalizeText(el.name ?? ''), normalizeText(el.label ?? '')].join('|');
  const out: PickedElement[] = [];
  for (const el of sequence) {
    const prev = out[out.length - 1];
    if (prev && key(prev) === key(el)) {
      // mismo elemento: el click gana sobre el hover
      if (prev.via === 'hover' && el.via === 'click') out[out.length - 1] = el;
      continue;
    }
    out.push(el);
  }
  // hover inmediatamente seguido de click sobre el MISMO elemento ya está cubierto arriba;
  // aquí quitamos hovers cuyo elemento se clica más adelante (el click lo hace redundante)
  const clicked = new Set(out.filter((e) => e.via === 'click').map(key));
  return out.filter((el, i) => {
    if (el.via !== 'hover') return true;
    if (!clicked.has(key(el))) return true;
    return out.findIndex((o) => o.via === 'click' && key(o) === key(el)) < i;
  });
}

// ----------------------------------------------------------------- aliases

/**
 * Clave estable de un hint para hint-aliases.json (K0.5): campos normalizados,
 * orden fijo. Dos hints que solo difieren en acentos/case/espacios comparten
 * alias. test_id se incluye sin normalizar (atributo exacto).
 */
export function aliasKey(hint: StepHint): string {
  return [
    hint.test_id ?? '',
    hint.role ? normalizeText(hint.role) : '',
    hint.name ? normalizeText(hint.name) : '',
    hint.label ? normalizeText(hint.label) : '',
    hint.text ? normalizeText(hint.text) : '',
  ].join('|');
}

// ------------------------------------------------------------- validación

const EXPECT_STATES = new Set(['visible', 'enabled', 'disabled', 'checked', 'unchecked']);

export function validateWalkScript(script: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const s = script as Partial<WalkScript>;
  if (!s || typeof s !== 'object') return { ok: false, errors: ['walk-script no es un objeto'] };
  if (s.version !== 1) errors.push(`version debe ser 1 (recibido: ${String(s.version)})`);
  if (!s.site_id) errors.push('site_id requerido');
  if (!s.entry) errors.push('entry requerido');
  if (!Array.isArray(s.flows) || s.flows.length === 0) errors.push('flows[] requerido y no vacío');
  const NEEDS_HINT: WalkStep['action'][] = ['fill', 'click', 'hover', 'select', 'check', 'uncheck', 'expect_state'];
  const NEEDS_VALUE: WalkStep['action'][] = ['fill', 'select', 'press', 'wait_text', 'expect_text', 'expect_state'];
  for (const flow of s.flows ?? []) {
    if (!flow.flow) errors.push('flow sin id');
    const seen = new Set<string>();
    for (const step of flow.steps ?? []) {
      const at = `${flow.flow}/${step.id}`;
      if (!step.id) errors.push(`${flow.flow}: paso sin id`);
      else if (seen.has(step.id)) errors.push(`${at}: id duplicado`);
      seen.add(step.id);
      if (NEEDS_HINT.includes(step.action) && !step.hint) errors.push(`${at}: '${step.action}' requiere hint`);
      if (NEEDS_VALUE.includes(step.action) && step.value === undefined) errors.push(`${at}: '${step.action}' requiere value`);
      if (step.action === 'goto' && !step.target) errors.push(`${at}: 'goto' requiere target`);
      if (step.action === 'wait_url' && !step.target) errors.push(`${at}: 'wait_url' requiere target`);
      if (step.action === 'expect_state' && step.value !== undefined && !EXPECT_STATES.has(step.value))
        errors.push(`${at}: 'expect_state' requiere value ∈ {visible|enabled|disabled|checked|unchecked}`);
    }
    if (!flow.steps?.length) errors.push(`${flow.flow}: flujo sin pasos`);
  }
  return { ok: errors.length === 0, errors };
}

// ----------------------------------------------------------------- estado

/** Hash estable del script: invalida el checkpoint si el guion cambió. */
export function hashScript(script: WalkScript): string {
  return createHash('sha256').update(JSON.stringify(script)).digest('hex').slice(0, 16);
}

// ----------------------------------------------------- rescate (poda ARIA)

/**
 * Poda del ariaSnapshot para el payload de rescate: solo líneas con roles
 * interactivos o texto, con tope de líneas. El rescate es una MICRO-llamada
 * (~1-3 créditos) — el snapshot completo de una SPA la convertiría en macro.
 */
export function pruneAriaSnapshot(snapshot: string, maxLines = 120): string {
  const INTERACTIVE = /- (button|link|textbox|checkbox|radio|combobox|listbox|option|searchbox|spinbutton|switch|tab|menuitem|heading|form|navigation|main|banner|contentinfo|dialog|alert)\b/;
  const lines = snapshot.split('\n').filter((l) => INTERACTIVE.test(l) || /"[^"]+"/.test(l));
  const kept = lines.slice(0, maxLines);
  if (lines.length > kept.length) kept.push(`# ... podado: ${lines.length - kept.length} líneas más`);
  return kept.join('\n');
}
