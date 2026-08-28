/**
 * El acta de decisiones del QA (P1 de `docs/tasks/plan-panel-y-acta.md`).
 *
 * Cuando el producto detecta drift entre el FD y la aplicación, hoy lo escribe en un
 * informe y ahí muere. El acta es el camino de vuelta: el QA decide quién tiene razón
 * —la app o el FD— y esa decisión queda con su autor, su evidencia y su grado.
 *
 * Tres propiedades, en este orden de importancia:
 *
 *  1. **Append-only y durable.** `config/decisions/<site>.jsonl`, al lado de los
 *     hint-aliases y por la misma razón: `config/` sobrevive a la limpieza de `.work/`.
 *     Una decisión del QA no es un artefacto de run.
 *  2. **Encadenada.** El `hash` de cada entrada cubre sus campos MÁS el hash de la
 *     entrada previa. Alterar o borrar una decisión vieja rompe la cadena y el
 *     validador lo señala con el índice exacto.
 *  3. **Fail-closed en el actor.** Sin `actor` no hay decisión. Una decisión anónima
 *     no es evidencia de nada, y el propósito entero del acta es que cada cambio del
 *     plan tenga un responsable.
 *
 * **Lo que la cadena NO garantiza** (decisión 10 del plan, escrita aquí para que nadie
 * la descubra en una auditoría): el hash es evidencia de MANIPULACIÓN, no no-repudio.
 * Quien tenga permiso de escritura sobre el fichero puede recalcular la cadena entera
 * y quedarse un acta coherente. Y truncar la COLA —borrar las últimas N entradas— deja
 * una cadena perfectamente válida: es inherente a un hash chain sin ancla externa. Por
 * eso `recordDecision` deja el hash de cada decisión en el audit-log, que es un fichero
 * distinto y con otro camino de escritura: `verifyChain` contra esos hashes (opción
 * `--audit` del validador) sí caza la cola truncada.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

/** Quién gana el pulso: la aplicación, el FD, o nadie todavía. */
export type DecisionKind = 'app' | 'fd' | 'defer';

/**
 * Grado de evidencia. NO es una escala de permiso: los tres grados aprueban (decisión 3
 * del plan — la aprobación no exige verificación en limpio, exige evidencia, y la
 * evidencia tiene grado). Con una póliza que se quema no se puede reproducir desde cero
 * y eso no puede ser un muro; lo que sí se exige es que el grado quede escrito.
 *
 *  - `desde-cero`   replay en contexto limpio: la garantía fuerte.
 *  - `en-vivo`      comprobado contra la página actual porque el camino previo muta
 *                   negocio y re-ejecutarlo duplicaría operaciones (K0.25/D2).
 *  - `sin-verificar` el QA decidió y la verificación queda aplazada al próximo run con
 *                   datos frescos (P5). Aplazada, no desaparecida.
 */
export type EvidenceGrade = 'desde-cero' | 'en-vivo' | 'sin-verificar';

export const DECISION_KINDS: readonly DecisionKind[] = ['app', 'fd', 'defer'];
export const EVIDENCE_GRADES: readonly EvidenceGrade[] = ['desde-cero', 'en-vivo', 'sin-verificar'];

/** Una decisión, sin el hash: lo que el llamante aporta. */
export interface DecisionInput {
  /** Criterio del FD al que afecta, `RF-NNN` (`criteria.json`). */
  rf: string;
  /** Paso concreto, `<flujo>/<id-de-paso>` — la misma clave que `WalkState.completed`. */
  paso: string;
  decision: DecisionKind;
  /** El valor que el QA adopta cuando la aplicación tiene razón. Ausente si no hay. */
  valor_nuevo?: string;
  /** Huella del FD contra el que se decidió (`hashJson`/`hashText` del criteria.json o del md). */
  fd_hash: string;
  /** Huella del walk-script; misma función que `hashScript` de `copilot/src/walk-core.ts`. */
  script_hash: string;
  evidencia: EvidenceGrade;
  /** Fail-closed: sin actor no hay decisión. */
  actor: string;
  /** ISO 8601. Lo pone `recordDecision` si el llamante no lo trae. */
  timestamp: string;
  /** Hash de la decisión que ésta revoca. Manda la última; la traza queda. */
  supersedes?: string;
}

