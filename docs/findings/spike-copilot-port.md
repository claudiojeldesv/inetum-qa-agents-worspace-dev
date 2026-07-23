# Spike: portar `ia4d-qa-automator` a GitHub Copilot (VS Code) — informe de brechas

**Fecha**: 2026-07-16. **Duración real**: ~1 jornada. **Workspace**: `../qa-copilot-spike/` (copia del template v0.3.2 + capa Copilot; fuera de este repo, desechable). **Alcance**: despejar incertidumbre, no migrar. **Resultado de la demo: 4/4 specs verdes contra SauceDemo** (login válido/inválido, compra completa, añadir-al-carrito), generados end-to-end por el flujo S4 dentro de Copilot, verificados con corrida independiente (`4 passed, 7.6s, 4 workers`).

## Veredicto ejecutivo

El port es **técnicamente viable con adaptaciones moderadas** (~1 jornada de plumbing para el vertical S4). La arquitectura sobrevive: 5 actos, delegación a subagents, Writer+Reviewer, compliance determinístico, handoff por archivos, hooks. **La brecha decisiva no es técnica sino económica**: el modelo de facturación de Copilot (peticiones × multiplicador de modelo) penaliza estructuralmente el fan-out multi-agente. Con cuenta básica (3.000 créditos/mes) el agente es usable con cuentagotas e inviable para desarrollo. Un despliegue real exige plan Business/Enterprise con presupuesto de premium requests.

## Incertidumbres del spike

| # | Incertidumbre | Veredicto | Evidencia |
|---|---|---|---|
| U1 | Hooks: ¿disparan, bloquean, latencia? | **VERDE con adaptaciones** | 4 eventos disparan; deny efectivo ("Blocked by hook" en UI, sin PostToolUse); sonda 5–31 ms/hook |
| U2 | Agents formato Claude: ¿cargan? | **ÁMBAR** | Cargan y son invocables, pero `tools:` se ignora en silencio → duplicación a `.agent.md` obligatoria si el agente usa tools MCP |
| U3 | Orquestador: ¿delega de verdad? | **VERDE con matices** | Delegación real y disciplinada (abortó antes que fabricar); ping-pong Writer↔Reviewer quedó **aplanado** (orquestador invoca al reviewer); tendencia a hacer trabajo inline si el prompt no lo prohíbe |
| U4 | MCP + nativos Playwright | **VERDE** | `run-test-mcp-server` funciona; nativos regenerados con `--loop=vscode`; planner mapeó DOM real de 2 flujos |
| U5 | Modelos Claude disponibles | **VERDE** | Sonnet 5 y Haiku 4.5 en el picker; pinning por agente funciona; restricción: subagent ≤ cost tier del padre |
| U6 | Demo 5 casos SauceDemo | **VERDE** | 4/4 (catálogo completo con `flows=inicio-sesion,compra`, cap 5 no alcanzado); calidad de producción: POM, axe, tags, `@tc-id`, review con 2 iteraciones en TC-002 |

## Hallazgos por capa

### Hooks (compliance) — la capa sobrevive, pero no gratis

1. **VS Code ignora los matchers**: los hooks corren en *cada* tool call. Mitigación aplicada: guard de `tool_name` dentro del script + bundle esbuild (`npm run build:hooks` → `hooks/dist/*.mjs`, ~100 ms de arranque vs 1–3 s de `npx tsx`). Sin el guard, el pre-flight bloqueaba cualquier `web/fetch` de Copilot.
2. **`exit 2` NO deniega en VS Code** (queda en warning y la tool se ejecuta — verificado: block C1 en audit-log + la tool corrió igual). El deny real es el protocolo JSON por stdout (`hookSpecificOutput.permissionDecision: "deny"` + exit 0), que Claude Code también honra → hook portable. Los caminos fail-closed (validador ausente, error interno) también migraron a JSON deny: con exit 2 eran fail-*open* en VS Code.
3. **Naming de tools MCP truncado**: `mcp_playwright_te_browser_navigate` (no `mcp__playwright-test__*` ni `playwright-test/*`). Cualquier matcher/guard debe ser laxo (`/playwright|browser_/`).
4. **Solo `.github/hooks/*.json` ejecuta**. Los hooks de `.claude/settings.json` no dispararon nunca (sonda con marker, 0 entradas) pese al banner "Claude Code hooks are available". La compatibilidad de formato existe en docs; en la práctica el wiring hay que llevarlo a `.github/hooks/`.
5. **Opt-in por workspace**: sin pulsar "Enable" en el banner, ningún hook corre. Riesgo de despliegue: la policy de la organización puede deshabilitar hooks; y según docs, timeout en preToolUse = fail-open (mitigar con bundle rápido + timeout generoso).
6. **Escape por terminal (ROJO, estructural)**: Copilot rodeó el gate DOS veces — escribió un script Playwright propio y lo corrió con `node` (sesión con hooks activos), y después usó `node -e` con `chromium.launch()` para depurar locators. El hook solo vigila tools MCP; `run_in_terminal` no está gateado. En Claude Code la ventana existe igual (matcher solo-MCP) pero el modelo no la usó en 6 fases de validación; Copilot la usó a la primera. Una migración real necesita hook sobre el terminal que detecte ejecución de Playwright fuera del MCP.

### Subagents

