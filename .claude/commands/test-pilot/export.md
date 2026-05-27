---
description: Consolida plan + specs + judge + run + audit en un test-catalog.json genérico. Invoca ia4d-exporter. Output consumible por Xray/Zephyr/TestRail futuro.
argument-hint: --specs-dir=<path> [--plan=<path>] [--judge-report=<path>] [--run-report=<path>] [--audit-report=<path>] [--audit-log=<path>] [--out=<path>]
allowed-tools: Task, Read, Bash(mkdir:*)
---

# /test-pilot:export

Eres el orquestador de `/test-pilot:export`. Tu trabajo: invocar al subagent `ia4d-exporter` con los paths a los artefactos del batch y producir `test-catalog.json`. Pequeño, lineal, sin lógica adicional.

Argumentos crudos: `$ARGUMENTS`

## Paso 0 — Parsear argumentos

Extrae:

- `--specs-dir=<path>` — obligatorio. Si falta, aborta con:

  ```
  ERROR: --specs-dir no provisto.
  Uso: /test-pilot:export --specs-dir=<path> [--plan=...] [--judge-report=...] [--run-report=...] [--audit-report=...] [--audit-log=...] [--out=<path>]
  ```

- `--plan=<path>` — opcional. Default: si existe `output/plan/test-plan.md`, úsalo; si no, omite.
- `--judge-report=<path>` — opcional. Default: `output/judge/judge-report.json` si existe.
- `--run-report=<path>` — opcional. Default: `<specs-dir>/run-report.json` si existe.
- `--audit-report=<path>` — opcional. No hay default; solo pasa si el SDET lo declara.
- `--audit-log=<path>` — opcional. Default: `audit-log.json` en el cwd.
- `--out=<path>` — opcional. Default: `output/export/test-catalog.json`.

Para los defaults, **verifica con `Read` si el archivo existe** antes de pasarlo al subagent. Si no existe, omites el flag (el CLI tolera la ausencia).

## Paso 1 — Preparar output dir

Si `--out` apunta a una ruta bajo `output/`, ejecuta:

```bash
mkdir -p output/export
```

(Adapta el dir al path real del `--out`.) Si el SDET dio un `--out` custom, asume que el dir ya existe.

## Paso 2 — Invocar ia4d-exporter

Invoca el subagent `ia4d-exporter` vía Task tool con un prompt que liste los paths exactos:

> Genera test-catalog.json consolidando:
> - specs-dir: `<path>`
> - plan: `<path o "—">`
> - judge-report: `<path o "—">`
> - run-report: `<path o "—">`
> - audit-report: `<path o "—">`
> - audit-log: `<path o default audit-log.json>`
> - out: `<path o default output/export/test-catalog.json>`
>
> Devuelve el JSON crudo tal cual al final.

Espera al subagent. Cuando vuelva:

- Si `VERDICT: ERROR`: expón el error tal cual al SDET y termina.
- Si `VERDICT: PASS`: continúa al Paso 3.

## Paso 3 — Output al SDET

```
/test-pilot:export terminado.

Catalog:  <out path>
Tests:    <total>
With judge:   <withJudge>
With run:     <withRun>  (passed: <passed>, failed: <failed>, flaky: <flaky>, skipped: <skipped>)
avgJudgeScore: <avg o "—">
weak:     <weakTests>

a11y policy: <mode> (<reason>)   ← si hubo downgrade
```

Si el catalog tiene 0 entries, antepón al output:

```
WARN: 0 tests en el catalog. ¿specs-dir vacío o sin .spec.ts válidos?
```

## Reglas duras

- **No edites el catalog tú.** El CLI ya lo escribió. Solo lo expones.
- **No invoques otros commands.** Este command es terminal — recibe artefactos pre-generados y consolida. No regenera nada.
- **No invoques subagents en paralelo.** Solo `ia4d-exporter`, una vez.
- **No filtres entries por threshold.** El catalog refleja TODO el batch — incluyendo specs WEAK o failed. Si el connector futuro quiere filtrar, lo hace allí.
- **No infieras paths que no existen.** Verifica con `Read` antes de pasar defaults.

## Lo que NO haces

- No corres el judge ni Playwright (`hooks/run-playwright.ts`). Si no hay reports, el catalog queda con campos `null` — eso es válido.
- No transformas el catalog a formato TMS-específico. Eso es scope post-MVP (connector dedicado).
- No escribes en `audit-log.json` directamente — los hooks transversales registran tus tool calls.
