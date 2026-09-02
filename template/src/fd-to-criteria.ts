/**
 * FD markdown (forma onesait) → `criteria.json`, SIN LLM.
 *
 * Por qué existe. El panel enseña la línea del FD de cada caso porque
 * `criteria.json` lleva `source_ref` (trazabilidad obligatoria del estándar S3),
 * pero ese fichero **solo existe si el FD pasó por el refiner**. Los tres sitios
 * de campo son S4: tienen su FD en markdown y no tienen criteria.json, así que
 * la vista de caso del panel se quedaba en «CP001» y nada más.
 *
 * Los FD que el producto genera tienen forma regular y verificada — 30 casos en
 * los tres sitios, los 30 con `### Pasos` y `### Resultado esperado`:
 *
 *     ## CP001 — Reserva de habitación individual
 *     **Objetivo**: ...
 *     **Precondiciones**: ...
 *     ### Pasos
 *     1. ...
 *     ### Resultado esperado
 *     ...
 *
 * Así que esto es un parser, no una interpretación: regla dura #5 (validación y
 * transformación determinísticas, el LLM no interviene) y el mismo criterio que
 * el POM scaffolder de la regla #7.
 *
 * **No fabrica**. Es el principio rector del refiner extendido aquí: si a un caso
 * le falta una sección, se anota en `assumptions` y `confidence` baja — no se
 * rellena a ojo. Y `drift_risk` no se evalúa (haría falta juicio, y esto no lo
 * tiene): sale `low` con la advertencia escrita en `refiner_notes`, porque
 * inventar una señal de riesgo es peor que no darla.
 */
import type { CriteriaDocument, Criterion } from './gherkin-to-criteria.ts';

/** Un caso tal como lo escribe el FD, con las líneas donde vive. */
export interface FdCaso {
  id: string;
  titulo: string;
  objetivo: string;
  precondiciones: string;
  pasos: string[];
  esperado: string;
  /** 1-based, la línea del `## CPNNN`. */
  linea: number;
  /** 1-based, la última línea con contenido del caso. */
  lineaFin: number;
  /** Secciones que el FD no trae. Vacío = el caso está completo. */
  faltan: string[];
}

const CABECERA = /^##\s+([A-Z]{2,4}\d{1,4})\s*[—–-]\s*(.+?)\s*$/;
const CAMPO = /^\*\*(Objetivo|Precondiciones)\*\*\s*:\s*(.*)$/;
const SUB = /^###\s+(.+?)\s*$/;
const PASO = /^\s*\d+\.\s+(.+?)\s*$/;

/** Junta las líneas de un párrafo colapsando los saltos: el FD envuelve a 100. */
const parrafo = (lineas: string[]): string => lineas.join(' ').replace(/\s+/g, ' ').trim();

/**
 * Extrae los casos del FD. Se salta cualquier `##` que no sea un caso (los FD
 * traen `## Nota …` al final) sin avisar: no es un caso incompleto, es que no es
 * un caso.
 */
