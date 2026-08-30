/**
 * D5 — un expect_state VERDE tiene que ser emisible, medido de punta a punta.
 *
 * El defecto vivió tapado por los propios tests: el fixture de walk-to-spec
 * escribía `resolved_via` A MANO en el report de s5, así que el emisor emitía —
 * pero el walker REAL nunca escribía ese campo en expect_state, y en campo cada
 * expect_state verde tiraba su flujo entero a la cola del Writer («sin locator
 * autoritativo»): un paso correcto costaba una pasada de planner (~130k tokens).
 *
 * Por eso este test NO fabrica reports: corre el walker de verdad contra el
 * fixture y le da al emisor el dom-map que salió del navegador. Si el campo
 * vuelve a perderse, la segunda mitad se pone roja con la razón exacta.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker } from '../src/dom-walker.ts';
import type { StyleContract } from '../src/dom-walker.ts';
import { emitFromWalk, loadEmitContract } from '../src/walk-to-spec.ts';
import type { WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

const script: WalkScript = {
  version: 1,
  site_id: 'd5',
  entry: '/veredicto-autopilot.html',
  flows: [
    {
      flow: 'estado',
      criteria: ['RF-001'],
      steps: [{ id: 's1', action: 'expect_state', hint: { role: 'heading', name: 'Listado de peticiones' }, value: 'visible' }],
    },
  ],
};

function freshState(): WalkState {
  return {
    script_hash: 'd5', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

describe('D5 — el expect_state verde deja locator autoritativo y el emisor lo acepta', () => {
  it('EL PAR ENTERO: walker real → report con resolved_via → flujo EMITIDO, no encolado', async () => {
    const workDir = mkdtempSync(resolve(tmpdir(), 'qa-d5-'));
    const map = await new DomWalker(
      {
        scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
        headed: false, assist: false, assistTimeoutMs: 1000, assistMinimize: false,
        aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
      },
      script,
      contract,
      freshState(),
    ).run();

    const r = map.step_reports?.find((x) => x.step === 's1');
    expect(r?.outcome).toBe('ok');
    // la mitad que faltaba: el walker ESCRIBE lo que resolvió, como expect_value
    expect(r?.resolved_via, 'el expect_state verde no dejó locator autoritativo').toBeTruthy();

    // y la consecuencia de campo: el emisor emite en vez de encolar el flujo
    const emit = emitFromWalk(script, map, loadEmitContract(), { decisiones: [] });
    expect(
      emit.queued.flatMap((q) => q.reasons).join(' '),
      'el flujo se fue a la cola del Writer: D5 ha vuelto',
    ).not.toMatch(/sin locator autoritativo/);
    expect(emit.emitted).toHaveLength(1);
    expect(emit.emitted[0].content).toContain('toBeVisible()');
  }, 120_000);
});
