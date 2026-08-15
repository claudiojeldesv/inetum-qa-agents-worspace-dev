import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from '@playwright/test';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, StepReport, WalkScript, WalkState } from '../src/walk-types.ts';

/**
 * K0.34 — la transición que la URL no delata, medida en el banco JSF 1.2 (Apache
 * MyFaces sobre Tomcat 7). El paso salía `ok`, así que no había ningún rojo que
 * mirar: lo que fallaba era el RELOJ. `waitForURL(u => u !== preUrl)` agotaba su
 * tope entero en cada transición y se lo tragaba un `.catch()`, de modo que cada
 * acción con `expect_transition` costaba diez segundos de más en silencio.
 *
 * En un caso corporativo de 30 pasos eso son cinco minutos de espera pura que no
 * aparecen en ninguna cifra de verdes. Por eso el test mide TIEMPO: es la única
 * variable que discrimina, porque el desenlace era correcto en los dos mundos.
 */
const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function walk(steps: WalkScript['flows'][0]['steps']): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-k034-'));
  const script: WalkScript = {
    version: 1, site_id: 'k034', entry: '/post-misma-url.html', flows: [{ flow: 'f', steps }],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  return new DomWalker(opts, script, contract, freshState()).run();
}

const report = (m: DomMap, id: string): StepReport | undefined => (m.step_reports ?? []).find((r) => r.step === id);

describe('K0.34 — transición por documento nuevo, no por cambio de URL', () => {
  it('la clase existe: el documento se sustituye y la URL no se mueve', async () => {
    const browser: Browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(`${FIX}/post-misma-url.html`);
      const antes = page.url();
      await page.evaluate('window.__marcaDePrueba = 1');
      await page.getByText('Continuar', { exact: true }).click();
      await page.waitForLoadState('domcontentloaded');
      // la marca desapareció: hay documento nuevo...
      expect(await page.evaluate('window.__marcaDePrueba === undefined')).toBe(true);
      // ...y sin embargo la URL es idéntica, que es lo que engañaba a la espera
      expect(page.url()).toBe(antes);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('el paso con expect_transition NO paga el tope entero', async () => {
    const map = await walk([
      { id: 's1', action: 'click', hint: { text: 'Continuar' }, expect_transition: true, screen: 'recargada', retry_safe: true },
    ]);
    const r = report(map, 's1')!;
    expect(r.outcome).toBe('ok');
    // con el defecto esto valía >10.000 ms (el tope de paso, agotado y tragado);
    // medido contra el banco JSF real: 10.806 ms antes, 618 ms después.
    expect(r.action_ms).toBeLessThan(6_000);
  }, 120_000);

  it('y la transición se registra igual: no se cambió corrección por velocidad', async () => {
    const map = await walk([
      { id: 's1', action: 'click', hint: { text: 'Continuar' }, expect_transition: true, screen: 'recargada', retry_safe: true },
    ]);
    expect(map.transitions.map((t) => t.to)).toContain('recargada');
    // las dos pantallas comparten URL: es justo el caso que no se sabía distinguir
    const urls = new Set(map.screens.map((s) => s.url_pattern));
    expect(map.screens.length).toBeGreaterThan(1);
    expect(urls.size).toBe(1);
  }, 120_000);
});
