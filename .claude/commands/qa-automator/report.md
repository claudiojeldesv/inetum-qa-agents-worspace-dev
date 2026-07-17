---
description: Genera el reporte EJECUTIVO single-file (showcase, para decisor) + el reporte Allure enriquecido (drill-down técnico) a partir de los artefactos de un run ya ejecutado. El showcase es determinístico, sin Java, y se genera primero. Post-proceso desacoplado, re-ejecutable.
argument-hint: "[--work-dir=.work/<site-id>] [--results-dir=<workDir>/allure-results] [--summary=<workDir>/qa-automator-run-summary.json] [--output=<workDir>/allure-report]"
---

# /ia4d-qa-automator:report

> **Pre-check (workspace).** Este comando corre DENTRO de un workspace desplegado del agente. Antes de continuar, verifica que en el directorio actual existen `config/allowed-targets.yaml` y `playwright.config.ts`. Si falta alguno, NO sigas: indica al usuario que ejecute `/ia4d-qa-automator:init <carpeta>` (o abra su workspace ya desplegado) y detente.

Post-proceso de reporting de `ia4d-qa-automator`. Toma los `<workDir>/allure-results/` que el reporter
`allure-playwright` dejó al correr los tests y los **enriquece de forma determinística** (no LLM)
con la evidencia propia del agente, luego renderiza un **único HTML autocontenido (single-file)**
de Allure que se abre con doble-clic (`file://`) **sin servidor**.

