import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

/**
 * K0.26 — desplegable SIN rol (clase Bootstrap/PrestaShop, hallada en campo en
 * el "Ordenar por" de una tienda PrestaShop). La rama no-nativa de `selectSmart`
 * exigía role="listbox" tras abrir — sobreajuste a Angular Material que este
 * fixture falsa: aquí no hay listbox ni options, solo un <ul> que se muestra
 * por clase CSS. La capa 2 resuelve la opción como texto visible único a nivel
 * de página (exacto → normalizado), y la regla dura sigue mandando: el texto
 * duplicado fuera del menú planta al walker, no elige.
 */

const FIXTURES = pathToFileURL(resolve(__dirname, '../fixtures')).href;

const contract: StyleContract = {
  locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
};

function freshState(): WalkState {
  return {
    script_hash: 'test',
    completed: [],
    rescues_used: 0,
    screens: [],
    transitions: [],
    open_questions: [],
    rescues: [],
    current_screen: null,
    step_reports: [],
  };
}

async function walk(steps: WalkStep[]): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-dropdown-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'dropdown-sin-rol',
    entry: '/dropdown-sin-rol.html',
    flows: [{ flow: 'orden', steps }],
  };
  const opts: WalkerOptions = {
    scriptPath: 'test',
    contractPath: 'test',
    baseUrl: FIXTURES,
    workDir,
    rescueBudget: 0,
    screenCap: 60,
    headed: false,
    assist: false,
    assistTimeoutMs: 1_000,
    assistMinimize: false,
    aliasesPath: resolve(workDir, 'aliases.json'),
    timingProfilePath: resolve(workDir, 'timing.json'),
    calibrate: false,
  };
  return new DomWalker(opts, script, contract, freshState()).run();
}

describe('K0.26 — select sobre desplegable sin rol (Bootstrap/PrestaShop)', () => {
  it('resuelve la opción como texto visible único, con drift de mayúscula incluido', async () => {
    // El guion pide la opción en minúscula: exacto falla, el normalizador la
    // resuelve única — misma tolerancia de drift que la rama nativa (K0.23).
    const map = await walk([
      {
        id: 's1',
        action: 'select',
        hint: { text: 'Relevancia' },
        value: 'precio: de más bajo a más alto',
        expect_after: 'Orden aplicado: Precio: de más bajo a más alto',
      },
    ]);

    const report = (map.step_reports ?? []).find((r) => r.step === 's1')!;
    expect(report.outcome).toBe('ok');
    expect(map.open_questions).toEqual([]);
  }, 120_000);

  it('una opción ausente se reporta como tal, no se adivina', async () => {
    const map = await walk([
      { id: 's1', action: 'select', hint: { text: 'Relevancia' }, value: 'Precio por relevancia inversa' },
    ]);

    const blocked = map.open_questions.find((q) => q.step === 's1');
    expect(blocked).toBeDefined();
    expect(blocked!.reason).toContain('no resuelve única');
    expect(blocked!.reason).toContain('no apareció');
  }, 120_000);

  it('K0.26b: el ancla que puentea a un control OCULTO no resuelve — irresoluble honesto, no timeout engañoso', async () => {
    // Fiel a PrestaShop: tras "Ordenar por:" el primer control que sigue es el
    // <select> oculto que la fachada sincroniza. Antes: uniqueOrNull devolvía el
    // único-oculto y el walker quemaba el tope clicando un invisible ("click:
    // Timeout", culpando a la acción). Ahora: único visible o nada — el paso cae
    // como hint irresoluble ANTES de ejecutar, que es donde el panel puede ayudar.
    const map = await walk([
      { id: 's1', action: 'select', hint: { label: 'Ordenar por' }, value: 'Nombre, de A a Z' },
    ]);

    const blocked = map.open_questions.find((q) => q.step === 's1');
    expect(blocked).toBeDefined();
    expect(blocked!.reason).toContain('irresoluble');
    expect(blocked!.reason).not.toContain('Timeout');
  }, 120_000);

  it('texto de opción duplicado fuera del menú → se planta (ambigua), no elige', async () => {
    // "Nombre, de A a Z" existe también como leyenda visible fuera del menú:
    // sin contenedor declarado, ≥2 visibles a nivel de página es ambigüedad.
    const map = await walk([
      { id: 's1', action: 'select', hint: { text: 'Relevancia' }, value: 'Nombre, de A a Z' },
    ]);

    const blocked = map.open_questions.find((q) => q.step === 's1');
    expect(blocked).toBeDefined();
    expect(blocked!.reason).toContain('ambigua');
  }, 120_000);
});
