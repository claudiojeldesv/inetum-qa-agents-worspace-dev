# Plan: `copilot-efficient-tokens` — MVP lean S3, 3 casos SauceDemo

**Rama**: `copilot-efficient-tokens` (desde `develop`, que ya integra token-efficiency + quality-greens + copilot-edition H0-H1).
**Qué es**: una PRUEBA de coste, no un producto de catálogo. Un flujo S3 (FD + URL → suite Playwright) recortado al mínimo viable, para medir **cuánto cuesta generar 3 casos funcionales bien construidos** cuando se quitan todas las capas que cuestan tokens/créditos y no afectan a la construcción del test. Deriva del vertical S3 de la edición Copilot ([`plan-copilot-edition.md`](plan-copilot-edition.md)), pero recortado aún más.
**Pregunta que responde**: dado el checklist congelado abajo, ¿cuál es el $ (Claude Code) y los créditos (Copilot) por caso, y los tests quedan bien construidos sin Reviewer LLM?

**Regla de oro heredada del carril tokens**: ninguna cifra se da por buena sin medición. El $ se mide con `total_cost_usd` del stream headless; los créditos con el desglose por sesión/subagent que VS Code expone. Proyecciones marcadas como tales.

---

## Checklist congelado (config de la prueba — NO reabrir sin hablar con Claudio)

Tres cubos. La distinción clave: **no todo "addon" cuesta**. Los scripts determinísticos son 0 tokens y son lo que hace que el test quede bien — se conservan.

