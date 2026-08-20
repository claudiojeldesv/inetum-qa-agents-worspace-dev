/**
 * K0.45 (D12) — la asistencia deja marcador EN DISCO, no solo en consola.
 *
 * Del segundo run de campo: el walker abrió el panel, lo anunció por consola
 * (`console.error`, ya existía), y el QA —que estaba al teclado— no se enteró en diez
 * minutos. Quien lanzó el walker canalizó la salida por `Select-Object -Last 60`, que no
 * emite hasta que el proceso termina. Panel abierto, ventana de navegador delante, y
 * silencio absoluto hasta que expiró el plazo.
 *
 * La lección no es "añade un mensaje" —el mensaje estaba—: es que un aviso cuya llegada
 * depende de cómo esté cableado stdout no es un aviso. El marcador en disco es la vía que
 * no depende de eso, y es el mismo patrón con el que `rescue-request.json` ya resolvió
 * exactamente este problema para el rescate.
 *
 * El par falsable está en el ciclo de vida: MIENTRAS está bloqueado el fichero existe;
 * cuando la espera se cierra, desaparece. Un marcador que se quedara pegado sería peor que
 * no tenerlo — diría "hay alguien esperando" sobre un run que ya terminó.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { assistMarkerPayload } from '../src/walk-core.ts';
import type { WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 'k045d12', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

describe('K0.45/D12 — el payload del marcador (puro)', () => {
  const base = {
    flow: 'login', step: 's2', action: 'fill', motivo: "fill sobre label 'nombre de usuario'",
    url: 'https://ejemplo/login', timeoutMs: 600_000, now: Date.UTC(2026, 7, 18, 9, 0, 0),
  };

  it('dice QUÉ HACER en castellano, no un booleano', () => {
    const p = assistMarkerPayload({ ...base, mutating: false });
    expect(p.estado).toBe('ESPERANDO AL QA');
    // lo que el QA necesita saber: que hay una VENTANA y que el walker no avanza sin él
    expect(p.que_hacer).toMatch(/ventana del navegador/i);
    expect(p.que_hacer).toMatch(/BLOQUEADO/);
    expect(p.que_hacer).toMatch(/Grabar/);
    expect(p.timeout_s).toBe(600);
  });

  it('el plazo se puede leer sin calcularlo: abierto + timeout = expira', () => {
    const p = assistMarkerPayload({ ...base, mutating: false });
    expect(Date.parse(p.expira) - Date.parse(p.abierto)).toBe(base.timeoutMs);
  });

  it('un paso que MUTA NEGOCIO lo avisa con todas las letras (K0.14)', () => {
    const p = assistMarkerPayload({ ...base, mutating: true });
    expect(p.muta_negocio).toBe(true);
    expect(p.que_hacer).toMatch(/MUTA NEGOCIO/);
    expect(p.que_hacer).toMatch(/capturar sin ejecutar/);
  });

  it('el par falsable: si no muta, ese aviso NO aparece', () => {
    // sin esta mitad el aviso saldría en cada asistencia y dejaría de significar nada
    const p = assistMarkerPayload({ ...base, mutating: false });
    expect(p.muta_negocio).toBe(false);
    expect(p.que_hacer).not.toMatch(/MUTA NEGOCIO/);
  });
});

describe('K0.45/D12 — el ciclo de vida del marcador contra un walk real', () => {
  it('existe MIENTRAS espera, y desaparece al cerrarse la espera', async () => {
    const workDir = mkdtempSync(resolve(tmpdir(), 'qa-k045d12-'));
    const marker = resolve(workDir, 'assist-pending.json');
    const script: WalkScript = {
      version: 1,
      site_id: 'k045d12',
      entry: '/login-sin-label.html',
      flows: [
        {
          flow: 'alta',
          // hint inexistente en la página: fuerza la apertura del panel
          steps: [{ id: 's2', action: 'click', hint: { role: 'button', name: 'Firmar el contrato' } }],
        },
      ],
    };
    const opts: WalkerOptions = {
      scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
      headed: false, assist: true, assistTimeoutMs: 20_000, assistMinimize: false,
      aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
    };

    expect(existsSync(marker)).toBe(false); // antes de arrancar no hay nada que atender

    let terminado = false;
    const corriendo = new DomWalker(opts, script, contract, freshState())
      .run()
      .finally(() => {
        terminado = true;
      });

    // Sondeo hasta que aparezca el marcador O termine el run. El presupuesto FIJO que había
    // aquí (40 × 100 ms) era un defecto mío: bajo la suite completa la máquina va ~4× más
    // lenta, el walker tarda más en LLEGAR al paso asistido, y la ventana de sondeo expiraba
    // antes de que el panel llegara a abrirse. El test caía por carga, no por el producto —
    // y un test que falla por carga deja de discriminar, que es lo único que se le pide.
    let visto: string | null = null;
    while (visto === null && !terminado) {
      if (existsSync(marker)) visto = readFileSync(marker, 'utf8');
      else await new Promise((r) => setTimeout(r, 50));
    }

    expect(visto, 'el marcador no apareció mientras el panel estaba abierto').not.toBeNull();
    const m = JSON.parse(visto as string);
    expect(m.estado).toBe('ESPERANDO AL QA');
    expect(m.flow).toBe('alta');
    expect(m.step).toBe('s2');
    expect(m.muta_negocio).toBe(true); // click no es reintentable (K0.13)

    await corriendo;

    // y el cerrojo del otro lado: un marcador pegado mentiría sobre un run terminado
    expect(existsSync(marker), 'el marcador sobrevivió al cierre de la espera').toBe(false);
  }, 120_000);
});