export interface DecisionEntry extends DecisionInput {
  hash: string;
}

/**
 * Semilla de la cadena. Explícita (y no la cadena vacía) para que borrar la PRIMERA
 * entrada no produzca una cadena que vuelva a cuadrar por casualidad.
 */
export const DECISIONS_GENESIS = 'ia4d-decisions-v1';

const HASH_LEN = 32;

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Huella de un texto (p.ej. el FD en markdown). 16 hex, como el resto del repo. */
export function hashText(text: string): string {
  return sha256(text).slice(0, 16);
}

/**
 * Huella de un artefacto JSON ya parseado. Mismo algoritmo que `hashScript` de
 * `copilot/src/walk-core.ts` — y deliberadamente NO se importa de allí: `src/` es la
 * capa baja (`copilot/src/dom-walker.ts` importa de aquí, no al revés) y meter la
 * dependencia inversa por una línea de crypto ataría el validador al walker entero.
 * La equivalencia con `hashScript` está atada por un test de acoplamiento en
 * `tests/unit/decisions.test.ts`: si una de las dos deriva, la suite se pone roja.
 */
export function hashJson(value: unknown): string {
  return sha256(JSON.stringify(value)).slice(0, 16);
}

/**
 * Serialización canónica de la entrada SIN su hash. Array de pares en orden fijo, no
 * un objeto: el orden queda declarado en el código en vez de depender del orden de
 * inserción de las claves, que es justo lo que se pierde al pasar por un JSON.parse.
 * Los opcionales ausentes NO aparecen (un `valor_nuevo: undefined` y un `valor_nuevo`
 * que nunca existió tienen que dar el mismo hash).
 */
export function canonicalPayload(input: DecisionInput): string {
  const pares: Array<[string, string]> = [
    ['rf', input.rf],
    ['paso', input.paso],
    ['decision', input.decision],
  ];
  if (input.valor_nuevo !== undefined) pares.push(['valor_nuevo', input.valor_nuevo]);
  pares.push(
    ['fd_hash', input.fd_hash],
    ['script_hash', input.script_hash],
    ['evidencia', input.evidencia],
    ['actor', input.actor],
    ['timestamp', input.timestamp],
  );
  if (input.supersedes !== undefined) pares.push(['supersedes', input.supersedes]);
  return JSON.stringify(pares);
}

/** El eslabón: hash de la entrada más el hash de la anterior. */
export function computeHash(input: DecisionInput, prevHash: string): string {
  return sha256(`${prevHash}\n${canonicalPayload(input)}`).slice(0, HASH_LEN);
}

/** Serializa en el orden del schema, para que el .jsonl se lea igual que se documenta. */
export function serializeEntry(entry: DecisionEntry): string {
  const o: Record<string, unknown> = {
    rf: entry.rf,
    paso: entry.paso,
    decision: entry.decision,
  };
  if (entry.valor_nuevo !== undefined) o.valor_nuevo = entry.valor_nuevo;
  o.fd_hash = entry.fd_hash;
  o.script_hash = entry.script_hash;
  o.evidencia = entry.evidencia;
  o.actor = entry.actor;
  o.timestamp = entry.timestamp;
  if (entry.supersedes !== undefined) o.supersedes = entry.supersedes;
  o.hash = entry.hash;
  return JSON.stringify(o);
}

// ------------------------------------------------------------------- actor

/**
 * El actor sale de una variable DECLARADA, nunca de un default amable. Un
 * `actor: 'qa'` inventado por la herramienta convierte la firma en decoración.
 * Devuelve null si no hay nada utilizable — el llamante decide cómo morir.
 */
export function normalizeActor(raw: string | undefined | null): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  // Un actor con salto de línea rompería el JSONL de formas divertidas y difíciles.
  return v.replace(/\s+/g, ' ').slice(0, 120);
}

// ------------------------------------------------------------ lectura

export interface MalformedLine {
  /** Nº de línea en el fichero, 1-based (lo que enseña un editor). */
  line: number;
  reason: string;
  raw: string;
}

export interface ParsedDecisions {
  entries: DecisionEntry[];
  malformed: MalformedLine[];
}

