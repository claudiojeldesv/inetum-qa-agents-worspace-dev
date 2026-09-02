/**
 * D78 — el triaje va DELANTE del panel, no solo delante del rescate LLM.
 *
 * El defecto lo vivió el QA en su estreno (Restful Booker, cp009): marcó `s8`
 * como inexistente —el mensaje que otro caso debía crear no estaba— y acto
 * seguido el panel le pidió señalar el botón «Close» **del diálogo que nunca se
 * abrió**. `triajeDelBloqueo` sabía decir «esto está en cascada, ni preguntes»
 * desde D68, pero corría en el camino del rescate: protegía el presupuesto de
 * tokens y no el tiempo del QA. En Tricentis, 22 de 45 bloqueos eran cascada.
 *
 * Y para el QA el daño es MAYOR que para el LLM: lo que enseña se promueve a
 * memoria durable con override humano, así que enseñar un locator sobre la
 * pantalla equivocada no se queda en el run — envenena los siguientes.
 *
 * El fixture responde 'drift' al PRIMER panel que se le abra. Si el segundo paso
 * (el condenado) abriera panel, también recibiría 'drift' y quedaría bloqueado
 * igual — por eso el test no mira el bloqueo, mira EL MOTIVO: solo la ruta del
 * triaje escribe «en cascada de».
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 'd78', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function correr(): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-d78-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'd78',
    entry: '/cascada-condenada.html?cmd=drift',
    flows: [
      {
        flow: 'mensajes',
        steps: [
          // la PUERTA: un click que no resuelve — el QA lo marcará como inexistente
          { id: 's1', action: 'click', hint: { role: 'link', name: 'Consulta sobre desayuno' } },
          // CONDENADO: su pantalla solo existiría si s1 hubiera abierto el diálogo
          { id: 's2', action: 'click', hint: { role: 'button', name: 'Close' } },
        ],
      },
    ],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: true, assistTimeoutMs: 30_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'aliases.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  return new DomWalker(opts, script, contract, freshState()).run();
}

describe('D78 — al QA no se le pregunta por pasos condenados', () => {
  it('el paso detrás de una puerta bloqueada se bloquea POR CASCADA, sin abrir panel', async () => {
    const map = await correr();
    const s2 = map.open_questions.find((q) => q.step === 's2');
    expect(s2, 'el paso condenado debería quedar registrado').toBeTruthy();
    // el motivo delata la ruta: solo el triaje escribe «en cascada de»
    expect(s2?.reason).toMatch(/en cascada de s1/);
  }, 90_000);

  it('la puerta sí se le preguntó: el triaje no silencia el bloqueo de verdad', async () => {
    const map = await correr();
    const s1 = map.open_questions.find((q) => q.step === 's1');
    expect(s1).toBeTruthy();
    // el QA respondió «no existe aquí» y eso es lo que queda escrito: drift, la
    // clase que dice «lo he mirado y no está», no una cascada que nadie miró
    expect(s1?.reason).toMatch(/^drift/);
    expect(s1?.reason).toMatch(/no presente/i);
    expect(s1?.reason).not.toMatch(/en cascada/);
  }, 90_000);
});
