/**
 * El ancla de una decisión en el audit-log.
 *
 * Vivía dentro de `src/scripts/record-decision.ts`, y ahí estaba bien mientras hubo un
 * solo firmante. Con dos —el registro a mano y la fusión de parches— copiarla sería
 * exactamente la familia D2: dos copias de la misma regla que derivan en silencio, y
 * el día que una añada un campo el cruce de `check-decisions --audit` deja de cuadrar
 * para las decisiones de la otra.
 *
 * Y lo que hay aquí no es decoración: **es lo único que caza la cola truncada**.
 * Borrar las últimas N entradas del acta deja una cadena de hashes impecable —no hay
 * nada después que apunte a ellas—, así que la única forma de notarlo es que el
 * audit-log, que es otro fichero y otro camino de escritura, recuerde un hash que el
 * acta ya no contiene.
 */
import { appendAuditEntry } from './audit-log.ts';
import type { DecisionEntry } from './decisions.ts';

/** La regla con la que `check-decisions --audit` reconoce estas entradas. Un solo sitio. */
export const REGLA_DECISION_ANCLADA = 'decision-recorded';

/**
 * Deja constancia de una decisión firmada en el audit-log del run.
 *
 * `metadata.hash` es el campo que importa: es el que se cruza contra el acta. Todo lo
 * demás es para que la entrada sea legible sin abrir el `.jsonl`.
 *
 * `contexto` permite a quien firma añadir sus propios datos —por ejemplo, qué parche
 * se fundió y con qué hash quedó el guion— sin tocar esta función ni inventar otra
 * regla. Nunca pisa los campos propios de la decisión.
 */
export function anclarDecisionEnAudit(
  entry: DecisionEntry,
  site: string,
  auditPath: string,
  contexto?: Record<string, unknown>,
): void {
  appendAuditEntry(
    {
      source: 'command',
      action: 'allow',
      target: `decision:${site}`,
      rule: REGLA_DECISION_ANCLADA,
      reason: `${entry.rf} · ${entry.paso}: ${entry.decision} (${entry.evidencia}) por ${entry.actor}`,
      result: 'pass',
      metadata: {
        ...(contexto ?? {}),
        hash: entry.hash,
        rf: entry.rf,
        paso: entry.paso,
        decision: entry.decision,
        evidencia: entry.evidencia,
        ...(entry.supersedes ? { supersedes: entry.supersedes } : {}),
      },
    },
    auditPath,
  );
}
