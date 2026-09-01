/**
 * D81 — el camino del QA, de punta a punta, CONDUCIENDO el panel de verdad.
 *
 * Por qué existe este test y no basta con los 16 del núcleo: la primera versión
 * de D81 se envió a campo con el núcleo probado y la UI sin probar. El QA abrió
 * la lista, eligió la fila correcta, vio el marco naranja… y no pasó nada,
 * porque `submit` toma el PRIMER `as === 'target'` y la fila de la lista se
 * añadía al final. Un camino sin test de punta a punta es un camino que se
 * rompe en las manos de otro.
 *
 * El fixture reproduce la fachada real de Tricentis: el radio existe, tiene id
 * y nombre, y está TAPADO por un span de 20x20 que es quien lleva el binding.
 * Pulsar el input no marca nada — así el test distingue el arreglo bueno
 * (accionar el control visible) de un falso verde.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { gradoDeEvidencia } from '../src/walk-merge.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 'd81', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function correr(cmd: string): Promise<{ map: DomMap; workDir: string }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-d81-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'd81',
    entry: `/fachada-tapada.html?cmd=${cmd}`,
    flows: [
      {
        flow: 'asegurado',
        // hint que NO resuelve: fuerza el panel, igual que en campo
        steps: [{ id: 's1', action: 'check', hint: { test_id: 'no-existe-este-testid' } }],
      },
    ],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: true, assistTimeoutMs: 45_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'aliases.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  const map = await new DomWalker(opts, script, contract, freshState()).run();
  return { map, workDir };
}

describe('D81 — elegir de la lista funciona de punta a punta', () => {
  it('el QA elige la fila del control tapado y el paso SE EJECUTA (no queda bloqueado)', async () => {
    const { map } = await correr('inventario');
    const bloqueado = map.open_questions.find((q) => q.step === 's1');
    // Si la elección de la lista se ignorase —el defecto de campo— el paso
    // seguiría bloqueado y el motivo hablaría de hint irresoluble.
    expect(bloqueado, `el paso quedó bloqueado: ${bloqueado?.reason ?? ''}`).toBeUndefined();
    const report = (map.step_reports ?? []).find((r) => r.step === 's1');
    expect(report?.outcome).toBe('ok');
  }, 90_000);

  it('lo que se registra es el CONTROL VISIBLE, no el input oculto — la regla de Tricentis', async () => {
    const { map } = await correr('inventario');
    const rescate = (map.rescues ?? []).find((r) => r.step === 's1');
    expect(rescate?.locator, 'no se registró ningún locator').toBeTruthy();
    // el input existe y es tentador; el que sirve es el span que lo tapa
    expect(rescate?.locator).not.toBe('css=#gendermale');
    expect(rescate?.locator).toMatch(/gendermale|ideal-radio/);
  }, 90_000);

  it('«Bloquear paso» sigue bloqueando: la lista no rompe las salidas de siempre', async () => {
    const { map } = await correr('block');
    expect(map.open_questions.some((q) => q.step === 's1')).toBe(true);
  }, 90_000);

  /**
   * D79 — por defecto NO se abre una ventana nueva. La razón la puso el QA en
   * campo y es de su dominio: el replay re-ejecuta el camino previo en limpio,
   * así que vuelve a hacer login (mortal donde la app admite UNA sesión a la
   * vez, que en banca es lo normal) y vuelve a consumir datos de un solo uso.
   * `retry_safe` es una marca por paso y no puede conocer ninguna de las dos.
   *
   * El test lo fija por su consecuencia observable —el grado de evidencia—, que
   * es lo que acaba en el acta: `en-vivo` significa «verificado en la pantalla
   * que el QA tenía delante», y ese es el contrato honesto de este camino.
   */
  it('por defecto la verificación es EN VIVO: ni un replay, ni una ventana nueva', async () => {
    const { workDir } = await correr('inventario');
    const patch = JSON.parse(readFileSync(resolve(workDir, 'assist-patch.json'), 'utf8')) as {
      entries: Array<{ verified: boolean; verify_reason?: string }>;
    };
    const e = patch.entries[0];
    expect(e.verified).toBe(true);
    expect(e.verify_reason, 'sin motivo no se puede saber CÓMO se verificó').toBeTruthy();
    expect(e.verify_reason).toMatch(/SOLO EN VIVO/);
    // y el grado que verá el acta es el honesto, no el fuerte
    expect(gradoDeEvidencia(e)).toBe('en-vivo');
  }, 90_000);
});
