---
description: Módulo S2 — Req-driven. Genera tests E2E desde un .feature Gherkin maduro + URL de staging, con trazabilidad RF-NNN, parameterización (Scenario Outline) y detección de drift spec↔implementación. Funcional desde v0.2 Fase E.
argument-hint: "--gherkin=<path> --url=<URL> [--style=<contract.yaml>]"
---

# /qa-automator:req-driven

Módulo **S2 Req-driven** del agente `ia4d-qa-automator`. Entrada = **Gherkin `.feature` maduro + URL
de staging**. El `.feature` da el *qué* (criterios RF-NNN ya estructurados por el autor, con
`Given/When/Then` explícito); la URL da el *cómo* (DOM real, locators, run verde). Reusa el motor
S4/S3 validado (discovery, POM scaffolder, Writer↔Reviewer↔Judge, los 3 componentes de Fase C); las
únicas piezas propias de S2 son la ingestión del `.feature` (`ia4d-spec-parser`, determinístico),
el planner en modo **mapear-contra-DOM** y el **diff de drift** — los mismos que S3.

Diferencia con S3 (Spec-refiner): S2 **no refina**. Asume Gherkin limpio. El `Then` es explícito,
así que no hay ambigüedad que escalar — un Scenario **sin** `Then` no se rellena, se reporta y se
enruta a `/qa-automator:spec-refiner` (S3). Diferencia con S4: trazabilidad real (`@criterion` cita
RF-NNN + `source_ref` del `.feature`) y detección de drift.

Valor extra sobre S3: **parameterización**. Un `Scenario Outline` + `Examples` se materializa como
un test data-driven (un caso por fila), citando el mismo RF-NNN.

## Arguments

- `--gherkin=<path>` (obligatorio): archivo `.feature` Gherkin.
- `--url=<URL>` (obligatorio): URL de staging, debe estar en `config/allowed-targets.yaml`. Sin
  target no hay DOM, locators ni run verde.
- `--style=<path>` (opcional, default: el contract del sitio si existe, p.ej. `config/style-contracts/parabank.yaml`).
- `--output-dir=<path>` (opcional, default: `tests/e2e`).
- `--criteria-dir=<path>` (opcional, default: `docs/findings/faseE-s2`): dónde el parser escribe
  `criteria.json` + `refinement-questions.md`.
- `--openapi=<path>`: **diferido a v0.4**. Si se pasa, el command informa y aborta (los tests de API
  necesitan un `ia4d-api-test-writer` que no existe aún; no comparten el motor DOM-céntrico).

## Procedure (los 5 actos)

### Acto 1 — Comprender

1. Invoca `ia4d-mode-router` via Task tool con los flags recibidos.
2. Confirma `module: S2`. Si `--openapi` sin `--gherkin` → aborta con el mensaje de deferral v0.4.
   Si `--gherkin` sin `--url` → aborta: S2 exige URL de staging (sin target no hay run verde).
3. Invoca `ia4d-compliance-checker` via Task tool con la URL y `config/allowed-targets.yaml`.
   - `block` → aborta (exit 2). `warn` → muestra y pregunta (ask-first).

**1.b — Ingestión del `.feature`** (sustituye al brief manual de S4):
4. Invoca `ia4d-spec-parser` via Task tool:
   ```
   --gherkin=<--gherkin> --target-url=<--url>
   --output=<criteria-dir>/criteria.json
   --questions-output=<criteria-dir>/refinement-questions.md
   ```
5. Lee `criteria.json`. De él salen: los criterios RF-NNN y el **brief** (`brief.flows`,
   `brief.entry`, `brief.ignore`) que en S4 teclea el SDET.
6. **Gate de open_questions (ask-first, no override).** Un `.feature` maduro no debería disparar
   ninguno. Si algún Scenario llegó **sin `Then`**, el parser lo marcó (`then: [AMBIGUO ...]`,
   `open_questions` no vacío). Muéstralos al SDET (resumen de `refinement-questions.md`) y avisa:
   esos criterios **NO se generan**. Sugiere refinar el `.feature` (añadir el `Then`) o enrutar el
   caso por `/qa-automator:spec-refiner` (S3). No se fabrica el resultado esperado.
7. Registra al audit-log: `{ source: 'command', action: 'feature_ingested', metadata: { criteria_count, blocked_count, flows } }`.

