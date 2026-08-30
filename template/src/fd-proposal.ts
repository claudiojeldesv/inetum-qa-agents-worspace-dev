/**
 * Fase C — la propuesta de FD corregido (`<fd>.propuesta.md`).
 *
 * El FD siempre fue entrada; esto NO lo cambia: el producto no reescribe el
 * documento del cliente. Emite uno APARTE, por plantilla determinista, derivado
 * SOLO de decisiones firmadas en el acta y de hechos medidos (el guion actual y
 * el original anclado). Nada redactado a ojo (regla dura #5): si un cambio no se
 * puede ubicar en el texto con certeza, se dice — no se adivina.
 *
 * Qué entra y qué no, por diseño (plan del panel, P5 fase C):
 *  - un veredicto `app` con literal → sustitución del criterio, con su origen;
 *  - un `app` de elemento (fusión) → renombrado, reconstruido del original
 *    anclado contra el guion fundido (la decisión no lleva literal a propósito);
 *  - un `fd` → el FD se SOSTIENE: va al anexo como defecto declarado de la
 *    aplicación, sin tocar el cuerpo;
 *  - un `defer` → no aparece. Está sin decidir, y una propuesta que enseña lo
 *    indeciso como si fuera cambio fabrica exactamente lo que el acta impide.
 *
 * Este módulo es puro: cero fs, cero reloj (la fecha de generación NO existe —
 * la versión de la propuesta es el hash de cabeza del acta, que sí es un hecho).
 */
import type { DecisionEntry } from './decisions.ts';

// ---------------------------------------------------------------- tipos guion

/** Lo mínimo que esta capa necesita saber de un walk-script. `src/` no importa
 * de `copilot/src/` (dirección fijada), así que el tipo es local y hay un test
 * de acoplamiento que lo mantiene honesto contra el vocabulario del walker. */
export interface PasoDeGuion {
  id: string;
  action: string;
  value?: string;
  hint?: { role?: string; name?: string; label?: string; text?: string; test_id?: string };
}
export interface FlujoDeGuion {
  flow: string;
  criteria?: string[];
  steps: PasoDeGuion[];
}
export interface GuionMinimo {
  site_id: string;
  flows: FlujoDeGuion[];
}

/** ¿El paso observa (oráculo) o mueve la aplicación (elemento/coreografía)?
 * Misma frontera que `ACCIONES_QUE_OBSERVAN` del walker; el test de acoplamiento
 * pone la suite roja si las dos derivan. */
export function esPasoDeOraculo(action: string): boolean {
  return action.startsWith('expect_') || action === 'capture';
}

// ------------------------------------------------------------------- cambios

export interface CambioPropuesto {
  tipo: 'oraculo' | 'elemento';
  rf: string;
  paso: string;
  de: string;
  a: string;
  decision: DecisionEntry;
  /** Avisos mecánicos, deterministas: se detectan, no se opinan. */
  avisos: string[];
}

export interface DecisionApartada {
  decision: DecisionEntry;
  motivo: string;
}

/** Un veredicto `fd`: el criterio se sostiene y la aplicación tiene el defecto. */
export interface CriterioSostenido {
  decision: DecisionEntry;
  /** El literal del FD que se sostiene, si el guion lo conserva. */
  literal?: string;
}

export interface Derivacion {
  cambios: CambioPropuesto[];
  sostenidos: CriterioSostenido[];
  /** Anomalías de ESTE caso que piden mano humana. Lo de otros casos no entra aquí. */
  apartadas: DecisionApartada[];
  /** `defer` vigentes: se cuentan (para el resumen de consola), jamás se listan. */
  sin_decidir: number;
  /** Decisiones de flujos que este guion no contiene: son de otro caso — se
   * cuentan y nada más, porque listarlas aquí sería ruido de un FD ajeno. */
  fuera_del_guion: number;
}

const nombreVisible = (h: PasoDeGuion['hint']): string =>
  h?.name ?? h?.label ?? h?.text ?? h?.test_id ?? '';

function pasoDe(guion: GuionMinimo | undefined, flowId: string, stepId: string): PasoDeGuion | undefined {
  return guion?.flows.find((f) => f.flow === flowId)?.steps.find((s) => s.id === stepId);
}

/**
 * De las decisiones VIGENTES a la lista de cambios propuestos. Fail-honest en
 * cada rama: lo que no se puede derivar con certeza se aparta CON su motivo.
 *
 * @param huellaFd huella del FD actual (`huellaDeArtefacto`): una decisión
 *   firmada contra OTRA versión del documento no autoriza a tocar ésta.
 */
