/**
 * Fase 0 del plan del rescate en proceso — EL CENSO DE BLOQUEOS, RETROACTIVO.
 *
 * Antes de decidir si el walker debe pausarse en el sitio (y esperar respuesta)
 * o morirse y reanudar, hay que saber CUÁNTOS bloqueos hay de cada clase y
 * cuántos de ellos están CONDENADOS detrás de una puerta. Ese número decide el
 * diseño, y hasta hoy nadie lo había contado: `dom-map.stats` solo trae
 * `steps_blocked` y `rescues_used` — cuentas sin estructura.
 *
 * Se calcula SIN EJECUTAR NADA, desde artefactos ya en disco: `dom-map.json`
 * (trae `open_questions` con flow/step/action/hint/reason) y el walk-script
 * (trae el ORDEN de los pasos, que es todo lo que `puertaBloqueadaAntes`
 * necesita). Cero navegador, cero tokens.
 *
 * DECISIÓN DE MÉTODO — la cascada se RECALCULA, no se lee del texto. Los runs
 * de Tricentis y EspoCRM ya traen «en cascada de sNN» en el `reason` porque el
 * triaje (D68) ya había aterrizado; el de Restful Booker es ANTERIOR y no lo
 * trae. Leer la clase del texto mediría dos sitios con una vara y el tercero
 * con otra. Se recalcula desde el guion para los tres, y donde el texto SÍ está
 * se usa como comprobación cruzada: si mi recálculo y el walker discrepan, el
 * censo lo dice en vez de callarlo.
 *
 * DESCUBRIMIENTO QUE EL CENSO OBLIGÓ A MODELAR — el triaje tiene tres clases,
 * pero la masa bloqueada tiene CINCO familias, y solo una es material de
 * rescate:
 *
 *   drift    postcondición del FD no observada. El locator no falló: falló el
 *            oráculo. Preguntarle a un LLM «¿dónde está este texto?» no arregla
 *            que el texto no esté. NO es material de rescate.
 *   accion   el locator resolvió y la ACCIÓN falló (la fachada intercepta el
 *            clic — familia D70). Tampoco: el elemento se encontró.
 *   cascada  hay una puerta bloqueada antes en el mismo flujo.
 *   panel    ambigüedad real o ámbito fallido: elegir es del QA.
 *   rescate  hint irresoluble limpio. LA ÚNICA que compra algo.
 *
 * Mezclar las cinco bajo «bloqueados» es lo que hacía parecer que RBP tenía 39
 * problemas de resolución. El censo las separa.
 *
 * Exit: 0 siempre que pueda leer los dos ficheros (es telemetría, no un gate).
 * 1 uso/IO.
 */

import { readFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { puertaBloqueadaAntes, triajeDelBloqueo, parseJsonLoose } from './walk-core.ts';
import type { WalkAction } from './walk-types.ts';

/** Las cinco familias. Orden de precedencia en `clasificar`. */
export type Familia = 'drift' | 'accion' | 'cascada' | 'panel' | 'rescate';

export interface BloqueoCensado {
  flow: string;
  step: string;
  action: string;
  familia: Familia;
  /** Solo en `cascada`: el paso de la puerta que lo condena. */
  puerta?: string;
  /** Cuántas puertas bloqueadas hay antes de él en el flujo. 0 si ninguna. */
  capas: number;
  /** El texto original, para poder auditar la clasificación a mano. */
  reason: string;
}

export interface Censo {
  site_id: string;
  steps_total: number;
  steps_blocked: number;
  familias: Record<Familia, number>;
  /** Pasos de acción PUERTA que quedaron bloqueados. Cada uno es un replay potencial. */
  puertas_bloqueadas: number;
  /** Pares de puertas bloqueadas ADYACENTES en el flujo — el caso «Aceptar/Cerrar». */
  gate_pairs: Array<{ flow: string; a: string; b: string }>;
  /** Máximo de puertas bloqueadas por delante de un mismo paso. Capas = pasadas extra. */
  cascade_depth_max: number;
  /** Donde el walker escribió la clase en el texto y mi recálculo discrepa. */
  discrepancias: Array<{ flow: string; step: string; walker: string; censo: string }>;
  bloqueos: BloqueoCensado[];
}

const ES_DRIFT = /^drift/i;
const ES_ACCION = /^la acción '/i;
const ES_AMBIGUO = /matchea VARIOS elementos/i;
const ES_FUERA_DE_AMBITO = /NO está dentro del ámbito/i;
/** Lo que el walker escribió cuando el triaje ya existía: «en cascada de sNN». */
const CASCADA_DEL_WALKER = /en cascada de (\S+?):/;

/**
 * Familia de un bloqueo. El orden importa y es fail-safe hacia «no preguntes»:
 * drift y accion se reconocen por su prefijo ANTES de mirar la cascada, porque
 * un `expect_text` que no se observa detrás de una puerta bloqueada sigue siendo
 * un problema de oráculo, no de locator, y contarlo como cascada inflaría
 * artificialmente la cifra que este censo existe para medir.
 */
export function clasificar(i: {
  reason: string;
  puertaBloqueada: string | null;
}): { familia: Familia; puerta?: string } {
  if (ES_DRIFT.test(i.reason)) return { familia: 'drift' };
  if (ES_ACCION.test(i.reason)) return { familia: 'accion' };
  const v = triajeDelBloqueo({
    ambiguo: ES_AMBIGUO.test(i.reason),
    fueraDeAmbito: ES_FUERA_DE_AMBITO.test(i.reason),
    puertaBloqueada: i.puertaBloqueada,
  });
  if (v.destino === 'cascada') return { familia: 'cascada', puerta: i.puertaBloqueada ?? undefined };
  return { familia: v.destino === 'panel' ? 'panel' : 'rescate' };
}

const ACCIONES_PUERTA = new Set(['goto', 'click', 'hover', 'press']);

export function censar(
  map: {
    site_id?: string;
    stats?: { steps_total?: number; steps_blocked?: number };
    open_questions?: Array<{ flow: string; step: string; action: string; reason: string }>;
  },
  script: { site_id?: string; flows: Array<{ flow: string; steps: Array<{ id: string; action: string }> }> },
): Censo {
  const preguntas = map.open_questions ?? [];
  const porFlujo = new Map<string, Set<string>>();
  for (const q of preguntas) {
    if (!porFlujo.has(q.flow)) porFlujo.set(q.flow, new Set());
    porFlujo.get(q.flow)!.add(q.step);
  }
  const flujos = new Map(script.flows.map((f) => [f.flow, f.steps]));

  const familias: Record<Familia, number> = { drift: 0, accion: 0, cascada: 0, panel: 0, rescate: 0 };
  const bloqueos: BloqueoCensado[] = [];
  const discrepancias: Censo['discrepancias'] = [];
  let cascadeDepthMax = 0;

  for (const q of preguntas) {
    const steps = flujos.get(q.flow);
    if (!steps) {
      // El guion y el mapa no casan: se dice, no se adivina.
      bloqueos.push({ ...q, familia: 'rescate', capas: 0 });
      familias.rescate += 1;
      continue;
    }
    const bloqueados = porFlujo.get(q.flow) ?? new Set<string>();
    const tipados = steps.map((s) => ({ id: s.id, action: s.action as WalkAction }));
    const puerta = puertaBloqueadaAntes(tipados, bloqueados, q.step);

    // Capas: cuántas puertas bloqueadas hay por delante. Cada capa es una pasada
    // extra que el modelo diferido necesitaría, y un replay que el reactivo paga.
    let capas = 0;
    for (const s of tipados) {
      if (s.id === q.step) break;
      if (ACCIONES_PUERTA.has(s.action) && bloqueados.has(s.id)) capas += 1;
    }
    if (capas > cascadeDepthMax) cascadeDepthMax = capas;

    const { familia, puerta: p } = clasificar({ reason: q.reason, puertaBloqueada: puerta });
    familias[familia] += 1;
    bloqueos.push({ flow: q.flow, step: q.step, action: q.action, familia, ...(p ? { puerta: p } : {}), capas, reason: q.reason });

    // Comprobación cruzada contra lo que el walker escribió, donde lo escribió.
    const delWalker = CASCADA_DEL_WALKER.exec(q.reason);
    if (delWalker && delWalker[1] !== puerta) {
      discrepancias.push({ flow: q.flow, step: q.step, walker: `cascada de ${delWalker[1]}`, censo: puerta ? `cascada de ${puerta}` : familia });
    }
  }

  // Pares de puertas bloqueadas ADYACENTES: el caso «pulsar Aceptar / pulsar Cerrar».
  const gatePairs: Censo['gate_pairs'] = [];
  for (const f of script.flows) {
    const bloqueados = porFlujo.get(f.flow);
    if (!bloqueados) continue;
    for (let i = 0; i + 1 < f.steps.length; i++) {
      const a = f.steps[i];
      const b = f.steps[i + 1];
      if (ACCIONES_PUERTA.has(a.action) && ACCIONES_PUERTA.has(b.action) && bloqueados.has(a.id) && bloqueados.has(b.id)) {
        gatePairs.push({ flow: f.flow, a: a.id, b: b.id });
      }
    }
  }

  const puertasBloqueadas = script.flows.reduce((n, f) => {
    const bl = porFlujo.get(f.flow);
    if (!bl) return n;
    return n + f.steps.filter((s) => ACCIONES_PUERTA.has(s.action) && bl.has(s.id)).length;
  }, 0);

  return {
    site_id: map.site_id ?? script.site_id ?? '?',
    steps_total: map.stats?.steps_total ?? script.flows.reduce((n, f) => n + f.steps.length, 0),
    steps_blocked: preguntas.length,
    familias,
    puertas_bloqueadas: puertasBloqueadas,
    gate_pairs: gatePairs,
    cascade_depth_max: cascadeDepthMax,
    discrepancias,
    bloqueos,
  };
}

function main(): void {
  const { values } = parseArgs({
    options: {
      map: { type: 'string' },
      script: { type: 'string' },
      json: { type: 'boolean', default: false },
      detalle: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  if (!values.map || !values.script) {
    console.error('uso: tsx src/rescue-census.ts --map=<dom-map.json> --script=<walk.json> [--json] [--detalle]');
    process.exit(1);
  }
  for (const p of [values.map, values.script]) {
    if (!existsSync(p)) {
      console.error(`no existe: ${p}`);
      process.exit(1);
    }
  }
  const map = parseJsonLoose(readFileSync(values.map, 'utf8')) as Parameters<typeof censar>[0];
  const script = parseJsonLoose(readFileSync(values.script, 'utf8')) as Parameters<typeof censar>[1];
  const censo = censar(map, script);

  if (values.json) {
    console.log(JSON.stringify(censo, null, 2));
    return;
  }
  const f = censo.familias;
  console.log(`\n=== ${censo.site_id} — ${censo.steps_blocked} bloqueados de ${censo.steps_total} pasos`);
  console.log(`  drift    ${String(f.drift).padStart(3)}  postcondición no observada (falla el oráculo, no el locator)`);
  console.log(`  accion   ${String(f.accion).padStart(3)}  el locator resolvió y la acción falló (familia D70)`);
  console.log(`  cascada  ${String(f.cascada).padStart(3)}  condenados por una puerta bloqueada antes`);
  console.log(`  panel    ${String(f.panel).padStart(3)}  ambigüedad o ámbito: elegir es del QA`);
  console.log(`  rescate  ${String(f.rescate).padStart(3)}  <-- LO ÚNICO que iría al LLM`);
  console.log(`  puertas bloqueadas: ${censo.puertas_bloqueadas} | capas máx: ${censo.cascade_depth_max} | pares adyacentes: ${censo.gate_pairs.length}`);
  for (const p of censo.gate_pairs) console.log(`    par: ${p.flow} ${p.a} -> ${p.b}`);
  if (censo.discrepancias.length > 0) {
    console.log(`  DISCREPANCIAS con lo que el walker escribió: ${censo.discrepancias.length}`);
    for (const d of censo.discrepancias) console.log(`    ${d.flow}/${d.step}: walker="${d.walker}" censo="${d.censo}"`);
  }
  if (values.detalle) {
    for (const b of censo.bloqueos.filter((x) => x.familia === 'rescate' || x.familia === 'panel')) {
      console.log(`    [${b.familia}] ${b.flow}/${b.step} (${b.action}) — ${b.reason.slice(0, 110)}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
