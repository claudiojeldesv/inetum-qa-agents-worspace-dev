---
description: Módulo S3 — Spec-refiner (Forma B). Genera tests E2E desde un FD (markdown libre) + URL de staging, con trazabilidad RF-NNN y detección de drift FD↔implementación. Funcional en v0.2.
argument-hint: "--fd=<path> --url=<URL> [--style=<contract.yaml>]"
---

# /qa-automator:spec-refiner

Módulo **S3 Spec-refiner (Forma B)** del agente `ia4d-qa-automator`. Entrada = **FD en markdown libre + URL de staging**. El FD da el *qué* (criterios RF-NNN, flujos); la URL da el *cómo* (DOM real, locators, run verde). Reusa el motor S4 validado (discovery, POM scaffolder, Writer↔Reviewer↔Judge, los 3 componentes de Fase C); las únicas piezas propias de S3 son la ingestión del FD (`ia4d-spec-refiner`), el planner en modo **mapear-contra-DOM** y el **diff de drift**.

Valor diferenciador sobre S4: (1) **trazabilidad real** — el `@criterion` cita un RF-NNN del FD, no prosa del discovery; (2) **detección de drift** — un flujo que el FD declara y staging no expone se **reporta como gap, NO se fabrica el test**.

## Arguments

- `--fd=<path>` (obligatorio): FD en markdown.
- `--url=<URL>` (obligatorio): URL de staging, debe estar en `config/allowed-targets.yaml`. **Forma B exige URL** — sin target no hay DOM, locators ni run verde (Forma A descartada).
- `--style=<path>` (opcional, default: el contract del sitio si existe, p.ej. `style-contracts/parabank.yaml`): YAML del Style Contract.
- `--output-dir=<path>` (opcional, default: `tests/e2e`): dónde se escriben los `.spec.ts`.
- `--criteria-dir=<path>` (opcional, default: `docs/findings/faseD-s3`): dónde el refiner escribe `criteria.json` + `refinement-questions.md`.

## Procedure (los 5 actos)

### Acto 1 — Comprender

1. Invoca `ia4d-mode-router` via Task tool con los flags recibidos.
2. Confirma `module: S3`. Si `status: needs_input` (`--fd` sin `--url`) → aborta y dile al SDET que Forma B exige URL de staging. Forma A (FD sin target) no está implementada.
3. Invoca `ia4d-compliance-checker` via Task tool con la URL y `config/allowed-targets.yaml`.
   - `block` → aborta (exit 2). `warn` → muestra y pregunta (ask-first).

**1.b — Ingestión del FD** (sustituye al brief manual de S4):
4. Invoca `ia4d-spec-refiner` via Task tool:
   ```
   --fd=<--fd> --target-url=<--url>
   --output=<criteria-dir>/criteria.json
   --questions-output=<criteria-dir>/refinement-questions.md
   ```
5. Lee `criteria.json`. De él salen: los criterios RF-NNN y el **brief** (`brief.flows`, `brief.entry`, `brief.ignore`) que en S4 teclea el SDET.
6. **Gate de open_questions (ask-first, no override).** Si hay criterios con `then` `[AMBIGUO ...]` o `open_questions` no vacío, muéstralos al SDET (resumen de `refinement-questions.md`) y avisa: esos criterios **NO se generan** en este run (opción (a), decisión SDET). El SDET puede responder y re-ejecutar, o continuar solo con los criterios claros. No se fabrica el comportamiento ambiguo.
7. Registra al audit-log: `{ source: 'command', action: 'fd_ingested', metadata: { criteria_count, blocked_count, flows } }`.

### Acto 2 — Mapear (modo mapear-contra-DOM, no descubrir)

8. Invoca `playwright-test-planner` (nativo) via Task tool. Prompt en **modo mapear** (no exploración libre):
   ```
   Mapea contra el DOM de <url> los siguientes flujos del FD: <brief.flows>.
   Punto de entrada: <brief.entry>. NO explores: <brief.ignore>.
   Para CADA flujo, localiza las pantallas y elementos que lo realizan en el DOM real.
   Si un flujo NO existe en el DOM (ruta/pantalla ausente), repórtalo como NO MAPEADO —
   NO inventes pasos ni pantallas para que parezca cubierto.
   ```
   Esperar `<saved-plan>.md` + `planner_save_plan`.
9. Invoca `ia4d-discovery-analyzer` con el plan **y `--criteria=<criteria-dir>/criteria.json`** (activa el S3 mode):
   - Output: `discovery-report.json` con el bloque `criteria_mapping` (`mapped` rf↔scenario, `unmapped_flows`).

**9.b — Diff de drift (determinístico, en el command — no LLM):**
10. Calcula `drift = brief.flows − {flows en criteria_mapping.mapped}`. Cruza con `criteria.json` para anotar el RF de cada flujo en drift. Escribe `drift-report.json`:
    ```json
    { "target_url": "<url>", "source_fd": "<--fd>",
      "drift": [ { "rf": "RF-005", "flow": "bill-pay",
                   "fd_source_ref": "fd-parabank.md:38-42",
                   "reason": "declarado en el FD, no mapeado en staging" } ],
      "covered": [ { "rf": "RF-001", "flow": "login", "scenario": "login.happy-path" } ] }
    ```
    El drift se **reporta**, no se fabrica. Registra al audit-log: `{ source: 'command', action: 'drift_detected', metadata: { drift_count, rfs } }`.