/** ¿Es un objeto con la forma de una entrada? Validación de schema, no de cadena. */
function validateShape(o: Record<string, unknown>): string | null {
  const str = (k: string): string | null => (typeof o[k] === 'string' && (o[k] as string).length > 0 ? (o[k] as string) : null);
  for (const k of ['rf', 'paso', 'fd_hash', 'script_hash', 'timestamp', 'hash']) {
    if (!str(k)) return `falta o vacío el campo '${k}'`;
  }
  if (!normalizeActor(typeof o.actor === 'string' ? o.actor : null)) {
    return "sin 'actor': una decisión anónima no es una decisión (fail-closed)";
  }
  if (!DECISION_KINDS.includes(o.decision as DecisionKind)) {
    return `'decision' inválida (${JSON.stringify(o.decision)}); esperado ${DECISION_KINDS.join(' | ')}`;
  }
  if (!EVIDENCE_GRADES.includes(o.evidencia as EvidenceGrade)) {
    return `'evidencia' inválida (${JSON.stringify(o.evidencia)}); esperado ${EVIDENCE_GRADES.join(' | ')}`;
  }
  if (o.valor_nuevo !== undefined && typeof o.valor_nuevo !== 'string') return "'valor_nuevo' no es texto";
  if (o.supersedes !== undefined && typeof o.supersedes !== 'string') return "'supersedes' no es texto";
  return null;
}

/**
 * Lee un acta. Tolerante al BOM, a CRLF y a líneas en blanco por la misma razón que
 * `parseJsonLoose` del walker: estos ficheros pasan por PowerShell y por editores, y
 * un lector estricto convertiría un BOM en "acta vacía" — que aquí significaría
 * "ninguna decisión que verificar" y daría verde por ausencia.
 */
export function parseDecisions(text: string): ParsedDecisions {
  const entries: DecisionEntry[] = [];
  const malformed: MalformedLine[] = [];
  const lineas = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const [i, cruda] of lineas.entries()) {
    const linea = cruda.trim();
    if (!linea) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(linea);
    } catch (err) {
      malformed.push({ line: i + 1, reason: `JSON ilegible: ${err instanceof Error ? err.message : String(err)}`, raw: linea });
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      malformed.push({ line: i + 1, reason: 'la línea no es un objeto JSON', raw: linea });
      continue;
    }
    const problema = validateShape(parsed as Record<string, unknown>);
    if (problema) {
      malformed.push({ line: i + 1, reason: problema, raw: linea });
      continue;
    }
    entries.push(parsed as DecisionEntry);
  }
  return { entries, malformed };
}

// ------------------------------------------------------------ verificación

export type IssueSeverity = 'error' | 'aviso';

export interface ChainIssue {
  severity: IssueSeverity;
  /** Índice 0-based de la entrada en el acta (−1 si el problema no es de una entrada). */
  index: number;
  rule: 'linea-ilegible' | 'hash-roto' | 'cola-truncada' | 'supersedes-inexistente' | 'supersedes-cruzado' | 'supersedes-repetido';
  detail: string;
}

export interface ChainVerdict {
  ok: boolean;
  total: number;
  /** Hash de la última entrada: el ancla que se puede comparar con un registro externo. */
  head: string | null;
  issues: ChainIssue[];
}

/**
 * Recomputa la cadena entera y señala el PRIMER eslabón roto con su índice.
 *
 * Detalle que importa: al encontrar un hash roto se sigue verificando usando el hash
 * ALMACENADO como eslabón previo, no el recomputado. Si no, una sola alteración
 * marcaría en rojo todas las entradas posteriores y el informe diría "el acta entera
 * está manipulada" cuando lo cierto es "alguien tocó la entrada 2". El QA necesita
 * saber cuál.
 */
