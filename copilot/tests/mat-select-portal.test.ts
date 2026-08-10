import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { chromium, type Browser } from '@playwright/test';
import type { DomMap, WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

/**
 * Fase 1 (SPEC-caos-corporativo §4) — `select` inteligente + resolución en
 * portal. `selectOption()` a ciegas revienta contra cualquier desplegable que
 * no sea un `<select>` real: la clase "selectOption lanzó sobre un div" que
 * bloqueaba el hueco Angular nº 1 de onesait.
 *
 * Par falsable: la política vieja (`loc.selectOption(value)` sobre el
 * disparador, sin ramificar) FALLA contra el widget en portal; el driver
 * ramificado (`selectSmart`) PASA sobre la misma página, sin declarar `scope`.
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
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-select-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'mat-select-portal',
    entry: '/mat-select-portal.html',
    flows: [{ flow: 'select', steps }],
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

describe('Fase 1 — par falsable: selectOption ciego vs select inteligente', () => {
  it('la politica vieja (selectOption ciego sobre el disparador) revienta contra el widget en portal', async () => {
    const browser: Browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(`${FIXTURES}/mat-select-portal.html`);
      const disparador = page.getByRole('combobox', { name: 'Estado Declaración' });
      await expect(disparador.selectOption('Rehusada')).rejects.toThrow();
    } finally {
      await browser.close();
    }
  }, 60_000);

  it('el driver ramificado resuelve el widget en portal SIN declarar scope', async () => {
    const map = await walk([
      {
        id: 's1',
        action: 'select',
        hint: { role: 'combobox', name: 'Estado Declaración' },
        value: 'Rehusada',
        expect_after: 'Seleccionado: Rehusada',
      },
    ]);

    const report = (map.step_reports ?? []).find((r) => r.step === 's1')!;
    expect(report.outcome).toBe('ok');
    expect(map.open_questions).toEqual([]);
  }, 60_000);
});

describe('Fase 1 — <select> nativo: match contra las opciones REALES, sin adivinar', () => {
  it('drift de mayúscula (guion "Rescate Total" vs opción real "Rescate total") resuelve por el normalizador', async () => {
    // La causa del cuelgue en onesait: selectOption("Rescate Total") a ciegas no
    // calzaba con "Rescate total" y agotaba el tope. Ahora resuelve único.
    const map = await walk([
      { id: 's1', action: 'select', hint: { label: 'Tipo Prestación (nativo)' }, value: 'Rescate Total' },
    ]);

    const report = (map.step_reports ?? []).find((r) => r.step === 's1')!;
    expect(report.outcome).toBe('ok');
    expect(map.open_questions).toEqual([]);
  }, 60_000);

  it('una opción que no existe se reporta con las opciones reales como drift, no se adivina', async () => {
    const map = await walk([
      { id: 's1', action: 'select', hint: { label: 'Tipo Prestación (nativo)' }, value: 'Rescate Trimestral' },
    ]);

    const blocked = map.open_questions.find((q) => q.step === 's1');
    expect(blocked).toBeDefined();
    expect(blocked!.reason).toContain('no existe en el <select>');
    expect(blocked!.reason).toContain('Rescate total'); // las opciones reales viajan en el motivo
  }, 60_000);

  it('dos opciones que normalizan igual → se planta, no elige una', async () => {
    const map = await walk([
      { id: 's1', action: 'select', hint: { label: 'Modo (ambiguo)' }, value: 'anual' },
    ]);

    const blocked = map.open_questions.find((q) => q.step === 's1');
    expect(blocked).toBeDefined();
    expect(blocked!.reason).toContain('ambigua');
  }, 60_000);
});

describe('Fase 1 — nunca adivina', () => {
  it('un value que no existe en el listbox se bloquea, no se adivina', async () => {
    const map = await walk([
      { id: 's1', action: 'select', hint: { role: 'combobox', name: 'Estado Declaración' }, value: 'No Existe' },
    ]);

    const blocked = map.open_questions.find((q) => q.step === 's1');
    expect(blocked).toBeDefined();
    expect(blocked!.reason).toContain('no resuelve única');
  }, 60_000);
});
