import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

/**
 * K0.39 — dos deudas con evidencia fresca del sitio 5, cerradas juntas.
 *
 *   A. EL MARCADOR. Cuatro contracts declaraban `getByPlaceholder` y la escalera lo
 *      IGNORABA EN SILENCIO. Nombrado desde K0.19 sin instancia medida hasta Vaadin,
 *      donde el buscador no tiene más identidad que su marcador. En PrimeNG pasa lo
 *      contrario —el marcador alimenta el nombre accesible—, y son esas dos
 *      mediciones en direcciones opuestas las que justifican el peldaño.
 *   B. LA POSTCONDICIÓN SOBRE ESTADO PREVIO. Tercera instancia de la familia del
 *      verde falso, cazada en mi propio guion de Vaadin: dos aserciones pasaron
 *      observando lo que ya había, porque el paso que debía cambiarlo estaba
 *      bloqueado.
 */
const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const CON_MARCADOR: StyleContract = {
  locators: { priority: ['getByRole', 'getByLabel', 'getByPlaceholder', 'getByText'] },
};
const SIN_MARCADOR: StyleContract = {
  locators: { priority: ['getByRole', 'getByLabel', 'getByText'] },
};

function freshState(): WalkState {
  return {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function walk(steps: WalkScript['flows'][0]['steps'], contract: StyleContract): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-k039-'));
  const script: WalkScript = {
    version: 1, site_id: 'k039', entry: '/marcador-y-estado-previo.html',
    flows: [{ flow: 'f', steps }],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  return new DomWalker(opts, script, contract, freshState()).run();
}

const rep = (m: DomMap, id: string) => (m.step_reports ?? []).find((r) => r.step === id);
const razon = (m: DomMap, id: string): string => m.open_questions.find((q) => q.step === id)?.reason ?? '';

describe('K0.39-A — el marcador deja de ignorarse, y solo donde el contract lo declara', () => {
  it('resuelve por el marcador cuando no hay otra identidad', async () => {
    const map = await walk([{ id: 's1', action: 'fill', hint: { name: 'Buscar' }, value: 'expediente' }], CON_MARCADOR);
    expect(rep(map, 's1')?.outcome).toBe('ok');
    expect(rep(map, 's1')?.resolved_via).toBe("getByPlaceholder('Buscar', { exact: true })");
  }, 120_000);

  it('EXACTO antes que substring: dos marcadores que empiezan igual no lo hacen ambiguo', async () => {
    // "Buscar" y "Buscar en el archivo historico": con substring son dos y el paso
    // se plantaría; el intento exacto encuentra uno solo. Mismo argumento de K0.28.
    const map = await walk([{ id: 's1', action: 'fill', hint: { name: 'Buscar' }, value: 'x' }], CON_MARCADOR);
    expect(rep(map, 's1')?.resolved_via).toContain('exact: true');
  }, 120_000);

  it('MITAD FALSABLE: si el contract NO lo declara, la escalera se comporta igual que antes', async () => {
    // el peldaño no se cuela por la puerta de atrás: es vocabulario del cliente
    const map = await walk([{ id: 's1', action: 'fill', hint: { name: 'Buscar' }, value: 'x' }], SIN_MARCADOR);
    expect(razon(map, 's1')).toContain('irresoluble');
    expect(rep(map, 's1')?.resolved_via ?? '').not.toContain('getByPlaceholder');
  }, 120_000);
});

describe('K0.39-B — la aserción que pasa tras un paso bloqueado se marca', () => {
  it('dice qué paso anterior no llegó a ejecutarse', async () => {
    const map = await walk(
      [
        { id: 's1', action: 'click', hint: { role: 'button', name: 'Aplicar filtro' } },
        { id: 's2', action: 'expect_text', value: 'Consulta disponible' },
      ],
      CON_MARCADOR,
    );
    expect(razon(map, 's1')).toContain('irresoluble');
    // el veredicto NO cambia: la aserción se cumplió de verdad
    expect(rep(map, 's2')?.outcome).toBe('ok');
    expect(rep(map, 's2')?.after_blocked).toBe('s1');
  }, 120_000);

  it('MITAD FALSABLE: sin paso bloqueado antes, no se marca nada', async () => {
    // si se marcara siempre, el aviso sería ruido y se ignoraría, como el de K0.37
    const map = await walk([{ id: 's1', action: 'expect_text', value: 'Consulta disponible' }], CON_MARCADOR);
    expect(rep(map, 's1')?.outcome).toBe('ok');
    expect(rep(map, 's1')?.after_blocked).toBeUndefined();
  }, 120_000);
});
