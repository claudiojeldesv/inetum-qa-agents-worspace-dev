/**
 * F0 del plan CLI-en-vez-de-MCP — LA PUERTA del playwright-cli.
 *
 * `npx playwright cli` (1.60, dentro de playwright-core) tiene la misma
 * superficie que el MCP pero con snapshots a fichero: el candidato natural para
 * el respondedor de rescate y el recon. El problema es de compliance: el hook
 * pre-flight matchea `mcp__playwright-test__.*`, así que un
 * `Bash(playwright-cli goto <url>)` NO LO VE NADIE y el allowlist (regla dura
 * #3, sin override) quedaría roto por el camino nuevo.
 *
 * Parsear cadenas de shell arbitrarias en el hook sería fail-open ante
 * ofuscación — inaceptable. La forma del producto es la contraria y ya existe
 * en `check-compliance.ts`: UN punto de entrada sancionado que verifica ANTES
 * de ejecutar. Este script es ese punto para el CLI. El playwright-cli crudo
 * queda para investigación local; el producto entra por aquí.
 *
 * Qué garantiza (fail-closed en todas):
 *   1. Toda URL de `open`/`goto`/`tab-new` pasa por `runPreflight` (el MISMO
 *      verificador del hook, importado, no duplicado) antes de que el CLI la
 *      vea. Bloqueada → exit 2 y nada se ejecuta.
 *   2. Los comandos de acción (click, fill, snapshot…) solo corren sobre una
 *      sesión que ESTE wrapper abrió (marcador en `.work/browse/<sesión>/`):
 *      nunca se opera un navegador que no pasó por la puerta.
 *   3. `attach`, `--cdp` y `--extension` están prohibidos: conectan con un
 *      navegador externo cuyo historial de navegación nadie verificó.
 *      `run-code` también: es la API Playwright completa (incluido
 *      `page.goto`) sin verificación posible de URL.
 *   4. `--browser` solo admite los engines empaquetados (chromium/firefox/
 *      webkit) — el default del CLI busca el canal `chrome` del SISTEMA, que
 *      ni está instalado ni está auditado. Si no se pide engine, se inyecta
 *      chromium.
 *   5. Los artefactos (`.playwright-cli/`) caen bajo `.work/browse/<sesión>/`
 *      (el CLI escribe relativo al cwd del cliente): efímero y fuera de git.
 *   6. Cada invocación queda en el audit-log con su veredicto, como el gate
 *      de compliance.
 *
 * Residual documentado (paridad con el MCP, no regresión): `eval` puede
 * navegar vía `location.href` igual que `browser_evaluate` puede hoy por el
 * camino MCP. Se permite por la misma razón (el recon lo necesita para
 * literales) y con el mismo residual. Cerrarlo de verdad es trabajo del hook
 * para AMBOS transportes, no de esta puerta.
 *
 * Exit: 0 ejecutado · 2 bloqueado por la puerta (convención del gate) · 1 uso/IO.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { runPreflight, type PreflightResult } from '../compliance-preflight.ts';
import { appendAuditEntry } from '../audit-log.ts';

/** Comandos que llevan URL como positional: se verifica CADA una. */
const CON_URL: ReadonlySet<string> = new Set(['open', 'goto', 'tab-new']);

/**
 * Prohibidos SIEMPRE, con su motivo pegado (el mensaje de bloqueo lo enseña):
 * la puerta no confía en que el lector recuerde el porqué.
 */
const PROHIBIDOS: ReadonlyMap<string, string> = new Map([
  ['attach', 'conecta con un navegador externo cuya navegación nadie verificó'],
  ['run-code', 'API Playwright completa (page.goto incluido) sin verificación de URL posible'],
]);

/** Flags que prohíben por sí solos, aparezcan donde aparezcan. */
const FLAGS_PROHIBIDOS: ReadonlyArray<{ prefijo: string; motivo: string }> = [
  { prefijo: '--cdp', motivo: 'endpoint CDP externo: navegador fuera de la puerta' },
  { prefijo: '--extension', motivo: 'navegador del usuario vía extensión: fuera de la puerta' },
  { prefijo: '--profile', motivo: 'perfil en ruta arbitraria: los artefactos deben vivir bajo .work/' },
  { prefijo: '--persistent', motivo: 'perfil persistente en ubicación del CLI: fuera de .work/' },
];

