import { existsSync, readFileSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

import { proxyFromEnv } from './src/proxy-env.ts';
import { resolveBaseUrl } from './src/session-policy.ts';

// auth-handler (v0.2 Fase C): cuando el contract tiene auth.enabled, el command
// autonomous setea QA_STORAGE_STATE con la ruta del storageState. Eso activa un setup
// project que loguea una vez y un dependency que garantiza el orden bajo fullyParallel
// (sustituye al frágil --workers=1 del run manual de parabank). Sin la var → comportamiento
// idéntico al actual: sin setup project, sin storageState (sitios sin auth no se rompen).
const storageState = process.env.QA_STORAGE_STATE;

// Work dir por-sitio (v0.2): el command setea QA_WORK_DIR='.work/<site-id>' para aislar los
// artefactos de cada sitio (allure-results, test-results, report) y que runs de sitios distintos
// no se contaminen. Sin la var → '.work' (comportamiento previo, sin regresión).
const workDir = process.env.QA_WORK_DIR || '.work';

/**
 * Politica de sesiones concurrentes MEDIDA del target (`probe-session-policy`). Si la app
 * no admite dos sesiones del mismo usuario, la suite TIENE que ir en serie: en paralelo se
 * auto-invalida la sesion compartida a mitad de camino y falla de forma intermitente — y
 * eso se diagnostica como flakiness, que manda a mirar timings en vez de concurrencia.
 *
 * El site-id sale del propio QA_WORK_DIR ('.work/<site-id>'), asi que funciona igual en un
 * run del command y en un `npx playwright test` a mano. Si el perfil no existe o es
 * ilegible, no se asume nada y se mantiene el comportamiento anterior.
 */
const siteId = workDir.split(/[\/]/).filter(Boolean).pop();
interface PerfilSitio {
  target_url?: string;
  session?: { serialize?: boolean };
}
let perfilSitio: PerfilSitio | null = null;
if (siteId && siteId !== '.work') {
  const perfil = `config/site-profile/${siteId}.json`;
  if (existsSync(perfil)) {
    try {
      perfilSitio = JSON.parse(readFileSync(perfil, 'utf8')) as PerfilSitio;
    } catch {
      /* perfil ilegible: no se inventa nada */
    }
  }
}

const serializarPorSesion = process.env.QA_SERIALIZE === '1' || perfilSitio?.session?.serialize === true;
if (serializarPorSesion) {
  console.log('[playwright.config] sesion unica en el target: suite en SERIE (1 worker). Ver config/site-profile/');
}

// D45 — precedencia de la baseURL: env > perfil MEDIDO del sitio > default. La regla y el
// porque viven en src/session-policy.ts (resolveBaseUrl), con sus tests.
const resuelta = resolveBaseUrl({
  ...(process.env.QA_BASE_URL ? { envUrl: process.env.QA_BASE_URL } : {}),
  perfil: perfilSitio,
  ...(siteId ? { siteId } : {}),
  fallback: 'https://www.saucedemo.com/',
});
const baseURL = resuelta.baseUrl;
if (resuelta.warning) console.log(`[playwright.config] AVISO: ${resuelta.warning}`);

export default defineConfig({
  testDir: './tests/e2e',
  // Specs archivados por el checkpoint (Q4: fuera de la selección actual → _archive/, no se
  // borran). Nunca se ejecutan; tsconfig los excluye del typecheck por la misma razón.
  testIgnore: '**/_archive/**',
  outputDir: `${workDir}/test-results`,
  // Limpia .work/allure-results antes de cada run (allure-playwright nunca limpia: acumula
  // resultados entre corridas → el reporte mezclaría runs viejos, skipped rancios y fallos ya
  // corregidos). Determinista, aplica a todos los commands y runs manuales. No toca .allure-history.
  globalSetup: './playwright.global-setup.ts',
  fullyParallel: !serializarPorSesion,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: serializarPorSesion ? 1 : process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    // Reporter JSON opt-in (Fase 4 token-efficiency): run-s4-mecanico.ts setea
    // PLAYWRIGHT_JSON_OUTPUT_NAME para parsear el veredicto por-test de forma determinística.
    // El reporter 'json' escribe a esa ruta él solo cuando la var existe. Sin la var → sin cambio.
    ...(process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ? ([['json']] as const) : []),
    ['html', { outputFolder: `${workDir}/playwright-report`, open: 'never' }],
    // allure-playwright produce allure-results/; /ia4d-qa-automator:report lo enriquece
    // con la evidencia del agente y genera el HTML estático (npx allure generate).
    ['allure-playwright', { resultsDir: `${workDir}/allure-results`, detail: true }],
  ],
  use: {
    // baseURL parametrizable por run (v0.2 Fase B): el command autonomous lo setea
    // con el --url del target. Precedencia: QA_BASE_URL > site-profile.target_url >
    // default SauceDemo (ver D45 arriba).
    baseURL,
    /**
     * D48 — el idioma con el que se le habla a la aplicacion.
     *
     * Medido en el demo de Dolibarr (2026-08-23): la MISMA URL sirve la interfaz en
     * castellano con `Accept-Language: es-ES` y en ingles con `en-US`. Si el plan se
     * midio en un idioma y la suite pide otro, ningun literal casa — y el fallo se lee
     * como locator roto, no como diferencia de idioma.
     *
     * Sin la var no se toca nada (Playwright usa el idioma del navegador), asi que no
     * hay regresion para los sitios monolingues.
     */
    ...(process.env.QA_LOCALE ? { locale: process.env.QA_LOCALE } : {}),
    // trace parametrizable (evidence.level: full → el command exporta QA_TRACE='on').
    // Sin la var → on-first-retry (comportamiento previo). Allure embebe el trace navegable.
    trace: (process.env.QA_TRACE as 'on' | 'off' | 'on-first-retry' | 'retain-on-failure') || 'on-first-retry',
    // evidencia visual para el reporte Allure: QA_SCREENSHOT='on' captura el estado final
    // de cada test (pase o falle) y allure-playwright lo adjunta solo. El command la setea
    // desde evidence.screenshots del contract. Sin la var → solo en fallo (comportamiento previo).
    screenshot: (process.env.QA_SCREENSHOT as 'on' | 'off' | 'only-on-failure') || 'only-on-failure',
    testIdAttribute: 'data-test',
    // Proxy corporativo opt-in por entorno (HTTPS_PROXY/HTTP_PROXY + NO_PROXY para
    // hosts internos que van directo). Sin variables → undefined, sin cambio.
    proxy: proxyFromEnv(),
  },
  projects: [
    // El setup project solo existe cuando hay auth activa. testMatch aísla los *.setup.ts.
    ...(storageState ? [{ name: 'setup', testMatch: /.*\.setup\.ts/ }] : []),
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // storageState reutilizado solo cuando hay auth; el setup project lo escribe primero.
        ...(storageState ? { storageState } : {}),
      },
      // dependency garantiza setup→chromium sin --workers=1 (mata la race del .auth/*.json).
      ...(storageState ? { dependencies: ['setup'] } : {}),
    },
  ],
});
