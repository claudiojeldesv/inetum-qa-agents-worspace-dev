import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'copilot/tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules', 'docs/spike/artifacts'],
    environment: 'node',
    globals: false,
    /**
     * Los suites de copilot/tests arrancan Chromium en beforeAll y lo cierran en
     * afterAll. Con dos ficheros de navegador en paralelo, el `browser.close()`
     * pasaba de los 10 s por defecto y tumbaba el suite con todos sus tests en
     * verde. El timeout de hook no es una tirita: cerrar un navegador bajo
     * contención tarda, y no es un fallo del código bajo prueba.
     */
    hookTimeout: 120_000,
  },
});
