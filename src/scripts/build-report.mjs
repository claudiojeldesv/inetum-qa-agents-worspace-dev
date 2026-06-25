#!/usr/bin/env node
/**
 * build-report — genera DOS reportes Allure enriquecidos a partir de un run ya ejecutado:
 *
 *   1. DURO (single-file)  → .work/allure-report/index.html
 *      HTML autocontenido, se abre con doble-clic (file://) sin servidor. Para compartir/archivar.
 *      Limitación intrínseca del single-file: el trace navegable de Playwright NO funciona
 *      (el visor necesita fetchear el trace.zip por HTTP, y file:// no lo permite). Los
 *      screenshots por paso SÍ quedan inline.
 *
 *   2. SERVIDO (multi-fichero) → .work/allure-report-served/  + `allure open`
 *      UI Allure completa servida en localhost. Aquí SÍ funciona el trace navegable de
 *      Playwright (time-travel) y NO aparece el error 500 "Failed to fetch" (ese 500 es
 *      justo de abrir el multi-fichero por file://; servirlo lo elimina). Para debugging.
 *      Gestión del servidor: antes de abrir uno nuevo, mata el que /report dejó abierto en
 *      la corrida anterior (PID en .work/.allure-server.pid) para que no se apilen.
 *
 * Uso: npm run report
 *
 * Flujo (determinístico, cross-platform):
 *   - Enricher (una vez) sobre .work/allure-results: sidecars, labels RF, links TMS, severity,
 *     story, description/descriptionHtml y attachments judge/reviewer.
 *   - allure generate ×2 (single-file y multi-fichero) sobre los MISMOS results enriquecidos.
 *   - Inyección de CSS de marca en el <head> de ambos index.html.
 *   - allure open del servido (detached), matando el servidor previo.
 *
 * .work/ es efímero (borrable). El index.html duro es autocontenido: cópialo donde quieras.
 */
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const repo = process.cwd();
// Work dir por-sitio (v0.2): QA_WORK_DIR='.work/<site-id>' aísla los reportes por sitio.
// Sin la var → '.work' (comportamiento previo).
const WORK = process.env.QA_WORK_DIR || '.work';
const RESULTS = resolve(repo, `${WORK}/allure-results`);
const HARD_DIR = `${WORK}/allure-report`;
const SERVED_DIR = `${WORK}/allure-report-served`;
const isWin = process.platform === 'win32';
const PIDFILE = resolve(repo, `${WORK}/.allure-server.pid`);

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'inherit', shell: isWin }).status ?? 1;
}

const INJECT_MARKER = 'ia4d-qa-automator: enriquecimiento visual inyectado';
const BRAND_CSS = `<style>
/* ${INJECT_MARKER} */
:root {
  /* AJUSTA al hex corporativo Inetum exacto. */
  --ia4d-accent: #6c3ce0;
  --ia4d-accent-soft: rgba(108, 60, 224, 0.12);
}
.description__text table { border-collapse: collapse; margin: 2px 0 14px; font-size: 13px; }
.description__text table td { padding: 4px 16px 4px 0; vertical-align: top; border: 0; }
.description__text table td:first-child {
  white-space: nowrap; font-size: 11px; letter-spacing: 0.05em;
  text-transform: uppercase; opacity: 0.6; font-weight: 600;
}
.description__text code {
  background: var(--ia4d-accent-soft); color: var(--ia4d-accent);
  padding: 1px 6px; border-radius: 4px; font-size: 12px;
}
.description__text a { color: var(--ia4d-accent); }
.description__text blockquote {
  border-left: 3px solid var(--ia4d-accent); background: var(--ia4d-accent-soft);
  margin: 8px 0; padding: 8px 12px; border-radius: 0 6px 6px 0;
}
.side-nav__item_active, .side-nav__item:hover { box-shadow: inset 3px 0 0 var(--ia4d-accent); }
</style>`;

