/**
 * P4 — «Añadir comprobación de texto», la única adición a mano que sobrevivió.
 *
 * La auditoría de maquetas retiró «Añadir paso» con este motivo: *un paso de
 * acción necesita un locator, y un locator necesita un elemento señalado*. El
 * canal de comandos del panel tiene `target`, `remove`, `assert`, `edit` y
 * `recapture`, y NO tiene `add`, por esa razón.
 *
 * Pero dejó viva una distinción real: **una comprobación de texto sí se puede
 * escribir**, porque `findVisibleText` opera sobre una cadena y no necesita
 * locator. Esto la construye, con dos cerrojos:
 *
 *  1. se valida EN VIVO con la MISMA función con la que el run evalúa un
 *     `expect_text` — validar con otra búsqueda dejaría al QA escribir un
 *     oráculo que el panel acepta y el run no encuentra (la lección de D87);
 *  2. no puede sustituir al objetivo: un paso bloqueado sigue necesitando el
 *     elemento sobre el que actuar.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { AssistPatch, DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 'p4', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

interface Entrada { metadata?: Record<string, unknown> }

async function correr(
  cmd: string,
  pasos?: WalkScript['flows'][number]['steps'],
): Promise<{ map: DomMap; patch: AssistPatch | null; cierres: Entrada[] }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-p4-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'p4',
    entry: `/fachada-tapada.html?cmd=${cmd}`,
    flows: [{
      flow: 'asegurado',
      steps: pasos ?? [{ id: 's1', action: 'check', hint: { test_id: 'no-existe-este-testid' } }],
    }],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: true, assistTimeoutMs: 45_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'aliases.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  const map = await new DomWalker(opts, script, contract, freshState()).run();
  let patch: AssistPatch | null = null;
  try {
    patch = JSON.parse(readFileSync(resolve(workDir, 'assist-patch.json'), 'utf8')) as AssistPatch;
  } catch {
    patch = null;
  }
  const cierres = readFileSync(resolve(workDir, 'audit-log.json'), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((l) => { try { return JSON.parse(l) as Entrada; } catch { return null; } })
    .filter((e): e is Entrada => Boolean(e) && e!.metadata?.phase === 'assist-close');
  return { map, patch, cierres };
}

describe('P4 — la comprobación de texto que el QA escribe', () => {
  it('se guarda como un expect_text, detrás del objetivo', async () => {
    const { patch } = await correr('comprobacion');
    expect(patch, 'no se escribió parche').toBeTruthy();
    const pasos = patch!.entries[0].steps;
    const asercion = pasos.find((p) => p.role === 'assertion');
    expect(asercion, `pasos: ${JSON.stringify(pasos.map((p) => p.role))}`).toBeTruthy();
    expect(asercion!.action).toBe('expect_text');
    expect(asercion!.value).toBe('Poliza registrada');
    // y va DESPUÉS del objetivo: se comprueba lo que la acción produce
    expect(pasos.findIndex((p) => p.role === 'assertion')).toBeGreaterThan(
      pasos.findIndex((p) => p.role === 'target'),
    );
  }, 90_000);

  it('no arrastra fontanería: sin locator y sin hint inventado', async () => {
    // Un hint aquí acabaría en el guion emitido describiendo un elemento que
    // nadie señaló. La comprobación es una cadena y nada más.
    const { patch } = await correr('comprobacion');
    const asercion = patch!.entries[0].steps.find((p) => p.role === 'assertion')!;
    expect(asercion.locator).toBe('');
    expect(asercion.hint).toEqual({});
    const walk = patch!.entries[0].walk_steps.find((w) => w.action === 'expect_text')!;
    expect(walk.value).toBe('Poliza registrada');
    expect(walk.hint).toBeUndefined();
    expect(walk.locator).toBeUndefined();
  }, 90_000);

  it('el objetivo sigue siendo el objetivo: la comprobación no lo desplaza', async () => {
    const { map } = await correr('comprobacion');
    expect(map.open_questions, 'el paso tenía que ejecutarse igual').toHaveLength(0);
    const rescate = (map.rescues ?? []).find((r) => r.step === 's1');
    expect(rescate?.locator).toMatch(/gendermale|ideal-radio/);
  }, 90_000);

  it('un texto que NO se ve se rechaza, y no entra en el parche', async () => {
    // El par falsable: sin este test, el de arriba probaría que se puede añadir
    // cualquier cosa, no que se valida.
    const { patch } = await correr('comprobacion-falsa');
    expect(patch, 'el objetivo sí se resolvió, así que hay parche').toBeTruthy();
    const asercion = patch!.entries[0].steps.find((p) => p.role === 'assertion');
    expect(asercion, 'un oráculo que nace roto no puede colarse').toBeUndefined();
  }, 90_000);
});

describe('P4 — la vista de caso en un run REAL del walker', () => {
  it('el panel que inyecta el walker lleva las filas del caso dentro', async () => {
    // Los tests de la vista inyectan el panel a mano para poder leer su shadow
    // root cerrado. Este comprueba la otra mitad: que en un run de verdad
    // `p3DelPaso` le pasa las filas, y que pedir la postura no revienta el guion
    // de posturas (si reventara, el panel no llegaría a entregar nada y el paso
    // quedaría bloqueado).
    const { map, cierres } = await correr('caso', [
      { id: 's1', action: 'expect_text', value: 'Poliza registrada' },
      { id: 's2', action: 'check', hint: { test_id: 'no-existe-este-testid' } },
      { id: 's3', action: 'expect_text', value: 'Poliza registrada' },
    ]);
    expect(map.open_questions, 'el paso tenía que resolverse igual').toHaveLength(0);
    expect(cierres, 'el cierre del panel se registra siempre (D86)').toHaveLength(1);
    expect(cierres[0].metadata?.caso_filas, 'el panel se pintó sin caso').toBe(3);
  }, 90_000);

  it('la postura de caso NO se recuerda: el panel abre listo para trabajar', async () => {
    // Es una postura de LECTURA. Persistirla haría que el panel siguiente
    // abriera enseñando el caso y el QA tuviera que volver atrás en cada paso.
    await correr('caso', [
      { id: 's1', action: 'expect_text', value: 'Poliza registrada' },
      { id: 's2', action: 'check', hint: { test_id: 'no-existe-este-testid' } },
    ]);
    const ruta = resolve(process.cwd(), 'config/panel-prefs', 'p4.json');
    const prefs = existsSync(ruta) ? (JSON.parse(readFileSync(ruta, 'utf8')) as { postura?: string }) : {};
    expect(prefs.postura).toBeUndefined();
  }, 90_000);
});
