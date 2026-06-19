---
description: Genera un reporte HTML Allure enriquecido con la evidencia del agente (trazabilidad RF-NNN, judge, Writer/Reviewer, drift, compliance) a partir de los artefactos de un run ya ejecutado. Post-proceso desacoplado, re-ejecutable.
argument-hint: "[--results-dir=.work/allure-results] [--summary=.work/qa-automator-run-summary.json] [--output=.work/allure-report] [--no-open]"
---

# /qa-automator:report

Post-proceso de reporting de `ia4d-qa-automator`. Toma los `.work/allure-results/` que el reporter
`allure-playwright` dejó al correr los tests y los **enriquece de forma determinística** (no LLM)
con la evidencia propia del agente, luego renderiza el HTML estático de Allure.

No genera ni ejecuta tests: opera sobre artefactos de un run previo. Es re-ejecutable sin
regenerar nada (coherente con el principio "sanación/post-proceso al final" y la hard-rule #7).

## Prerequisito de runtime

`npx allure generate` es **Java-based** (Allure 2.x vía `allure-commandline`). Requiere un JRE
en el PATH (Java 8+ vale). El reporter `allure-playwright` que produce `.work/allure-results/` NO
necesita Java; solo la generación del HTML estático. En CI on-prem (Jenkins) asegúrate de que
el agente tenga Java disponible.

## Arguments

- `--results-dir=<path>` (opcional, default: `.work/allure-results`): dir con los `*-result.json`.
- `--summary=<path>` (opcional, default: `.work/qa-automator-run-summary.json`): fuente del mapeo RF-NNN→spec.
- `--output=<path>` (opcional, default: `.work/allure-report`): dir destino del HTML estático.
- `--no-open` (opcional): NO abre el reporte tras generarlo. Por defecto el command lo sirve por
  HTTP con `npx allure open` (ver Cierre). Útil en CI o cuando solo quieres el HTML estático.

## Procedure

### 1. Preflight (sin override)

1. Verifica que existe `--summary` (`.work/qa-automator-run-summary.json`). Si no →
   instruye al SDET a correr primero una generación (`/qa-automator:autonomous`,
   `:req-driven` o `:spec-refiner`) que lo produce. Termina.
2. Verifica que existe `--results-dir` y contiene `*-result.json`. Si no → los tests no se
   corrieron con el reporter Allure: instruye a ejecutar `npx playwright test` (el
   `playwright.config.ts` ya tiene `allure-playwright` en el array de reporters). Termina.

**Screenshots**: son evidencia de run-time, no del reporte — este command solo muestra los que
el run capturó (`allure-playwright` los adjunta solo; el enricher no los toca). Si el run corrió
con el default `only-on-failure`, los tests verdes no traen imagen: re-ejecuta los tests con
`QA_SCREENSHOT=on` (o declara `evidence.screenshots: on` en el Style Contract del sitio) y
vuelve a lanzar este command.

### 2. Enriquecer + generar + trends — un solo paso: `npm run report`

`npm run report` (→ `src/scripts/build-report.mjs`) orquesta de forma determinística:

1. **History IN** — restaura `.allure-history/` (si existe) en `.work/allure-results/history`.
2. **Enricher** (`src/allure-enricher.ts`) — sidecars (`environment.properties`, `categories.json`
   con triaje ampliado a11y/timeout/selector, `executor.json`) y muta los `*-result.json` con:
   labels RF-NNN (behaviors epic→feature→story), `severity`, links TMS (RF-NNN → `source_ref`),
   **description markdown** (criterio, módulo, verdict, judge, drift relacionado) y attachments
   (judge score+axes, protocolo Writer/Reviewer). Consume `.work/judge-report.json` y
   `.work/review-feedback.json` si existen (Judge off → sin attachment de judge, sin error).
3. **Generate** — `allure generate .work/allure-results -o .work/allure-report --clean` (requiere
   Java en el PATH; si falta, el enricher igual corrió sobre `.work/allure-results`).
4. **History OUT** — persiste `.work/allure-report/history` → `.allure-history/` para que los
   **Trends** acumulen entre runs (`.allure-history/` NO es efímero como `.work/`).

Los **screenshots por paso** y el **trace** los captura el run según `evidence.level` del Style
Contract (`full` = `test.step` + screenshot por paso + trace); allure-playwright los adjunta solo.
El enricher **nunca** los toca. Reporta los warnings del enricher (p.ej. specs sin resultado
matcheado: se enriquecen a nivel global, **nunca se truncan en silencio**).

### 4. Cierre

1. **Auto-open (default)**: salvo que se haya pasado `--no-open`, sirve el reporte por HTTP con
   `npx allure open <output>` **en segundo plano** (no bloquees el turno) e imprime la URL que
   Allure reporta. Esto es obligatorio porque el HTML de Allure es un SPA que hace `fetch()` de
   `data/*.json`: abierto con doble-clic (`file://`) el navegador bloquea esos fetch y da el
   "500 / Failed to fetch". Servido por HTTP funciona. Avisa al SDET de que el servidor queda
   corriendo y se cierra con Ctrl+C (o que te pida pararlo).
   Si se pasó `--no-open`, omite el servidor e imprime la ruta del reporte (`<output>/index.html`)
   y el comando manual (`npx allure open <output>`) — recordando que el doble-clic NO funciona.
2. Registra en `.work/audit-log.json` la escritura del reporte vía `appendAuditEntry` de
   `src/audit-log.ts`:
   ```
   { source: 'command', action: 'write_file', target: '<output>/',
     result: 'pass', metadata: { matched_specs, attachments, warnings } }
   ```

## Expected output

```
[allure-enricher] sidecars: 3, specs matcheados: 3, attachments: 6, mutaciones: 3
Reporte Allure generado: .work/allure-report/index.html
  Environment: target_url, compliance_verdict, judge_mean_score, drift_count
  Categorías: triaje de fallos + a11y
  Por test: label RF-NNN, link TMS (source_ref), attachment judge + Writer/Reviewer
Sirviendo por HTTP (auto-open): http://127.0.0.1:<puerto>  — Ctrl+C para parar
(con --no-open: imprime la ruta y `npx allure open .work/allure-report`; el doble-clic NO sirve)
```

## Failure modes

- Falta `.work/qa-automator-run-summary.json` o `.work/allure-results/` → preflight bloquea con instrucción.
- Java ausente → `npx allure generate` falla; el enricher (paso 2) ya dejó los `.work/allure-results/`
  enriquecidos, así que el HTML puede generarse luego en una máquina/CI con Java.
- Spec del summary sin resultado Allure → warning + enriquecimiento global; no aborta.
