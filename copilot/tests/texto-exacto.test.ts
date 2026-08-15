import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from '@playwright/test';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, StepReport, WalkScript, WalkState } from '../src/walk-types.ts';

/**
 * K0.28 — las dos clases que el guion ciego de tufarmacia dejó nombradas con
 * evidencia (CP02-s1) y este ciclo arregla:
 *
 *   A. texto-exacto-antes-que-substring — `getByText` es substring, así que la
 *      palabra del menú también matcheaba la prosa del pie. El exacto era único.
 *   B. el-anclado-no-es-para-clicks — al plantarse el texto, el tier anclado
 *      puenteaba la palabra al primer control que la seguía y lo clicaba.
 *
 * El fixture reproduce la disposición, no el sitio. Cero cadenas de tufarmacia
 * en el kernel: lo que se arregla es la clase.
 */
const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };
/** Contract estricto de cliente: sin getByText en la prioridad. Ver el test del tier anclado. */
const sinTexto: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel'] } };

function freshState(): WalkState {
  return {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function walk(steps: WalkScript['flows'][0]['steps'], c: StyleContract = contract): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-texto-'));
  const script: WalkScript = { version: 1, site_id: 'texto', entry: '/texto-ambiguo.html', flows: [{ flow: 'f', steps }] };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  return new DomWalker(opts, script, c, freshState()).run();
}

const report = (m: DomMap, id: string): StepReport | undefined => (m.step_reports ?? []).find((r) => r.step === id);

describe('K0.28-A — el peldaño de texto prueba EXACTO antes que substring', () => {
  it('la clase existe: substring ve dos, exacto ve uno', async () => {
    const browser: Browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(`${FIX}/texto-ambiguo.html`);
      // par falsable: la vía de siempre es ambigua (enlace del menú + prosa del pie)
      expect(await page.getByText('Medicamentos').count()).toBe(2);
      // ...y el exacto, que la escalera no probaba, es único y es el objetivo
      expect(await page.getByText('Medicamentos', { exact: true }).count()).toBe(1);
      expect(await page.getByText('Medicamentos', { exact: true }).getAttribute('id')).toBe('enlace-menu');
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('el walker resuelve el enlace y la postcondición lo confirma', async () => {
    const map = await walk([
      { id: 's1', action: 'click', hint: { text: 'Medicamentos' }, expect_after: 'Seccion abierta' },
    ]);
    const r = report(map, 's1')!;
    expect(r.outcome).toBe('ok');
    // y lo resolvió por el peldaño exacto, no por un puente: el marcador lo dice
    expect(r.resolved_via).toBe("getByText('Medicamentos', { exact: true })");
    expect(map.open_questions).toEqual([]);
  }, 120_000);

  it('substring sigue siendo la red: un texto que solo aparece dentro de una frase resuelve', async () => {
    // sin esta pasada, arreglar la ambigüedad habría roto el drift de sufijos
    // ("Total: 12 €" cuando el FD dice "Total"). Exacto primero, substring detrás.
    const map = await walk([{ id: 's1', action: 'click', hint: { text: 'desde 1998' } }]);
    const r = report(map, 's1')!;
    expect(r.outcome).toBe('ok');
    expect(r.resolved_via).toBe("getByText('desde 1998')");
  }, 120_000);
});

describe('K0.28-B — el tier anclado no se aplica a acciones de puntero', () => {
  it('el puente existiría: tras la palabra del menú hay un input que following:: encuentra', async () => {
    const browser: Browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(`${FIX}/texto-ambiguo.html`);
      const bridged = page.getByText('Medicamentos', { exact: true })
        .locator('xpath=following::*[self::input or self::select or self::textarea][1]');
      expect(await bridged.count()).toBe(1);
      expect(await bridged.getAttribute('id')).toBe('q'); // el buscador: nada que ver con el enlace
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('con un contract sin getByText, el click se PLANTA en vez de clicar el control puenteado', async () => {
    // el contract estricto deja el peldaño de texto fuera: sin la guarda, el tier
    // anclado era el único que respondía y clicaba el buscador en silencio.
    const map = await walk([
      { id: 's1', action: 'click', hint: { text: 'Medicamentos' }, expect_after: 'Seccion abierta' },
    ], sinTexto);
    const blocked = map.open_questions.find((q) => q.step === 's1');
    expect(blocked, 'el paso debía quedar bloqueado, no resolverse por puente').toBeDefined();
    expect(blocked!.reason).toContain('hint irresoluble');
  }, 120_000);

  it('el par falsable: MISMO hint y MISMA página, pero con fill el puente sí actúa', async () => {
    // Cambia solo la acción. Sobre un control, "¿qué campo etiqueta este texto?"
    // es una pregunta legítima y el tier responde (K0.19). Sobre un click no lo es:
    // el objetivo podía ser un enlace. La guarda discrimina por eso, no por el hint.
    const map = await walk([
      { id: 's1', action: 'fill', hint: { text: 'Medicamentos' }, value: 'x' },
    ], sinTexto);
    const r = report(map, 's1')!;
    expect(r.outcome).toBe('ok');
    expect(r.resolved_via).toBe("anchored(label:'Medicamentos')");
  }, 120_000);

  it('control positivo: la etiqueta huérfana de un campo sigue resolviendo (K0.19 intacto)', async () => {
    // 'Buscar' es un <h5> sin asociación: el trabajo para el que existe el tier.
    const map = await walk([{ id: 's1', action: 'fill', hint: { label: 'Buscar' }, value: 'ibuprofeno' }], sinTexto);
    const r = report(map, 's1')!;
    expect(r.outcome).toBe('ok');
    expect(r.resolved_via).toContain('anchored(');
  }, 120_000);
});