const ENGINES_PERMITIDOS: ReadonlySet<string> = new Set(['chromium', 'firefox', 'webkit']);

export interface PlanEjecutar {
  veredicto: 'ejecutar';
  /** argv final que se delega a `npx playwright cli` (con -s= y --browser inyectados). */
  args: string[];
  sesion: string;
  /** URLs verificadas (vacío en comandos de acción). */
  urls: string[];
  /** true si este comando ABRE la sesión (open): main crea el marcador. */
  abreSesion: boolean;
  /** true si la cierra (close / delete-data): main retira el marcador. */
  cierraSesion: boolean;
}
export interface PlanBloquear {
  veredicto: 'bloquear';
  regla: string;
  razon: string;
}
export type PlanBrowse = PlanEjecutar | PlanBloquear;

export interface PlanInput {
  argv: string[];
  /** Inyectable en tests; en main es runPreflight de verdad. */
  verificarUrl: (url: string) => PreflightResult;
  /** ¿Existe el marcador de sesión del wrapper? Inyectable en tests. */
  sesionAbierta: (sesion: string) => boolean;
}

/** `-s=x` / `--session=x` en cualquier posición; default 'default' como el CLI. */
function extraerSesion(argv: string[]): { sesion: string; resto: string[] } {
  const resto: string[] = [];
  let sesion = 'default';
  for (const a of argv) {
    const m = /^(?:-s|--session)=(.+)$/.exec(a);
    if (m) sesion = m[1];
    else resto.push(a);
  }
  return { sesion, resto };
}

function esUrl(s: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s);
}

export function planBrowse(i: PlanInput): PlanBrowse {
  const { sesion, resto } = extraerSesion(i.argv);
  // El comando es el primer positional que NO es flag: `--raw`, `--json` y
  // demás globales del CLI pueden precederlo (`--raw eval "…"`). Encontrado en
  // uso durante A/B-2: tomar resto[0] a ciegas rechazaba invocaciones legítimas.
  const iCmd = resto.findIndex((a) => !a.startsWith('-'));
  const comando = iCmd >= 0 ? resto[iCmd] : undefined;
  if (!comando) {
    return { veredicto: 'bloquear', regla: 'uso', razon: 'falta el comando (open|goto|click|…)' };
  }

  for (const a of resto) {
    for (const f of FLAGS_PROHIBIDOS) {
      if (a.startsWith(f.prefijo)) return { veredicto: 'bloquear', regla: 'flag-prohibido', razon: `${a}: ${f.motivo}` };
    }
  }
  const motivoProhibido = PROHIBIDOS.get(comando);
  if (motivoProhibido) return { veredicto: 'bloquear', regla: 'comando-prohibido', razon: `${comando}: ${motivoProhibido}` };

  // --- comandos con URL: verificar TODAS antes de tocar nada -----------------
  const urls: string[] = [];
  if (CON_URL.has(comando)) {
    for (const a of resto.slice(iCmd + 1)) {
      if (a.startsWith('-')) continue;
      if (!esUrl(a)) {
        // Fail-closed: un positional que no parsea como URL en un comando de
        // navegación no se "deja pasar a ver qué hace el CLI con él".
        return { veredicto: 'bloquear', regla: 'url-ilegible', razon: `'${a}' no parsea como URL: no se verifica, no se ejecuta` };
      }
      urls.push(a.startsWith('http') ? a : `https://${a}`);
    }
    if (comando === 'goto' && urls.length === 0) {
      return { veredicto: 'bloquear', regla: 'uso', razon: 'goto exige URL' };
    }
    for (const u of urls) {
      const v = i.verificarUrl(u);
      if (v.verdict === 'block') {
        return { veredicto: 'bloquear', regla: v.rule ?? 'allowlist', razon: `${u}: ${v.reason ?? 'fuera del allowlist'}` };
      }
    }
  }

  // --- engine: solo empaquetados; sin petición → chromium (el default del CLI
  // busca el canal chrome del sistema, que no está ni instalado ni auditado) ---
  const args = [...resto];
  if (comando === 'open') {
    const idx = args.findIndex((a) => a.startsWith('--browser'));
    if (idx >= 0) {
      const engine = args[idx].split('=')[1] ?? '';
      if (!ENGINES_PERMITIDOS.has(engine)) {
        return { veredicto: 'bloquear', regla: 'engine', razon: `--browser=${engine}: solo ${[...ENGINES_PERMITIDOS].join('/')} (canales del sistema no auditados)` };
      }
    } else {
      args.splice(iCmd + 1, 0, '--browser=chromium');
    }
  } else if (comando !== 'goto' || !i.sesionAbierta(sesion)) {
    // Todo lo que no es `open` opera sobre una sesión existente: exigir que la
    // abriera ESTE wrapper. (`goto` con sesión del wrapper ya se verificó
    // arriba; `goto` sin sesión cae aquí y se bloquea igual que un click.)
    if (!i.sesionAbierta(sesion)) {
      return {
        veredicto: 'bloquear',
        regla: 'sesion-ajena',
        razon: `la sesión '${sesion}' no la abrió qa:browse: abre primero con 'qa:browse -- open <url>'`,
      };
    }
  }

  return {
    veredicto: 'ejecutar',
    args: [`-s=${sesion}`, ...args],
    sesion,
    urls,
    abreSesion: comando === 'open',
    cierraSesion: comando === 'close' || comando === 'delete-data',
  };
}

