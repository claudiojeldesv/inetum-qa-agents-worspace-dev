/**
 * Contabilidad de coste de un run — la parte determinista.
 *
 * Existe porque tras tres runs de campo la pregunta «¿cuánto costó?» solo se podía
 * responder reconstruyéndolo a mano desde un transcript pegado en un chat. Para un
 * producto cuyo argumento incluye «coste evitado», eso es un defecto: sin medida no
 * se puede demostrar una mejora, solo contarla.
 *
 * Dos decisiones de diseño que importan más que el cálculo:
 *
 * 1. **No se inventan los actos.** La tentación era mapear cada entrada del audit-log
 *    a uno de los cinco actos del marco QA. Ese mapeo lo escribiría yo, no el
 *    productor, y sería una traducción más que envejece en silencio — la clase de
 *    defecto que llevamos cuatro instancias persiguiendo (D2). Se agrupa por el
 *    vocabulario que el audit-log YA emite (`rule`, o `metadata.phase`, o `action`)
 *    y se reporta verbatim. Si mañana un command emite una regla nueva, aparece sola.
 *
 * 2. **Los HUECOS son la métrica estrella**, no la suma por grupo. Lo que se comió
 *    los runs 2 y 3 no fue trabajo: fueron esperas — 27 min mirando a un subagente
 *    de 3 min (D13), 15 min por otro de 1m23s, 10 min de un panel abierto que murió
 *    por SIGTERM (D23). Un hueco grande entre dos entradas consecutivas del audit es
 *    exactamente la firma de esa clase, y ordenarlos la pone arriba sin que nadie
 *    tenga que sospecharla.
 *
 * 3. **Un hueco no se etiqueta como espera sin saber quién lo consumió.** Esta
 *    herramienta ya mintió una vez por eso: en el run del 2026-08-21 anunció «95,5%
 *    del activo en esperas» cuando el hueco mayor (14m42s) era un Writer TRABAJANDO.
 *    El audit-log solo se escribe cuando alguien toca un fichero, así que el silencio
 *    de un subagente produce la misma firma que un orquestador ocioso. La única forma
 *    de separarlos es que el orquestador MARQUE el lanzamiento (`audit-mark
 *    --task-start`): un hueco precedido por esa marca es trabajo ajeno. Sin marcas,
 *    `markers_present` sale a false y el informe DECLARA que no puede atribuir — un
 *    número que no sabe lo que mide es peor que ninguno, y esa lección salió de aquí.
 */

