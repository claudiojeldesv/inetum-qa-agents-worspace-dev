#!/usr/bin/env tsx
/**
 * field-deploy — despliega un workspace de campo reproducible desde `template/`.
 *
 * El problema que resuelve, medido el 2026-08-24: los siete directorios de campo de esta
 * máquina ocupaban 1,1 GB, eran 99% reproducibles (node_modules + payload) y aun así NO
 * reproducibles, porque nada sellaba de qué commit del producto salía cada uno.
 * `loop-dolibarr` y `loop-the-internet` declaraban los dos `0.4.0-beta.15` y tenían distinto
 * `pre-review.ts`: el número de versión no discriminaba. Eso convierte cualquier medición de
 * campo en una anécdota — aquí y, sobre todo, en otro equipo.
 *
 * Lo que hace y no hacía el procedimiento manual documentado en prosa:
 *  1. SELLA (`FIELD.json`): commit del producto, si el árbol estaba sucio, hash del payload y
 *     la receta con la que se desplegó. Sin sello no hay iteración reproducible.
 *  2. VERIFICA el allowlist del destino con el pre-flight REAL (`runPreflight`), no con un
 *     matcher propio: dos matchers que pueden divergir son otra instancia de la familia D2.
 *     Verifica y JAMÁS escribe — compliance no tiene override, y un desplegador que da de alta
 *     targets sería exactamente el override.
 *  3. Deja el workspace usable en un paso, no en tres recordados.
 *
 * Uso:
 *   npm run field:deploy -- --site=dolibarr --dest=../campo/dolibarr
 *   npm run field:deploy -- --site=dolibarr --dest=<ruta> --dry-run
 *   npm run field:deploy -- --site=dolibarr --dest=<ruta> --skip-install
 *
 * Recetas: config/field-sites/<site>.yaml (schema en docs/references/field-sites-schema.md).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve, relative, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { runPreflight } from '../compliance-preflight.js';

interface RecetaSitio {
  site: string;
  url: string;
  style_contract: string;
  mode?: string;
  flows?: string[] | null;
}

const repo = process.cwd();
const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const has = (n: string) => args.includes(`--${n}`);

const site = flag('site');
const destArg = flag('dest');
const dryRun = has('dry-run');
const skipInstall = has('skip-install');

/** Todo lo efímero o regenerable: no viaja. `.work/` es corpus, `node_modules` es un install. */
const NO_VIAJA = new Set(['node_modules', '.work', 'test-results', 'playwright-report', 'allure-results']);

function morir(msg: string, ...extra: string[]): never {
  console.error(`[field-deploy] ${msg}`);
  for (const e of extra) console.error(`               ${e}`);
  process.exit(1);
}

function recetasDisponibles(): string[] {
  const dir = join(repo, 'config', 'field-sites');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''));
}

if (!site || !destArg) {
  morir(
    'uso: npm run field:deploy -- --site=<sitio> --dest=<ruta> [--dry-run] [--skip-install]',
    `sitios con receta: ${recetasDisponibles().join(', ') || '(ninguno)'}`,
  );
}

// ---------------------------------------------------------------- 1. la receta

const recetaPath = join(repo, 'config', 'field-sites', `${site}.yaml`);
if (!existsSync(recetaPath)) {
  morir(
    `no hay receta para '${site}': ${relative(repo, recetaPath)}`,
    `sitios con receta: ${recetasDisponibles().join(', ') || '(ninguno)'}`,
    'una receta nueva se declara a mano; este comando no la inventa.',
  );
}
const receta = parseYaml(readFileSync(recetaPath, 'utf8')) as RecetaSitio;
for (const campo of ['site', 'url', 'style_contract'] as const) {
  if (!receta?.[campo]) morir(`la receta de '${site}' no declara '${campo}' (obligatorio)`);
}

const tpl = join(repo, 'template');
if (!existsSync(tpl)) morir('no existe template/ — ejecuta primero `npm run build:template`');

const dest = resolve(repo, destArg);
if (dest === repo || dest === tpl) morir('el destino no puede ser el repo ni template/');

