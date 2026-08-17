import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { esCampoEtiquetable } from '../src/walk-core.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

/**
 * K0.41 — las dos piezas que salen de medir la escalera contra Mind2Web (§30).
 *
 *   A. EL PELDAÑO DE ETIQUETA SOLO PUEDE ENTREGAR UN CAMPO. De once resoluciones
 *      equivocadas de ese peldaño en el corpus, DIEZ no eran campos: seis `<div>`
 *      contenedores, tres `<a>` y un `<label>`.
 *   B. EL PELDAÑO DÉBIL SE AUTODELATA. 33 de los 38 fallos del corpus entero
 *      salieron del peldaño de texto, y hasta ahora se reportaba igual que los
 *      demás. No cambia el veredicto: cambia dónde mira el QA.
 */
const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const CONTRACT: StyleContract = {
  locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
};

function freshState(): WalkState {
  return {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function walk(entry: string, steps: WalkScript['flows'][0]['steps']): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-k041-'));
  const script: WalkScript = { version: 1, site_id: 'k041', entry, flows: [{ flow: 'f', steps }] };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  return new DomWalker(opts, script, CONTRACT, freshState()).run();
}

const rep = (m: DomMap, id: string) => (m.step_reports ?? []).find((r) => r.step === id);

describe('K0.41-A — qué cuenta como campo (juicio puro)', () => {
  it('un contenedor, un enlace y una etiqueta NO son campos', () => {
    // los tres casos exactos del corpus: delta (div), ryanair (a), united (label)
    expect(esCampoEtiquetable('div', null, null)).toBe(false);
    expect(esCampoEtiquetable('a', null, null)).toBe(false);
    expect(esCampoEtiquetable('a', 'link', null)).toBe(false);
    expect(esCampoEtiquetable('label', null, null)).toBe(false);
    // `link` fuera del conjunto es el corazón de la guarda: interactivo ≠ campo
    expect(esCampoEtiquetable('span', 'link', null)).toBe(false);
  });

  it('MITAD FALSABLE: los campos nativos Y los widgets de librería sí lo son', () => {
    // sin la segunda mitad, la guarda rompería Material, PrimeNG y Vuetify — o sea
    // justo los stacks de la gira, donde el campo es un <div role="combobox">
    expect(esCampoEtiquetable('input', null, 'text')).toBe(true);
    expect(esCampoEtiquetable('select', null, null)).toBe(true);
    expect(esCampoEtiquetable('textarea', null, null)).toBe(true);
    expect(esCampoEtiquetable('button', null, null)).toBe(true);
    expect(esCampoEtiquetable('div', 'combobox', null)).toBe(true);
    expect(esCampoEtiquetable('div', 'checkbox', null)).toBe(true);
    // un input oculto no es un campo que nadie pueda etiquetar de verdad
    expect(esCampoEtiquetable('input', null, 'hidden')).toBe(false);
  });
});

describe('K0.41-A — la guarda en la escalera viva', () => {
  it('la etiqueta en el CONTENEDOR ya no devuelve el contenedor', async () => {
    // `getByLabel('Ciudad')` matchea el <div aria-label="Ciudad">, que no es campo:
    // se trata como ausente y la escalera sigue bajando
    const map = await walk('/etiqueta-no-es-campo.html', [
      { id: 's1', action: 'fill', hint: { label: 'Ciudad' }, value: 'Madrid' },
    ]);
    expect(rep(map, 's1')?.resolved_via ?? '').not.toMatch(/^getByLabel/);
  }, 120_000);

  it('un ENLACE nunca sale del peldaño de etiqueta', async () => {
    // el caso de ryanair: getByLabel('destinos') alcanzaba al <a> de la promoción
    const map = await walk('/etiqueta-no-es-campo.html', [
      { id: 's1', action: 'fill', hint: { label: 'destinos' }, value: 'x' },
    ]);
    expect(rep(map, 's1')?.resolved_via ?? '').not.toContain('promo');
    expect(rep(map, 's1')?.resolved_via ?? '').not.toMatch(/^getByLabel/);
  }, 120_000);

  it('MITAD FALSABLE: el widget de librería SÍ resuelve por etiqueta', async () => {
    // si esto se rompiera, la guarda estaría podando de más y se llevaría por
    // delante a Material/PrimeNG, que es donde el campo no es nativo
    const map = await walk('/etiqueta-no-es-campo.html', [
      { id: 's1', action: 'click', hint: { label: 'Pais' } },
    ]);
    expect(rep(map, 's1')?.outcome).toBe('ok');
    expect(rep(map, 's1')?.resolved_via).toContain('getByLabel');
  }, 120_000);
});

describe('K0.41-B — el peldaño débil se autodelata', () => {
  it('marca el paso resuelto por texto, y dice si no hay red detrás', async () => {
    const map = await walk('/etiqueta-no-es-campo.html', [
      { id: 's1', action: 'click', hint: { text: '12 destinos recomendados para el verano' } },
    ]);
    expect(rep(map, 's1')?.outcome).toBe('ok');
    expect(rep(map, 's1')?.peldano_debil).toBe(true);
    // sin ninguna aserción después: nadie puede cazar un elemento equivocado aquí
    expect(rep(map, 's1')?.sin_red).toBe(true);
  }, 120_000);

  it('con una aserción de negocio detrás, ya no está SIN RED', async () => {
    const map = await walk('/etiqueta-no-es-campo.html', [
      { id: 's1', action: 'click', hint: { text: '12 destinos recomendados para el verano' } },
      { id: 's2', action: 'expect_text', value: 'Reserva de vuelo' },
    ]);
    expect(rep(map, 's1')?.peldano_debil).toBe(true);
    expect(rep(map, 's1')?.sin_red).toBeUndefined();
  }, 120_000);

  it('MITAD FALSABLE: lo que resuelve un peldaño FUERTE no se marca', async () => {
    // si se marcara todo, el aviso sería ruido y se ignoraría — el mismo error
    // que evitamos en K0.37 y K0.39
    const map = await walk('/etiqueta-no-es-campo.html', [
      { id: 's1', action: 'click', hint: { label: 'Pais' } },
    ]);
    expect(rep(map, 's1')?.peldano_debil).toBeUndefined();
    expect(rep(map, 's1')?.sin_red).toBeUndefined();
  }, 120_000);
});
