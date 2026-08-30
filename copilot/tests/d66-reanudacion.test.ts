/**
 * D66 — la reanudación no puede re-ejecutar un login sobre una sesión viva.
 *
 * La tabla del predicado, entera: la combinación envenenada (flujo a medias +
 * sesión del checkpoint) limpia, y las dos excepciones deliberadas NO limpian —
 * la sesión del caller está pensada para compartirse, y un guion con flujos no
 * aislados depende de la sesión entre flujos y limpiar a medias solo
 * disimularía que su re-ejecución no puede reconstruir el estado.
 *
 * El par de campo vive fuera de la suite: el mismo flujo de motor+IA que se
 * envenenó el 2026-08-29 (rescate de s7 → exit 42 → reanudar SIN borrar
 * walk-session.json), re-medido en verde tras el arreglo — ver el índice, D66.
 */
import { describe, it, expect } from 'vitest';

import { debeReiniciarSesionAlReanudar } from '../src/walk-core.ts';

describe('D66 — cuándo se descarta la sesión del checkpoint', () => {
  const base = {
    flujoAMedias: true,
    sesionEsCheckpoint: true,
    aislamientoDelContract: true,
    sesionDelCaller: false,
  };

  it('LA COMBINACIÓN ENVENENADA limpia: flujo a medias + sesión del checkpoint', () => {
    expect(debeReiniciarSesionAlReanudar(base)).toBe(true);
  });

  it('un flujo NO empezado no limpia nada: no hay re-ejecución que proteger', () => {
    expect(debeReiniciarSesionAlReanudar({ ...base, flujoAMedias: false })).toBe(false);
  });

  it('la sesión del CALLER no se toca: el proyecto de auth existe para compartirla', () => {
    expect(debeReiniciarSesionAlReanudar({ ...base, sesionDelCaller: true })).toBe(false);
    // y si la sesión activa ni siquiera es el checkpoint, tampoco hay qué descartar
    expect(debeReiniciarSesionAlReanudar({ ...base, sesionEsCheckpoint: false })).toBe(false);
  });

  it('con isolate_flows: false NO se limpia — la limitación se declara, no se disimula', () => {
    expect(debeReiniciarSesionAlReanudar({ ...base, aislamientoDelContract: false })).toBe(false);
  });
});
