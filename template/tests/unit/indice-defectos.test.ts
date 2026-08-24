import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

/**
 * Guarda mecánica del índice de defectos (docs/references/indice-defectos.md).
 *
 * Un índice mantenido a mano y sin validador es exactamente la familia D2: algo
 * declarado que nadie consume ni comprueba, y que diverge en silencio — como le
 * pasó a docs/STATUS.md, congelado en "Caos Fase 4" mientras la bitácora seguía
 * creciendo en otro fichero. Este test es el consumidor.
 *
 * Qué garantiza:
 *  1. El índice cubre D1..Dmax de forma contigua, una fila por defecto, con un
 *     estado reconocible.
 *  2. Ningún D-número MAYOR que el máximo del índice circula por el repo (docs,
 *     src, copilot/src, hooks): un defecto nuevo sin fila rompe la suite.
 *
 * Qué NO intenta: re-verificar D1..D52 uno a uno contra el repo. Eso sería un
 * campo de minas de falsos positivos, porque conviven DOS vocabularios ajenos:
 * el `D1..D4` LOCAL por ciclo de SPEC-caos-corporativo (`K0.33/D2`) y el
 * `D3/D4` = "Diseño 3/4" de los docs de Copilot. Ninguno pasa de D4, así que
 * el barrido de números nuevos (> max del índice) no colisiona con ellos.
 */

const RAIZ = join(import.meta.dirname, '..', '..');
const INDICE = join(RAIZ, 'docs', 'references', 'indice-defectos.md');

const ESTADOS_VALIDOS = /^(cerrado|abierto|criterio)/;

function filasDelIndice(): Map<number, string> {
  const src = readFileSync(INDICE, 'utf8');
  const filas = new Map<number, string>();
  // Una fila de la tabla: | D7 | ... | ... | ... | estado |
  for (const m of src.matchAll(/^\| D(\d{1,3}) \|(?:[^|]*\|){3}([^|]*)\|\s*$/gm)) {
    filas.set(Number(m[1]), m[2].trim());
  }
  return filas;
}

function ficherosBajo(dir: string, out: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.work' || nombre === 'artifacts') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) ficherosBajo(ruta, out);
    else if (/\.(md|ts|mjs|yaml|yml)$/.test(nombre)) out.push(ruta);
  }
  return out;
}

describe('indice-defectos — forma del índice', () => {
  it('cubre D1..Dmax de forma contigua, sin huecos ni duplicados', () => {
    const filas = filasDelIndice();
    expect(filas.size).toBeGreaterThanOrEqual(52);
    const max = Math.max(...filas.keys());
    const huecos = [];
    for (let n = 1; n <= max; n++) if (!filas.has(n)) huecos.push(`D${n}`);
    expect(huecos, `faltan filas en el índice: ${huecos.join(', ')}`).toEqual([]);
  });

  it('cada fila declara un estado reconocible (cerrado | abierto | criterio)', () => {
    const invalidas = [...filasDelIndice()]
      .filter(([, estado]) => !ESTADOS_VALIDOS.test(estado))
      .map(([n, estado]) => `D${n}: "${estado}"`);
    expect(invalidas, `estados no reconocibles: ${invalidas.join('; ')}`).toEqual([]);
  });
});

describe('indice-defectos — cobertura contra el repo', () => {
  it('ningún D-número nuevo circula por el repo sin fila en el índice', () => {
    const max = Math.max(...filasDelIndice().keys());
    const dirs = ['docs', 'src', 'copilot/src', 'hooks'].map((d) => join(RAIZ, d));
    const sinIndexar = new Map<number, string>();
    for (const dir of dirs) {
      for (const fichero of ficherosBajo(dir)) {
        const texto = readFileSync(fichero, 'utf8');
        for (const m of texto.matchAll(/\bD(\d{1,3})\b/g)) {
          const n = Number(m[1]);
          // El D-local de los ciclos (K0.33/D2) nunca pasa de D4 y no llega aquí:
          // solo interesan números por ENCIMA del máximo indexado.
          if (n > max && !sinIndexar.has(n)) sinIndexar.set(n, fichero.slice(RAIZ.length + 1));
        }
      }
    }
    const faltan = [...sinIndexar].map(([n, f]) => `D${n} (visto en ${f})`);
    expect(
      faltan,
      `D-números sin fila en docs/references/indice-defectos.md: ${faltan.join('; ')}`,
    ).toEqual([]);
  });
});
