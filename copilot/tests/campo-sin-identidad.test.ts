/**
 * El mapa deja de quedarse mudo donde el sitio es difícil.
 *
 * Medido en campo el 2026-08-24, en el A/B del FD literal sobre ParaBank
 * (`docs/findings/ab-fd-literal-parabank-sellado.md`): los dos campos del login
 * salían del `dom-map` así, **en los dos brazos**
 *
 *     form "form0"  submit: "Log In"
 *       campo: {"role":"textbox","cands":[]}
 *       campo: {"role":"textbox","cands":[]}
 *
 * y en el brazo citado el walker LOS HABÍA RESUELTO, por el peldaño anclado. O sea:
 * el conocimiento existía y no llegaba al mapa que leen el panel (para ofrecer
 * candidatos), el POM scaffolder y el discovery-analyzer. La forma de D46 otra vez —
 * algo que se sabe y no llega al consumidor.
 *
 * El contract de ese sitio declara `css_fallback_attributes: [name, id]` desde hace
 * meses y el walker ya lo usa como peldaño; lo que no hacía era anotarlo en el mapa.
 *
 * Los cuatro controles son tan importantes como el caso positivo: un fallback que
 * propone locators no únicos, o que pisa a un locator semántico, hace más daño que
 * el hueco que viene a tapar.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { buildLocatorCandidates, cssAttrLocator } from '../src/walk-core.ts';
import type { DomElement, DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;

const contractCon: StyleContract = {
  locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'], css_fallback_attributes: ['name', 'id'] },
} as StyleContract;
const contractSin: StyleContract = {
  locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
} as StyleContract;

function freshState(): WalkState {
  return {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function capturar(contract: StyleContract): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-csi-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'campo-sin-identidad',
    entry: '/campo-sin-identidad.html',
    flows: [{ flow: 'f', steps: [{ id: 's1', action: 'goto', target: '/campo-sin-identidad.html', screen: 'form' }] }],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  return new DomWalker(opts, script, contract, freshState()).run();
}

/** Todos los elementos del mapa, vengan de donde vengan (listas sueltas o formularios). */
function elementos(m: DomMap): DomElement[] {
  const out: DomElement[] = [];
  for (const s of m.screens ?? []) {
    out.push(...(s.elements ?? []), ...(s.business_text ?? []));
    for (const f of s.forms ?? []) {
      out.push(...(f.fields ?? []));
      if (f.submit) out.push(f.submit);
    }
  }
  return out;
}

describe('buildLocatorCandidates — el fallback va el último, y solo si no hay nada', () => {
  it('sin identidad semántica: el atributo es el ÚNICO candidato', () => {
    const el = { role: 'textbox', css_attr: { attr: 'name', value: 'username' } };
    expect(buildLocatorCandidates(el, ['getByTestId', 'getByRole', 'getByLabel', 'getByText'])).toEqual([
      'css=[name="username"]',
    ]);
  });

  it('CONTROL: con identidad semántica el atributo NO aparece — sería ruido que el POM podría preferir', () => {
    const el = { role: 'textbox', label: 'Importe', css_attr: { attr: 'name', value: 'importe' } };
    const c = buildLocatorCandidates(el, ['getByTestId', 'getByRole', 'getByLabel', 'getByText']);
    expect(c).toEqual(["getByLabel('Importe')"]);
    expect(c.join(' ')).not.toContain('css=');
  });

  it('CONTROL: ni siquiera cuando el priority pone el texto el último — el CSS no es un peldaño más', () => {
    const el = { role: 'button', name: 'Log In', css_attr: { attr: 'name', value: 'login' } };
    expect(buildLocatorCandidates(el, ['getByText', 'getByRole']).join(' ')).not.toContain('css=');
  });

  it('sin css_attr no se inventa nada', () => {
    expect(buildLocatorCandidates({ role: 'textbox' }, ['getByRole'])).toEqual([]);
  });

  it('la forma del locator es la MISMA que emite el walker y que sanciona pre-review', () => {
    expect(cssAttrLocator({ attr: 'name', value: 'username' })).toBe('css=[name="username"]');
  });
});

describe('captura contra el DOM real — el caso medido en ParaBank', () => {
  it('EL PAR FALSABLE: el campo sin identidad deja de salir con cands vacíos', async () => {
    const map = await capturar(contractCon);
    const user = elementos(map).find((e) => e.css_attr?.value === 'username');
    expect(user, 'el campo name=username tendría que estar capturado').toBeDefined();
    expect(user?.role).toBe('textbox');
    expect(user?.locator_candidates).toEqual(['css=[name="username"]']);

    const pass = elementos(map).find((e) => e.css_attr?.value === 'password');
    expect(pass?.locator_candidates).toEqual(['css=[name="password"]']);
  }, 120_000);

  it('CONTROL 1: un atributo REPETIDO no se propone — resolvería a varios y el POM revienta en strict mode', async () => {
    const map = await capturar(contractCon);
    const radios = elementos(map).filter((e) => e.role === 'radio');
    expect(radios.length, 'los dos radios tienen que estar capturados').toBe(2);
    for (const r of radios) {
      expect(r.css_attr).toBeUndefined();
      expect(r.locator_candidates.join(' ')).not.toContain('periodicidad');
    }
  }, 120_000);

  it('CONTROL 2: el campo con label for se queda con su locator semántico, sin CSS', async () => {
    const map = await capturar(contractCon);
    const importe = elementos(map).find((e) => e.label === 'Importe' || e.name === 'Importe');
    expect(importe?.css_attr).toBeUndefined();
    expect(importe?.locator_candidates.join(' ')).not.toContain('css=');
  }, 120_000);

  it('CONTROL 3: un id generado por framework no es identidad — se descarta aunque sea único', async () => {
    const map = await capturar(contractCon);
    const generado = elementos(map).find((e) => e.css_attr?.value?.startsWith('ng-tns'));
    expect(generado, 'ningún elemento debería proponer un id generado').toBeUndefined();
  }, 120_000);

  it('CONTROL 4: sin la whitelist en el contract no se anota nada — la excepción es DECLARADA', async () => {
    const map = await capturar(contractSin);
    for (const e of elementos(map)) {
      expect(e.css_attr).toBeUndefined();
      expect(e.locator_candidates.join(' ')).not.toContain('css=');
    }
  }, 120_000);
});
