# Fase A — Baseline lean en Claude Code (número $ + validación de calidad)

**Fecha**: 2026-07-23. **Rama**: `copilot-efficient-tokens`. **Sitio**: SauceDemo (S3, FD → suite).
**Protocolo**: idéntico al carril tokens — `claude -p ... --output-format stream-json`, `total_cost_usd`
del evento `result` como cifra oficial, desglose con `src/scripts/parse-usage.mjs`. Evidencia cruda en
`.work/audit-runs/lean-fase-a/{refiner,writer,healer}.jsonl`.

## Resultado (Gate A)

**3/3 verdes a la primera**, sin Healer en el camino real. Construidos sin Reviewer LLM.

| Touchpoint | Modelo | Coste | Turns | Duración | Output |
|---|---|---|---|---|---|
| Refiner (FD → 3 casos) | Haiku 4.5 | **$0,092** | 4 | 41 s | `cases.json` |
| Writer lean batch (3 specs, 1 invocación) | Sonnet 5 | **$1,880** | 42 | 6,7 min | 3 `.spec.ts` |
| **Camino limpio (fijo)** | | **$1,972** | | | **$0,657/caso** |
| Healer (rojo fabricado, **segregado**) | Sonnet 5 | $0,480 | 7 | 1,9 min | 1 fix en POM cura 3 specs |

Deterministas (walker, adapter dom-map→discovery, verify-locators, scaffold POM, pre-review,
`playwright test`): **$0 tokens**. verify-locators: bootstrap de sesión `applied`, 92/103 locators
verificados contra el DOM real.

