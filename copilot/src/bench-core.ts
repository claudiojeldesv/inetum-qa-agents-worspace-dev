/**
 * El banco de pruebas de paneles — núcleo puro (sin fs, sin reloj, sin proceso).
 *
 * Nació de una pregunta del QA (2026-08-29): «¿hay alguna forma de que tú mismo
 * puedas probar los modales, y no tenga que ser yo?». La respuesta honesta era que
 * tres de los cuatro defectos de aquella sesión de campo eran cazables a máquina
 * y se escaparon porque los paneles solo se conducían contra fixtures propios,
 * nunca contra el sitio real. Este banco cierra eso: conduce los paneles DE VERDAD
 * (mismo walker, mismo navegador, mismo canal `qa-assist-cmd` que usan los tests)
 * contra la aplicación de verdad, siguiendo un escenario declarado en JSON.
 *
 * Lo que el banco NO puede hacer, a propósito:
 *
 *  - **Firmar con nombre de persona.** El actor es la constante `ACTOR_BANCO` y no
 *    hay parámetro que lo cambie. Una decisión conducida por máquina que llevara
 *    el nombre del QA sería fabricar exactamente lo que el acta existe para
 *    impedir.
 *  - **Escribir en el acta del sitio.** El acta del banco vive DENTRO del work-dir
 *    del banco (`acta-banco.jsonl`), nunca en `config/decisions/`. Tampoco hay
 *    parámetro.
 *  - **Sustituir la primera vez de una persona.** El banco caza regresiones
 *    mecánicas (mensajes, tildes, firmas, continuidad del run); no puede decir si
 *    un panel CONFUNDE. El «¿ahora cómo cierro esto?» de campo solo lo encuentra
 *    alguien que se lo encuentra sin saber qué se espera de él.
 */
import type { DecisionEntry } from '../../src/decisions.ts';
import { verifyChain } from '../../src/decisions.ts';
import { ACCIONES_QUE_OBSERVAN } from './walk-verdict.ts';
import type { DomMap } from './walk-types.ts';

/** El único actor con el que el banco firma. Constante, no parámetro. */
export const ACTOR_BANCO = 'banco-de-pruebas';

/** Nombre del acta del banco, siempre relativa al work-dir del banco. */
export const ACTA_DEL_BANCO = 'acta-banco.jsonl';

// ------------------------------------------------------------------ escenario

/** Un gesto sobre el panel: lo mismo que despacharía el fixture autopilotado. */
export interface GestoCmd {
  /** detail del CustomEvent `qa-assist-cmd`: 'app' | 'fd' | 'defer' | 'pick' | {choose:N} | 'record' | 'stop' | {target:N} … */
  cmd: unknown;
}
/** Un clic en la PÁGINA (no en el panel): para «lo señalo yo» y para grabar. */
export interface GestoClick {
  click_pagina: string;
}
/** Espera explícita, p. ej. para dejar que un rechazo reinyecte el panel. */
export interface GestoEspera {
  esperar_ms: number;
}
/**
 * Arrastrar el panel, como haría una persona con la cabecera. Medido contra
 * OrangeHRM: el panel (fijo arriba-derecha, 400px) tapaba los botones
 * Search/Reset del formulario y el trial-click de la verificación en vivo moría
 * por timeout. El QA lo resuelve arrastrando; el banco, con este gesto.
 */
export interface GestoMover {
  mover_panel: { x: number; y: number };
}
export type Gesto = GestoCmd | GestoClick | GestoEspera | GestoMover;

export function esCmd(g: Gesto): g is GestoCmd {
  return 'cmd' in g;
}
export function esClick(g: Gesto): g is GestoClick {
  return 'click_pagina' in g;
}
export function esEspera(g: Gesto): g is GestoEspera {
  return 'esperar_ms' in g;
}
export function esMover(g: Gesto): g is GestoMover {
  return 'mover_panel' in g;
}

/** Qué hacer cuando se abre el panel de un paso concreto, y qué debe decir. */
export interface AccionDePanel {
  paso: string;
  /** Si el mismo id de paso vive en varios flujos. */
  flujo?: string;
  hacer: Gesto[];
  /** Fragmentos que el TEXTO del panel tiene que contener (pide --abrir-panel). */
  panel_contiene?: string[];
  /** Fragmentos que NO pueden aparecer (mojibake, jerga, formas sin tilde). */
  panel_no_contiene?: string[];
}