### Acto 3 — Estructurar

11. Ejecuta el POM scaffolder sobre `discovery-report.json` (igual que S4):
    ```sh
    npx tsx -e "
    import { readFileSync } from 'node:fs';
    import { scaffold } from './src/pom-scaffolder.ts';
    const dr = JSON.parse(readFileSync('discovery-report.json', 'utf8'));
    scaffold(dr.screens, { outputDir: 'tests/pages' });
    "
    ```
    (Si el `-e` inline falla en win32 —hallazgo Fase B #14— usar un `.mjs` en el workspace.)

### Acto 4 — Materializar

**11.b — Auth setup** (solo si el contract tiene `auth.enabled: true`): idéntico a S4 (ver `autonomous.md` Acto 4 paso 8.b). Genera `auth.setup.ts`.

12. Para cada `scenario` en `discovery-report.scenarios_recommended` **cuyo RF NO esté bloqueado por open_questions y NO esté en drift** (paralelizable):
    - Invoca `ia4d-writer` via Task tool con `--plan-entry`, `--style-contract`, `--pom-skeleton-dir`, `--output`, `--discovery-report` **y `--criteria=<criteria-dir>/criteria.json`** (activa el S3 mode: `@criterion` cita RF-NNN + source_ref; usa given/when/then del criterio).
    - El Writer escribe el `.spec.ts` e invoca al Reviewer (ping-pong N≤2). Pasa por el hook `pii-post.ts`.
13. (Opcional) `ia4d-style-enforcer` por cada `.spec.ts`.
14. (Obligatorio) `ia4d-a11y-injector` por cada `.spec.ts` pasándole `--style-contract` (scan siempre; gate por `a11y.fail_on_violations`, **default `false`** → modo warning; reactivable por-sitio con `true`). Igual que S4.

### Acto 5 — Juzgar

15. **Judge opcional, off por defecto.** Solo si `QA_ENABLE_JUDGE` está seteado (`echo $env:QA_ENABLE_JUDGE`) invoca `ia4d-judge` por cada `.spec.ts` con el `review-feedback.json` consolidado. Si no, **omite el Judge** y registra al audit-log `{ source: 'command', action: 'skip', rule: 'judge', reason: 'judge off (QA_ENABLE_JUDGE unset)' }`.
16. (Solo si el Judge corrió) Lee scores. Si >30% < 0.5 → pausa ask-first.
17. Genera `qa-automator-run-summary.json` con: tests generados (+ su RF), scores (o `judge: skipped`), verdicts, axe results, **criterios bloqueados (pendientes de respuesta SDET)** y **drift** (RF declarados sin cobertura).

## Outputs (consolidados)

- `criteria.json` + `refinement-questions.md` (ingestión del FD)
- `drift-report.json` (RF declarados no mapeados en staging)
- `discovery-report.json` (con `criteria_mapping`)
- `tests/pages/*.page.ts`, `tests/e2e/*.spec.ts` (con `@criterion RF-NNN`)
- `review-feedback.json`, `judge-report.json`, `audit-log.json`
- `qa-automator-run-summary.json`

## Verification step

Idéntico a S4 (`autonomous.md`): ejecuta `npx playwright test` seteando `QA_BASE_URL` con `--url` (y `QA_STORAGE_STATE` si el contract tiene `auth.enabled: true`; `QA_SCREENSHOT` si tiene `evidence.screenshots` distinto del default — evidencia visual para `/qa-automator:report`).

```sh
# Con auth (PowerShell):
#   $env:QA_BASE_URL='<--url>'; $env:QA_STORAGE_STATE='playwright/.auth/<project>.json'; npx playwright test --reporter=list
```

- Verdes → run exitoso. El SDET ve qué RF cubre cada test verde, qué RF quedaron en drift, y qué RF están pendientes de respuesta a una refinement-question.

## Hard rules

- Forma B exige `--url`. Sin target, aborta (no hay Forma A).
- Gate de open_questions y compliance pre-flight: **sin override**.
- No se fabrica drift ni el `then` ambiguo. Un flujo no mapeado se reporta; un criterio ambiguo no se genera.
- Writer+Reviewer activos (igual que S4); el **Judge es opcional, off por defecto** (`QA_ENABLE_JUDGE`).
- Cada invocación de subagent y cada decisión (ingest, drift, bloqueo, judge omitido) registra al audit-log.
- Paralelismo del Acto 4 prioritario para los criterios no bloqueados.

## Reference

- [`SPEC.md`](../../../SPEC.md) §7 — "S3 — diseño decidido: Forma B"
- [`references/fd-criteria-schema.md`](../../../references/fd-criteria-schema.md) — contrato de `criteria.json`
- [`.claude/commands/qa-automator/autonomous.md`](autonomous.md) — el motor S4 que S3 reusa (Actos 3-5 idénticos)
- [`docs/findings/wild-sites-report.md`](../../../docs/findings/wild-sites-report.md) — validación parabank (back-end reusado)
