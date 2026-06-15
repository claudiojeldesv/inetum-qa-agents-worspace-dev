---
description: Genera un reporte HTML Allure enriquecido con la evidencia del agente (trazabilidad RF-NNN, judge, Writer/Reviewer, drift, compliance) a partir de los artefactos de un run ya ejecutado. Post-proceso desacoplado, re-ejecutable.
argument-hint: "[--results-dir=.work/allure-results] [--summary=.work/qa-automator-run-summary.json] [--output=.work/allure-report] [--open]"
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
- `--open` (opcional): abre el reporte tras generarlo (`npx allure open`).

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

### 2. Enriquecer (determinístico)

Ejecuta el enricher, que escribe los sidecars Allure (`environment.properties`,
`categories.json`, `executor.json`) y muta los `*-result.json` con labels RF-NNN, links TMS
(RF-NNN → `source_ref`) y attachments (judge score+axes, protocolo Writer/Reviewer):

```sh
npx tsx src/allure-enricher.ts --results-dir=<results-dir> --summary=<summary>
```

Fuentes opcionales que el enricher consume si existen (junto al results-dir o su parent):
`.work/judge-report.json` (si Judge está off, se omiten los attachments de judge, sin error) y
`.work/review-feedback.json`. Reporta al SDET los warnings que emita (p.ej. specs sin resultado
Allure matcheado: se enriquecen solo a nivel global, **nunca se truncan en silencio**).

### 3. Generar el HTML

```sh
npx allure generate <results-dir> -o <output> --clean
```

Si se pasó `--open`, además: `npx allure open <output>`.

### 4. Cierre

1. Imprime la ruta del reporte (`<output>/index.html`) y el comando para abrirlo
   (`npx allure open <output>`).
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
Abrir: npx allure open .work/allure-report
```

## Failure modes

- Falta `.work/qa-automator-run-summary.json` o `.work/allure-results/` → preflight bloquea con instrucción.
- Java ausente → `npx allure generate` falla; el enricher (paso 2) ya dejó los `.work/allure-results/`
  enriquecidos, así que el HTML puede generarse luego en una máquina/CI con Java.
- Spec del summary sin resultado Allure → warning + enriquecimiento global; no aborta.