/** Lo que se comprueba cuando el run termina. */
export interface EsperadoFinal {
  /** Nº exacto de entradas en el acta del banco. */
  acta_total?: number;
  /** Decisiones que tienen que estar firmadas (paso = `<flujo>/<id>`). */
  decisiones?: Array<{ paso: string; decision: 'app' | 'fd' | 'defer'; valor_nuevo?: string }>;
  /** outcome esperado por paso (id suelto), contra `step_reports`. */
  outcomes?: Record<string, string>;
  /** Fragmentos que el motivo del bloqueo (open_questions) debe llevar, por paso. */
  motivo_contiene?: Record<string, string[]>;
  motivo_no_contiene?: Record<string, string[]>;
}

export interface Escenario {
  version: 1;
  /** Para el informe: qué se está auditando con este escenario. */
  proposito?: string;
  acciones: AccionDePanel[];
  al_final?: EsperadoFinal;
}

/**
 * Validación estructural del escenario. Va antes de arrancar navegador: un
 * escenario roto que se descubre en el panel 3 tira quince minutos de run.
 */
export function validarEscenario(raw: unknown): { ok: true; escenario: Escenario } | { ok: false; errores: string[] } {
  const errores: string[] = [];
  if (typeof raw !== 'object' || raw === null) return { ok: false, errores: ['el escenario no es un objeto'] };
  const e = raw as Record<string, unknown>;
  if (e.version !== 1) errores.push(`version debe ser 1 (hay: ${JSON.stringify(e.version)})`);
  if (!Array.isArray(e.acciones)) errores.push('falta `acciones` (lista, puede ser vacía)');
  for (const [i, a] of (Array.isArray(e.acciones) ? e.acciones : []).entries()) {
    const acc = a as Record<string, unknown>;
    if (typeof acc.paso !== 'string' || !acc.paso) errores.push(`acciones[${i}]: falta \`paso\``);
    if (!Array.isArray(acc.hacer) || acc.hacer.length === 0) {
      errores.push(`acciones[${i}] (${String(acc.paso)}): falta \`hacer\` con al menos un gesto`);
    } else {
      for (const [j, g] of acc.hacer.entries()) {
        const gg = g as Record<string, unknown>;
        const claves = ['cmd', 'click_pagina', 'esperar_ms', 'mover_panel'].filter((k) => k in gg);
        if (claves.length !== 1) {
          errores.push(`acciones[${i}].hacer[${j}]: un gesto es exactamente uno de cmd | click_pagina | esperar_ms | mover_panel`);
        }
      }
    }
  }
  if (errores.length) return { ok: false, errores };
  return { ok: true, escenario: raw as Escenario };
}

// ---------------------------------------------------------------- el semáforo

/**
 * Si un paso con esta acción abre panel, es el de VEREDICTO; si no, el de
 * asistencia. Decide el gesto de socorro cuando el escenario no cubre un panel.
 */
export function esPanelDeVeredicto(action: string): boolean {
  return (ACCIONES_QUE_OBSERVAN as readonly string[]).includes(action);
}

/**
 * El gesto de socorro para un panel que el escenario NO cubre. El banco no puede
 * quedarse mirando (el run moriría por timeout panel a panel) ni inventarse un
 * veredicto con contenido: en el de veredicto firma «luego» —que es literalmente
 * lo que un defer significa— y en el de asistencia bloquea el paso. El informe
 * lo marca como fallo igualmente: un panel no previsto ES un hallazgo del banco.
 */
export function gestoDeSocorro(action: string): string {
  return esPanelDeVeredicto(action) ? 'defer' : 'block';
}

/** Identidad de un panel pendiente. El marcador se reescribe al grabar (cambia
 * `abierto`), así que la clave NO puede llevar el reloj. */
export function claveDeMarcador(m: { flow: string; step: string }): string {
  return `${m.flow}|${m.step}`;
}

// ------------------------------------------------------------- comprobaciones

export interface Comprobacion {
  ok: boolean;
  que: string;
  detalle?: string;
}

