import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, SettleProfile, WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

/**
 * Fase 5 (SPEC-caos-corporativo §4) — settle consciente de debounce. Es la
 * clase K0.17 ("todavía no ha empezado") reubicada en inputs: tras teclear
 * hay un hueco de calma IGUAL al debounce (300 ms en el fixture) antes de que
 * el resultado se pinte, y ese hueco es calma FALSA.
 *
 * Par falsable, estilo K0.13: el MISMO guion (fill + click sobre el
 * resultado) sobre la MISMA página, y lo único que cambia es si el paso de
 * fill declara `debounce_ms`. Con un contract que NO está tuneado para este
 * campo (quiet_ms genérico, más corto que el debounce) la política vieja
 * PIERDE EL CLIC — el resultado aún no existe cuando se intenta clicarlo. Con
 * `debounce_ms` declarado, pasa a la primera.
 */

const FIXTURES = pathToFileURL(resolve(__dirname, '../fixtures')).href;

const contract: StyleContract = {
  locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
};

/** Un client pack que no conoce este campo: quiet_ms muy por debajo del debounce real (300 ms). */
const NAIVE_SETTLE: SettleProfile = { quiet_ms: 50, max_mutations: 999_999 };

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

async function walk(steps: WalkStep[], settleOverride?: SettleProfile): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-debounce-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'busqueda-debounce',
    entry: '/busqueda-debounce.html',
    flows: [{ flow: 'buscar', steps }],
  };
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
    calibrate: false,
    settleOverride,
  };
  return new DomWalker(opts, script, contract, freshState()).run();
}

const CLICK_RESULTADO: WalkStep = {
  id: 's2',
  action: 'click',
  hint: { role: 'button', name: 'Manzana' },
  expect_after: 'Seleccionado: Manzana',
};

describe('Fase 5 — par falsable: settle ciego al debounce vs consciente', () => {
  it('SIN debounce_ms, la politica vieja PIERDE el clic: el resultado aun no existe', async () => {
    const fill: WalkStep = { id: 's1', action: 'fill', hint: { label: 'Buscador' }, value: 'man' };
    const map = await walk([fill, CLICK_RESULTADO], NAIVE_SETTLE);

    const blocked = map.open_questions.find((q) => q.step === 's2');
    expect(blocked).toBeDefined();
    // hint irresoluble: el boton "Manzana" no existe todavia cuando se busca
    expect(blocked!.reason).toContain('presupuesto de rescates agotado');
  }, 60_000);

  it('CON debounce_ms declarado, el mismo guion sobre la misma pagina PASA', async () => {
    const fill: WalkStep = { id: 's1', action: 'fill', hint: { label: 'Buscador' }, value: 'man', debounce_ms: 300 };
    const map = await walk([fill, CLICK_RESULTADO], NAIVE_SETTLE);

    expect(map.open_questions).toEqual([]);
    const s2 = (map.step_reports ?? []).find((r) => r.step === 's2')!;
    expect(s2.outcome).toBe('ok');
  }, 60_000);

  it('debounced: true (sin ms explicito) cae al default conservador (300 ms) y tambien pasa', async () => {
    const fill: WalkStep = { id: 's1', action: 'fill', hint: { label: 'Buscador' }, value: 'man', debounced: true };
    const map = await walk([fill, CLICK_RESULTADO], NAIVE_SETTLE);

    expect(map.open_questions).toEqual([]);
    const s2 = (map.step_reports ?? []).find((r) => r.step === 's2')!;
    expect(s2.outcome).toBe('ok');
  }, 60_000);
});
