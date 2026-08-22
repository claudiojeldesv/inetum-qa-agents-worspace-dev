/**
 * Carril 4 — el run dice lo que costó, y la cifra no miente.
 *
 * El par falsable central sale de un defecto de esta misma herramienta, cazado al
 * correrla contra el audit-log real del tercer run de campo: la primera versión
 * anunció «94,6% del reloj perdido» sobre un run que había pasado la NOCHE parado
 * porque el QA se fue a dormir. Un hueco de 8 h no lo causa el producto. Separadas
 * las pausas humanas de las esperas del orquestador, el mismo log dice la verdad:
 * 2h08 activas, 80% de ellas esperando — que es el hallazgo real.
 */
import { describe, it, expect } from 'vitest';
import { computeCost, fmtMs, labelOf, parseAuditLog, MARCA_INICIO, PAUSA_HUMANA_MS } from '../../src/run-cost.ts';

const t = (min: number): string => new Date(Date.UTC(2026, 7, 20, 10, 0, 0) + min * 60_000).toISOString();

describe('run-cost — lectura tolerante del audit-log', () => {
  it('lee JSONL, que es como lo escribe el hook', () => {
    const raw = `{"timestamp":"${t(0)}","action":"a"}\n{"timestamp":"${t(1)}","action":"b"}\n`;
    expect(parseAuditLog(raw).entries).toHaveLength(2);
  });

  it('lee también un array JSON, sin ser más estricto que su productor (lección K0.43)', () => {
    const raw = `[{"timestamp":"${t(0)}","action":"a"},{"timestamp":"${t(1)}","action":"b"}]`;
    expect(parseAuditLog(raw).entries).toHaveLength(2);
  });

  it('el BOM de PowerShell no lo rompe', () => {
    expect(parseAuditLog(`﻿{"timestamp":"${t(0)}","action":"a"}`).entries).toHaveLength(1);
  });

  it('una línea corrupta se descarta CONTÁNDOLA, no tumba el informe', () => {
    const r = parseAuditLog(`{"timestamp":"${t(0)}"}\n{roto\n{"timestamp":"${t(2)}"}`);
    expect(r.entries).toHaveLength(2);
    expect(r.skipped).toBe(1);
  });
});

describe('run-cost — pausas humanas vs esperas del orquestador', () => {
  const log = [
    { timestamp: t(0), action: 'invoke', rule: 'refiner' },
    { timestamp: t(16), action: 'exploration_brief', rule: 'fd_ingested' }, // espera de 16 min
    { timestamp: t(16 + 500), action: 'review_decision' }, // pausa de 8h20: el QA se fue
    { timestamp: t(16 + 500 + 3), action: 'write_file' },
  ];

  it('EL PAR FALSABLE: la pausa nocturna no cuenta como coste del producto', () => {
    const c = computeCost(log);
    expect(c.pauses).toHaveLength(1);
    expect(c.pauses[0].ms).toBe(500 * 60_000);
    // las esperas son las dos por debajo del umbral de pausa (16 min y 3 min), y la
    // noche NO está entre ellas: eso es lo que la primera versión hacía mal
    expect(c.gaps).toHaveLength(2);
    expect(c.gaps[0].ms).toBe(16 * 60_000);
    expect(c.gaps.some((g) => g.ms >= PAUSA_HUMANA_MS)).toBe(false);
    // el reloj de pared incluye la noche; el ACTIVO no
    expect(c.wall_ms).toBe((16 + 500 + 3) * 60_000);
    expect(c.active_ms).toBe((16 + 3) * 60_000);
  });

  it('el porcentaje se calcula sobre el ACTIVO: sobre el reloj de pared mentiría', () => {
    const c = computeCost(log);
    // 16 de 19 min activos ≈ 84%, no 3% del reloj de pared
    expect(c.gap_pct).toBeGreaterThan(80);
  });

  it('un hueco dice qué se estaba esperando, no solo cuánto', () => {
    const c = computeCost(log);
    expect(c.gaps[0].after).toContain('refiner');
    expect(c.gaps[0].before).toContain('fd_ingested');
  });

  it('el tiempo por etiqueta NO se lleva la pausa: se atribuye topado', () => {
    // la primera versión medía primera↔última entrada del grupo y una pausa en
    // medio inflaba un grupo a 10 h — decía dónde había entradas, no dónde se fue
    // el tiempo
    const c = computeCost(log);
    const review = c.groups.find((g) => g.label === 'review_decision');
    expect(review?.span_ms).toBe(3 * 60_000);
    expect(c.groups.every((g) => g.span_ms < PAUSA_HUMANA_MS)).toBe(true);
  });

  it('silencios por debajo del umbral son trabajo normal, no se listan', () => {
    const c = computeCost([{ timestamp: t(0) }, { timestamp: t(0.5) }]);
    expect(c.gaps).toHaveLength(0);
    expect(c.pauses).toHaveLength(0);
  });

  it('un audit vacío no revienta ni inventa cifras', () => {
    const c = computeCost([]);
    expect(c.wall_ms).toBeNull();
    expect(c.gap_pct).toBeNull();
    expect(c.entries).toBe(0);
  });
});

