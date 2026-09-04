/**
 * La puerta de entrada tiene que saber QUÉ HAY antes de preguntar nada.
 *
 * Los tres casos de aquí son los tres falsos positivos que aparecieron
 * ejecutándolo contra un workspace real, y cada uno habría hecho que la puerta
 * dijese una mentira con cara de dato:
 *
 *  1. **«¿existe algún contract?» siempre es SÍ**: un workspace recién desplegado
 *     trae siete de ejemplo. La pregunta útil es «¿hay uno TUYO?», y se contesta
 *     por la marca que el setup deja al emitirlo.
 *  2. **el material de los labs no es tuyo**: sin separar, la sugerencia salía
 *     «usa `saucedemo-fd.md`» — el primero por orden alfabético, de un lab.
 *  3. **el código del producto no es un documento funcional**: `fd-proposal.ts` y
 *     `fd-criteria-schema.md` se colaban como «tus FD» y la puerta anunciaba seis
 *     documentos señalando su propio árbol.
 *
 * Y una regla de conducta que también se prueba: **con varios candidatos no se
 * elige uno**. Elegir el primero es adivinar con cara de saber.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  MARCA_SETUP,
  buscarMaterial,
  estadoDelProyecto,
  leerContracts,
  projectDelContract,
  sugerirDesdeMaterial,
} from '../../src/scripts/estado-del-proyecto.ts';

let raiz: string;

/** Un workspace de mentira con la forma del de verdad. */
function crear(rutas: Record<string, string>): void {
  for (const [rel, contenido] of Object.entries(rutas)) {
    const abs = join(raiz, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, contenido, 'utf8');
  }
}

