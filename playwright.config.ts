/**
 * Playwright config para ia4d-test-pilot.
 *
 * El runner sirve exclusivamente para ejecutar los `.spec.ts` que
 * `/test-pilot:generate` materializa. Vive en root porque Playwright lo
 * busca ahí por convención.
 *
 * - testDir: `output/generate/` refleja el out-dir default del command.
 *   El wrapper `hooks/run-playwright.ts` invoca `playwright test <dir>`
 *   pasando el dir como positional arg si el SDET generó en otra ruta —
 *   eso sobrescribe `testDir` sin tocar el config.
 * - testMatch: solo specs con sufijo .spec.ts. Vitest vive en
 *   tests/unit y tests/integration con sufijo .test.ts y su propio
 *   runner; el testMatch aísla a Playwright para que no coja
 *   accidentalmente los tests de vitest.
 * - Sin baseURL: los specs generados usan URLs absolutas
 *   (`https://www.saucedemo.com/`). baseURL fuerza confusión si el
 *   Generator emite paths relativos.
 * - 1 worker, headless, sin trace/video/screenshot: determinismo y
 *   tiempo de corrida acotado para el demo MVP.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: process.env.TEST_PILOT_TESTDIR ?? './output/generate',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'list',
  use: {
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
