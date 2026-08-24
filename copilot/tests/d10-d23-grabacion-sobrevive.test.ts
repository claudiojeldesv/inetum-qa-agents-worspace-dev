/**
 * D10 + D23 — lo grabado por el QA sobrevive al panel y al proceso.
 *
 * Los dos defectos tenían UNA causa: la secuencia vivía dentro del panel, en el
 * contexto de la página. Una navegación la destruía (D10) y un SIGTERM del proceso
 * que lanzó el walker se la llevaba igual (D23, ~10 min de espera contra un harness
 * que corta antes). El arreglo de K0.44 solo sabía AVISAR de la pérdida; avisar no
 * es conservar, y lo que se perdía era la evidencia más cara del sistema: clics
 * reales de una persona, irreproducibles sin volver a molestarla.
 *
 * Ahora sale de la página en cada gesto por `__qaAssistTrack` (los puentes de
 * exposeFunction SÍ sobreviven a la navegación) y se persiste en el marcador de
 * disco, cuyo ciclo de vida ya era exactamente el de la asistencia.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
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
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';
import { recuperarGrabacion, assistMarkerPayload } from '../src/walk-core.ts';
import type { PickedElement, WalkStep } from '../src/walk-types.ts';

const step: WalkStep = { id: 's1', action: 'click', hint: { role: 'button', name: 'Firmar' } };
const el = (name: string): PickedElement => ({ role: 'button', name, via: 'click' }) as PickedElement;
const GRABADO = [el('Aceptar'), el('Continuar')];

describe('D23 — los cerrojos de identidad de la recuperación', () => {
  const marker = assistMarkerPayload({
    flow: 'transferencia', step: 's4', action: 'click', motivo: 'x', url: 'u',
    mutating: false, timeoutMs: 600_000, now: 0, grabado: GRABADO, scriptHash: 'h1',
  });
  const actual = { flow: 'transferencia', step: 's4', scriptHash: 'h1' };

  it('mismo flujo, mismo paso y mismo guion: se recupera', () => {
    expect(recuperarGrabacion(marker, actual)).toEqual(GRABADO);
  });

  it('OTRO paso: no se recupera — ver pasos que no demostraste es peor que perderlos', () => {
    expect(recuperarGrabacion(marker, { ...actual, step: 's5' })).toBeNull();
  });

  it('OTRO flujo: no se recupera', () => {
    expect(recuperarGrabacion(marker, { ...actual, flow: 'alta' })).toBeNull();
  });

  it('el guion se reemitió (otro hash): no se recupera — el paso puede pedir otra cosa (D44)', () => {
    expect(recuperarGrabacion(marker, { ...actual, scriptHash: 'h2' })).toBeNull();
  });

  it('marcador sin grabación, vacío o ausente: no se inventa nada', () => {
    expect(recuperarGrabacion({ ...marker, grabado: [] }, actual)).toBeNull();
    expect(recuperarGrabacion(null, actual)).toBeNull();
    expect(recuperarGrabacion(undefined, actual)).toBeNull();
  });

  it('el marcador SIN grabación no gana campos: la asistencia normal no cambia de forma', () => {
    const limpio = assistMarkerPayload({
      flow: 'f', step: 's1', action: 'click', motivo: 'x', url: 'u',
      mutating: false, timeoutMs: 600_000, now: 0,
    });
    expect('grabado' in limpio).toBe(false);
  });
});

describe('D10 — el panel nace con lo ya grabado dentro', () => {
  it('la secuencia recuperada viaja al código del panel', () => {
    const src = assistOverlayScript(TESTID_ATTR_CANDIDATES, step, 'motivo', false, GRABADO);
    expect(src).toContain('Aceptar');
    expect(src).toContain('Continuar');
    // y sigue compilando: el JSON se interpola en el fuente del panel
    expect(() => new Function(src)).not.toThrow();
  });

  it('el par falsable: sin grabación el panel arranca vacío, como siempre', () => {
    const src = assistOverlayScript(TESTID_ATTR_CANDIDATES, step, 'motivo', false);
    expect(src).toContain('const seq = []');
    expect(() => new Function(src)).not.toThrow();
  });

  it('un nombre con comilla o barra invertida no rompe el panel al interpolarse', () => {
    const raro = [el("el botón 'Aceptar'"), el('ruta C:\\temp')];
    const src = assistOverlayScript(TESTID_ATTR_CANDIDATES, step, 'm', false, raro);
    expect(() => new Function(src)).not.toThrow();
  });

  it('el puente de persistencia se llama desde render(), el embudo de TODA mutación', () => {
    const src = assistOverlayScript(TESTID_ATTR_CANDIDATES, step, 'm', false);
    const render = src.slice(src.indexOf('const render = () => {'));
    // track() en las primeras líneas de render: si se cae de ahí, hay mutaciones
    // (quitar fila, re-capturar, editar locator, limpiar) que dejarían de persistir
    expect(render.slice(0, 400)).toContain('track()');
  });

  it('el panel tolera que el puente no exista (paneles de test sin walker detrás)', () => {
    const src = assistOverlayScript(TESTID_ATTR_CANDIDATES, step, 'm', false, GRABADO);
    expect(src).toContain('window.__qaAssistTrack &&');
  });
});

/**
 * La prueba de campo: navegador real, panel real, navegación real. El testigo es el
 * MARCADOR DE DISCO — ahí es donde la evidencia tiene que estar cuando la página ya
 * no está. Sin el arreglo, `grabado` no existe y la re-inyección arranca en vacío.
 */
describe('D10 en navegador: la navegación se lleva el panel, no lo grabado', () => {
  const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
  const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

  function freshState(): WalkState {
    return {
      script_hash: 'd10d23', completed: [], rescues_used: 0, screens: [], transitions: [],
      open_questions: [], rescues: [], current_screen: null, step_reports: [],
    };
  }

  it('el marcador de disco conserva la secuencia grabada a través de la navegación', async () => {
    const workDir = mkdtempSync(resolve(tmpdir(), 'qa-d10d23-'));
    const script: WalkScript = {
      version: 1,
      site_id: 'd10d23',
      entry: '/panel-graba-y-navega.html',
      // hint que no existe: fuerza la apertura del panel
      flows: [{ flow: 'f', steps: [{ id: 's1', action: 'click', hint: { role: 'button', name: 'Firmar el contrato' } }] }],
    };
    const opts: WalkerOptions = {
      scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
      headed: false, assist: true, assistTimeoutMs: 12_000, assistMinimize: false,
      aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
    };

    const marcadores: Array<{ grabado?: unknown[] }> = [];
    const espia = setInterval(() => {
      const p = resolve(workDir, 'assist-pending.json');
      if (!existsSync(p)) return;
      try {
        marcadores.push(JSON.parse(readFileSync(p, 'utf8')) as { grabado?: unknown[] });
      } catch {
        /* escritura a medias: el siguiente tick lo pilla */
      }
    }, 150);

    const map: DomMap = await new DomWalker(opts, script, contract, freshState()).run();
    clearInterval(espia);

    // en algún momento el marcador llevó la fila grabada: salió de la página ANTES
    // de que la página desapareciera, que es todo el arreglo
    const conGrabado = marcadores.filter((m) => Array.isArray(m.grabado) && m.grabado.length > 0);
    expect(conGrabado.length).toBeGreaterThan(0);

    // y el marcador se retira al cerrar la espera (no queda basura que resucite luego)
    expect(existsSync(resolve(workDir, 'assist-pending.json'))).toBe(false);
    expect(map.open_questions.length + map.step_reports.length).toBeGreaterThan(0);
  }, 180_000);
});
