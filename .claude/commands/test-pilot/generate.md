---
description: Orquesta playwright-test-generator (nativo) → ia4d-style-enforcer → ia4d-a11y-injector → ia4d-pii-scanner sobre un test-plan + Style Contract. Tras la ejecución, llama a ia4d-judge para scoring de calidad y aplica ask-first si supera el threshold.
argument-hint: --plan=<path> --style=<path> [--out-dir=<path>] [--threshold=<0..1>] [--judge-threshold=<0..1>] [--no-run] [--no-judge]
allowed-tools: Task, Read, Glob, Bash(mkdir:*), Bash(npx tsx:*)
---

# /test-pilot:generate

Eres el orquestador de `/test-pilot:generate`. Encadenas, por cada caso del test plan:

```
playwright-test-generator (nativo)  →  ia4d-style-enforcer  →  ia4d-a11y-injector  →  ia4d-pii-scanner
```

Cada paso lee del archivo escrito por el anterior. No invocas subagents en paralelo (la cadena por spec es secuencial). El scan PII final puede ser por directorio.

El command corre los tests resultantes vía `hooks/run-playwright.ts` con threshold por defecto del 80% (S7-T6), y después invoca `ia4d-judge` para scoring de calidad por test (S8). Si más del 30% de los tests tienen `score < 0.5`, el command pausa con ask-first (no aborta automáticamente). El SDET puede saltar el run con `--no-run` y el judge con `--no-judge`.

Argumentos crudos: `$ARGUMENTS`

## Paso 0 — Parsear argumentos

Extrae de `$ARGUMENTS`:

- `--plan=<path>` — obligatorio. Path al test plan generado por `/test-pilot:plan`. Si falta o no existe (verifícalo con Read), aborta con:

  ```
  ERROR: --plan no provisto o no encontrado.
  Uso: /test-pilot:generate --plan=<path> --style=<path> [--out-dir=<path>]
  ```

- `--style=<path>` — obligatorio. Path al Style Contract YAML. Si falta o no existe, aborta:

  ```
  ERROR: --style no provisto o no encontrado.
  ```

- `--out-dir=<path>` — opcional. Default: `output/generate/`. Es el directorio donde aterrizan los `.spec.ts` generados.
- `--threshold=<0..1>` — opcional. Default: `0.8`. Pass-rate mínimo para considerar la corrida GO (Paso 6 — Playwright run).
- `--judge-threshold=<0..1>` — opcional. Default: `0.5`. Score por test debajo del cual el judge marca verdict `WEAK`. La pausa ask-first usa esta misma cifra como umbral.
- `--no-run` — opcional. Si está presente, salta el Paso 6 (no corre Playwright). Útil cuando el SDET solo quiere los archivos materializados.
- `--no-judge` — opcional. Si está presente, salta el Paso 7 (no ejecuta el judge). El output final no incluirá quality scoring.

## Paso 1 — Preparar output dir

Si `--out-dir` cae bajo `output/`, ejecuta:

```bash
mkdir -p <out-dir>
```

Si el SDET dio uno custom, asume que existe.

## Paso 2 — Generar tests con el Planner nativo

Invoca el subagent `playwright-test-generator` (nativo de Playwright) vía Task tool con un prompt como:

> Genera tests Playwright TypeScript a partir del plan en `<plan>`. Por cada caso del plan, crea un archivo `.spec.ts` separado bajo `<out-dir>/` siguiendo el naming `<feature>.<scenario>.spec.ts`. No instales dependencias, no edites `playwright.config.ts`.
>
> **Convenciones de locators** (las enforce el style-enforcer aguas abajo, pero ahórrate retrabajo):
> - Cuando veas atributos `data-test`, `data-testid` o `data-qa` en la app, **usa `page.getByTestId('valor')`**. Nunca emitas `page.locator('[data-test="valor"]')` literal.
> - Para botones, links, headings y otros roles: `page.getByRole('button', { name: 'X' })`.
> - Para inputs etiquetados: `page.getByLabel('Email')`.
> - Para texto plano visible: `page.getByText('Welcome')`.
> - **Evita** `page.locator('.clase')`, `page.locator('#id')` y XPath. El enforcer los bloquea sin auto-fix.
>
> Cuando termines, devuelve la lista de archivos `.spec.ts` que has escrito (paths relativos al repo).

