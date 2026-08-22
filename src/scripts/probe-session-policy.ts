#!/usr/bin/env tsx
/**
 * probe-session-policy — mide si el target permite dos sesiones simultáneas del mismo
 * usuario, y escribe el resultado en el perfil MEDIDO del sitio.
 *
 * Por qué existe: en banca, seguros y ERPs es habitual que un usuario no pueda tener dos
 * sesiones vivas. Eso no está en ningún FD, cambia cómo hay que ejecutar la suite, y si no
 * se sabe **se manifiesta como flakiness** — el peor diagnóstico posible, porque manda a
 * mirar timings en vez de concurrencia.
 *
 * Uso:
 *   tsx src/scripts/probe-session-policy.ts --style-contract=<path> --url=<URL> --confirm-intrusive
 *
 * `--confirm-intrusive` NO es ceremonia: la sonda **crea una segunda sesión** del usuario
 * de pruebas, y en un staging compartido eso puede echar a un compañero. Sin el flag
 * explica y sale con 3, para que el gate ask-first lo haga el command con la persona
 * delante — no un script.
 *
 * Exit 0 = medido y escrito. 2 = no se pudo medir. 3 = falta confirmación. 1 = uso incorrecto.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { parse as parseYaml } from 'yaml';

import { appendAuditEntry } from '../audit-log.ts';
import {
  classifySessionPolicy,
  effectiveSessionPolicy,
  shouldProbe,
  type PerfilDeSitio,
  type PoliticaDeclarada,
} from '../session-policy.ts';

const args = process.argv.slice(2);
const flag = (n: string): string | undefined =>
  args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const has = (n: string): boolean => args.includes(`--${n}`);

const contractPath = flag('style-contract');
const baseUrl = flag('url');
if (!contractPath || !baseUrl) {
  console.error('[probe-session] uso: --style-contract=<path> --url=<URL> [--confirm-intrusive] [--force]');
  process.exit(1);
}

/** Estrechado tras el gate de uso: TS no propaga el narrowing al cuerpo de main(). */
const TARGET: string = baseUrl;
const CONTRATO: string = contractPath;

const contract = (parseYaml(readFileSync(resolve(CONTRATO), 'utf8')) ?? {}) as Record<string, any>;
const siteId = basename(CONTRATO).replace(/\.ya?ml$/, '');
const auth = contract.auth ?? {};
const authEnabled = auth.enabled === true;
const declarada = auth.concurrent_sessions as PoliticaDeclarada | undefined;
const loginPath: string = auth.login_path ?? '/';
const credsIdx: number = typeof auth.credentials_ref === 'number' ? auth.credentials_ref : 0;
const creds = contract.synthetic_fixtures?.credentials?.[credsIdx] as { username?: string; password?: string } | undefined;

const perfilPath = resolve('config/site-profile', `${siteId}.json`);
const decision = shouldProbe({ authEnabled, declarada, perfilExiste: existsSync(perfilPath) });

/** Escribe el perfil y lo deja en el audit. Un dato medido que nadie consume no sirve. */
function escribirPerfil(perfil: PerfilDeSitio): void {
  mkdirSync(resolve('config/site-profile'), { recursive: true });
  writeFileSync(perfilPath, `${JSON.stringify(perfil, null, 2)}\n`, 'utf8');
  appendAuditEntry({
    source: 'command',
    action: perfil.session.serialize ? 'warn' : 'allow',
    target: `${siteId}.json`,
    rule: 'session-policy',
    reason: `${perfil.session.policy} (${perfil.session.source}) — serialize=${perfil.session.serialize}: ${perfil.session.reason}`,
    result: 'pass',
  });
  console.log(`\n  perfil escrito: ${perfilPath}`);
  console.log(`  política : ${perfil.session.policy}   (fuente: ${perfil.session.source})`);
  console.log(`  serializar la suite: ${perfil.session.serialize ? 'SÍ' : 'no'}`);
  console.log(`  motivo   : ${perfil.session.reason}\n`);
}

// Si el contract ya lo declara (o auth está off), no se sondea: se registra y punto.
if (!decision.probe && !has('force')) {
  console.log(`[probe-session] no se sondea — ${decision.reason}`);
  if (authEnabled && (declarada === 'single' || declarada === 'multiple')) {
    const eff = effectiveSessionPolicy(declarada, null);
    escribirPerfil({
      site_id: siteId,
      target_url: TARGET,
      measured_at: new Date().toISOString(),
      session: { policy: eff.policy, serialize: eff.serialize, reason: eff.reason, source: 'contract' },
    });
  }
  process.exit(0);
}

if (!has('confirm-intrusive')) {
  console.error(
    '[probe-session] ESTA SONDA ES INTRUSIVA y necesita confirmación explícita.\n' +
      `  Va a abrir DOS sesiones simultáneas del usuario '${creds?.username ?? '(sin credenciales)'}' contra ${baseUrl}.\n` +
      '  Si ese usuario lo comparten varias personas en staging, una de ellas puede perder su sesión.\n' +
      '  Se ejecuta UNA vez por sitio y el resultado queda cacheado.\n\n' +
      '  Si procede: repite el comando con --confirm-intrusive\n' +
      '  Si el QA ya sabe la respuesta: declárala en el contract (auth.concurrent_sessions: single|multiple)\n' +
      '  y no hace falta sondear nada.',
  );
  process.exit(3);
}