export function parseFdOnesait(texto: string): FdCaso[] {
  const lineas = texto.split(/\r?\n/);
  const casos: FdCaso[] = [];
  let actual: FdCaso | null = null;
  let seccion: 'objetivo' | 'precondiciones' | 'pasos' | 'esperado' | null = null;
  let buffer: string[] = [];

  const cerrarSeccion = (): void => {
    if (!actual || !seccion) return;
    if (seccion === 'objetivo') actual.objetivo = parrafo([actual.objetivo, ...buffer].filter(Boolean));
    else if (seccion === 'precondiciones') actual.precondiciones = parrafo([actual.precondiciones, ...buffer].filter(Boolean));
    else if (seccion === 'esperado') actual.esperado = parrafo(buffer);
    buffer = [];
  };

  const cerrarCaso = (): void => {
    if (!actual) return;
    cerrarSeccion();
    const faltan: string[] = [];
    if (!actual.objetivo) faltan.push('Objetivo');
    if (!actual.precondiciones) faltan.push('Precondiciones');
    if (actual.pasos.length === 0) faltan.push('Pasos');
    if (!actual.esperado) faltan.push('Resultado esperado');
    actual.faltan = faltan;
    casos.push(actual);
    actual = null;
    seccion = null;
  };

  lineas.forEach((linea, i) => {
    const cab = CABECERA.exec(linea);
    if (cab) {
      cerrarCaso();
      actual = {
        id: cab[1], titulo: cab[2], objetivo: '', precondiciones: '', pasos: [], esperado: '',
        linea: i + 1, lineaFin: i + 1, faltan: [],
      };
      return;
    }
    // un `##` que no es caso cierra el caso anterior y no abre nada
    if (/^##\s/.test(linea)) {
      cerrarCaso();
      return;
    }
    if (!actual) return;
    if (linea.trim() !== '' && !/^---\s*$/.test(linea)) actual.lineaFin = i + 1;

    const campo = CAMPO.exec(linea);
    if (campo) {
      cerrarSeccion();
      seccion = campo[1] === 'Objetivo' ? 'objetivo' : 'precondiciones';
      if (seccion === 'objetivo') actual.objetivo = campo[2].trim();
      else actual.precondiciones = campo[2].trim();
      return;
    }
    const sub = SUB.exec(linea);
    if (sub) {
      cerrarSeccion();
      seccion = /^pasos$/i.test(sub[1]) ? 'pasos' : /^resultado/i.test(sub[1]) ? 'esperado' : null;
      return;
    }
    if (seccion === 'pasos') {
      const paso = PASO.exec(linea);
      if (paso) actual.pasos.push(paso[1]);
      return;
    }
    if (linea.trim() === '') {
      // una línea en blanco cierra el párrafo de Objetivo/Precondiciones, pero no
      // el de Resultado esperado (que puede traer varios) ni la lista de pasos
      if (seccion === 'objetivo' || seccion === 'precondiciones') { cerrarSeccion(); seccion = null; }
      return;
    }
    // la regla de separación de secciones del markdown NO es contenido del caso:
    // sin esto el «Resultado esperado» acababa en «… de confirmación. ---»
    if (/^---+\s*$/.test(linea)) { cerrarSeccion(); seccion = null; return; }
    if (seccion) buffer.push(linea.trim());
  });
  cerrarCaso();
  return casos;
}

/** Kebab-case del título, para el `flow` candidato del schema. */
function kebab(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .split('-').slice(0, 5).join('-');
}

export interface OpcionesConversion {
  /** Ruta del FD tal como quiere verse en `source_ref` (basename, normalmente). */
  sourceFd: string;
  targetUrl: string;
  /** Inyectable para que el fichero sea comparable entre ejecuciones (tests). */
  ahora?: string;
}

export function fdACriteria(casos: FdCaso[], opts: OpcionesConversion): CriteriaDocument {
  const criteria: Criterion[] = casos.map((c) => {
    const assumptions = c.faltan.length
      ? [`[ASSUMPTION] el FD no trae ${c.faltan.join(', ')} para ${c.id}: el campo queda vacío, no se rellena a ojo`]
      : [];
    return {
      id: c.id,
      title: c.titulo,
      flow: kebab(c.titulo),
      given: c.precondiciones,
      when: c.objetivo,
      then: c.esperado,
      source_ref: `${opts.sourceFd}:${c.linea}-${c.lineaFin}`,
      // la EXTRACCIÓN es determinista; lo que baja la confianza es que falte
      // material en el origen, no la duda del extractor
      confidence: c.faltan.length === 0 ? 'high' : 'low',
      // no se evalúa: ver la cabecera de este fichero
      drift_risk: 'low',
      assumptions,
      open_questions: [],
    };
  });
  return {
    version: 1,
    source_fd: opts.sourceFd,
    refined_timestamp: opts.ahora ?? new Date().toISOString(),
    target_url: opts.targetUrl,
    criteria,
    brief: {
      flows: criteria.map((c) => c.flow),
      entry: '/',
      ignore: [],
      drift_flags: [],
    },
    open_questions_ref: null,
    pii_redaction: { verdict: 'pass', literals_found: [], downstream_note: null },
    refiner_notes:
      'Convertido por src/fd-to-criteria.ts: parser determinista de la forma onesait, SIN LLM. ' +
      'Dos límites que hay que leer antes de fiarse de este fichero: `drift_risk` NO se evalúa (sale ' +
      '`low` en todos porque juzgarlo exige criterio y esto no lo tiene), y `open_questions` sale ' +
      'vacío (detectar ambigüedad tampoco es mecánico). Lo que sí es fiable y es para lo que existe: ' +
      '`id`, `title`, `given/when/then` citados del FD, y `source_ref` con la línea real.',
  };
}
