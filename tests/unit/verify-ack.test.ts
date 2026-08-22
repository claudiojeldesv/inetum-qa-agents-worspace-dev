/**
 * D28 — el acuse compacto de un subagente se comprueba, no se cree.
 *
 * El par falsable central es literal de campo: en el run del 2026-08-21 el Writer del
 * auth setup devolvió `{"ok":true,"files":["tests/e2e/parabank-fd/auth.setup.ts"]}`
 * sobre un fichero que no existía en ningún sitio. El orquestador se lo creyó y el
 * defecto salió tres actos más tarde. Aquí ese acuse tiene que salir `truthful: false`
 * y exit 2, sin más contexto que un stat.
 */
import { describe, it, expect } from 'vitest';
import { parseAck, verifyAck, baseName, type FileProbe } from '../../src/verify-ack.ts';

/** Sonda de disco falsa: el test decide qué existe y con qué tamaño. */
const sonda = (mapa: Record<string, number>): FileProbe => (file) => {
  const key = Object.keys(mapa).find((k) => baseName(k) === baseName(file));
  return key === undefined ? { exists: false, bytes: 0 } : { exists: true, bytes: mapa[key] };
};

describe('parseAck — tolerante con la FORMA, estricto con el contenido', () => {
  it('el acuse en la forma pedida (JSON puro)', () => {
    const a = parseAck('{"ok":true,"files":["a.spec.ts","b.page.ts"],"verdict":"approved"}');
    expect(a?.files).toEqual(['a.spec.ts', 'b.page.ts']);
    expect(a?.ok).toBe(true);
    expect(a?.verdict).toBe('approved');
  });

  it('EL PAR FALSABLE DE FORMA: JSON envuelto en prosa, que es lo que la palanca 2 produce a veces', () => {
    // medido en el mismo run: bajo redacción enfática el subagente devolvió JSON puro;
    // bajo redacción suave le añadió tres párrafos de hallazgos. Un parser estricto
    // rechazaría un acuse cuyo CONTENIDO es correcto — la clase de defecto de K0.43.
    const raw = [
      'He escrito el spec y he encontrado además una race en los selects de cuenta.',
      '```json',
      '{"ok":true,"files":["tests/e2e/tc-002.spec.ts"]}',
      '```',
      'Recomiendo revisar el timing del segundo select.',
    ].join('\n');
    expect(parseAck(raw)?.files).toEqual(['tests/e2e/tc-002.spec.ts']);
  });

  it('se salta un objeto JSON previo que no es el acuse', () => {
    const raw = 'Contexto: {"iteration":2} y el resultado: {"ok":true,"files":["x.ts"]}';
    expect(parseAck(raw)?.files).toEqual(['x.ts']);
  });

  it('sin array `files` no hay acuse verificable: null, no un acuse vacío que pase por bueno', () => {
    expect(parseAck('{"ok":true}')).toBeNull();
    expect(parseAck('He terminado el spec correctamente.')).toBeNull();
    expect(parseAck('')).toBeNull();
    expect(parseAck('{roto')).toBeNull();
  });

  it('descarta entradas vacías del array sin descartar el acuse entero', () => {
    expect(parseAck('{"files":["a.ts","","   "]}')?.files).toEqual(['a.ts']);
  });

  it('el BOM de PowerShell no lo rompe', () => {
    expect(parseAck('﻿{"files":["a.ts"]}')?.files).toEqual(['a.ts']);
  });
});