/** Una entrada del audit-log. Campos mínimos garantizados: `timestamp`. */
export interface AuditEntry {
  timestamp: string;
  source?: string;
  action?: string;
  rule?: string;
  reason?: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

export interface CostGroup {
  /** El vocabulario del propio audit-log, sin traducir. */
  label: string;
  entries: number;
  /** Desde la primera a la última entrada del grupo. NO es tiempo de CPU. */
  span_ms: number;
}

export interface CostGap {
  ms: number;
  from_iso: string;
  to_iso: string;
  /** Qué se registró justo ANTES del silencio: es lo que estaba en marcha. */
  after: string;
  /** Qué lo rompió: es lo que se estaba esperando. */
  before: string;
  /**
   * Quién consumió el hueco. `subagente` SOLO cuando la entrada anterior es una marca
   * `task-start`: ahí el silencio es trabajo ajeno y llamarlo espera es una mentira.
   * Sin marcas todo cae en `orquestador`, y por eso el informe declara su ceguera.
   */
  kind: 'orquestador' | 'subagente';
}

export interface CostReport {
  entries: number;
  started: string | null;
  ended: string | null;
  wall_ms: number | null;
  /** Reloj menos las pausas humanas: el tiempo que el run estuvo realmente en marcha. */
  active_ms: number | null;
  groups: CostGroup[];
  /** Esperas del ORQUESTADOR: silencios largos pero plausiblemente automáticos. */
  gaps: CostGap[];
  /**
   * Pausas de PERSONA: silencios tan largos que no puede haberlos causado el
   * producto. Se separan porque mezclarlas con las esperas produce una cifra falsa
   * — la primera versión de este informe dijo «94,6% del reloj perdido» sobre un run
   * que había pasado la noche parado. Un número que miente es peor que ninguno.
   */
  pauses: CostGap[];
  /**
   * Huecos que consumió un SUBAGENTE (precedidos por una marca `task-start`). Es
   * trabajo del producto, no espera muerta: se reportan aparte para que no engorden
   * la cifra de esperas, que es la que se usa para decidir dónde optimizar.
   */
  subagent_gaps: CostGap[];
  gap_ms: number;
  /** Peso de las esperas DEL ORQUESTADOR sobre el tiempo ACTIVO, no sobre el reloj. */
  gap_pct: number | null;
  pause_ms: number;
  subagent_ms: number;
  /**
   * ¿Hay marcas `task-start` en el log? Si no, la separación orquestador/subagente no
   * se puede hacer y `gaps` incluye trabajo ajeno. El informe lo dice en voz alta en
   * vez de publicar un porcentaje que no sabe lo que mide.
   */
  markers_present: boolean;
}

/** Etiqueta de agrupación: el vocabulario del productor, en orden de especificidad. */
export function labelOf(e: AuditEntry): string {
  const phase = e.metadata?.phase;
  if (typeof e.rule === 'string' && e.rule) return e.rule;
  if (typeof phase === 'string' && phase) return phase;
  return e.action ?? 'sin-etiqueta';
}

/** Descripción corta de una entrada, para explicar un hueco sin volcar el JSON. */
export function describe(e: AuditEntry): string {
  const base = labelOf(e);
  const act = e.action && e.action !== base ? `${e.action}/${base}` : base;
  return e.target ? `${act} (${e.target})` : act;
}

/**
 * Lector TOLERANTE del audit-log: acepta JSONL (una entrada por línea, que es como
 * lo escribe el hook) y también un array JSON. La lección de K0.43 aplicada: un
 * consumidor más estricto que su productor bloquea datos perfectamente válidos, y
 * este fichero pasa por hooks, editores y PowerShell. Las líneas ilegibles se
 * descartan contándolas, nunca tumban el informe.
 */
export function parseAuditLog(raw: string): { entries: AuditEntry[]; skipped: number } {
  const texto = raw.replace(/^﻿/, '').trim();
  if (!texto) return { entries: [], skipped: 0 };
  if (texto.startsWith('[')) {
    try {
      const arr = JSON.parse(texto) as AuditEntry[];
      return { entries: arr.filter((e) => e && typeof e.timestamp === 'string'), skipped: 0 };
    } catch {
      /* cae al modo línea a línea: un array a medio escribir sigue teniendo líneas útiles */
    }
  }
  const entries: AuditEntry[] = [];
  let skipped = 0;
  for (const linea of texto.split('\n')) {
    const l = linea.trim().replace(/,$/, '');
    if (!l || l === '[' || l === ']') continue;
    try {
      const e = JSON.parse(l) as AuditEntry;
      if (e && typeof e.timestamp === 'string') entries.push(e);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { entries, skipped };
}

/**
 * Por encima de esto, el silencio ya no lo explica el producto: es una persona que
 * se ha ido. 45 min con holgura sobre la peor espera de orquestador MEDIDA (27 min,
 * D13) — el umbral se mueve si algún día se mide una mayor, pero no se adivina.
 */
export const PAUSA_HUMANA_MS = 45 * 60_000;

/**
 * La `rule` que el orquestador escribe con `audit-mark --task-start` justo antes de
 * lanzar un subagente. Es el único dato que permite distinguir «orquestador ocioso»
 * de «subagente trabajando», y sin él este informe no puede atribuir el reloj.
 */
export const MARCA_INICIO = 'task-start';

/**
 * @param gapThresholdMs silencio mínimo para considerarse hueco. 60 s por defecto:
 *   por debajo de un minuto es trabajo normal del orquestador, no espera muerta.
 * @param topGaps cuántos listar.
 * @param pausaMs a partir de aquí el silencio se contabiliza como pausa humana.
 */
export function computeCost(
  entries: AuditEntry[],
  gapThresholdMs = 60_000,
  topGaps = 8,
  pausaMs = PAUSA_HUMANA_MS,
): CostReport {
  const orden = [...entries]
    .map((e) => ({ e, t: Date.parse(e.timestamp) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);

  if (orden.length === 0) {
    return {
      entries: 0, started: null, ended: null, wall_ms: null, active_ms: null,
      groups: [], gaps: [], pauses: [], subagent_gaps: [], gap_ms: 0, gap_pct: null,
      pause_ms: 0, subagent_ms: 0, markers_present: false,
    };
  }

  const wall = orden[orden.length - 1].t - orden[0].t;
  const markersPresent = orden.some((x) => x.e.rule === MARCA_INICIO);

  const gaps: CostGap[] = [];
  const pauses: CostGap[] = [];
  const subagentGaps: CostGap[] = [];
  for (let i = 1; i < orden.length; i++) {
    const ms = orden[i].t - orden[i - 1].t;
    if (ms < gapThresholdMs) continue;
    /**
     * La entrada ANTERIOR es la que dice quién consumió el silencio: si fue un
     * `task-start`, el orquestador lanzó y terminó su turno, y lo que pasó después
     * es el subagente trabajando. Cualquier otra cosa antes del hueco y el silencio
     * es del orquestador.
     */
    const kind: CostGap['kind'] = orden[i - 1].e.rule === MARCA_INICIO ? 'subagente' : 'orquestador';
    const hueco: CostGap = {
      ms,
      from_iso: orden[i - 1].e.timestamp,
      to_iso: orden[i].e.timestamp,
      after: describe(orden[i - 1].e),
      before: describe(orden[i].e),
      kind,
    };
    // una pausa humana sigue siendo pausa aunque caiga tras un task-start: nadie
    // tiene un subagente corriendo 45 min sin que el harness lo haya matado
    if (ms >= pausaMs) pauses.push(hueco);
    else if (kind === 'subagente') subagentGaps.push(hueco);
    else gaps.push(hueco);
  }
  gaps.sort((a, b) => b.ms - a.ms);
  pauses.sort((a, b) => b.ms - a.ms);
  subagentGaps.sort((a, b) => b.ms - a.ms);
  const pauseMs = pauses.reduce((s, g) => s + g.ms, 0);
  const subagentMs = subagentGaps.reduce((s, g) => s + g.ms, 0);
  const activo = wall - pauseMs;

  /**
   * Tiempo ATRIBUIDO, no ventana: de cada entrada al siguiente evento, con el
   * intervalo topado a la pausa humana. La primera versión medía primera↔última
   * entrada del grupo y una pausa nocturna en medio inflaba `review_decision` a
   * 10 h — dijo dónde había entradas, no dónde se fue el tiempo.
   */
  const porGrupo = new Map<string, { entries: number; ms: number }>();
  for (let i = 0; i < orden.length; i++) {
    const k = labelOf(orden[i].e);
    const bruto = i + 1 < orden.length ? orden[i + 1].t - orden[i].t : 0;
    const attr = bruto >= pausaMs ? 0 : bruto;
    const g = porGrupo.get(k);
    if (g) {
      g.entries += 1;
      g.ms += attr;
    } else {
      porGrupo.set(k, { entries: 1, ms: attr });
    }
  }
  const groups = [...porGrupo.entries()]
    .map(([label, g]) => ({ label, entries: g.entries, span_ms: g.ms }))
    .sort((a, b) => b.span_ms - a.span_ms || b.entries - a.entries);

  const listados = gaps.slice(0, topGaps);
  const gapMs = listados.reduce((s, g) => s + g.ms, 0);

  return {
    entries: orden.length,
    started: orden[0].e.timestamp,
    ended: orden[orden.length - 1].e.timestamp,
    wall_ms: wall,
    active_ms: activo,
    groups,
    gaps: listados,
    pauses,
    subagent_gaps: subagentGaps.slice(0, topGaps),
    gap_ms: gapMs,
    gap_pct: activo > 0 ? Math.round((gapMs / activo) * 1000) / 10 : null,
    pause_ms: pauseMs,
    subagent_ms: subagentMs,
    markers_present: markersPresent,
  };
}

/** `1h 14m 29s` / `3m 24s` / `812ms` — para leer una tabla sin dividir a mano. */
export function fmtMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
