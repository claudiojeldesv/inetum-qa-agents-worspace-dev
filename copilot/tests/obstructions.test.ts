import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { AuditLogEntry } from '../../src/audit-log.ts';
import type { DomMap, WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

/**
 * Fase 2 (SPEC-caos-corporativo §4) — auto-descarte de estorbos. La ventana de
 * quietud NO puede ver un backdrop/snackbar fantasma: el DOM está quieto, el
 * overlay solo está ENCIMA interceptando el puntero. `obstructions.dismiss` es
 * opt-in por client pack, OFF por defecto: sin declararlo, el estorbo bloquea
 * el paso con el motivo de Playwright; declarado, se descarta y queda
 * auditado como evento de primera clase (`phase: 'obstruction-dismiss'`).
 */

const FIXTURES = pathToFileURL(resolve(__dirname, '../fixtures')).href;

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

async function walk(
  entry: string,
  steps: WalkStep[],
  contract: StyleContract,
): Promise<{ map: DomMap; auditEntries: AuditLogEntry[] }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-obstruction-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'obstruction',
    entry,
    flows: [{ flow: 'estorbo', steps }],
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
  const map = await new DomWalker(opts, script, contract, freshState()).run();
  const auditPath = resolve(workDir, 'audit-log.json');
  const auditEntries: AuditLogEntry[] = existsSync(auditPath)
    ? readFileSync(auditPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
  return { map, auditEntries };
}

describe('Fase 2 — backdrop fantasma (dismiss por Escape)', () => {
  it('SIN declarar el estorbo, el paso se bloquea con motivo claro (no se barre en silencio)', async () => {
    const { map } = await walk(
      '/backdrop-fantasma.html',
      [{ id: 's1', action: 'click', hint: { role: 'button', name: 'Continuar' } }],
      { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } },
    );
    const blocked = map.open_questions.find((q) => q.step === 's1');
    expect(blocked).toBeDefined();
    expect(blocked!.reason.toLowerCase()).toMatch(/intercept|pointer/);
  }, 60_000);

  it('CON el pack declarando el estorbo, el paso pasa y el descarte queda auditado', async () => {
    const { map, auditEntries } = await walk(
      '/backdrop-fantasma.html',
      [{ id: 's1', action: 'click', hint: { role: 'button', name: 'Continuar' }, expect_after: 'Continuado' }],
      {
        locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
        obstructions: { dismiss: ['.cdk-overlay-backdrop'] },
      },
    );
    const report = (map.step_reports ?? []).find((r) => r.step === 's1')!;
    expect(report.outcome).toBe('ok');
    expect(map.open_questions).toEqual([]);

    const dismiss = auditEntries.find((e) => (e.metadata as Record<string, unknown> | undefined)?.phase === 'obstruction-dismiss');
    expect(dismiss).toBeDefined();
    expect(dismiss!.action).toBe('skip');
    expect((dismiss!.metadata as Record<string, unknown>).selector).toBe('.cdk-overlay-backdrop');
    expect((dismiss!.metadata as Record<string, unknown>).step).toBe('estorbo/s1');
  }, 60_000);
});

describe('Fase 2 — snackbar que intercepta (dismiss por boton de cierre)', () => {
  it('SIN declarar el estorbo, el paso se bloquea con motivo claro', async () => {
    const { map } = await walk(
      '/snackbar-intercept.html',
      [{ id: 's1', action: 'click', hint: { role: 'button', name: 'Guardar' } }],
      { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } },
    );
    const blocked = map.open_questions.find((q) => q.step === 's1');
    expect(blocked).toBeDefined();
    expect(blocked!.reason.toLowerCase()).toMatch(/intercept|pointer/);
  }, 60_000);

  it('CON el pack declarando el estorbo, el clic al boton "Cerrar" propio lo descarta y el paso pasa', async () => {
    const { map, auditEntries } = await walk(
      '/snackbar-intercept.html',
      [{ id: 's1', action: 'click', hint: { role: 'button', name: 'Guardar' }, expect_after: 'Guardado' }],
      {
        locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
        obstructions: { dismiss: ['.mat-snack-bar-container'] },
      },
    );
    const report = (map.step_reports ?? []).find((r) => r.step === 's1')!;
    expect(report.outcome).toBe('ok');
    expect(map.open_questions).toEqual([]);

    const dismiss = auditEntries.find((e) => (e.metadata as Record<string, unknown> | undefined)?.phase === 'obstruction-dismiss');
    expect(dismiss).toBeDefined();
    expect((dismiss!.metadata as Record<string, unknown>).selector).toBe('.mat-snack-bar-container');
  }, 60_000);
});
