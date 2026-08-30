/**
 * P6 — la etiqueta de oráculo, con dientes.
 *
 * Cada criterio arrastra de dónde salió su oráculo: del documento del cliente
 * (`fd`), de una decisión firmada que adoptó lo que dice la aplicación (`app`),
 * o de una demostración del QA en el panel (`captura`). El test lo hereda en su
 * JSDoc, y —lo que evita que esto sea otra D2— una regla de pre-review lo LEE y
 * el resumen cuenta cuántos criterios respalda la aplicación y no el FD.
 * Informa, no impide: ese recuento es lo que evita que la suite se convierta en
 * un espejo de la aplicación sin que nadie lo note.
 *
 * La regla de origen es determinista y va en este orden:
 *
 *  1. un id re-clavado por la fusión (`s6#v1`) nació de una demostración: es
 *     `captura` aunque además haya firma — la firma autoriza; la procedencia es
 *     la grabación, y mezclarlas taparía cuántos oráculos NO escribió negocio;
 *  2. una decisión `app` VIGENTE sobre ese paso → `app`, con su firma al lado;
 *  3. sin nada de lo anterior, el oráculo es del FD — que también es una
 *     afirmación, no una ausencia, y por eso se etiqueta igual.
 *
 * Módulo puro: cero fs, cero reloj.
 */
import type { DecisionEntry } from './decisions.ts';
import { esPasoDeOraculo } from './fd-proposal.ts';

export type OrigenOraculo = 'fd' | 'app' | 'captura';

export interface PasoEtiquetable {
  id: string;
  action: string;
  value?: string;
}

export interface EtiquetaOraculo {
  paso: string;
  origen: OrigenOraculo;
  decision?: DecisionEntry;
}

export interface ConteoOraculos {
  fd: number;
  app: number;
  captura: number;
}

/** Marca de los pasos nacidos en el panel: el re-clavado de la fusión los
 * nombra `<original>#vN` (comprobaciones) — ver walk-merge. */
const NACIDO_DE_CAPTURA = /#v\d+$/;

export function origenDelOraculo(
  flowId: string,
  paso: PasoEtiquetable,
  vigentes: DecisionEntry[],
): EtiquetaOraculo {
  if (NACIDO_DE_CAPTURA.test(paso.id)) return { paso: paso.id, origen: 'captura' };
  const firmada = vigentes.find((d) => d.paso === `${flowId}/${paso.id}` && d.decision === 'app');
  if (firmada) return { paso: paso.id, origen: 'app', decision: firmada };
  return { paso: paso.id, origen: 'fd' };
}

export interface EtiquetadoDeFlujo {
  etiquetas: EtiquetaOraculo[];
  conteo: ConteoOraculos;
  /** Las líneas del JSDoc, sin el ` * ` delante (lo pone el emisor). */
  lineas_jsdoc: string[];
}

/**
 * Las etiquetas de un flujo entero: solo los pasos que OBSERVAN llevan oráculo
 * (un click no afirma nada sobre el negocio). Con la lista vacía de decisiones
 * el etiquetado sigue siendo válido: significa «acta leída, nada firmado aquí».
 * La distinción acta-ausente/acta-vacía es del que llama, no de esta función.
 */
export function etiquetarFlujo(
  flowId: string,
  pasos: PasoEtiquetable[],
  vigentes: DecisionEntry[],
): EtiquetadoDeFlujo {
  const etiquetas = pasos.filter((p) => esPasoDeOraculo(p.action)).map((p) => origenDelOraculo(flowId, p, vigentes));
  const conteo: ConteoOraculos = { fd: 0, app: 0, captura: 0 };
  for (const e of etiquetas) conteo[e.origen] += 1;

  const lineas: string[] = [];
  for (const e of etiquetas) {
    if (e.origen === 'app' && e.decision) {
      const d = e.decision;
      lineas.push(
        `@oraculo ${e.paso} app — ${d.valor_nuevo !== undefined ? `«${d.valor_nuevo}» ` : ''}firmado por ${d.actor} (${d.evidencia}) [${d.hash.slice(0, 8)}]`,
      );
    } else if (e.origen === 'captura') {
      lineas.push(`@oraculo ${e.paso} captura — nacido de una demostración del QA en el panel`);
    } else {
      lineas.push(`@oraculo ${e.paso} fd`);
    }
  }
  if (etiquetas.length > 0) {
    lineas.push(`@oraculo-resumen fd=${conteo.fd} app=${conteo.app} captura=${conteo.captura}`);
  }
  return { etiquetas, conteo, lineas_jsdoc: lineas };
}

// ------------------------------------------------- el lado que LEE (pre-review)

export interface OraculosDeSpec extends ConteoOraculos {
  /** false = el spec no lleva etiqueta (emitido antes de P6, o a mano). */
  etiquetado: boolean;
}

/**
 * Lee las etiquetas de un spec emitido. El resumen (`@oraculo-resumen`) manda;
 * sin él se cuentan las líneas sueltas — así un spec editado a mano que perdió
 * el resumen no pasa a «sin etiqueta» en silencio.
 */
export function leerOraculosDeSpec(texto: string): OraculosDeSpec {
  const resumen = texto.match(/@oraculo-resumen\s+fd=(\d+)\s+app=(\d+)\s+captura=(\d+)/);
  if (resumen) {
    return { fd: Number(resumen[1]), app: Number(resumen[2]), captura: Number(resumen[3]), etiquetado: true };
  }
  const sueltas = [...texto.matchAll(/@oraculo\s+\S+\s+(fd|app|captura)\b/g)];
  if (sueltas.length === 0) return { fd: 0, app: 0, captura: 0, etiquetado: false };
  const conteo: OraculosDeSpec = { fd: 0, app: 0, captura: 0, etiquetado: true };
  for (const m of sueltas) conteo[m[1] as OrigenOraculo] += 1;
  return conteo;
}
