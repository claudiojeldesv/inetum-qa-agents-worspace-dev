#!/usr/bin/env node
// Scaffolder determinístico del workspace ia4d-qa-automator.
// Copia el payload/ empaquetado a un directorio destino. Sin LLM, sin dependencias.
// Uso: node scaffold.mjs [carpeta-destino] [--force]
import { existsSync, readdirSync, mkdirSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const PAYLOAD = join(scriptDir, 'payload');

const args = process.argv.slice(2);
const force = args.includes('--force');
const targetArg = args.find((a) => !a.startsWith('--')) || 'qa-automator-workspace';
const target = resolve(process.cwd(), targetArg);

function fail(msg) {
  console.error(`[qa-automator:init] ERROR: ${msg}`);
  process.exit(1);
}

if (!existsSync(PAYLOAD)) {
  fail(`payload no encontrado en ${PAYLOAD}. Paquete corrupto; regenera con "npm run build:plugin".`);
}
if (existsSync(target) && readdirSync(target).length > 0 && !force) {
  fail(`el destino "${target}" no está vacío. Usa otra carpeta o pasa --force para sobrescribir.`);
}

// Cinturón y tirantes: el builder ya excluye estos, pero los filtramos también aquí.
const EXCLUDE_DIRS = new Set(['node_modules', '.work', '.git']);
const AUTH_DIR = join('playwright', '.auth');

mkdirSync(target, { recursive: true });
cpSync(PAYLOAD, target, {
  recursive: true,
  force,
  filter: (src) => {
    const rel = src.slice(PAYLOAD.length + 1);
    if (!rel) return true;
    const segs = rel.split(sep);
    if (segs.some((s) => EXCLUDE_DIRS.has(s))) return false;
    if (rel === AUTH_DIR || rel.startsWith(AUTH_DIR + sep)) return false;
    return true;
  },
});

console.log(`[qa-automator:init] Workspace desplegado en: ${target}`);
console.log('');
console.log('Próximos pasos:');
console.log(`  cd ${targetArg}`);
console.log('  npm install');
console.log('  npx playwright install chromium');
console.log('  cp .env.example .env      # opcional, ajusta toggles');
console.log('  npm run qa:healthcheck    # debe terminar en "Healthcheck OK"');
console.log('');
console.log('Luego abre la carpeta en tu IDE y prueba el lab 01:');
console.log('  /ia4d-qa-automator:autonomous --url=https://www.saucedemo.com/ --flows=login,checkout');
