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
  }, 120_000);

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
  }, 120_000);
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
  }, 120_000);

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
  }, 120_000);
});

/**
 * K0.29 (gira de stacks, sitio 1) — el estorbo DECLARADO que no se deja
 * descartar. Medido contra el banner del showcase de BootsFaces
 * (los banners de consentimiento tienen desde K0.30 su propio camino por diseño;
 * este fixture cubre el resto de overlays: promociones, encuestas, avisos). La
 * estrategia genérica no puede quitarlo: Escape no hace nada, no hay botón de
 * cierre y clicar el overlay tampoco.
 *
 * Antes del arreglo, declararlo era PEOR que no declararlo: tras correr el
 * manejador, Playwright espera a que el estorbo se oculte, no se oculta nunca y
 * TODA acción y TODA espera de accionabilidad del run agotan su tope — incluido
 * el ariaSnapshot del rescate, que llegaba vacío. El propio call log lo cantaba:
 * "waiting for .cc-window to be hidden — 19 × locator resolved to visible".
 */
describe('K0.29 — estorbo declarado que resiste el descarte', () => {
  it('no envenena el run: el paso que NO está tapado pasa igual', async () => {
    const { map } = await walk(
      '/estorbo-indescartable.html',
      [{ id: 's1', action: 'click', hint: { role: 'button', name: 'Continuar' }, expect_after: 'Accion libre hecha' }],
      {
        locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
        obstructions: { dismiss: ['.promo-overlay'] },
      },
    );
    const report = (map.step_reports ?? []).find((r) => r.step === 's1')!;
    expect(report.outcome).toBe('ok');
    expect(map.open_questions).toEqual([]);
  }, 120_000);

  it('el audit dice la VERDAD: "NO descartado", no "descartado"', async () => {
    const { auditEntries } = await walk(
      '/estorbo-indescartable.html',
      [{ id: 's1', action: 'click', hint: { role: 'button', name: 'Continuar' }, expect_after: 'Accion libre hecha' }],
      {
        locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
        obstructions: { dismiss: ['.promo-overlay'] },
      },
    );
    const dismiss = auditEntries.filter(
      (e) => (e.metadata as Record<string, unknown> | undefined)?.phase === 'obstruction-dismiss',
    );
    expect(dismiss.length).toBeGreaterThan(0);
    expect(dismiss.every((e) => (e.metadata as Record<string, unknown>).dismissed === false)).toBe(true);
    expect(dismiss[0].reason).toContain('NO descartado');
    // y solo se mide UNA vez: el manejador queda inerte, no repite la estrategia
    // ni el apunte en cada acción posterior
    expect(dismiss.length).toBe(1);
  }, 120_000);

  it('si de verdad TAPA el objetivo, el paso falla con el motivo real (no un timeout desnudo)', async () => {
    const { map } = await walk(
      '/estorbo-indescartable.html',
      [{ id: 's1', action: 'click', hint: { role: 'button', name: 'Enviar formulario' } }],
      {
        locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
        obstructions: { dismiss: ['.promo-overlay'] },
      },
    );
    const blocked = map.open_questions.find((q) => q.step === 's1');
    expect(blocked).toBeDefined();
    expect(blocked!.reason.toLowerCase()).toMatch(/intercept|pointer/);
  }, 120_000);
});
