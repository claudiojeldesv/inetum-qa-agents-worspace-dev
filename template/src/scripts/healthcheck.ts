#!/usr/bin/env tsx
/**
 * Healthcheck estructural de ia4d-qa-automator.
 * Verifica que el runtime del agente está completo y cableado, sin invocar el MCP
 * ni gastar tokens. Determinístico: solo comprueba presencia de archivos, wiring y
 * coherencia de versiones de Playwright (lectura pura de node_modules, sin shell).
 *
 * Uso:
 *   npm run qa:healthcheck         → solo valida (read-only, seguro de correr cuando sea).
 *   npm run qa:fix  (o -- --fix)   → opt-in: intenta reparar lo SEGURO (instalar browsers).
 *                                    El drift de versiones NO se auto-repara (requiere npm ci,
 *                                    que borraría node_modules en uso): se reporta el comando.
 * Exit 0 si todo OK, 1 si falta algo crítico.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const root = process.cwd();
const r = (p: string) => resolve(root, p);
const FIX = process.argv.includes('--fix');

type Check = { label: string; ok: boolean; detail?: string };
const checks: Check[] = [];

/** Versión instalada de un paquete leyendo su package.json (lectura pura, sin shell). */
function pkgVersion(name: string): string | null {
  const p = r(`node_modules/${name}/package.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/** ¿Hay un build de chromium instalado en la cache de Playwright? null = no determinable. */
function chromiumInstalled(): boolean | null {
  const custom = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (custom === '0') return null; // browsers bundled con el paquete — no se chequea aquí
  const base =
    custom && custom !== '1'
      ? custom
      : resolve(
          homedir(),
          process.platform === 'win32'
            ? 'AppData/Local/ms-playwright'
            : process.platform === 'darwin'
              ? 'Library/Caches/ms-playwright'
              : '.cache/ms-playwright'
        );
  if (!existsSync(base)) return false;
  try {
    return readdirSync(base).some((d) => d.startsWith('chromium'));
  } catch {
    return null;
  }
}

/**
 * ¿El servidor MCP `run-test-mcp-server` es invocable? `--help` sale 0 e imprime su uso sin abrir
 * el server stdio. Caza el caso "el MCP ni siquiera puede arrancar" (Playwright ausente/desactualizado
 * sin el subcomando) — el falso verde del run de farmacia. NO prueba que la sesión de Claude lo tenga
 * conectado (eso lo gestiona el harness, no este script): de la desconexión en vivo se encarga la
 * guarda anti-fabricación del command.
 */
function mcpServerInvokable(): { ok: boolean; detail: string } {
  try {
    const out = execSync('npx --no-install playwright run-test-mcp-server --help', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    if (/MCP|Usage|run-test-mcp-server/i.test(out)) {
      return { ok: true, detail: 'run-test-mcp-server responde (--help); config ≠ conexión viva en sesión' };
    }
    return { ok: false, detail: 'run-test-mcp-server no devolvió ayuda reconocible — revisa la versión de Playwright' };
  } catch {
    return {
      ok: false,
      detail: 'run-test-mcp-server NO arranca (Playwright ausente/desactualizado) — corre: npm ci && npx playwright install',
    };
  }
}

function fileCheck(label: string, rel: string): void {
  checks.push({ label, ok: existsSync(r(rel)), detail: rel });
}

function dirCountCheck(label: string, rel: string, min: number): void {
  const ok = existsSync(r(rel)) && readdirSync(r(rel)).length >= min;
  const n = existsSync(r(rel)) ? readdirSync(r(rel)).length : 0;
  checks.push({ label, ok, detail: `${rel} (${n} entradas, min ${min})` });
}

// Agentes: en el workspace solo viven los 3 nativos de Playwright.
// Los 12 agentes ia4d y los 9 comandos los provee el PLUGIN (híbrido), no el workspace.
dirCountCheck('Agentes nativos Playwright en .claude/agents', '.claude/agents', 3);
// Hooks cableados
fileCheck('Hook compliance pre-flight', 'hooks/pre-flight.ts');
fileCheck('Hook PII/anti-fixme post-write', 'hooks/pii-post.ts');
fileCheck('Hook audit-write', 'hooks/audit-write.ts');
fileCheck('settings.json cablea hooks', '.claude/settings.json');
// Lógica determinística
fileCheck('POM scaffolder', 'src/pom-scaffolder.ts');
fileCheck('Compliance pre-flight (lógica)', 'src/compliance-preflight.ts');
fileCheck('PII detector', 'src/pii-detector.ts');
fileCheck('Gherkin→criteria (S2)', 'src/gherkin-to-criteria.ts');
fileCheck('Judge scoring', 'src/judge-scoring.ts');
fileCheck('Reporte ejecutivo (showcase)', 'src/scripts/build-showcase.ts');
fileCheck('Consolidador de feedback (anti-race)', 'src/scripts/consolidate-reviews.ts');
// Fase 1 token-efficiency: sustitutos determinísticos de mode-router / compliance-checker / a11y-injector
fileCheck('Resolución de módulo S1-S4 (resolve-mode)', 'src/scripts/resolve-mode.ts');
fileCheck('Gate de compliance de los commands (check-compliance)', 'src/scripts/check-compliance.ts');
fileCheck('Verificador a11y determinístico (verify-a11y)', 'src/scripts/verify-a11y.ts');
// Config declarativa
fileCheck('allowed-targets (compliance)', 'config/allowed-targets.yaml');
fileCheck('MCP playwright-test configurado (.mcp.json)', '.mcp.json');
fileCheck('playwright.config.ts', 'playwright.config.ts');

// Coherencia Playwright ↔ MCP (check #19). El planner/generator nativos corren sobre el
// runtime que lanza el MCP (`playwright`); los tests sobre `@playwright/test`. Si esas dos
// versiones no coinciden, el MCP no maneja el browser de forma consistente y el planner
// cae al fallback (no navega el DOM en vivo). Detección por lectura pura de node_modules.
const ptVer = pkgVersion('@playwright/test');
const pwVer = pkgVersion('playwright');

// --fix (opt-in): repara lo seguro ANTES de evaluar el check de browsers, para que el
// resultado y el exit code reflejen el estado ya reparado. No corre `npm ci` (borraría
// node_modules con el proceso en marcha): para el drift de versiones se reporta el comando.
if (FIX) {
  console.log('--fix: intentando reparar lo seguro (instalar chromium)...\n');
  try {
    execSync('npx --no-install playwright install chromium', { stdio: 'inherit' });
  } catch {
    console.error('--fix: falló `npx playwright install chromium` (¿Playwright instalado? corre npm ci).');
  }
  if (ptVer && pwVer && ptVer !== pwVer) {
    console.log('\n--fix: drift de versiones detectado — NO se auto-repara. Ejecuta manualmente: npm ci\n');
  }
}

let alignOk = false;
let alignDetail: string;
if (!ptVer || !pwVer) {
  alignDetail = 'Playwright no instalado en node_modules — corre: npm ci';
} else if (ptVer !== pwVer) {
  alignDetail = `@playwright/test ${ptVer} ≠ playwright ${pwVer} (runtime del MCP desalineado) — corre: npm ci`;
} else {
  alignOk = true;
  alignDetail = `@playwright/test y playwright en lockstep (${ptVer})`;
}
checks.push({ label: 'Playwright runtime ↔ @playwright/test alineados', ok: alignOk, detail: alignDetail });

const chromium = chromiumInstalled();
if (chromium === false) {
  checks.push({
    label: 'Browser chromium de Playwright instalado',
    ok: false,
    detail: 'no encontrado — corre: npx playwright install chromium (o npm run qa:fix)',
  });
} else if (chromium === true) {
  checks.push({ label: 'Browser chromium de Playwright instalado', ok: true, detail: 'chromium presente en la cache' });
}
// chromium === null → no determinable (PLAYWRIGHT_BROWSERS_PATH=0 / cache atípica): no se chequea.

// El servidor MCP arranca (check #21). Cierra el falso verde: antes el check solo veía que .mcp.json
// existía, no que el server pudiera iniciar. Si esto falla, el motor S4 no puede navegar (el planner
// fabricaría) — la guarda anti-fabricación del command lo aborta, pero esto avisa ANTES del run.
const mcp = mcpServerInvokable();
checks.push({ label: 'MCP run-test-mcp-server arranca', ok: mcp.ok, detail: mcp.detail });

// Verificación de wiring: settings.json debe registrar los 3 hooks
if (existsSync(r('.claude/settings.json'))) {
  try {
    const s = JSON.parse(readFileSync(r('.claude/settings.json'), 'utf8'));
    const wired =
      s.hooks?.PreToolUse?.length > 0 &&
      s.hooks?.PostToolUse?.length > 0 &&
      s.hooks?.Stop?.length > 0;
    checks.push({
      label: 'settings.json registra PreToolUse/PostToolUse/Stop',
      ok: !!wired,
      detail: wired ? '3 hooks cableados' : 'faltan bloques de hooks',
    });
  } catch {
    checks.push({ label: 'settings.json parseable', ok: false, detail: 'JSON inválido' });
  }
}

// Gates opcionales (informativo, no falla)
const pii = process.env.QA_ENABLE_PII === '1';
const judge = process.env.QA_ENABLE_JUDGE === '1';

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? '  OK  ' : ' FAIL '} ${c.label}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log('');
console.log(`Gates opcionales: PII=${pii ? 'ON' : 'off'}  Judge=${judge ? 'ON' : 'off'}  (toggles: QA_ENABLE_PII / QA_ENABLE_JUDGE)`);
console.log('');

if (failed.length > 0) {
  console.error(`Healthcheck FAILED: ${failed.length} comprobación(es) crítica(s) sin pasar.`);
  process.exit(1);
}
console.log(`Healthcheck OK: runtime de ia4d-qa-automator completo (${checks.length} comprobaciones).`);
