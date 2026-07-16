---
description: Módulo S1 — Code-driven test generation desde un repo frontend. STUB v0.1, funcional en v0.3.
argument-hint: "--repo=<path> [--framework=react|vue|html]"
---

# /ia4d-qa-automator:code-driven (STUB v0.1)

Módulo **S1 Code-driven**. Esperado funcional en **v0.3** según roadmap del SPEC §7.

## Behavior in v0.1

Responde con:

```
STUB v0.1 — ia4d-qa-automator:code-driven

This module is documented but not implemented in MVP v0.1.

Planned for v0.3. The S1 (Code-driven) module will:
  1. Parse a frontend source repo (React/Vue/HTML) via AST.
  2. Extract routes, components, forms, test IDs.
  3. Produce a .work/discovery-report.json from the code (no browser needed).
  4. Hand off to the same downstream pipeline (POM scaffolder → Writer → Reviewer → Judge).

For MVP v0.1, use `/ia4d-qa-automator:autonomous --url=<URL>` instead (S4 module, functional).

Reference:
  - SPEC.md §1 "Cuatro módulos"
  - SPEC.md §7 "Roadmap por versiones"
  - .claude/agents/ia4d-code-analyzer.md (stub agent definition)
```

No invokes subagents. No writes files. Pure informational stub.