if (!creds?.username || !creds?.password) {
  console.error(`[probe-session] el contract no trae credenciales en synthetic_fixtures.credentials[${credsIdx}]`);
  process.exit(2);
}

const urlLogin = new URL(loginPath, TARGET).toString();

/**
 * ¿Hay sesión viva en este contexto? Se navega a la ruta de login y se mira si aparece
 * campo de contraseña. Presente → no autenticada. Deliberadamente NO se usa el
 * `success_signal` del contract: es una expresión Playwright en texto y evaluarla pediría
 * un mini-parser. Esto es genérico y no exige que la app redirija.
 */
const PRESUPUESTO_FORMULARIO_MS = 12_000;

/**
 * Espera a que el formulario de login APAREZCA, con presupuesto explicito.
 *
 * La primera version contaba `input[type=password]` justo despues de
 * `domcontentloaded`, y en OrangeHRM —una SPA en Vue— el formulario lo pinta JavaScript
 * despues de ese evento: contaba 0 y concluia «no hay formulario de login». Es
 * exactamente la clase de defecto que MF-wait-budget existe para cazar (una comprobacion
 * de disponibilidad sin presupuesto), cometida en el codigo de la propia sonda.
 *
 * Devuelve true si el formulario aparecio dentro del plazo.
 */
async function esperaFormularioDeLogin(page: Page, presupuestoMs = PRESUPUESTO_FORMULARIO_MS): Promise<boolean> {
  try {
    await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: presupuestoMs });
    return true;
  } catch {
    return false;
  }
}

async function estaAutenticada(page: Page): Promise<boolean> {
  await page.goto(urlLogin, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
  /**
   * Presupuesto CORTO a proposito: aqui la ausencia del formulario es la senal positiva
   * (sesion viva), asi que esperar 12 s por algo que no queremos ver alargaria la sonda
   * sin ganar precision. 4 s bastan tras el networkidle.
   */
  return !(await esperaFormularioDeLogin(page, 4000));
}

/** Login genérico: el campo password, el primer input visible que no lo sea, y el submit. */
async function iniciarSesion(page: Page): Promise<{ ok: boolean; rechazo?: string }> {
  await page.goto(urlLogin, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  // presupuesto LARGO: aqui el formulario es lo que se necesita, y la app es una SPA
  if (!(await esperaFormularioDeLogin(page))) {
    return { ok: false, rechazo: `no aparecio formulario de login en ${PRESUPUESTO_FORMULARIO_MS / 1000}s` };
  }
  const pass = page.locator('input[type="password"]').first();
  const user = page.locator('input:not([type="password"]):not([type="hidden"]):visible').first();
  await user.fill(creds!.username!, { timeout: 8000 }).catch(() => undefined);
  await pass.fill(creds!.password!, { timeout: 8000 }).catch(() => undefined);
  const submit = page.locator('button[type="submit"], input[type="submit"], button').first();
  await submit.click({ timeout: 8000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);

  const ok = await estaAutenticada(page);
  if (ok) return { ok: true };
  /**
   * Rechazada: se captura el literal del aviso como EVIDENCIA. Distinguir
   * `single-first-wins` de un login roto depende de este texto.
   */
  const aviso = page.locator('[role="alert"], .oxd-alert-content-text, .error, .alert').first();
  const texto = (await aviso.textContent({ timeout: 2000 }).catch(() => null))?.trim();
  return { ok: false, ...(texto ? { rechazo: texto } : {}) };
}

async function main(): Promise<number> {
  let browser: Browser | null = null;
  let ctxA: BrowserContext | null = null;
  let ctxB: BrowserContext | null = null;
  try {
    browser = await chromium.launch();
    console.log(`[probe-session] sondeando ${baseUrl} (usuario '${creds!.username}')`);

    ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const loginA = await iniciarSesion(pageA);
    if (!loginA.ok) {
      console.error(
        `[probe-session] la PRIMERA sesión no pudo autenticarse${loginA.rechazo ? `: ${loginA.rechazo}` : ''}.\n` +
          '  Sin sesión A no hay nada que medir. Revisa credenciales, login_path o el estado de la app.',
      );
      return 2;
    }
    console.log('  sesión A: autenticada');

    ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    const loginB = await iniciarSesion(pageB);
    console.log(`  sesión B: ${loginB.ok ? 'autenticada' : `rechazada${loginB.rechazo ? ` («${loginB.rechazo}»)` : ''}`}`);

    // el orden importa: A se re-comprueba DESPUÉS de que B lo intente
    const aSobrevive = await estaAutenticada(pageA);
    console.log(`  sesión A tras el login de B: ${aSobrevive ? 'sigue viva' : 'EXPULSADA'}`);

    const veredicto = classifySessionPolicy({
      aSobrevive,
      bAutenticada: loginB.ok,
      ...(loginB.rechazo ? { bRechazoTexto: loginB.rechazo } : {}),
    });

    escribirPerfil({
      site_id: siteId,
      target_url: TARGET,
      measured_at: new Date().toISOString(),
      session: { ...veredicto, source: 'probe' },
    });
    return 0;
  } catch (err) {
    console.error(`[probe-session] no se pudo medir: ${String(err instanceof Error ? err.message.split('\n')[0] : err)}`);
    return 2;
  } finally {
    await ctxA?.close().catch(() => {});
    await ctxB?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

main().then((c) => process.exit(c));
