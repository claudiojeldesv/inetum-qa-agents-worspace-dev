import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, StepReport, WalkScript, WalkState } from '../src/walk-types.ts';

/**
 * Banco de clases estructurales de una aplicación corporativa (K0.16). Un flujo de
 * 30 pasos con la forma del CP001 del cliente, contra un fixture local: menú de tres
 * niveles por hover con señuelo, campo con id estilo JSF sin label, doble ciclo de
 * spinner, datos de negocio dentro de un iframe, dos botoneras con un "Siguiente"
 * cada una, cadena de cuatro ventanas flotantes con dos botones "X" idénticos, y una
 * tabla con selección de fila.
 *
 * No imita ninguna aplicación concreta: reproduce las clases, y cada una está aquí
 * porque costó un fallo. Es el banco de REGRESIÓN — no puede sorprendernos, solo
 * puede avisarnos de que rompimos algo que ya funcionaba.
 */

const FIXTURES = pathToFileURL(resolve(__dirname, '../fixtures')).href;

const contract: StyleContract = {
  locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
  settle: { quiet_ms: 400, busy_selectors: ['#velo'], ignore_selectors: [] },
};

function freshState(): WalkState {
  return {
    script_hash: 'test',
    completed: [],
    rescues_used: 0,
    screens: [],
    transitions: [],
    open_questions: [],
    rescues: [],
    current_screen: null,
    step_reports: [],
  };
}

let cached: DomMap | null = null;

/** Un solo walk para todas las aserciones: son 30 pasos con spinners de verdad. */
async function bench(): Promise<DomMap> {
  if (cached) return cached;
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-bench-'));
  const script = JSON.parse(
    readFileSync(resolve(__dirname, '../fixtures/corp-bench.walk.json'), 'utf8'),
  ) as WalkScript;
  const opts: WalkerOptions = {
    scriptPath: 'test',
    contractPath: 'test',
    baseUrl: FIXTURES,
    workDir,
    rescueBudget: 0,
    screenCap: 60,
    headed: false,
    assist: false,
    assistTimeoutMs: 1_000,
    assistMinimize: false,
    aliasesPath: resolve(workDir, 'aliases.json'),
    timingProfilePath: resolve(workDir, 'timing.json'),
    calibrate: true,
  };
  cached = await new DomWalker(opts, script, contract, freshState()).run();
  return cached;
}

const report = (map: DomMap, id: string): StepReport =>
  (map.step_reports ?? []).find((r) => r.step === id)!;

describe('banco corporativo — 30 pasos con forma de CP001', () => {
  it('el flujo entero pasa sin rescates, sin asistencia y sin bloqueos', async () => {
    const map = await bench();
    expect(map.stats.steps_total).toBe(30);
    expect(map.stats.steps_blocked).toBe(0);
    expect(map.stats.rescues_used).toBe(0);
    expect(map.open_questions).toEqual([]);
    expect(map.stats.postcondition_unmet).toBe(0);
  }, 300_000);

  it('campo con id estilo JSF y sin label: resuelto por locator autoritativo', async () => {
    const map = await bench();
    // ni name, ni label, ni test-id: sin el campo `locator` este paso no tiene forma
    // de escribirse en el guion y solo se resolvia con un humano delante
    expect(report(map, 's7').outcome).toBe('ok');
    expect(report(map, 's11').outcome).toBe('ok');
  }, 300_000);

  it('los datos de negocio dentro del IFRAME se ven y llevan frame_path', async () => {
    const map = await bench();
    expect(report(map, 's9').outcome).toBe('ok');
    const enFrame = map.screens
      .flatMap((s) => s.business_text ?? [])
      .filter((b) => (b.frame_path ?? []).length > 0);
    expect(enFrame.length).toBeGreaterThan(0);
    expect(enFrame[0].frame_path).toEqual(['iframe[name="detallePoliza"]']);
    expect(enFrame.some((b) => (b.name ?? '').startsWith('Tomador:'))).toBe(true);
  }, 300_000);

  it('de los DOS "Siguiente" se pulsa el de la botonera inferior', async () => {
    const map = await bench();
    // el de arriba no hace nada: si se hubiera pulsado ese, la postcondicion
    // ("es posible reinvertir el importe") no aparece y el paso sale unmet
    expect(report(map, 's12').outcome).toBe('ok');
    // y de paso, ahi es donde se observan los dos ciclos de ocupado de la carga
    expect(report(map, 's12').settle!.busy_cycles).toBeGreaterThanOrEqual(2);
  }, 300_000);

  it('los dos botones "X" de la cadena de modales se distinguen por contenedor', async () => {
    const map = await bench();
    // misma hint {role: button, name: X} en los dos pasos; lo unico que los separa
    // es el `scope` del dialogo. Sin el, indistinguibles — ni por hint ni por alias.
    expect(report(map, 's17').outcome).toBe('ok');
    expect(report(map, 's18').outcome).toBe('ok');
  }, 300_000);

  it('el texto de negocio no se confunde con la <option> del filtro que lo repite', async () => {
    const map = await bench();
    // "Rehusada" existe como valor de estado en la tabla Y como opcion del filtro.
    // La opcion va antes en el DOM y esta invisible: con .first() a secas la
    // postcondicion salia incumplida teniendo el resultado delante.
    expect(report(map, 's29').outcome).toBe('ok');
    const textos = map.screens.flatMap((s) => (s.business_text ?? []).map((b) => b.name));
    expect(textos).toContain('Rehusada');
  }, 300_000);

  it('la seleccion de fila y el select dentro del modal funcionan', async () => {
    const map = await bench();
    expect(report(map, 's26').outcome).toBe('ok'); // check del radio de la fila
    expect(report(map, 's28').outcome).toBe('ok'); // select por scope dentro del dialogo
  }, 300_000);
});
