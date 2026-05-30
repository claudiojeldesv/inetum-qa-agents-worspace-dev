# Plan — `ia4d-qa-automator` v0.1 (MVP)

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

## Próximo paso

**Slice 1 completándose**. Ver `tasks/todo.md` para tareas detalladas. Tras Slice 1, avanzar a Slice 2.
