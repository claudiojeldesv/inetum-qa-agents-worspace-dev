# TODO — `ia4d-qa-automator` v0.1

> **HISTÓRICO v0.1.** Checklist del MVP v0.1 (cerrado, `c5a2be2`). Los `[ ]` de abajo NO reflejan el estado actual del producto — v0.1 completo se entregó; v0.2 Fases A/B/C están cerradas. Tracking vivo: [`CLAUDE.md`](../CLAUDE.md) §"Estado actual", [`SPEC.md`](../SPEC.md) §7, [`docs/findings/wild-sites-report.md`](../docs/findings/wild-sites-report.md).

> Lista ejecutable derivada de [plan.md](plan.md). Estados: `[ ]` pendiente · `[x]` hecho.

## Slice 0.5 — Spike completion ✓

- `[x]` Medir Planner contra TodoMVC. 36,004 tokens, 47 tool uses, 5.6 min.
- `[x]` Medir Planner contra SauceDemo. 32,051 tokens, 38 tool uses, 3.4 min.
- `[x]` Medir Generator (1 test SauceDemo). 30,751 tokens, 25 tool uses, 3.4 min.
- `[x]` Actualizar [`docs/findings/spike-playwright-mcp.md`](../docs/findings/spike-playwright-mcp.md).
- `[x]` Cerrar decisiones [PENDIENTE SPIKE].

## Slice 1 — Foundation + rebrand

- `[x]` Mover artefactos del spike a `docs/spike/artifacts/`.
- `[x]` Eliminar archivos del reset (test-pilot SPEC/plan/todo, seed.spec.ts, audit-log.json, output/, node_modules/, directorios vacíos).
- `[x]` Crear estructura de directorios (`hooks/`, `config/`, `style-contracts/`, `references/`, `demo/saucedemo/`, `tests/{unit,integration,pages}/`, `.claude/commands/qa-automator/`, `src/`).
- `[x]` `package.json`, `tsconfig.json`, `.eslintrc.json`, `.prettierrc.json`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore` actualizado.
- `[x]` Limpiar `.claude/settings.local.json` (referencia a `test-pilot:plan`).
- `[x]` Reescribir `CLAUDE.md`.
- `[x]` Crear nuevo `SPEC.md`.
- `[x]` Crear `tasks/plan.md` y `tasks/todo.md`.

## Slice 2 — Capa transversal

- `[ ]` `references/compliance-rules.md`, `pii-patterns.md`, `audit-log-schema.md`, `style-contract-schema.md`, `composition-rules.md`.
- `[ ]` `config/allowed-targets.yaml`.
- `[ ]` `src/audit-log.ts` (writer helper).
- `[ ]` `hooks/pre-flight.ts`, `pii-post.ts`, `audit-write.ts`, `hooks.json`.
- `[ ]` `.claude/agents/ia4d-compliance-checker.md`, `pii-scanner.md`, `style-enforcer.md`, `a11y-injector.md`.
- `[ ]` `tests/unit/pii-detector.test.ts`, `compliance-preflight.test.ts`, `style-enforcer.test.ts`.

## Slice 3 — Quality layer

- `[ ]` `references/writer-reviewer-protocol.md`.
- `[ ]` `.claude/agents/ia4d-writer.md`, `ia4d-reviewer.md`, `ia4d-judge.md`.
- `[ ]` `tests/unit/judge-scoring.test.ts`.

## Slice 4 — POM determinístico

- `[ ]` `src/pom-scaffolder.ts`.
- `[ ]` `tests/unit/pom-scaffolder.test.ts`.

## Slice 5 — Módulo S4 Autonomous

- `[ ]` `src/native-agents.ts` (constantes).
- `[ ]` `.claude/agents/ia4d-discovery-analyzer.md`, `ia4d-mode-router.md`.
- `[ ]` `.claude/commands/qa-automator/healthcheck.md`, `autonomous.md`.

## Slice 6 — Flujo SauceDemo verde (parcial)

- `[x]` `style-contracts/saucedemo.yaml`.
- `[x]` `demo/saucedemo/HOW-TO-REPRODUCE.md`.
- `[ ]` `demo/saucedemo/expected-output/` baseline (limpiado — pendiente repoblado por Slice 6.5).
- `[~]` Ejecutar flujo end-to-end y validar verde. **Parcial**: la suite resultante corrió verde, pero los artefactos (discovery, POMs, specs) fueron escritos manualmente por el agente principal apoyándose en outputs del spike Slice 0.5. No demuestra orquestación end-to-end.

## Slice 6.5 — Validar flujo autonomous LLM en vivo (gate real del MVP)

Objetivo: ejecutar `/qa-automator:autonomous --url=https://www.saucedemo.com/` pasando por **todos** los subagents LLM y subagents nativos en vivo, sin saltos manuales. Mide wall-clock real, valida la composición Writer↔Reviewer, confirma que la orquestación del command funciona.

