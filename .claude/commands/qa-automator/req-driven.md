---
description: Módulo S2 — Req-driven test generation desde Gherkin/OpenAPI maduros. STUB v0.1, funcional en v0.3.
argument-hint: "--gherkin=<path> | --openapi=<path>"
---

# /qa-automator:req-driven (STUB v0.1)

Módulo **S2 Req-driven**. Esperado funcional en **v0.3** según roadmap del SPEC §7.

## Behavior in v0.1

Responde con:

```
STUB v0.1 — ia4d-qa-automator:req-driven

This module is documented but not implemented in MVP v0.1.

Planned for v0.3. The S2 (Req-driven) module will:
  1. Parse Gherkin .feature files via @cucumber/gherkin (deterministic parser, not LLM).
  2. OR parse OpenAPI specs for API-level test generation.
  3. Produce a discovery-report.json with pre-specified scenarios.
  4. Hand off to the same downstream pipeline.

For MVP v0.1, use `/qa-automator:autonomous --url=<URL>` instead (S4 module, functional).

Reference:
  - SPEC.md §1 "Cuatro módulos"
  - SPEC.md §7 "Roadmap por versiones"
  - .claude/agents/ia4d-spec-parser.md (stub agent definition)
```

No invokes subagents. No writes files. Pure informational stub.
