---
description: Módulo S3 — Spec-refiner (Forma B). Genera tests E2E desde un FD (markdown libre) + URL de staging, con trazabilidad RF-NNN y detección de drift FD↔implementación. Funcional en v0.2.
argument-hint: "--fd=<path> --url=<URL> [--style=<contract.yaml>]"
---

# /ia4d-qa-automator:spec-refiner

> **Pre-check (workspace).** Este comando corre DENTRO de un workspace desplegado del agente. Antes de continuar, verifica que en el directorio actual existen `config/allowed-targets.yaml` y `playwright.config.ts`. Si falta alguno, NO sigas: indica al usuario que ejecute `/ia4d-qa-automator:init <carpeta>` (o abra su workspace ya desplegado) y detente.

Módulo **S3 Spec-refiner (Forma B)** del agente `ia4d-qa-automator`. Entrada = **FD en markdown libre + URL de staging**. El FD da el *qué* (criterios RF-NNN, flujos); la URL da el *cómo* (DOM real, locators, run verde). Reusa el motor S4 validado (discovery, POM scaffolder, Writer↔Reviewer↔Judge, los 3 componentes de Fase C); las únicas piezas propias de S3 son la ingestión del FD (`ia4d-spec-refiner`), el planner en modo **mapear-contra-DOM** y el **diff de drift**.

Valor diferenciador sobre S4: (1) **trazabilidad real** — el `@criterion` cita un RF-NNN del FD, no prosa del discovery; (2) **detección de drift** — un flujo que el FD declara y staging no expone se **reporta como gap, NO se fabrica el test**.

## Arguments

- `--fd=<path>` (obligatorio): FD en markdown.
- `--url=<URL>` (obligatorio): URL de staging, debe estar en `config/allowed-targets.yaml`. **Forma B exige URL** — sin target no hay DOM, locators ni run verde (Forma A descartada).
- `--style=<path>` (opcional, default: el contract del sitio si existe, p.ej. `config/style-contracts/parabank.yaml`): YAML del Style Contract.
- `--output-dir=<path>` (opcional, default: `tests/e2e/<site-id>`): dónde se escriben los `.spec.ts` (namespaced por sitio).
- `--criteria-dir=<path>` (opcional, default: `.work/<site-id>` = `<workDir>`): dónde el refiner escribe `criteria.json` + `refinement-questions.md`.

## Procedure (los 5 actos)

### Acto 1 — Comprender

1. Invoca `ia4d-mode-router` via Task tool con los flags recibidos.
2. Confirma `module: S3`. Si `status: needs_input` (`--fd` sin `--url`) → aborta y dile al QA que Forma B exige URL de staging. Forma A (FD sin target) no está implementada.
3. Invoca `ia4d-compliance-checker` via Task tool con la URL y `config/allowed-targets.yaml`.
   - `block` → aborta (exit 2). `warn` → muestra y pregunta (ask-first).

**1.a — Namespace por sitio + limpieza (PRIMERO, antes de la ingesta, NO negociable):** deriva `<site-id>`
del basename del `--style`; define `<workDir>=.work/<site-id>` (todos los artefactos efímeros ahí,
**incluido `criteria.json`**) y los dirs `tests/{e2e,pages,components}/<site-id>/`; **limpia `<workDir>/`
al arrancar** (no toca `config/tc-registry/<site-id>.json`); **exporta `QA_WORK_DIR=<workDir>`** en el run.
Pasa rutas namespaciadas a los subagentes. La limpieza corre **antes** de que el refiner escriba, para no
borrar el `criteria.json` recién generado. Runs de sitios distintos no se contaminan.

**1.b — Ingestión del FD** (sustituye al brief manual de S4):
4. Invoca `ia4d-spec-refiner` via Task tool:
   ```
   --fd=<--fd> --target-url=<--url>
   --output=<criteria-dir>/criteria.json
   --questions-output=<criteria-dir>/refinement-questions.md
   ```