beforeEach(() => {
  raiz = mkdtempSync(resolve(tmpdir(), 'estado-'));
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

describe('contracts — el tuyo frente a los de ejemplo', () => {
  it('los siete de ejemplo NO cuentan como tuyos', () => {
    crear({
      'config/style-contracts/saucedemo.yaml': 'project: saucedemo\n',
      'config/style-contracts/parabank.yaml': 'project: parabank\n',
      'config/style-contracts/mifos.yaml': 'project: mifos\n',
    });
    const c = leerContracts(join(raiz, 'config', 'style-contracts'));
    expect(c.propios).toEqual([]);
    expect(c.de_ejemplo).toHaveLength(3);
  });

  it('uno con la marca del setup SÍ es tuyo, y se lee su project', () => {
    crear({
      'config/style-contracts/saucedemo.yaml': 'project: saucedemo\n',
      'config/style-contracts/banco.yaml': `# ${MARCA_SETUP} el 2026-09-04\nproject: banco-retail\n`,
    });
    const c = leerContracts(join(raiz, 'config', 'style-contracts'));
    expect(c.propios).toHaveLength(1);
    expect(c.propios[0]).toMatchObject({ fichero: 'banco.yaml', project: 'banco-retail', propio: true });
    expect(c.de_ejemplo).toHaveLength(1);
  });

  it('un directorio sin contracts no revienta: devuelve vacío', () => {
    expect(leerContracts(join(raiz, 'no', 'existe'))).toEqual({ propios: [], de_ejemplo: [] });
  });

  it('projectDelContract lee el campo y le quita las comillas', () => {
    expect(projectDelContract('project: banco\n')).toBe('banco');
    expect(projectDelContract("project: 'banco retail'\n")).toBe('banco retail');
    expect(projectDelContract('# sin project\nlocators:\n')).toBeUndefined();
  });
});

describe('material — lo tuyo frente a lo de los labs', () => {
  it('separa por procedencia: examples/ es del lab, la raíz es tuya', () => {
    crear({
      'examples/01-saucedemo/saucedemo-fd.md': '# fd del lab',
      'examples/01-saucedemo/saucedemo.feature': 'Feature: lab',
      'mi-proyecto/banco-fd.md': '# mi fd',
      'reservas.feature': 'Feature: mio',
    });
    const m = buscarMaterial(raiz);
    expect(m.propio.fds).toEqual(['mi-proyecto/banco-fd.md']);
    expect(m.propio.features).toEqual(['reservas.feature']);
    expect(m.de_ejemplo.fds).toEqual(['examples/01-saucedemo/saucedemo-fd.md']);
    expect(m.de_ejemplo.features).toEqual(['examples/01-saucedemo/saucedemo.feature']);
  });

  it('el CÓDIGO del producto no es un documento funcional', () => {
    // El falso positivo nº3, con los nombres reales que lo provocaron.
    crear({
      'src/fd-to-criteria.ts': 'export const x = 1;',
      'src/fd-proposal.ts': 'export const y = 2;',
      'docs/references/fd-criteria-schema.md': '# schema',
      'tests/unit/fd-to-criteria.test.ts': 'test',
    });
    const m = buscarMaterial(raiz);
    expect(m.propio.fds).toEqual([]);
    expect(m.de_ejemplo.fds).toEqual([]);
  });

  it('un .md que NO es un FD tampoco cuenta', () => {
    crear({ 'README.md': '# léeme', 'notas.md': '# notas' });
    expect(buscarMaterial(raiz).propio.fds).toEqual([]);
  });

  it('reconoce las dos formas de nombrar un FD, y los walk-scripts', () => {
    crear({ 'banco-fd.md': '#', 'fd-seguros.md': '#', 'regresion.walk.json': '{}' });
    const m = buscarMaterial(raiz);
    expect(m.propio.fds).toEqual(['banco-fd.md', 'fd-seguros.md']);
    expect(m.propio.guiones).toEqual(['regresion.walk.json']);
  });

  it('no baja a node_modules ni a .work', () => {
    crear({ 'node_modules/paquete/algo-fd.md': '#', '.work/run/otro-fd.md': '#' });
    expect(buscarMaterial(raiz).propio.fds).toEqual([]);
  });
});

describe('sugerencia — no adivina, y no cuenta el material del lab', () => {
  const vacio = { fds: [], features: [], guiones: [] };

  it('con UN documento tuyo: S3 con ese fichero', () => {
    const s = sugerirDesdeMaterial({ propio: { ...vacio, fds: ['banco-fd.md'] }, de_ejemplo: vacio });
    expect(s.modulo).toBe('S3');
    expect(s.comando).toContain('spec-refiner --fd=banco-fd.md');
  });

  it('con VARIOS documentos tuyos: NO elige — comando null y dice cuántos', () => {
    const s = sugerirDesdeMaterial({ propio: { ...vacio, fds: ['a-fd.md', 'b-fd.md'] }, de_ejemplo: vacio });
    expect(s.modulo).toBe('S3');
    expect(s.comando).toBeNull();
    expect(s.por_que).toContain('2');
    expect(s.por_que).toContain('elegir');
  });

  it('con UN .feature tuyo: S2 con --gherkin (nunca --feature)', () => {
    const s = sugerirDesdeMaterial({ propio: { ...vacio, features: ['reservas.feature'] }, de_ejemplo: vacio });
    expect(s.modulo).toBe('S2');
    expect(s.comando).toContain('--gherkin=reservas.feature');
    expect(s.comando).not.toContain('--feature=');
  });

  it('el documento manda sobre el Gherkin cuando tienes los dos', () => {
    const s = sugerirDesdeMaterial({
      propio: { ...vacio, fds: ['banco-fd.md'], features: ['reservas.feature'] },
      de_ejemplo: vacio,
    });
    expect(s.modulo).toBe('S3');
  });

  it('sin material TUYO cae a S4 aunque el lab esté lleno — y lo menciona', () => {
    // El falso positivo nº2: siete FD de labs no te convierten en usuario de S3.
    const s = sugerirDesdeMaterial({
      propio: vacio,
      de_ejemplo: { fds: ['examples/01/a-fd.md'], features: ['examples/01/b.feature'], guiones: [] },
    });
    expect(s.modulo).toBe('S4');
    expect(s.comando).toContain('autonomous');
    expect(s.por_que).toContain('lab');
  });

  it('sin material de ningún tipo, S4 y sin mencionar labs que no hay', () => {
    const s = sugerirDesdeMaterial({ propio: vacio, de_ejemplo: vacio });
    expect(s.modulo).toBe('S4');
    expect(s.por_que).not.toContain('lab');
  });
});

describe('estadoDelProyecto — la foto completa', () => {
  it('reconoce un workspace por sus dos ficheros', () => {
    crear({ 'config/allowed-targets.yaml': 'targets: []', 'playwright.config.ts': 'export default {};' });
    expect(estadoDelProyecto(raiz).workspace).toBe(true);
  });

  it('una carpeta cualquiera NO es un workspace', () => {
    crear({ 'algo.txt': 'hola' });
    expect(estadoDelProyecto(raiz).workspace).toBe(false);
  });

  it('el caso del QA que vuelve: contract propio + su documento', () => {
    crear({
      'config/allowed-targets.yaml': 'targets: []',
      'playwright.config.ts': 'export default {};',
      'config/style-contracts/saucedemo.yaml': 'project: saucedemo\n',
      'config/style-contracts/banco.yaml': `# ${MARCA_SETUP} el 2026-09-04\nproject: banco\n`,
      'banco-fd.md': '# mi documento',
    });
    const e = estadoDelProyecto(raiz);
    expect(e.contracts.propios).toHaveLength(1);
    expect(e.material.propio.fds).toEqual(['banco-fd.md']);
    expect(e.sugerencia.comando).toContain('spec-refiner --fd=banco-fd.md');
  });
});
