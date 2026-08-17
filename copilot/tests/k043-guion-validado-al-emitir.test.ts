/**
 * K0.43 — el guion se valida AL EMITIRLO, y el error manda a la acción correcta.
 *
 * El caso base no está inventado: es el walk-script que `ia4d-spec-refiner` emitió
 * de verdad en el primer run de campo del plugin (ParaBank, S3, 2026-08-17), con
 * los cuatro campos mal que produjeron 26 errores de esquema y una ronda de
 * corrección manual. Ver docs/findings/run-beta-parabank.md (D1).
 *
 * El par falsable de todo el fichero: MISMO guion, corregidos solo los nombres de
 * campo, tiene que pasar. Si el guion "arreglado" también fallara, el validador
 * estaría rechazando por otra cosa y estos tests no probarían nada.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateWalkScript } from '../src/walk-core.ts';
import {
  checkWalkScriptFile,
  formatReport,
  CANONICAL_SKELETON,
} from '../src/check-walk-script.ts';

/** Lo que emitió el refiner en campo, verbatim en su forma (no en su tamaño). */
const GUION_DE_CAMPO = {
  version: 1,
  source_fd: 'examples/02-parabank/parabank-fd.md',
  criteria_ref: 'criteria.json',
  target_url: 'https://parabank.parasoft.com/',
  flows: [
    {
      id: 'login',
      criterion_refs: ['RF-001'],
      steps: [
        { action: 'goto', hint: { url: '/parabank/index.htm' } },
        { action: 'fill', hint: { label: 'nombre de usuario' }, value: 'john' },
        { action: 'click', hint: { role: 'button', name: 'iniciar sesión' } },
        { action: 'expect_text', hint: { text: 'resumen de cuentas' } },
      ],
    },
  ],
};

/** El MISMO guion con los nombres de campo correctos. Nada más cambia. */
const GUION_CORREGIDO = {
  version: 1,
  site_id: 'parabank-fd',
  entry: '/parabank/index.htm',
  flows: [
    {
      flow: 'login',
      criteria: ['RF-001'],
      steps: [
        { id: 's1', action: 'goto', target: '/parabank/index.htm' },
        { id: 's2', action: 'fill', hint: { label: 'Username' }, value: 'john' },
        {
          id: 's3',
          action: 'click',
          hint: { role: 'button', name: 'Log In' },
          expect_transition: true,
        },
        { id: 's4', action: 'expect_text', value: 'Accounts Overview' },
      ],
    },
  ],
};

function escribirTemp(obj: unknown, nombre = 'walk-script.json'): string {
  const dir = mkdtempSync(join(tmpdir(), 'k043-'));
  const path = join(dir, nombre);
  writeFileSync(path, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2), 'utf8');
  return path;
}

describe('K0.43 — par falsable: el guion de campo se rechaza, el corregido pasa', () => {
  it('rechaza el guion que el refiner emitió de verdad', () => {
    const { ok, errors } = validateWalkScript(GUION_DE_CAMPO);
    expect(ok).toBe(false);
    // los tres campos de raíz que faltaban
    expect(errors.join('\n')).toMatch(/site_id requerido/);
    expect(errors.join('\n')).toMatch(/entry requerido/);
  });

  it('acepta el mismo guion con los nombres de campo correctos', () => {
    const { ok, errors } = validateWalkScript(GUION_CORREGIDO);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });
});