describe('run-cost — la etiqueta es del audit, no una traducción nuestra', () => {
  it('prefiere `rule`, luego `metadata.phase`, luego `action`', () => {
    expect(labelOf({ timestamp: t(0), rule: 'walk_first', action: 'warn' })).toBe('walk_first');
    expect(labelOf({ timestamp: t(0), action: 'skip', metadata: { phase: 'alias-promotion' } })).toBe('alias-promotion');
    expect(labelOf({ timestamp: t(0), action: 'invoke' })).toBe('invoke');
    expect(labelOf({ timestamp: t(0) })).toBe('sin-etiqueta');
  });
});

describe('run-cost — formato legible', () => {
  it('no hay que dividir a mano para leer la tabla', () => {
    expect(fmtMs(812)).toBe('812ms');
    expect(fmtMs(24_000)).toBe('24s');
    expect(fmtMs(204_000)).toBe('3m 24s');
    expect(fmtMs(4_469_000)).toBe('1h 14m 29s');
    expect(fmtMs(null)).toBe('—');
  });
});

/**
 * La segunda mentira de esta herramienta, y su arreglo.
 *
 * Tras separar las pausas humanas, el informe siguió siendo falso por otro motivo: en el
 * run del 2026-08-21 anunció «95,5% del activo en esperas» cuando el hueco mayor —14m42s
 * entre `review_decision TC-001` y `write_file TC-002`— era un Writer TRABAJANDO. El
 * audit-log solo se escribe cuando alguien toca un fichero, así que el silencio de un
 * subagente tiene la misma firma que un orquestador ocioso. Sin una marca que diga
 * «acabo de lanzar un Task», esto no se puede atribuir — y entonces hay que decirlo.
 */
describe('run-cost — el hueco se atribuye a quien lo consumió', () => {
  it('EL PAR FALSABLE: un hueco tras `task-start` es trabajo de subagente, no espera', () => {
    const log = [
      { timestamp: t(0), action: 'review_decision', rule: 'review-TC-001' },
      { timestamp: t(0.5), action: 'invoke', rule: 'task-start', target: 'writer-TC-002' },
      { timestamp: t(15.2), action: 'allow', rule: 'task-end', target: 'writer-TC-002' },
    ];
    const c = computeCost(log);
    expect(c.markers_present).toBe(true);
    expect(c.subagent_gaps).toHaveLength(1);
    expect(c.subagent_ms).toBe(Math.round(14.7 * 60_000));
    // esto es exactamente lo que la versión anterior contaba como «espera del orquestador»
    expect(c.gaps).toHaveLength(0);
    expect(c.gap_pct).toBe(0);
  });

  it('el MISMO log sin marcas no puede atribuir, y lo DECLARA en vez de fingir', () => {
    const log = [
      { timestamp: t(0), action: 'review_decision' },
      { timestamp: t(0.5), action: 'invoke' },
      { timestamp: t(15.2), action: 'write_file' },
    ];
    const c = computeCost(log);
    expect(c.markers_present).toBe(false);
    expect(c.subagent_gaps).toEqual([]);
    // el hueco sigue ahí y sigue contando: lo que cambia es que nadie puede llamarlo espera
    expect(c.gaps).toHaveLength(1);
    expect(c.gap_pct).toBeGreaterThan(90);
  });

  it('una espera REAL del orquestador sigue saliendo: la marca no lo blanquea todo', () => {
    const log = [
      { timestamp: t(0), action: 'invoke', rule: 'task-start', target: 'writer-A' },
      { timestamp: t(3), action: 'allow', rule: 'task-end', target: 'writer-A' },
      { timestamp: t(20), action: 'write_file', rule: 'run-summary' }, // 17 min sin lanzar nada
    ];
    const c = computeCost(log);
    expect(c.subagent_gaps).toHaveLength(1);
    expect(c.subagent_gaps[0].ms).toBe(3 * 60_000);
    expect(c.gaps).toHaveLength(1);
    expect(c.gaps[0].ms).toBe(17 * 60_000);
    expect(c.gaps[0].kind).toBe('orquestador');
  });

  it('una pausa humana tras `task-start` sigue siendo pausa: nadie tiene un subagente 8h vivo', () => {
    const log = [
      { timestamp: t(0), action: 'invoke', rule: 'task-start', target: 'writer-A' },
      { timestamp: t(500), action: 'write_file' },
    ];
    const c = computeCost(log);
    expect(c.pauses).toHaveLength(1);
    expect(c.subagent_gaps).toEqual([]);
    expect(c.active_ms).toBe(0);
  });

  it('los silencios cortos siguen sin listarse, marcados o no', () => {
    const c = computeCost([
      { timestamp: t(0), action: 'invoke', rule: 'task-start' },
      { timestamp: t(0.4), action: 'allow', rule: 'task-end' },
    ]);
    expect(c.gaps).toEqual([]);
    expect(c.subagent_gaps).toEqual([]);
    expect(c.markers_present).toBe(true);
  });

  it('un audit vacío no inventa marcas', () => {
    const c = computeCost([]);
    expect(c.markers_present).toBe(false);
    expect(c.subagent_ms).toBe(0);
    expect(c.subagent_gaps).toEqual([]);
  });

  it('la constante de la marca es la que escribe audit-mark, no una copia suelta', () => {
    expect(MARCA_INICIO).toBe('task-start');
  });
});
