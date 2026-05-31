# Plan — `ia4d-qa-automator` v0.1 (MVP)

> **HISTÓRICO v0.1.** Trackea los slices del MVP v0.1 (cerrado, commit `c5a2be2`). El tracking vivo de v0.2 (Fases A/B/C cerradas; D/E pendientes) NO vive aquí: está en [`CLAUDE.md`](../CLAUDE.md) §"Estado actual", [`SPEC.md`](../SPEC.md) §7, y [`docs/findings/wild-sites-report.md`](../docs/findings/wild-sites-report.md). Los checkboxes de abajo quedaron al cierre de v0.1; no se mantienen para v0.2.

> Plan de ejecución para entregar el MVP definido en [SPEC.md](../SPEC.md). Reset desde `ia4d-test-pilot`. Plan vivo en `~/.claude/plans/1-el-mvp-idealmente-magical-aurora.md` aprobado por el usuario, este archivo es el espejo dentro del repo.

## Slices del MVP

| ID | Slice | Estado |
|---|---|---|
| 0.5 | Spike completion (TBDs cuantitativos) | ✓ Cerrado — ver [findings](../docs/findings/spike-playwright-mcp.md) |
| 1 | Foundation + rebrand documental | En curso |
| 2 | Capa transversal (compliance/PII/style/A11y/audit) | Pendiente |
| 3 | Quality layer (Writer + Reviewer + Judge, regla suavizada) | Pendiente |
| 4 | POM determinístico (`src/pom-scaffolder.ts`) | Pendiente |
| 5 | Módulo S4 Autonomous (orquestación end-to-end) | Pendiente |
| 6 | Flujo SauceDemo verde end-to-end (construcción manual + verde) | Parcial — suite verde, pero artefactos escritos a mano por el agente principal apoyándose en spike Slice 0.5 |
| **6.5** | **Validación del flujo autonomous LLM end-to-end (nuevo)** | **En curso** — invocar subagents LLM en vivo, no saltar al output ya construido |
| 7 | Stubs S1/S2/S3 + roadmap | Cerrado |
| 8 | Entrega (video, bundle, ficha catálogo) | Cerrado documentalmente |

## Principios

1. Vertical slicing. Cada slice entrega un camino completo.
2. Checkpoints bloqueantes entre fases.
3. Disciplina de scope. Lo no listado en SPEC no entra.
4. Sin estimaciones temporales.
5. Subagents `ia4d-*` no se invocan entre sí salvo excepción nombrada Writer↔Reviewer.

## Datos de Slice 0.5 que informan decisiones del resto

- Modelos confirmados: Sonnet (Planner/Generator nativos + Writer/Reviewer/Spec-refiner), Haiku (Judge + mecánicos).
- Wall-clock estimado MVP completo: ≤8 min con paralelismo de Generator (gate del Slice 6).
- Tokens estimados MVP: ~125k por ejecución completa.
- Cache de discovery: opcional en MVP, no bloqueante.
- Paralelismo Generator: prioritario en Slice 5.

## Estado actual

**v0.1 commit-eado** (`c5a2be2`). Slices 0.5 a 8 cerrados. Pendiente:
- Validación end-to-end LLM-LLM en sesión Claude Code nueva (cierra Slice 6.5).
- Tras eso, arranca v0.2.

## Roadmap v0.2 — Interactuar con el caos

Premisa: SauceDemo es un sandbox didáctico. v0.2 ataca el gap entre sandbox y caos real (banca/seguros) por evidencia, no por hipótesis. Orden estricto:

### Fase A — Cierre v0.1
- Validación end-to-end LLM-LLM en sesión nueva.
- Borrar residuales (specs E2E, POMs, audit-log, judge-report).

### Fase B — Recolección honesta contra sitios reales (1-2 semanas)
Ejecutar `/qa-automator:autonomous` contra batería progresiva:
- `https://demo.opencart.com/` (e-commerce SPA parcial)
- `https://parabank.parasoft.com/` (banca demo con auth + estado persistente)
- `https://practice.expandtesting.com/` (trampas: waits, dynamic loading, iframes, modales)
- Portal corporativo público sin auth (cuando se identifique uno)

Output: `docs/findings/wild-sites-report.md` con categorización de fallos por frecuencia × impacto × dificultad.

### Fase C — Hardening por categoría observada (no por componente teórico)
Componentes nuevos previstos. Cada uno entra solo si la Fase B muestra que su categoría aparece con frecuencia ≥30%:
- `ia4d-locator-hardener` (selectors inestables)
- `ia4d-pre-flight-cleaner` (cookies banner, modales)
- `ia4d-auth-handler` (SAML/OAuth/MFA, storageState reutilizable)
- `ia4d-test-data-architect` (lifecycle setup/teardown, fixtures por schema)
- A11y baseline aprobada (ajuste al `ia4d-a11y-injector` existente)

### Fase D — Ajustes Quality layer
- Writer↔Reviewer N=3 o fallback `@status pending-sdet-review`
- Judge scoring axes ajustables por Style Contract
- `ia4d-spec-refiner` (S3) **funcional** (promovido del v0.2 original)

### Fase E — Telemetría y budget cap
- Budget cap LLM persistente configurable
- Telemetría heurística estructurada

## NO incluye v0.2 (a v0.2.x o v0.3)

- TMS connectors (Jira/Xray) — depende de tener datos reales primero
- Knowledge graph SQLite — depende de TMS y telemetría
- AST parsers React/Vue (v0.3)
- Visual regression formal (v0.3+)

## Detalle por tarea

Ver `tasks/todo.md`.