export function derivarCambios(
  vigentes: DecisionEntry[],
  guion: GuionMinimo,
  original: GuionMinimo | undefined,
  huellaFd: string,
): Derivacion {
  const cambios: CambioPropuesto[] = [];
  const sostenidos: CriterioSostenido[] = [];
  const apartadas: DecisionApartada[] = [];
  let sinDecidir = 0;
  let fueraDelGuion = 0;

  for (const d of vigentes) {
    const [flowId, stepId] = d.paso.includes('/') ? [d.paso.slice(0, d.paso.lastIndexOf('/')), d.paso.slice(d.paso.lastIndexOf('/') + 1)] : ['', d.paso];
    const enGuion = guion.flows.some((f) => f.flow === flowId);
    if (!enGuion) {
      fueraDelGuion += 1;
      continue;
    }
    if (d.decision === 'defer') {
      sinDecidir += 1; // no aparece: está sin decidir, y lo indeciso no se propone
      continue;
    }

    const paso = pasoDe(guion, flowId, stepId);
    if (d.decision === 'fd') {
      sostenidos.push({ decision: d, ...(paso?.value ? { literal: paso.value } : {}) });
      continue;
    }

    // --- app: el único veredicto que propone cambiar el FD ---
    if (d.fd_hash !== huellaFd) {
      apartadas.push({
        decision: d,
        motivo: `firmada contra OTRA versión del FD (huella ${d.fd_hash} ≠ actual ${huellaFd}) — revisar a mano antes de proponer nada`,
      });
      continue;
    }
    if (!paso) {
      apartadas.push({ decision: d, motivo: `el paso ${stepId} no existe en el guion actual` });
      continue;
    }

    if (esPasoDeOraculo(paso.action)) {
      if (!d.valor_nuevo) {
        apartadas.push({ decision: d, motivo: 'un `app` de oráculo sin literal no dice con qué sustituir el criterio' });
        continue;
      }
      // el "antes" es lo que el plan medía: el original anclado manda (decisión 7);
      // sin original, el guion actual — para oráculos la fusión no los toca
      const de = pasoDe(original, flowId, stepId)?.value ?? paso.value ?? '';
      if (!de) {
        apartadas.push({ decision: d, motivo: 'el paso no declara el literal original: no hay qué sustituir' });
        continue;
      }
      const avisos: string[] = [];
      if (/\d/.test(d.valor_nuevo)) {
        avisos.push('el literal adoptado contiene cifras: puede variar entre ejecuciones (contadores, fechas, importes)');
      }
      cambios.push({ tipo: 'oraculo', rf: d.rf, paso: d.paso, de, a: d.valor_nuevo, decision: d, avisos });
      continue;
    }

    // elemento: la decisión no lleva literal a propósito (decisión 9 del plan:
    // los locators no viajan al acta) — el antes/después se reconstruye de los
    // dos guiones, que son hechos medidos y anclados
    const flujoOriginal = original?.flows.some((f) => f.flow === flowId) ?? false;
    const de = nombreVisible(pasoDe(original, flowId, stepId)?.hint);
    const a = nombreVisible(paso.hint);
    if (!de || !a || de === a) {
      apartadas.push({
        decision: d,
        motivo: !original
          ? 'sin el original anclado (`config/baselines/`) no hay «antes» del elemento'
          : !flujoOriginal
            ? `el original anclado pertenece a OTRO caso (no contiene el flujo «${flowId}») — es D67: el ancla es por sitio y los guiones son por caso; pásalo con --original=<guion original de este caso>`
            : 'el cambio de elemento no se puede reconstruir (original y guion nombran igual, o sin nombre visible)',
      });
      continue;
    }
    cambios.push({ tipo: 'elemento', rf: d.rf, paso: d.paso, de, a, decision: d, avisos: [] });
  }

  return { cambios, sostenidos, apartadas, sin_decidir: sinDecidir, fuera_del_guion: fueraDelGuion };
}

// ---------------------------------------------------------------- aplicación

export interface CambioAplicado extends CambioPropuesto {
  /** nº de línea (1-based) del FD donde se sustituyó. */
  linea: number;
}
export interface CambioNoUbicable extends CambioPropuesto {
  motivo: string;
}

export interface Aplicacion {
  texto: string;
  aplicados: CambioAplicado[];
  no_ubicables: CambioNoUbicable[];
}

const contar = (texto: string, aguja: string): number => texto.split(aguja).length - 1;

/**
 * Sustituye cada cambio en el texto del FD **solo si el literal aparece
 * exactamente una vez** en el documento. Cero o varias apariciones → el cambio
 * se declara no-ubicable con su motivo: adivinar cuál de tres «Buscar» quería
 * decir el FD es fabricar, y esto no fabrica.
 */
