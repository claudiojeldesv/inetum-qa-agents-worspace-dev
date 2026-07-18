# Plan de desarrollo: edición Copilot de `ia4d-qa-automator` (S3, experimental)

**Para**: agente Claude (Fable 5) en sesión nueva, sin contexto previo. Este documento es autocontenido: los datos de plataforma ya están investigados y verificados (2026-07-16 a 2026-07-18) — NO re-investigues salvo donde se marque expresamente. Lee primero el `CLAUDE.md` del repo (se carga solo) y luego esto.

**Qué es**: una PRUEBA — no un producto de catálogo. Derivar de `qa-automator` (Claude Code) una edición que corre sobre GitHub Copilot en VS Code, módulo S3 solamente (FD + URL → suite Playwright), optimizada para consumo mínimo de AI Credits. Se desarrolla en **rama aparte** de este repo. No va al catálogo I+D; no comprometas fichas ni material de venta.

## Decisiones cerradas (no re-abrir sin hablar con Claudio)

1. **Monorepo, no repo nuevo**: la edición Copilot es un *output generado* de este repo, como `template/` y el plugin. Patrón `build:template` ya probado.
2. **Layout**: carpeta fuente `copilot/` top-level con `{agents/, prompts/, hooks/, plugin/, src/}`. `npm run build:copilot` genera el workspace desplegable **committeado** (inspeccionable en PRs, como `template/`).
3. **dom-walker y runner: Copilot-only por ahora** — viven en `copilot/src/`, NO en `src/` core. Promoción a core solo si demuestran valor (decisión futura de Claudio).
4. **Rama**: `design/copilot-edition` (convención del repo: `design/gates-off-by-default`, `design/model-b-plugin`).
5. **Alcance funcional**: S3 con POM, Reviewer independiente, Healer. SIN: PII, axe/a11y, Judge, S1/S2/S4, planner nativo de Microsoft. El compliance pre-flight y el audit-log SÍ se conservan (determinísticos, 0 tokens).
6. **Cliente asumido**: Copilot Business/Enterprise (créditos pooled, admin habilita modelos/hooks/plugins).
7. **Coste**: "medir primero, fijar después" — el hito H0 instrumenta y produce el número; no prometas targets antes.
8. **Distribución**: workspace generado obligatorio; empaquetado Agent Plugin = stretch goal (es una prueba). El manifest de plugin comparte formato con el plugin Claude existente (`plugin-src/`).
9. **Hito de salida**: demo interna reproducible (máquina limpia, licencia Business, SauceDemo + un FD real, coste medido por acto).

## Base ya construida (NO partir de cero)

- **`../qa-copilot-spike/`** (carpeta hermana, fuera del repo): spike funcional completo. Contiene la capa Copilot validada en vivo: hooks bundleados con esbuild + guard de tool-name + deny por JSON (`hooks/dist/*.mjs`, script `build:hooks`), `.github/agents/*.agent.md` (4 ia4d + 3 nativos), `.github/prompts/qa-autonomous.prompt.md` (orquestador S4 que corrió 4/4 verde contra SauceDemo), `.vscode/mcp.json`, sonda `hooks/probe.mjs`, y logs de evidencia (`.work/hook-probe.log`, `.work/audit-log.json`). **Minar este spike, no reinventarlo.**
- **`docs/findings/spike-copilot-port.md`**: informe de brechas del spike con la tabla U1-U6 y todos los hallazgos verificados.
- Core reutilizable de este repo (via `build:copilot`): `src/compliance-preflight.ts`, `src/pom-scaffolder.ts`, `src/contract-validator.ts`, `src/audit-log.ts`, `hooks/pre-flight.ts` (⚠️ la variante con deny-JSON está en el spike, no aquí — port necesario), `config/style-contracts/`, `config/allowed-targets.yaml`, `config/tc-registry/`, `docs/references/`, y el `ia4d-spec-refiner` (S3, `.claude/agents/ia4d-spec-refiner.md` — su prompt se adapta a `.agent.md`).

## Datos de plataforma (verificados 2026-07-16/18 — no re-investigar)

### Facturación
- Desde 2026-06-01 Copilot factura por **AI Credits**: 1 crédito = $0.01, calculado por **tokens reales** (input + output + cached) a tarifa por modelo. Los "premium requests" son legacy (solo anuales antiguos).
- **El coste dominante en agent mode es el input reacumulado**: cada iteración del loop reenvía el contexto acumulado (comunidad mide input:output ~60x). Diseñar para contexto mínimo y estable, no para "menos llamadas".
- Tokens cacheados = 0.1x del input. Prefijos de prompt estables = ahorro real.
- Cuotas: Business 1.900 créditos/user/mes pooled (promo 3.000 hasta 2026-09-01), Enterprise 3.900 (promo 7.000). Overage $0.01/crédito. Reset mensual, sin rollover.
- VS Code muestra coste por sesión y por subagent (junio 2026) — usar para la instrumentación de H0.