Pasos atómicos:

- `[x]` **S6.5-T1** Acto 1 — Comprender. Compliance pre-flight ejecutado programáticamente via `npx tsx hooks/pre-flight.ts` (subagent `ia4d-compliance-checker` no invocable en esta sesión). Verdict `pass`, exit 0, audit log con `action: allow`.
- `[x]` **S6.5-T2** Acto 2 — Mapear. `playwright-test-planner` nativo invocado vía Task tool contra SauceDemo. 21,602 tokens, 22 tool uses, 99 seg. Plan `saucedemo-slice65-plan.md` con 3 escenarios golden path.
- `[~]` **S6.5-T3** Acto 2b — Discovery extraído programáticamente (no via `ia4d-discovery-analyzer` que no es invocable). `discovery-report.json` con 6 screens + 3 scenarios_recommended. **Pendiente validación real del subagent en nueva sesión.**
- `[x]` **S6.5-T4** Acto 3 — `scripts/scaffold-poms.ts` ejecutado. 6 POMs generados en `tests/pages/`.
- `[~]` **S6.5-T5** Acto 4 — Sustituido por `playwright-test-generator` nativo invocado 3 veces (login, add-to-cart, checkout). 66,163 tokens, 69 tool uses, 305 seg. **Composición Writer↔Reviewer real (LLM-LLM) pendiente nueva sesión.**
- `[~]` **S6.5-T6** Post-procesado — verificación programática de style + A11y + criterion + PII. Detectó 2 raw selectors en login spec; aplicada corrección manual replicando `ia4d-style-enforcer`. **Subagents pendientes nueva sesión.**
- `[~]` **S6.5-T7** Acto 5 — Judge programático via `scripts/slice65-judge.ts` aplicando los 7 ejes del SPEC. Scores 0.900-0.964 sobre 3 specs. Ask-first threshold no superado. **Subagent `ia4d-judge` pendiente nueva sesión.**
- `[x]` **S6.5-T8** `npx playwright test`. **3/3 verdes en 9.7 seg paralelos**. Hallazgo: violación A11y critical real en SauceDemo `/inventory.html` (`select-name`) detectada por axe — el agente cumplió su misión QA.
- `[x]` **S6.5-T9** Findings actualizado con sección "Slice 6.5 — Validación flujo LLM end-to-end".
- `[x]` **S6.5-T10** README actualizado con resultados reales.

**Resumen Slice 6.5**: validación híbrida concluida. Lo invocable (Planner + Generator nativos) validado en vivo. Lo no invocable (subagents `ia4d-*` creados en esta sesión) sustituido por lógica programática equivalente. Resultado: 3/3 specs verdes contra SauceDemo, ~14 min secuencial / ~7 min proyectado paralelo, judge scores ≥0.9.

**Pendiente cierre v0.1**: nueva sesión Claude Code para invocar la composición LLM-LLM real Writer↔Reviewer.

---

## v0.2 — Interactuar con el caos (post commit v0.1)

Roadmap detallado en `tasks/plan.md` y `SPEC.md` §7. Tareas:

### Fase A — Cierre v0.1

- `[ ]` **v0.2.A-T1** Abrir sesión Claude Code nueva en este repo. Verificar que los 12 subagents `ia4d-*` aparecen en la lista de Task tool.
- `[ ]` **v0.2.A-T2** Ejecutar `/qa-automator:autonomous --url=https://www.saucedemo.com/ --style=style-contracts/saucedemo.yaml`. Validar composición Writer↔Reviewer LLM-LLM real. Documentar resultados en `docs/findings/spike-playwright-mcp.md` (sección "v0.1 closeout — end-to-end LLM-LLM").
- `[ ]` **v0.2.A-T3** Borrar residuales del v0.1: `tests/e2e/*.spec.ts`, `tests/pages/*.page.ts`, `audit-log.json`, `judge-report.json`, `discovery-report.json`, `saucedemo-slice65-plan.md`. Mantener `tests/unit/*` y todo `src/`.

