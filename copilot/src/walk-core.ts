/**
 * Núcleo puro del dom-walker: sin Playwright, sin I/O. Todo lo de aquí es
 * determinístico y unit-testeable. El driver (dom-walker.ts) solo orquesta.
 */

import { createHash } from 'node:crypto';
import type {
  AssistPatchStep,
  CountOperator,
  DomElement,
  LocatorCandidate,
  PickedElement,
  SettleProfile,
  StepHint,
  StepOutcome,
  TimingProfile,
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

/**
 * K0.28 — patrón normalizado ANCLADO (whole-string). Mismo pattern
 * accent/case-insensible de siempre, pero exigiendo que sea TODO el texto del
 * elemento. Es el equivalente normalizado de `{ exact: true }`: sin él, la
 * pasada normalizada volvería a ser substring y reintroduciría la ambigüedad
 * que la pasada literal acaba de esquivar.
 */
export function accentInsensitiveExactPattern(value: string): string {
  return `^\\s*${accentInsensitivePattern(value)}\\s*$`;
}

export type LocatorAttempt =
  | { kind: 'test_id'; value: string }
  | { kind: 'role'; role: string; name?: string; normalized?: boolean; exact?: boolean }
  | { kind: 'label'; value: string; normalized?: boolean; exact?: boolean }
  /** `exact` (K0.28): texto COMPLETO del elemento, no substring. Ver hintLocatorPlan. */
  | { kind: 'text'; value: string; normalized?: boolean; exact?: boolean }
  /** K0.39 — marcador de posición (`placeholder`). Ver hintLocatorPlan. */
  | { kind: 'placeholder'; value: string; normalized?: boolean; exact?: boolean };

const PRIORITY_TO_KIND: Record<string, LocatorAttempt['kind']> = {
  getByTestId: 'test_id',
  getByRole: 'role',
  getByLabel: 'label',
  /**
   * K0.39 — CUATRO contracts lo declaraban y la escalera lo IGNORABA EN SILENCIO,
   * que es el defecto de verdad: el Style Contract es la voz del cliente y una
   * instrucción declarada que se descarta sin decir nada es peor que no admitirla.
   * Nombrado desde K0.19 y sin instancia medida hasta el sitio 5: en Vaadin el
   * buscador NO tiene más identidad que su marcador (el nombre accesible sale
   * vacío), al revés que en PrimeNG, donde el marcador SÍ alimenta el nombre y por
   * eso el mismo hint resolvía por rol. Las dos mediciones, en direcciones
   * opuestas, son las que justifican el peldaño.
   */
  getByPlaceholder: 'placeholder',
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
    /**
     * K0.33 — el peldaño EXACTO no era solo del texto. `getByRole({name})` y
     * `getByLabel()` también matchean por SUBSTRING, y en campo (UI5, sitio 2 de
     * la gira) eso mató el buscador: el hint {label:'Search'} calzaba a la vez
     * con el `<input aria-label="Search">` y con la región que lo envuelve,
     * etiquetada "Product Catalog Search and Navigation" → dos coincidencias →
     * el paso se plantaba. Con el intento exacto delante, una.
     *
     * El mismo argumento de K0.28, verbatim: si el exacto es único, está dentro
     * del conjunto del substring, así que un substring que hoy resuelve único
     * resuelve al MISMO elemento. No puede cambiar una resolución por otra —
     * solo convierte plantas en resoluciones.
     */
    if (kind === 'role' && hint.role) {
      if (hint.name) attempts.push({ kind, role: hint.role, name: hint.name, exact: true });
      attempts.push({ kind, role: hint.role, name: hint.name });
    }
    if (kind === 'label' && hint.label) {
      attempts.push({ kind, value: hint.label, exact: true });
      attempts.push({ kind, value: hint.label });
    }
    /**
     * K0.39 — el marcador se alimenta del MISMO vocabulario del FD que los demás
     * peldaños (`label`/`name`/`text`): un FD dice "el buscador" o cita lo que se
     * ve escrito en el hueco, y no distingue si eso es una etiqueta o un marcador
     * — esa distinción es del HTML, no del negocio.
     *
     * Exacto antes que substring, por el argumento de K0.28/K0.33: el exacto está
     * contenido en el substring, así que no puede cambiar una resolución por otra;
     * solo convierte plantas en resoluciones. Y va donde lo ponga el contract: si
     * un proyecto no lo declara, la escalera se comporta exactamente igual que
     * antes.
     */
    if (kind === 'placeholder' && (hint.label ?? hint.name ?? hint.text)) {
      const value = (hint.label ?? hint.name ?? hint.text) as string;
      attempts.push({ kind, value, exact: true });
      /**
       * K0.40 — la red de substring del marcador es SOLO para `label`, por el
       * mismo argumento con el que K0.33 se la quitó a `name` en el peldaño de
       * texto: cuando ya se ha cambiado de atributo, aflojar además el matching
       * son DOS saltos encadenados y la comparación deja de ser defendible.
       *
       * Y aquí no es teoría. Medido en Mind2Web (travelzoo, 1ba150cb-1): el paso
       * pedía la sugerencia «Hotels» de una lista desplegada — hint
       * {role:'listitem', name:'Hotels'} —, el rol no resolvió, el marcador exacto
       * tampoco, y el substring encontró UNO: el `<input>` del buscador, cuyo
       * marcador dice «Hotels, e.g. Las Vegas». Resolvió el campo de búsqueda en
       * lugar de la opción del menú, en silencio. Único caso AJENO del corpus.
       *
       * `label` es el vocabulario con el que el FD dice "lo que se lee en el
       * hueco del campo", así que ahí el substring sigue siendo la red del drift.
       * De `name` (nombre accesible) al marcador solo se pasa exacto.
       */
      if (hint.label) attempts.push({ kind, value });
    }
    /**
     * K0.28 — el peldaño de TEXTO prueba EXACTO antes que substring. Medido en
     * campo (tufarmacia, CP02-s1): el hint 'Medicamentos' murió por ambigüedad
     * porque `getByText` es substring y el footer decía "Venta de medicamentos
     * con receta…", cuando el enlace del menú era el ÚNICO texto exactamente
     * igual. Substring es la red de seguridad (drift de sufijos, "Total: 12 €"),
     * no la primera opción.
     *
     * Nunca cambia una resolución existente por otra: si el exacto es único, el
     * substring lo incluye, así que un substring que hoy resuelve único resuelve
     * al MISMO elemento. Solo convierte plantas en resoluciones.
     */
    if (kind === 'text' && (hint.text ?? hint.name)) {
      const value = (hint.text ?? hint.name) as string;
      attempts.push({ kind, value, exact: true });
      /**
       * K0.33 — la red de substring es SOLO para `text`, no para `name`. Medido en
       * campo (UI5, sitio 2), y es el fallo mudo más caro de la gira: el hint
       * {name:'Cart'} del icono del carrito no lleva `role`, así que la escalera
       * nunca prueba `getByRole` y cae al peldaño de texto. Exacto → cero; substring
       * → UNA coincidencia visible... el botón "Add to Cart". El walker resolvió,
       * pulsó, reportó `ok` y añadió una segunda unidad al carrito: EQUIVOCADO con
       * duplicación de negocio, que es lo peor que puede hacer este componente.
       *
       * El razonamiento no es "substring es peligroso" —para `text` es la red que
       * absorbe el drift de sufijos ("Total: 12 €" desde 'Total')— sino que aquí se
       * encadenan DOS saltos: se cambia de atributo (nombre accesible → texto
       * visible) y además se afloja el matching. Con el atributo ya sustituido, la
       * única comparación defendible es la exacta. Si el FD quería decir "el texto
       * que se ve", el guion tiene `text` para eso.
       */
      if (hint.text) attempts.push({ kind, value });
    }
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
  // K0.33 — normalizado + exacto = patrón ANCLADO, igual que en el texto (K0.28):
  // una regex sin anclar volvería a ser substring y desharía el peldaño exacto.
  const norm = (v: string, exact?: boolean) =>
    `/${exact ? accentInsensitiveExactPattern(v) : accentInsensitivePattern(v)}/i`;
  switch (a.kind) {
    case 'test_id':
      return `getByTestId('${a.value}')`;
    case 'role':
      if (a.normalized && a.name) return `getByRole('${a.role}', { name: ${norm(a.name, a.exact)} })`;
      if (!a.name) return `getByRole('${a.role}')`;
      return a.exact
        ? `getByRole('${a.role}', { name: '${a.name.replace(/'/g, "\\'")}', exact: true })`
        : `getByRole('${a.role}', { name: '${a.name.replace(/'/g, "\\'")}' })`;
    case 'label':
      if (a.normalized) return `getByLabel(${norm(a.value, a.exact)})`;
      return a.exact
        ? `getByLabel('${a.value.replace(/'/g, "\\'")}', { exact: true })`
        : `getByLabel('${a.value.replace(/'/g, "\\'")}')`;
    case 'text':
      if (a.normalized) return `getByText(/${a.exact ? accentInsensitiveExactPattern(a.value) : accentInsensitivePattern(a.value)}/i)`;
      return a.exact
        ? `getByText('${a.value.replace(/'/g, "\\'")}', { exact: true })`
        : `getByText('${a.value.replace(/'/g, "\\'")}')`;
    case 'placeholder':
      if (a.normalized) return `getByPlaceholder(${norm(a.value, a.exact)})`;
      return a.exact
        ? `getByPlaceholder('${a.value.replace(/'/g, "\\'")}', { exact: true })`
        : `getByPlaceholder('${a.value.replace(/'/g, "\\'")}')`;
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
 *
 * K0.16 — el `scope` entra en la clave. Sin él, los tres botones "X" del CP001 de
 * onesait (cada uno en una ventana flotante distinta) producen la MISMA clave: el
 * segundo alias colisionaría con el primero y la memoria del cliente aprendería una
 * mentira. Con scope ausente la clave es idéntica a la de antes — los ficheros de
 * alias existentes siguen valiendo.
 */
export function aliasKey(hint: StepHint, scope?: StepHint): string {
  const fields = (h: StepHint): string =>
    [
      h.test_id ?? '',
      h.role ? normalizeText(h.role) : '',
      h.name ? normalizeText(h.name) : '',
      h.label ? normalizeText(h.label) : '',
      h.text ? normalizeText(h.text) : '',
    ].join('|');
  const base = fields(hint);
  return scope ? `${base}@${fields(scope)}` : base;
}

/**
 * Traduce los pasos del parche del modo asistido a `WalkStep[]` listos para pegar
 * en el guion (K0.16). El locator viaja como campo autoritativo: es lo que hace
 * fundible un parche cuyo tier está por encima del plano.
 *
 * Los ids se derivan del paso que sustituyen (`s6` → `s6`, `s6b`, `s6c`) para no
 * chocar con los que ya existen en el flujo.
 */
export function assistStepsToWalkSteps(steps: AssistPatchStep[], replacesStep: string): WalkStep[] {
  const suffix = (i: number): string => (i === 0 ? '' : String.fromCharCode(97 + i)); // '', 'b', 'c', ...
  return steps.map((s, i) => ({
    id: `${replacesStep}${suffix(i)}`,
    action: s.action,
    ...(Object.keys(s.hint).length ? { hint: s.hint } : {}),
    ...(s.locator ? { locator: s.locator } : {}),
    ...(s.value !== undefined ? { value: s.value } : {}),
  }));
}

// ---------------------------------------------- cardinalidad (Fase 6)

/** Operadores válidos de `expect_count`/`expect_each.operator`. */
export const COUNT_OPERATORS: ReadonlySet<CountOperator> = new Set(['>', '>=', '=', '<']);

/**
 * Compara un recuento observado contra un umbral con el operador declarado.
 * Puro y determinístico: el código captura el número, el operador decide —
 * el LLM no interviene en si "3 > 0" es cierto.
 */
export function compareCount(actual: number, operator: CountOperator, expected: number): boolean {
  switch (operator) {
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '=':
      return actual === expected;
    case '<':
      return actual < expected;
  }
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
  const NEEDS_HINT: WalkStep['action'][] = [
    'fill', 'click', 'hover', 'select', 'check', 'uncheck', 'expect_state', 'expect_value', 'expect_count', 'expect_each',
  ];
  const NEEDS_VALUE: WalkStep['action'][] = [
    'fill', 'select', 'press', 'wait_text', 'expect_text', 'expect_state', 'expect_value', 'expect_count',
  ];
  const NO_POSTCONDITION: WalkStep['action'][] = [
    'capture', 'expect_text', 'expect_state', 'expect_value', 'wait_url', 'wait_text', 'expect_count', 'expect_each',
    'scroll_until',
  ];
  for (const flow of s.flows ?? []) {
    if (!flow.flow) errors.push('flow sin id');
    const seen = new Set<string>();
    for (const step of flow.steps ?? []) {
      const at = `${flow.flow}/${step.id}`;
      if (!step.id) errors.push(`${flow.flow}: paso sin id`);
      else if (seen.has(step.id)) errors.push(`${at}: id duplicado`);
      seen.add(step.id);
      // K0.16: un `locator` autoritativo sustituye a la hint (la escalera no se usa)
      if (NEEDS_HINT.includes(step.action) && !step.hint && !step.locator)
        errors.push(`${at}: '${step.action}' requiere hint o locator`);
      if (NEEDS_VALUE.includes(step.action) && step.value === undefined) errors.push(`${at}: '${step.action}' requiere value`);
      if (step.action === 'goto' && !step.target) errors.push(`${at}: 'goto' requiere target`);
      if (step.action === 'wait_url' && !step.target) errors.push(`${at}: 'wait_url' requiere target`);
      if (step.action === 'expect_state' && step.value !== undefined && !EXPECT_STATES.has(step.value))
        errors.push(`${at}: 'expect_state' requiere value ∈ {visible|enabled|disabled|checked|unchecked}`);
      // Fase 6 — expect_count: hint = COLECCIÓN, operator + value numérico
      if (step.action === 'expect_count') {
        if (!step.operator || !COUNT_OPERATORS.has(step.operator))
          errors.push(`${at}: 'expect_count' requiere operator ∈ {>|>=|=|<}`);
        if (step.value === undefined || step.value.trim() === '' || Number.isNaN(Number(step.value)))
          errors.push(`${at}: 'expect_count' requiere value numérico`);
      }
      // Fase 6 — expect_each: hint = CONTENEDORES, each = condición dentro de cada uno
      if (step.action === 'expect_each') {
        if (!step.each) errors.push(`${at}: 'expect_each' requiere 'each' ({hint, operator, value})`);
        else {
          const each = step.each;
          if (!each.operator || !COUNT_OPERATORS.has(each.operator))
            errors.push(`${at}: 'expect_each.operator' requiere ∈ {>|>=|=|<}`);
          if (each.value === undefined || String(each.value).trim() === '' || Number.isNaN(Number(each.value)))
            errors.push(`${at}: 'expect_each.value' requiere numérico`);
          const hasField = ['test_id', 'role', 'name', 'label', 'text'].some(
            (f) => (each.hint as Record<string, unknown> | undefined)?.[f] !== undefined,
          );
          if (!hasField) errors.push(`${at}: 'expect_each.hint' necesita al menos un campo (test_id|role|name|label|text)`);
        }
      }
      // K0.13 capa 3: reintentar sin oráculo es reintentar a ciegas. Si el paso
      // se declara reintentable tiene que haber forma de saber si surtió efecto.
      if (step.retry_safe === true && !step.expect_after && !step.expect_transition)
        errors.push(`${at}: 'retry_safe: true' exige expect_after o expect_transition (sin oráculo el reintento es ciego)`);
      if (step.expect_after !== undefined && NO_POSTCONDITION.includes(step.action))
        errors.push(`${at}: 'expect_after' no aplica a '${step.action}' (no ejecuta acción); usa un paso expect_text`);
      for (const [k, v] of [
        ['quiet_ms', step.settle?.quiet_ms],
        ['timeout_ms', step.settle?.timeout_ms],
        ['max_mutations', step.settle?.max_mutations],
      ] as const) {
        if (v !== undefined && (!Number.isFinite(v) || v < 0)) errors.push(`${at}: settle.${k} debe ser un número >= 0`);
      }
      // K0.16 — locator autoritativo y scope declarativo
      if (step.locator !== undefined && (typeof step.locator !== 'string' || step.locator.trim() === ''))
        errors.push(`${at}: 'locator' debe ser una cadena no vacía (gramática A >> B, sufijo .nth(N))`);
      if (step.scope !== undefined) {
        const hasField = ['test_id', 'role', 'name', 'label', 'text'].some(
          (f) => (step.scope as Record<string, unknown>)[f] !== undefined,
        );
        if (!hasField) errors.push(`${at}: 'scope' necesita al menos un campo (test_id|role|name|label|text)`);
      }
      // declarar los dos es intención ambigua: el locator ya lleva su propio camino
      if (step.locator !== undefined && step.scope !== undefined)
        errors.push(`${at}: no declares 'locator' y 'scope' en el mismo paso (el locator ya es absoluto)`);
      // Fase 5 — debounce_ms debe ser un intervalo real
      if (step.debounce_ms !== undefined && (!Number.isFinite(step.debounce_ms) || step.debounce_ms <= 0))
        errors.push(`${at}: 'debounce_ms' debe ser un número > 0`);
      // Fase 4 — scroll_until: hint = OBJETIVO, container = viewport scrollable
      if (step.action === 'scroll_until') {
        if (!step.hint) errors.push(`${at}: 'scroll_until' requiere hint (el objetivo)`);
        if (!step.container) errors.push(`${at}: 'scroll_until' requiere container (el viewport scrollable)`);
        else {
          const hasField = ['test_id', 'role', 'name', 'label', 'text'].some(
            (f) => (step.container as Record<string, unknown>)[f] !== undefined,
          );
          if (!hasField) errors.push(`${at}: 'container' necesita al menos un campo (test_id|role|name|label|text)`);
        }
        if (step.max_steps !== undefined && (!Number.isInteger(step.max_steps) || step.max_steps <= 0))
          errors.push(`${at}: 'max_steps' debe ser un entero > 0`);
      }
    }
    if (!flow.steps?.length) errors.push(`${flow.flow}: flujo sin pasos`);
  }
  return { ok: errors.length === 0, errors };
}

// -------------------------------------- sincronización (K0.13, capas 2/3/4)

/**
 * Defaults del settle. `quiet_ms` es el parámetro clave: exigir 400 ms de
 * quietud CONTINUADA mata la clase "el spinner se abre 2 o 3 veces en la misma
 * carga", porque el hueco entre ciclos (típicamente 100-200 ms en las SPA
 * corporativas medidas) no llega a contar como calma.
 */
/**
 * Fase 5 (SPEC-caos-corporativo §4) — default conservador de `debounced: true`
 * sin `debounce_ms` explícito. 300 ms es el valor habitual de un
 * buscador/typeahead (RxJS `debounceTime(300)` es el ejemplo de libro).
 */
export const DEFAULT_DEBOUNCE_MS = 300;

/** `debounce_ms` explícito manda; `debounced: true` cae al default; ninguno = 0 (sin válvula). */
export function effectiveDebounceMs(step: Pick<WalkStep, 'debounced' | 'debounce_ms'>): number {
  if (typeof step.debounce_ms === 'number') return step.debounce_ms;
  return step.debounced ? DEFAULT_DEBOUNCE_MS : 0;
}

export const DEFAULT_SETTLE: Required<Pick<SettleProfile, 'quiet_ms' | 'timeout_ms' | 'max_mutations' | 'disable_animations'>> = {
  quiet_ms: 400,
  timeout_ms: 10_000,
  max_mutations: 2,
  // Fase 3: on por defecto en funcional (§4). Se apaga declarando
  // `settle: { disable_animations: false }` en el contract, para regresión visual.
  disable_animations: true,
};

/**
 * Señales heurísticas de "ocupado". Deliberadamente amplias: un falso positivo
 * solo cuesta espera (y la espera está topada), mientras que un falso negativo
 * cuesta un fallo intermitente que nadie sabe reproducir.
 */
export const BUSY_SELECTORS: string[] = [
  '[aria-busy="true"]',
  '[role="progressbar"]',
  'progress',
  '.spinner',
  '.loading',
  '.loader',
  '.overlay-loading',
  '.blockUI',
  '[class*="spinner" i]',
  '[class*="loading" i]',
  '[class*="cargando" i]',
  '[id*="spinner" i]',
  '[id*="loading" i]',
];

/** Precedencia: DEFAULT < contract < script < paso. `undefined` no pisa. */
export function mergeSettle(...layers: Array<SettleProfile | undefined>): Required<SettleProfile> {
  const out: Required<SettleProfile> = {
    ...DEFAULT_SETTLE,
    busy_selectors: [...BUSY_SELECTORS],
    ignore_selectors: [],
  };
  for (const l of layers) {
    if (!l) continue;
    if (typeof l.quiet_ms === 'number') out.quiet_ms = l.quiet_ms;
    if (typeof l.timeout_ms === 'number') out.timeout_ms = l.timeout_ms;
    if (typeof l.max_mutations === 'number') out.max_mutations = l.max_mutations;
    if (typeof l.disable_animations === 'boolean') out.disable_animations = l.disable_animations;
    // los selectores se ACUMULAN: el pack del cliente añade sus señales, no
    // sustituye las heurísticas (perder una por descuido cuesta flakiness).
    if (l.busy_selectors?.length) out.busy_selectors = [...new Set([...out.busy_selectors, ...l.busy_selectors])];
    if (l.ignore_selectors?.length) out.ignore_selectors = [...new Set([...out.ignore_selectors, ...l.ignore_selectors])];
  }
  return out;
}

/** Acciones cuya repetición no puede duplicar estado de negocio. */
const RETRY_SAFE_BY_DEFAULT: ReadonlySet<WalkAction> = new Set<WalkAction>([
  'goto',
  'hover',
  'fill',
  'press',
  'select',
  'capture',
  'wait_url',
  'wait_text',
  'expect_text',
  'expect_state',
  'expect_value',
]);

/**
 * ¿Es seguro repetir esta acción? `click`, `check` y `uncheck` NO lo son por
 * defecto: re-pulsar "Finalizar" en onesait crea DOS declaraciones, y un test
 * que ensucia PRE es peor que un test rojo. Los clicks de navegación (menú,
 * pestañas) se declaran `retry_safe: true` en el guion, explícitamente.
 */
export function isRetrySafe(step: WalkStep): boolean {
  if (typeof step.retry_safe === 'boolean') return step.retry_safe;
  return RETRY_SAFE_BY_DEFAULT.has(step.action);
}

/** Percentil por rango más cercano (sin interpolar: con 3 muestras interpolar es teatro). */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/**
 * Timeout calibrado por observación (capa 4). Sustituye el 10 000 inventado por
 * p95(observado) × margen, acotado. Con pocas muestras el p95 degrada al máximo,
 * que es exactamente lo prudente.
 */
export function calibratedTimeout(
  samples: number[],
  opts: { margin?: number; floorMs?: number; ceilingMs?: number } = {},
): number | null {
  if (samples.length === 0) return null;
  const margin = opts.margin ?? 2;
  const floorMs = opts.floorMs ?? 3_000;
  const ceilingMs = opts.ceilingMs ?? 60_000;
  const base = samples.length < 3 ? Math.max(...samples) : percentile(samples, 95);
  return Math.min(ceilingMs, Math.max(floorMs, Math.round(base * margin)));
}

/** Añade una muestra al perfil, conservando solo las últimas `keep` (ventana móvil). */
export function updateTimingProfile(
  profile: TimingProfile,
  key: string,
  ms: number,
  opts: { screen?: string; keep?: number; date?: string } = {},
): TimingProfile {
  const keep = opts.keep ?? 10;
  const entry = profile.steps[key] ?? { samples: [], updated: '' };
  const samples = [...entry.samples, Math.max(0, Math.round(ms))].slice(-keep);
  profile.steps[key] = {
    samples,
    ...(opts.screen ? { screen: opts.screen } : entry.screen ? { screen: entry.screen } : {}),
    updated: opts.date ?? new Date().toISOString().slice(0, 10),
  };
  return profile;
}

/**
 * Huella de pantalla: lo que permite distinguir "la acción no surtió efecto"
 * (huella igual → reintentar es seguro) de "algo pasó pero no lo esperado"
 * (huella distinta → NO reintentar, es candidato a drift). Sin esta distinción
 * el reintento es ciego y puede duplicar operaciones.
 */
export function fingerprintHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 12);
}

// ----------------------------------------------------------------- estado

/** Hash estable del script: invalida el checkpoint si el guion cambió. */
export function hashScript(script: WalkScript): string {
  return createHash('sha256').update(JSON.stringify(script)).digest('hex').slice(0, 16);
}

// ------------------------------------------------- corpus del banco (K0.32)

/**
 * ¿Este paso puede entrar en el corpus del banco como caso con VERDAD anotada?
 *
 * Aquí está el criterio que decide si el banco vale para algo. La tentación es
 * obvia: el walker resolvió un elemento, guárdalo como "la verdad" y a correr.
 * Eso sería **medirse a sí mismo** — el banco daría 100% de acierto por
 * construcción, incluidos los casos en los que la escalera se equivocó en
 * silencio, que son justo los que hay que cazar. La verdad tiene que venir de
 * fuera de la escalera.
 *
 * Dos fuentes independientes se aceptan:
 *  - **humana**: el QA señaló el elemento en el panel o escribió el locator a
 *    mano. Es la más fuerte que hay.
 *  - **postcondición cumplida**: se actuó sobre el elemento y la app respondió
 *    con el resultado de negocio que el FD esperaba. No prueba que ese elemento
 *    sea el único canónico, pero sí que el clic logró lo que tenía que lograr,
 *    que es exactamente la noción de acierto que le importa al banco. Es el
 *    mismo criterio con el que un rescate se promueve a alias (K0.5).
 *
 * Todo lo demás va a `pendientes.jsonl` con su motivo, para que el QA lo
 * promueva a mano si quiere. Un caso sin corroborar NO se cuela en el corpus.
 */
export interface CorpusCandidato {
  outcome: StepOutcome;
  /** ¿El paso declaraba postcondición inline (`expect_after`)? */
  tienePostcondicion: boolean;
  /** Cadena del locator que resolvió (para detectar procedencia humana). */
  via: string;
  frame_path: string[];
}

export function corpusVerdict(c: CorpusCandidato): { incluir: boolean; motivo: string } {
  if (c.frame_path.length > 0) {
    // `page.content()` serializa SOLO el documento principal: el elemento vive
    // en un iframe que la foto no contiene, así que el caso no es reproducible
    // offline. Límite honesto, no un fallo.
    return { incluir: false, motivo: 'el elemento vive en un iframe y la foto del documento principal no lo contiene' };
  }
  const humano = c.via.includes('✎') || c.via.includes('manual');
  if (humano) return { incluir: true, motivo: 'verdad humana: el QA señaló o escribió el locator' };
  if (c.outcome !== 'ok' && c.outcome !== 'ok_after_retry') {
    return { incluir: false, motivo: `el paso no salió bien (${c.outcome}): no hay nada que corrobore la resolución` };
  }
  if (!c.tienePostcondicion) {
    return {
      incluir: false,
      motivo:
        'resolvió y ejecutó, pero nada lo corrobora: tomar la propia resolución del walker como verdad sería medirse a sí mismo',
    };
  }
  return { incluir: true, motivo: 'postcondición del FD cumplida tras actuar sobre el elemento' };
}

// -------------------------------------------- consentimiento (K0.30, familias)

/**
 * Banners de consentimiento: NO son una excepción declarable por sitio, son el
 * día a día — salen en la mayoría de los portales corporativos. Tratarlos como
 * "estorbo que el client pack declara si acaso" obligaba a redescubrir el mismo
 * problema en cada cliente, y en la gira demostró algo peor: un estorbo mal
 * declarado envenena el run entero (§20). Por eso el walker los conoce POR
 * DISEÑO, por FAMILIA de gestor de consentimiento (CMP), igual que conoce las
 * fachadas de los desplegables.
 *
 * Esto es detección de familia, no una lista de sitios: cada entrada es el
 * contenedor que ese CMP renderiza en CUALQUIER web donde esté instalado.
 */
export const CONSENT_FAMILIES: ReadonlyArray<{ cmp: string; selector: string }> = [
  { cmp: 'OneTrust', selector: '#onetrust-banner-sdk' },
  { cmp: 'OneTrust', selector: '#onetrust-pc-sdk' },
  { cmp: 'Cookiebot', selector: '#CybotCookiebotDialog' },
  { cmp: 'cookieconsent (Osano/Insites)', selector: '.cc-window' },
  { cmp: 'CookieYes', selector: '.cky-consent-container' },
  { cmp: 'CookieYes', selector: '.cky-modal' },
  { cmp: 'Quantcast', selector: '.qc-cmp2-container' },
  { cmp: 'Didomi', selector: '#didomi-popup' },
  { cmp: 'Didomi', selector: '.didomi-popup-container' },
  { cmp: 'Usercentrics', selector: '#usercentrics-root' },
  { cmp: 'TrustArc', selector: '#truste-consent-track' },
  { cmp: 'Complianz', selector: '#cmplz-cookiebanner-container' },
  { cmp: 'Borlabs', selector: '#BorlabsCookieBox' },
  { cmp: 'Iubenda', selector: '#iubenda-cs-banner' },
  { cmp: 'Termly', selector: '#termly-code-snippet-support' },
  { cmp: 'Klaro', selector: '.klaro .cookie-notice' },
  { cmp: 'Klaro', selector: '.klaro .cookie-modal' },
  // Genéricos: cubren los CMP caseros (muy comunes en banca, donde el banner lo
  // hace el propio equipo). Deliberadamente exigen forma de diálogo o nombre de
  // cookie/consentimiento en la identidad del contenedor — y, además, la regla
  // de SUPERPOSICIÓN del walker (ver isOverlaying) los descarta si resultan ser
  // contenido estático de la página, como la sección de una política de cookies.
  { cmp: 'genérico', selector: '[role="dialog"][id*="cookie" i]' },
  { cmp: 'genérico', selector: '[role="dialog"][class*="cookie" i]' },
  { cmp: 'genérico', selector: '[role="dialog"][id*="consent" i]' },
  { cmp: 'genérico', selector: '[role="dialog"][class*="consent" i]' },
  { cmp: 'genérico', selector: '[aria-label*="cookie" i]' },
  { cmp: 'genérico', selector: '[class*="cookie-banner" i]' },
  { cmp: 'genérico', selector: '[class*="cookie-consent" i]' },
  { cmp: 'genérico', selector: '[id*="cookie-banner" i]' },
  { cmp: 'genérico', selector: '[class*="gdpr" i][class*="banner" i]' },
];

/**
 * K0.35 — URL sin el testigo de sesión, para lo que se GUARDA y se compara.
 *
 * Los contenedores Java reescriben la URL cuando todavía no saben si el
 * navegador acepta cookies: `…/validate.jsf;jsessionid=9DAC003E21C2…`. Medido en
 * el banco JSF — la primera visita de una sesión lo lleva y la segunda no, y el
 * valor cambia en cada run. Eso entra tal cual en el `url_pattern` del dom-map y
 * rompe una invariante declarada: el mapa debe ser determinista salvo marcas de
 * tiempo. Dos runs del mismo guion darían pantallas "distintas" y el informe de
 * reconciliación reportaría un cambio que no existe.
 *
 * Se limpia solo lo que se ANOTA; la navegación sigue usando la URL real, que es
 * la que el servidor necesita. Y se limpian testigos conocidos por nombre, no
 * cualquier parámetro de ruta: inventar que un `;algo=` es de sesión sería
 * adivinar, y hay aplicaciones que los usan para negocio.
 */
const TESTIGOS_DE_SESION = ['jsessionid', 'phpsessid', 'sid', 'aspsessionid', 'cfid', 'cftoken'];

export function urlEstable(url: string): string {
  let out = url;
  for (const t of TESTIGOS_DE_SESION) {
    out = out.replace(new RegExp(`;${t}=[^;/?#]*`, 'ig'), '');
  }
  return out;
}

/** Selector único con todas las familias (un solo manejador, no N). */
export function consentSelector(extra: string[] = []): string {
  return [...CONSENT_FAMILIES.map((f) => f.selector), ...extra].join(', ');
}

/**
 * Botón de RECHAZO. Va primero por política, no por comodidad: ante un banner
 * de consentimiento la opción correcta es la que menos datos cede. Multilingüe
 * porque los portales corporativos españoles mezclan es/en/ca/pt.
 */
export const CONSENT_REJECT = new RegExp(
  [
    'rechazar', 'rechazo', 'denegar', 'no acepto', 'no, gracias',
    'solo( las)? (necesarias|esenciales|t[eé]cnicas)', '[uú]nicamente( las)? (necesarias|esenciales)',
    'continuar sin aceptar', 'seguir sin aceptar',
    'reject', 'decline', 'refuse', 'deny', 'opt.?out',
    'necessary only', 'only (necessary|essential)', 'essential only', 'continue without accepting',
    'recusar', 'refuser', 'tout refuser', 'ablehnen', 'rifiuta',
  ].join('|'),
  'i',
);

/** Botón de CIERRE (segunda opción): cerrar no otorga consentimiento. */
export const CONSENT_CLOSE = /cerrar|close|dismiss|descartar|×|✕|✖/i;

/**
 * Botón de ACEPTACIÓN. Existe para RECONOCERLO Y NO PULSARLO: aceptar el
 * consentimiento es una decisión del usuario, no del walker. Se usa para
 * explicar en el audit por qué el banner se neutralizó de otra forma.
 */
export const CONSENT_ACCEPT = /aceptar|acepto|accept|allow|permitir|consent|de acuerdo|entendido|got it|ok/i;

// ----------------------------------------------------- rescate (poda ARIA)

/**
 * Poda del ariaSnapshot para el payload de rescate: solo líneas con roles
 * interactivos o texto, con tope de líneas. El rescate es una MICRO-llamada
 * (~1-3 créditos) — el snapshot completo de una SPA la convertiría en macro.
 */
/**
 * Instrucciones de la petición de rescate (K0.29). Función pura para que el
 * AVISO de "sin evidencia" sea verificable sin navegador: cuando el snapshot
 * llega vacío, el subagent tiene que saberlo — un rescate a ciegas que no se
 * anuncia invita a inventar el locator, que es exactamente lo prohibido.
 */
export function rescueInstructions(stepId: string, action: string, snapshotError = ''): string {
  const base =
    `Resuelve el locator Playwright del elemento que este paso necesita (action='${action}'). ` +
    `Responde SOLO escribiendo el archivo rescue-response.json en este mismo directorio con ` +
    `{"step":"${stepId}","locator":"getByRole('...', { name: '...' })"} — grammar permitida: ` +
    `getByTestId('x') | getByRole('r', { name: 'n' }) | getByLabel('x') | getByText('x') | css=<selector>. ` +
    `Si el elemento NO existe en el snapshot, locator=null (el paso quedará bloqueado, no lo inventes).`;
  if (!snapshotError) return base;
  return (
    `AVISO: esta petición va SIN EVIDENCIA — el snapshot ARIA no se pudo obtener (${snapshotError}). ` +
    `Sin DOM que mirar, la única respuesta honesta es locator=null con el motivo; no adivines. ` +
    base
  );
}

/**
 * `focus` (K0.29) — vocabulario del paso (los valores del hint). Con el tope
 * aplicado a las PRIMERAS líneas, una app corporativa con árbol de menú grande
 * gastaba el presupuesto entero en la navegación y el rescate no llegaba a ver
 * jamás el contenido: medido en la gira (sitio 1), 3.639 caracteres de menú y
 * cero del formulario por el que se preguntaba. No estaba vacío — estaba lleno
 * de lo que no era. Con `focus`, las líneas que mencionan el vocabulario del
 * paso (y su ventana de contexto) entran primero; el resto rellena en orden de
 * documento. Sigue siendo una micro-llamada: el tope no sube.
 */
export function pruneAriaSnapshot(snapshot: string, maxLines = 120, focus = ''): string {
  const INTERACTIVE = /- (button|link|textbox|checkbox|radio|combobox|listbox|option|searchbox|spinbutton|switch|tab|menuitem|heading|form|navigation|main|banner|contentinfo|dialog|alert)\b/;
  const lines = snapshot.split('\n').filter((l) => INTERACTIVE.test(l) || /"[^"]+"/.test(l));
  if (lines.length <= maxLines) return lines.join('\n');

  const tokens = normalizeText(focus)
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  const keep = new Set<number>();
  if (tokens.length > 0) {
    const CONTEXT = 2; // el padre y los hermanos inmediatos: sin ellos la línea no se sabe leer
    lines.forEach((line, i) => {
      const low = normalizeText(line);
      if (!tokens.some((t) => low.includes(t))) return;
      for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j += 1) keep.add(j);
    });
  }
  // El resto del presupuesto se rellena en orden de documento: la cabecera del
  // snapshot sitúa al lector (qué pantalla es), y si no hubo coincidencias esto
  // deja el comportamiento de siempre.
  for (let i = 0; i < lines.length && keep.size < maxLines; i += 1) keep.add(i);

  const indices = [...keep].sort((a, b) => a - b).slice(0, maxLines);
  const out: string[] = [];
  let prev = -1;
  for (const i of indices) {
    if (prev >= 0 && i > prev + 1) out.push(`# ... ${i - prev - 1} líneas omitidas`);
    out.push(lines[i]);
    prev = i;
  }
  if (prev < lines.length - 1) out.push(`# ... podado: ${lines.length - 1 - prev} líneas más`);
  return out.join('\n');
}
