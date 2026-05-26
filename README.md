# ia4d-test-pilot

Agente Claude Code que envuelve los Playwright Test Agents nativos (v1.56+) con compliance pre-flight, Style Contract enforcement, accesibilidad baked-in (axe-core / WCAG 2.1 AA) y audit log estructurado. Pensado para SDETs en sectores regulados (banca, seguros).

Primer entregable de la categoría QA del catálogo Inetum `ia4d-*`. Estado actual: MVP en construcción.

## Entrada al repo

- [`SPEC.md`](SPEC.md) — definición del agente (objetivo, commands, structure, code style, testing, boundaries).
- [`CLAUDE.md`](CLAUDE.md) — convenciones del proyecto y contexto operativo.
- [`tasks/plan.md`](tasks/plan.md) — plan por fases con dependency graph y checkpoints.
- [`tasks/todo.md`](tasks/todo.md) — siguiente tarea ejecutable.
- [`docs/findings/spike-playwright-mcp.md`](docs/findings/spike-playwright-mcp.md) — verdict GO del spike inicial.

## Comandos del proyecto

```bash
npm install
npm test     # Vitest
npm run lint
npm run format
npm run build
```

Los commands del agente (`/test-pilot:discover`, `/test-pilot:plan`, etc.) viven en `.claude/commands/test-pilot/` y se implementan slice a slice según `tasks/todo.md`.
