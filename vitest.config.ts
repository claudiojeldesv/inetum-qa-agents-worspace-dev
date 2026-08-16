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
    /**
     * DEUDA DE FLAKINESS BAJO CARGA (nombrada en K0.27a, cerrada aquí con dato).
     *
     * 25 de los 48 ficheros arrancan Chromium y vitest paraleliza hasta el número
     * de CPUs, así que la primera hipótesis fue la contención. Se midió, y NO se
     * sostiene: con el tope de trabajadores en 4, tres pasadas completas dieron
     * 386/319/322 s y UN fallo — o sea, un 55% más lento que sin tope y sin dejar
     * de fallar. La hipótesis está falsada y el tope, descartado.
     *
     * Lo que sí encaja: los ficheros que caen son los que AGOTAN TIEMPOS A
     * PROPÓSITO (el estorbo que resiste el descarte quema el tope entero en cada
     * acción; el walker espera 10 s por paso por diseño). Su coste honesto en
     * solitario ronda los 40 s y el presupuesto por test eran 60. No es lentitud
     * escondida: es un presupuesto mal puesto para lo que esos tests hacen, y es el
     * mismo razonamiento por el que `hookTimeout` ya estaba en 120 s.
     *
     * Los ficheros unitarios tardan milisegundos, así que un tope alto no les
     * cuesta nada: solo cambia cuánto tarda en rendirse algo que ya está roto.
     */
    testTimeout: 120_000,
  },
});