5. Lee `criteria.json`. De él salen: los criterios RF-NNN y el **brief** (`brief.flows`, `brief.entry`, `brief.ignore`) que en S4 teclea el QA.
6. **Gate de open_questions (ask-first, no override).** Si hay criterios con `then` `[AMBIGUO ...]` o `open_questions` no vacío, muéstralos al QA (resumen de `refinement-questions.md`) y avisa: esos criterios **NO se generan** en este run (opción (a), decisión QA). El QA puede responder y re-ejecutar, o continuar solo con los criterios claros. No se fabrica el comportamiento ambiguo.
7. Registra al audit-log: `{ source: 'command', action: 'fd_ingested', metadata: { criteria_count, blocked_count, flows } }`.

### Acto 2 — Mapear (modo mapear-contra-DOM, no descubrir)

8. **Mapeo PLANNER POR FLUJO (secuencial, no monolítico).** El planner nativo se cuelga si se le pide
   mapear muchos flujos de una vez (hallazgo: ~1h colgado con 6 flujos). Invócalo **un flujo por vez**,
   secuencial — **nunca en paralelo** (comparten el navegador del MCP). No hay timeout programático
   sobre un subagente Task: **acotar a un flujo es la mitigación**. Para **cada** `<flow>` de
   `brief.flows`, invoca `playwright-test-planner` (nativo) via Task tool, prompt en **modo mapear**:
   ```
   Mapea contra el DOM de <url> SOLO el flujo "<flow>" del FD.
   Punto de entrada: <brief.entry>. NO explores otros flujos ni <brief.ignore>.
   Localiza las pantallas y elementos que realizan <flow> en el DOM real.
   Si <flow> NO existe en el DOM (ruta/pantalla ausente), repórtalo como NO MAPEADO —
   NO inventes pasos ni pantallas para que parezca cubierto.
   Guarda con planner_save_plan en fileName="docs/test-plans/<site-id>/<flow>.plan.md".
   ```
   Tras cada flujo, aplica la **guarda 8.5 por-flujo** sobre su fragmento.

   **8.5 — Guarda anti-fabricación POR FLUJO (NO negociable)**: el planner necesita el MCP
   `playwright-test`. Si está caído, se queda sin tools de navegador y puede **fabricar** un plan
   adivinado o **colgarse**. Tras el planner de cada flujo, verifica sobre su fragmento
   `docs/test-plans/<site-id>/<flow>.plan.md`: (a) existe (se llamó `planner_save_plan`); (b) el planner
   reporta uso de tools de navegador (`browser_navigate`/`browser_snapshot`), no solo `Read/Grep/Glob`;
   (c) trae locators/URLs concretos, no genéricos.
   - Si falla (o el planner se cuelga y el QA lo corta) → **reintenta UNA vez** ese flujo solo.
   - Si tras el reintento sigue fallando → **PAUSA y pregunta al QA**: (1) marcar el flujo como
     no-mapeado (va a `unmapped_flows`, el run sigue con el resto); (2) rescate con MCP directo por el
     orquestador (aviso: consume contexto); (3) abortar (exit 2). Registra al audit-log
     `{ source: 'command', action: 'warn'|'block', rule: 'planner-flow-recovery', metadata: { flow, choice } }`.
   - Un flujo fallido **no contamina a los demás**. Nunca pases al discovery-analyzer un fragmento que no
     navegó de verdad — sin discovery real no hay mapeo fiable contra los criterios.
9. Invoca `ia4d-discovery-analyzer` con `--planner-saved-plan=docs/test-plans/<site-id>/` (directorio de fragmentos), `--output=<workDir>/discovery-report.json` **y `--criteria=<criteria-dir>/criteria.json`** (activa el S3 mode):
   - Output: `<workDir>/discovery-report.json` con el bloque `criteria_mapping` (`mapped` rf↔scenario, `unmapped_flows`).

