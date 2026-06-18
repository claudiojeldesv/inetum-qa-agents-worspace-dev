import { defineConfig, devices } from '@playwright/test';

// auth-handler (v0.2 Fase C): cuando el contract tiene auth.enabled, el command
// autonomous setea QA_STORAGE_STATE con la ruta del storageState. Eso activa un setup
// project que loguea una vez y un dependency que garantiza el orden bajo fullyParallel
// (sustituye al frágil --workers=1 del run manual de parabank). Sin la var → comportamiento
// idéntico al actual: sin setup project, sin storageState (sitios sin auth no se rompen).
const storageState = process.env.QA_STORAGE_STATE;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '.work/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: '.work/playwright-report', open: 'never' }],
    // allure-playwright produce allure-results/; /qa-automator:report lo enriquece
    // con la evidencia del agente y genera el HTML estático (npx allure generate).
    ['allure-playwright', { resultsDir: '.work/allure-results', detail: true }],
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