Espera a que termine. Cuando vuelva:

- Si reporta error (MCP `playwright-test` no disponible, plan inválido, timeout): expón el error al SDET y termina. No inventes archivos.
- Si reporta éxito: captura la lista de paths. Confirma con Glob (`<out-dir>/*.spec.ts`) que efectivamente existen. Si la lista del Generator no coincide con lo que ves en disco, usa lo que está en disco — Glob es la fuente de verdad.

Si Glob devuelve 0 archivos: aborta con `ERROR: Generator no produjo ningún .spec.ts en <out-dir>` y termina.

## Paso 3 — Enforce de estilo + a11y por cada spec

Por cada `.spec.ts` en la lista resultante del Paso 2, **en serie**:

### 3a. Style enforce

Invoca `ia4d-style-enforcer` vía Task tool:

> Enforce el Style Contract `<style>` sobre el spec `<spec>`. Aplica `--fix`. Devuelve el JSON crudo del CLI tal cual.

Espera al subagent. Parsea el JSON crudo del Bloque 2 de su respuesta.

- Si `pass: false` (block tras los fixes): registra el spec en `failed_specs` con el detalle de violations bloqueantes. **No abortes** todavía — sigue con los demás specs. Al final del Paso 3 decides.
- Si `pass: true`: continúa al 3b para este spec.

### 3b. A11y inject

Invoca `ia4d-a11y-injector` vía Task tool:

> Inyecta axe-core en el spec `<spec>`. Devuelve el JSON crudo del CLI tal cual.

Espera al subagent. Parsea el JSON.

- Si `VERDICT: ERROR` (CLI exit 1, p. ej. el archivo no contiene `test(...)`): registra el spec en `failed_specs` con razón.
- Si `VERDICT: PASS`: marca este spec como `clean_specs`.

## Paso 4 — PII scan sobre el output dir

Invoca `ia4d-pii-scanner` vía Task tool una sola vez sobre `<out-dir>`:

> Escanea recursivamente `<out-dir>` buscando PII y test.fixme. Devuelve el JSON crudo tal cual.

Parsea el JSON del Bloque 2.

- Si `pass: false`: registra cada finding como un problema crítico (PII real es exit-condition SPEC §6 — Never do). En el resumen final, marca esos archivos como `pii_blocked`.
- Si `pass: true`: ningún spec contaminado.

## Paso 5 — Decidir si abortar

La cadena se considera fallida si **cualquiera** de:

- `failed_specs.length > 0` con razón distinta de "warnings".
- Algún spec en `pii_blocked`.

Si está fallida:

```
ERROR: /test-pilot:generate completado con fallos.

Specs producidos: <total>
Specs limpios:    <clean>
Specs con bloqueo de estilo: <X>
Specs con bloqueo de a11y inject: <Y>
Specs con PII / test.fixme detectado: <Z>

DETALLE:
  <spec> — STYLE block: <razón breve>
  <spec> — A11Y error: <razón>
  <spec> — PII: <tipo> @ line <line>

Acción sugerida: revisar los specs marcados. Re-correr /test-pilot:generate tras corregir manualmente o ajustar el test plan / style contract.
```

Y termina sin re-ejecutar nada.

## Paso 6 — Verify de ejecución (Playwright run + threshold)

Si el SDET pasó `--no-run`, salta este paso entero y procede al Paso 7 con `run.skipped = true`.

En caso normal, invoca el CLI vía Bash:

```bash
npx tsx hooks/run-playwright.ts --dir <out-dir> --threshold <threshold>
```

Esto ejecuta `npx playwright test <out-dir> --reporter=json` por debajo, parsea el JSON, escribe `<out-dir>/run-report.json` y emite el mismo JSON por stdout. Exit codes:

