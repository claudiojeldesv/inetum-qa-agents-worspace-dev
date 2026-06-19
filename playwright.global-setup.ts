import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Playwright globalSetup — limpia `.work/allure-results` antes de cada corrida.
 *
 * Por qué: el reporter `allure-playwright` AÑADE un `*-result.json` por test en cada run y
 * nunca limpia el directorio. Sin esto, los resultados se acumulan entre corridas y el reporte
 * de `/qa-automator:report` mezcla runs viejos (duplicados, `skipped` rancios, fallos ya
 * corregidos). Limpiar aquí —código determinista, no instrucción al LLM— garantiza que el
 * reporte refleje SOLO la corrida actual, para todos los commands y runs manuales.
 *
 * NO toca `.allure-history/` (vive fuera de `allure-results`): los Trends entre runs se preservan,
 * porque `build-report.mjs` re-inyecta el history en su paso "History IN" tras el run.
 */
function globalSetup(): void {
  rmSync(resolve(process.cwd(), '.work/allure-results'), { recursive: true, force: true });
}

export default globalSetup;
