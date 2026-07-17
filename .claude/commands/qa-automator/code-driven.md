---
description: Módulo S1 — Code-driven test generation desde un repo frontend. No implementado (stub informativo); en roadmap sin versión comprometida.
argument-hint: "--repo=<path> [--framework=react|vue|html]"
---

# /ia4d-qa-automator:code-driven (STUB)

Módulo **S1 Code-driven**. **No implementado** — está en el roadmap del producto sin versión
comprometida (pendiente de priorización frente a otras capacidades, p.ej. el modo incremental).

## Behavior

Responde con:

```
STUB — ia4d-qa-automator:code-driven

El módulo S1 (Code-driven) está documentado pero NO implementado.
Está en roadmap sin versión comprometida. Cuando llegue, hará:
  1. Parsear un repo frontend (React/Vue/HTML) vía AST.
  2. Extraer rutas, componentes, formularios y test IDs.
  3. Producir un discovery-report.json desde el código (sin navegador).
  4. Entregar al mismo pipeline downstream (POM scaffolder → Writer → Reviewer).

Mientras tanto tienes tres puertas FUNCIONALES según lo que tengas a mano:
  - Solo una URL              → /ia4d-qa-automator:autonomous  --url=<URL> --flows=<módulos>
  - Un FD/spec + URL          → /ia4d-qa-automator:spec-refiner --fd=<path> --url=<URL>
  - Un .feature Gherkin + URL → /ia4d-qa-automator:req-driven --gherkin=<path> --url=<URL>
```

No invokes subagents. No writes files. Pure informational stub.
