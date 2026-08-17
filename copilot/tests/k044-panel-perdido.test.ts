/**
 * K0.44 (D10) — el panel asistido muere con la página, y el walker NO se cuelga.
 *
 * Del primer run de campo: el QA demostró el paso pulsando el enlace de logout, la
 * navegación destruyó el panel (se inyecta con `page.evaluate` sobre el documento
 * actual), y el walker se quedó esperando el timeout ENTERO —600 s por defecto—
 * porque lo único que podía resolver esa espera era una pulsación dentro de un
 * panel que ya no existía. Hubo que abortar el run.
 *
 * El par falsable: MISMO paso, MISMO panel, MISMO walker. Sobre una página estable
 * el vigilante no dice nada y se agota el plazo normal; sobre una que navega sola,
 * el walker corta pronto y lo dice con esas palabras.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DomWalker,
  assistOverlayScript,
  TESTID_ATTR_CANDIDATES,
  type StyleContract,
  type WalkerOptions,
} from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 'k044d10', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

/** Corre un paso IRRESOLUBLE con `--assist`: el panel se abre y nadie lo contesta. */
async function correr(entry: string, assistTimeoutMs: number): Promise<{ map: DomMap; ms: number }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-k044d10-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'k044d10',
    entry,
    flows: [
      {
        flow: 'f',
        // hint que no existe en la página: fuerza la apertura del panel
        steps: [{ id: 's1', action: 'click', hint: { role: 'button', name: 'Firmar el contrato' } }],
      },
    ],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: true, assistTimeoutMs, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  const t0 = Date.now();
  const map = await new DomWalker(opts, script, contract, freshState()).run();
  return { map, ms: Date.now() - t0 };
}

const razon = (m: DomMap): string => m.open_questions.find((q) => q.step === 's1')?.reason ?? '';

/**
 * El motivo se INTERPOLA en el código fuente que se genera para el panel. El
 * escapado manual cubría la comilla y el `<`, pero no el salto de línea — y el
 * aviso de panel perdido es el primer motivo multilínea que existe, así que lo
 * reventaba entero con un SyntaxError. Sin panel, y sin saber por qué.
 */
describe('K0.44 — el motivo del panel no puede romper su propio código', () => {
  const step: WalkStep = { id: 's1', action: 'click', hint: { role: 'button', name: 'X' } };
  const compila = (motivo: string) => () =>
    new Function(assistOverlayScript(TESTID_ATTR_CANDIDATES, step, motivo, false));

  it('un motivo de VARIAS LÍNEAS produce código válido', () => {
    expect(compila('primera línea\n\n⚠ segunda línea (intento 1/3)')).not.toThrow();
  });

  it("una comilla simple tampoco lo rompe", () => {
    expect(compila("pulsa el botón 'Aceptar' del diálogo")).not.toThrow();
  });

  it('una barra invertida tampoco (el escapado manual no la contemplaba)', () => {
    expect(compila('ruta C:\\temp\\informe')).not.toThrow();
  });

  it('el par falsable: un motivo corriente sigue compilando igual', () => {
    expect(compila('click sobre "Continuar"')).not.toThrow();
  });
});

describe('K0.44/D10 — el vigilante del panel', () => {
  it('página ESTABLE: el panel aguanta y se agota el plazo normal (el vigilante se calla)', async () => {
    const { map, ms } = await correr('/login-sin-label.html', 4_000);
    // el par falsable vive aquí: si el vigilante disparase sobre una página quieta,
    // cada asistencia legítima moriría con un diagnóstico inventado
    expect(razon(map)).toMatch(/timeout/);
    expect(razon(map)).not.toMatch(/desapareci/i);
    // y se esperó de verdad el plazo, no se cortó antes
    expect(ms).toBeGreaterThanOrEqual(3_500);
  }, 60_000);

  it('página que NAVEGA sola: corta pronto y nombra la causa, sin agotar el plazo', async () => {
    const PLAZO = 45_000;
    const { map, ms } = await correr('/panel-navegacion.html', PLAZO);
    expect(razon(map)).toMatch(/desapareci/i);
    // dice cuántas veces lo intentó, que es lo que permite distinguir "navegó una vez"
    // de "esta página redirige en bucle"
    expect(razon(map)).toMatch(/3 veces/);
    // LO QUE IMPORTA: antes esto consumía el plazo entero. 3 reintentos a 500 ms de
    // vigilancia sobre una página que navega cada 900 ms terminan en pocos segundos.
    expect(ms).toBeLessThan(PLAZO / 2);
  }, 90_000);
});