// Inyección idempotente del CSS de marca en el <head>. El sanitizer de Allure elimina
// style/class/data del descriptionHtml (verificado contra 2.34), así que el color del panel
// del TC vive aquí, targeteando `.description__text` (la clase con que Allure lo envuelve).
function injectBrandCss(indexPath) {
  try {
    if (!existsSync(indexPath)) {
      console.warn(`[build-report] no existe ${indexPath}; CSS no inyectado.`);
      return;
    }
    const html = readFileSync(indexPath, 'utf8');
    if (html.includes(INJECT_MARKER)) return;
    if (!html.includes('</head>')) {
      console.warn(`[build-report] sin </head> en ${indexPath}; CSS no inyectado.`);
      return;
    }
    writeFileSync(indexPath, html.replace('</head>', `${BRAND_CSS}\n</head>`), 'utf8');
  } catch (err) {
    console.warn(`[build-report] no se pudo inyectar CSS en ${indexPath}: ${err.message}`);
  }
}

// Mata el servidor Allure que /report dejó abierto en la corrida previa (PID file).
// Cross-platform: taskkill /T en Windows (mata el árbol cmd→node→java), kill de grupo en POSIX.
function killPrevServer() {
  if (!existsSync(PIDFILE)) return;
  const pid = parseInt(readFileSync(PIDFILE, 'utf8').trim(), 10);
  if (Number.isInteger(pid) && pid > 0) {
    try {
      if (isWin) {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        try {
          process.kill(-pid, 'SIGTERM');
        } catch {
          process.kill(pid, 'SIGTERM');
        }
      }
      console.log(`[build-report] servidor Allure previo (pid ${pid}) cerrado.`);
    } catch {
      /* el proceso ya no existía */
    }
  }
  try {
    rmSync(PIDFILE);
  } catch {
    /* sin PID file que borrar */
  }
}

// Abre el report servido con `allure open` en background (detached) y persiste su PID.
function openServed(dir) {
  killPrevServer();
  const child = spawn('npx', ['allure', 'open', dir], {
    detached: true,
    stdio: 'ignore',
    shell: isWin,
  });
  child.unref();
  if (child.pid) {
    try {
      writeFileSync(PIDFILE, String(child.pid), 'utf8');
    } catch {
      /* no se pudo persistir el PID: el próximo run no podrá matarlo, no es fatal */
    }
  }
  return child.pid;
}

if (!existsSync(RESULTS)) {
  console.error(`[build-report] no existe ${RESULTS} — corre los tests con el reporter allure-playwright primero.`);
  process.exit(1);
}

// 1. Enricher (una vez; defaults a .work/; ver src/allure-enricher.ts).
if (run('npx', ['tsx', 'src/allure-enricher.ts']) !== 0) {
  console.warn('[build-report] el enricher devolvió error; se continúa con allure generate.');
}

// 2. Report DURO (single-file). Requiere Java en el PATH. --clean borra el report previo.
const genHard = run('npx', ['allure', 'generate', `${WORK}/allure-results`, '--single-file', '-o', HARD_DIR, '--clean']);
if (genHard !== 0) {
  console.error('[build-report] `allure generate --single-file` falló (¿Java en el PATH?). El enricher sí corrió.');
  process.exit(genHard);
}
injectBrandCss(resolve(repo, HARD_DIR, 'index.html'));
console.log(`[build-report] report DURO listo en ${HARD_DIR}/index.html (doble-clic, sin servidor; sin trace navegable).`);

// 3. Report SERVIDO (multi-fichero). Fallo aquí NO aborta: el duro ya está entregado.
const genServed = run('npx', ['allure', 'generate', `${WORK}/allure-results`, '-o', SERVED_DIR, '--clean']);
if (genServed !== 0) {
  console.warn('[build-report] `allure generate` (servido) falló; solo queda el report duro.');
  process.exit(0);
}
injectBrandCss(resolve(repo, SERVED_DIR, 'index.html'));

// 4. Abrir el servido (trace navegable + sin error 500), matando el servidor previo.
const pid = openServed(SERVED_DIR);
console.log(
  `[build-report] report SERVIDO abriéndose con \`allure open\` (pid ${pid ?? '?'}): UI Allure en localhost, ` +
    'trace de Playwright navegable, sin error 500. Se cierra solo en el próximo `npm run report`.',
);
