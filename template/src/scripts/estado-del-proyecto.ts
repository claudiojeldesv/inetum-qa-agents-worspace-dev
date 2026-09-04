#!/usr/bin/env node
/**
 * estado-del-proyecto — QUÉ HAY YA EN ESTE WORKSPACE, para que la puerta de
 * entrada no tenga que adivinarlo.
 *
 * ## Por qué existe
 *
 * `/setup` es la puerta única del producto: su primera pregunta —«¿qué tienes
 * para empezar?»— determina el módulo, y su cierre nombra el comando siguiente.
 * Para que esa conversación no empiece de cero cada vez hace falta un hecho que
 * hoy nadie mira: **si el QA ya tiene contract, y qué material hay a mano**.
 *
 * Y es un hecho, no un juicio, así que lo mide un script (regla dura #5:
 * validación determinística, no LLM mirando la carpeta).
 *
 * ## La trampa que obligó a diseñarlo así
 *
 * «¿Existe algún style contract?» es una pregunta INSERVIBLE: un workspace recién
 * desplegado trae SIETE de ejemplo (dolibarr, mifos, orangehrm, parabank,
 * restful-booker, saucedemo, the-internet). La respuesta sería siempre «sí» y la
 * puerta se cerraría en la cara del QA en su primer minuto.
 *
 * La pregunta útil es **«¿hay un contract TUYO?»**, y para poder contestarla el
 * setup deja una marca al emitirlo:
 *
 *     # emitido por ia4d-qa-automator:setup el AAAA-MM-DD
 *
 * Es un COMENTARIO a propósito: no toca el schema, no lo ve el validador, y no
 * puede romper un contract existente. Lo que se pierde es el contract escrito a
 * mano —que no llevará la marca—, y ahí la respuesta correcta no es adivinar sino
 * preguntar: este script dice «no encuentro ninguno emitido por el setup» y lista
 * los que hay para que el QA diga cuál es suyo.
 *
 * ## Lo que NO hace
 *
 * No decide el módulo por su cuenta: se lo pregunta a `resolveMode`, que es quien
 * ya sabe (duplicar esa regla aquí sería la familia D2). No abre el navegador, no
 * llama a ningún LLM y no escribe nada: solo lee y responde.
 *
 * Exit: 0 siempre que pueda leer el directorio (es telemetría, no un gate) · 1 IO.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { resolveMode } from './resolve-mode.ts';

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;

/** La marca que el setup deja al emitir un contract. Comentario YAML: no toca el schema. */
export const MARCA_SETUP = 'emitido por ia4d-qa-automator:setup';

export interface ContractHallado {
  fichero: string;
  project?: string;
  /** true = lleva la marca del setup, o sea que lo emitió el producto para este QA. */
  propio: boolean;
}

export interface MaterialHallado {
  fds: string[];
  features: string[];
  guiones: string[];
}

/**
 * El material, separado por procedencia — y la separación es TODO el valor.
 *
 * Un workspace recién desplegado trae siete FD y cinco `.feature` **de los labs**.
 * Medido: sin separar, la sugerencia salía «usa `saucedemo-fd.md`», que es el
 * primero por orden alfabético y no es del QA. Confiado y equivocado, que es la
 * peor combinación en una puerta de entrada.
 */
export interface MaterialPorProcedencia {
  /** Lo que ha traído el QA: cualquier cosa fuera de `examples/`. */
  propio: MaterialHallado;
  /** Lo que viene con el producto para aprender. */
  de_ejemplo: MaterialHallado;
}

export interface Sugerencia {
  /** El modulo que `resolveMode` deduce del material. `null` = no hay con que decidir. */
  modulo: 'S1' | 'S2' | 'S3' | 'S4' | null;
  comando: string | null;
  por_que: string;
}

export interface EstadoDelProyecto {
  workspace: boolean;
  contracts: { propios: ContractHallado[]; de_ejemplo: ContractHallado[] };
  material: MaterialPorProcedencia;
  sugerencia: Sugerencia;
}

