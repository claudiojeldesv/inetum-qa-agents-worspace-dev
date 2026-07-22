---
description: Sana los tests rojos del último run con el Healer nativo de Playwright y AUDITA el resultado (el Healer no es juez) — suite re-ejecutada + pre-review + Reviewer + verify-a11y, healed[] al run-summary y trazabilidad al audit-log. Post-proceso desacoplado, re-ejecutable. Off por defecto en autonomous (knob healing.enabled, regla #10).
argument-hint: "[--work-dir=.work/<site-id>] [--style=<contract.yaml>] [--url=<URL override>]"
---

# /ia4d-qa-automator:heal

> **Pre-check (workspace).** Este comando corre DENTRO de un workspace desplegado del agente. Antes de continuar, verifica que en el directorio actual existen `config/allowed-targets.yaml` y `playwright.config.ts`. Si falta alguno, NO sigas: indica al usuario que ejecute `/ia4d-qa-automator:init <carpeta>` (o abra su workspace ya desplegado) y detente.

Post-proceso de **sanación** de `ia4d-qa-automator` (mismo patrón desacoplado que `report`): toma los
rojos del `qa-automator-run-summary.json` de un run ya ejecutado, invoca `playwright-test-healer`
(nativo) por spec rojo y aplica el **protocolo de auditoría post-heal validado en Q1** — el Healer
**no es juez**: su output se re-ejecuta, pasa pre-review determinístico, Reviewer sobre los specs
afectados y verify-a11y. No genera tests nuevos: repara los existentes. Re-ejecutable sin efectos
si no hay rojos (coherente con el principio "sanación al final", Fase A).

Lo mecánico lo encadena `src/scripts/run-heal-mecanico.ts` en 2 stages (misma convención que
`run-s4-mecanico`: exit 0 = continúa · exit 2 = aborta · exit 3 = `pending` → PAUSA ask-first).
Tú conservas el juicio: invocar al Healer, anotar causa raíz, invocar al Reviewer, reportar al QA.

**Economía medida (Q1)**: μ $0,72/spec sanado (~$2,2 el lote de 3), 3/3 éxito. Los rojos suelen
compartir causa raíz en POMs compartidos → **1 fix cura N specs** (por eso el stage `verify`
re-ejecuta el namespace ENTERO, no solo los rojos: blast radius verificado).

## Arguments

- `--work-dir=<path>` (opcional): `<workDir>` del run a sanar. Sin él: `QA_WORK_DIR`, o el único
  `.work/<site-id>/` con `qa-automator-run-summary.json`; varios candidatos → el stage `setup`
  devuelve `pending` y **preguntas al QA cuál** (no elijas en silencio).
- `--style=<path>` (opcional, default `config/style-contracts/<site-id>.yaml` si existe): Style
  Contract para pre-review/a11y/auth del re-run.
- `--url=<URL>` (opcional): override del target; default `target_url` del run-summary.

## Procedure

### 1. Setup (rojos + compliance, sin override)

`npx tsx src/scripts/run-heal-mecanico.ts setup [--work-dir=…] [--style=…] [--url=…]`

- Exit 2 → target bloqueado por compliance. Aborta con la razón del verdict.
- `pending:"work-dir-selection"` → muestra los candidatos y pide al QA cuál; re-invoca con `--work-dir=`.
- `pending:"compliance-warn"` → muestra el warning; si el QA acepta, re-invoca con `--warn-acknowledged`.
- Exit 0 con `reds: []` → **no hay nada que sanar**: repórtalo y termina.
- Exit 0 con rojos → el JSON trae `work_dir`, `specs_dir`, `target_url`, `style` y `reds[]`
  (`tc_id`, `spec`, `failure`). Usa ESAS rutas en los prompts a subagents.

### 2. Healer por spec rojo (secuencial, foreground)

Por cada entrada de `reds[]`, invoca `playwright-test-healer` via Task — **SECUENCIAL, NUNCA en
paralelo** (comparten el navegador MCP, misma regla que el planner) y **SIEMPRE FOREGROUND**
(`run_in_background: false` EXPLÍCITO en cada Task). Prompt con RUTAS, nunca contenido inline:

```
Sana el test Playwright rojo <spec>. Fallo del último run: "<failure>".
Acota test_run/test_debug SOLO a <spec> (nunca la suite entera). La causa raíz puede estar en el
spec o en los POMs que importa (tests/pages/<site-id>/). Respeta las convenciones del Style
Contract <style> (prioridad de locators; getByTestId primero si el contract lo manda) y NO uses
test.fixme() (un hook lo bloquea). Al terminar reporta: causa raíz y ficheros tocados.
```

De cada respuesta del Healer anota: **ficheros tocados** y **causa raíz** (los necesitas en el paso 3).
Si el Healer no lo reporta claro, derívalo tú con `git diff --name-only` sobre `tests/`.

### 3. heal-notes.json (handoff por archivo)

Escribe `<workDir>/healing/heal-notes.json` — **UN array JSON, con Write completo** (nunca append):

```json
[
  { "spec": "tests/e2e/<site-id>/<spec>.spec.ts",
    "files_touched": ["tests/pages/<site-id>/x.page.ts"],
    "root_cause": "locator title asumido getByRole('heading'); el DOM real usa data-test",
    "cost_usd": null }
]
```

`cost_usd` es por-spec y solo se rellena si se midió (p.ej. análisis de stream posterior); `null`
no bloquea nada — el marco €/run de referencia es el de Q1 (μ $0,72/spec).

### 4. Reviewer por spec afectado (el Healer no es juez)

Specs afectados = los sanados + cualquier otro spec del namespace que importe un POM tocado
(compruébalo con Grep sobre `files_touched`). Por cada uno invoca `ia4d-reviewer` via Task
(paralelo permitido — son hojas; **foreground**, `run_in_background: false`), con `--test-file=<spec>`,
`--style-contract=<style>`, `--discovery-report=<workDir>/discovery-report.json`, `--iteration=0`
y esta instrucción de salida: **escribe el feedback en `<workDir>/healing/review-feedback/<basename>.json`**
(auditoría post-heal — NO pises el feedback del run generador en `<workDir>/review-feedback/`).

El Reviewer solo audita (read-only). Un `rejected` post-heal NO se auto-corrige: se reporta al QA
en el paso 6 (la decisión sobre código sanado es del QA, no del Writer).

### 5. Verify (protocolo post-heal mecánico)

`npx tsx src/scripts/run-heal-mecanico.ts verify [--work-dir=…] [--style=…]`

En UNA llamada: re-ejecuta la suite del namespace entero (blast radius), pre-review determinístico
(`<workDir>/healing/pre-review/`), verify-a11y, consolida el feedback post-heal del Reviewer,
**actualiza el run-summary** (refresca `run_result` por spec y añade/reemplaza `healed[]` con
`tc_id`, ficheros tocados, causa raíz, `cost_usd` y verdicts post-heal) y registra cada sanación
al audit-log (`rule:'healer-post-heal'`) — trazabilidad regulatoria del cambio sobre código de test.

- Exit 0 → suite verde. Exit 1 con `remaining_reds` → quedan rojos.

### 6. Cierre

Reporta al QA: specs sanados con causa raíz y verdicts post-heal (run/pre-review/a11y/Reviewer),
rojos remanentes si los hay, y la ruta del summary. Rojos remanentes o Reviewer `rejected` → decide
el QA: segunda pasada de heal, ajuste manual, o aceptar. **Máximo 2 pasadas de heal por run** sin
decisión explícita del QA (no busques el verde por fuerza bruta: si 2 pasadas no bastan, la causa
no es del test).

## Hard rules

- Compliance en setup no se salta. Sin override (regla dura #3).
- **El Healer no es juez**: ningún spec sanado se da por bueno sin el protocolo post-heal completo
  (suite + pre-review + Reviewer + verify-a11y). Un heal sin auditar no existe.
- Healer SECUENCIAL (navegador MCP compartido) y SIEMPRE FOREGROUND (`run_in_background: false`
  explícito — el default del harness puede ser background y mata el turno del orquestador).
- `test.fixme()` prohibido al Healer — el hook `pii-post.ts` lo bloquea; si el Healer insiste,
  repórtalo al QA como rojo no-sanable, no lo silencies.
- Task prompts a subagents llevan rutas, nunca payload inline.
- El feedback post-heal del Reviewer va a `<workDir>/healing/review-feedback/` — los verdicts del
  run generador no se sobrescriben (histórico auditable).
- Cada sanación queda en el audit-log con spec, ficheros tocados, causa raíz y verdicts (lo hace
  el stage `verify` solo; no dupliques entradas a mano).

## Relación con el knob `healing` del Style Contract (regla #10)

`healing.enabled: false` (default) → `autonomous` reporta los rojos y termina; el QA lanza este
command cuando decide. `healing.enabled: true` → `autonomous` encadena ESTE mismo procedimiento
(pasos 1-6) tras su Verification step. El command es independiente del knob: siempre disponible,
re-ejecutable, sobre el último run del `<workDir>`.

## Failure modes

- Sin `qa-automator-run-summary.json` → setup instruye a correr primero una generación. Termina.
- Target fuera de `allowed-targets.yaml` → exit 2, sin override.
- El Healer marca `test.fixme()` → hook lo bloquea; reporta el spec como no-sanable.
- `heal-notes.json` ausente al llegar a verify → el stage avisa y `healed[]` queda sin causa
  raíz/ficheros (ruidoso, no silencio): rellénalo y re-invoca verify.
- `remaining_reds` tras 2 pasadas → PAUSA: decisión del QA (el rojo puede ser un bug real del
  target — eso es un hallazgo, no un fallo del agente).
