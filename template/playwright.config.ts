import { defineConfig, devices } from '@playwright/test';

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
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    // Reporter JSON opt-in (Fase 4 token-efficiency): run-s4-mecanico.ts setea
    // PLAYWRIGHT_JSON_OUTPUT_NAME para parsear el veredicto por-test de forma determinística.
    // El reporter 'json' escribe a esa ruta él solo cuando la var existe. Sin la var → sin cambio.
    ...(process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ? ([['json']] as const) : []),
    ['html', { outputFolder: `${workDir}/playwright-report`, open: 'never' }],
    // allure-playwright produce allure-results/; /qa-automator:report lo enriquece
    // con la evidencia del agente y genera el HTML estático (npx allure generate).
    ['allure-playwright', { resultsDir: `${workDir}/allure-results`, detail: true }],
  ],
  use: {
    // baseURL parametrizable por run (v0.2 Fase B): el command autonomous lo setea
    // con el --url del target. Default SauceDemo para no romper specs históricos.
    baseURL: process.env.QA_BASE_URL || 'https://www.saucedemo.com/',
    // trace parametrizable (evidence.level: full → el command exporta QA_TRACE='on').
    // Sin la var → on-first-retry (comportamiento previo). Allure embebe el trace navegable.
    trace: (process.env.QA_TRACE as 'on' | 'off' | 'on-first-retry' | 'retain-on-failure') || 'on-first-retry',
    // evidencia visual para el reporte Allure: QA_SCREENSHOT='on' captura el estado final
    // de cada test (pase o falle) y allure-playwright lo adjunta solo. El command la setea
    // desde evidence.screenshots del contract. Sin la var → solo en fallo (comportamiento previo).
    screenshot: (process.env.QA_SCREENSHOT as 'on' | 'off' | 'only-on-failure') || 'only-on-failure',
    testIdAttribute: 'data-test',
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
