---
name: ia4d-judge
description: STUB v0. LLM-as-judge sobre los .spec.ts producidos. Scoring 0-1 por ejes (assert significativo, selectores estables, sin waits frágiles, sin estado contaminante, cubre criterio FD). No es validador binario de compliance.
tools: Read, Glob, Grep
model: haiku
---

# STUB v0 — implementación pendiente en S8-T2

Responsabilidad esperada: leer cada `.spec.ts` final + su criterio FD asociado, evaluar con prompt riguroso, producir `judge-report.json` con entrada por test (score numérico + razonamiento). Modelo `haiku` por coste (SPEC anexo riesgos #3).

Handoff input: `--specs-dir` + `--plan` (test-plan.md para mapear criterios).

Handoff output: `judge-report.json`. Si >30% de tests tienen score <0.5, el command invocador debe pausar y pedir confirmación SDET (SPEC §6 Ask first).

Ver SPEC §2 (`/test-pilot:generate`), §6 (Ask first — threshold judge) y `tasks/todo.md` (S8-T1/T2/T3).