### Modelos (tarifas $/Mtoken input–output; promo marcada)
- Claude Haiku 4.5: 1.00–5.00 (cached 0.10). El barato FIABLE.
- **Claude Sonnet 5: 2.00–10.00 SOLO hasta 2026-08-31** (después presumiblemente 3.00–15.00 como Sonnet 4.x). Zero Data Retention. GA desde 2026-06-30.
- GPT-5.4 nano 0.20–1.25 / GPT-5 mini y Raptor mini 0.25–2.00: los más baratos, PERO la clase mini tiene **cuelgues documentados como subagent** (issues: subagent con `total_turns: 0` colgado indefinidamente, sin error). En el spike, GPT-5 mini colgó un run. Usar solo con vigilancia; Haiku es el default mecánico.
- `model:` en frontmatter acepta **array priorizado** (`['Claude Sonnet 5', 'Claude Sonnet 4.6']`) con fallback en orden. Nombre inexistente = warning + **fallback silencioso al modelo del padre** (rompe determinismo — siempre array). GitHub depreca modelos cada ~4-6 meses.
- **Cost-tier vigente**: un subagent no puede usar modelo de tier superior al de la sesión padre. El orquestador marca el techo.
- En Business/Enterprise los modelos Claude requieren habilitación del admin (policy por-modelo, off por defecto para modelos nuevos).

### Plataforma VS Code (gotchas verificados en el spike — la doc oficial contradice dos; manda lo empírico)
- **Hooks** (Preview): eventos `SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, SubagentStart, SubagentStop, Stop`. Se cargan de `.github/hooks/*.json` (verificado). La doc dice que también ejecuta `.claude/settings.json` — **en el spike NO disparó**; asumir solo `.github/hooks/`.
- **Matchers IGNORADOS en VS Code** (limitación oficial documentada; arreglada solo en CLI). Filtrado = guard de `tool_name` DENTRO del script.
- **`exit 2` NO deniega** (verificado: la tool corre igual, queda en warning). Deny real = stdout JSON `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}` + exit 0 — Claude Code también lo honra (hook portable). El spike ya tiene esta variante de `pre-flight.ts`.
- **Timeout de hooks = fail-open SIEMPRE**. Los hooks deben ser rápidos: bundle esbuild (`node hooks/dist/x.mjs`, ~100ms), nunca `npx tsx` (1-3s).
- **Naming de tools MCP observado**: `mcp_playwright_te_browser_navigate` (truncado, no documentado, NO estable). Guards laxos: `/playwright|browser_/i`.
- **Custom agents** `.github/agents/*.agent.md`: límite 30.000 chars de prompt; `tools:` desconocidas se ignoran EN SILENCIO (by design) — los nombres formato Claude no mapean en VS Code; omitir `tools:` = todas. `agents: [lista]` para subagents permitidos. `mcp-servers` en frontmatter NO funciona en VS Code (solo cloud agent) — el MCP va en `.vscode/mcp.json`.
- **Subagents**: aislados (no heredan contexto del padre — bueno para tokens), sin timeout programático (cuelgues de 15+ min documentados), anidamiento off por defecto (`chat.subagents.allowInvocationsFromSubagents`, profundidad ≤5). En el spike el ping-pong Writer↔Reviewer corrió APLANADO (orquestador invoca al reviewer tras el writer) — aceptable, documentado.
- **Prompt files** `.github/prompts/*.prompt.md`: funcionan en VS Code (NO en Copilot CLI). Variables `${input:x}`. Campo `agent:` fija el agente ejecutor.
- **Riesgo conductual verificado**: Copilot tiende a hacer trabajo inline o escaparse por terminal si el prompt no lo prohíbe explícitamente (en el spike rodeó el gate de compliance 2 veces con scripts `node`). Los prompts deben prohibirlo textualmente; el gate de terminal es mejora futura.

## Arquitectura objetivo (token-first)

Principio: **determinístico primero; el LLM solo donde hay razonamiento**. Cuatro touchpoints LLM (+healer condicional). Todo el estado en archivos (resumable — sin timeout de subagents, la reanudación es la mitigación).

