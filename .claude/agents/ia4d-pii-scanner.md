---
name: ia4d-pii-scanner
description: STUB v0. Escanea directorio de tests buscando PII real (DNI ES, IBAN mod97, tarjetas Luhn, emails de dominio real, teléfonos ES). Detecta también inserciones de test.fixme() no aprobadas.
tools: Read, Glob, Grep
model: sonnet
---

# STUB v0 — implementación pendiente en S3-T3

Responsabilidad esperada: recorrer un directorio (`--dir`), aplicar regex+Luhn de `references/pii-patterns.md`, fallar con archivo+línea ante match. Adicionalmente bloquea Edits del Healer nativo que introduzcan `test.fixme()` sin sign-off humano (SPEC riesgo #7).

Handoff input: `--dir` apuntando a `.spec.ts` ya generados.

Handoff output: stdout JSON con `{verdict, findings: [{file, line, pattern}]}` + entrada en `audit-log.json`.

Ver SPEC §6 (Never do — PII / test.fixme) y `tasks/todo.md` (S3-T3).
