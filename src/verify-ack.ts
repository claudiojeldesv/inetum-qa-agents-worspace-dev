/**
 * verify-ack — el acuse de un subagente se comprueba contra el disco, no se cree.
 *
 * Existe por D28, medido en el run del 2026-08-21: el Writer del auth setup devolvió
 * `{"ok":true,"files":["tests/e2e/parabank-fd/auth.setup.ts"]}` sobre un fichero que
 * no existía en ningún sitio y sin entrada en el audit-log. El orquestador lo dio por
 * bueno y el defecto salió tres actos más tarde, costando una reanudación de Writer
 * (~$7) y ~4 turnos de bucle principal.
 *
 * D28 no es un accidente: es la consecuencia lógica de la palanca 2. Al pedirle a los
 * subagentes que devuelvan un acuse compacto en vez de contar lo que hicieron, se
 * gana contexto y se PIERDE la capacidad de detectar la mentira leyendo su prosa. El
 * intercambio sale a cuenta solo si el acuse se verifica, y verificarlo es mirar el
 * disco: coste en contexto cero, coste en tokens cero.
 *
 * Dos decisiones que importan más que el cálculo:
 *
 * 1. **El parser es tolerante con la forma del acuse.** La palanca 2 se cumple de
 *    forma desigual — medido en el mismo run: bajo redacción enfática el subagente
 *    devolvió JSON puro, bajo redacción suave le añadió tres párrafos de hallazgos.
 *    Un parser que exija JSON puro rechazaría acuses cuyo contenido es correcto, que
 *    es la clase de defecto de K0.43 (consumidor más estricto que su productor). Se
 *    extrae el objeto del texto que lo rodee.
 *
 * 2. **Mentir y no dejar rastro son dos verdictos distintos.** Un fichero que no
 *    existe invalida el acuse (exit 2, el run no puede seguir creyéndoselo). Un
 *    fichero que existe pero no tiene entrada en el audit es una laguna de
 *    trazabilidad (D30: dos entradas `write_file` para tres specs) — se reporta sin
 *    tumbar el run, porque el trabajo sí está hecho y abortarlo no lo arregla.
 */

/** Lo que un subagente declara haber hecho. `files` es el único campo que se verifica. */
export interface SubagentAck {
  ok?: boolean;
  files: string[];
  verdict?: string;
  note?: string;
}

/** Resultado de mirar el disco para UN fichero declarado. */
export interface AckFileVerdict {
  file: string;
  /**
   * La ruta ABSOLUTA que se comprobo de verdad. Se conserva porque un acuse llega en
   * rutas relativas y se resuelve contra el cwd: medido en el smoke test de esta misma
   * herramienta, ejecutarla desde el repo equivocado verifico un fichero DISTINTO con
   * la misma ruta relativa (1514 vs 1497 bytes) y anuncio «acuse verificado». Una cifra
   * huerfana de su fuente se atribuye mal — la leccion de `tokens_source` en run-cost.
   */
  resolved?: string;
  exists: boolean;
  bytes: number;
  /** ¿Hay una entrada en el audit-log que nombre este fichero? (trazabilidad, D30) */
  audited: boolean;
  /** Por qué el acuse falla sobre este fichero. Ausente si está correcto. */
  problem?: string;
}

export interface AckVerdict {
  /** El acuse dice la verdad: todo lo declarado existe y tiene contenido. */
  truthful: boolean;
  claimed: number;
  files: AckFileVerdict[];
  /** Declarados y ausentes o vacíos: el caso D28. Invalidan el acuse. */
  liars: string[];
  /** Existen pero sin rastro en el audit: laguna de trazabilidad (D30), no bloquea. */
  untraced: string[];
  /** El subagente dijo `ok:false` — no es una mentira, es un fallo declarado. */
  self_reported_failure: boolean;
  exit: 0 | 2;
}

/** Cómo se mira el disco. Inyectable para poder probar el veredicto sin tocar ficheros. */
export type FileProbe = (file: string) => { exists: boolean; bytes: number; resolved?: string };

/**
 * Extrae el acuse del texto que devolvió el subagente. Acepta JSON puro (la forma
 * pedida) y también un objeto JSON envuelto en prosa (la forma que la palanca 2
 * produce cuando la redacción no es enfática). Devuelve null si no hay nada
 * parseable con un array `files`.
 */
export function parseAck(raw: string): SubagentAck | null {
  const texto = raw.replace(/^﻿/, '').trim();
  if (!texto) return null;

  const intentar = (s: string): SubagentAck | null => {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      if (!o || typeof o !== 'object') return null;
      if (!Array.isArray(o.files)) return null;
      const files = o.files.filter((f): f is string => typeof f === 'string' && f.trim().length > 0);
      return {
        files: files.map((f) => f.trim()),
        ...(typeof o.ok === 'boolean' ? { ok: o.ok } : {}),
        ...(typeof o.verdict === 'string' ? { verdict: o.verdict } : {}),
        ...(typeof o.note === 'string' ? { note: o.note } : {}),
      };
    } catch {
      return null;
    }
  };

  const directo = intentar(texto);
  if (directo) return directo;

  // objeto embebido en prosa o en un fence markdown: se escanean los `{` balanceando
  // llaves, y se devuelve el PRIMERO que parsee con un array `files`
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] !== '{') continue;
    let nivel = 0;
    let enCadena = false;
    let escape = false;
    for (let j = i; j < texto.length; j++) {
      const c = texto[j];
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { enCadena = !enCadena; continue; }
      if (enCadena) continue;
      if (c === '{') nivel += 1;
      else if (c === '}') {
        nivel -= 1;
        if (nivel === 0) {
          const cand = intentar(texto.slice(i, j + 1));
          if (cand) return cand;
          break; // ese objeto no servía: se sigue buscando desde el siguiente `{`
        }
      }
    }
  }
  return null;
}

/** El nombre de fichero, sin ruta ni separador de plataforma. */
export function baseName(file: string): string {
  const norm = file.replace(/\\/g, '/');
  return norm.slice(norm.lastIndexOf('/') + 1);
}

/**
 * ¿El acuse dice la verdad? Verdicto puro: recibe lo declarado, una sonda de disco y
 * los `target` que el audit-log ya registró.
 *
 * @param minBytes tamaño mínimo para considerar que el fichero tiene contenido. Un
 *   spec de 0 bytes existe y no sirve de nada; el default 1 solo excluye el vacío
 *   absoluto, sin inventar un umbral de "suficientemente largo" que nadie ha medido.
 */
export function verifyAck(
  ack: SubagentAck,
  probe: FileProbe,
  auditTargets: string[] = [],
  minBytes = 1,
): AckVerdict {
  const auditados = new Set(auditTargets.map(baseName));
  const files: AckFileVerdict[] = ack.files.map((file) => {
    const { exists, bytes, resolved } = probe(file);
    const audited = auditados.has(baseName(file));
    const base = { file, ...(resolved ? { resolved } : {}), exists, bytes, audited };
    if (!exists) return { ...base, problem: 'declarado en el acuse y NO existe en el disco' };
    if (bytes < minBytes) return { ...base, problem: `existe pero está vacío (${bytes} bytes)` };
    return base;
  });

  const liars = files.filter((f) => f.problem).map((f) => f.file);
  const untraced = files.filter((f) => !f.problem && !f.audited).map((f) => f.file);
  const selfFail = ack.ok === false;

  return {
    truthful: liars.length === 0,
    claimed: ack.files.length,
    files,
    liars,
    untraced,
    self_reported_failure: selfFail,
    exit: liars.length === 0 ? 0 : 2,
  };
}