| Fase (5 actos) | Ejecutor | Tokens |
|---|---|---|
| Acto 1 — Comprender: pre-flight compliance, validar inputs, brief | `hooks/dist/pre-flight.mjs` + runner | 0 |
| Acto 1.5 — Refinar: FD → `criteria.json` RF-NNN + open_questions (gate: no fabricar sobre ambiguo) | `ia4d-spec-refiner` (.agent.md) | LLM #1 |
| Acto 2 — Mapear: ejecutar el guion de pasos del FD (extraído por el refiner) con datos sintéticos, capturar `ariaSnapshot` + locators candidatos + formularios + transiciones → `dom-map.json` | **`copilot/src/dom-walker.ts`** (nuevo, Playwright puro, guiado por brief+criterios, auth vía auth-handler Fase C) | ~0 + **rescates acotados**: si un paso no se resuelve con heurística determinística (texto/rol/data-test), micro-llamada Haiku con el snapshot para resolver el locator (~1-3 créditos, contada y registrada); si tampoco → paso bloqueado a open_questions, no se adivina |
| Acto 2b — Mapping: criteria × dom-map → `criteria_mapping` + **drift-report** (RF no expuesto = drift declarado, JAMÁS fabricado). **POR FLUJO, no por sitio** (input acotado en sitios grandes), sobre un dom-map **podado determinísticamente** (solo interactivos/landmarks, dedupe de componentes repetidos con `count`, cap por pantalla) | 1 petición por flujo (.agent.md o prompt directo) | LLM #2 (×flujos) |
| Acto 2.5 — Checkpoint: cap, IDs estables `tc_registry` | script (hoy es prosa en autonomous.md; convertir a código) | 0 |
| Acto 3 — Estructurar: POM desde dom-map | `src/pom-scaffolder.ts` (⚠️ ver bug abajo) | 0 |
| Acto 4 — Materializar: specs con `@criterion RF-NNN`, un archivo por spec, batch moderado | `ia4d-writer` adaptado (.agent.md) | LLM #3 |
| Acto 5 — Juzgar: review de SUITE (una pasada, veredicto por spec) + una ronda de fixes dirigida | `ia4d-reviewer` adaptado (.agent.md) | LLM #4 |
| Verificación: tsc, `--list`, `npx playwright test` | runner | 0 |
| Healer (solo si hay rojos): error-contexts de Playwright + re-walk de la pantalla fallida (0 tokens) → 1 petición de sanación → re-run | one-shot | LLM #5 |

- **Orquestador delgado**: `copilot/src/qa-s3-run.ts` (runner) encadena las fases 0-tokens; el prompt file `/qa-s3` solo dispara las delegaciones LLM con contexto quirúrgico (paths, no contenidos). Cada turno del orquestador también consume — el guion vive en el script, no en la conversación.
- **Modelos**: matriz candidata a medir en H0 — Writer/Reviewer: `['Claude Sonnet 5', 'Claude Sonnet 4.6']` vs `['Claude Haiku 4.5']`; mecánicos (refiner, mapping): `['Claude Haiku 4.5']` (Raptor mini solo como experimento vigilado). Orquestador: mismo tier que el Writer (cost-tier), con contexto mínimo.
- **Batching**: moderado y adaptativo (3-5 specs cortos o 1-2 largos por invocación del writer), un archivo por spec, manifiesto verificado por código. Nunca "N specs en un solo output".

### Layout de `copilot/` (fuente) y el output

```
copilot/
├── agents/          # fuentes .agent.md (spec-refiner, writer, reviewer, mapping)
├── prompts/         # qa-s3.prompt.md (orquestador)
├── hooks/           # wiring .github/hooks/hooks.json + variantes deny-JSON de los hooks
├── plugin/          # manifest plugin.json + marketplace.json (stretch)
└── src/             # dom-walker.ts, qa-s3-run.ts, cost-instrumentation, checkpoint script
```

`npm run build:copilot` (nuevo script en `src/scripts/`, patrón de `build-template.mjs`) genera el workspace desplegable committeado (p.ej. `copilot-workspace/` o dentro de `copilot/dist-workspace/` — decidir al construir, criterio: mismo trato que `template/`): core determinístico del repo + adapters de `copilot/` + `.vscode/mcp.json` + `.github/{agents,prompts,hooks}` + config + package.json starter con `build:hooks`.

## Bug conocido a arreglar ANTES del vertical (está en el core, afecta a ambas ediciones)

`src/pom-scaffolder.ts:197`: emite `import ... from '../components/<file>'`; con el namespacing por sitio (pages en `tests/pages/<site-id>/`, components en `tests/components/<site-id>/`) la ruta correcta es `'../../components/<site-id>/<file>'`. Descubierto en el spike (SauceDemo generó components y el import rompió la suite hasta que el orquestador lo parcheó a mano). **Fix de una línea + unit test. Es la única edición permitida en `src/` core; el resto del core no se toca.**

## Fases (cada una con gate; evidencia en `docs/findings/copilot-edition/`)

