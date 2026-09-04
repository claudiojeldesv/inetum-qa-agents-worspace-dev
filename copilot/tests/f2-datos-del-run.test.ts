/**
 * F2 del plan del example — las fichas de datos que caducan.
 *
 * Dos literales envenenan un guion reutilizable, y los dos están medidos en
 * campo: las **fechas** (una reserva es estado persistente; el segundo run choca
 * contra la reserva del primero, y en Restful Booker el 409 revienta el
 * frontend) y los **nombres que se crean** (`cp007` daba de alta la habitación
 * «701» en una demo pública y compartida, así que cada persona que recorriera el
 * example dejaría otra dentro).
 *
 * Lo que se prueba aquí es lo que puede corromper un run:
 *
 *  1. que el literal emitido sea EXACTAMENTE el esperado, con la fecha fijada
 *     por el test — sin eso, «funciona» significa «no ha explotado»;
 *  2. que una ficha desconocida LANCE en vez de colarse: un `{{fecha_de_hoy}}`
 *     que llega al navegador escribe las llaves dentro del campo, el formulario
 *     lo acepta y el fallo asoma tres pantallas después como un oráculo que no
 *     cuadra;
 *  3. que el «hoy» sea el MISMO en el campo y en su oráculo — el fallo que solo
 *     aparece cruzando la medianoche y que nadie reproduce;
 *  4. que `walk-to-spec` se NIEGUE a congelar una ficha dentro de un spec.
 */
import { describe, it, expect } from 'vitest';

import {
  datosDelRun,
  resolverFichasDelRun,
  resolveFixtureRef,
  FORMATOS_DE_FECHA_ADMITIDOS,
  type DatosDelRun,
} from '../src/walk-core.ts';
import { emitFromWalk, type EmitContract } from '../src/walk-to-spec.ts';
import type { DomMap, WalkScript } from '../src/walk-types.ts';

/** Un martes cualquiera, elegido para cruzar mes y año en los saltos. */
const run: DatosDelRun = { hoy: new Date(2026, 11, 30, 14, 5), unico: '0845' };

describe('F2 — fichas de fecha', () => {
  it('el literal es exactamente el esperado, no «algo con barras»', () => {
    expect(resolverFichasDelRun('{{hoy}}', run)).toBe('30/12/2026');
    expect(resolverFichasDelRun('{{hoy+1}}', run)).toBe('31/12/2026');
    expect(resolverFichasDelRun('{{hoy-1}}', run)).toBe('29/12/2026');
  });

  it('salta de mes y de año sin aritmética casera', () => {
    // +2 desde el 30/12/2026 cae en 2027: si esto se hubiera escrito sumando
    // días al número del mes, aquí saldría 32/12.
    expect(resolverFichasDelRun('{{hoy+2}}', run)).toBe('01/01/2027');
    expect(resolverFichasDelRun('{{hoy+33}}', run)).toBe('01/02/2027');
  });

  it('admite los formatos declarados y NINGUNO más', () => {
    expect(resolverFichasDelRun('{{hoy:YYYY-MM-DD}}', run)).toBe('2026-12-30');
    expect(resolverFichasDelRun('{{hoy+1:DD-MM-YYYY}}', run)).toBe('31-12-2026');
    expect(resolverFichasDelRun('{{hoy:MM/DD/YYYY}}', run)).toBe('12/30/2026');
    expect(() => resolverFichasDelRun('{{hoy:DD.MM.YY}}', run)).toThrow(/formato de fecha desconocido/);
    // el mensaje enseña las salidas, no solo el problema
    expect(() => resolverFichasDelRun('{{hoy:raro}}', run)).toThrow(/DD\/MM\/YYYY/);
    expect(FORMATOS_DE_FECHA_ADMITIDOS.length).toBeGreaterThan(2);
  });

  it('dos fichas en el mismo valor se resuelven las dos', () => {
    expect(resolverFichasDelRun('del {{hoy}} al {{hoy+2}}', run)).toBe('del 30/12/2026 al 01/01/2027');
  });
});

describe('F2 — la ficha del nombre que se crea', () => {
  it('{{unico}} entra en un nombre y queda numérico', () => {
    // El caso de campo: el nombre de la habitación de cp007. Numérico a
    // propósito — un «701-abc» no es un número de habitación creíble.
    expect(resolverFichasDelRun('7{{unico}}', run)).toBe('70845');
    expect(/^\d+$/.test(resolverFichasDelRun('7{{unico}}', run))).toBe(true);
  });

  it('es el MISMO valor en el campo y en su oráculo', () => {
    // Sin esto, cp007 crearía la habitación 70845 y comprobaría la 70846.
    const enElCampo = resolverFichasDelRun('7{{unico}}', run);
    const enElOraculo = resolverFichasDelRun('7{{unico}}', run);
    expect(enElOraculo).toBe(enElCampo);
  });

  it('datosDelRun fija el único a partir de la hora, con cuatro dígitos', () => {
    expect(datosDelRun(new Date(2026, 0, 1, 0, 0)).unico).toBe('0000');
    expect(datosDelRun(new Date(2026, 0, 1, 14, 5)).unico).toBe('0845');
    expect(datosDelRun(new Date(2026, 0, 1, 23, 59)).unico).toBe('1439');
  });
});