El coste del Healer **NO se suma** al $/caso del titular (decisión #5 del plan): el camino natural fue
3/3 verde. El número del Healer es el coste condicional de sanar SI aparece un rojo.

## Calidad sin Reviewer — inspección manual

Bien construidos (los 3): POM por pantalla, locators por prioridad del contract (`getByTestId`),
asserts funcionales (no solo navegación), estado condicional citado con evidencia (botón Remove tras
añadir, item en carrito), credenciales del contract (no PII inventada), naming español
condición→resultado. Sin axe, sin `@criterion` (cortados en el flavor lean, correctamente omitidos —
el Writer NO cedió a añadirlos pese a que el pre-review de catálogo los reporta).

**Debilidad semántica encontrada (caso-3, checkout)**: el assert de cierre verifica el botón
`backToProducts` visible/enabled en la página de completado, NO el mensaje de negocio
`"Thank you for your order!"`. El `then` del FD es "muestra una confirmación del pedido"; la
confirmación real es ese texto, que el walker no captura (texto no interactivo, sin rol ARIA — misma
razón que el badge del carrito). Sin un locator verificado para el texto y prohibido inventar, el
Writer cayó al elemento de chrome. El test pasa y no es incorrecto (la página de completado solo
existe tras el pedido), pero un Reviewer habría exigido `getByText('Thank you for your order!')`.

**Esto es exactamente el coste que el plan predijo del Cubo C** (cortar el Reviewer LLM): el net
determinista NO recupera la correctitud semántica. verify-locators caza "el locator no resuelve";
pre-review MF-9 cuenta *cantidad* de asserts funcionales, no su *fuerza semántica* — un assert que
pasa pero es flojo se le escapa. El Healer tampoco lo caza (el test está verde). Es la clase de
defecto que solo un juez (Reviewer o QA humano) detecta.

Veredicto Gate A: **superado con matiz**. 3/3 construidos y verdes, $/caso medido. La calidad
estructural es presentable; la debilidad semántica del cierre de checkout es la degradación
concreta y acotada del recorte del Reviewer — no rompe la hipótesis del Cubo C, la delimita.

## Perfil de tokens (dónde está el coste)

| | input | output | cacheRead | cacheWrite |
|---|---|---|---|---|
| Refiner (Haiku) | 688 | 1.880 | 131.881 | 34.599 |
| Writer (Sonnet) | 7.137 | 23.177 | **2.845.699** | 109.537 |

El coste del Writer lo domina el **contexto reacumulado re-leído cada turno** (cacheRead 2,85 M a
0,1× input across 42 turns), NO el output (23 K, los specs reales). Confirma el hallazgo de
copilot-edition: "en agent mode el coste dominante es el input reacumulado". Palancas de reducción,
por impacto:
1. **Menos turns.** Las 42 vueltas incluyen la iteración del pre-review shift-left, inflada porque el
   pre-review de catálogo reportaba MF-4 (axe) y MF-5 (@criterion) —features cortadas— como must-fix,
   y el Writer gastó turns razonando que debía ignorarlas. **Corregido**: el agente Writer lean y el
   runner ahora eximen MF-4/MF-5 explícitamente; una re-corrida tendría menos turns (no re-medido).
2. **Discovery más pequeño.** 103 elementos (footer/social/menu incluidos) engordan el contexto por
   turno. Podar chrome del dom-map bajaría el cacheRead.
3. **CLAUDE.md de despliegue.** Ver caveat.

## Caveat de medición (importante)

Ambos `claude -p` cargan el `CLAUDE.md` de **desarrollo** de este repo (grande). Un `claude -p`
trivial que solo responde "OK" costó **$0,10** en Haiku — priming puro de contexto, cero trabajo.
Es decir: una fracción material del $/caso es priming fijo del contexto de desarrollo, no generación.
En el flavor lean **desplegado** (template con `CLAUDE.md` pequeño) el coste sería sensiblemente menor.
**El $0,657/caso es una cota superior en el contexto de desarrollo**, no el coste de un despliegue
limpio. La base de medición es la misma que el baseline del carril tokens → las comparaciones son
apples-to-apples, pero el número absoluto hay que leerlo con este asterisco.

## Comparación (provisional, misma base de medición)

- Flujo completo S4 catálogo (baseline carril tokens): ~$2,2/caso.
- Flujo lean S3 (Fase A): **$0,66/caso** camino limpio (+$0,48/lote de Healer si hay rojo).

El recorte (Reviewer + axe + traza + planner/discovery nativos → dom-walker) baja el coste ~3× en
esta base, a cambio de la debilidad semántica documentada. Pendiente de confirmar con `CLAUDE.md`
de despliegue y en créditos Copilot (Fase B).

## Piezas construidas en esta fase

- `copilot/src/dom-map-to-discovery.ts` — adaptador determinístico dom-map → discovery-report (0 tokens).
  Ordena campos de formulario antes que botones/links (el heurístico `findLoginForm` de verify-locators
  elegía un botón "Login" como campo usuario y rompía el bootstrap).
- `copilot/fixtures/saucedemo.lean.walk.json` — walk lean: añade al carrito **desde el listado** y
  captura el estado con item (botón Remove verificable). No toca el fixture H1 validado.
- `copilot/agents/ia4d-spec-refiner-lean.md` — refiner sin RF-NNN, FD → `cases.json`.
- `copilot/agents/ia4d-writer-lean.md` — Writer sin Reviewer/axe/@criterion, batch, con pre-review
  shift-left (exime MF-4/MF-5, las features cortadas).
- `copilot/src/lean-run.ts` — runner determinista (stages `prepare` / `verify`).

## Fase A-bis — Prueba limpia (workspace aislado, CLAUDE.md neutro)

**Motivación (Claudio)**: quitar el ruido/sesgo del `CLAUDE.md` de desarrollo (18 KB, saturado de
SauceDemo e historial de fases) que infló el número. Workspace aislado en `../qa-lean-clean/` (fuera
del árbol del repo → no carga el dev `CLAUDE.md`), con `CLAUDE.md` neutro (~1,3 KB, describe el flujo
lean genéricamente, sin sitio ni historial), `node_modules` por junction, mismo FD SauceDemo (aísla
LA variable del contexto; comparación directa). Evidencia en `../qa-lean-clean/.work/audit-runs/clean/`.

| Touchpoint | dev CLAUDE.md (18 KB) | **limpio (neutro ~5 KB total)** |
|---|---|---|
| Refiner (Haiku) | $0,092 · 4 turns | $0,116 · 10 turns |
| Writer (Sonnet) | $1,880 · 42 turns · cacheRead 2,85 M | **$1,550** · 42 turns · cacheRead 2,34 M |
| **Camino limpio** | $1,97 → **$0,66/caso** | $1,67 → **$0,56/caso** |

Calidad idéntica: **3/3 verdes**, pre-review lean **limpio** (0 defectos de construcción; los 6
must-fix crudos son todos MF-4/MF-5, las features cortadas, filtradas por el runner).

**Conclusiones**:
1. **El CLAUDE.md de desarrollo inflaba, pero era secundario** (~15 % del $/caso, ~$0,10/caso). El
   coste lo domina el **contexto de trabajo acumulado** re-leído cada turno (discovery de 103
   elementos + POMs + historial de 42 turns), no el CLAUDE.md ni el output (20-23 K). Palanca real:
   podar el discovery y reducir turns, no solo adelgazar el CLAUDE.md.
2. **Para el refiner barato, limpiar el contexto NO ayudó** (10 turns × contexto pequeño ≈ 4 turns ×
   contexto grande). El coste del refiner es ~$0,10 en cualquier caso.
3. **La debilidad semántica de caso-3 es SISTÉMICA, no varianza**: el writer limpio también cerró el
   checkout con `backToProducts` (chrome) en vez del mensaje `"Thank you for your order!"`, esta vez
   con un TODO explícito: *"el mensaje no está en el discovery (no es interactivo)"*. Dos corridas
   independientes, mismo fallo → es un gap de diseño del discovery (el dom-walker no captura texto no
   interactivo), no azar. Refuerza que la red determinista no recupera la postcondición de negocio.

**Residuales que la prueba limpia NO elimina** (honestidad de medición):
- El `CLAUDE.md` **global personal** (~3,5 KB) sigue cargando en el hijo `claude -p` (quitarlo
  rompería la auth del hijo). Neutro respecto a SauceDemo/proyecto; residual menor.
- Mi **conocimiento del modelo sobre SauceDemo** persiste — solo lo quitaría un sitio no tuneado.
  Decisión de Claudio: mantener SauceDemo para aislar la variable del contexto (comparación limpia).

## Pendiente

- **Fase B (Copilot, la ejecuta Claudio en VS Code)**: portar el flavor a `.agent.md` + prompt file;
  A/B modelo del Writer (Sonnet 5 vs Haiku 4.5) en créditos; coste esperado = verde + P(rojo)×heal.
- **Fase C (informe de cierre)**: actualizar el marco €/run con `CLAUDE.md` de despliegue medido.
- Decisión QA sobre la debilidad semántica del cierre de checkout: ¿aceptable para PoC, o el flavor
  necesita una regla determinística extra (p.ej. el Writer usa `getByText` del `then` como estado
  condicional para la postcondición de negocio)?
