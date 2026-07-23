# Fase B — Setup y pasos de ejecución en VS Code Copilot

**Estado**: artefactos construidos (2026-07-23). **Ejecución**: la corre Claudio en una sesión VS
Code con licencia Copilot Business/Enterprise (el agente no puede correr sesiones interactivas de
Copilot). Este doc es autocontenido: inventario de lo construido + pasos exactos + tablas de créditos
a rellenar. Rellena las tablas con el coste por sesión/subagent que VS Code expone (junio 2026).

## Qué se construyó (inventario)

Deploy **in-repo** (decisión de Claudio): los artefactos que consume VS Code están en su ubicación
real; abres **este mismo repo** en VS Code y corres `/qa-lean`. Reusa `src/`, `config/`, `fixtures`,
`playwright.config.ts` sin build intermedio.

| Artefacto | Ubicación | Rol |
|---|---|---|
| Writer lean (`.agent.md`) | `.github/agents/ia4d-writer-lean.agent.md` | LLM #2 — batch 3 specs, sin Reviewer/axe/@criterion. `model` = brazo Sonnet (control). |
| Refiner lean (`.agent.md`) | `.github/agents/ia4d-spec-refiner-lean.agent.md` | LLM #1 — FD → cases.json, Haiku. |
| Orquestador | `.github/prompts/qa-lean.prompt.md` | `/qa-lean` — encadena red determinística + 2 delegaciones. |
| Hooks wiring | `.github/hooks/hooks.json` | SessionStart(probe) + PreToolUse(pre-flight deny-JSON) + Stop(audit-write). Sin pii-post (PII off). |
| MCP | `.vscode/mcp.json` | servidor `playwright-test` (stdio). |
| Hooks ejecutables (fuente única) | `copilot/hooks/{pre-flight,audit-write}.ts`, `probe.mjs`, `dist/*.mjs` | bundles esbuild (~100ms). `hooks.json` apunta aquí. |
| Runner determinístico | `copilot/src/lean-run.ts` (Fase A) | etapas `prepare`/`verify`. |

## Prerrequisitos (una vez)

1. **Admin de Copilot habilita los modelos Claude** (Sonnet 5, Sonnet 4.6, Haiku 4.5) — policy
   por-modelo, off por defecto para modelos nuevos en Business/Enterprise.
2. `npm install` en la raíz (trae `esbuild`, `tsx`, `@playwright/test`, `yaml`).
3. `npx playwright install chromium` si no está.
4. **Regenera los bundles de hooks** (si tocaste las fuentes `.ts`):
   ```powershell
   npm run build:hooks:copilot
   ```
   Deja `copilot/hooks/dist/{pre-flight,audit-write}.mjs`. Ya vienen committeados; el paso solo hace
   falta tras editar las fuentes.
5. Abre el repo en VS Code, activa Copilot agent mode, confirma que carga `.github/agents/*.agent.md`
   y `.github/prompts/qa-lean.prompt.md`.

## Verificación previa (barata, sin LLM)

Confirma que la red determinística está sana antes de gastar créditos:

```powershell
npm run qa:healthcheck    # 26/26
npm run build             # tsc limpio
npm test                  # 263/263
# smoke del gate de compliance (deny-JSON portable):
'{"tool_name":"browser_navigate","tool_input":{"url":"https://evil.example.com/"}}' | node copilot/hooks/dist/pre-flight.mjs
# → debe imprimir permissionDecision:"deny" y salir 0
```

## Ejecución de los 3 casos (brazo Sonnet, control)

En el chat de Copilot (agent mode):

```
/qa-lean fd=template/examples/01-saucedemo/saucedemo-fd.md url=https://www.saucedemo.com/ site=saucedemo
```

