---
description: Smoke test del agente ia4d-qa-automator. Ejecuta el healthcheck determinístico del runtime y presenta su salida.
---

# /ia4d-qa-automator:healthcheck

Smoke test que confirma que el workspace está listo para invocar `ia4d-qa-automator`. No invoca
subagents ni gasta tokens de navegador: delega en el script determinístico del runtime, que es la
única fuente de verdad de qué debe existir (misma filosofía que `/ia4d-qa-automator:config` con el
contract-validator — hard rule #5, validación determinística).

## Procedure

1. Ejecuta el healthcheck del runtime y muestra su salida **verbatim** (no la reinterpretes ni la
   resumas — cada línea `OK`/`FALTA` es el diagnóstico):
   ```sh
   npm run qa:healthcheck
   ```
2. Exit code `0` → termina reportando el estado (el script cierra con `Healthcheck OK` y el número
   de comprobaciones). Exit code `1` → reporta QUÉ piezas faltan (el script lo dice línea a línea) y
   el comando de reparación que el propio script sugiere (`npm ci`, `npx playwright install chromium`,
   o `npm run qa:fix` para lo auto-reparable). No continúes con otros commands hasta que esté verde.

## Qué comprueba el script (referencia, no lo repliques a mano)

- Agentes nativos de Playwright en `.claude/agents/` (los 12 agentes `ia4d-*` y los commands los
  provee el **plugin**, no el workspace — modelo híbrido v0.3.1).
- Hooks (`hooks/*.ts`) y su wiring en `.claude/settings.json`.
- Lógica determinística (`src/`), config declarativa (`config/allowed-targets.yaml`, `.mcp.json`,
  `playwright.config.ts`).
- Playwright: versión en lockstep `playwright` ↔ `@playwright/test`, browser chromium instalado, y
  que el server MCP `run-test-mcp-server` arranca (config ≠ conexión viva: si la sesión arrancó
  antes del `npm install`, reconecta el MCP — recarga la ventana o `/mcp`).
- Gates opcionales: reporta el estado efectivo de `QA_ENABLE_PII` / `QA_ENABLE_JUDGE`.

## Failure modes

- `npm run qa:healthcheck` no existe o falla al arrancar → el workspace no está desplegado o falta
  `npm install`; indica ejecutar `/ia4d-qa-automator:init <carpeta>` o `npm install` según el caso.
- Piezas faltantes → lista del script + comando de reparación sugerido.
- Todo OK pero el planner falla con `_currentSuite === null` → MCP obsoleto en la sesión: recargar
  ventana o `/mcp` → reconectar `playwright-test`.
