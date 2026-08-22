#!/usr/bin/env node
/**
 * verify-locators — guarda determinística de locators del discovery (Q2.1 quality-greens).
 *
 * Tras el discovery, resuelve cada locator del discovery-report.json contra el DOM real
 * (chromium headless, `locator.count()`) y anota el reporte in-place:
 *   - `verified: true`  → el locator resuelve a EXACTAMENTE un elemento (usable en strict mode).
 *   - `verified: false` → no resuelve (`not-found`), resuelve a varios (`ambiguous(n)`) o el
 *     locator es inválido. El Writer tiene PROHIBIDO usarlo tal cual sin TODO.
 *   - `verified: null`  → no se pudo verificar (pantalla inalcanzable / sin url_pattern) —
 *     estado desconocido, tratamiento legacy.
 *
 * Mata dos clases de rojos medidas: el gap del discovery en cart (F4, `getByRole('generic')`
 * ambiguo) y los locators por convención de Q1 (heading asumido vs `data-test` real) — el
 * locator fantasma muere antes de llegar al Writer. Coste: una pasada de navegador sin LLM.
 *
 * Pantallas tras login: bootstrap de sesión contract-driven (sin LLM) — si una pantalla
 * redirige y el contract declara `synthetic_fixtures.credentials`, se rellena el formulario
 * de login detectado en el propio discovery (campo password + textbox usuario + botón submit)
 * y se reintenta UNA vez. `session_bootstrap` queda en el summary.
 *
 * Uso:  tsx src/scripts/verify-locators.ts --report=<workDir>/discovery-report.json --url=<base>
 *       [--style-contract=<path>] [--test-id-attribute=<attr>] [--out=<workDir>/locator-verify.json]
 * Salida: JSON por stdout (summary). Exit 0 = pasada completada (haya o no unverified — la
 * guarda es la anotación, no un gate); exit 1 = error de uso/infra.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { chromium, selectors, type Page } from '@playwright/test';

import { appendAuditEntry } from '../audit-log.ts';
import { resolveAppUrl, appPathname } from '../app-url.ts';
import { proxyFromEnv } from '../proxy-env.ts';

// ---------------------------------------------------------------------------
// Tipos (espejo de pom-scaffolder + anotaciones de verificación)
// ---------------------------------------------------------------------------

export interface DiscoveryElement {
  role?: string;
  name?: string;
  test_id?: string;
  label?: string;
  verified?: boolean | null;
  verify_reason?: string;
  dom_matches?: number;
  /**
   * Atributo del que salio `test_id`. Lo declara el discovery-analyzer y, si no lo hizo o
   * lo hizo mal, lo RESCATA esta herramienta preguntandole al DOM (D34, iteracion 2 del
   * loop): el analyzer declaro el campo en 18/18 elementos con un prompt y en 0/31 con el
   * mismo prompt en la corrida siguiente.
   */
  test_id_attr?: string;
  /** De donde salio `test_id_attr`: util para auditar quien acerto. */
  test_id_attr_source?: string;
}

interface DiscoveryScreen {
  name: string;
  url_pattern?: string;
  /** URL absoluta donde el walker capturó la pantalla — evidencia independiente
   *  para el check de reachability (nunca comparar contra un valor recomputado
   *  por el mismo código que navega). */
  source_url?: string;
  interactive_elements?: DiscoveryElement[];
  components?: string[];
  dom_verified?: boolean | null;
  dom_final_url?: string;
}

interface DiscoveryComponent {
  name: string;
  interactive_elements?: DiscoveryElement[];
}

export type LocatorSpec =
  | { kind: 'testId'; testId: string }
  | { kind: 'roleName'; role: string; name: string }
  | { kind: 'label'; label: string }
  | { kind: 'text'; text: string }
  | { kind: 'role'; role: string };

/** Misma prioridad que renderLocator del pom-scaffolder: test_id → role+name → label → role.
 *  role 'text' (business_text de expect_text, K0.2): texto plano sin rol ARIA → getByText. */