- `0` → `pass: true` y `passRate ≥ threshold`. Continúa al Paso 7 como éxito.
- `2` → `pass: false`, `passRate < threshold`. **Ask-first** al SDET con el detalle (ver más abajo). No abortes silenciosamente: el SDET decide si seguir con los specs como están o re-ejecutar el Generator. **No reintentes solo**.
- `1` → error de ejecución (Playwright no arrancó, JSON ilegible). Expón el `errorMessage` del report y termina con `ERROR`. No marques specs como passed ni failed — quedan como `unknown`.

Parsea el JSON. Campos relevantes:

```json
{
  "pass": true|false,
  "threshold": 0.8,
  "total": <int>,
  "passed": <int>,
  "failed": <int>,
  "flaky": <int>,
  "skipped": <int>,
  "passRate": <float>,
  "results": [
    { "file": "...", "title": "...", "status": "passed|failed|flaky|skipped|unknown",
      "confidence": 0|1, "errorMessage": "..." }
  ]
}
```

Confidence: los passed quedan en `1` (será refinado por el judge en Slice 8); los failed / flaky / skipped / unknown quedan en `0` por convención. No reinterpretes.

### Ask-first cuando passRate < threshold

Cuando `pass: false` y `--no-run` no fue declarado, presenta al SDET:

```
ATENCIÓN: la suite cayó por debajo del threshold.

passRate: <passRate>  (threshold: <threshold>)
passed:   <passed>
failed:   <failed>
flaky:    <flaky>
skipped:  <skipped>

FALLOS:
  <file>::<title>
    <errorMessage primera línea>
  ...

Acciones posibles:
  1) revisar manualmente los specs marcados como failed y volver a invocar /test-pilot:generate
  2) ajustar el test plan / style contract
  3) bajar el threshold con --threshold=<valor> si los fallos son aceptables (sign-off explícito del SDET)
```

Y termina sin re-invocar nada. La decisión es del SDET.

## Paso 7 — Quality scoring (LLM-as-judge)

Si el SDET pasó `--no-judge`, salta este paso entero y procede al Paso 8 con `judge.skipped = true`.

En caso normal, invoca el subagent `ia4d-judge` vía Task tool con un prompt como:

> Evalúa los `.spec.ts` en `<out-dir>` contra el plan `<plan>`. Aplica el rubric de 5 ejes y produce `<out-dir>/../judge/judge-report.json` (o el path equivalente bajo `output/judge/`). Threshold por test: `<--judge-threshold>` (default 0.5). Devuelve el resumen humano con el conteo de tests bajo threshold.

Espera al subagent. Cuando vuelva:

- Si reporta `ERROR: <razón>`: expón el error tal cual y termina con `ERROR` global. **No** intentes re-invocar al judge automáticamente.
- Si responde con el resumen normal: lee el `judge-report.json` con Read y captura `summary.belowThreshold`, `summary.belowThresholdPct`, `summary.avgScore` y `summary.total`.

### Ask-first cuando belowThresholdPct > 0.3

Si `summary.belowThresholdPct > 0.3` (más del 30% de tests con `score < <--judge-threshold>`), **pausa** y presenta al SDET:

```
ATENCIÓN: el judge marcó muchos tests con calidad baja.

avgScore:           <avgScore>
Threshold por test: <judge-threshold>
Tests bajo threshold: <belowThreshold> / <total>  (<belowThresholdPct * 100>%)

WEAK tests:
  - <file>::<testName>  (score=<score>, eje débil=<eje con score más bajo>)
  ...

Acciones posibles:
  1) revisar manualmente los specs marcados como WEAK
  2) reescribir el test plan o el style contract para subir calidad
  3) bajar --judge-threshold si los scores actuales son aceptables (sign-off explícito)
  4) continuar al output final aceptando los scores como están

¿Cómo quieres proceder?
```

Y termina la ejecución del command **esperando** decisión explícita del SDET. **No tomes la decisión por él.** Si el SDET en el siguiente mensaje dice "continuar", entonces emites el output final del Paso 8. Si dice cualquier otra cosa, esperas instrucciones nuevas.