/** El `project:` declarado, si lo hay. Lectura superficial a propósito: no es el validador. */
export function projectDelContract(texto: string): string | undefined {
  const m = texto.match(/^project:\s*(.+?)\s*$/m);
  return m ? m[1].replace(/^['"]|['"]$/g, '') : undefined;
}

export function leerContracts(dir: string): { propios: ContractHallado[]; de_ejemplo: ContractHallado[] } {
  const propios: ContractHallado[] = [];
  const de_ejemplo: ContractHallado[] = [];
  if (!existsSync(dir)) return { propios, de_ejemplo };
  for (const nombre of readdirSync(dir)) {
    if (!/\.(ya?ml)$/i.test(nombre)) continue;
    let texto = '';
    try {
      texto = readFileSync(join(dir, nombre), 'utf8');
    } catch {
      continue; // ilegible: no se inventa nada sobre él
    }
    const hallado: ContractHallado = {
      fichero: nombre,
      project: projectDelContract(texto),
      propio: texto.includes(MARCA_SETUP),
    };
    (hallado.propio ? propios : de_ejemplo).push(hallado);
  }
  return { propios, de_ejemplo };
}

/**
 * Material de entrada a mano. Se busca donde el producto lo pone —`examples/` y
 * la raíz— y con profundidad acotada: un barrido del workspace entero traería
 * `node_modules` y los artefactos de runs viejos, y la lista dejaría de servir
 * para elegir.
 */
export function buscarMaterial(raiz: string, profundidad = 3): MaterialPorProcedencia {
  const fds: string[] = [];
  const features: string[] = [];
  const guiones: string[] = [];
  const IGNORAR = new Set(['node_modules', '.work', '.git', 'artifacts', 'playwright-report', 'test-results']);
  /**
   * Los directorios que son DEL PRODUCTO, no del QA. Medido ejecutándolo: sin
   * esta lista, `src/fd-to-criteria.ts` y `docs/references/fd-criteria-schema.md`
   * se contaban como «documentos funcionales del QA» y la puerta decía «tienes 6
   * documentos» señalando código propio. El material del QA vive en la raíz o en
   * una carpeta suya; nunca dentro del árbol del producto.
   */
  const DEL_PRODUCTO = new Set([
    'src', 'tests', 'copilot', 'docs', 'config', 'specs', 'criteria', 'playwright', 'plugin', 'template', 'hooks',
  ]);

  const recorrer = (dir: string, nivel: number): void => {
    if (nivel > profundidad || !existsSync(dir)) return;
    let entradas: string[];
    try {
      entradas = readdirSync(dir);
    } catch {
      return;
    }
    for (const nombre of entradas) {
      if (IGNORAR.has(nombre) || nombre.startsWith('.')) continue;
      if (nivel === 0 && DEL_PRODUCTO.has(nombre)) continue;
      const ruta = join(dir, nombre);
      let esDir = false;
      try {
        esDir = statSync(ruta).isDirectory();
      } catch {
        continue;
      }
      if (esDir) {
        recorrer(ruta, nivel + 1);
        continue;
      }
      const rel = relative(raiz, ruta).replace(/\\/g, '/');
      if (/\.feature$/i.test(nombre)) features.push(rel);
      else if (/\.walk\.json$/i.test(nombre)) guiones.push(rel);
      // Un FD es un MARKDOWN: `-fd.md` o `fd-*.md`. Sin exigir la extensión, el
      // código del producto (`fd-proposal.ts`) entraba en la lista.
      else if (/\.md$/i.test(nombre) && (/-fd\.md$/i.test(nombre) || /^fd-/i.test(nombre))) fds.push(rel);
    }
  };

  recorrer(raiz, 0);
  const unicos = (xs: string[]): string[] => [...new Set(xs)].sort();
  const esDelLab = (r: string): boolean => r.startsWith('examples/');
  const reparte = (xs: string[]) => {
    const u = unicos(xs);
    return { mio: u.filter((r) => !esDelLab(r)), lab: u.filter(esDelLab) };
  };
  const f = reparte(fds), g = reparte(features), w = reparte(guiones);
  return {
    propio: { fds: f.mio, features: g.mio, guiones: w.mio },
    de_ejemplo: { fds: f.lab, features: g.lab, guiones: w.lab },
  };
}

/**
 * Qué puerta sugiere lo que hay. Tres reglas, y las tres son de honestidad:
 *
 *  1. **Solo cuenta el material del QA**, no el de los labs (ver
 *     `MaterialPorProcedencia`).
 *  2. **Con varios candidatos no se elige uno**: se dice cuántos hay y el comando
 *     queda en `null` para que la conversación pregunte. Elegir el primero por
 *     orden alfabético es adivinar con cara de saber.
 *  3. **El módulo lo decide `resolveMode`**, no este fichero — duplicar esa regla
 *     sería la familia D2.
 *
 * La URL nunca sale de aquí: no hay forma de saberla mirando la carpeta, así que
 * el comando la deja como hueco y la pide el setup.
 */
export function sugerirDesdeMaterial(mp: MaterialPorProcedencia): Sugerencia {
  const m = mp.propio;
  const flags: Record<string, string | undefined> = { url: 'PENDIENTE' };
  if (m.fds.length) flags.fd = m.fds[0];
  else if (m.features.length) flags.gherkin = m.features[0];
  const r = resolveMode(flags);

  const uno = (tipo: 'fd' | 'gherkin', xs: string[], comando: (x: string) => string): Sugerencia | null => {
    if (!xs.length) return null;
    if (xs.length > 1) {
      return {
        modulo: r.module,
        comando: null,
        por_que: `tienes ${xs.length} ${tipo === 'fd' ? 'documentos funcionales' : 'ficheros .feature'}: hay que elegir cuál`,
      };
    }
    return { modulo: r.module, comando: comando(xs[0]), por_que: `tu único ${tipo === 'fd' ? 'documento funcional' : 'fichero .feature'} es ${xs[0]}` };
  };

  const porFd = uno('fd', m.fds, (x) => `/ia4d-qa-automator:spec-refiner --fd=${x} --url=<URL>`);
  if (porFd) return porFd;
  const porGherkin = uno('gherkin', m.features, (x) => `/ia4d-qa-automator:req-driven --gherkin=${x} --url=<URL>`);
  if (porGherkin) return porGherkin;

  const hayLab = mp.de_ejemplo.fds.length + mp.de_ejemplo.features.length > 0;
  return {
    modulo: r.module,
    comando: `/ia4d-qa-automator:autonomous --url=<URL> --flows=<módulos>`,
    por_que: hayLab
      ? 'no has traído documento ni Gherkin: queda explorar desde la URL (o recorrer un lab, que sí trae material)'
      : 'no hay documento ni Gherkin: solo queda explorar desde la URL',
  };
}

export function estadoDelProyecto(raiz: string): EstadoDelProyecto {
  const workspace =
    existsSync(join(raiz, 'config', 'allowed-targets.yaml')) && existsSync(join(raiz, 'playwright.config.ts'));
  const contracts = leerContracts(join(raiz, 'config', 'style-contracts'));
  const material = buscarMaterial(raiz);
  return { workspace, contracts, material, sugerencia: sugerirDesdeMaterial(material) };
}

function main(): void {
  const { values } = parseArgs({ options: { raiz: { type: 'string' } }, allowPositionals: true });
  const raiz = resolve(values.raiz ?? process.cwd());
  if (!existsSync(raiz)) {
    console.error(`[estado] no existe el directorio: ${raiz}`);
    process.exit(EXIT_ERROR);
  }
  const estado = estadoDelProyecto(raiz);
  console.log(JSON.stringify({ raiz: basename(raiz), ...estado }, null, 2));
  process.exit(EXIT_OK);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
