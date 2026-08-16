import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

/**
 * K0.24 — ventana de pasos (--from/--to) y pausa entre pasos (--step-delay).
 * `--to` es la vía SEGURA de llegar a una pantalla sin pasar de ella (parar antes
 * de una acción de negocio). `--from` salta los previos asumiendo estado presente.
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
  { id: 's1', action: 'fill', hint: { label: 'Campo A' }, value: 'a' },
  { id: 's2', action: 'fill', hint: { label: 'Campo B' }, value: 'b' },
  { id: 's3', action: 'fill', hint: { label: 'Campo C' }, value: 'c' },
];

async function walk(opts: Partial<WalkerOptions>): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-window-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'step-window',
    entry: '/step-window.html',
    flows: [{ flow: 'ventana', steps: STEPS }],
  };
  const base: WalkerOptions = {
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
  return new DomWalker({ ...base, ...opts }, script, contract, freshState()).run();
}

const executed = (map: DomMap): string[] =>
  (map.step_reports ?? []).map((r) => r.step).filter((s) => s !== '__entry');

describe('K0.24 — ventana de pasos', () => {
  it('sin ventana ejecuta los tres pasos', async () => {
    const map = await walk({});
    expect(executed(map)).toEqual(['s1', 's2', 's3']);
  }, 120_000);

  it('--to=s2 para en s2, no toca s3 (vía segura para no pasar de una pantalla)', async () => {
    const map = await walk({ toStep: 's2' });
    expect(executed(map)).toEqual(['s1', 's2']);
    expect(executed(map)).not.toContain('s3');
  }, 120_000);

  it('--from=s2 salta s1 y arranca en s2', async () => {
    const map = await walk({ fromStep: 's2' });
    expect(executed(map)).toEqual(['s2', 's3']);
    expect(executed(map)).not.toContain('s1');
  }, 120_000);

  it('--from=s2 --to=s2 ejecuta solo ese paso', async () => {
    const map = await walk({ fromStep: 's2', toStep: 's2' });
    expect(executed(map)).toEqual(['s2']);
  }, 120_000);

  it('--step-delay no rompe el run (los pasos siguen ejecutándose)', async () => {
    // el efecto es temporal (pausa entre pasos); aquí solo se verifica que la
    // opción está cableada y no altera qué pasos corren. El tiempo no se asserta
    // (sería flaky bajo carga de la suite completa).
    const map = await walk({ stepDelayMs: 50 });
    expect(executed(map)).toEqual(['s1', 's2', 's3']);
  }, 120_000);
});