// ------------------------------------------------------------------ main ----

function main(): void {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  const marcador = (s: string) => resolve('.work', 'browse', s, 'session.json');
  const plan = planBrowse({
    argv,
    verificarUrl: (u) => runPreflight(u),
    sesionAbierta: (s) => existsSync(marcador(s)),
  });

  if (plan.veredicto === 'bloquear') {
    appendAuditEntry({
      source: 'pre-flight',
      action: 'block',
      target: argv.join(' '),
      rule: plan.regla,
      reason: plan.razon,
      result: 'exit_2',
      metadata: { phase: 'browse' },
    });
    console.error(`[qa:browse] BLOQUEADO (${plan.regla}): ${plan.razon}`);
    process.exit(2);
  }

  // cwd por sesión: el CLI escribe `.playwright-cli/` relativo al cwd del
  // cliente, así que TODO artefacto cae bajo .work/browse/<sesión>/ (gitignored).
  const dir = resolve('.work', 'browse', plan.sesion);
  mkdirSync(dir, { recursive: true });

  /**
   * Se invoca el cli.js de Playwright con `node`, sin shell y sin npx. Medido en
   * A/B-2: con `shell: true` cmd.exe RE-PARSEA los argumentos y un `eval` con
   * espacios o `|` llega partido (el `|` se interpretaba como pipe del shell);
   * y sin shell, Node 20+ se niega a lanzar el `.cmd` de npx. Llamar al JS
   * directamente hace que los argumentos viajen VERBATIM, que es lo que un
   * `eval` necesita. `cli.js` se resuelve desde este módulo, no desde el cwd,
   * porque el cwd es el directorio de la sesión.
   */
  const cliJs = fileURLToPath(new URL('../../node_modules/@playwright/test/cli.js', import.meta.url));
  const r = spawnSync(process.execPath, [cliJs, 'cli', ...plan.args], { cwd: dir, stdio: 'inherit' });

  if (plan.abreSesion && r.status === 0) {
    writeFileSync(marcador(plan.sesion), JSON.stringify({ sesion: plan.sesion, abierta: new Date().toISOString(), urls: plan.urls }, null, 2), 'utf8');
  }
  if (plan.cierraSesion) rmSync(marcador(plan.sesion), { force: true });

  appendAuditEntry({
    source: 'pre-flight',
    action: 'allow',
    target: plan.args.join(' '),
    reason: plan.urls.length > 0 ? `URLs verificadas: ${plan.urls.join(', ')}` : 'comando de acción sobre sesión del wrapper',
    result: r.status === 0 ? 'exit_0' : 'fail',
    metadata: { phase: 'browse', sesion: plan.sesion },
  });
  process.exit(r.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