**H0 — Métrico (~2 días).** Instrumentar el spike existente (`../qa-copilot-spike/`) con el coste por acto (VS Code expone coste por sesión/subagent; anotar créditos antes/después por fase). Medir la matriz de modelos: {Sonnet 5, Haiku 4.5} en writer/reviewer sobre 2-3 casos. Calcular cada cifra a precio promo Y post-promo (Sonnet +50% desde 2026-09-01; cuota Business 3.000→1.900). Nota: las sesiones interactivas de Copilot las ejecuta Claudio — preparar los artefactos y darle pasos exactos, como se hizo en el spike (ver findings).
*Gate: tabla de coste por acto + target de coste por suite fijado con datos.*

**H1 — dom-walker (~1-1.5 semanas).** `copilot/src/dom-walker.ts` + unit tests. Contra SauceDemo (simple) y OrangeHRM (SPA + auth persistente; reusar el patrón `QA_STORAGE_STATE` de Fase C — hay demo en `tests/` de este repo, commit `23b3498`). Input: brief + criteria.json; output: `dom-map.json` (schema: screens, elementos con locators candidatos por prioridad del contract, formularios, transiciones). Requisitos duros: (a) **iframes** — enumerar frames, capturar por-frame, registrar la ruta del frame en cada locator; (b) **poda determinística del dom-map** — solo interactivos/landmarks, dedupe de componentes repetidos (`count`), cap por pantalla; (c) **rescate LLM acotado** — resolución de paso ambiguo vía micro-llamada Haiku con el snapshot, contada, registrada al audit-log, con tope por run; agotado el tope o fallido el rescate → paso bloqueado a open_questions; (d) waits/dialogs; los "then" ambiguos NO se resuelven — se anotan.
*Gate: dom-map correcto y completo en ambos sitios; camino feliz 0 tokens y determinista (dos runs = mismo output módulo timestamps); rescates solo donde se justifique y visibles en el audit-log.*

**H2 — Vertical S3 completo (~1-1.5 semanas).** Adaptar spec-refiner/writer/reviewer a `.agent.md` (base: los del spike + los originales de `.claude/agents/`), prompt de mapping, runner, checkpoint script, healer one-shot, prompt file `/qa-s3`. Correr contra SauceDemo con `template/examples/01-saucedemo/saucedemo-fd.md`. El FD declara cosas que SauceDemo no expone → el drift-report debe reportarlas sin fabricar tests (tesis del producto; el spike ya lo validó en S4).
*Gate: suite verde + drift honesto + coste ≤ target de H0 + reanudación probada (matar el run a la mitad y retomar).*

**H3 — Empaquetado (~2-4 días).** `build:copilot` generando el workspace committeado; validación estructural dentro del output (healthcheck adaptado, build, tests — como se valida `template/`). Stretch (solo si sobra tiempo): manifest Agent Plugin + marketplace.json reusando el patrón de `plugin-src/`.
*Gate: workspace generado funciona en carpeta limpia con `npm install` + pasos de arranque documentados en su README.*

**H4 — Demo interna reproducible (hito de salida).** Máquina limpia con licencia Business: desplegar el workspace, correr SauceDemo + UN FD real elegido por Claudio, coste medido por acto, informe final en `docs/findings/copilot-edition/demo-report.md` (formato: como `spike-copilot-port.md`).
*Gate: Claudio reproduce la demo sin ayuda del agente.*

## Reglas de trabajo para el agente ejecutor

- Rama `design/copilot-edition`; commits por fase con la red de seguridad del repo (healthcheck + build + test verdes antes de cada commit). No push sin que Claudio lo pida.
- **Scope**: no tocar `template/`, `plugin-src/`, `.claude/` de producción ni `src/` core (única excepción: el fix del pom-scaffolder, con test). El spike `../qa-copilot-spike/` es referencia de lectura — minarlo, no seguir construyendo en él.
- Las sesiones interactivas de VS Code Copilot NO puede ejecutarlas el agente: prepararlas y entregar pasos exactos a Claudio, luego leer logs/artefactos y ajustar (modelo operativo probado en el spike — ver `docs/findings/spike-copilot-port.md`).
- Surface assumptions; ante ambigüedad de intención, preguntar a Claudio antes de actuar. Sin sycophancy, prosa directa, sin emojis.
- Cada fase deja evidencia en `docs/findings/copilot-edition/` (un archivo por hito, sobrio, con datos).
- Si la plataforma cambió respecto a los datos de este documento (Preview: hooks, plugins, subagents pueden moverse), verificar contra el changelog oficial ANTES de asumir bug propio — y actualizar este documento con lo aprendido.

## Referencias

- `docs/findings/spike-copilot-port.md` — informe del spike (léelo entero antes de empezar).
- `../qa-copilot-spike/` — implementación de referencia viva.
- `.claude/commands/qa-automator/spec-refiner.md` y `autonomous.md` — la lógica S3/S4 original a destilar.
- `docs/references/` — writer-reviewer-protocol, style-contract-schema, compliance-rules, composition-rules.
- `SPEC.md` — el producto padre; la edición Copilot no lo modifica.
