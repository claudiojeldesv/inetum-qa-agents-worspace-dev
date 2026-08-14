import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { chromium, type Browser, type Page } from '@playwright/test';
import type { AssistPatchStep, WalkFlow, WalkScript, WalkState } from '../src/walk-types.ts';

/**
 * K0.25 — el replay de verificación del parche es MUDO. Hallado en el rodaje
 * SauceDemo: verifyAssistPatch re-ejecutaba los pasos previos con el ejecutor
 * completo, así que un paso que no resolvía en el contexto limpio abría el panel
 * de asistencia DENTRO de la verificación (el "s9 bloqueado después de s14"),
 * saltarse los pasos bloqueados dejaba el replay en la pantalla equivocada, y el
 * replay pisaba step_reports/current_screen del run principal.
 *
 * Se testea el método directamente (privado en compile-time): el arnés de panel
 * completo no puede fabricar este estado sin un humano.
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

const targetStep = (label: string): AssistPatchStep => ({
  action: 'fill',
  hint: { label },
  locator: `getByLabel('${label}')`,
  role: 'target',
  tier: 'semantic',
  fragile: false,
});

let browser: Browser;
let page: Page;

function walkerWith(flowSteps: WalkFlow['steps'], state: WalkState): { walker: DomWalker; flow: WalkFlow } {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-verify-'));
  const flow: WalkFlow = { flow: 'verificacion', steps: flowSteps };
  const script: WalkScript = { version: 1, site_id: 'step-window', entry: '/step-window.html', flows: [flow] };
  const opts: WalkerOptions = {
    scriptPath: 'test',
    contractPath: 'test',
    baseUrl: FIXTURES,
    workDir,
    rescueBudget: 0,
    screenCap: 60,
    headed: false,
    // assist ON a propósito: si la verificación NO fuera muda, el panel se abriría
    // dentro del replay y el timeout corto haría fallar el test en vez de colgarlo.
    assist: true,
    assistTimeoutMs: 2_000,
    assistMinimize: false,
    aliasesPath: resolve(workDir, 'aliases.json'),
    timingProfilePath: resolve(workDir, 'timing.json'),
    calibrate: false,
  };
  const walker = new DomWalker(opts, script, contract, state);
  (walker as unknown as { page: Page }).page = page;
  return { walker, flow };
}

type VerifyFn = (flow: WalkFlow, failed: WalkFlow['steps'][number], steps: AssistPatchStep[]) => Promise<{ ok: boolean; reason?: string }>;
const verifyOf = (w: DomWalker): VerifyFn =>
  (w as unknown as { verifyAssistPatch: VerifyFn }).verifyAssistPatch.bind(w);

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  // el método usa this.page.context().browser() para abrir el contexto fantasma
  await page.goto(`${FIXTURES}/step-window.html`);
});

afterAll(async () => {
  await browser.close();
});

describe('K0.25 — verificación de parche muda', () => {
  it('camino feliz: el replay reproduce y verifica, SIN reportar los pasos replayados', async () => {
    const state = freshState();
    const { walker, flow } = walkerWith(
      [
        { id: 's1', action: 'fill', hint: { label: 'Campo A' }, value: 'a' },
        { id: 's2', action: 'click', hint: { text: 'NoExiste' } },
      ],
      state,
    );
    const verify = await verifyOf(walker)(flow, flow.steps[1], [targetStep('Campo B')]);
    expect(verify.ok).toBe(true);
    // s1 se EJECUTÓ en el replay pero no dejó rastro en el estado del run principal
    expect(state.step_reports).toEqual([]);
    expect(state.screens).toEqual([]);
    expect(state.open_questions).toEqual([]);
  }, 120_000); // margen bajo suite completa (16 ficheros en paralelo) — jitter, no lógica

  it('paso previo irresoluble → "replay falló", nunca panel (assist ON y no cuelga)', async () => {
    const state = freshState();
    const { walker, flow } = walkerWith(
      [
        { id: 's1', action: 'fill', hint: { label: 'EtiquetaQueNoExiste' }, value: 'x' },
        { id: 's2', action: 'click', hint: { text: 'NoExiste' } },
      ],
      state,
    );
    const verify = await verifyOf(walker)(flow, flow.steps[1], [targetStep('Campo B')]);
    expect(verify.ok).toBe(false);
    expect(verify.reason).toContain('hint irresoluble en s1');
    // y el fallo del replay no bloqueó pasos del run principal
    expect(state.open_questions).toEqual([]);
    expect(state.step_reports).toEqual([]);
  }, 120_000); // margen bajo suite completa (16 ficheros en paralelo) — jitter, no lógica

  it('paso previo BLOQUEADO → no se salta: verificación honesta "no reproducible en limpio"', async () => {
    const state = freshState();
    state.open_questions.push({
      flow: 'verificacion',
      step: 's1',
      action: 'fill',
      reason: 'bloqueado en el run principal',
      rescue_attempted: false,
    });
    const { walker, flow } = walkerWith(
      [
        { id: 's1', action: 'fill', hint: { label: 'Campo A' }, value: 'a' },
        { id: 's2', action: 'click', hint: { text: 'NoExiste' } },
      ],
      state,
    );
    const verify = await verifyOf(walker)(flow, flow.steps[1], [targetStep('Campo B')]);
    expect(verify.ok).toBe(false);
    expect(verify.reason).toContain('paso previo s1 está bloqueado');
  }, 120_000); // margen bajo suite completa (16 ficheros en paralelo) — jitter, no lógica
});