describe('K0.43 — el mensaje manda a la acción correcta, no a la contraria', () => {
  it("un flujo con 'id' en vez de 'flow' NO dice «flow sin id»", () => {
    const { errors } = validateWalkScript({
      version: 1,
      site_id: 's',
      entry: '/',
      flows: [{ id: 'login', steps: [{ id: 's1', action: 'capture' }] }],
    });
    const msg = errors.find((e) => e.includes('flow'));
    expect(msg).toBeDefined();
    // dice que el campo se llama 'flow' y cita el id que sí trae
    expect(msg).toMatch(/'flow', no 'id'/);
    expect(msg).toMatch(/login/);
    // y NO el mensaje viejo, que mandaba a buscar un id que estaba puesto
    expect(msg).not.toBe('flow sin id');
  });

  it("nombra 'criteria' cuando el guion trae 'criterion_refs'", () => {
    const { errors } = validateWalkScript({
      version: 1,
      site_id: 's',
      entry: '/',
      flows: [
        { flow: 'login', criterion_refs: ['RF-001'], steps: [{ id: 's1', action: 'capture' }] },
      ],
    });
    expect(errors.join('\n')).toMatch(/'criteria', no en 'criterion_refs'/);
  });

  it("dice que la ruta va en 'target' cuando el goto la puso en hint.url", () => {
    const { errors } = validateWalkScript({
      version: 1,
      site_id: 's',
      entry: '/',
      flows: [{ flow: 'f', steps: [{ id: 's1', action: 'goto', hint: { url: '/x' } }] }],
    });
    expect(errors.join('\n')).toMatch(/la ruta va en target, no en hint\.url/);
  });

  it('un goto sin target ni hint.url conserva el mensaje escueto (no se inventa causa)', () => {
    const { errors } = validateWalkScript({
      version: 1,
      site_id: 's',
      entry: '/',
      flows: [{ flow: 'f', steps: [{ id: 's1', action: 'goto' }] }],
    });
    expect(errors.join('\n')).toMatch(/'goto' requiere target$/m);
    expect(errors.join('\n')).not.toMatch(/hint\.url/);
  });

  it("los errores de paso se ubican por el alias 'id' cuando falta 'flow'", () => {
    const { errors } = validateWalkScript({
      version: 1,
      site_id: 's',
      entry: '/',
      flows: [{ id: 'checkout', steps: [{ id: 's7', action: 'fill' }] }],
    });
    // sin el fallback, esto diría 'undefined/s7' y no se podría localizar el paso
    expect(errors.join('\n')).toMatch(/checkout\/s7/);
    expect(errors.join('\n')).not.toMatch(/undefined\//);
  });
});

describe('K0.43 — el CLI separa "ilegible" de "inválido"', () => {
  it('un fichero que no existe es ioError, no una lista de errores de esquema', () => {
    const res = checkWalkScriptFile(join(tmpdir(), 'k043-no-existe-jamas.json'));
    expect(res.ok).toBe(false);
    expect(res.ioError).toMatch(/no existe/);
    expect(res.errors).toEqual([]);
  });

  it('un JSON roto es ioError, no un guion mal formado', () => {
    const path = escribirTemp('{ esto no es json');
    const res = checkWalkScriptFile(path);
    expect(res.ioError).toMatch(/JSON inválido/);
    expect(res.errors).toEqual([]);
  });

  it('el guion de campo escrito en disco sale inválido con errores, sin ioError', () => {
    const res = checkWalkScriptFile(escribirTemp(GUION_DE_CAMPO));
    expect(res.ok).toBe(false);
    expect(res.ioError).toBeUndefined();
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('el guion corregido escrito en disco sale válido', () => {
    const res = checkWalkScriptFile(escribirTemp(GUION_CORREGIDO));
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  /**
   * El validador NO puede ser más estricto que su consumidor: bloquear un guion que
   * el walker ejecuta sin pestañear sería la enfermedad de D1 al revés. El walker usa
   * `parseJsonLoose` a propósito (el walk-script se afina A MANO, K0.20, y pasa por
   * editores y por PowerShell, que escriben BOM). Lo cazó el propio harness de estos
   * tests al escribir el fixture con `Out-File -Encoding utf8`.
   */
  it('un BOM no cambia el veredicto — igual que para el walker', () => {
    const conBom = escribirTemp('﻿' + JSON.stringify(GUION_CORREGIDO));
    const sinBom = escribirTemp(GUION_CORREGIDO);
    expect(checkWalkScriptFile(conBom)).toEqual(checkWalkScriptFile(sinBom));
    expect(checkWalkScriptFile(conBom).ok).toBe(true);
  });

  it('un BOM tampoco enmascara un guion inválido', () => {
    const res = checkWalkScriptFile(escribirTemp('﻿' + JSON.stringify(GUION_DE_CAMPO)));
    expect(res.ok).toBe(false);
    expect(res.ioError).toBeUndefined();
    expect(res.errors.join('\n')).toMatch(/site_id requerido/);
  });
});

describe('K0.43 — el informe de fallo ES el material del reintento', () => {
  const res = checkWalkScriptFile(escribirTemp(GUION_DE_CAMPO));
  const informe = formatReport('walk-script.json', res);

  it('lleva el esqueleto canónico, que es lo que había que extraer a mano', () => {
    // el informe indenta cada línea; se compara por contenido, no por sangría
    for (const linea of CANONICAL_SKELETON.split('\n')) {
      expect(informe).toContain(linea.trim());
    }
  });

  it('el esqueleto nombra los cuatro campos que el refiner erró', () => {
    expect(CANONICAL_SKELETON).toMatch(/"flow":/);
    expect(CANONICAL_SKELETON).toMatch(/"criteria":/);
    expect(CANONICAL_SKELETON).toMatch(/"target":/);
    expect(CANONICAL_SKELETON).toMatch(/"id": "s1"/);
  });

  it('el esqueleto que se predica VALIDA — si no, el reintento manda a otro error', () => {
    const sinComentarios = CANONICAL_SKELETON.replace(/\s*\/\/.*$/gm, '');
    const { ok, errors } = validateWalkScript(JSON.parse(sinComentarios));
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it('numera los errores y no los esconde', () => {
    expect(informe).toMatch(/INVÁLIDO/);
    expect(informe).toMatch(/\d+ error\(es\) de esquema/);
    expect(informe).toMatch(/^\s+1\. /m);
  });

  it('el informe de un guion válido no arrastra el esqueleto', () => {
    const okRes = checkWalkScriptFile(escribirTemp(GUION_CORREGIDO));
    const okInforme = formatReport('walk-script.json', okRes);
    expect(okInforme).toMatch(/VÁLIDO/);
    expect(okInforme).not.toMatch(/Esquema real/);
    expect(okInforme).not.toMatch(/Reglas que más se incumplen/);
  });
});
