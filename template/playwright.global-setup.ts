import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Playwright globalSetup — limpia `.work/allure-results` antes de cada corrida.
 *
 * Por qué: el reporter `allure-playwright` AÑADE un `*-result.json` por test en cada run y
 * nunca limpia el directorio. Sin esto, los resultados se acumulan entre corridas y el reporte
 * de `/ia4d-qa-automator:report` mezcla runs viejos (duplicados, `skipped` rancios, fallos ya
 * corregidos). Limpiar aquí —código determinista, no instrucción al LLM— garantiza que el
 * reporte refleje SOLO la corrida actual, para todos los commands y runs manuales.
 *
 * NO toca `.allure-history/` (vive fuera de `allure-results`). Nota: el reporte actual es single-file
 * y NO acumula Trends entre runs (trade-off asumido — ver `/ia4d-qa-automator:report`); no existe
 * ningún paso que re-inyecte history en `build-report.mjs`.
 */
function globalSetup(): void {
  // Work dir por-sitio (v0.2): QA_WORK_DIR='.work/<site-id>' aísla los allure-results por sitio.
  // Sin la var → '.work' (comportamiento previo).
  const workDir = process.env.QA_WORK_DIR || '.work';
  rmSync(resolve(process.cwd(), `${workDir}/allure-results`), { recursive: true, force: true });
}

export default globalSetup;
