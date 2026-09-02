/**
 * `qa:criterios` — el FD markdown a `criteria.json`, sin LLM.
 *
 * Lo que estos tests protegen es el principio rector del refiner extendido a un
 * parser: **no fabricar**. Un conversor que rellena huecos a ojo produce un
 * `criteria.json` que parece completo y no lo es, y en banca un criterio
 * fabricado es peor que ninguno — da falsa confianza.
 */
import { describe, it, expect } from 'vitest';

import { fdACriteria, parseFdOnesait } from '../../src/fd-to-criteria.ts';

const FD = [
  '# Diseño Funcional — algo',            // 1
  '',                                     // 2
  'Preámbulo que no es un caso.',         // 3
  '',                                     // 4
  '---',                                  // 5
  '',                                     // 6
  '## CP001 — Alta de póliza',            // 7
  '',                                     // 8
  '**Objetivo**: verificar que se puede',  // 9
  'dar de alta una póliza.',              // 10
  '',                                     // 11
  '**Precondiciones**: sesión iniciada.', // 12
  '',                                     // 13
  '### Pasos',                            // 14
  '',                                     // 15
  '1. Acceder al portal.',                // 16
  '2. Pulsar **Guardar**.',               // 17
  '',                                     // 18
  '### Resultado esperado',               // 19
  '',                                     // 20
  'La póliza queda dada de alta y se',    // 21
  'muestra su número.',                   // 22
  '',                                     // 23
  '---',                                  // 24
  '',                                     // 25
  '## CP002 — Caso al que le falta media hoja', // 26
  '',                                     // 27
  '### Pasos',                            // 28
  '',                                     // 29
  '1. Hacer algo.',                       // 30
  '',                                     // 31
  '---',                                  // 32
  '',                                     // 33
  '## Nota para quien ejecute',           // 34
  '',                                     // 35
  'Esto no es un caso y no debe salir.',  // 36
].join('\n');

describe('parseFdOnesait — extrae lo que hay, y solo lo que hay', () => {
  it('saca los casos y NO confunde las notas con casos', () => {
    const cs = parseFdOnesait(FD);
    expect(cs.map((c) => c.id)).toEqual(['CP001', 'CP002']);
  });

  it('la línea del caso es la de verdad: es toda la trazabilidad que hay', () => {
    // Si `source_ref` apunta a la línea equivocada, la trazabilidad obligatoria
    // del estándar deja de servir para lo único que sirve: ir a mirarlo.
    const [uno] = parseFdOnesait(FD);
    expect(uno.linea).toBe(7);
    expect(uno.lineaFin, 'la última línea CON CONTENIDO, no el separador').toBe(22);
  });

  it('junta los párrafos partidos: el FD envuelve a 100 columnas', () => {
    const [uno] = parseFdOnesait(FD);
    expect(uno.objetivo).toBe('verificar que se puede dar de alta una póliza.');
    expect(uno.esperado).toBe('La póliza queda dada de alta y se muestra su número.');
  });

  it('el separador `---` no es contenido del caso', () => {
    // Se colaba como «… su número. ---» en la primera versión.
    for (const c of parseFdOnesait(FD)) {
      expect(c.esperado).not.toContain('---');
      expect(c.objetivo).not.toContain('---');
    }
  });

  it('los pasos salen en orden y sin la numeración', () => {
    const [uno] = parseFdOnesait(FD);
    expect(uno.pasos).toEqual(['Acceder al portal.', 'Pulsar **Guardar**.']);
  });

  it('lo que falta se DICE, no se rellena', () => {
    const [, dos] = parseFdOnesait(FD);
    expect(dos.faltan).toEqual(['Objetivo', 'Precondiciones', 'Resultado esperado']);
  });
});

describe('fdACriteria — el documento del estándar S3', () => {
  it('cita el FD en given/when/then y no inventa nada', () => {
    const d = fdACriteria(parseFdOnesait(FD), { sourceFd: 'x.md', targetUrl: 'https://x/', ahora: 'T' });
    const uno = d.criteria[0];
    expect(uno.id).toBe('CP001');
    expect(uno.title).toBe('Alta de póliza');
    expect(uno.given).toBe('sesión iniciada.');
    expect(uno.source_ref).toBe('x.md:7-22');
    expect(uno.confidence).toBe('high');
  });

  it('un caso incompleto baja la confianza y lleva su [ASSUMPTION]', () => {
    const d = fdACriteria(parseFdOnesait(FD), { sourceFd: 'x.md', targetUrl: 'https://x/', ahora: 'T' });
    const dos = d.criteria[1];
    expect(dos.confidence).toBe('low');
    expect(dos.assumptions[0]).toContain('[ASSUMPTION]');
    expect(dos.assumptions[0]).toContain('no trae Objetivo');
    // y los campos ausentes quedan VACÍOS, no rellenados con algo plausible
    expect(dos.given).toBe('');
    expect(dos.then).toBe('');
  });

  it('los dos límites del conversor van escritos en el fichero', () => {
    // `drift_risk` y `open_questions` exigen criterio y esto no lo tiene. Que
    // salgan con valor por defecto es aceptable; que nadie lo sepa, no.
    const d = fdACriteria(parseFdOnesait(FD), { sourceFd: 'x.md', targetUrl: 'https://x/', ahora: 'T' });
    expect(d.refiner_notes).toContain('drift_risk');
    expect(d.refiner_notes).toContain('open_questions');
    expect(d.refiner_notes).toContain('SIN LLM');
  });

  it('admite prefijos que no son CP: el FD del cliente no tiene por qué usarlo', () => {
    const cs = parseFdOnesait('## EP07 — Ensayo\n\n### Pasos\n\n1. Algo.\n');
    expect(cs.map((c) => c.id)).toEqual(['EP07']);
  });

  it('es determinista: dos conversiones del mismo FD son idénticas', () => {
    const a = fdACriteria(parseFdOnesait(FD), { sourceFd: 'x.md', targetUrl: 'u', ahora: 'T' });
    const b = fdACriteria(parseFdOnesait(FD), { sourceFd: 'x.md', targetUrl: 'u', ahora: 'T' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
