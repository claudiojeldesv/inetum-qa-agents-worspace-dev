import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from '@playwright/test';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, StepReport, WalkScript, WalkState } from '../src/walk-types.ts';

/**
 * K0.19 — tier anclado en la escalera determinista. La clase: campo con etiqueta
 * visible NO asociada (label-en-celda de JSF/JSP/legacy). Descubierta en el login de
 * onesait (id="username", nearby="Usuario", sin `for=`), reproducida aquí de forma
 * GENÉRICA — el fixture no imita onesait, reproduce el patrón. El re-run contra
 * onesait es confirmación de campo; este test es el gate insesgado.
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
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-anchored-'));
  const script: WalkScript = { version: 1, site_id: 'login', entry: '/login-sin-label.html', flows: [{ flow: 'f', steps }] };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  return new DomWalker(opts, script, contract, freshState()).run();
}

const report = (m: DomMap, id: string): StepReport | undefined => (m.step_reports ?? []).find((r) => r.step === id);

describe('K0.19 — tier anclado por etiqueta visible vecina', () => {
  it('la clase existe: getByLabel/getByRole crudos NO encuentran el campo (sin nombre accesible)', async () => {
    const browser: Browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(`${FIX}/login-sin-label.html`);
      // el par falsable: por la etiqueta visible del FD ("Usuario") la vía semántica
      // devuelve 0 — no hay asociación label-for, y el title es "username", no "Usuario"
      expect(await page.getByLabel('Usuario').count()).toBe(0);
      expect(await page.getByRole('textbox', { name: 'Usuario' }).count()).toBe(0);
      // el campo SÍ tiene nombre accesible, pero es el title ("username", inglés) — no
      // el vocabulario del plan. Ese es justo el salto que el tier anclado puentea.
      expect(await page.getByRole('textbox', { name: 'username' }).count()).toBe(1);
      // y el texto visible que coincide con el FD está, como <h5> hermano del input
      expect(await page.getByText('Usuario').count()).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('el walker SÍ resuelve el campo por su etiqueta visible, sin ayuda y sin memoria', async () => {
    const map = await walk([
      { id: 's1', action: 'fill', hint: { label: 'Usuario' }, value: 'usuario-demo' },
      { id: 's2', action: 'fill', hint: { label: 'Contraseña' }, value: 'clave-demo', secret: true },
      { id: 's3', action: 'click', hint: { role: 'button', name: 'Login' }, expect_after: 'Sesión iniciada' },
    ]);
    // los tres pasos verdes: usuario y clave por el tier anclado, botón por su value
    expect(report(map, 's1')!.outcome).toBe('ok');
    expect(report(map, 's2')!.outcome).toBe('ok');
    expect(report(map, 's3')!.outcome).toBe('ok');
    expect(map.open_questions).toEqual([]);
    expect(map.stats.steps_blocked).toBe(0);
  }, 120_000);

  it('el campo contraseña (que NO tiene rol textbox) también resuelve por anclaje', async () => {
    // regresión: getByRole('textbox') excluye type=password; el tier anclado es
    // control-agnóstico y lo coge igual. Sin esto, la clave nunca resolvería sola.
    const map = await walk([{ id: 's1', action: 'fill', hint: { label: 'Contraseña' }, value: 'x' }]);
    expect(report(map, 's1')!.outcome).toBe('ok');
  }, 120_000);
});
