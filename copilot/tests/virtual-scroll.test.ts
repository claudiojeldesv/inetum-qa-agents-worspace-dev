import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

/**
 * Fase 4 (SPEC-caos-corporativo §4) — `scroll_until` para listas virtualizadas
 * (patrón `cdk-virtual-scroll`): la fila objetivo no existe en el DOM hasta
 * hacer scroll hasta ella. Fixture de 5000 filas con solo lo visible +
 * colchón renderizado.
 */

const FIXTURES = pathToFileURL(resolve(__dirname, '../fixtures')).href;

const contract: StyleContract = {
  locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
  // sin spinner ni async en este fixture: el render es sincrono al evento
  // scroll, un quiet_ms bajo basta y mantiene el test rapido.
  settle: { quiet_ms: 50 },
};

const CONTAINER = { role: 'list', name: 'Filas virtualizadas' };

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

async function walk(steps: WalkStep[]): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-vscroll-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'virtual-scroll',
    entry: '/virtual-scroll.html',
    flows: [{ flow: 'scroll', steps }],
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

describe('Fase 4 — scroll_until materializa el objetivo off-screen', () => {
  it('una fila lejana (4000 de 5000) se materializa y se resuelve', async () => {
    const step: WalkStep = {
      id: 's1',
      action: 'scroll_until',
      hint: { text: 'Fila 4000' },
      container: CONTAINER,
      max_steps: 90,
    };
    const map = await walk([step]);

    const report = (map.step_reports ?? []).find((r) => r.step === 's1')!;
    expect(report.outcome).toBe('ok');
    expect(map.open_questions).toEqual([]);
  }, 120_000);
});

describe('Fase 4 — nunca afirma ausencia', () => {
  it('un objetivo inexistente agota max_steps y se reporta SIN afirmar que no existe', async () => {
    const step: WalkStep = {
      id: 's1',
      action: 'scroll_until',
      hint: { text: 'Fila 9999' }, // fuera de rango: solo hay 0-4999
      container: CONTAINER,
      max_steps: 15,
    };
    const map = await walk([step]);

    const report = (map.step_reports ?? []).find((r) => r.step === 's1')!;
    expect(report.outcome).toBe('postcondition_unmet');
    const blocked = map.open_questions.find((q) => q.step === 's1');
    expect(blocked).toBeDefined();
    expect(blocked!.reason).toContain('no se afirma que el registro no exista');
    expect(blocked!.reason).toContain('tope 15');
  }, 120_000);
});

describe('Fase 4 — validacion determinista del guion', () => {
  it('scroll_until requiere hint y container', async () => {
    const { validateWalkScript } = await import('../src/walk-core.ts');
    const script: WalkScript = {
      version: 1,
      site_id: 's',
      entry: '/',
      flows: [{ flow: 'f1', steps: [{ id: 's1', action: 'scroll_until' }] }],
    };
    const { ok, errors } = validateWalkScript(script);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toMatch(/requiere hint/);
    expect(errors.join(' ')).toMatch(/requiere container/);
  });
});
