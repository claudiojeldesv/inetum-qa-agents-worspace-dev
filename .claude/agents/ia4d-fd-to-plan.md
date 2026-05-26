---
name: ia4d-fd-to-plan
description: STUB v0. Parsea un Functional Design en markdown libre, extrae criterios (RF-NNN o texto), los mapea a casos de test. Si recibe plan del Planner nativo como contexto, lo enriquece.
tools: Read, Glob, Grep
model: sonnet
---

# STUB v0 — implementación pendiente en S6-T1

Responsabilidad esperada: leer FD markdown, extraer una lista normalizada de criterios, producir `test-plan.md` estructurado por criterio. No inventa criterios — si el FD es ambiguo, marca el caso y delega al SDET.

Handoff input: `--fd` (path al FD markdown) + opcional `--planner-output` (plan emitido por `playwright-test-planner`).

Handoff output: `test-plan.md` con una entrada por criterio, cada una citando texto fuente del FD.

Ver SPEC §2 (`/test-pilot:plan`) y `tasks/todo.md` (S6-T1).
