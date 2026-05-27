# `test-catalog.json` — schema

JSON genérico que consolida en un único artefacto todo lo que produjo el agente para un batch de tests: plan, specs generados, scoring del judge, run de Playwright, audit. Pensado para consumirse por **Xray, Zephyr, TestRail u otro Test Management** mediante un connector futuro (Non-goal MVP — sólo emitimos el catálogo, no integramos con TMS).

Versión actual: `schemaVersion: 1`.

## Forma top-level

```json
{
  "schemaVersion": 1,
  "generated": "2026-05-27T18:00:00.000Z",
  "sources": {
    "plan": "output/plan/test-plan.md",
    "specsDir": "output/generate/",
    "judgeReport": "output/judge/judge-report.json",
    "runReport": "output/generate/run-report.json",
    "auditReport": null
  },
  "summary": {
    "total": 4,
    "withJudge": 4,
    "withRun": 4,
    "withAudit": 0,
    "passed": 0,
    "failed": 4,
    "flaky": 0,
    "skipped": 0,
    "avgJudgeScore": 0.95,
    "weakTests": 0,
    "a11yPolicy": {
      "mode": "warn",
      "reason": "SauceDemo demo público sin SLA WCAG",
      "declaredIn": "cli"
    }
  },
  "entries": [
    { ...entry... }
  ]
}
```

## Campos top-level

| Campo | Tipo | Notas |
|---|---|---|
| `schemaVersion` | number | Siempre `1` en MVP. |
| `generated` | string | ISO 8601 UTC del momento de export. |
| `sources` | object | Paths a los archivos consumidos. `null` si la fuente no estaba disponible al exportar. |
| `summary` | object | Agregados sobre `entries`. Ver abajo. |
| `entries` | array | Una entrada por `test()` block del batch. Ver abajo. |

### `sources`

| Campo | Tipo | Notas |
|---|---|---|
| `plan` | string \| null | `output/plan/test-plan.md` típicamente. |
| `specsDir` | string | **Requerido**. Dir con los `.spec.ts` generados. |
| `judgeReport` | string \| null | `output/judge/judge-report.json` si el judge corrió. |
| `runReport` | string \| null | `output/generate/run-report.json` si Playwright corrió. |
| `auditReport` | string \| null | `output/audit/audit-report.json` si `/test-pilot:audit` corrió. |

### `summary`

| Campo | Tipo | Cálculo |
|---|---|---|
| `total` | number | Cantidad de `entries`. |
| `withJudge` | number | Entries con `judgeScore` no nulo. |
| `withRun` | number | Entries con `runStatus` distinto de `null`. |
| `withAudit` | number | Entries que tienen al menos un `auditFinding` o que el audit reportó como limpias (depende de si el audit corrió). |
| `passed` / `failed` / `flaky` / `skipped` | number | Conteo por `runStatus`. Sin run, todos son 0. |
| `avgJudgeScore` | number 0..1 | Promedio aritmético de `judgeScore` (omite `null`). Redondeado a 3 decimales. Si `withJudge=0`, este campo es `null`. |
| `weakTests` | number | Conteo de entries con `judgeScore < 0.5` (mismo threshold del judge). |
| `a11yPolicy` | object \| null | Resumen del último `policy_skip` para a11y de la corrida que generó el batch (de `audit-log.json`). `null` si no hubo downgrade. |

### `entries[i]`

```json
{
  "caseId": "login.standard-user.spec.ts::standard_user-login-redirects",
  "file": "output/generate/login.standard-user.spec.ts",
  "testName": "standard_user login redirects to /inventory.html with Swag Labs header",
  "criterion": "RF-001",
  "criterionText": "Login con standard_user redirige a /inventory.html y la cabecera muestra Swag Labs.",
  "judgeScore": 1.0,
  "judgeVerdict": "PASS",
  "judgeAxes": {
    "meaningfulAssert": 1.0,
    "stableSelectors": 1.0,
    "noFragileWaits": 1.0,
    "noContamination": 1.0,
    "coversCriterion": 1.0
  },
  "runStatus": "passed",
  "runErrorMessage": null,
  "auditFindings": [],
  "a11ySnippetMode": "warn"
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `caseId` | string | ID estable. Formato `<file basename>::<slug del testName>`. Slug usa `[a-z0-9-]+`. Usado para dedup en futuras corridas. |
| `file` | string | Path al `.spec.ts`. |
| `testName` | string | Texto exacto del primer arg de `test(...)`. |
| `criterion` | string | Código del JSDoc (`RF-NNN`, `FREE-NNN`, `GAP-NNN`) o `"UNKNOWN"`. |
| `criterionText` | string \| null | Texto FD del criterio, copiado del plan si está disponible. |
| `judgeScore` | number 0..1 \| null | Del `judge-report.json`. `null` si el judge no corrió. |
| `judgeVerdict` | "PASS" \| "WEAK" \| null | Idem. |
| `judgeAxes` | object \| null | Los 5 ejes con score numérico (sin razón — para detalle, ver `judge-report.json`). |
| `runStatus` | "passed" \| "failed" \| "flaky" \| "skipped" \| "unknown" \| null | Del `run-report.json`. `null` si Playwright no corrió. |
| `runErrorMessage` | string \| null | Primera línea del error si `runStatus` es failed/flaky. |
| `auditFindings` | array | Findings del `/test-pilot:audit` para este archivo, si el audit corrió. Vacío si el archivo está limpio o si no hubo audit. |
| `a11ySnippetMode` | "block" \| "warn" \| "skip" \| null | Modo del snippet axe-core inyectado en este spec. Útil para que un revisor sepa qué nivel de a11y aplicó. |

## Dedup

El exporter normaliza por `caseId` (file basename + slug del testName). Si dos entradas tienen el mismo `caseId`, el exporter conserva la **última** procesada (asumiendo que es la corrida más reciente). Reporta el conflicto en stderr como advertencia.

En MVP esto no ocurrirá típicamente — un batch genera nombres únicos. La dedup está para batches futuros que mezclen specs preexistentes con regeneraciones.

## Lo que el catálogo **NO** captura

- **Tokens y coste LLM** del judge — diferido a v0.2 con budget cap.
- **Trazas Playwright (screenshots, video)** — el run-report.json no las incluye en MVP.
- **Datos sintéticos completos** usados en cada test — solo el `criterionText` y el nombre del test.
- **Stack traces completos** de fallos — solo el `errorMessage` de primera línea.
- **Histórico** entre corridas. Cada export es un snapshot. Versionado entre snapshots queda para v0.2 con knowledge graph.

## Consumidores

- **Humano** (QA Manager): lee el JSON o lo abre con un viewer.
- **Connector Xray/Zephyr/TestRail** (futuro): consume `caseId` + `criterion` + `runStatus` + `judgeScore` para sincronizar con el TMS del cliente.
- **`/test-pilot:full-loop`** (Slice 11): produce el catálogo al final de la cadena.

## Cross-reference

- Producido por `.claude/agents/ia4d-exporter` invocando `hooks/exporter.ts`.
- Schema basado en SPEC §2 (`/test-pilot:export` produce `test-catalog.json`).
- Non-goal MVP: connector específico a TMS. Solo emitimos JSON genérico.
