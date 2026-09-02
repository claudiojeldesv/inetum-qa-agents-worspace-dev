/**
 * FASE 2 de punta a punta — el rescate que NO mata el proceso.
 *
 * Lo que se prueba es la diferencia que justifica todo el diseño: con canal
 * declarado, el walker escribe la petición, ESPERA, consume la respuesta y sigue
 * **en la misma sesión** — sin `exit 42` y sin re-ejecutar el flujo desde su
 * primer paso (D66), que es lo que costaba 62 pasos re-ejecutados en Restful
 * Booker, el 56% de un run entero.
 *
 * El testigo de que no hubo `exit 42` es el test mismo: `process.exit()` mata
 * al proceso de vitest entero, así que **si el walker se muriera estos tests no
 * fallarían, desaparecerían**. Que `run()` devuelva un dom-map es la prueba.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 'f2', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

/**
 * Hace de orquestador: vigila la petición y contesta. Es exactamente el papel
 * que el diseño le asigna — el walker no habla con nadie, escribe un fichero y
 * espera un fichero (regla dura #5 intacta).
 */
function orquestadorQueContesta(workDir: string, locator: string): () => void {
  const req = resolve(workDir, 'rescue-request.json');
  const res = resolve(workDir, 'rescue-response.json');
  const t = setInterval(() => {
    if (!existsSync(req)) return;
    try {
      const r = JSON.parse(readFileSync(req, 'utf8')) as { step?: string };
      if (!r.step) return;
      writeFileSync(res, JSON.stringify({ step: r.step, locator }), 'utf8');
      clearInterval(t);
    } catch {
      // a medio escribir: en el siguiente ciclo
    }
  }, 120);
  return () => clearInterval(t);
}

async function correr(o: { canal?: object; locator?: string }): Promise<{ map: DomMap; workDir: string }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-f2-'));
  if (o.canal) writeFileSync(resolve(workDir, 'rescue-channel.json'), JSON.stringify(o.canal), 'utf8');
  const parar = o.locator ? orquestadorQueContesta(workDir, o.locator) : () => {};

  const script: WalkScript = {
    version: 1,
    site_id: 'f2',
    entry: '/step-window.html',
    flows: [
      {
        flow: 'rescate',
        steps: [
          // hint que NO resuelve: fuerza el camino del rescate
          { id: 's1', action: 'click', hint: { test_id: 'no-existe-jamas' } },
        ],
      },
    ],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 2, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 0, assistMinimize: false,
    aliasesPath: resolve(workDir, 'aliases.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  try {
    const map = await new DomWalker(opts, script, contract, freshState()).run();
    return { map, workDir };
  } finally {
    parar();
  }
}

describe('Fase 2 — con canal declarado, el walker espera y sigue vivo', () => {
  it('consume la respuesta EN PROCESO: el run termina, no sale con exit 42', async () => {
    // Si el walker hubiera muerto, `run()` no habría devuelto un dom-map: el
    // process.exit(42) mata el test entero. Que llegue aquí ES la prueba.
    const { map } = await correr({
      canal: { listener: 'test', timeout_ms: 20_000 },
      locator: 'css=#a',
    });
    expect(map.stats.rescues_used).toBe(1);
    const bloqueado = map.open_questions.find((q) => q.step === 's1');
    expect(bloqueado, `quedó bloqueado: ${bloqueado?.reason ?? ''}`).toBeUndefined();
  }, 90_000);

  it('la petición y la respuesta se limpian: no contaminan el siguiente bloqueo', async () => {
    const { workDir } = await correr({
      canal: { listener: 'test', timeout_ms: 20_000 },
      locator: 'css=#a',
    });
    expect(existsSync(resolve(workDir, 'rescue-response.json'))).toBe(false);
    expect(existsSync(resolve(workDir, 'rescue-request.json'))).toBe(false);
  }, 90_000);

  it('un locator de rescate que NO resuelve bloquea el paso, no cuelga el run', async () => {
    // La recursión del reintento está acotada por el presupuesto, no por un
    // contador aparte: sin esto, una respuesta mala reintentaría para siempre.
    const { map } = await correr({
      canal: { listener: 'test', timeout_ms: 20_000 },
      locator: "getByTestId('tampoco-existe')",
    });
    const q = map.open_questions.find((x) => x.step === 's1');
    expect(q).toBeTruthy();
    expect(q?.rescue_outcome ?? q?.reason).toMatch(/no resuelve|locator/i);
  }, 90_000);
});