export function verifyChain(entries: DecisionEntry[], malformed: MalformedLine[] = []): ChainVerdict {
  const issues: ChainIssue[] = [];
  for (const m of malformed) {
    issues.push({ severity: 'error', index: -1, rule: 'linea-ilegible', detail: `línea ${m.line}: ${m.reason}` });
  }

  const vistos = new Map<string, number>();
  const superseded = new Map<string, number>();
  let prev = DECISIONS_GENESIS;
  for (const [i, e] of entries.entries()) {
    const esperado = computeHash(e, prev);
    if (esperado !== e.hash) {
      issues.push({
        severity: 'error',
        index: i,
        rule: 'hash-roto',
        detail:
          `entrada ${i + 1} (${e.rf} · ${e.paso}, ${e.actor}, ${e.timestamp}): el hash no cuadra ` +
          `— declarado ${e.hash}, recomputado ${esperado}. La entrada fue alterada, o se borró una anterior.`,
      });
    }
    if (e.supersedes !== undefined) {
      const origen = vistos.get(e.supersedes);
      if (origen === undefined) {
        issues.push({
          severity: 'error',
          index: i,
          rule: 'supersedes-inexistente',
          detail: `entrada ${i + 1}: 'supersedes' apunta a ${e.supersedes}, que no es ninguna entrada anterior de este acta.`,
        });
      } else {
        const anterior = entries[origen];
        if (anterior.rf !== e.rf || anterior.paso !== e.paso) {
          issues.push({
            severity: 'aviso',
            index: i,
            rule: 'supersedes-cruzado',
            detail:
              `entrada ${i + 1} (${e.rf} · ${e.paso}) revoca una decisión de otro criterio ` +
              `(${anterior.rf} · ${anterior.paso}). Es legible, pero probablemente sea un error de copia.`,
          });
        }
        const yaRevocada = superseded.get(e.supersedes);
        if (yaRevocada !== undefined) {
          issues.push({
            severity: 'aviso',
            index: i,
            rule: 'supersedes-repetido',
            detail: `entrada ${i + 1}: la entrada ${yaRevocada + 1} ya revocaba ${e.supersedes}. Manda la última, pero la traza queda ambigua.`,
          });
        }
        superseded.set(e.supersedes, i);
      }
    }
    vistos.set(e.hash, i);
    prev = e.hash;
  }

  return {
    ok: issues.every((i) => i.severity !== 'error'),
    total: entries.length,
    head: entries.length > 0 ? entries[entries.length - 1].hash : null,
    issues,
  };
}

/**
 * Los hashes que un registro externo conoce y el acta ya no contiene: la COLA TRUNCADA.
 *
 * Existe porque la cadena no la ve. Borrar las últimas N entradas de un hash chain deja
 * una cadena impecable —no hay nada después que apunte a ellas— y por eso una cadena
 * verde NO significa "el acta está completa". El ancla externa (los hashes que
 * `record-decision` deja en el audit-log, que es otro fichero y otro camino de escritura)
 * es lo único que convierte esa laguna en un hallazgo.
 */
export function huerfanosDeAudit(entries: DecisionEntry[], hashesEnAudit: readonly string[]): string[] {
  const presentes = new Set(entries.map((e) => e.hash));
  return [...new Set(hashesEnAudit)].filter((h) => h && !presentes.has(h));
}

/** Clave de una decisión: el par (criterio, paso). Exportada para que nadie la reinvente. */
export function claveDecision(rf: string, paso: string): string {
  return `${rf} ${paso}`;
}

/**
 * La decisión VIGENTE de cada (rf, paso): manda la última escrita. La traza completa
 * sigue en el fichero — esto es la vista, no la verdad.
 */
export function effectiveDecisions(entries: DecisionEntry[]): Map<string, DecisionEntry> {
  const vigente = new Map<string, DecisionEntry>();
  for (const e of entries) vigente.set(claveDecision(e.rf, e.paso), e);
  return vigente;
}

// ------------------------------------------------------------ escritura

/** `config/decisions/<site>.jsonl`, al lado de los hint-aliases y por el mismo motivo. */
export function decisionsPathFor(siteId: string, root: string = process.cwd()): string {
  const seguro = siteId.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!seguro) throw new Error('site_id vacío: no hay acta a la que escribir');
  return resolve(root, 'config/decisions', `${seguro}.jsonl`);
}

export interface AppendResult {
  entry: DecisionEntry;
  path: string;
  /** Nº de entradas del acta DESPUÉS de escribir. */
  total: number;
}