describe('F2 — fail-closed ante lo que no entiende', () => {
  it('una ficha desconocida LANZA en vez de viajar al navegador', () => {
    expect(() => resolverFichasDelRun('{{fecha_de_hoy}}', run)).toThrow(/ficha desconocida/);
    expect(() => resolverFichasDelRun('{{manana}}', run)).toThrow(/\{\{hoy\+N\}\}/);
  });

  it('un valor sin fichas pasa intacto y no paga nada', () => {
    expect(resolverFichasDelRun('Ana Prueba', run)).toBe('Ana Prueba');
    expect(resolverFichasDelRun('10/11/2026', run)).toBe('10/11/2026');
  });

  it('unas llaves sueltas que no son ficha no se confunden con una', () => {
    expect(resolverFichasDelRun('precio { 123 }', run)).toBe('precio { 123 }');
  });
});

describe('F2 — convivencia con las refs de fixtures', () => {
  const fixtures = { credentials: [{ username: 'admin', password: 'password' }] };

  it('sin contexto de run, el valor con ficha viaja TAL CUAL (no se inventa una fecha)', () => {
    expect(resolveFixtureRef('{{hoy}}', fixtures)).toBe('{{hoy}}');
  });

  it('con contexto, la ficha se resuelve y la ref de fixture sigue funcionando', () => {
    expect(resolveFixtureRef('{{hoy+1}}', fixtures, run)).toBe('31/12/2026');
    expect(resolveFixtureRef('$fixtures.credentials[0].username', fixtures, run)).toBe('admin');
  });

  it('una ref de fixture irresoluble sigue siendo un error, con o sin fichas', () => {
    expect(() => resolveFixtureRef('$fixtures.no.existe', fixtures, run)).toThrow(/irresoluble/);
  });
});

describe('F2 — un spec NO congela la fecha de generación', () => {
  // El desenlace es «flujo encolado con motivo», no una excepción que suba: el
  // emisor ya sabía encolar flujos no emitibles y esto entra por esa puerta.
  const CONTRACT: EmitContract = {
    class_suffix: 'Page',
    inject_axe: true,
    fail_on_violations: false,
    evidence_level: 'steps',
    synthetic_fixtures: {},
  };

  const guion = (value: string): WalkScript => ({
    version: 1,
    site_id: 'portal-demo',
    entry: '/',
    flows: [
      {
        flow: 'reserva',
        criteria: ['RF-001'],
        steps: [
          { id: 's1', action: 'fill', hint: { label: 'Check In' }, value },
          { id: 's2', action: 'expect_text', value: 'Booking Confirmed' },
        ],
      },
    ],
  });

  const mapa = (): DomMap => ({
    version: 1,
    site_id: 'portal-demo',
    generated_by: 'dom-walker',
    generated_at: '2026-09-04T00:00:00Z',
    target_url: 'https://portal.example',
    contract: 'portal-demo',
    testid_attribute: 'data-test',
    stats: {
      flows: 1, steps_total: 2, steps_executed: 2, steps_blocked: 0, rescues_used: 0,
      rescue_budget: 0, screens: 1, flaky_timing: 0, settle_timeouts: 0, postcondition_unmet: 0,
    },
    screens: [{ name: 'home', url_pattern: '/', flow: 'reserva', elements: [], forms: [], landmarks: [] }],
    transitions: [],
    open_questions: [],
    rescues: [],
    step_reports: [
      { flow: 'reserva', step: 's1', action: 'fill', outcome: 'ok', action_ms: 10, retried: false, screen: 'home', resolved_via: "getByLabel('Check In')" },
      { flow: 'reserva', step: 's2', action: 'expect_text', outcome: 'ok', action_ms: 10, retried: false, screen: 'home' },
    ],
  });

  it('el flujo con ficha NO se emite: va a la cola con el paso y la ficha en el motivo', () => {
    // La alternativa silenciosa es lo peligroso: el spec quedaria con la fecha de
    // HOY escrita dentro y empezaria a fallar solo dentro de un mes. El emisor
    // no tumba la tanda entera — encola ESE flujo con su motivo, que es la
    // conducta que ya tenia para cualquier flujo no emitible.
    const r = emitFromWalk(guion('{{hoy+2}}'), mapa(), CONTRACT);
    expect(r.emitted).toHaveLength(0);
    expect(r.queued).toHaveLength(1);
    const motivo = r.queued[0].reasons.join(' ');
    expect(motivo).toMatch(/s1/);
    expect(motivo).toContain('{{hoy+2}}');
  });

  it('con un literal emite como siempre', () => {
    const r = emitFromWalk(guion('10/11/2026'), mapa(), CONTRACT);
    expect(r.emitted).toHaveLength(1);
    expect(r.emitted[0].content).toContain('10/11/2026');
  });
});