/**
 * MAX_PATH de Windows. Medido en carne propia el 2026-08-24: un destino de ~250 caracteres
 * copia los 134 ficheros sin queja y luego `npm install` muere en el postinstall de esbuild
 * (`spawnSync ... ENOENT`) por la ruta de `node_modules/vite/node_modules/esbuild/bin/`.
 * El sintoma no menciona la ruta y manda a depurar la dependencia equivocada. El mismo
 * despliegue en 27 caracteres instala y da healthcheck 32/32.
 *
 * Se avisa en vez de bloquear: `\?\` y LongPathsEnabled existen, y el limite exacto depende
 * del arbol de dependencias. Bloquear seria decidir por el QA con un umbral inventado.
 */
const MARGEN_NODE_MODULES = 130; // lo que anaden las rutas mas profundas de node_modules
if (process.platform === 'win32' && dest.length + MARGEN_NODE_MODULES > 260) {
  console.warn(`[field-deploy] AVISO: el destino tiene ${dest.length} caracteres.`);
  console.warn('               Con node_modules dentro se pasa de MAX_PATH (260) y `npm install`');
  console.warn('               falla en el postinstall de esbuild con un ENOENT que no menciona la ruta.');
  console.warn('               Elige un destino corto (probado: 27 caracteres → healthcheck 32/32).');
}

// ------------------------------------------------- 2. el sello (antes de copiar)