### Acto 2 — Mapear (modo mapear-contra-DOM, no descubrir)

8. Invoca `playwright-test-planner` (nativo) via Task tool. Prompt en **modo mapear** (no exploración libre):
   ```
   Mapea contra el DOM de <url> los siguientes flujos del .feature: <brief.flows>.
   Punto de entrada: <brief.entry>. NO explores: <brief.ignore>.
   Para CADA flujo, localiza las pantallas y elementos que lo realizan en el DOM real.
   Si un flujo NO existe en el DOM (ruta/pantalla ausente), repórtalo como NO MAPEADO —
   NO inventes pasos ni pantallas para que parezca cubierto.
   ```
   Esperar `<saved-plan>.md` + `planner_save_plan`.

   **8.5 — Guarda anti-fabricación (NO negociable)**: el planner necesita el MCP `playwright-test`. Si
   está caído, el planner se queda sin tools de navegador y puede **fabricar** un plan adivinado. Antes
   del paso 9, verifica discovery real: (a) el `<saved-plan>.md` existe (se llamó `planner_save_plan`);
   (b) el planner reporta uso de tools de navegador (`browser_navigate`/`browser_snapshot`), no solo
   `Read/Grep/Glob`; (c) el plan trae locators/URLs concretos del sitio, no genéricos. Si cualquiera
   falla → **ABORTA con exit 2**, no invoques al discovery-analyzer, audit-log
   `{ source: 'command', action: 'block', rule: 'planner-fabrication-guard', reason: 'MCP no disponible / planner no navegó' }`. Sin discovery real no hay mapeo fiable contra los criterios.
9. Invoca `ia4d-discovery-analyzer` con el plan **y `--criteria=<criteria-dir>/criteria.json`** (activa el S3 mode, idéntico):
   - Output: `.work/discovery-report.json` con el bloque `criteria_mapping` (`mapped` rf↔scenario, `unmapped_flows`).

**9.b — Diff de drift (determinístico, en el command — no LLM):**
10. Calcula `drift = brief.flows − {flows en criteria_mapping.mapped}`. Cruza con `criteria.json` para
    anotar el RF de cada flujo en drift. Escribe `.work/drift-report.json`:
    ```json
    { "target_url": "<url>", "source_spec": "<--gherkin>",
      "drift": [ { "rf": "RF-004", "flow": "close-account",
                   "source_ref": "parabank.feature:33 (REQ-CLOSE)",
                   "reason": "declarado en el .feature, no mapeado en staging" } ],
      "covered": [ { "rf": "RF-001", "flow": "login", "scenario": "inicio-sesion.usuario-valido" } ] }
    ```
    El drift se **reporta**, no se fabrica. Registra al audit-log: `{ source: 'command', action: 'drift_detected', metadata: { drift_count, rfs } }`.

### Acto 3 — Estructurar

