#!/usr/bin/env node
/**
 * build-report — genera el reporte Allure enriquecido en formato SINGLE-FILE (HTML duro).
 *
 * Uso: npm run report
 *
 * Flujo (determinístico, cross-platform):
 *  1. Enricher  — src/allure-enricher.ts añade sidecars, labels RF, links TMS, severity,
 *     story, description markdown y attachments judge/reviewer sobre .work/allure-results.
 *  2. Generate  — `allure generate .work/allure-results --single-file -o .work/allure-report
 *     --clean`. Produce UN único .work/allure-report/index.html autocontenido: se abre con
 *     doble-clic (file://) sin servidor.
 *
 * Trade-offs del single-file (decisión SDET: el HTML duro es el único output que interesa):
 *  - NO hay Trends acumulados entre runs: single-file no emite carpeta history/, así que se
 *    elimina el ciclo history IN/OUT y .allure-history/ deja de usarse en este flujo.
 *  - El trace navegable de Playwright NO funciona embebido (necesita el viewer); los
 *    screenshots por paso SÍ quedan inline.
 *
 * .work/ es efímero (borrable). El index.html es autocontenido: cópialo a donde quieras
 * conservarlo/compartirlo y abre igual.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = process.cwd();
const RESULTS = resolve(repo, '.work/allure-results');

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' }).status ?? 1;
}

if (!existsSync(RESULTS)) {
  console.error(`[build-report] no existe ${RESULTS} — corre los tests con el reporter allure-playwright primero.`);
  process.exit(1);
}

// 1. Enricher (defaults a .work/; ver src/allure-enricher.ts)
if (run('npx', ['tsx', 'src/allure-enricher.ts']) !== 0) {
  console.warn('[build-report] el enricher devolvió error; se continúa con allure generate.');
}

// 2. allure generate --single-file (requiere Java en el PATH). --clean borra el report previo.
const gen = run('npx', [
  'allure',
  'generate',
  '.work/allure-results',
  '--single-file',
  '-o',
  '.work/allure-report',
  '--clean',
]);
if (gen !== 0) {
  console.error('[build-report] `allure generate` falló (¿Java en el PATH?). El enricher sí corrió sobre .work/allure-results.');
  process.exit(gen);
}

console.log('[build-report] reporte single-file listo en .work/allure-report/index.html (ábrelo con doble-clic; no necesita servidor).');
