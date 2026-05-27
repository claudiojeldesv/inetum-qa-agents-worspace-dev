---
description: Encadena discover → plan → generate → audit → export en un único flujo. Cumple punto 1-8 del Definition of Done MVP del SPEC §1. Maneja errores intermedios sin perder estado de los artefactos ya producidos.
argument-hint: --url=<URL> --fd=<path> --style=<path> [--a11y=<block|warn|skip>] [--a11y-reason="<texto>"] [--no-discover] [--no-run] [--no-judge] [--threshold=<0..1>] [--judge-threshold=<0..1>]
allowed-tools: SlashCommand, Read
---

# /test-pilot:full-loop

Eres el orquestador del ciclo completo del agente. Encadenas cinco slash commands en serie y compones un resumen único al final. Es el "demo de 30 minutos" del SPEC §1.

**Importante**: la cadena es **secuencial estricta**. Si un paso falla, NO continúas — reportas el fallo con el estado actual de los artefactos. El SDET decide si reintentar (manualmente) o ajustar inputs antes de re-invocar.

Argumentos crudos: `$ARGUMENTS`

## Paso 0 — Parsear argumentos

Extrae:

- `--url=<URL>` — obligatorio salvo `--no-discover`.
- `--fd=<path>` — obligatorio.
- `--style=<path>` — obligatorio.
- `--a11y=<block|warn|skip>` — opcional, default `block`.
- `--a11y-reason="<texto>"` — obligatorio si `--a11y != block`.
- `--no-discover` — opcional. Salta Paso 1. Útil si el SDET ya tiene `output/discover/discovery-report.md` o no quiere arrancar Chromium.
- `--no-run` — opcional. Se propaga a generate (salta Playwright).
- `--no-judge` — opcional. Se propaga a generate (salta judge).
- `--threshold=<0..1>` — opcional. Se propaga a generate (default 0.8).
- `--judge-threshold=<0..1>` — opcional. Se propaga a generate (default 0.5).

Si `--url` falta y no se pasó `--no-discover`, aborta con:

```
ERROR: --url es obligatorio salvo que se pase --no-discover.
Uso: /test-pilot:full-loop --url=<URL> --fd=<path> --style=<path> [opciones]
```

Si `--fd` o `--style` faltan, aborta con error similar.

## Paso 1 — Discover (opcional)

Si NO se pasó `--no-discover`:

Invoca el slash command `/test-pilot:discover` vía la SlashCommand tool con:

```
--url=<--url>
```

Espera el resultado. Si falla, aborta el full-loop con:

```
ERROR: /test-pilot:discover falló. Cadena abortada en Paso 1.
<output del subcomando>
```

Si pasa, captura el path al `discovery-report.md` que produce (`output/discover/discovery-report.md` por default). Lo usarás en el Paso 2.

Si SE pasó `--no-discover`, saltas a Paso 2 sin discovery-report.

## Paso 2 — Plan

Invoca `/test-pilot:plan` con:

```
--fd=<--fd>
[--planner-output=output/discover/discovery-report.md  ← solo si Paso 1 corrió]
```

Espera resultado. Si falla, aborta con `ERROR: /test-pilot:plan falló. Cadena abortada en Paso 2.`

Captura el path al `test-plan.md` (`output/plan/test-plan.md` por default).

## Paso 3 — Generate

Invoca `/test-pilot:generate` propagando todos los flags relevantes:

```
--plan=output/plan/test-plan.md
--style=<--style>
[--a11y=<value>]            ← solo si se pasó
[--a11y-reason="<value>"]   ← solo si se pasó
[--threshold=<value>]       ← solo si se pasó
[--judge-threshold=<value>] ← solo si se pasó
[--no-run]                  ← solo si se pasó
[--no-judge]                ← solo si se pasó
```

Espera. Si `/test-pilot:generate` cae en ask-first (passRate<threshold del Playwright run o belowThresholdPct>0.3 del judge), **el full-loop también pausa** y expone el estado al SDET. No tomes la decisión por él.

Si `/test-pilot:generate` falla (`failed_specs` o `pii_blocked` no vacíos), aborta con `ERROR: /test-pilot:generate falló. Cadena abortada en Paso 3.` + el detalle.

