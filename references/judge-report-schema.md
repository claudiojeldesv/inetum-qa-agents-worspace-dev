# `judge-report.json` — schema

LLM-as-judge sobre los `.spec.ts` producidos por `/test-pilot:generate`. Es un layer de **quality scoring**, no un validador binario de compliance — el SDET sigue decidiendo qué hace con los scores. Sin override automático.

## Versión

`schemaVersion: 1`. Bump si rompe compatibilidad con consumidores (export Slice 10, full-loop Slice 11).

## Estructura

```json
{
  "schemaVersion": 1,
  "generated": "2026-05-27T08:30:00.000Z",
  "specsDir": "output/generate/",
  "planSource": "output/plan/test-plan.md",
  "summary": {
    "total": 13,
    "avgScore": 0.84,
    "belowThreshold": 2,
    "belowThresholdPct": 0.154,
    "threshold": 0.5
  },
  "results": [
    {
      "file": "login.spec.ts",
      "testName": "should login with standard_user",
      "criterion": "RF-001",
      "axes": {
        "meaningfulAssert": { "score": 1.0, "reason": "..." },
        "stableSelectors":  { "score": 0.8, "reason": "..." },
        "noFragileWaits":   { "score": 1.0, "reason": "..." },
        "noContamination":  { "score": 1.0, "reason": "..." },
        "coversCriterion":  { "score": 1.0, "reason": "..." }
      },
      "score": 0.96,
      "verdict": "PASS"
    }
  ]
}
```

## Campos top-level

| Campo | Tipo | Notas |
|---|---|---|
| `schemaVersion` | number | Siempre `1` en MVP. |
| `generated` | string | ISO 8601 UTC del momento de cierre del subagent. |
| `specsDir` | string | Path al directorio que el judge escaneó. Típicamente `output/generate/`. |
| `planSource` | string | Path al `test-plan.md` usado para mapear criterio FD por test. |
| `summary` | object | Agregados sobre `results`. Ver abajo. |
| `results` | array | Una entrada por `test()` block evaluado. Ver abajo. |

## `summary`

| Campo | Tipo | Cálculo |
|---|---|---|
| `total` | number | Cantidad de tests evaluados. Si un `.spec.ts` tiene 3 `test()` blocks, suma 3. |
| `avgScore` | number 0..1 | Promedio aritmético de `results[].score`. Redondear a 3 decimales. |
| `belowThreshold` | number | Conteo de `results` con `score < threshold`. |
| `belowThresholdPct` | number 0..1 | `belowThreshold / total`. Redondear a 3 decimales. |
| `threshold` | number | Umbral de score por test usado. Default `0.5` (SPEC §6 — Ask first cuando >30% < 0.5). |

## `results[]`

| Campo | Tipo | Notas |
|---|---|---|
| `file` | string | Path relativo al `specsDir`. Ej. `login.spec.ts`. |
| `testName` | string | Texto exacto del primer argumento del `test()` (sin describe prefix). |
| `criterion` | string | Código del criterio FD que el test debería cubrir. Típicamente `RF-NNN` extraído del JSDoc del test (regex `@criterio\s+(RF-\d+)`). Si el test no lo declara, `"UNKNOWN"`. |
| `axes` | object | 5 ejes obligatorios. Ver abajo. |
| `score` | number 0..1 | Promedio aritmético de los 5 `axes[i].score`. Redondear a 3 decimales. |
| `verdict` | string | `"PASS"` si `score >= 0.5`, `"WEAK"` si `< 0.5`. Convención para lectura humana, no usado por el threshold (que usa `score` directo). |

## `axes` — los 5 ejes del rubric

Cada eje es un objeto `{ score: number 0..1, reason: string }`. `score` con resolución mínima de `0.1` (rubric discreto, no continuo).

### `meaningfulAssert`

El test debe contener al menos una `expect(...)` sobre estado visible relevante para el criterio.

| Score | Cuándo |
|---|---|
| 1.0 | ≥1 `expect()` semántico (`toBeVisible`, `toHaveText`, `toHaveURL`, `toHaveCount`, etc.) sobre un locator del criterio. |
| 0.5 | Hay `expect()` pero genérico (`toBeTruthy`, `not.toBeNull`) o sobre estado no central al criterio. |
| 0.0 | Sin `expect()`, o solo asserts en cleanup/afterEach. El test ejecuta pero no verifica nada. |

### `stableSelectors`

Los locators usados respetan la prioridad del Style Contract (`getByRole > getByTestId > getByLabel > getByText`) y no caen en CSS bruto o XPath salvo justificación.

| Score | Cuándo |
|---|---|
| 1.0 | Todos los locators usan `getByRole` / `getByTestId` / `getByLabel` / `getByText`. |
| 0.5 | Mayoría semánticos pero al menos uno cae en `page.locator('selector raw')` sin justificar. |
| 0.0 | Predominancia de CSS bruto o XPath. |

### `noFragileWaits`

El test no usa `page.waitForTimeout()` ni `page.pause()`. Waits semánticos solamente.

