import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

/**
 * K0.36 — sitio 4 de la gira (Angular 19 + PrimeNG 19, plantilla Sakai). Tres
 * clases, todas medidas en campo antes de escribir una línea:
 *
 *   A. LA ETIQUETA APUNTA A UN COMPONENTE. `<label for="price">` y el id lo lleva
 *      el `<p-inputnumber>`, no el `<input>`. `getByLabel` da cero y la escalera
 *      se plantaba en cuatro campos de una pantalla donde la aplicación SÍ había
 *      declarado a qué se refiere cada etiqueta.
 *   B. EL PUENTE ANCLADO CRUZANDO A OTRO CAMPO. El ancla "Inventory Status" es
 *      única, su widget no es un control nativo, y `following::` saltó hasta un
 *      radio del grupo "Category". Lo pulsó, marcó una categoría y luego reportó
 *      fallo: estado de negocio cambiado por un paso que dice que no hizo nada.
 *   C. EL ÁMBITO QUE RESUELVE PERO NO CONTIENE. `scope:{text:'Product Details'}`
 *      resuelve al título del diálogo; dentro de un título no hay campos, y el
 *      paso moría con "hint irresoluble" — el diagnóstico que manda al QA a
 *      arreglar un hint que estaba bien.
 */
const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = {
  locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
};

function freshState(): WalkState {
  return {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function walk(steps: WalkScript['flows'][0]['steps']): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-k036-'));
  const script: WalkScript = {
    version: 1, site_id: 'k036', entry: '/etiqueta-a-componente.html',
    flows: [{ flow: 'f', steps }],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  return new DomWalker(opts, script, contract, freshState()).run();
}

const razon = (m: DomMap, id: string): string => m.open_questions.find((q) => q.step === id)?.reason ?? '';
const via = (m: DomMap, id: string): string =>
  (m.step_reports ?? []).find((r) => r.step === id)?.resolved_via ?? '';
const desenlace = (m: DomMap, id: string): string =>
  (m.step_reports ?? []).find((r) => r.step === id)?.outcome ?? '(sin reporte)';

describe('K0.36-A — la etiqueta apunta al componente y el peldaño honra el `for` declarado', () => {
  it('envoltorio con UN control dentro: se resuelve al control, no al envoltorio', async () => {
    const map = await walk([{ id: 's1', action: 'fill', hint: { label: 'Importe' }, value: '1250' }]);
    expect(desenlace(map, 's1')).toBe('ok');
    expect(via(map, 's1')).toBe("labelFor('Importe')");
  }, 120_000);

  it('envoltorio SIN control nativo: se resuelve al componente, que es lo que se pulsa', async () => {
    // el caso del p-select: no hay input por debajo y el desplegable se abre
    // pulsando el propio componente
    const map = await walk([{ id: 's1', action: 'click', hint: { label: 'Estado' } }]);
    expect(desenlace(map, 's1')).toBe('ok');
    expect(via(map, 's1')).toBe("labelFor('Estado')");
  }, 120_000);

  it('MITAD FALSABLE: con DOS controles dentro del envoltorio, se planta y la escalera PARA', async () => {
    // sin esto, "honrar el for" sería una excusa para elegir uno de los dos por
    // su cuenta. Y el primer intento de este test cazó que el tier anclado
    // deshacía la regla justo debajo: resolvía cogiendo el primer input que sigue
    // a la etiqueta. La ambigüedad no se repara descendiendo de peldaño (K0.33).
    const map = await walk([{ id: 's1', action: 'fill', hint: { label: 'Periodo' }, value: '2026' }]);
    const r = razon(map, 's1');
    expect(r).toContain('VARIOS controles');
    expect(r).not.toContain('hint irresoluble');
    expect(via(map, 's1')).not.toContain('labelFor');
    expect(via(map, 's1')).not.toContain('anchored');
  }, 120_000);
});

describe('K0.36-B — el puente anclado no cruza a un campo que ya tiene dueño', () => {
  it('se planta cuando el control que sigue pertenece a OTRA etiqueta', async () => {
    // "Ramo asegurado" es un rótulo sin asociación (el caso para el que existe el
    // tier anclado), su widget no es un control nativo, y el siguiente input vive
    // dentro de algo a lo que apunta <label for="cobertura1">
    const map = await walk([{ id: 's1', action: 'fill', hint: { label: 'Ramo asegurado' }, value: 'Hogar' }]);
    expect(razon(map, 's1')).toContain('hint irresoluble');
    expect(via(map, 's1')).not.toContain('anchored');
  }, 120_000);

  it('PAR FALSABLE: misma forma, control sin dueño → el puente SÍ actúa', async () => {
    // si este también se plantara, el test de arriba no probaría que discrimina la
    // guarda: probaría que el tier anclado dejó de funcionar
    const map = await walk([{ id: 's1', action: 'fill', hint: { label: 'Oficina emisora' }, value: 'Alicante' }]);
    expect(desenlace(map, 's1')).toBe('ok');
    expect(via(map, 's1')).toBe("anchored(label:'Oficina emisora')");
  }, 120_000);
});

describe('K0.36-C — el ámbito que resuelve pero no contiene se dice con esas palabras', () => {
  it('el hint no está dentro del ámbito, y el informe dice que sí está fuera', async () => {
    const map = await walk([
      { id: 's1', action: 'fill', hint: { label: 'Nombre' }, scope: { text: 'Datos del tomador' }, value: 'Ana' },
    ]);
    const r = razon(map, 's1');
    expect(r).toContain('NO está dentro del ámbito');
    expect(r).toContain('1 vez fuera');
    // el diagnóstico viejo mandaba a arreglar el hint, que estaba bien
    expect(r).not.toContain('hint irresoluble');
  }, 120_000);

  it('sin ámbito, ese mismo hint resuelve: la culpa era del ámbito y se demuestra', async () => {
    const map = await walk([{ id: 's1', action: 'fill', hint: { label: 'Nombre' }, value: 'Ana' }]);
    expect(desenlace(map, 's1')).toBe('ok');
  }, 120_000);
});