export function locatorSpecFor(el: DiscoveryElement): LocatorSpec {
  if (el.test_id) return { kind: 'testId', testId: el.test_id };
  if (el.role === 'text' && el.name) return { kind: 'text', text: el.name };
  if (el.role && el.name) return { kind: 'roleName', role: el.role, name: el.name };
  if (el.label) return { kind: 'label', label: el.label };
  return { kind: 'role', role: el.role ?? 'generic' };
}

function applyLocator(page: Page, spec: LocatorSpec) {
  switch (spec.kind) {
    case 'testId':
      return page.getByTestId(spec.testId);
    case 'roleName':
      return page.getByRole(spec.role as never, { name: spec.name });
    case 'label':
      return page.getByLabel(spec.label);
    case 'text':
      return page.getByText(spec.text);
    case 'role':
      return page.getByRole(spec.role as never);
  }
}

// ---------------------------------------------------------------------------
// Helpers deterministas (unit-testeables sin navegador)
// ---------------------------------------------------------------------------

/** testIdAttribute del playwright.config.ts del workspace (default Playwright: data-testid). */
export function parseTestIdAttribute(configSource: string): string | null {
  const m = /testIdAttribute\s*:\s*['"]([^'"]+)['"]/.exec(configSource);
  return m ? m[1] : null;
}

/** Pathname normalizado de un url_pattern (relativo A LA BASE DE LA APP, o URL
 *  absoluta). Resuelve vía app-url: `new URL('/x', base)` descartaría el context
 *  path de la base (bug apps Java corporativas bajo subruta). */
export function pathnameOf(pattern: string, base: string): string {
  return appPathname(base, pattern);
}

export interface LoginForm {
  screen: string;
  user: DiscoveryElement;
  password: DiscoveryElement;
  submit: DiscoveryElement;
}

const PASSWORD_RX = /pass(word)?|contrasena|contraseña|clave/i;
const USER_RX = /user(name)?|email|correo|login|usuario|dni|nif/i;
const SUBMIT_RX = /log[ -]?in|sign[ -]?in|submit|entrar|acceder|iniciar|continuar/i;

function elText(el: DiscoveryElement): string {
  return [el.test_id, el.name, el.label].filter(Boolean).join(' ');
}

/** Detecta el formulario de login en las pantallas del discovery (heurística sin LLM). */
export function findLoginForm(screens: Array<{ name: string; interactive_elements?: DiscoveryElement[] }>): LoginForm | null {
  for (const screen of screens) {
    const els = screen.interactive_elements ?? [];
    const password = els.find((e) => PASSWORD_RX.test(elText(e)));
    if (!password) continue;
    const user =
      els.find((e) => e !== password && USER_RX.test(elText(e))) ??
      els.find((e) => e !== password && e.role === 'textbox');
    const submit =
      els.find((e) => e.role === 'button' && SUBMIT_RX.test(elText(e))) ??
      els.find((e) => e.role === 'button');
    if (user && submit) return { screen: screen.name, user, password, submit };
  }
  return null;
}

export interface Credentials {
  username: string;
  password: string;
}

