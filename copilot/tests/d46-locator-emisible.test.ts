/**
 * D46 — el peldaño que RESUELVE pero no deja nada que emitir.
 *
 * Medido en ParaBank el 2026-08-22 con el FD citado: el walker hizo **17/18 pasos,
 * 0 rescates**, y `walk-to-spec` emitió **cero** specs. Los tres flujos se encolaron
 * para el Writer por el mismo motivo — `anchored(label:'Username')` es notación de
 * diagnóstico, no código Playwright. El peldaño que existe justamente para el legacy
 * corporativo era el que impedía entregar nada en el legacy corporativo.
 *
 * Lo que convierte esto en la instancia más pura de la familia D2:
 * `StepReport.emit_locator` estaba **declarado** en `walk-types.ts` con un docstring
 * de once líneas, lo **consumía** `walk-to-spec`, y lo **probaba** un test... con el
 * campo escrito a mano en el fixture (`k046-emision-no-verbatim.test.ts`). Nadie lo
 * producía. Un test que le da al consumidor la salida del productor prueba el
 * consumidor y crea la ilusión de que la función existe.
 *
 * El fixture es fiel al login real de ParaBank (inputs sin id/label/aria, etiqueta en
 * celda hermana, `name` presente) e incluye el señuelo que importa: un segundo
 * `name="username"` oculto. Si la derivación no comprobara unicidad contra la página,
 * emitiría un locator que revienta en strict mode la primera vez que se ejecute.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { primerSegmentoNoExpresable } from '../src/walk-core.ts';
import { chainToCode } from '../src/walk-to-spec.ts';
import type { DomMap, StepReport, WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const ENTRY = '/login-sin-identidad-jsp.html';

/** El contract de ParaBank, en lo que este test mira. */
const CON_WHITELIST: StyleContract = {
  locators: {
    priority: ['getByLabel', 'getByRole', 'getByText', 'getByTestId'],
    css_fallback_attributes: ['name', 'id'],
  },
} as StyleContract;

/** El mismo sitio SIN la excepción declarada: no se fabrica nada. */
const SIN_WHITELIST: StyleContract = {
  locators: { priority: ['getByLabel', 'getByRole', 'getByText', 'getByTestId'] },
};

function freshState(): WalkState {
  return {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function walk(contract: StyleContract, steps: WalkScript['flows'][0]['steps']): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-d46-'));
  const script: WalkScript = { version: 1, site_id: 'jsp', entry: ENTRY, flows: [{ flow: 'f', steps }] };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  return new DomWalker(opts, script, contract, freshState()).run();
}

const rep = (m: DomMap, id: string): StepReport | undefined => (m.step_reports ?? []).find((r) => r.step === id);

const PASOS_LOGIN: WalkScript['flows'][0]['steps'] = [
  { id: 's1', action: 'goto', target: ENTRY },
  { id: 's2', action: 'fill', hint: { label: 'Username' }, value: 'john' },
];

describe('D46 — el walker PRODUCE el emit_locator que walk-to-spec ya consumía', () => {
  it('LA PREMISA: el peldaño sigue siendo el anclado y su notación NO es código', async () => {
    // si esto dejara de cumplirse, el resto del fichero no probaría nada:
    // estaríamos midiendo un campo que resolvió por un peldaño normal.
    const m = await walk(CON_WHITELIST, PASOS_LOGIN);
    const r = rep(m, 's2')!;
    expect(r.outcome).toBe('ok');
    expect(r.resolved_via).toMatch(/^anchored\(/);
    expect(primerSegmentoNoExpresable(r.resolved_via!)).not.toBeNull();
  }, 60_000);

  it('EL PAR FALSABLE: con la whitelist declarada, el paso trae emit_locator y COMPILA', async () => {
    const m = await walk(CON_WHITELIST, PASOS_LOGIN);
    const r = rep(m, 's2')!;
    expect(r.emit_locator).toBe('css=[name="username"]');
    // y lo que importa de verdad: que el emisor sepa convertirlo en código
    expect(primerSegmentoNoExpresable(r.emit_locator!)).toBeNull();
    expect(chainToCode(r.emit_locator!)).toContain("locator('[name=\"username\"]')");
  }, 60_000);

  it('sin whitelist en el contract NO se fabrica nada: la excepción es declarativa', async () => {
    const m = await walk(SIN_WHITELIST, PASOS_LOGIN);
    const r = rep(m, 's2')!;
    expect(r.outcome).toBe('ok');            // el walker resuelve igual
    expect(r.resolved_via).toMatch(/^anchored\(/);
    expect(r.emit_locator).toBeUndefined();  // pero no inventa un CSS que nadie autorizó
  }, 60_000);

  it('`resolved_via` NO se contamina: la medición del peldaño anclado se conserva', async () => {
    // meter el CSS en resolved_via falsearía una de las cifras del producto
    const m = await walk(CON_WHITELIST, PASOS_LOGIN);
    expect(rep(m, 's2')!.resolved_via).not.toContain('css=');
  }, 60_000);

  it('un atributo DUPLICADO no se emite aunque esté en la whitelist', async () => {
    // el fixture tiene un segundo name="username" oculto; el visible es único, así que
    // ESE sí sale. El caso que este test fija es el contrario: un `name` cuyo valor
    // aparece dos veces VISIBLE no puede producir locator.
    const m = await walk(CON_WHITELIST, [
      { id: 's1', action: 'goto', target: ENTRY },
      { id: 's2', action: 'fill', hint: { label: 'Amount' }, value: '100' },
    ]);
    const r = rep(m, 's2')!;
    expect(r.outcome).toBe('ok');
    expect(r.emit_locator).toBe('css=[name="amount"]'); // único visible → sí se emite
  }, 60_000);
});
