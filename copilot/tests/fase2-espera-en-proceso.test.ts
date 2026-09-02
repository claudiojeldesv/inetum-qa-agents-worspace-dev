/**
 * Fase 2 del plan del rescate — la decisión de esperar, aislada.
 *
 * Es la puerta de todo el diseño y tiene que ser fail-closed hacia NO ESPERAR.
 * El razonamiento, con los dos costes en la mano: el replay cuesta pasos
 * (medido: 62 re-ejecutados en Restful Booker, 56% de un run) y colgarse cuesta
 * EL RUN ENTERO. Así que ante cualquier duda —canal ausente, ilegible, sin
 * responsable o sin plazo— se sale por `exit 42`, que es el camino que ya
 * funciona.
 */
import { describe, it, expect } from 'vitest';
import { decidirEspera } from '../src/walk-core.ts';

const MAX = 120_000;

describe('decidirEspera — sin canal declarado NO se espera', () => {
  it('canal ausente: se sale con exit 42 y se dice por qué', () => {
    const d = decidirEspera({ canal: null, maxTimeoutMs: MAX });
    expect(d.espera).toBe(false);
    if (!d.espera) expect(d.motivo).toMatch(/exit 42/);
  });

  it('un run de CI (canal undefined) jamás se cuelga esperando a nadie', () => {
    expect(decidirEspera({ canal: undefined, maxTimeoutMs: MAX }).espera).toBe(false);
  });

  it('canal que no dice QUIÉN escucha: sin responsable no se espera', () => {
    const d = decidirEspera({ canal: { timeout_ms: 5000 }, maxTimeoutMs: MAX });
    expect(d.espera).toBe(false);
    if (!d.espera) expect(d.motivo).toMatch(/QUIÉN/);
  });

  it('canal sin plazo válido: no se espera a ciegas', () => {
    for (const t of [undefined, 0, -1, Number.NaN, 'mucho']) {
      const d = decidirEspera({ canal: { listener: 'orquestador', timeout_ms: t }, maxTimeoutMs: MAX });
      expect(d.espera, `timeout_ms=${String(t)}`).toBe(false);
    }
  });

  it('basura en el fichero del canal no se interpreta como permiso', () => {
    for (const c of ['sí', 42, [], true]) {
      expect(decidirEspera({ canal: c, maxTimeoutMs: MAX }).espera, JSON.stringify(c)).toBe(false);
    }
  });
});

describe('decidirEspera — con canal declarado', () => {
  it('espera, y con el plazo y el responsable que el canal declara', () => {
    const d = decidirEspera({ canal: { listener: 'orquestador', timeout_ms: 30_000 }, maxTimeoutMs: MAX });
    expect(d).toEqual({ espera: true, timeoutMs: 30_000, listener: 'orquestador' });
  });

  it('el techo del proyecto manda: un canal no puede pedir más', () => {
    // Sin esto, un canal mal escrito (timeout_ms: 86400000) colgaría el run un
    // día entero — el fallo que la autodetección existe para evitar, por la
    // puerta de atrás.
    const d = decidirEspera({ canal: { listener: 'x', timeout_ms: 86_400_000 }, maxTimeoutMs: MAX });
    if (d.espera) expect(d.timeoutMs).toBe(MAX);
    else throw new Error('debía esperar');
  });

  it('el nombre del responsable se normaliza, pero uno vacío no cuela', () => {
    const ok = decidirEspera({ canal: { listener: '  orq  ', timeout_ms: 1000 }, maxTimeoutMs: MAX });
    if (ok.espera) expect(ok.listener).toBe('orq');
    expect(decidirEspera({ canal: { listener: '   ', timeout_ms: 1000 }, maxTimeoutMs: MAX }).espera).toBe(false);
  });
});