/** Primer credential del contract (array) o el referenciado por auth.credentials_ref (objeto). */
export function credentialsFromContract(contract: Record<string, any>): Credentials | null {
  const creds = contract?.synthetic_fixtures?.credentials;
  if (Array.isArray(creds)) {
    const c = creds[0];
    return c?.username && c?.password ? { username: String(c.username), password: String(c.password) } : null;
  }
  if (creds && typeof creds === 'object') {
    const ref = contract?.auth?.credentials_ref;
    const c = (ref && creds[ref]) || Object.values(creds)[0];
    return c && (c as any).username ? { username: String((c as any).username), password: String((c as any).password) } : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Verificación contra el DOM real
// ---------------------------------------------------------------------------

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
}

/**
 * Atributos candidatos cuando un `test_id` no resuelve como testId. Orden deliberado:
 * los dos que el scaffolder sabe emitir como css-fallback primero.
 */
const ATRIBUTOS_CANDIDATOS = ['id', 'name', 'data-testid', 'data-test', 'data-qa', 'data-cy'];

/**
 * El DOM dice de qué atributo salió realmente el `test_id`.
 *
 * D34 volvió en la iteración 2 del loop (2026-08-22) y por un motivo importante: el arreglo
 * del lado productor era PROSA en el prompt del discovery-analyzer, y con el prompt idéntico
 * declaró `test_id_attr` en 18 de 18 elementos en una corrida y en **0 de 31** en la
 * siguiente. Una instrucción que se cumple o no según la tirada no es un arreglo.
 *
 * Aquí no hace falta que nadie se acuerde: si `getByTestId(x)` no encuentra nada pero
 * `[id="x"]` encuentra exactamente uno, el atributo de origen es `id` y se anota. El
 * scaffolder ya respeta `test_id_attr`, así que la cadena se autocorrige sola.
 *
 * Solo se acepta un candidato que resuelva a UN elemento: dos coincidencias no identifican
 * nada y volverían a producir un locator ambiguo.
 */
/** Lo minimo que hace falta para sondear el DOM. `Page` de Playwright lo satisface. */
export interface SondaDom {
  locator(selector: string): { count(): Promise<number> };
}

export async function rescatarAtributoDeTestId(
  page: SondaDom,
  valor: string,
  testIdAttribute: string,
): Promise<{ attr: string } | null> {
  for (const attr of ATRIBUTOS_CANDIDATOS) {
    if (attr === testIdAttribute) continue; // ese es el que ya falló
    const sel = `[${attr}="${valor.replace(/"/g, '\\"')}"]`;
    try {
      if ((await page.locator(sel).count()) === 1) return { attr };
    } catch {
      /* selector inválido para este valor: se prueba el siguiente */
    }
  }
  return null;
}

async function checkElement(page: Page, el: DiscoveryElement, testIdAttribute: string): Promise<void> {
  const spec = locatorSpecFor(el);
  try {
    let count = await applyLocator(page, spec).count();

    // D34: el test_id no resuelve como testId → preguntarle al DOM de dónde salió
    if (count === 0 && el.test_id && spec.kind === 'testId') {
      const rescate = await rescatarAtributoDeTestId(page, el.test_id, testIdAttribute);
      if (rescate) {
        el.test_id_attr = rescate.attr;
        el.test_id_attr_source = 'verify-locators: resuelto contra el DOM real';
        count = 1;
      }
    }

    el.dom_matches = count;
    if (count === 1) {
      el.verified = true;
      delete el.verify_reason;
    } else {
      el.verified = false;
      el.verify_reason = count === 0 ? 'not-found' : `ambiguous(${count})`;
    }
  } catch (err) {
    el.verified = false;
    el.verify_reason = `invalid-locator: ${err instanceof Error ? err.message.split('\n')[0] : err}`;
  }
}

function markUnknown(els: DiscoveryElement[], reason: string): void {
  for (const el of els) {
    el.verified = null;
    el.verify_reason = reason;
  }
}

interface VerifyOptions {
  baseUrl: string;
  credentials: Credentials | null;
  /** El del playwright.config del workspace: define que atributo SI vale para getByTestId. */
  testIdAttribute: string;
}

export interface VerifySummary {
  base_url: string;
  test_id_attribute: string;
  session_bootstrap: 'none' | 'applied' | 'failed' | 'unavailable';
  screens: Array<{ name: string; reachable: boolean | null; elements: number; verified: number; unverified: number }>;
  components_verified_on: Record<string, string>;
  totals: { elements: number; verified: number; unverified: number; unknown: number };
}

async function bootstrapSession(page: Page, form: LoginForm, creds: Credentials, screens: DiscoveryScreen[], baseUrl: string): Promise<void> {
  const loginScreen = screens.find((s) => s.name === form.screen);
  await page.goto(resolveAppUrl(baseUrl, loginScreen?.url_pattern ?? '/'), { waitUntil: 'load', timeout: 20000 });
  await applyLocator(page, locatorSpecFor(form.user)).fill(creds.username, { timeout: 5000 });
  await applyLocator(page, locatorSpecFor(form.password)).fill(creds.password, { timeout: 5000 });
  await applyLocator(page, locatorSpecFor(form.submit)).click({ timeout: 5000 });
  await page.waitForLoadState('load', { timeout: 10000 });
}

async function verifyDiscovery(
  report: { screens?: DiscoveryScreen[]; components?: DiscoveryComponent[] },
  page: Page,
  opts: VerifyOptions,
): Promise<VerifySummary['session_bootstrap']> {
  const screens = report.screens ?? [];
  const components = report.components ?? [];
  const loginForm = findLoginForm(screens);
  const componentsPending = new Set(components.map((c) => c.name));
  let bootstrap: VerifySummary['session_bootstrap'] = 'none';

  for (const screen of screens) {
    const els = screen.interactive_elements ?? [];
    if (!screen.url_pattern) {
      screen.dom_verified = null;
      markUnknown(els, 'no-url-pattern');
      continue;
    }

    const target = resolveAppUrl(opts.baseUrl, screen.url_pattern);
    // Evidencia del walker (source_url) manda sobre el pattern recomputado: si el
    // adapter y este script compartieran un mismo error de resolución, comparar
    // pattern-contra-pattern lo taparía (falso reachable, como pasó con /login.do).
    const expectedPath = pathnameOf(screen.source_url ?? screen.url_pattern, opts.baseUrl);
    let landedPath: string;
    try {
      await page.goto(target, { waitUntil: 'load', timeout: 20000 });
      await settle(page);
      landedPath = pathnameOf(page.url(), opts.baseUrl);
    } catch {
      landedPath = '(goto-failed)';
    }

    // Redirigida (típicamente auth) → bootstrap de sesión contract-driven, un intento por run
    if (landedPath !== expectedPath && bootstrap === 'none') {
      if (loginForm && opts.credentials) {
        try {
          await bootstrapSession(page, loginForm, opts.credentials, screens, opts.baseUrl);
          bootstrap = 'applied';
        } catch {
          bootstrap = 'failed';
        }
      } else {
        bootstrap = 'unavailable';
      }
      if (bootstrap === 'applied') {
        try {
          await page.goto(target, { waitUntil: 'load', timeout: 20000 });
          await settle(page);
          landedPath = pathnameOf(page.url(), opts.baseUrl);
        } catch {
          landedPath = '(goto-failed)';
        }
      }
    }

    screen.dom_final_url = page.url();
    if (landedPath !== expectedPath) {
      screen.dom_verified = false;
      markUnknown(els, 'screen-unreachable');
      continue;
    }

    screen.dom_verified = true;
    for (const el of els) await checkElement(page, el, opts.testIdAttribute);

    // Components referenciados por esta pantalla: se verifican aquí (primera pantalla que los usa)
    for (const compName of screen.components ?? []) {
      if (!componentsPending.has(compName)) continue;
      componentsPending.delete(compName);
      const comp = components.find((c) => c.name === compName)!;
      for (const el of comp.interactive_elements ?? []) await checkElement(page, el, opts.testIdAttribute);
    }
  }

  for (const compName of componentsPending) {
    const comp = components.find((c) => c.name === compName)!;
    markUnknown(comp.interactive_elements ?? [], 'no-screen-references-component');
  }
  return bootstrap;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function flagValue(args: string[], name: string): string | undefined {
  return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function resolveTestIdAttribute(explicit: string | undefined): string {
  if (explicit) return explicit;
  const configPath = resolve(process.cwd(), 'playwright.config.ts');
  if (existsSync(configPath)) {
    const parsed = parseTestIdAttribute(readFileSync(configPath, 'utf8'));
    if (parsed) return parsed;
  }
  return 'data-testid';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reportPath = flagValue(args, 'report');
  const baseUrl = flagValue(args, 'url');
  if (!reportPath || !baseUrl) {
    console.error(
      '[verify-locators] uso: tsx src/scripts/verify-locators.ts --report=<discovery-report.json> --url=<base> [--style-contract=<path>] [--test-id-attribute=<attr>] [--out=<path>]',
    );
    process.exit(1);
  }
  const reportAbs = resolve(process.cwd(), reportPath);
  if (!existsSync(reportAbs)) {
    console.error(`[verify-locators] no existe el reporte: ${reportPath}`);
    process.exit(1);
  }

  const contractPath = flagValue(args, 'style-contract');
  const contract =
    contractPath && existsSync(resolve(process.cwd(), contractPath))
      ? ((parseYaml(readFileSync(resolve(process.cwd(), contractPath), 'utf8')) as Record<string, any>) ?? {})
      : {};

  const testIdAttribute = resolveTestIdAttribute(flagValue(args, 'test-id-attribute'));
  selectors.setTestIdAttribute(testIdAttribute);

  const report = JSON.parse(readFileSync(reportAbs, 'utf8'));
  const browser = await chromium.launch({ headless: true, proxy: proxyFromEnv() });
  let bootstrap: VerifySummary['session_bootstrap'] = 'none';
  try {
    const page = await browser.newPage();
    bootstrap = await verifyDiscovery(report, page, {
      baseUrl,
      credentials: credentialsFromContract(contract),
      testIdAttribute,
    });
  } finally {
    await browser.close();
  }

  // Anotación in-place: el scaffolder y el Writer leen el mismo discovery-report anotado
  writeFileSync(reportAbs, JSON.stringify(report, null, 2) + '\n', 'utf8');

  const allElements: DiscoveryElement[] = [
    ...(report.screens ?? []).flatMap((s: DiscoveryScreen) => s.interactive_elements ?? []),
    ...(report.components ?? []).flatMap((c: DiscoveryComponent) => c.interactive_elements ?? []),
  ];
  const summary: VerifySummary = {
    base_url: baseUrl,
    test_id_attribute: testIdAttribute,
    session_bootstrap: bootstrap,
    screens: (report.screens ?? []).map((s: DiscoveryScreen) => {
      const els = s.interactive_elements ?? [];
      return {
        name: s.name,
        reachable: s.dom_verified ?? null,
        elements: els.length,
        verified: els.filter((e) => e.verified === true).length,
        unverified: els.filter((e) => e.verified === false).length,
      };
    }),
    components_verified_on: Object.fromEntries(
      (report.components ?? []).map((c: DiscoveryComponent) => [
        c.name,
        (c.interactive_elements ?? []).every((e) => e.verified === null) ? '(sin pantalla)' : 'verificado',
      ]),
    ),
    totals: {
      elements: allElements.length,
      verified: allElements.filter((e) => e.verified === true).length,
      unverified: allElements.filter((e) => e.verified === false).length,
      unknown: allElements.filter((e) => e.verified === null || e.verified === undefined).length,
    },
  };

  const outPath = resolve(process.cwd(), flagValue(args, 'out') ?? resolve(dirname(reportAbs), 'locator-verify.json'));
  writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  appendAuditEntry(
    {
      source: 'command',
      action: summary.totals.unverified === 0 ? 'allow' : 'warn',
      target: basename(reportAbs),
      rule: 'locator-verification',
      reason:
        `verify-locators contra ${baseUrl}: ${summary.totals.verified}/${summary.totals.elements} verificados, ` +
        `${summary.totals.unverified} unverified (prohibidos para el Writer sin TODO), ${summary.totals.unknown} sin verificar`,
      result: 'pass',
      metadata: { session_bootstrap: bootstrap, totals: summary.totals },
    },
    resolve(dirname(reportAbs), 'audit-log.json'),
  );

  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('verify-locators.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main().catch((err) => {
    console.error(`[verify-locators] error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
