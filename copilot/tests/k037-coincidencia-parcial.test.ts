import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

/**
 * K0.37 — la evidencia dice lo que HABÍA, no lo que se buscó.
 *
 * Medido en campo comparando el walker con una ejecución solo-LLM sobre OrangeHRM:
 * el criterio del FD pedía "Records Found", la pantalla decía "(0) No Records
 * Found", el filtro no había encontrado nada y el caso salía VERDE en los dos
 * motores. El fallo estaba en el criterio de aceptación, no en el motor — pero el
 * artefacto de evidencia registraba el literal BUSCADO, así que escondía el único
 * dato con el que un QA podría haberlo visto.
 *
 * El veredicto NO cambia: decidir que "No X" niega a "X" es específico del idioma.
 * Se cita lo medido, igual que la nota de página de error (K0.35).
 */
const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function walk(steps: WalkScript['flows'][0]['steps']): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-k037-'));
  const script: WalkScript = {
    version: 1, site_id: 'k037', entry: '/coincidencia-parcial.html',
    flows: [{ flow: 'f', steps }],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  return new DomWalker(opts, script, contract, freshState()).run();
}

const reporte = (m: DomMap, id: string) => (m.step_reports ?? []).find((r) => r.step === id);

describe('K0.37 — el verde que hay que mirar dos veces se marca, sin cambiar el veredicto', () => {
  it('la aserción SIGUE pasando: el walker no decide que "No X" niega a "X"', async () => {
    const map = await walk([{ id: 's1', action: 'expect_text', value: 'Records Found' }]);
    expect(reporte(map, 's1')?.outcome).toBe('ok');
    expect(map.open_questions.filter((q) => q.step === 's1')).toHaveLength(0);
  }, 120_000);

  it('pero la evidencia deja de mentir: registra el texto COMPLETO de la pantalla', async () => {
    const map = await walk([{ id: 's1', action: 'expect_text', value: 'Records Found' }]);
    const r = reporte(map, 's1');
    expect(r?.matched_text).toBe('(0) No Records Found');
    expect(r?.value_searched).toBe('Records Found');
    // y el business_text del dom-map, que es lo que se lleva el Writer
    const bt = (map.screens ?? []).flatMap((s) => s.business_text ?? []).find((b) => b.name === 'Records Found');
    expect(bt?.matched_text).toBe('(0) No Records Found');
  }, 120_000);

  it('MITAD FALSABLE: una coincidencia EXACTA no se marca', async () => {
    // si se marcara todo, el aviso dejaría de significar nada y el QA lo ignoraría
    const map = await walk([{ id: 's1', action: 'expect_text', value: 'Consulta finalizada' }]);
    const r = reporte(map, 's1');
    expect(r?.outcome).toBe('ok');
    expect(r?.matched_text).toBeUndefined();
    expect(r?.value_searched).toBeUndefined();
  }, 120_000);

  it('el fragmento legítimo dentro de una frase también se cita, y eso es lo correcto', async () => {
    // el importe calculado vive dentro de una frase: la aserción por fragmento es
    // deliberada, y ver la frase entera es información, no ruido
    const map = await walk([{ id: 's1', action: 'expect_text', value: '1.250,00 EUR' }]);
    const r = reporte(map, 's1');
    expect(r?.outcome).toBe('ok');
    expect(r?.matched_text).toContain('El importe total de la póliza');
  }, 120_000);
});
