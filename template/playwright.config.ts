import { defineConfig, devices } from '@playwright/test';

// auth-handler (v0.2 Fase C): cuando el contract tiene auth.enabled, el command
// autonomous setea QA_STORAGE_STATE con la ruta del storageState. Eso activa un setup
// project que loguea una vez y un dependency que garantiza el orden bajo fullyParallel
// (sustituye al frágil --workers=1 del run manual de parabank). Sin la var → comportamiento
// idéntico al actual: sin setup project, sin storageState (sitios sin auth no se rompen).
const storageState = process.env.QA_STORAGE_STATE;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    // allure-playwright produce allure-results/; /qa-automator:report lo enriquece
    // con la evidencia del agente y genera el HTML estático (npx allure generate).
    ['allure-playwright', { resultsDir: 'allure-results', detail: true }],
  ],
  use: {
    // baseURL parametrizable por run (v0.2 Fase B): el command autonomous lo setea
    // con el --url del target. Default SauceDemo para no romper specs históricos.
    baseURL: process.env.QA_BASE_URL || 'https://www.saucedemo.com/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
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