### Fase B — Recolección honesta contra sitios reales

- `[ ]` **v0.2.B-T1** Ejecutar `/qa-automator:autonomous` contra `https://demo.opencart.com/`. Documentar fallos en `docs/findings/wild-sites-report.md`.
- `[ ]` **v0.2.B-T2** Idem contra `https://parabank.parasoft.com/` (incluye auth login).
- `[ ]` **v0.2.B-T3** Idem contra `https://practice.expandtesting.com/`.
- `[ ]` **v0.2.B-T4** Identificar 1 portal corporativo público sin auth y ejecutar (cuando aplique).
- `[ ]` **v0.2.B-T5** Consolidar en `wild-sites-report.md`: tabla de fallos categorizados (selectors / auth / timing / data / a11y / modales / iframes / shadow-dom). Frecuencia × impacto × dificultad. Output: priorización de Fase C.

### Fase C — Hardening por categoría

Cada subtarea entra solo si la Fase B muestra que su categoría tiene frecuencia ≥30%. Esperado por análisis preliminar:

- `[ ]` **v0.2.C-T1** `ia4d-locator-hardener` (alta probabilidad) — subagent que audita output del Writer, propone locators robustos combinando `role + accessibleName + nearbyText`, marca fragile en judge-report.
- `[ ]` **v0.2.C-T2** `ia4d-pre-flight-cleaner` (alta probabilidad) — extensión del hook `pre-flight.ts` o subagent separado que cierra cookies banner GDPR y modales antes de exploración.
- `[ ]` **v0.2.C-T3** `ia4d-auth-handler` (media-alta) — `globalSetup` que captura `storageState` reutilizable. Soporte TOTP via lib `authenticator`. SAML/OAuth como flow específico.
- `[ ]` **v0.2.C-T4** `ia4d-test-data-architect` (media) — lifecycle setup/teardown, fixtures contra OpenAPI/DB schema, factories faker.js con seed reproducible.
- `[ ]` **v0.2.C-T5** A11y baseline aprobada (media-alta) — extensión del `ia4d-a11y-injector`: mecanismo de baseline aprobada por SDET (no todo-o-nada). Schema en `references/a11y-baseline-schema.md`.

### Fase D — Ajustes Quality layer

- `[ ]` **v0.2.D-T1** Writer↔Reviewer N=3 o fallback `@status pending-sdet-review`. Editar `references/writer-reviewer-protocol.md`.
- `[ ]` **v0.2.D-T2** Judge scoring con ejes ajustables por Style Contract. Refactor `src/judge-scoring.ts` para leer pesos de `style-contract.yaml`.
- `[ ]` **v0.2.D-T3** `ia4d-spec-refiner` (S3) funcional. Promueve el stub a runtime. Soporta FD markdown + Jira ticket (texto plano por ahora, sin Jira connector).

### Fase E — Telemetría y budget cap

- `[ ]` **v0.2.E-T1** Budget cap LLM persistente. Config en `config/budget.yaml`. Hook que aborta cuando se supera.
- `[ ]` **v0.2.E-T2** Telemetría heurística — logs estructurados por heurística aplicada y tipo de app detectada.

## Slice 7 — Stubs S1/S2/S3

- `[ ]` `.claude/agents/ia4d-code-analyzer.md`, `ia4d-spec-parser.md`, `ia4d-spec-refiner.md` (stubs).
- `[ ]` `.claude/commands/qa-automator/code-driven.md`, `req-driven.md`, `spec-refiner.md` (stubs).

## Slice 8 — Entrega

- `[ ]` `demo/saucedemo/script.md` (guion).
- `[ ]` `docs/Inetum/Catalogo/ia4d-qa-automator.md` (ficha catálogo formato canónico).
- `[ ]` `demo/recordings/` (placeholder para video).
- `[ ]` `README.md` raíz.
