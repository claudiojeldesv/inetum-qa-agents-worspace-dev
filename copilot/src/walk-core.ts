/**
 * Núcleo puro del dom-walker: sin Playwright, sin I/O. Todo lo de aquí es
 * determinístico y unit-testeable. El driver (dom-walker.ts) solo orquesta.
 */

import { createHash } from 'node:crypto';
import type {
  DomElement,
  StepHint,
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

// ---------------------------------------------------------- locator plans

export type LocatorAttempt =
  | { kind: 'test_id'; value: string }
  | { kind: 'role'; role: string; name?: string }
  | { kind: 'label'; value: string }
  | { kind: 'text'; value: string };

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

/** Representación textual de un intento (para dom-map, transitions y audit). */
export function locatorSource(a: LocatorAttempt): string {
  switch (a.kind) {
    case 'test_id':
      return `getByTestId('${a.value}')`;
    case 'role':
      return a.name
        ? `getByRole('${a.role}', { name: '${a.name.replace(/'/g, "\\'")}' })`
        : `getByRole('${a.role}')`;
    case 'label':
      return `getByLabel('${a.value.replace(/'/g, "\\'")}')`;
    case 'text':
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

// ------------------------------------------------------------- validación

export function validateWalkScript(script: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const s = script as Partial<WalkScript>;
  if (!s || typeof s !== 'object') return { ok: false, errors: ['walk-script no es un objeto'] };
  if (s.version !== 1) errors.push(`version debe ser 1 (recibido: ${String(s.version)})`);
  if (!s.site_id) errors.push('site_id requerido');
  if (!s.entry) errors.push('entry requerido');
  if (!Array.isArray(s.flows) || s.flows.length === 0) errors.push('flows[] requerido y no vacío');
  const NEEDS_HINT: WalkStep['action'][] = ['fill', 'click', 'select', 'check', 'uncheck'];
  const NEEDS_VALUE: WalkStep['action'][] = ['fill', 'select', 'press', 'wait_text'];
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