export function aplicarAlTexto(fdTexto: string, cambios: CambioPropuesto[]): Aplicacion {
  let texto = fdTexto;
  const aplicados: CambioAplicado[] = [];
  const noUbicables: CambioNoUbicable[] = [];
  for (const c of cambios) {
    const n = contar(texto, c.de);
    if (n === 0) {
      noUbicables.push({ ...c, motivo: `«${c.de}» no aparece en el FD — la redacción del documento no coincide con lo medido` });
      continue;
    }
    if (n > 1) {
      noUbicables.push({ ...c, motivo: `«${c.de}» aparece ${n} veces en el FD — elegir una sería adivinar` });
      continue;
    }
    const idx = texto.indexOf(c.de);
    const linea = texto.slice(0, idx).split('\n').length;
    texto = texto.slice(0, idx) + c.a + texto.slice(idx + c.de.length);
    aplicados.push({ ...c, linea });
  }
  return { texto, aplicados, no_ubicables: noUbicables };
}

// ------------------------------------------------------------------- render

export interface MetaPropuesta {
  site: string;
  fd_nombre: string;
  huella_fd: string;
  /** hash de cabeza del acta: LA versión de esta propuesta (determinista, sin reloj). */
  cabeza_acta: string;
  acta_ruta: string;
}

const grado = (d: DecisionEntry): string => `${d.evidencia} · ${d.actor} · ${d.timestamp.slice(0, 10)} · [${d.hash.slice(0, 8)}]`;

/**
 * La propuesta entera, texto determinista: mismas entradas → mismos bytes.
 * Cuerpo en el formato del cliente (el FD con las sustituciones), y detrás los
 * anexos con el origen de cada cambio — sin origen firmado, no hay línea.
 */
export function renderPropuesta(aplicacion: Aplicacion, derivacion: Derivacion, meta: MetaPropuesta): string {
  const L: string[] = [];
  L.push('<!--');
  L.push('  PROPUESTA GENERADA por ia4d-qa-automator (fase C) — NO sustituye al FD del cliente.');
  L.push('  Derivada exclusivamente de decisiones firmadas en el acta; cada cambio lleva su origen.');
  L.push(`  sitio: ${meta.site} · FD: ${meta.fd_nombre} (huella ${meta.huella_fd})`);
  L.push(`  acta: ${meta.acta_ruta} · versión de la propuesta = cabeza del acta ${meta.cabeza_acta}`);
  L.push('-->');
  L.push('');
  L.push(aplicacion.texto.trimEnd());
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Origen de cada cambio (generado — trazabilidad al acta)');
  L.push('');
  if (aplicacion.aplicados.length === 0) {
    L.push('El cuerpo de arriba es el FD original sin cambios.');
  } else {
    L.push('| Paso del caso | Antes | Después | Decisión que lo respalda |');
    L.push('|---|---|---|---|');
    for (const c of aplicacion.aplicados) {
      L.push(`| ${c.paso} (línea ${c.linea} del FD) | «${c.de}» | «${c.a}» | app · ${grado(c.decision)} |`);
    }
    for (const c of aplicacion.aplicados) {
      for (const a of c.avisos) L.push(`\n> **Aviso sobre «${c.a}»** (${c.paso}): ${a}. Decisión del QA, no de la herramienta — se enseña, no se corrige.`);
    }
  }
  if (derivacion.sostenidos.length) {
    L.push('');
    L.push('## Criterios que se SOSTIENEN — el defecto es de la aplicación');
    L.push('');
    for (const s of derivacion.sostenidos) {
      L.push(`- ${s.decision.paso}${s.literal ? ` — el FD sigue esperando «${s.literal}»` : ''}: el QA declaró defecto de la aplicación (fd · ${grado(s.decision)}). El texto del FD no se toca.`);
    }
  }
  if (aplicacion.no_ubicables.length) {
    L.push('');
    L.push('## Cambios firmados que NO se pudieron ubicar — requieren mano humana');
    L.push('');
    for (const c of aplicacion.no_ubicables) {
      L.push(`- ${c.paso}: «${c.de}» → «${c.a}» (app · ${grado(c.decision)}) — ${c.motivo}.`);
    }
  }
  if (derivacion.apartadas.length) {
    L.push('');
    L.push('## Decisiones apartadas de esta propuesta');
    L.push('');
    for (const a of derivacion.apartadas) {
      L.push(`- ${a.decision.paso} (${a.decision.decision} · ${grado(a.decision)}): ${a.motivo}.`);
    }
  }
  L.push('');
  return L.join('\n');
}
