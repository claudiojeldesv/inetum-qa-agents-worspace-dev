/**
 * D86 — un panel que caduca tiene que DEJAR DICHO cuántos gestos había.
 *
 * El defecto se descubrió investigando el estreno del QA en Restful Booker:
 * OCHO paneles seguidos caducaron a 600 s exactos, y al ir a diagnosticarlo dos
 * explicaciones quedaron **indistinguibles con lo que había en disco** — que el
 * QA se ausentara ~80 minutos, o que estuviera delante haciendo el gesto que el
 * panel no escucha (siete de los ocho eran pasos mutantes, donde se pide hover
 * + ◉ y no clic). La causa de no poder distinguirlas era el propio mecanismo:
 * `clearAssistMarker()` borraba el fichero Y vaciaba `assistRecorded` al
 * caducar, así que el timeout se llevaba los gestos **y la única prueba de que
 * hubo gestos**.
 *
 * Estos tests fijan lo que hace concluyente el próximo diagnóstico: el
 * desenlace del panel va al audit-log con el número de gestos, y ese registro
 * es append-only, así que sobrevive a que el panel siguiente sobrescriba el
 * marcador y a que el run termine.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 'd86', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

interface Entrada { action: string; reason?: string; metadata?: Record<string, unknown> }

async function correr(cmd: string): Promise<{ map: DomMap; cierres: Entrada[]; workDir: string }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-d86-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'd86',
    entry: `/panel-caduca.html${cmd ? `?cmd=${cmd}` : ''}`,
    flows: [
      {
        // paso MUTANTE (sin retry_safe) y con hint que no resuelve: es el caso de campo
        flow: 'formulario',
        steps: [{ id: 's1', action: 'click', hint: { test_id: 'no-existe-jamas' } }],
      },
    ],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    // plazo corto A PROPÓSITO: lo que se prueba es el desenlace, no la paciencia
    headed: false, assist: true, assistTimeoutMs: 3_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'aliases.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  const map = await new DomWalker(opts, script, contract, freshState()).run();
  const log = readFileSync(resolve(workDir, 'audit-log.json'), 'utf8').trim().split(/\r?\n/);
  const cierres = log
    .map((l) => { try { return JSON.parse(l) as Entrada; } catch { return null; } })
    .filter((e): e is Entrada => Boolean(e) && (e as Entrada).metadata?.phase === 'assist-close');
  return { map, cierres, workDir };
}

describe('D86 — un panel que caduca deja traza de lo que había', () => {
  it('nadie atiende: el cierre queda registrado con CERO gestos', async () => {
    const { cierres, workDir } = await correr('');
    expect(cierres, 'el cierre del panel debe registrarse siempre').toHaveLength(1);
    expect(cierres[0].metadata?.enviado).toBe(false);
    expect(cierres[0].metadata?.gestos_grabados).toBe(0);
    // y dice que el paso mutaba, que es la mitad del diagnóstico de campo
    expect(cierres[0].metadata?.paso_mutante).toBe(true);
    // Sin gestos NO se conserva marcador: dejarlo pegado pondría un
    // «ESPERANDO AL QA» sobre un run ya terminado (K0.45/D12).
    expect(existsSync(resolve(workDir, 'assist-pending.json')), 'sin nada que conservar, el marcador se retira').toBe(false);
  }, 90_000);

  it('el QA gesticuló y NO envió: el registro lo distingue de la ausencia', async () => {
    // Este es el par que faltaba en campo. Sin él, «se fue 80 minutos» y «estuvo
    // delante con el gesto equivocado» producen el MISMO rastro.
    const { cierres, workDir } = await correr('gesto');
    expect(cierres).toHaveLength(1);
    expect(cierres[0].metadata?.enviado).toBe(false);
    expect(cierres[0].metadata?.gestos_grabados, 'un hover grabado tiene que contarse').toBeGreaterThan(0);
    // y lo grabado NO se destruye: el marcador sobrevive para que un relanzamiento lo recupere
    expect(existsSync(resolve(workDir, 'assist-pending.json')), 'el marcador debe conservarse al caducar').toBe(true);
  }, 90_000);
});
