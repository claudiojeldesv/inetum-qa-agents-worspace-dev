---
description: Módulo S3 — Spec-refiner desde un FD flojo / PDF / Jira mal redactado. STUB v0.1, funcional en v0.2.
argument-hint: "--fd=<path> [--target-url=<URL>]"
---

# /qa-automator:spec-refiner (STUB v0.1)

Módulo **S3 Spec-refiner**. Esperado funcional en **v0.2** (próxima release mayor) según roadmap del SPEC §7.

S3 es **el módulo estratégicamente más importante post-MVP** porque el input realista en banca/seguros es un FD flojo o un Jira vago — no un Gherkin limpio ni código accesible.

## Behavior in v0.1

Responde con:

```
STUB v0.1 — ia4d-qa-automator:spec-refiner

This module is documented but not implemented in MVP v0.1.

Planned for v0.2 (next major release). The S3 (Spec-refiner) module will:
  1. Parse a weak input: vague FD, badly written Jira ticket, scanned PDF.
  2. Apply LLM refinement to:
     - Expand vague criteria into concrete steps.
     - Detect missing assertions and request clarification (ask-first).
     - Map domain terminology to UI elements (with optional --target-url).
  3. Surface ambiguities as [ASSUMPTION] items requiring SDET confirmation.
  4. Produce a refined-spec.md + discovery-report.json downstream.

For MVP v0.1, use `/qa-automator:autonomous --url=<URL>` instead (S4 module, functional).

Reference:
  - SPEC.md §1 "Cuatro módulos"
  - SPEC.md §7 "Roadmap por versiones"
  - .claude/agents/ia4d-spec-refiner.md (stub agent definition)
```

No invokes subagents. No writes files. Pure informational stub.
