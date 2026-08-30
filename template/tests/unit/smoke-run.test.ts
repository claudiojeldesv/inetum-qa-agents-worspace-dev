/**
 * G2 — el clasificador de rojos del smoke run.
 *
 * La separación es la razón de existir de la herramienta: un rojo de locator lo
 * arregla el Writer; un rojo de aserción es posible defecto del PRODUCTO y el
 * Writer NO lo toca. Si el clasificador confundiera las clases, el gate le
 * enseñaría al Writer a escribir tests que pasan — peor que no tener gate. Los
 * mensajes de la tabla son formas reales del reporter de Playwright.
 */
import { describe, it, expect } from 'vitest';

import { clasificarReporte, clasificarRojo } from '../../src/scripts/smoke-run.ts';

describe('clasificarRojo — la tabla, con mensajes reales de Playwright', () => {
  const ASERCION = [
    "Error: expect(locator).toBeVisible() failed\n\nLocator: getByText('Records Found')\nExpected: visible\nTimeout: 5000ms",
    "Error: expect(received).toBe(expected) // Object.is equality\n\nExpected: 3\nReceived: 2",
    'Error: Timed out 5000ms waiting for expect(locator).toHaveText(expected)',
    "expect(locator).toHaveValue(expected) failed\nLocator: getByLabel('Amount')",
  ];
  const LOCATOR = [
    "Error: strict mode violation: getByRole('link', { name: 'Ref.' }) resolved to 2 elements",
    'locator.click: Timeout 10000ms exceeded.\nCall log:\n  - waiting for locator',
    "locator.fill: Timeout 10000ms exceeded.\n  - waiting for getByLabel('Username')",
    'locator.click: Target closed',
    '<div class="oxd-form-loader"> intercepts pointer events',
  ];

  it('cada aserción fallida es del PRODUCTO, no del Writer', () => {
    for (const m of ASERCION) expect(clasificarRojo(m), m.slice(0, 60)).toBe('asercion');
  });

  it('cada fallo de resolución/acción es del Writer', () => {
    for (const m of LOCATOR) expect(clasificarRojo(m), m.slice(0, 60)).toBe('locator');
  });

  it('EL BORDE que decide todo: un expect que expira menciona «waiting for» y AUN ASÍ es aserción', () => {
    // clasificarlo como locator mandaría al Writer a «arreglar» un oráculo —
    // exactamente lo que el plan prohíbe
    const m = 'Error: Timed out 5000ms waiting for expect(locator).toBeVisible()\nCall log:\n  - waiting for locator';
    expect(clasificarRojo(m)).toBe('asercion');
  });

  it('lo que no casa con ninguna clase se DECLARA desconocida, no se inventa', () => {
    expect(clasificarRojo('Error: browserContext.newPage: Browser closed')).toBe('desconocida');
    expect(clasificarRojo('')).toBe('desconocida');
  });
});

describe('clasificarReporte — del árbol del reporter a resultados con siguiente paso', () => {
  it('aplana suites anidadas y cada rojo lleva su clase y su mano', () => {
    const resultados = clasificarReporte({
      suites: [
        {
          file: 'a.spec.ts',
          suites: [
            {
              specs: [
                { title: 'verde', file: 'a.spec.ts', tests: [{ results: [{ status: 'passed' }] }] },
                {
                  title: 'rojo de locator',
                  file: 'a.spec.ts',
                  tests: [{ results: [{ status: 'failed', error: { message: 'strict mode violation: getByRole resolved to 2 elements' } }] }],
                },
                {
                  title: 'rojo de aserción',
                  file: 'a.spec.ts',
                  tests: [{ results: [{ status: 'failed', error: { message: 'expect(locator).toBeVisible() failed' } }] }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(resultados.map((r) => r.status)).toEqual(['verde', 'rojo', 'rojo']);
    expect(resultados[1].clase).toBe('locator');
    expect(resultados[1].siguiente_paso).toContain('Writer');
    expect(resultados[2].clase).toBe('asercion');
    expect(resultados[2].siguiente_paso).toContain('NO toca la aserción');
  });

  it('un retry que acaba verde cuenta VERDE: manda el último resultado', () => {
    const r = clasificarReporte({
      suites: [{ specs: [{ title: 'flaky', tests: [{ results: [{ status: 'failed', error: { message: 'x' } }, { status: 'passed' }] }] }] }],
    });
    expect(r[0].status).toBe('verde');
  });
});

describe('la clase entorno — la guarda D43 del emisor tiene su mano propia', () => {
  it('«falta la variable de entorno» no es del Writer ni del producto: se exporta y se repite', () => {
    expect(clasificarRojo('Error: falta la variable de entorno QA_X: es un secreto declarado (secret: true)')).toBe('entorno');
  });
});
