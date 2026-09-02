/**
 * D83 — la memoria durable que no lo era.
 *
 * Medido en el workspace del QA (EspoCRM, 2026-09-02): tres runs aprendieron
 * aliases en `.work/<su-dir>/aliases.json` y `config/hint-aliases/` ni existía.
 * Ninguno leyó la memoria del anterior, así que el run del rescate en proceso
 * volvió a preguntar por un paso cuyo alias ya estaba aprendido — en otro
 * fichero. Y el flag que lo causaba venía de las guías del orquestador, no del
 * producto: la pieza funcionaba y se desconectó desde fuera, run tras run.
 *
 * Estos tests fijan la forma del arreglo, que es la de D71: no se cambia el
 * default ni se prohíbe el flag —los tests y los runs de diagnóstico quieren un
 * fichero desechable— se AVISA con la consecuencia delante.
 */
import { describe, it, expect } from 'vitest';
import { notaMemoriaEfimera, locatorEsFragil } from '../src/walk-core.ts';

describe('notaMemoriaEfimera — avisa cuando la memoria morirá con el run', () => {
  it('el caso de campo: aliases dentro del propio work-dir', () => {
    const n = notaMemoriaEfimera({ aliasesPath: '/qa/crm/.work/f2/aliases.json', workDir: '/qa/crm/.work/f2' });
    expect(n).not.toBe('');
    expect(n).toMatch(/EFÍMERO/);
    // el aviso tiene que decir la CONSECUENCIA, no solo el hecho
    expect(n).toMatch(/volverá a preguntar/);
    // y la salida
    expect(n).toMatch(/config\/hint-aliases/);
  });

  it('también avisa si apunta a un .work AJENO: moriría igual', () => {
    const n = notaMemoriaEfimera({ aliasesPath: '/qa/crm/.work/otro/aliases.json', workDir: '/qa/crm/.work/f2' });
    expect(n).not.toBe('');
  });

  it('el destino durable por defecto NO avisa', () => {
    expect(notaMemoriaEfimera({ aliasesPath: '/qa/crm/config/hint-aliases/espocrm.json', workDir: '/qa/crm/.work/f2' })).toBe('');
  });

  it('cualquier ruta fuera de lo efímero tampoco avisa', () => {
    expect(notaMemoriaEfimera({ aliasesPath: '/memoria/compartida/espocrm.json', workDir: '/qa/crm/.work/f2' })).toBe('');
  });

  it('rutas de Windows: separadores y mayúsculas no lo engañan', () => {
    const n = notaMemoriaEfimera({
      aliasesPath: 'C:\\Users\\QA\\crm\\.Work\\F2\\aliases.json',
      workDir: 'C:/Users/QA/crm/.work/f2',
    });
    expect(n, 'la comparación debe normalizar separadores y caja').not.toBe('');
  });

  it('una ruta que solo CONTIENE la palabra work no cuenta', () => {
    // `workspace`, `network`, `homework`… solo el segmento exacto `.work` es la
    // convención de lo efímero. Un falso positivo aquí entrenaría al QA a
    // ignorar el aviso, que es peor que no tenerlo.
    expect(notaMemoriaEfimera({ aliasesPath: '/qa/workspace/aliases.json', workDir: '/tmp/x' })).toBe('');
    expect(notaMemoriaEfimera({ aliasesPath: '/qa/network/aliases.json', workDir: '/tmp/x' })).toBe('');
  });

  it('el work-dir vacío no convierte todo en efímero', () => {
    expect(notaMemoriaEfimera({ aliasesPath: '/qa/config/hint-aliases/x.json', workDir: '' })).toBe('');
  });
});

/**
 * D85 — el cerrojo de fragilidad solo miraba al panel. Detectado en el mismo
 * run de campo, con la asimetría en un solo audit-log: el posicional que el QA
 * señaló fue rechazado y el que contestó el orquestador fue promovido.
 */
describe('locatorEsFragil — la posición se detecta igual venga de quien venga', () => {
  it('caza los dos posicionales que el run de campo promovió por error', () => {
    expect(locatorEsFragil("getByRole('textbox', { name: 'Ciudad' }).nth(0)")).toBe(true);
    expect(locatorEsFragil("getByRole('group').nth(0) >> getByRole('button').nth(1)")).toBe(true);
  });

  it('no marca frágil lo que tiene identidad propia', () => {
    for (const l of [
      'css=#field-userName',
      "getByRole('link', { name: 'QA Inetum Prueba' })",
      'css=#main >> getByRole(\'searchbox\')',
      "getByTestId('username')",
    ]) {
      expect(locatorEsFragil(l), l).toBe(false);
    }
  });

  it('tolera espacios: la gramática los admite y el cerrojo no puede depender del formato', () => {
    expect(locatorEsFragil("getByRole('button').nth( 2 )")).toBe(true);
  });

  it('un texto que solo MENCIONA nth no es posicional', () => {
    // `.filter({ hasText: 'nth(0)' })` es texto de la página, no posición.
    expect(locatorEsFragil("getByText('nth(0)')")).toBe(false);
  });
});
