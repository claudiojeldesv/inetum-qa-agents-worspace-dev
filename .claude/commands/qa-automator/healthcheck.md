---
description: Smoke test del agente ia4d-qa-automator. Verifica versión, subagents detectados, MCP server status.
---

# /ia4d-qa-automator:healthcheck

Smoke test que confirma que el entorno está listo para invocar `ia4d-qa-automator`. No invoca subagents, solo lee el filesystem.

## Procedure

1. Print version of the agent (read from `package.json`).
2. List the subagents present under `.claude/agents/`:
   - native: `playwright-test-{planner,generator,healer}`
   - transversal: `ia4d-{compliance-checker,pii-scanner,style-enforcer,a11y-injector}`
   - quality layer: `ia4d-{writer,reviewer,judge}`
   - autonomous + dispatcher: `ia4d-{discovery-analyzer,mode-router}`
   - stubs: `ia4d-{code-analyzer,spec-parser,spec-refiner}`
3. Verify presence of:
   - `config/allowed-targets.yaml`
   - `hooks/hooks.json`
   - `config/style-contracts/saucedemo.yaml` (MVP demo contract)
   - `.mcp.json` declares `playwright-test`
4. Verify Node ≥ 20 and Playwright ≥ 1.56 via shell:
   ```sh
   node --version
   npx playwright --version
   ```
5. Print OK message with version + subagent count.

## Expected output

```
ia4d-qa-automator v0.1.0
  Subagents detected: 13 (3 native + 4 transversal + 3 quality + 2 autonomous + 3 stubs)
  Config OK: allowed-targets.yaml, hooks.json, saucedemo.yaml present
  Runtime OK: Node v24.x, Playwright v1.60.x
  MCP servers: playwright-test enabled
Status: OK
```

## Failure modes

- Missing subagent file → list which.
- Missing config → list which.
- Node < 20 or Playwright < 1.56 → block.
