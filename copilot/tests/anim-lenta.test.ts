import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

/**
 * Fase 3 (SPEC-caos-corporativo §4) — matar animaciones. El botón objetivo
 * viaja DENTRO de un panel con una transición CSS de entrada de 1,5 s: la
 * comprobación de estabilidad de Playwright no deja completar el clic hasta
 * que el panel para de moverse. `settle.disable_animations` (knob del
 * contract, default ON) anula la transición y el mismo paso resuelve rápido.
 *
 * No es un par falsable (eso es Fase 1/5): con el knob en cualquiera de los
 * dos estados el paso PASA — la diferencia es de reloj, medida en
 * `step_reports[].action_ms`, tal como pide la aceptación de la spec.
 */

const FIXTURES = pathToFileURL(resolve(__dirname, '../fixtures')).href;

const contract: StyleContract = {
  locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
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

const STEPS: WalkStep[] = [
  { id: 's1', action: 'click', hint: { role: 'button', name: 'Mostrar panel' } },
  { id: 's2', action: 'click', hint: { role: 'button', name: 'Aceptar' }, expect_after: 'Confirmado' },
];

async function walk(disableAnimations: boolean | undefined): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-anim-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'anim-lenta',
    entry: '/anim-lenta.html',
    flows: [{ flow: 'panel', steps: STEPS }],
    ...(disableAnimations === undefined ? {} : { settle: { disable_animations: disableAnimations } }),
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
  };
  return new DomWalker(opts, script, contract, freshState()).run();
}

describe('Fase 3 — knob settle.disable_animations', () => {
  it('con el knob ON (default) el clic sobre el objetivo en movimiento resuelve rapido', async () => {
    const map = await walk(undefined); // default: on
    const s2 = (map.step_reports ?? []).find((r) => r.step === 's2')!;
    expect(s2.outcome).toBe('ok');
    // sin la transicion de 1.5s de por medio, muy por debajo de su duracion
    expect(s2.action_ms).toBeLessThan(1_000);
    expect(map.open_questions).toEqual([]);
  }, 120_000);

  it('con el knob OFF la ventana de quietud lo absorbe igual, pero mas lento', async () => {
    const map = await walk(false);
    const s2 = (map.step_reports ?? []).find((r) => r.step === 's2')!;
    expect(s2.outcome).toBe('ok');
    // Playwright espera a que el panel deje de moverse (1.5s de transicion) antes
    // de completar el clic: la comparativa que pide la aceptacion de la Fase 3.
    expect(s2.action_ms).toBeGreaterThan(1_300);
    expect(map.open_questions).toEqual([]);
  }, 120_000);
});