/**
 * Añade una decisión al final del acta, encadenada a la que hubiera.
 *
 * Se niega a escribir sobre un acta con la cadena rota: si ya hay una manipulación,
 * encadenar encima la sella y la vuelve indistinguible de una decisión legítima.
 * Fuerza a resolver primero, que es lo correcto y además es barato (`check-decisions`
 * dice exactamente qué entrada).
 */
export function appendDecision(input: Omit<DecisionInput, 'timestamp'> & { timestamp?: string }, path: string): AppendResult {
  const actor = normalizeActor(input.actor);
  if (!actor) throw new Error("sin 'actor': una decisión anónima no se registra (fail-closed). Declara QA_ACTOR o pasa --actor=");
  if (!DECISION_KINDS.includes(input.decision)) {
    throw new Error(`'decision' inválida: ${JSON.stringify(input.decision)} (esperado ${DECISION_KINDS.join(' | ')})`);
  }
  if (!EVIDENCE_GRADES.includes(input.evidencia)) {
    throw new Error(`'evidencia' inválida: ${JSON.stringify(input.evidencia)} (esperado ${EVIDENCE_GRADES.join(' | ')})`);
  }
  for (const k of ['rf', 'paso', 'fd_hash', 'script_hash'] as const) {
    if (!input[k] || !String(input[k]).trim()) throw new Error(`falta '${k}': la decisión no sería trazable sin él`);
  }

  const previas = existsSync(path) ? parseDecisions(readFileSync(path, 'utf8')) : { entries: [], malformed: [] };
  const verdict = verifyChain(previas.entries, previas.malformed);
  if (!verdict.ok) {
    const primero = verdict.issues.find((i) => i.severity === 'error');
    throw new Error(
      `el acta ${path} tiene la cadena rota y no se encadena encima — ${primero?.detail ?? 'sin detalle'}\n` +
        `  Resuélvelo antes: tsx src/scripts/check-decisions.ts --file=${path}`,
    );
  }

  const completa: DecisionInput = {
    rf: String(input.rf).trim(),
    paso: String(input.paso).trim(),
    decision: input.decision,
    ...(input.valor_nuevo !== undefined ? { valor_nuevo: input.valor_nuevo } : {}),
    fd_hash: String(input.fd_hash).trim(),
    script_hash: String(input.script_hash).trim(),
    evidencia: input.evidencia,
    actor,
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...(input.supersedes !== undefined ? { supersedes: input.supersedes } : {}),
  };
  const entry: DecisionEntry = { ...completa, hash: computeHash(completa, verdict.head ?? DECISIONS_GENESIS) };

  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(path, serializeEntry(entry) + '\n', { encoding: 'utf8' });
  return { entry, path, total: verdict.total + 1 };
}

/**
 * La huella de un artefacto de entrada (el FD, el guion) tal como la guarda una
 * decisión: `fd_hash` y `script_hash` dicen **contra qué** se decidió, y sin ellos
 * una decisión vieja no se puede volver a situar.
 *
 * Vive AQUÍ y no en cada firmante a propósito. Cuando se escribió sólo firmaba
 * `record-decision.ts`; con la fusión de parches ya eran dos copias, y con el
 * veredicto del panel iban a ser tres. Tres copias de la misma regla es la familia
 * D2 servida: el día que una decida normalizar el BOM o los saltos de línea de otra
 * forma, las decisiones de los tres firmantes dejan de ser comparables entre sí y
 * nadie se entera, porque cada una sigue siendo internamente coherente.
 *
 * JSON parseable → se hashea el objeto (así el `script_hash` de un walk-script
 * coincide con el que calcula el walker); si no parsea, el texto crudo — un FD en
 * markdown no es JSON. El BOM se quita antes de intentar el parseo y no después:
 * un fichero escrito por PowerShell trae BOM y sin quitarlo caería siempre al
 * camino de texto, dando una huella distinta a la del mismo fichero sin BOM.
 */
export function huellaDeArtefacto(path: string): string {
  const abs = resolve(path);
  if (!existsSync(abs)) throw new Error(`no existe ${abs}`);
  const texto = readFileSync(abs, 'utf8');
  try {
    return hashJson(JSON.parse(texto.replace(/^\uFEFF/, '')));
  } catch {
    return hashText(texto);
  }
}
