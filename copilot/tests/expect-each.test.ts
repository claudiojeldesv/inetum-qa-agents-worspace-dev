import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

/**
 * Fase 6 (SPEC-caos-corporativo §4) — `expect_each`: "cada listbox tiene ≥ 1
 * option", el ejemplo literal de la spec. Reutiliza el widget en portal de la
 * Fase 1 (`mat-select-portal.html`): abrirlo deja EXACTAMENTE un
 * `role="listbox"` visible con 3 `role="option"`.
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

async function walk(steps: WalkStep[]): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-each-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'mat-select-portal',
    entry: '/mat-select-portal.html',
    flows: [{ flow: 'each', steps }],
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

const ABRIR: WalkStep = { id: 's1', action: 'click', hint: { role: 'combobox', name: 'Estado Declaración' } };

describe('Fase 6 — expect_each: "cada listbox tiene >= 1 option"', () => {
  it('PASA: el listbox abierto tiene 3 options (>= 1)', async () => {
    const map = await walk([
      ABRIR,
      { id: 's2', action: 'expect_each', hint: { role: 'listbox' }, each: { hint: { role: 'option' }, operator: '>=', value: '1' } },
    ]);
    const report = (map.step_reports ?? []).find((r) => r.step === 's2')!;
    expect(report.outcome).toBe('ok');
    expect(map.open_questions).toEqual([]);
  }, 120_000);

  it('INCUMPLIDO cuando el umbral por-elemento no se cumple, sin crashear', async () => {
    const map = await walk([
      ABRIR,
      { id: 's2', action: 'expect_each', hint: { role: 'listbox' }, each: { hint: { role: 'option' }, operator: '>=', value: '5' } },
    ]);
    const report = (map.step_reports ?? []).find((r) => r.step === 's2')!;
    expect(report.outcome).toBe('postcondition_unmet');
    const blocked = map.open_questions.find((q) => q.step === 's2');
    expect(blocked).toBeDefined();
    expect(blocked!.reason).toMatch(/1\/1 contenedor/);
  }, 120_000);
});