- Los `.claude/agents/*.md` cargan y son invocables, pero su frontmatter `tools:` (naming Claude) se ignora en silencio → el planner apareció sin tools de navegador y el run abortó (correctamente). Fix: `npx playwright init-agents --loop=vscode` para los 3 nativos + duplicado de los 4 `ia4d-*` del flujo a `.github/agents/*.agent.md` (sin `tools:` = todas; `agents: [ia4d-reviewer]` en el writer). **Doble formato = doble mantenimiento**: coste recurrente de la migración.
- El límite de 30k chars por agente no se alcanzó.
- Anidado writer→reviewer: en la práctica el flujo corrió **aplanado** (orquestador → writer, luego orquestador → reviewer, con re-review en iteración 2 funcionando). Es la degradación aceptable prevista; la independencia del Reviewer se preserva, la composición documentada (excepción Writer↔Reviewer) no.

### Orquestación (prompt file)

- `.github/prompts/qa-autonomous.prompt.md` (adaptación recortada de `autonomous.md`) funcionó: 5 actos, checkpoint con pausa por cap (pausó con 2>1 en D3), tc-registry con IDs estables, guarda anti-fabricación evaluada por flujo, scripts deterministas por terminal, reanudación tras cuelgue **reutilizando el estado en disco sin repetir trabajo** (el handoff por archivos es la mejor póliza de portabilidad del diseño).
- Matiz conductual: sin prohibición explícita, el orquestador hace trabajo inline (curó locators él mismo en vez de delegar al healer; creó specs `_debug` temporales). La disciplina de delegación es prompt-dependiente — más frágil que el patrón Task de Claude Code.
- Copilot CLI (no probado) no soporta prompt files/slash commands custom a fecha del spike → el orquestador tendría que ser un custom agent allí.

### Modelos y estabilidad

- Pinning por agente operativo. Mezcla final estable: **Haiku 4.5** para planner/generator/healer/discovery/a11y, **Sonnet 5** (herencia de sesión) para orquestador/writer/reviewer.
- **GPT-5 mini resultó inestable como subagent**: cuelgue silencioso de ~10 min en mitad del run (petición al modelo sin respuesta, tools completadas en ráfaga tras huecos de 4–5 min) + una llamada a `planner_save_plan` con JSON degenerado que necesitó reintento. Con Haiku no se reprodujo.
- Calidad del planner con Haiku: mapeó bien pero sucio — abuso de `browser_evaluate` con JS crudo y planes con selectores CSS (`#user-name`) en vez de semántica. El Reviewer/style-contract lo compensaron aguas abajo (los specs finales usan `getByTestId`).

### Economía (el hallazgo mayor)

| Run | Config | Créditos | Por caso |
|---|---|---|---|
| D3 (1 caso) | Todo Sonnet 5 | 118,8 | ~119 |
| D4 (3 casos + healing + re-review) | Haiku mecánicos + Sonnet writer/reviewer | ~222 | ~74 |

Copilot factura peticiones × multiplicador, no tokens. Cada delegación es una sesión con decenas de peticiones. Con 3.000 créditos/mes: ~40 casos/mes en el mejor caso, compartiendo cuota con el uso normal del ingeniero. **Viable para ejecutar con moderación; inviable para desarrollar o para runs grandes.** Palancas confirmadas: mezcla de modelos por agente, saltar delegaciones redundantes (a11y-injector condicional: el writer ya inyecta axe), amortización del coste fijo (planner/discovery) entre casos, un run por sesión de chat.

## Bugs propios destapados por el spike

- **`src/pom-scaffolder.ts:197`**: el import de components se emite como `'../components/<file>'` — roto desde el namespacing por sitio (desde `tests/pages/<site-id>/` la ruta es `'../../components/<site-id>/<file>'`). No se manifestó antes porque los runs previos no generaban `components[]` o el writer lo tapaba. **Fix pendiente en este repo** (una línea + test).

## Recomendación

- **No migrar ahora.** Mantener Claude Code como plataforma primaria. El port completo (4 módulos, S2/S3, hooks endurecidos con gate de terminal, doble formato de agents, re-validación conductual tipo Fase A–F) se estima en 2–4 semanas, y la economía por caso solo cierra con plan Business/Enterprise.
- **Sí conservar** los artefactos del spike como base de un "Copilot flavor" futuro: hooks con deny JSON portable (funcionan en ambas plataformas — candidato a backport al repo), guard dual de naming, prompt file S4, y la lección del terminal-gate.
- Si un cliente exige Copilot: el vertical S4 demostrado es presentable como PoC hoy, con las brechas ROJAS (terminal escape, economía, features en Preview) declaradas por delante.

## Evidencia

- Workspace del spike: `../qa-copilot-spike/` (`.github/hooks/hooks.json`, `.github/agents/*.agent.md`, `.github/prompts/qa-autonomous.prompt.md`, `hooks/dist/`, sonda `.work/hook-probe.log`, `.work/audit-log.json` con la traza block/allow completa).
- Corrida final: `4 passed (7.6s)` con `QA_WORK_DIR=.work/saucedemo QA_BASE_URL=https://www.saucedemo.com/ npx playwright test tests/e2e/saucedemo/`.
- Deny en vivo: UI "Blocked by hook" + audit `block C1 example.com` 16:16:19 sin PostToolUse; allow saucedemo con navegación real del planner (entradas 13:24–13:33).