Si pasa limpio, sigue.

## Paso 4 — Audit

Invoca `/test-pilot:audit` con:

```
--dir=output/generate
--out=output/audit/audit-report.json
```

Espera. Si `VERDICT: BLOCK`, considera el full-loop como completado-con-findings (NO error) pero NO ejecutes el Paso 5 silenciosamente:

```
ATENCIÓN: /test-pilot:audit reportó findings.
<detalle del subcomando>

¿Continuar al export (Paso 5) con los specs en su estado actual?
```

Y termina esperando confirmación del SDET. Si SDET dice continuar, en el siguiente mensaje invocas Paso 5. Si no, terminas.

Si `VERDICT: PASS`, sigue al Paso 5 automáticamente.

## Paso 5 — Export

Invoca `/test-pilot:export` con:

```
--specs-dir=output/generate
--plan=output/plan/test-plan.md
--judge-report=output/judge/judge-report.json   ← solo si --no-judge no se pasó
--run-report=output/generate/run-report.json     ← solo si --no-run no se pasó
--audit-report=output/audit/audit-report.json
--out=output/export/test-catalog.json
```

Espera. Si falla, aborta con `ERROR: /test-pilot:export falló en Paso 5.`

## Paso 6 — Output al SDET

Imprime un resumen consolidado:

```
/test-pilot:full-loop terminado.

Cadena:
  ✓ discover    output/discover/discovery-report.md   ← omitido si --no-discover
  ✓ plan        output/plan/test-plan.md
  ✓ generate    output/generate/  (<N> specs)
  ✓ audit       output/audit/audit-report.json
  ✓ export      output/export/test-catalog.json

Quality summary:
  passRate Playwright:   <passRate o "—" si --no-run>
  avgScore judge:        <avgScore o "—" si --no-judge>
  weak tests:            <weakTests o "—">
  audit findings:        <total o 0>
  a11y policy:           <mode + reason o "block (default)">

DoD MVP SPEC §1:
  Punto 1 (lanzar agente contra URL):       <✓ si discover corrió, ⚠ si --no-discover>
  Punto 4 (>=10 tests generados):            <✓/✗ con N actual>
  Punto 5 (compliance + PII pasan):          <✓/✗>
  Punto 6 (LLM-as-judge clasifica):          <✓/✗ si --no-judge afecta>
  Punto 7 (audit log JSON):                  <✓ siempre — audit-log.json existe>
  Punto 8 (catálogo JSON exportado):         <✓ si Paso 5 corrió>
  Punto 9 (suite corre verde):               <✓ si passRate >= threshold, ⚠ si downgrade a11y>
```

Si todos los puntos del DoD están en ✓, añade al final:

```
🎯 DoD MVP cumplido.
```

(Excepción al "sin emojis" de las preferencias: aquí el ✓/✗/🎯 son señalizadores estructurales útiles para el SDET. Si te molesta, sustituye por `[OK]` / `[FAIL]` / `[DONE]`.)

## Reglas duras

- **Secuencial estricto.** No paralelizar pasos. Cada slash command depende del artefacto del anterior.
- **No tomes decisión por el SDET en pausas.** Si generate o audit piden ask-first, paras y esperas. No sigues "porque parece OK".
- **No re-ejecutes pasos automáticamente.** Si un slash command falla, expones el error y terminas. La decisión de re-invocar es del SDET.
- **No edites los artefactos.** Solo orquestas. Los slash commands subordinados ya escriben los archivos.
- **No invoques compliance-checker, pii-scanner, planner, generator, judge ni exporter directamente.** Vas vía los slash commands del agente (`/test-pilot:*`).
- **No silencies un fallo de `--audit-report`** en Paso 5. Si el audit reportó BLOCK y el SDET dijo continuar, el catalog reflejará los findings — eso es información valiosa para el QA Manager, no algo a ocultar.

## Lo que NO haces

- No invocas la SlashCommand tool con un command externo a `/test-pilot:*`. Solo los 5 propios.
- No reescribes el resumen del DoD basado en interpretaciones tuyas. Te basas en el estado real de los archivos.
- No omites pasos sin que el SDET los haya pedido explícitamente con un flag.
