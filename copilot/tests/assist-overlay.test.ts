import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';

import { assistOverlayScript, TESTID_ATTR_CANDIDATES } from '../src/dom-walker.ts';
import { buildAssistSteps, pruneAssistSequence } from '../src/walk-core.ts';
import type { AssistSubmission, PickedElement, WalkStep } from '../src/walk-types.ts';

/**
 * Test del overlay del modo asistido (K0.10) contra el fixture de menú hover.
 * Determinístico y SIN humano: el test hace de QA (hover + click) y captura el
 * envío interceptando la función que en producción expone Node vía exposeFunction.
 *
 * Cubre lo que ninguna prueba pura puede: que el listener en fase de captura NO
 * cancele los eventos (el menú tiene que abrirse de verdad) y que el hover
 * sostenido se registre — el hueco que el recorder de Playwright no cubre.
 */
const FIXTURE = pathToFileURL(resolve(__dirname, '../fixtures/hover-menu.html')).href;
const STEP: WalkStep = {
  id: 's6',
  action: 'click',
  hint: { text: 'Simulación/Declaración Rescates' },
};

let browser: Browser;
let page: Page;

async function openWithOverlay(): Promise<AssistSubmission[]> {
  const sent: AssistSubmission[] = [];
  await page.exposeFunction('__qaAssistSubmit', (p: AssistSubmission) => {
    sent.push(p);
  });
  await page.goto(FIXTURE);
  await page.evaluate(assistOverlayScript(TESTID_ATTR_CANDIDATES, STEP, 'click sobre "Simulación/Declaración Rescates"'));
  return sent;
}

describe('overlay asistido (navegador real, fixture menú hover)', () => {
  beforeAll(async () => {
    browser = await chromium.launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('el submenú del fixture reproduce el bug: existe en el DOM pero no es clicable', async () => {
    page = await browser.newPage();
    await page.goto(FIXTURE);
    // resuelve (está en el DOM) pero no es visible → el click daría timeout
    expect(await page.getByText('Simulación/Declaración Rescates').count()).toBe(1);
    expect(await page.getByText('Simulación/Declaración Rescates').isVisible()).toBe(false);
    // y con hover sobre el padre sí
    await page.hover('#gestion');
    expect(await page.getByText('Simulación/Declaración Rescates').isVisible()).toBe(true);
    await page.close();
  }, 60_000);

  it('graba hover del abridor + click del objetivo, y deja pasar los eventos a la app', async () => {
    page = await browser.newPage();
    const sent = await openWithOverlay();

    // El shadow root es CERRADO a propósito (los locators de Playwright no lo
    // atraviesan → no interfiere con la resolución del walker). Se conduce por el
    // canal de comandos del host, no por coordenadas.
    const cmd = (c: string) =>
      page.evaluate((detail) => {
        document
          .querySelector('[data-qa-assist-host]')
          ?.dispatchEvent(new CustomEvent('qa-assist-cmd', { detail }));
      }, c);
    await cmd('record');

    // el QA hace de QA: hover sostenido en el padre (>400ms) y click en el hijo
    await page.hover('#gestion');
    await page.waitForTimeout(600);
    await page.click('#simulacion');

    // el evento NO fue cancelado por el overlay: la app reaccionó
    expect(await page.locator('#resultado').isVisible()).toBe(true);

    await cmd('stop');
    await page.waitForFunction(() => !document.querySelector('[data-qa-assist-host]'), undefined, { timeout: 5000 });

    expect(sent).toHaveLength(1);
    const sub = sent[0];
    expect(sub.kind).toBe('recorded');
    expect(sub.step).toBe('s6');

    const seq = pruneAssistSequence(sub.sequence);
    const target = seq[seq.length - 1];
    expect(target.via).toBe('click');
    expect(target.name).toContain('Simulación/Declaración Rescates');
    // y el abridor quedó grabado como hover: la coreografía que el recorder pierde
    expect(seq.some((e) => e.via === 'hover' && (e.name ?? '').includes('GESTIÓN'))).toBe(true);

    await page.close();
  }, 120_000);
});

describe('buildAssistSteps / pruneAssistSequence (puro)', () => {
  const el = (name: string, via: 'click' | 'hover', extra: Partial<PickedElement> = {}): PickedElement => ({
    role: 'link',
    name,
    via,
    ...extra,
  });

  it('el último click es el objetivo y lo anterior el camino', () => {
    const seq = [el('GESTIÓN', 'hover'), el('Simulación', 'click')];
    const steps = buildAssistSteps(seq, ["getByRole('link', { name: 'GESTIÓN' })", "getByText('Simulación')"]);
    expect(steps.map((s) => [s.action, s.role])).toEqual([
      ['hover', 'opener'],
      ['click', 'target'],
    ]);
    expect(steps[1].locator).toBe("getByText('Simulación')");
  });

  it('descarta lo posterior al objetivo (el QA siguió navegando)', () => {
    const seq = [el('GESTIÓN', 'hover'), el('Simulación', 'click'), el('Otra cosa', 'hover')];
    const steps = buildAssistSteps(seq, ['a', 'b', 'c']);
    expect(steps).toHaveLength(2);
    expect(steps[1].role).toBe('target');
  });

  it('el hint del paso propuesto lleva los campos de identidad capturados', () => {
    const seq = [el('Guardar', 'click', { test_id: 'btn-save', label: 'Guardar cambios' })];
    const [step] = buildAssistSteps(seq, ["getByTestId('btn-save')"]);
    expect(step.hint).toEqual({ test_id: 'btn-save', role: 'link', name: 'Guardar', label: 'Guardar cambios' });
  });

  it('poda repeticiones consecutivas y hovers sobre lo que luego se clica', () => {
    const seq = [el('GESTIÓN', 'hover'), el('GESTIÓN', 'hover'), el('GESTIÓN', 'click'), el('Simulación', 'click')];
    const pruned = pruneAssistSequence(seq);
    expect(pruned.map((e) => [e.name, e.via])).toEqual([
      ['GESTIÓN', 'click'],
      ['Simulación', 'click'],
    ]);
  });

  it('conserva el hover cuyo elemento NO se clica después (el abridor real)', () => {
    const seq = [el('GESTIÓN', 'hover'), el('Simulación', 'click')];
    expect(pruneAssistSequence(seq)).toHaveLength(2);
  });

  it('secuencia vacía → sin pasos (nunca inventa)', () => {
    expect(buildAssistSteps([], [])).toEqual([]);
  });
});
