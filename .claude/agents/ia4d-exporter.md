---
name: ia4d-exporter
description: STUB v0. Consolida outputs de los slices anteriores (tests + judge-report + audit-log + compliance verdict + a11y findings) en un JSON catalog genérico. Deduplica por hash + nombre.
tools: Read, Glob, Grep
model: sonnet
---

# STUB v0 — implementación pendiente en S10-T2

Responsabilidad esperada: recorrer el output del agente, generar `test-catalog.json` cumpliendo el schema `references/test-catalog-schema.md` (a crear en S10-T1). Campos: caseId, criterio FD, test file, judge score, audit verdict, axe violations. Sin connector específico — formato genérico para futuro Xray/Zephyr/TestRail.

Handoff input: `--specs-dir`, `--judge-report`, `--audit-log`.

Handoff output: `test-catalog.json`.

Ver SPEC §2 (`/test-pilot:export`), Non-goals MVP (connectors específicos) y `tasks/todo.md` (S10-T2).