El orquestador hará, en orden: `lean-run prepare` (compliance + walker + adapter + verify-locators +
scaffold, 0 tokens) → delega refiner (LLM #1) → delega writer batch (LLM #2) → `lean-run verify`.
Objetivo: **3/3 verdes a la primera**.

**Instrumentación**: anota los créditos que VS Code muestra por sesión y por subagent, ANTES y DESPUÉS
de cada acto. El coste dominante en agent mode es el input reacumulado (no el output) — espera que el
writer domine.

## A/B del modelo del Writer (el experimento central de Fase B)

Congela los Actos 1-3 (corre `lean-run prepare` UNA vez; el dom-map, discovery y POMs quedan fijos) y
re-ejecuta SOLO el Acto 4 (writer) por brazo, sobre ese estado congelado:

- **Brazo Sonnet** (control): `model: ['Claude Sonnet 5', 'Claude Sonnet 4.6']` en
  `.github/agents/ia4d-writer-lean.agent.md` (como viene).
- **Brazo Haiku**: cambia esa línea a `model: ['Claude Haiku 4.5']`, re-corre solo el writer.

Hipótesis a falsar: sin el ping-pong del Reviewer, la contención de F6 (Reviewer Sonnet ×2,5 que se
comía el descuento Haiku) **no aplica** — el Writer barato podría ganar aquí. Métricas por brazo:
créditos, verdes a la primera, must-fix de construcción que el pre-review cazó, coste del Healer.

## Medición del Healer (segregada — rojo fabricado)

Fabrica un rojo real tipo F4 (assert semántico sobre clase siempre presente) en uno de los specs,
re-corre `lean-run verify` (rojo), luego pide al orquestador sanar (`playwright-test-healer`).
Instrumenta los créditos del Healer **aparte**: no suman al $/caso del camino limpio (decisión #5).

## Tablas a rellenar

### Créditos por acto (brazo Sonnet)

| Acto | Ejecutor | Modelo | Créditos | Notas |
|---|---|---|---|---|
| 1-3 prepare | runner | — | 0 | determinístico |
| 1.5 refiner | LLM #1 | Haiku 4.5 | | |
| 4 writer batch | LLM #2 | Sonnet 5 | | 3 specs, 1 invocación |
| verify | runner | — | 0 | determinístico |
| **Camino limpio (total)** | | | | **÷3 = créditos/caso** |
| Healer (condicional) | LLM #3 | | | segregado, no suma |

### A/B del Writer (Acto 4, dom-map congelado)

| Brazo | Créditos writer | Verdes 1ª | MF construcción | Healer | Coste esperado/caso = verde + P(rojo)×heal |
|---|---|---|---|---|---|
| Sonnet 5 | | /3 | | | |
| Haiku 4.5 | | /3 | | | |

### Precio promo vs post-promo

Calcula cada cifra a precio promo (Sonnet $2/$10 hasta 2026-08-31, cuota Business 3.000) Y
post-promo (Sonnet +50%, cuota 1.900). 1 crédito = $0,01; cached = 0,1×.

## Gate B

- [ ] Tabla de créditos por acto y por brazo, promo + post-promo.
- [ ] Decisión de modelo del Writer con dato (Sonnet vs Haiku).
- [ ] Coste esperado por caso = verde + P(rojo)×heal.
- [ ] Comparación contra el flujo completo (119 créditos/caso D3 del spike; ~$2,2/caso Claude Code) y
      contra Fase A ($0,56-0,66/caso).

## Gotchas de plataforma (verificados en el spike — mandan sobre la doc oficial)

- `exit 2` NO deniega en VS Code (queda en warning). El deny real es el JSON por stdout + exit 0 →
  ya implementado en `pre-flight.mjs`.
- Los matchers de `hooks.json` se IGNORAN en VS Code → el guard de `tool_name` vive dentro del hook.
- Hooks con timeout = fail-open. Por eso son bundles esbuild (~100ms), nunca `npx tsx`.
- `tools:` en `.agent.md` con naming Claude se ignora en silencio → se omite (todas las tools).
- `mcp-servers` en frontmatter NO funciona en VS Code → el MCP va en `.vscode/mcp.json`.
- Anidamiento de subagents off por defecto → el flavor lean no lo necesita (writer no invoca a nadie).
- Riesgo conductual: Copilot tiende a escaparse por terminal/inline. Los prompts lo prohíben
  textualmente; el gate de compliance por hook es la red.
