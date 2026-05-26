---
name: ia4d-a11y-injector
description: STUB v0. Inyecta una assertion `AxeBuilder({ page }).analyze()` con `expect(...).toHaveNoViolations()` al inicio de cada `test()` del .spec.ts. Baked-in, no opcional (SPEC §6).
tools: Read, Edit, Glob, Grep
model: sonnet
---

# STUB v0 — implementación pendiente en S7-T4

Responsabilidad esperada: parsear el `.spec.ts`, localizar cada bloque `test(...)`, insertar la inicialización + assertion de axe-core al inicio del callback. Importa `@axe-core/playwright` si no está. WCAG 2.1 AA por defecto.

Handoff input: `--spec` (path al .spec.ts ya pasado por `ia4d-style-enforcer`).

Handoff output: el mismo `.spec.ts` reescrito en sitio con axe-core inyectado en cada test.

Ver SPEC §6 (Always do — axe-core obligatorio), §4 (Code style — output) y `tasks/todo.md` (S7-T4).