11. Ejecuta el POM scaffolder sobre `.work/discovery-report.json` (igual que S4/S3):
    ```sh
    npx tsx -e "
    import { readFileSync } from 'node:fs';
    import { scaffold } from './src/pom-scaffolder.ts';
    const dr = JSON.parse(readFileSync('.work/discovery-report.json', 'utf8'));
    scaffold(dr.screens, { outputDir: 'tests/pages' });
    "
    ```
    (Si el `-e` inline falla en win32 —hallazgo Fase B #14— usar un `.mjs` en el workspace.)

### Acto 4 — Materializar

**11.b — Auth setup** (solo si el contract tiene `auth.enabled: true`): idéntico a S4 (ver
`autonomous.md` Acto 4 paso 8.b). Genera `auth.setup.ts`.

12. Para cada `scenario` en `discovery-report.scenarios_recommended` **cuyo RF NO esté bloqueado por
    open_questions y NO esté en drift** (paralelizable):
    - Invoca `ia4d-writer` via Task tool con `--plan-entry`, `--style-contract`, `--pom-skeleton-dir`,
      `--output`, `--discovery-report` **y `--criteria=<criteria-dir>/criteria.json`** (activa el S3
      mode: `@criterion` cita RF-NNN + source_ref; usa given/when/then del criterio).
    - **Parameterización**: si el criterio del RF trae un bloque `examples` (venido de un `Scenario
      Outline`), el Writer materializa un test data-driven (un caso por fila), todos citando el mismo
      RF-NNN. Ver `ia4d-writer` "S3 mode → parameterización".
    - El Writer escribe el `.spec.ts` e invoca al Reviewer (ping-pong N≤2). Pasa por el hook `pii-post.ts`.
13. (Opcional) `ia4d-style-enforcer` por cada `.spec.ts`.
14. (Obligatorio) `ia4d-a11y-injector` por cada `.spec.ts` pasándole `--style-contract` (scan
    siempre; gate por `a11y.fail_on_violations`, **default `false`** → modo warning; reactivable
    por-sitio con `true`). Igual que S4.

### Acto 5 — Juzgar

15. **Judge opcional, off por defecto.** Solo si `QA_ENABLE_JUDGE` está seteado (`echo $env:QA_ENABLE_JUDGE`)
    invoca `ia4d-judge` por cada `.spec.ts` con el `.work/review-feedback.json` consolidado. Si no, **omite el
    Judge** y registra al audit-log `{ source: 'command', action: 'skip', rule: 'judge', reason: 'judge off (QA_ENABLE_JUDGE unset)' }`.
16. (Solo si el Judge corrió) Lee scores. Si >30% < 0.5 → pausa ask-first.
17. Genera `.work/qa-automator-run-summary.json` con: tests generados (+ su RF), scores (o `judge: skipped`),
    verdicts, axe results, **criterios bloqueados** (Scenarios sin `Then`, si los hubo) y **drift**
    (RF declarados sin cobertura en staging).

## Outputs (consolidados)

- `criteria.json` + `refinement-questions.md` (ingestión del `.feature`)
- `.work/drift-report.json` (RF declarados no mapeados en staging)
- `.work/discovery-report.json` (con `criteria_mapping`)
- `tests/pages/*.page.ts`, `tests/e2e/*.spec.ts` (con `@criterion RF-NNN`)
- `.work/review-feedback.json`, `.work/judge-report.json`, `.work/audit-log.json`
- `.work/qa-automator-run-summary.json`

## Verification step

Idéntico a S4/S3 (`autonomous.md`): ejecuta `npx playwright test` seteando `QA_BASE_URL` con `--url`
(y `QA_STORAGE_STATE` si el contract tiene `auth.enabled: true`; `QA_SCREENSHOT`/`QA_TRACE` según
`evidence.level` del contract — `full` fuerza ambos `on` — evidencia visual para `/qa-automator:report`).

```sh
# Con auth (PowerShell):
#   $env:QA_BASE_URL='<--url>'; $env:QA_STORAGE_STATE='playwright/.auth/<project>.json'; npx playwright test --reporter=list
```

- Verdes → run exitoso. El SDET ve qué RF cubre cada test verde, qué RF quedaron en drift, y (si los
  hubo) qué Scenarios se bloquearon por venir sin `Then`.

## Hard rules

- S2 exige `--gherkin` + `--url`. Sin target, aborta.
- S2 **no refina**: Scenario sin `Then` → se reporta y se enruta a S3, no se fabrica el resultado.
- Gate de open_questions y compliance pre-flight: **sin override**.
- No se fabrica drift. Un flujo no mapeado se reporta como gap.
- La ingestión del `.feature` es determinística (`src/gherkin-to-criteria.ts` + `@cucumber/gherkin`),
  no LLM.
- Writer+Reviewer activos (igual que S4/S3); el **Judge es opcional, off por defecto** (`QA_ENABLE_JUDGE`).
- Cada invocación de subagent y cada decisión (ingest, drift, bloqueo, judge omitido) registra al audit-log.
- OpenAPI diferido a v0.4.

## Reference

- [`SPEC.md`](../../../SPEC.md) §1, §7 — "Cuatro módulos" / "Roadmap"
- [`docs/references/fd-criteria-schema.md`](../../../docs/references/fd-criteria-schema.md) — contrato de `criteria.json` (compartido con S3)
- [`.claude/commands/qa-automator/spec-refiner.md`](spec-refiner.md) — el command S3 que S2 replica (Actos 2-5 idénticos)
- [`.claude/commands/qa-automator/autonomous.md`](autonomous.md) — el motor S4 que ambos reusan
- [`docs/findings/wild-sites-report.md`](../../../docs/findings/wild-sites-report.md) — validación parabank (back-end reusado)
