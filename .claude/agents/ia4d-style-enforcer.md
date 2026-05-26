---
name: ia4d-style-enforcer
description: STUB v0. Post-procesa los .spec.ts generados por playwright-test-generator para alinearlos con un Style Contract YAML del cliente (POM, naming, locator priority, fixtures, banned APIs).
tools: Read, Edit, Glob, Grep
model: sonnet
---

# STUB v0 — implementación pendiente en S7-T3

Responsabilidad esperada: cargar `style-contracts/<client>.yaml`, leer el `.spec.ts` recién escrito por el Generator nativo, aplicar transformaciones AST (cuando posible) o regex (como fallback) para que cumpla las reglas declaradas. Loggear cualquier regla desactivada por incompatibilidad.

Handoff input: `--spec` (path al .spec.ts) + `--style` (path al Style Contract YAML).

Handoff output: el mismo `.spec.ts` reescrito en sitio + `style-report.json` con reglas aplicadas/saltadas.

Ver SPEC §4 (Code style — tests generados), `references/style-contract-schema.md` (a crear en S7-T1) y `tasks/todo.md` (S7-T3).