No genera ni ejecuta tests: opera sobre artefactos de un run previo. Es re-ejecutable sin
regenerar nada (coherente con el principio "sanación/post-proceso al final" y la hard-rule #7).

## Dos reportes, dos audiencias

`npm run report` produce **dos** salidas:

1. **Reporte ejecutivo (showcase)** → `<workDir>/showcase-report.html` — para el decisor (QA Manager,
   I+D). HTML single-file con KPIs, los 5 actos ejecutados, detalle de casos (Writer/Reviewer/Judge),
   capa transversal a11y, callout de drift y trazabilidad RF-NNN. Lo genera `src/scripts/build-showcase.ts`
   de forma **determinística, sin Java, leyendo solo los JSON del run** (no `allure-results`). Se genera
   **primero**, así que existe aunque Allure falle. Render adaptativo: drift/judge/RF aparecen solo si su
   artefacto existe. Standalone: `npm run report:showcase`.
2. **Reporte Allure** (duro single-file + servido) → drill-down técnico para el QA (abajo). Requiere Java.

**Formato de salida: single-file.** La salida es UN solo `index.html` con todo inlineado (datos +
JS + CSS + screenshots). Trade-offs asumidos (decisión QA — el HTML duro es el único output que
interesa): **no hay Trends acumulados entre runs** (single-file no emite carpeta `history/`, así que
no hay ciclo history IN/OUT) y el **trace navegable de Playwright no funciona embebido** (los
screenshots por paso sí quedan inline).

## Prerequisito de runtime

`npx allure generate` es **Java-based** (Allure 2.x vía `allure-commandline`). Requiere un JRE
en el PATH (Java 8+ vale). El reporter `allure-playwright` que produce `<workDir>/allure-results/` NO
necesita Java; solo la generación del HTML estático. En CI on-prem (Jenkins) asegúrate de que
el agente tenga Java disponible.

## Arguments

Los runs escriben sus artefactos **namespaceados por sitio** bajo `<workDir> = .work/<site-id>`
(regla de los commands generadores). Este command deriva el `<workDir>` así, en orden:

1. `--work-dir=<path>` si el QA lo pasa.
2. `QA_WORK_DIR` si está seteado en el entorno (lo exporta el run).
3. Si `.work/` contiene **exactamente un** `<site-id>/` con `qa-automator-run-summary.json`, ese.
4. Si hay varios candidatos → **pregunta al QA cuál** (no elijas en silencio). Si no hay ninguno,
   cae al legacy plano `.work/` (runs pre-namespacing).

- `--results-dir=<path>` (opcional, default: `<workDir>/allure-results`): dir con los `*-result.json`.
- `--summary=<path>` (opcional, default: `<workDir>/qa-automator-run-summary.json`): fuente del mapeo RF-NNN→spec.
- `--output=<path>` (opcional, default: `<workDir>/allure-report`): dir destino; contiene el único
  `index.html` single-file.

Al invocar `npm run report`, exporta `QA_WORK_DIR=<workDir>` para que el enricher y el showcase
lean/escriban en el espacio del sitio.

## Procedure

### 1. Preflight (sin override)

1. Deriva el `<workDir>` (ver "Arguments"). Verifica que existe `--summary`
   (`<workDir>/qa-automator-run-summary.json`). Si no → instruye al QA a correr primero una
   generación (`/ia4d-qa-automator:autonomous`, `:req-driven` o `:spec-refiner`) que lo produce. Termina.
2. Verifica que existe `--results-dir` y contiene `*-result.json`. Si no → los tests no se
   corrieron con el reporter Allure: instruye a ejecutar `npx playwright test` con
   `QA_WORK_DIR=<workDir>` (el `playwright.config.ts` ya tiene `allure-playwright` en el array
   de reporters y namespacea por `QA_WORK_DIR`). Termina.

**Screenshots**: son evidencia de run-time, no del reporte — este command solo muestra los que
el run capturó (`allure-playwright` los adjunta solo; el enricher no los toca). Si el run corrió
con el default `only-on-failure`, los tests verdes no traen imagen: re-ejecuta los tests con
`QA_SCREENSHOT=on` (o declara `evidence.screenshots: on` en el Style Contract del sitio) y
vuelve a lanzar este command.

### 2. Enriquecer + generar (single-file) — un solo paso: `npm run report`

`npm run report` (→ `src/scripts/build-report.mjs`) orquesta de forma determinística:

1. **Enricher** (`src/allure-enricher.ts`) — sidecars (`environment.properties`, `categories.json`
   con triaje ampliado a11y/timeout/selector, `executor.json`) y muta los `*-result.json` con:
   labels RF-NNN (behaviors epic→feature→story), `severity`, links TMS (RF-NNN → `source_ref`),
   **description markdown** (criterio, módulo, verdict, judge, drift relacionado) y attachments
   (judge score+axes, protocolo Writer/Reviewer). Consume `<workDir>/judge-report.json` y
   `<workDir>/review-feedback.json` si existen (Judge off → sin attachment de judge, sin error).
2. **Generate (single-file)** — `allure generate <workDir>/allure-results --single-file -o
   <workDir>/allure-report --clean` (requiere Java en el PATH; si falta, el enricher igual corrió sobre
   `<workDir>/allure-results`). Produce UN único `<workDir>/allure-report/index.html` autocontenido.

No hay ciclo history IN/OUT: el formato single-file no emite carpeta `history/`, así que **los
Trends no acumulan entre runs** y `.allure-history/` no se usa en este flujo (trade-off asumido).

Los **screenshots por paso** los captura el run según `evidence.level` del Style Contract
(`full` = `test.step` + screenshot por paso) y quedan **inline** en el HTML; el enricher **nunca**
los toca. El **trace navegable NO** queda embebido en single-file (necesita el viewer de Allure).
Reporta los warnings del enricher (p.ej. specs sin resultado matcheado: se enriquecen a nivel
global, **nunca se truncan en silencio**).

### 3. Cierre

1. Imprime la ruta del reporte (`<output>/index.html`) y recuerda que se abre **con doble-clic**
   (`file://`): al ser single-file no necesita servidor — todo (datos + JS + CSS + screenshots) va
   inlineado, no hay `fetch()` de `data/*.json` que el navegador bloquee. No se levanta ningún
   servidor.
2. Registra en `<workDir>/audit-log.json` la escritura del reporte vía `appendAuditEntry` de
   `src/audit-log.ts`:
   ```
   { source: 'command', action: 'write_file', target: '<output>/',
     result: 'pass', metadata: { matched_specs, attachments, warnings } }
   ```

## Expected output

```
[build-showcase] reporte ejecutivo listo en <workDir>/showcase-report.html (single-file, doble-clic, sin servidor).
[allure-enricher] sidecars: 3, specs matcheados: 3, attachments: 6, mutaciones: 3
[build-report] reporte single-file listo en <workDir>/allure-report/index.html (ábrelo con doble-clic; no necesita servidor).
  Environment: target_url, compliance_verdict, judge_mean_score, drift_count
  Categorías: triaje de fallos + a11y
  Por test: label RF-NNN, link TMS (source_ref), attachment judge + Writer/Reviewer
Abrir: doble-clic en <workDir>/allure-report/index.html (single-file, file:// funciona)
```

## Failure modes

- Falta `<workDir>/qa-automator-run-summary.json` o `<workDir>/allure-results/` → preflight bloquea con instrucción.
- Java ausente → `npx allure generate` falla; el enricher (paso 2) ya dejó los `<workDir>/allure-results/`
  enriquecidos, así que el HTML puede generarse luego en una máquina/CI con Java.
- Spec del summary sin resultado Allure → warning + enriquecimiento global; no aborta.
