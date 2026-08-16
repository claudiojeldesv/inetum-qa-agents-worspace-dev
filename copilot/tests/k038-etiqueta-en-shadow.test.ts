import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

/**
 * K0.38 — sitio 5 de la gira (Vaadin Flow, primera familia con shadow DOM).
 *
 *   A. LA REFERENCIA ARIA QUE CRUZA LA FRONTERA. El `<input>` vive en el documento
 *      y declara `aria-labelledby` apuntando a una etiqueta que está DENTRO del
 *      shadow root del componente. La referencia se resuelve en el árbol del propio
 *      elemento, así que no encuentra nada y el nombre accesible queda vacío:
 *      `getByLabel` 0, `getByRole({name})` 0, y el tier anclado tampoco puede,
 *      porque su `following::` se queda en el árbol de la etiqueta.
 *   B. LA FOTO DEL CORPUS NO LLEVA EL SHADOW, y callarlo la convierte en basura
 *      silenciosa: el caso resuelve en vivo y se planta offline sin que nada lo diga.
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

async function walk(
  steps: WalkScript['flows'][0]['steps'],
  corpusDir?: string,
  workDirDado?: string,
): Promise<DomMap> {
  const workDir = workDirDado ?? mkdtempSync(resolve(tmpdir(), 'qa-k038-'));
  const script: WalkScript = {
    version: 1, site_id: 'k038', entry: '/etiqueta-en-shadow.html',
    flows: [{ flow: 'f', steps }],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
    ...(corpusDir ? { corpusDir } : {}),
  };
  return new DomWalker(opts, script, contract, freshState()).run();
}

const via = (m: DomMap, id: string): string =>
  (m.step_reports ?? []).find((r) => r.step === id)?.resolved_via ?? '';
const desenlace = (m: DomMap, id: string): string =>
  (m.step_reports ?? []).find((r) => r.step === id)?.outcome ?? '(sin reporte)';
const razon = (m: DomMap, id: string): string => m.open_questions.find((q) => q.step === id)?.reason ?? '';

describe('K0.38-A — la referencia declarada se completa aunque cruce la frontera del shadow', () => {
  it('lo que la escalera NO puede hacer sin el peldaño nuevo: nombre accesible vacío', async () => {
    // el par de control del experimento: los peldaños clásicos ven CERO, y por eso
    // el paso moría en un stack entero (todo Vaadin, y cualquier web component así)
    const map = await walk([{ id: 's1', action: 'fill', hint: { label: 'Idioma' }, value: 'es' }]);
    expect(razon(map, 's1')).toContain('hint irresoluble');
  }, 120_000);

  it('con la referencia declarada, resuelve y actúa sobre el control correcto', async () => {
    const map = await walk([{ id: 's1', action: 'fill', hint: { label: 'Usuario' }, value: 'ana.perez' }]);
    expect(desenlace(map, 's1')).toBe('ok');
    expect(via(map, 's1')).toBe("ariaLabelledby('Usuario')");
  }, 120_000);

  it('MITAD FALSABLE: sin `id` en la etiqueta no hay referencia que completar y el peldaño se queda quieto', async () => {
    // si resolviera igual, no estaría honrando una asociación declarada: estaría
    // adivinando por proximidad, que es justo lo que hace el tier anclado y por eso
    // ese va después y con guardas
    const map = await walk([{ id: 's1', action: 'fill', hint: { label: 'Idioma' }, value: 'es' }]);
    expect(via(map, 's1')).not.toContain('ariaLabelledby');
  }, 120_000);

  it('dos controles citando la MISMA etiqueta: se planta, no se elige', async () => {
    const map = await walk([{ id: 's1', action: 'fill', hint: { label: 'Duplicado' }, value: 'x' }]);
    expect(razon(map, 's1')).toContain('irresoluble');
    expect(via(map, 's1')).not.toContain('ariaLabelledby');
  }, 120_000);
});

describe('K0.38-B — la foto del corpus declara lo que NO puede llevarse', () => {
  it('avisa de los shadow roots con contenido en vez de emitir una foto muda', async () => {
    const corpusDir = mkdtempSync(resolve(tmpdir(), 'qa-k038-corpus-'));
    const workDir = mkdtempSync(resolve(tmpdir(), 'qa-k038-w-'));
    const map = await walk([{ id: 's1', action: 'fill', hint: { label: 'Usuario' }, value: 'ana' }], corpusDir, workDir);
    expect(desenlace(map, 's1')).toBe('ok');
    const audit = resolve(workDir, 'audit-log.json');
    const texto = existsSync(audit) ? readFileSync(audit, 'utf8') : '';
    expect(texto).toContain('foto del corpus INCOMPLETA');
    expect(texto).toContain('shadow root');
  }, 120_000);
});