Si `summary.belowThresholdPct <= 0.3`, continúa al Paso 8 con `judge.askFirstTriggered = false`.

## Paso 8 — Output al SDET (caso éxito)

Si todo limpio (Paso 5 sin failed_specs ni pii_blocked, Paso 6 con `pass: true` o `--no-run`, Paso 7 sin ask-first activo):

```
/test-pilot:generate terminado.

Plan:    <plan path>
Style:   <style path>
Out dir: <out-dir>

Specs producidos:  <total>
Specs limpios:     <clean>
Fixes de estilo aplicados (total): <suma fixesApplied de cada spec>
Tests con axe inyectado:           <suma injected de cada spec>
Tests con axe ya pre-existente:    <suma alreadyPresent de cada spec>

PII scan: PASS (0 findings, <N> archivos escaneados)

Playwright run:
  passRate: <passRate>  (threshold: <threshold>)
  passed:   <passed>/<total>
  failed:   <failed>
  flaky:    <flaky>
  skipped:  <skipped>
  report:   <out-dir>/run-report.json

Quality scoring (judge):
  avgScore:           <avgScore>
  Threshold por test: <judge-threshold>
  WEAK tests:         <belowThreshold>/<total>  (<belowThresholdPct * 100>%)
  report:             output/judge/judge-report.json
```

Si `--no-run` fue declarado, sustituye el bloque "Playwright run" por:

```
Playwright run: SALTADO (--no-run)
```

Si `--no-judge` fue declarado, sustituye el bloque "Quality scoring (judge)" por:

```
Quality scoring (judge): SALTADO (--no-judge)
```

Si hubo warnings (style WITH WARNINGS) pero no blocks, añade antes del bloque de Playwright:

```
WARN: <K> specs con warnings de estilo (no bloqueantes). Revisa la salida individual de ia4d-style-enforcer si quieres detalle.
```

## Reglas duras

- **No reordenes la cadena.** Generator → enforcer → injector → scanner. El enforcer puede eliminar líneas (banned APIs) y por eso debe ir antes del injector. El scanner va último porque opera sobre el resultado final.
- **No saltes el PII scan.** Es exit-condition de SPEC §6 — Never do. Sin override.
- **No invoques `ia4d-compliance-checker`** desde aquí — este command opera sobre artefactos locales, no toca URLs. El compliance ya pasó en `/test-pilot:discover`.
- **No corras `npx playwright test` directamente.** Usa siempre `hooks/run-playwright.ts` — encapsula el reporter JSON, el parsing y el threshold. Llamadas directas a `npx playwright test` desde el command están prohibidas.
- **No reintentes el Playwright run automáticamente** si cayó por debajo del threshold. Es ask-first del SDET (SPEC §6 — Ask first: "Continuar cuando el LLM-as-judge clasifica >30% de los tests con score <0.5" — análogo aquí para passRate).
- **No reintentes el judge automáticamente** si reporta error. La decisión de re-invocar es del SDET.
- **No tomes la decisión del threshold del judge por el SDET.** Si `belowThresholdPct > 0.3`, pausas y esperas instrucción explícita. No "continúo porque parece OK" — la pausa es la decisión correcta.
- **No invoques subagents en paralelo dentro de la cadena por spec.** El handoff es por archivo y secuencial. Sí puedes procesar specs distintos uno tras otro; no procesar el mismo spec en dos pasos a la vez.
- **No edites los `.spec.ts` directamente.** El enforcer y el injector ya lo hacen vía sus CLIs. Tú orquestas, no transformas.
- **No retries silenciosos.** Si un subagent falla, lo registras y sigues con el siguiente spec; al final reportas al SDET.

## Lo que NO haces

- No generas el plan ni el style contract. Llegan como input.
- No mapeas criterios — eso lo hizo `/test-pilot:plan`.
- No exportas el catálogo — `/test-pilot:export` (Slice 10).
- No escribes en `audit-log.json` — los hooks transversales lo registran.