| Score | Cuándo |
|---|---|
| 1.0 | Cero `waitForTimeout` / `pause`. Solo `waitFor`, `toBeVisible`, etc. |
| 0.5 | Una sola `waitForTimeout` con valor pequeño (<200ms) que parece debugging residual. |
| 0.0 | Múltiples `waitForTimeout` o `pause` activo. |

### `noContamination`

El test no comparte estado mutable con otros tests (no escribe a archivos del proyecto, no depende del orden de ejecución, no asume sesión previa). Cleanup en `afterEach` cuando crea estado.

| Score | Cuándo |
|---|---|
| 1.0 | Test independiente. Setup/cleanup explícitos si crea estado. Sin `test.use({ storageState })` fuera de fixture documentado. |
| 0.5 | Test parece independiente pero depende implícitamente de un `beforeAll` que crea estado compartido sin cleanup explícito. |
| 0.0 | Test depende del orden (lo dice un comentario o se infiere del código). O modifica archivos del repo en runtime. |

### `coversCriterion`

El test cubre el criterio FD declarado en su JSDoc. Comparación textual entre lo que dice el criterio y lo que el test hace.

| Score | Cuándo |
|---|---|
| 1.0 | El test ejercita exactamente el flujo descrito por el criterio y asserta sobre el resultado declarado. |
| 0.5 | El test cubre parcialmente — ejercita el flujo pero asserta sobre un side-effect distinto, o asserta lo correcto sin recorrer el flujo completo. |
| 0.0 | El test no cita criterio (`criterion: "UNKNOWN"`) o cita uno pero hace algo distinto. |

## Cómputo del `score` global

```ts
score = round((meaningfulAssert.score
             + stableSelectors.score
             + noFragileWaits.score
             + noContamination.score
             + coversCriterion.score) / 5, 3)
```

Promedio simple. No hay ponderación por eje en MVP — la decisión consciente es que cada eje pesa igual. Si surge necesidad de ponderar (ej. en banca regulada un `meaningfulAssert: 0.0` debería pesar más), bump del schemaVersion.

## `verdict`

- `PASS` si `score >= 0.5`.
- `WEAK` si `score < 0.5`.

El `verdict` es **lectura humana**, no usado por el threshold programático. El threshold del 30% se calcula directo sobre `score < threshold` (con `threshold` configurable, default `0.5`).

## Threshold logic en `/test-pilot:generate`

Tras escribir `judge-report.json`, el command computa:

```ts
const belowPct = summary.belowThreshold / summary.total;
if (belowPct > 0.3) {
  // Ask-first: pausa, expone al SDET cuántos tests están bajo y por qué,
  // espera decisión explícita (continuar / abortar / revisar).
}
```

No es auto-abort. Es ask-first deliberado: si el batch tiene mucha calidad baja, el SDET puede preferir revisar antes de que llegue al export. Si elige continuar, el flujo sigue normal y los scores bajos quedan registrados en `judge-report.json` para auditoría.

## Ejemplo de entrada `results[i]` con eje WEAK

```json
{
  "file": "checkout.spec.ts",
  "testName": "should reject empty Zip",
  "criterion": "RF-010",
  "axes": {
    "meaningfulAssert": { "score": 1.0, "reason": "expect(error).toHaveText('Zip is required')" },
    "stableSelectors":  { "score": 0.5, "reason": "Usa getByTestId pero también page.locator('.form_error_container') en la última assertion" },
    "noFragileWaits":   { "score": 1.0, "reason": "Sin waitForTimeout" },
    "noContamination":  { "score": 1.0, "reason": "Test independiente" },
    "coversCriterion":  { "score": 0.5, "reason": "Asserta el error message pero no recorre el flow First/Last name primero como dice el criterio" }
  },
  "score": 0.8,
  "verdict": "PASS"
}
```

## Lo que el judge **NO** hace

- No re-ejecuta los tests (eso es `hooks/run-playwright.ts` de S7-T6).
- No corrige los tests (eso es `ia4d-style-enforcer` con `--fix` de S7-T3).
- No re-evalúa el FD ni el plan — confía en `criterion` del JSDoc.
- No emite `block` que aborte un flujo. Es scoring + ask-first, no gate hard.
- No comprueba PII (eso es `ia4d-pii-scanner` de S3).
- No comprueba A11y (axe-core check ya está inyectado por `ia4d-a11y-injector`; el judge solo verifica que la assertion está presente en `meaningfulAssert`).

## Consumidores

- **`/test-pilot:generate`** (Slice 8) — invoca al judge al final de la cadena. Aplica threshold ask-first.
- **`/test-pilot:export`** (Slice 10) — incluye `score` y `axes` por test en el `test-catalog.json`.
- **Humano** (SDET, QA Manager): lee el JSON para entender por qué un test tiene score bajo.

## Cross-reference

- Producido por `.claude/agents/ia4d-judge.md`.
- Schema basado en SPEC §2 (`/test-pilot:generate` produce `judge-report.json`) + SPEC §6 Ask first (threshold 30%/0.5).
- Modelo del judge: `haiku` (SPEC anexo riesgos #3 — coste).
