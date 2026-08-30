/**
 * D68/D69 — el triaje del rescate: enrutar por CLASE de motivo de bloqueo.
 *
 * Nacen del ciclo E2E en Restful Booker (2026-08-30): 13 micro-llamadas Haiku
 * (~538k tokens) y CERO desbloqueos — 10 declinaciones correctas sobre clases
 * que el rescate no puede resolver POR DISEÑO y 3 «ecos» del hint fallido. Cada
 * caso de esta tabla es una de esas llamadas perdidas, con su remedio.
 */
import { describe, it, expect } from 'vitest';

import {
  debeAislarFlujos,
  esEcoDelHint,
  puertaBloqueadaAntes,
  rescueInstructions,
  triajeDelBloqueo,
} from '../src/walk-core.ts';
import type { WalkAction } from '../src/walk-types.ts';

describe('triajeDelBloqueo — la tabla de enrutado', () => {
  it('ambigüedad real → panel: elegir entre iguales es del QA, no de la micro-llamada', () => {
    const v = triajeDelBloqueo({ ambiguo: true, fueraDeAmbito: false, puertaBloqueada: null });
    expect(v.destino).toBe('panel');
    expect(v.motivo).toContain('scope');
    expect(v.motivo).toContain('--assist');
  });

  it('ámbito fallido → panel: el guion ya intentó acotar y la pantalla no acompaña', () => {
    expect(triajeDelBloqueo({ ambiguo: false, fueraDeAmbito: true, puertaBloqueada: null }).destino).toBe('panel');
  });

  it('puerta bloqueada antes → cascada, y GANA a la ambigüedad (la pantalla actual no es la del paso)', () => {
    const v = triajeDelBloqueo({ ambiguo: true, fueraDeAmbito: false, puertaBloqueada: 's5' });
    expect(v.destino).toBe('cascada');
    expect(v.motivo).toContain('s5');
  });

  it('hint irresoluble limpio → rescate: la ÚNICA clase donde la micro-llamada compra algo', () => {
    expect(triajeDelBloqueo({ ambiguo: false, fueraDeAmbito: false, puertaBloqueada: null }).destino).toBe('rescate');
  });
});

describe('puertaBloqueadaAntes — qué condena y qué no', () => {
  const pasos = (
    [
      ['s1', 'expect_text'],
      ['s2', 'fill'],
      ['s3', 'select'],
      ['s4', 'click'],
      ['s5', 'fill'],
      ['s6', 'click'],
    ] as Array<[string, WalkAction]>
  ).map(([id, action]) => ({ id, action }));

  it('un click bloqueado condena los pasos POSTERIORES (cp001/s5 → s8..s14, el caso RBP)', () => {
    expect(puertaBloqueadaAntes(pasos, new Set(['s4']), 's5')).toBe('s4');
    expect(puertaBloqueadaAntes(pasos, new Set(['s4']), 's6')).toBe('s4');
  });

  it('un fill o select bloqueado NO condena: la pantalla sigue ahí y los pasos siguientes son preguntables (cp007/s6→s7)', () => {
    expect(puertaBloqueadaAntes(pasos, new Set(['s2', 's3']), 's4')).toBeNull();
  });

  it('una postcondición bloqueada (drift) no es puerta: el drift no cierra pantallas', () => {
    expect(puertaBloqueadaAntes(pasos, new Set(['s1']), 's2')).toBeNull();
  });

  it('los pasos ANTERIORES a la puerta no se condenan (el orden manda)', () => {
    expect(puertaBloqueadaAntes(pasos, new Set(['s6']), 's5')).toBeNull();
  });
});

describe('esEcoDelHint — la conducta medida 3 veces en RBP', () => {
  it('getByTestId con el mismo test_id del hint es eco', () => {
    expect(esEcoDelHint({ test_id: 'type' }, "getByTestId('type')")).toBe(true);
  });

  it('getByRole con el mismo role+name del hint es eco, con y sin exact', () => {
    const hint = { role: 'button', name: 'Reserve Now' };
    expect(esEcoDelHint(hint, "getByRole('button', { name: 'Reserve Now' })")).toBe(true);
    expect(esEcoDelHint(hint, "getByRole('button', { name: 'Reserve Now', exact: true })")).toBe(true);
  });

  it('una respuesta con INFORMACIÓN nueva no es eco: cadena con contenedor, otro peldaño, css', () => {
    const hint = { role: 'link', name: 'Book now' };
    expect(esEcoDelHint(hint, "getByRole('listitem').filter({ hasText: 'Single' }) >> getByRole('link', { name: 'Book now' })")).toBe(false);
    expect(esEcoDelHint({ test_id: 'type' }, "getByRole('combobox').nth(0)")).toBe(false);
    expect(esEcoDelHint(hint, 'css=#rooms .room-card a')).toBe(false);
  });

  it('sin hint no hay eco posible', () => {
    expect(esEcoDelHint(undefined, "getByText('x')")).toBe(false);
  });
});

describe('debeAislarFlujos — D69, la tabla', () => {
  it('sesión del CHECKPOINT (reanudación): el aislamiento SIGUE — el caso que envenenó cp007/cp009', () => {
    // el checkpoint entra por storageState pero NO es sesión del caller
    expect(debeAislarFlujos({ aislamientoDelContract: true, sesionDelCaller: false })).toBe(true);
  });

  it('sesión del CALLER (auth-handler): el aislamiento se desactiva — el reuso es a propósito', () => {
    expect(debeAislarFlujos({ aislamientoDelContract: true, sesionDelCaller: true })).toBe(false);
  });

  it('el contract manda: isolate_flows=false apaga el aislamiento aunque no haya sesión', () => {
    expect(debeAislarFlujos({ aislamientoDelContract: false, sesionDelCaller: false })).toBe(false);
  });
});

describe('rescueInstructions — D68, la gramática declarada alcanza a la ejecutable', () => {
  it('declara cadenas >> , .nth y .filter (locatorFromChain las acepta desde K0.11a)', () => {
    const i = rescueInstructions('s5', 'click');
    expect(i).toContain(">> ");
    expect(i).toContain('.nth(N)');
    expect(i).toContain('hasText');
  });

  it('con scope, la petición lo enseña y sugiere el contenedor con filter', () => {
    const i = rescueInstructions('s5', 'click', '', { text: 'Single' });
    expect(i).toContain('"text":"Single"');
    expect(i).toContain('filter');
  });

  it('prohíbe el eco explícitamente', () => {
    expect(rescueInstructions('s5', 'click')).toContain('NUNCA respondas el mismo locator que ya expresa el hint');
  });

  it('sin evidencia sigue avisando ANTES de todo, como siempre', () => {
    expect(rescueInstructions('s5', 'click', 'timeout').startsWith('AVISO')).toBe(true);
  });
});
