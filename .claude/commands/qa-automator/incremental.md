---
description: Modo incremental — evoluciona una suite YA generada por el agente cuando el FD/.feature cambia. Diff determinístico de criterios (added/modified/renumbered/removed), genera solo lo nuevo, actualiza lo impactado y reporta lo obsoleto sin borrarlo. Funcional desde v0.2.x.
argument-hint: "(--gherkin=<path> | --fd=<path>) --url=<URL> [--style=<contract.yaml>] [--baseline=<path>]"
---

# /qa-automator:incremental

Modo **incremental** del agente `ia4d-qa-automator`. Entrada = **la versión nueva del spec**
(`.feature` Gherkin o FD markdown) **+ URL de staging**, sobre un workspace donde **ya existe una
suite generada por el agente** (`tests/e2e/<site-id>/` con anotaciones `@criterion RF-NNN`). No
regenera la suite entera: detecta qué requisitos son **nuevos**, cuáles **cambiaron** (y qué specs
existentes impactan), cuáles **desaparecieron**, y actúa solo sobre el delta.

No es un módulo de entrada nuevo: es el mismo motor S2/S3 con un **diff determinístico de
criterios** delante (`src/criteria-diff.ts`, no LLM — regla dura #5) y el Writer en **update mode**
para los specs impactados. La memoria durable entre runs es el **baseline de criterios**
(`config/criteria-baseline/<site-id>.json`, versionado, fuera de `.work/`) + las anotaciones
`@criterion` de la propia suite.

## Arguments

- `--gherkin=<path>` **o** `--fd=<path>` (uno de los dos, obligatorio): la versión NUEVA del spec.
  Con `--gherkin` la ingesta es la de S2 (`ia4d-spec-parser`, determinística); con `--fd` la de S3
  (`ia4d-spec-refiner`).
- `--url=<URL>` (obligatorio): staging, debe estar en `config/allowed-targets.yaml`.
- `--style=<path>` (opcional, default: el contract del sitio si existe).
- `--baseline=<path>` (opcional, default: `config/criteria-baseline/<site-id>.json`): snapshot de
  criterios del run anterior. Si no existe, el diff **degrada honesto** (ver Acto 2).
- `--output-dir=<path>` (opcional, default: `tests/e2e/<site-id>`): DEBE ser el directorio de la
  suite existente — el diff cruza sus anotaciones `@criterion`.

## Procedure (los 5 actos)

### Acto 1 — Comprender

1. Invoca `ia4d-mode-router` via Task tool con los flags. Confirma S2 o S3 según la entrada.
2. Invoca `ia4d-compliance-checker` con la URL y `config/allowed-targets.yaml`.
   - `block` → aborta (exit 2). `warn` → muestra y pregunta (ask-first).

**1.a — Namespace por sitio + limpieza SELECTIVA (crítico en incremental):** deriva `<site-id>` del
basename del `--style`; `<workDir>=.work/<site-id>`; **limpia `<workDir>/` al arrancar** igual que
S2/S3, pero **NO toques `tests/{e2e,pages,components}/<site-id>/`** — en incremental la suite
existente es INPUT, no residuo de un run anterior. Tampoco `config/tc-registry/<site-id>.json` ni
`config/criteria-baseline/<site-id>.json`. Exporta `QA_WORK_DIR=<workDir>`.

**1.b — Ingesta del spec nuevo** (idéntica a S2 o S3 según flag):
3. `--gherkin` → invoca `ia4d-spec-parser`; `--fd` → invoca `ia4d-spec-refiner`. Output:
   `<workDir>/criteria.json` + `refinement-questions.md`.
4. **Gate de open_questions (ask-first, no override)**: criterios bloqueados NO se generan ni se
   usan para modificar specs existentes. Igual que S2/S3.

### Acto 2 — Detectar el delta (determinístico, no LLM)

5. Ejecuta el diff:
   ```sh
   npx tsx src/criteria-diff.ts --baseline=<--baseline> --new=<workDir>/criteria.json \
     --specs-dir=tests/e2e/<site-id> --output=<workDir>/impact-report.json
   ```
6. Lee `impact-report.json` y **muéstrale al QA el resumen** antes de tocar nada:
   - `added` — RF nuevos → se generarán specs nuevos.
   - `modified` (+ `changed_fields` + `spec_files`) — RF cambiados → el Writer actualizará esos specs.
   - `renumbered` — mismo criterio, ID desplazado (inserción en el FD) → solo se actualiza la
     anotación `@criterion` (mecánico, paso 12); el test no se toca.
   - `removed` + `orphan_specs` — se **reportan**; los specs NO se borran (decisión del QA, ver Hard rules).
   - `existing_unverified` — solo sin baseline: specs que citan RF del spec nuevo pero sin snapshot
     con el que comparar. **Pregunta al QA** (ask-first): (a) tratarlos como vigentes (no tocar),
     (b) regenerarlos, o (c) abortar y construir baseline primero. Sin baseline no se adivina qué cambió.
7. Si `added`, `modified` y `renumbered` están vacíos → **no hay delta accionable**: reporta y
   termina limpio (exit 0). No se regenera nada "por si acaso".
8. Registra al audit-log: `{ source: 'command', action: 'impact_detected', metadata: { added, modified, renumbered, removed, orphans } }`.

### Acto 3 — Mapear (solo los flujos del delta)

9. Aplica el **mapeo planner POR FLUJO + guarda anti-fabricación 8.5** de
   [`req-driven.md`](req-driven.md) (Acto 2, pasos 8-8.5) **solo** para los flujos de los criterios
   en `added` ∪ `modified`. Los flujos `unchanged` no se re-mapean (su spec ya está verde).
10. Invoca `ia4d-discovery-analyzer` con los fragmentos mapeados + `--criteria=<workDir>/criteria.json`
    → `<workDir>/discovery-report.json` con `criteria_mapping`. Drift diff idéntico a S2/S3 (paso 9.b
    de `req-driven.md`): un RF `added` que no mapea en staging va a `drift-report.json`, no se fabrica.

### Acto 4 — Materializar el delta

11. **POM**: ejecuta el scaffolder hacia un staging aislado y copia **solo las pages nuevas**:
    ```sh
    npx tsx src/scripts/scaffold-poms.ts <workDir>/discovery-report.json <workDir>/pom-staging/pages <workDir>/pom-staging/components
    ```
    Copia a `tests/pages/<site-id>/` únicamente los archivos que NO existan ya. Las pages existentes
    las ajusta el Writer solo si el criterio modificado lo exige (nunca se pisan en bloque).
12. **Renumbered (mecánico, sin Writer)**: por cada entrada, Edit sobre sus `spec_files`
    actualizando `@criterion <old_rf>` → `@criterion <rf>` (y el `source_ref` si cambió). Registra
    al audit-log `{ action: 'edit_file', rule: 'criterion-renumber' }`.
13. **Added**: por cada RF nuevo no bloqueado y no en drift, invoca `ia4d-writer` igual que S2/S3
    (plan-entry + `--criteria` + `--style-contract` + POM dir + `--output` con ID estable del
    `tc_registry`). Writer↔Reviewer ping-pong N≤2, hooks PII/anti-fixme como siempre.
14. **Modified**: por cada RF, invoca `ia4d-writer` en **update mode**:
    `--update-spec=<spec_file>` + `--criteria` + `--impact-entry='<json del impact-report>'`.
    El Writer EDITA el spec existente (mismo archivo, mismo TC id): ajusta solo lo que
    `changed_fields` exige, conserva lo que sigue válido, y pasa por el Reviewer igual que un spec
    nuevo. Ver `ia4d-writer.md` § "Update mode".
15. `ia4d-a11y-injector` sobre los specs nuevos (los editados ya lo llevan; verifica que el bloque
    a11y sobrevivió a la edición). Consolida feedback: `QA_WORK_DIR=<workDir> npx tsx src/scripts/consolidate-reviews.ts`.

### Acto 5 — Juzgar y cerrar el ciclo

16. Judge opcional off por defecto (`QA_ENABLE_JUDGE`), igual que S2/S3.
17. **Verification acotada**: ejecuta SOLO los specs tocados (added + modified + renumbered):
    ```sh
    npx playwright test <spec_files...> --reporter=list
    ```
    con `QA_WORK_DIR`/`QA_BASE_URL` (y `QA_STORAGE_STATE` si el contract trae `auth.enabled`).
    Ofrece al QA correr la suite completa del sitio al final (regresión) — recomendado, no forzado.
18. **Actualiza el baseline SOLO si el run cerró bien** (Reviewer aprobó todo lo tocado y la
    verification acotada quedó verde): copia `<workDir>/criteria.json` →
    `config/criteria-baseline/<site-id>.json`. Un run fallido NO avanza el baseline (el próximo
    incremental vería un delta falso). Registra `{ action: 'write_file', rule: 'criteria-baseline' }`.
19. Genera `<workDir>/qa-automator-run-summary.json` con el delta aplicado: specs nuevos, specs
    actualizados (+ changed_fields), renumeraciones, drift, y la lista `removed`/`orphan_specs`
    **como decisión pendiente del QA**.

## Outputs (consolidados)

- `<workDir>/impact-report.json` — el delta determinístico (added/modified/renumbered/removed/orphans)
- `<workDir>/criteria.json`, `<workDir>/drift-report.json`, `<workDir>/discovery-report.json`
- Specs nuevos y editados bajo `tests/e2e/<site-id>/` (con `@criterion` al día)
- `config/criteria-baseline/<site-id>.json` actualizado (solo si el run cerró verde)
- `<workDir>/review-feedback.json`, `<workDir>/audit-log.json`, `<workDir>/qa-automator-run-summary.json`

## Hard rules

- **Nunca borra specs.** `removed` y `orphan_specs` se reportan como decisión del QA. Un requisito
  retirado puede ser drift del FD, no de la app — borrar en automático destruiría evidencia.
- **El diff es determinístico** (`src/criteria-diff.ts`): matching por id + hash de contenido en
  pases (unchanged → renumbered → modified → added/removed). El LLM no decide qué cambió.
- **La suite existente es input**: la limpieza de arranque NO toca `tests/*/<site-id>/`,
  `config/tc-registry/` ni `config/criteria-baseline/`.
- **Sin baseline no se adivina**: `existing_unverified` es ask-first, no se regenera en silencio.
- **El baseline solo avanza con run verde** (paso 18). Nunca a mitad.
- Gates de siempre sin cambios: compliance pre-flight y open_questions sin override; Writer+Reviewer
  obligatorios; Judge off por defecto; drift se reporta, no se fabrica.
- Cada paso registra al audit-log (`impact_detected`, `criterion-renumber`, `criteria-baseline`...).

## Reference

- [`src/criteria-diff.ts`](../../../src/criteria-diff.ts) — el diff determinístico (library + CLI)
- [`docs/references/fd-criteria-schema.md`](../../../docs/references/fd-criteria-schema.md) — contrato de `criteria.json`
- [`.claude/commands/qa-automator/req-driven.md`](req-driven.md) — Actos 2-5 que este modo reusa (mapeo por-flujo, guarda 8.5, drift)
- [`.claude/agents/ia4d-writer.md`](../../agents/ia4d-writer.md) — § "Update mode"