/** Lo que el panel dijo, contra lo que el escenario exige que diga. */
export function evaluarPanel(accion: AccionDePanel, textoPanel: string | null): Comprobacion[] {
  const exige = (accion.panel_contiene?.length ?? 0) + (accion.panel_no_contiene?.length ?? 0) > 0;
  if (!exige) return [];
  if (textoPanel === null) {
    return [{
      ok: false,
      que: `panel de ${accion.paso}: texto exigido pero NO legible`,
      detalle: 'el shadow root está cerrado — corre el banco con --abrir-panel para auditar textos',
    }];
  }
  const comps: Comprobacion[] = [];
  for (const frag of accion.panel_contiene ?? []) {
    comps.push({
      ok: textoPanel.includes(frag),
      que: `panel de ${accion.paso} contiene «${frag}»`,
      ...(textoPanel.includes(frag) ? {} : { detalle: `el panel dice: ${textoPanel.slice(0, 400)}` }),
    });
  }
  for (const frag of accion.panel_no_contiene ?? []) {
    comps.push({
      ok: !textoPanel.includes(frag),
      que: `panel de ${accion.paso} NO contiene «${frag}»`,
    });
  }
  return comps;
}

/**
 * El veredicto del banco al terminar el run. Dos comprobaciones van SIEMPRE,
 * las pida o no el escenario, porque son las guardas del propio banco:
 * que toda firma lleve el actor del banco, y que la cadena del acta verifique.
 */
export function evaluarFinal(
  esperado: EsperadoFinal | undefined,
  acta: DecisionEntry[],
  map: Pick<DomMap, 'open_questions' | 'step_reports'>,
): Comprobacion[] {
  const comps: Comprobacion[] = [];

  if (acta.length > 0) {
    const ajenas = acta.filter((e) => e.actor !== ACTOR_BANCO);
    comps.push({
      ok: ajenas.length === 0,
      que: 'GUARDA: toda decisión del banco firma como banco-de-pruebas',
      ...(ajenas.length ? { detalle: `actores ajenos: ${[...new Set(ajenas.map((e) => e.actor))].join(', ')}` } : {}),
    });
    const cadena = verifyChain(acta);
    comps.push({
      ok: cadena.ok,
      que: 'la cadena del acta del banco verifica',
      ...(cadena.ok ? {} : { detalle: 'la cadena está rota — el banco no debería poder producir esto' }),
    });
  }

  if (!esperado) return comps;

  if (esperado.acta_total !== undefined) {
    comps.push({
      ok: acta.length === esperado.acta_total,
      que: `el acta del banco tiene ${esperado.acta_total} entradas`,
      detalle: `hay ${acta.length}`,
    });
  }
  for (const d of esperado.decisiones ?? []) {
    const hit = acta.find(
      (e) => e.paso === d.paso && e.decision === d.decision && (d.valor_nuevo === undefined || e.valor_nuevo === d.valor_nuevo),
    );
    comps.push({
      ok: hit !== undefined,
      que: `firmada ${d.decision} en ${d.paso}${d.valor_nuevo !== undefined ? ` con «${d.valor_nuevo}»` : ''}`,
      detalle: hit
        ? `hash ${hit.hash.slice(0, 12)}…`
        : `en el acta: ${acta.map((e) => `${e.paso}:${e.decision}`).join(', ') || '(vacía)'}`,
    });
  }
  for (const [paso, outcome] of Object.entries(esperado.outcomes ?? {})) {
    const r = map.step_reports?.find((x) => x.step === paso);
    comps.push({
      ok: r?.outcome === outcome,
      que: `outcome de ${paso} es ${outcome}`,
      detalle: `medido: ${r?.outcome ?? '(sin report)'}`,
    });
  }
  const motivoDe = (paso: string): string => map.open_questions.find((q) => q.step === paso)?.reason ?? '';
  for (const [paso, frags] of Object.entries(esperado.motivo_contiene ?? {})) {
    for (const frag of frags) {
      const m = motivoDe(paso);
      comps.push({
        ok: m.includes(frag),
        que: `motivo de ${paso} contiene «${frag}»`,
        ...(m.includes(frag) ? {} : { detalle: m ? `motivo: ${m.slice(0, 300)}` : 'el paso no está en open_questions' }),
      });
    }
  }
  for (const [paso, frags] of Object.entries(esperado.motivo_no_contiene ?? {})) {
    for (const frag of frags) {
      comps.push({ ok: !motivoDe(paso).includes(frag), que: `motivo de ${paso} NO contiene «${frag}»` });
    }
  }
  return comps;
}