function git(...a: string[]): string | null {
  try {
    return execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const commit = git('rev-parse', 'HEAD');
const sucio = git('status', '--porcelain');
const rama = git('rev-parse', '--abbrev-ref', 'HEAD');
if (!commit) morir('no se pudo leer el commit del repo: sin sello no se despliega');

/**
 * Hash del payload: recorre lo que SÍ viaja, ordenado, y encadena ruta+contenido. Es lo que
 * distingue dos despliegues que dicen la misma versión — el caso real que motivó el comando.
 */
function hashPayload(raiz: string): { hash: string; ficheros: number } {
  const h = createHash('sha256');
  const rutas: string[] = [];
  (function anda(dir: string) {
    for (const n of readdirSync(dir).sort()) {
      if (NO_VIAJA.has(n)) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) anda(p);
      else rutas.push(p);
    }
  })(raiz);
  for (const p of rutas.sort()) {
    h.update(relative(raiz, p).replace(/\\/g, '/'));
    h.update(readFileSync(p));
  }
  return { hash: h.digest('hex'), ficheros: rutas.length };
}

const payload = hashPayload(tpl);
const version = JSON.parse(readFileSync(join(tpl, 'package.json'), 'utf8')).version as string;

const sello = {
  desplegado_por: 'field-deploy',
  sitio: receta.site,
  url: receta.url,
  modo: receta.mode ?? null,
  flows: receta.flows ?? null,
  receta: `config/field-sites/${site}.yaml`,
  producto: {
    commit,
    rama,
    // Un árbol sucio no bloquea (a veces se despliega para probar un parche) pero SE DECLARA:
    // un sello que miente es peor que no tener sello.
    arbol_limpio: sucio === '' ? true : sucio === null ? null : false,
    // `git status` fallido (sucio === null) NO es un arbol limpio: es un dato que no se
    // pudo leer, y un sello que lo declara limpio miente.
    ficheros_sin_commitear: sucio ? sucio.split('\n').filter(Boolean).length : 0,
    version_template: version,
  },
  payload: { sha256: payload.hash, ficheros: payload.ficheros },
};

console.log(`[field-deploy] sitio      ${receta.site}  (${receta.url})`);
console.log(`[field-deploy] destino    ${dest}`);
console.log(
  `[field-deploy] producto   ${commit.slice(0, 7)} en ${rama}${sucio === '' ? '' : '  (ÁRBOL SUCIO — se declara en el sello)'}`,
);
console.log(`[field-deploy] payload    ${payload.hash.slice(0, 12)}…  ${payload.ficheros} ficheros  v${version}`);


// --------------------------------------- 3. compliance: ANTES de tocar el disco

/**
 * El allowlist que se va a consultar: el del destino si ya existe (puede traer patrones que
 * el QA declaro alli), y si no el del template, que es el que va a aterrizar. Se comprueba
 * ANTES de copiar: un despliegue denegado no debe dejar 134 ficheros sueltos — lo dejaba, y
 * salio en el par falsable de la propia herramienta.
 */
const allowlistDest = join(dest, 'config', 'allowed-targets.yaml');
const allowlistPath = existsSync(allowlistDest) ? allowlistDest : join(tpl, 'config', 'allowed-targets.yaml');
if (!existsSync(allowlistPath)) morir(`no hay allowlist que consultar: ${relative(repo, allowlistPath)}`);

/**
 * Misma semantica que hooks/pre-flight.ts, que es la autoridad: 'block' deniega (exit 2) y
 * 'warn' pasa declarando el motivo (exit 0). Tratar un aviso como bloqueo dejaria fuera a
 * demos legitimamente declarados — demo.dolibarr.org da W1 ("lacks non-prod prefix") y es un
 * sitio de la gira, medido durante dias.
 */
const veredicto = runPreflight(receta.url, allowlistPath);
if (veredicto.verdict === 'block') {
  morir(
    `compliance BLOQUEA la URL de la receta: ${receta.url}`,
    `regla ${veredicto.rule ?? '?'}: ${veredicto.reason ?? 'sin motivo'}`,
    'no hay override, y este comando no lo inventa. Si el entorno es NO productivo,',
    `declara el patron a mano en ${relative(repo, allowlistPath)} y repite.`,
    'no se ha copiado nada.',
  );
}
if (veredicto.verdict === 'warn') {
  console.warn(`[field-deploy] allowlist  AVISO ${veredicto.rule ?? ''}: ${veredicto.reason ?? ''} — se continua (igual que el hook)`);
} else {
  console.log(`[field-deploy] allowlist  OK — ${receta.url} autorizada por el pre-flight`);
}

// --dry-run sale AQUI, no antes: lo mas util de una pasada en seco es saber si compliance
// dejaria pasar la URL, y eso solo se sabe tras consultar el allowlist.
if (dryRun) {
  console.log('[field-deploy] --dry-run: no se copia nada.');
  process.exit(0);
}

// ------------------------------------------------------------- 4. el copiado

mkdirSync(dest, { recursive: true });
cpSync(tpl, dest, {
  recursive: true,
  filter: (src) => {
    const base = src.split(/[\\/]/).pop() ?? '';
    return !NO_VIAJA.has(base);
  },
});
console.log(`[field-deploy] copiado    template/ → destino (${payload.ficheros} ficheros)`);

/**
 * El style contract que la receta NOMBRA, si no vino ya en el template. Solo ese fichero: el
 * directorio entero del repo tiene contracts de cliente y no viaja a ningún payload.
 */
const contractRel = receta.style_contract.replace(/^\.?[\\/]/, '');
const contractDest = join(dest, contractRel);
if (!existsSync(contractDest)) {
  const contractRepo = join(repo, contractRel);
  if (!existsSync(contractRepo)) morir(`la receta apunta a un contract que no existe: ${contractRel}`);
  mkdirSync(dirname(contractDest), { recursive: true });
  cpSync(contractRepo, contractDest);
  console.log(`[field-deploy] contract   copiado del repo: ${contractRel}`);
}

writeFileSync(join(dest, 'FIELD.json'), JSON.stringify(sello, null, 2) + '\n', 'utf8');
console.log('[field-deploy] sello      FIELD.json escrito');

// ------------------------------------------------------------ 5. dejarlo usable

if (skipInstall) {
  console.log('[field-deploy] --skip-install: te toca `npm install` y `npx playwright install chromium`.');
} else {
  const pasos: Array<[string, string, string[]]> = [
    ['npm install', 'npm', ['install', '--no-audit', '--no-fund']],
    ['playwright install chromium', 'npx', ['playwright', 'install', 'chromium']],
  ];
  for (const [etiqueta, cmd, argv] of pasos) {
    console.log(`[field-deploy] ${etiqueta}…`);
    try {
      execFileSync(cmd, argv, { cwd: dest, stdio: 'inherit', shell: process.platform === 'win32' });
    } catch {
      morir(`falló '${etiqueta}' en el destino`, 'el workspace queda copiado y sellado; termina la instalación a mano.');
    }
  }
}

console.log('');
console.log(`[field-deploy] LISTO. Comprueba con:  cd ${destArg} && npm run qa:healthcheck`);
if (receta.mode === 'S4' && receta.flows?.length) {
  console.log(`[field-deploy] y lanza:  /ia4d-qa-automator:autonomous --url=${receta.url} --flows=${receta.flows.join(',')}`);
}
