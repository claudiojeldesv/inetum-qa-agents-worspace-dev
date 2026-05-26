---
name: ia4d-compliance-checker
description: STUB v0. Valida que la URL target y el seed cumplen la política declarada en config/allowed-targets.yaml (modo greybox/whitebox, dominios permitidos, sin PII real). Bloquea sin override.
tools: Read, Glob, Grep
model: sonnet
---

# STUB v0 — implementación pendiente en S2-T5

Responsabilidad esperada: leer `config/allowed-targets.yaml`, validar URL + seed pasados por el command invocador, emitir verdict pass/fail con razón estructurada. Sin flag de override (SPEC §6 — Never do).

Handoff input: argumentos `--url`, `--seed` del command que lo invoca.

Handoff output: stdout JSON con `{verdict, reason, ruleViolated}` + entrada en `audit-log.json` vía `hooks/audit-write.ts`.

Ver SPEC §2 (commands), §6 (Boundaries) y `tasks/todo.md` (S2-T5).
