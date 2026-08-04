import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';

import { assistOverlayScript, TESTID_ATTR_CANDIDATES } from '../src/dom-walker.ts';
import {
  buildAssistSteps,
  buildFallbackCandidates,
  looksGeneratedId,
  parseLocatorChain,
  pruneAssistSequence,
} from '../src/walk-core.ts';
import type { AssistSubmission, LocatorCandidate, PickedElement, WalkStep } from '../src/walk-types.ts';

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

interface Harness {
  sent: AssistSubmission[];
  checked: PickedElement[];
}

/**
 * Monta el overlay con los DOS puentes que en producción expone el walker:
 * `__qaAssistSubmit` (envío) y `__qaAssistCheck` (calidad del locator en vivo,
 * K0.11c). El stub del check devuelve un veredicto fijo; lo que se verifica aquí es
 * que el panel lo consulta por cada elemento capturado.
 */
async function openWithOverlay(): Promise<Harness> {
  const h: Harness = { sent: [], checked: [] };
  await page.exposeFunction('__qaAssistSubmit', (p: AssistSubmission) => {
    h.sent.push(p);
  });
  await page.exposeFunction('__qaAssistCheck', (el: PickedElement) => {
    h.checked.push(el);
    return { ok: true, tier: 'semantic', fragile: false, label: 'semantic', why: '', source: 'stub' };
  });
  await page.goto(FIXTURE);
  await page.evaluate(assistOverlayScript(TESTID_ATTR_CANDIDATES, STEP, 'click sobre "Simulación/Declaración Rescates"'));
  return h;
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
    const { sent, checked } = await openWithOverlay();

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

    // el panel consultó la calidad del locator de cada elemento capturado (K0.11c)
    expect(checked.length).toBeGreaterThan(0);

    await cmd('stop');
    await page.waitForFunction(() => (window as never as { __x?: unknown }) && true, undefined, { timeout: 1000 }).catch(() => {});

    expect(sent).toHaveLength(1);
    const sub = sent[0];
    expect(sub.kind).toBe('recorded');
    expect(sub.step).toBe('s6');
    // el envío va limpio de metadatos de UI (_q no debe viajar a Node)
    expect(sub.sequence.every((e) => !('_q' in (e as unknown as Record<string, unknown>)))).toBe(true);

    // el panel NO se cierra solo: espera el veredicto del walker (K0.11e). Sin esto
    // el QA no llegaba a ver por qué había fallado — el bug de ergonomía de s7.
    expect(await page.locator('[data-qa-assist-host]').count()).toBe(1);
    await page.evaluate(() =>
      (window as unknown as { __qaAssistResult: (m: string, o: boolean) => void }).__qaAssistResult('Parche verificado', true),
    );
    await page.waitForFunction(() => !document.querySelector('[data-qa-assist-host]'), undefined, { timeout: 5000 });

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

  const cand = (source: string, tier: LocatorCandidate['tier'] = 'semantic', fragile = false): LocatorCandidate => ({
    source,
    tier,
    fragile,
  });

  it('el último click es el objetivo y lo anterior el camino', () => {
    const seq = [el('GESTIÓN', 'hover'), el('Simulación', 'click')];
    const steps = buildAssistSteps(seq, [
      cand("getByRole('link', { name: 'GESTIÓN' })"),
      cand("getByText('Simulación')"),
    ]);
    expect(steps.map((s) => [s.action, s.role])).toEqual([
      ['hover', 'opener'],
      ['click', 'target'],
    ]);
    expect(steps[1].locator).toBe("getByText('Simulación')");
  });

  it('propaga tier y fragilidad al paso (el QA tiene derecho a saberlo)', () => {
    const seq = [el('campo', 'click')];
    const [step] = buildAssistSteps(seq, [cand("getByRole('textbox').nth(3)", 'indexed', true)]);
    expect(step.tier).toBe('indexed');
    expect(step.fragile).toBe(true);
  });

  it('respeta el objetivo marcado a mano por el QA', () => {
    const seq = [el('GESTIÓN', 'click'), el('Otro', 'click')];
    const steps = buildAssistSteps(seq, [cand('a'), cand('b')], { targetIndex: 0 });
    expect(steps).toHaveLength(1);
    expect(steps[0].role).toBe('target');
    expect(steps[0].hint.name).toBe('GESTIÓN');
  });

  it('una fila marcada como comprobación se materializa en expect_text', () => {
    const seq = [el('Simulación', 'click'), { ...el('Operación realizada', 'click'), as: 'assertion' as const }];
    const steps = buildAssistSteps(seq, [cand('a'), cand('b')], { targetIndex: 0 });
    const assertion = steps.find((x) => x.role === 'assertion');
    expect(assertion?.action).toBe('expect_text');
    expect(assertion?.value).toBe('Operación realizada');
  });

  it('la accion del objetivo hereda la del paso bloqueado', () => {
    const seq = [el('campo', 'click')];
    const [step] = buildAssistSteps(seq, [cand('a')], { targetAction: 'fill' });
    expect(step.action).toBe('fill');
  });

  it('descarta lo posterior al objetivo (el QA siguió navegando)', () => {
    const seq = [el('GESTIÓN', 'hover'), el('Simulación', 'click'), el('Otra cosa', 'hover')];
    const steps = buildAssistSteps(seq, [cand('a'), cand('b'), cand('c')]);
    expect(steps).toHaveLength(2);
    expect(steps[1].role).toBe('target');
  });

  it('el hint del paso propuesto lleva los campos de identidad capturados', () => {
    const seq = [el('Guardar', 'click', { test_id: 'btn-save', label: 'Guardar cambios' })];
    const [step] = buildAssistSteps(seq, [cand("getByTestId('btn-save')")]);
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


/**
 * K0.11a end-to-end en navegador: el fallo REAL de onesait s7. Un campo sin nombre
 * accesible, sin label asociado y sin test-id, en un formulario generado por
 * servidor con ids autogenerados. Con la escalera vieja no había locator posible;
 * con la nueva tiene que salir uno — anclado al texto de la celda vecina — y tiene
 * que resolver ÚNICO contra el DOM real, distinguiendo los tres campos entre sí.
 */
const FORM_FIXTURE = pathToFileURL(resolve(__dirname, '../fixtures/form-sin-identidad.html')).href;

describe('escalera de fallback contra DOM real (caso onesait s7)', () => {
  let b: Browser;
  let p: Page;

  beforeAll(async () => {
    b = await chromium.launch();
    p = await b.newPage();
    await p.goto(FORM_FIXTURE);
  }, 120_000);

  afterAll(async () => {
    await b?.close();
  });

  it('el campo NO tiene identidad semantica: la escalera vieja se quedaba sin nada', async () => {
    const input = p.locator('#j_id123');
    expect(await input.count()).toBe(1);
    // sin nombre accesible, sin label asociado
    expect(await input.getAttribute('aria-label')).toBeNull();
    expect(await p.getByLabel('Número Póliza').count()).toBe(0);
    // y el rol solo no discrimina: hay 4 textbox en la página
    expect(await p.getByRole('textbox').count()).toBe(4);
  }, 60_000);

  /** Resuelve una cadena `A >> B >> C` como lo hace el driver. */
  const resolveChain = (start: Page, src: string) => {
    let cur: any = start;
    for (const { segment, nth } of parseLocatorChain(src)) {
      const f = segment.match(/^(.*)\.filter\(\{ hasText: '(.+)' \}\)$/);
      const base = f ? f[1] : segment;
      const withName = base.match(/^getByRole\('([^']+)', \{ name: '(.+)' \}\)$/);
      const roleOnly = base.match(/^getByRole\('([^']+)'\)$/);
      if (withName) cur = cur.getByRole(withName[1], { name: withName[2] });
      else if (roleOnly) cur = cur.getByRole(roleOnly[1]);
      else throw new Error('segmento no soportado en el test: ' + segment);
      if (f) cur = cur.filter({ hasText: f[2] });
      if (typeof nth === 'number') cur = cur.nth(nth);
    }
    return cur;
  };

  it('el candidato anchored resuelve UNICO y apunta al campo correcto', async () => {
    const el: PickedElement = {
      role: 'textbox',
      via: 'click',
      anchor: { role: 'form', name: 'Datos de la póliza' },
      nearby_text: 'Número Póliza',
      nth_of_role: 0,
    };
    const anchored = buildFallbackCandidates(el, ['getByRole', 'getByLabel']).filter(
      (c) => c.tier === 'anchored',
    );
    expect(anchored.length).toBeGreaterThan(0);

    // al menos uno de los contenedores propuestos resuelve único contra el DOM real
    let unique: any = null;
    let usado = '';
    for (const c of anchored) {
      const loc = resolveChain(p, c.source);
      if ((await loc.count()) === 1) { unique = loc; usado = c.source; break; }
    }
    expect(unique, 'ningún candidato anchored resolvió único').not.toBeNull();
    expect(usado).toContain("getByRole('row')");

    // y es EL campo, no otro del mismo formulario
    await unique.fill('POL-999');
    expect(await p.locator('#j_id123').inputValue()).toBe('POL-999');
    expect(await p.locator('#j_id124').inputValue()).toBe('');
  }, 60_000);

  it('discrimina entre campos hermanos del mismo formulario', async () => {
    const mk = (label: string): PickedElement => ({
      role: 'textbox',
      via: 'click',
      anchor: { role: 'form', name: 'Datos de la póliza' },
      nearby_text: label,
    });
    for (const [label, id] of [['Fecha Efecto', '#j_id124'], ['Importe', '#j_id125']] as const) {
      const cands = buildFallbackCandidates(mk(label), ['getByRole']).filter((c) => c.tier === 'anchored');
      let hit: any = null;
      for (const c of cands) {
        const loc = resolveChain(p, c.source);
        if ((await loc.count()) === 1) { hit = loc; break; }
      }
      expect(hit, `sin locator único para "${label}"`).not.toBeNull();
      await hit.fill('X-' + label);
      expect(await p.locator(id).inputValue()).toBe('X-' + label);
    }
  }, 60_000);

  it('los ids del fixture son de los que NO se deben usar como locator', async () => {
    for (const id of ['j_id123', 'j_id124', 'j_id200']) expect(looksGeneratedId(id)).toBe(true);
  }, 60_000);
});