describe('verifyAck — mentir y no dejar rastro son verdictos distintos', () => {
  it('EL PAR FALSABLE (D28): declarado y ausente → el acuse miente y el run no sigue', () => {
    const v = verifyAck({ ok: true, files: ['tests/e2e/parabank-fd/auth.setup.ts'] }, sonda({}));
    expect(v.truthful).toBe(false);
    expect(v.exit).toBe(2);
    expect(v.liars).toEqual(['tests/e2e/parabank-fd/auth.setup.ts']);
    expect(v.files[0].problem).toMatch(/NO existe/);
  });

  it('un `ok:true` no compra nada: el veredicto sale del disco', () => {
    const mentira = verifyAck({ ok: true, files: ['x.ts'] }, sonda({}));
    const verdad = verifyAck({ ok: true, files: ['x.ts'] }, sonda({ 'x.ts': 400 }));
    expect(mentira.truthful).toBe(false);
    expect(verdad.truthful).toBe(true);
  });

  it('un fichero de 0 bytes existe y no sirve: cuenta como acuse falso', () => {
    const v = verifyAck({ files: ['vacio.spec.ts'] }, sonda({ 'vacio.spec.ts': 0 }));
    expect(v.truthful).toBe(false);
    expect(v.files[0].problem).toMatch(/vacío/);
  });

  it('existe pero sin entrada en el audit: laguna de trazabilidad (D30) que NO tumba el run', () => {
    const v = verifyAck({ files: ['a.spec.ts', 'b.spec.ts'] }, sonda({ 'a.spec.ts': 900, 'b.spec.ts': 900 }), [
      'tests/e2e/a.spec.ts',
    ]);
    expect(v.truthful).toBe(true);
    expect(v.exit).toBe(0);
    expect(v.untraced).toEqual(['b.spec.ts']);
  });

  it('el rastro se casa por nombre, no por ruta: el audit y el acuse no siempre la escriben igual', () => {
    // K0.43 aplicado: un consumidor más estricto que su productor produciría aquí un
    // falso «sin rastro» para todo, y eso enseña a ignorar el aviso.
    const v = verifyAck({ files: ['./tests/e2e/x.spec.ts'] }, sonda({ 'x.spec.ts': 100 }), [
      'tests\\e2e\\x.spec.ts',
    ]);
    expect(v.untraced).toEqual([]);
  });

  it('un fichero ausente NO se reporta además como sin-rastro: un solo problema por fichero', () => {
    const v = verifyAck({ files: ['fantasma.ts'] }, sonda({}), []);
    expect(v.liars).toHaveLength(1);
    expect(v.untraced).toEqual([]);
  });

  it('`ok:false` es un fallo DECLARADO, no una mentira', () => {
    const v = verifyAck({ ok: false, files: ['a.ts'] }, sonda({ 'a.ts': 10 }));
    expect(v.self_reported_failure).toBe(true);
    expect(v.truthful).toBe(true); // lo que declaró existe: no mintió, falló y lo dijo
  });

  it('varios ficheros: basta uno ausente para invalidar el acuse', () => {
    const v = verifyAck({ files: ['a.ts', 'b.ts', 'c.ts'] }, sonda({ 'a.ts': 10, 'c.ts': 10 }));
    expect(v.truthful).toBe(false);
    expect(v.liars).toEqual(['b.ts']);
    expect(v.claimed).toBe(3);
  });
});

describe('verifyAck — la ruta comprobada se conserva', () => {
  it('el veredicto dice QUE fichero mire de verdad, no solo el que le declararon', () => {
    // smoke test de esta herramienta: ejecutada desde el repo equivocado verifico un
    // fichero DISTINTO con la misma ruta relativa (1514 vs 1497 bytes) y anuncio
    // «acuse verificado». Sin la ruta resuelta, ese falso verde es invisible.
    const v = verifyAck({ files: ['tests/e2e/auth.setup.ts'] }, () => ({
      exists: true,
      bytes: 1514,
      resolved: '/repo-equivocado/tests/e2e/auth.setup.ts',
    }));
    expect(v.files[0].resolved).toBe('/repo-equivocado/tests/e2e/auth.setup.ts');
  });

  it('una sonda que no informa de la ruta no rompe el veredicto', () => {
    const v = verifyAck({ files: ['a.ts'] }, () => ({ exists: true, bytes: 5 }));
    expect(v.truthful).toBe(true);
    expect(v.files[0].resolved).toBeUndefined();
  });
});

describe('baseName — separador de plataforma', () => {
  it('normaliza Windows y POSIX', () => {
    expect(baseName('tests\\e2e\\a.spec.ts')).toBe('a.spec.ts');
    expect(baseName('tests/e2e/a.spec.ts')).toBe('a.spec.ts');
    expect(baseName('a.spec.ts')).toBe('a.spec.ts');
  });
});