### Cubo A — CORTADO (no afecta a la construcción del test)
- Trazabilidad `@criterion RF-NNN` + drift-report → elimina un touchpoint LLM (Acto 2b mapping).
- Scan de accesibilidad (axe / `@axe-core/playwright`).
- PII scanner (ya off por defecto, regla #10).
- Judge / scoring (ya off por defecto).
- `evidence.level` → `minimal` (sin `test.step`/screenshot por paso; adelgaza el output pagado).
- tc-registry / IDs estables / reconciliación de slugs (Q4) / archivado → identidad entre runs, irrelevante en prueba atómica.
- Checkpoint / cap por catálogo → irrelevante con 3 casos.
- Reporte showcase + Allure → post-proceso desacoplado, fuera de la prueba.
- Planner + discovery nativos → sustituidos por el **dom-walker** (H1, 0 tokens).

### Cubo B — MANTENER (cuesta ~0 y es lo que hace que el test quede bien construido)
- POM scaffolder (`src/pom-scaffolder.ts`) — petición explícita.
- **verify-locators** (`src/scripts/verify-locators.ts`, Q2) — resuelve cada locator contra el DOM real. Sube verdes a la primera, 0 tokens.
- **pre-review determinístico** (`src/scripts/pre-review.ts`, Q3) — checks mecánicos (locators prohibidos, waits, min asserts, naming, regex sin anclas). Sustituto parcial del Reviewer, gratis.
- Compliance pre-flight (`src/compliance-preflight.ts`) — 0 tokens, regla dura #3.
- audit-log (`src/audit-log.ts`) — 0 tokens, evidencia.

### Cubo C — DECISIÓN de coste tomada: Reviewer LLM CORTADO
- El único addon que cuesta de verdad (~$0,3/invocación; en Copilot corre aplanado, más caro).
- Se sustituye su rol de construcción por la red del Cubo B (verify-locators caza "el locator no resuelve"; pre-review caza los must-fix mecánicos).
- **Lo que la red NO recupera**: correctitud semántica (assert sobre clase siempre presente, tipo rojos de F4). Ese riesgo se asume; el **Healer** es la red por detrás.

> Exención de regla dura documentada: el flavor Copilot S3 ya está exento de axe/PII/Judge por la decisión cerrada #5 de [`plan-copilot-edition.md`](plan-copilot-edition.md). Esta prueba corre bajo ese flavor; cortar el scan de axe NO viola la regla #10 (que aplica al producto Claude Code de catálogo). Toda medición en Claude Code (Fase A) es un dry-run del flavor Copilot, no del producto de catálogo.

---

## Los 3 casos

Desde `template/examples/01-saucedemo/saucedemo-fd.md`:
1. **Login** (credenciales válidas → dashboard/inventario).
2. **Agregar producto al carrito** (añadir 1 ítem → badge del carrito = 1).
3. **Compra exitosa** (checkout completo → "Thank you for your order!").

**Nota sobre el walk fixture** (`copilot/fixtures/saucedemo.walk.json`): hoy tiene 2 flujos, `inicio-sesion` y `compra`. El caso 2 (carrito) NO es un flujo propio: sus pantallas (inventario + carrito) ya las recorre `compra`. El dom-map que produce el walker cubre las 3 pantallas necesarias; los 3 casos los redacta el Writer desde ese mismo dom-map + la lista de casos del refiner. **Acción P0**: confirmar que el dom-map de `compra` captura la pantalla de carrito con el badge; si no, extender el fixture con los 2-3 pasos del carrito (trabajo determinista, 0 tokens).

---

## El espinazo mínimo (touchpoints LLM = donde se paga)

| Acto | Ejecutor | Coste |
|---|---|---|
| 1 Compliance + validar URL | hook/script | **0** |
| 1.5 Refiner: FD → lista de 3 casos (SIN RF-NNN) | LLM #1 (Haiku, 1 llamada ligera) | bajo |
| 2 Mapear: dom-walker sobre el walk-script | `copilot/src/dom-walker.ts` + rescates Haiku (tope 3) | **~0** + rescates |
| 3 Estructurar: POM desde dom-map | `src/pom-scaffolder.ts` | **0** |
| 4 Materializar: 3 specs one-shot, SIN Reviewer/axe/traza | LLM #2 (Writer, **1 invocación batch → 3 ficheros**) | **el grueso** |
| — Red determinista | verify-locators + pre-review | **0** |
| Verificar | `npx playwright test` | **0** |
| Healer (solo si rojo) | LLM #3 (one-shot, condicional) | extra |

**Touchpoints LLM totales: 2 fijos (refiner + writer) + healer condicional.** Es más ligero que el vertical S3 completo (que tiene 4-5).

**Palanca de batch**: los 3 casos son cortos → **1 invocación de Writer que escribe los 3 ficheros** (un contexto, un prefijo pagado una vez), no 3 invocaciones. Manifiesto verificado por código (regla del vertical: "3-5 specs cortos por invocación, un archivo por spec").

---

## Estado de partida (qué existe, qué falta)

**Existe y se reutiliza** (0 construcción):
- `copilot/src/dom-walker.ts` + `saucedemo.walk.json` (H1, validado 16/16, determinista).
- `src/pom-scaffolder.ts` (el bug del import de components ya está arreglado — commit `51c36e6`, `componentsImportBase()` deriva la ruta de los dirs reales; nada que hacer aquí).
- `src/scripts/{verify-locators,pre-review,run-heal-mecanico}.ts`.
- `src/{compliance-preflight,audit-log}.ts`.
- FD: `template/examples/01-saucedemo/saucedemo-fd.md`.
- Del spike (`../qa-copilot-spike/`, carpeta hermana): hooks deny-JSON bundleados, `.github/agents/*.agent.md`, prompt file S4. Minar, no reinventar.

**Falta construir** (el MVP):
- Un **modo lean del Writer**: sin Reviewer, sin axe, sin `@criterion`. Variante de prompt o flag; NO tocar el `ia4d-writer.md` de catálogo — vive en `copilot/agents/`.
- **Refiner ligero**: FD → `{cases[]}` sin RF-NNN. Adaptar `ia4d-spec-refiner` recortando la trazabilidad.
- **Orquestación lean**: un runner/prompt que encadene refiner → walker → scaffold → writer batch → red determinista → verify → heal. En Claude Code (Fase A) puede ser un script/secuencia manual; en Copilot (Fase B) es prompt file + `.agent.md`.
- `copilot/` hoy solo tiene `src/` (walker). Añadir `agents/`, `prompts/`, `runner` según el layout de `plan-copilot-edition.md`.

---

## Fases (cada una con gate; evidencia en `docs/findings/copilot-efficient-tokens/`)

Secuencia deliberada: **validar barato en Claude Code antes de gastar créditos Copilot.**

### Fase A — Baseline lean en Claude Code (número $ + validación de calidad). Barata, headless.
Ensamblar el espinazo desde las piezas existentes y correr los 3 casos headless. Objetivo doble: (1) confirmar que **los tests quedan bien construidos sin Reviewer** (verdes a la primera + inspección manual: POM limpio, locators por contract, asserts reales); (2) obtener el **$ por caso** con `total_cost_usd`.
- Protocolo de medición del carril tokens (headless `claude -p`, `parse-usage.mjs`, discovery/walk congelado).
- Medir con y sin healer (forzar el camino común y el de rojo).
- **Gate A**: 3/3 construidos y verdes (o rojos con causa raíz identificada y sanados por el Healer), $ por caso medido y desglosado. Si sin Reviewer la calidad se cae por debajo de lo presentable (rojos semánticos que el Healer no sana limpio), el dato mata la hipótesis del Cubo C aquí, barato, antes de Copilot.

### Fase B — Medición en Copilot (número en créditos). Requiere sesión VS Code (la ejecuta Claudio).
Portar el flavor lean validado en A a VS Code: `.agent.md` (writer lean + refiner), prompt file, hooks deny-JSON del spike, `.vscode/mcp.json`. Correr los 3 casos e instrumentar créditos por acto.
- **A/B del modelo del Writer** (el experimento central): brazo Sonnet 5 vs brazo Haiku 4.5, mismo dom-map congelado. Hipótesis a falsar: sin el ping-pong del Reviewer, la dinámica de contención de F6 (Reviewer ×2,5 que se comía el descuento Haiku) **no aplica** — el Writer barato podría ganar aquí. Métricas: créditos por brazo, verdes a la primera, coste del Healer por brazo.
- Calcular a precio promo (Sonnet $2/$10 hasta 2026-08-31) Y post-promo (+50%; cuota Business 3.000→1.900).
- **Gate B**: tabla de créditos por acto y por brazo; decisión de modelo del Writer con dato; coste esperado por caso = verde + P(rojo)×heal.

### Fase C — Informe de cierre.
Actualizar el marco €/run del informe con la línea "flujo lean 3 casos" (Claude Code $ y Copilot créditos, ambos brazos). Comparar contra el flujo completo (119 créditos/caso D3 del spike; ~$2,2/caso Claude Code). Recomendación: ¿el flavor lean es presentable como PoC, o el recorte del Reviewer degrada demasiado?

---

## Protocolo de medición (idéntico al carril tokens)
- **Claude Code**: `claude -p "..." --model sonnet --output-format stream-json --verbose` → `.work/audit-runs/`; desglose con `src/scripts/parse-usage.mjs`; `total_cost_usd` del evento `result` es la cifra oficial.
- **Copilot**: VS Code expone coste por sesión y por subagent (jun-2026); anotar créditos antes/después por fase. 1 crédito = $0,01, tokens reales (input+output+cached), cached 0,1×.
- **A/B congelado**: Actos 1-3 (refiner + walk + scaffold) se corren UNA vez y se archivan; los brazos re-ejecutan solo Acto 4 (+heal) desde ese estado. Mata la variance del catálogo.
- Red estructural antes de cada medición: `healthcheck` + `npm run build` + `npm test` verdes.

---

## Decisiones abiertas para Claudio (marcadas, no las decido yo)
1. **¿Fase A (Claude Code) primero, o directo a Copilot?** Recomiendo A→B: A valida la hipótesis del Cubo C barato y da el $ sin quemar créditos. Coste de A: ~$1,5-3, una sesión headless.
2. **Modelo del Writer**: el A/B de Fase B lo resuelve con dato. Default de arranque: Sonnet (control conocido).
3. **Batch 3-en-1 vs 3 invocaciones del Writer**: recomiendo 1 batch (prefijo pagado una vez). Riesgo: un output más largo puede degradar; si el A/B lo muestra, se parte.
4. **Refiner desde FD vs reusar el walk-script del fixture**: para "partir del FD" de verdad, el refiner lee el FD y emite la lista de casos; el walk-script puede venir del fixture existente (0 tokens) o del refiner. Recomiendo fixture para el MVP (ya validado), refiner solo para la lista de casos.

---

## Qué NO se toca (heredado de plan-copilot-edition + reglas del repo)
- El core `src/` de catálogo NO se toca (el bug del scaffolder ya está resuelto en `develop`).
- Los subagents nativos de Microsoft.
- El producto de catálogo Claude Code (`.claude/`, ficha I+D, material de venta). Esta rama es una prueba; no compromete fichas.
- Compliance pre-flight sin override y audit-log: se conservan (0 tokens).

## Entregables
- `copilot/{agents,prompts,src}/` del flavor lean.
- `docs/findings/copilot-efficient-tokens/` con las tablas de coste (Fase A $, Fase B créditos, A/B).
- Actualización del marco €/run en [`token-efficiency-audit-2026-07.md`](../audit/token-efficiency-audit-2026-07.md) §7.
- Los 3 specs generados como evidencia (inspección de calidad "bien construidos").
