/**
 * P6 — la etiqueta de oráculo, con sus dientes probados.
 *
 * La etiqueta sin lector sería otra D2. Por eso el par que importa aquí es el
 * de IDA Y VUELTA: lo que `etiquetarFlujo` escribe en el JSDoc, `leerOraculosDeSpec`
 * lo lee con los mismos números — si el formato deriva por cualquiera de los dos
 * lados, este test se pone rojo antes de que el resumen mienta.
 */
import { describe, it, expect } from 'vitest';

import { etiquetarFlujo, leerOraculosDeSpec, origenDelOraculo } from '../../src/oracle-origin.ts';
import type { DecisionEntry } from '../../src/decisions.ts';

const app = (paso: string, valor?: string): DecisionEntry =>
  ({
    rf: 'CP005', paso, decision: 'app', ...(valor !== undefined ? { valor_nuevo: valor } : {}),
    fd_hash: 'x', script_hash: 'y', evidencia: 'en-vivo', actor: 'claudio.jeldes',
    timestamp: '2026-08-29T18:53:06.282Z', hash: '20fe39fa3cbab1a8c43d5d941656c453',
  }) as DecisionEntry;

describe('origenDelOraculo — la regla, en su orden', () => {
  it('un id re-clavado (#vN) es CAPTURA aunque además haya firma: la firma autoriza, la procedencia es la grabación', () => {
    const e = origenDelOraculo('f', { id: 's11#v1', action: 'expect_text' }, [app('f/s11#v1', 'X')]);
    expect(e.origen).toBe('captura');
  });

  it('una decisión app vigente sobre el paso → app, con la firma al lado', () => {
    const e = origenDelOraculo('f', { id: 's8', action: 'expect_text' }, [app('f/s8', '(110) Records Found')]);
    expect(e.origen).toBe('app');
    expect(e.decision?.hash).toBe('20fe39fa3cbab1a8c43d5d941656c453');
  });

  it('fd y defer NO convierten el oráculo en app; sin nada, el oráculo es del FD', () => {
    const fd = { ...app('f/s8'), decision: 'fd' } as DecisionEntry;
    const defer = { ...app('f/s8'), decision: 'defer' } as DecisionEntry;
    expect(origenDelOraculo('f', { id: 's8', action: 'expect_text' }, [fd, defer]).origen).toBe('fd');
    expect(origenDelOraculo('f', { id: 's8', action: 'expect_text' }, []).origen).toBe('fd');
  });

  it('la decisión de OTRO flujo no etiqueta este paso', () => {
    expect(origenDelOraculo('f', { id: 's8', action: 'expect_text' }, [app('otro/s8', 'X')]).origen).toBe('fd');
  });
});

describe('etiquetarFlujo — solo lo que observa lleva oráculo', () => {
  const pasos = [
    { id: 's6', action: 'expect_text', value: 'Datos del empleado' },
    { id: 's7', action: 'click' },
    { id: 's8', action: 'expect_text', value: 'Registros encontrados' },
    { id: 's8#v1', action: 'expect_text', value: 'Capturado' },
  ];

  it('el clic no afirma nada: no lleva etiqueta; los conteos cuadran', () => {
    const r = etiquetarFlujo('f', pasos, [app('f/s8', '(110) Records Found')]);
    expect(r.etiquetas.map((e) => e.paso)).toEqual(['s6', 's8', 's8#v1']);
    expect(r.conteo).toEqual({ fd: 1, app: 1, captura: 1 });
  });

  it('las líneas del JSDoc llevan la firma en la de app y el resumen al final', () => {
    const r = etiquetarFlujo('f', pasos, [app('f/s8', '(110) Records Found')]);
    expect(r.lineas_jsdoc[0]).toBe('@oraculo s6 fd');
    expect(r.lineas_jsdoc[1]).toMatch(/@oraculo s8 app — «\(110\) Records Found» firmado por claudio\.jeldes \(en-vivo\) \[20fe39fa\]/);
    expect(r.lineas_jsdoc[2]).toMatch(/@oraculo s8#v1 captura — nacido de una demostración/);
    expect(r.lineas_jsdoc[3]).toBe('@oraculo-resumen fd=1 app=1 captura=1');
  });

  it('un flujo sin pasos que observen no emite ni resumen: etiqueta vacía, no etiqueta mentirosa', () => {
    const r = etiquetarFlujo('f', [{ id: 's1', action: 'click' }], []);
    expect(r.lineas_jsdoc).toEqual([]);
  });
});

describe('leerOraculosDeSpec — el lector que evita la D2', () => {
  it('EL PAR DE IDA Y VUELTA: lo que el emisor escribe, el lector lo cuenta igual', () => {
    const pasos = [
      { id: 's6', action: 'expect_text' },
      { id: 's8', action: 'expect_text' },
      { id: 's9#v1', action: 'expect_text' },
    ];
    const escrito = etiquetarFlujo('f', pasos, [app('f/s8', 'X')]);
    const spec = ['/**', ' * @criterion CP005', ...escrito.lineas_jsdoc.map((l) => ` * ${l}`), ' */', 'test(...)'].join('\n');
    const leido = leerOraculosDeSpec(spec);
    expect(leido).toEqual({ ...escrito.conteo, etiquetado: true });
  });

  it('el resumen manda; sin resumen se cuentan las sueltas; sin nada, sin-etiqueta', () => {
    expect(leerOraculosDeSpec('* @oraculo-resumen fd=3 app=1 captura=0\n* @oraculo s1 app')).toEqual({
      fd: 3, app: 1, captura: 0, etiquetado: true,
    });
    expect(leerOraculosDeSpec('* @oraculo s1 app — «X» firmado\n* @oraculo s2 fd')).toEqual({
      fd: 1, app: 1, captura: 0, etiquetado: true,
    });
    expect(leerOraculosDeSpec('/** @criterion CP001 */')).toEqual({ fd: 0, app: 0, captura: 0, etiquetado: false });
  });
});
