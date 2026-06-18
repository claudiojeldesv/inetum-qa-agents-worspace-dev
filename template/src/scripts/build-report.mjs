#!/usr/bin/env node
/**
 * build-report — genera el reporte Allure enriquecido CON history/trends persistente.
 *
 * Uso: npm run report
 *
 * Flujo (determinístico, cross-platform):
 *  1. History IN  — si existe .allure-history/, lo restaura en .work/allure-results/history
 *     (allure generate lo lee de ahí para los gráficos de tendencia).
 *  2. Enricher    — src/allure-enricher.ts añade sidecars, labels RF, links TMS, severity,
 *     story, description markdown y attachments judge/reviewer sobre .work/allure-results.
 *  3. Generate    — `allure generate .work/allure-results -o .work/allure-report --clean`.
 *  4. History OUT — persiste .work/allure-report/history → .allure-history/ para el próximo run.
 *
 * .work/ es efímero (borrable); .allure-history/ NO — sobrevive a la limpieza de .work/ para
 * que los Trends acumulen entre runs. Ambos están gitignored.
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = process.cwd();
const RESULTS = resolve(repo, '.work/allure-results');
const REPORT = resolve(repo, '.work/allure-report');
const HISTORY = resolve(repo, '.allure-history');

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' }).status ?? 1;
}

if (!existsSync(RESULTS)) {
  console.error(`[build-report] no existe ${RESULTS} — corre los tests con el reporter allure-playwright primero.`);
  process.exit(1);
}

// 1. History IN
if (existsSync(HISTORY)) {
  cpSync(HISTORY, resolve(RESULTS, 'history'), { recursive: true });
  console.log('[build-report] history restaurado desde .allure-history/');
}

// 2. Enricher (defaults a .work/; ver src/allure-enricher.ts)
if (run('npx', ['tsx', 'src/allure-enricher.ts']) !== 0) {
  console.warn('[build-report] el enricher devolvió error; se continúa con allure generate.');
}

// 3. allure generate (requiere Java en el PATH). --clean borra el report previo; el history
//    se re-inyectó en el paso 1 y se vuelve a persistir en el paso 4.
const gen = run('npx', ['allure', 'generate', '.work/allure-results', '-o', '.work/allure-report', '--clean']);
if (gen !== 0) {
  console.error('[build-report] `allure generate` falló (¿Java en el PATH?). El enricher sí corrió sobre .work/allure-results.');
  process.exit(gen);
}

// 4. History OUT
const newHistory = resolve(REPORT, 'history');
if (existsSync(newHistory)) {
  rmSync(HISTORY, { recursive: true, force: true });
  cpSync(newHistory, HISTORY, { recursive: true });
  console.log('[build-report] history persistido en .allure-history/ (Trends para el próximo run).');
}

console.log('[build-report] reporte listo en .work/allure-report (ábrelo con: npx allure open .work/allure-report).');