**9.b — Diff de drift (determinístico, en el command — no LLM):**
10. Calcula `drift = brief.flows − {flows en criteria_mapping.mapped}`. Cruza con `criteria.json` para anotar el RF de cada flujo en drift. Escribe `<workDir>/drift-report.json`:
    ```json
    { "target_url": "<url>", "source_fd": "<--fd>",
      "drift": [ { "rf": "RF-005", "flow": "bill-pay",
                   "fd_source_ref": "fd-parabank.md:38-42",
                   "reason": "declarado en el FD, no mapeado en staging" } ],
      "covered": [ { "rf": "RF-001", "flow": "login", "scenario": "inicio-sesion.usuario-valido" } ] }
    ```
    El drift se **reporta**, no se fabrica. Registra al audit-log: `{ source: 'command', action: 'drift_detected', metadata: { drift_count, rfs } }`.

### Acto 3 — Estructurar

11. Ejecuta el POM scaffolder sobre `<workDir>/discovery-report.json` (igual que S4), namespaciado por sitio:
    ```sh
    npx tsx src/scripts/scaffold-poms.ts <workDir>/discovery-report.json tests/pages/<site-id> tests/components/<site-id>
    ```
    (Si necesitas inline y el `-e` falla en win32 —hallazgo Fase B #14— usa un `.mjs` en `<workDir>/`.)

### Acto 4 — Materializar

**11.b — Auth setup** (solo si el contract tiene `auth.enabled: true`): idéntico a S4 (ver `autonomous.md` Acto 4 paso 8.b). Genera `auth.setup.ts`.

12. Para cada `scenario` en `discovery-report.scenarios_recommended` **cuyo RF NO esté bloqueado por open_questions y NO esté en drift** (paralelizable):
    - **Construye el `--output`** bajo `tests/e2e/<site-id>/<id>_<feature>.<condicion>.spec.ts` (ID estable del registro). Invoca `ia4d-writer` via Task tool con `--plan-entry`, `--style-contract`, `--pom-skeleton-dir=tests/pages/<site-id>`, `--output` (el construido), `--discovery-report=<workDir>/discovery-report.json` **y `--criteria=<criteria-dir>/criteria.json`** (activa el S3 mode: `@criterion` cita RF-NNN + source_ref; usa given/when/then del criterio).
    - El Writer escribe el `.spec.ts` e invoca al Reviewer (ping-pong N≤2). Pasa por el hook `pii-post.ts`.
13. (Opcional) `ia4d-style-enforcer` por cada `.spec.ts`.
14. (Obligatorio) `ia4d-a11y-injector` por cada `.spec.ts` pasándole `--style-contract` (scan siempre; gate por `a11y.fail_on_violations`, **default `false`** → modo warning; reactivable por-sitio con `true`). Igual que S4.

**14.b — Consolidar feedback (determinístico, no LLM):** el Reviewer escribió un fichero por spec en
`<workDir>/review-feedback/<spec>.json` (sin contención entre writers paralelos). Únelos en el
`<workDir>/review-feedback.json` plano: `QA_WORK_DIR=<workDir> npx tsx src/scripts/consolidate-reviews.ts`.
El Judge y el reporte leen el consolidado. (Evita la race de *append* concurrente que corrompía el fichero.)

**14.c — PII scan consolidado (opcional, solo si `QA_ENABLE_PII` está seteado):** idéntico a S4 (ver
`autonomous.md` Acto 4 paso 11.c). Invoca `ia4d-pii-scanner` sobre `tests/e2e/<site-id>/` con
`--output=<workDir>/pii-scan-report.json` y registra el veredicto (o el `skip`) al audit-log.

### Acto 5 — Juzgar

15. **Judge opcional, off por defecto.** Solo si `QA_ENABLE_JUDGE` está seteado (PowerShell: `$env:QA_ENABLE_JUDGE`; bash: `$QA_ENABLE_JUDGE`) invoca `ia4d-judge` por cada `.spec.ts` con el `<workDir>/review-feedback.json` consolidado. Si no, **omite el Judge** y registra al audit-log `{ source: 'command', action: 'skip', rule: 'judge', reason: 'judge off (QA_ENABLE_JUDGE unset)' }`.
16. (Solo si el Judge corrió) Lee scores. Si >30% < 0.5 → pausa ask-first.
17. Genera `<workDir>/qa-automator-run-summary.json` con: tests generados (+ su RF), scores (o `judge: skipped`), verdicts, axe results, **criterios bloqueados (pendientes de respuesta QA)** y **drift** (RF declarados sin cobertura).

## Outputs (consolidados)

- `criteria.json` + `refinement-questions.md` (ingestión del FD)
- `<workDir>/drift-report.json` (RF declarados no mapeados en staging; `<workDir>`=`.work/<site-id>`)
- `<workDir>/discovery-report.json` (con `criteria_mapping`)
- `tests/pages/<site-id>/*.page.ts`, `tests/components/<site-id>/*.component.ts`, `tests/e2e/<site-id>/*.spec.ts` (con `@criterion RF-NNN`)
- `<workDir>/review-feedback/<spec>.json` (per-spec, escrito por el Reviewer) → consolidado en `<workDir>/review-feedback.json`; `<workDir>/judge-report.json`, `<workDir>/audit-log.json`
- `<workDir>/qa-automator-run-summary.json`

## Verification step

Idéntico a S4 (`autonomous.md`): ejecuta `npx playwright test tests/e2e/<site-id>/` seteando `QA_WORK_DIR=.work/<site-id>` (aísla artefactos del sitio) y `QA_BASE_URL` con `--url` (y `QA_STORAGE_STATE` si el contract tiene `auth.enabled: true`; `QA_SCREENSHOT`/`QA_TRACE` según `evidence.level` del contract — `full` fuerza ambos `on` — evidencia visual para `/ia4d-qa-automator:report`).

```sh
# Con auth (PowerShell):
#   $env:QA_WORK_DIR='.work/<site-id>'; $env:QA_BASE_URL='<--url>'; $env:QA_STORAGE_STATE='playwright/.auth/<project>.json'; npx playwright test tests/e2e/<site-id>/ --reporter=list
```

- Verdes → run exitoso. El QA ve qué RF cubre cada test verde, qué RF quedaron en drift, y qué RF están pendientes de respuesta a una refinement-question.

## Hard rules

- Forma B exige `--url`. Sin target, aborta (no hay Forma A).
- Gate de open_questions y compliance pre-flight: **sin override**.
- **Namespace por sitio (paso 1.a, antes de la ingesta)**: artefactos efímeros bajo `<workDir>=.work/<site-id>` (incluido `criteria.json`); specs/POM bajo `tests/{e2e,pages,components}/<site-id>/`; `QA_WORK_DIR` exportado; `npx playwright test tests/e2e/<site-id>/`; limpieza de `<workDir>` al arrancar (no toca `config/tc-registry/<site-id>.json`). Runs de sitios distintos no se contaminan.
- **Planner por-flujo (paso 8) + guarda por-flujo (8.5)**: un flujo por vez, secuencial; reintento ×1; si falla, el QA decide (no-mapeado / rescate MCP / abortar).
- No se fabrica drift ni el `then` ambiguo. Un flujo no mapeado se reporta; un criterio ambiguo no se genera.
- Writer+Reviewer activos (igual que S4); el **Judge es opcional, off por defecto** (`QA_ENABLE_JUDGE`).
- Cada invocación de subagent y cada decisión (ingest, drift, bloqueo, judge omitido) registra al audit-log.
- Paralelismo del Acto 4 prioritario para los criterios no bloqueados.

## Reference

- `docs/references/fd-criteria-schema.md` — contrato de `criteria.json`
- [`.claude/commands/qa-automator/autonomous.md`](autonomous.md) — el motor S4 que S3 reusa (Actos 3-5 idénticos)
