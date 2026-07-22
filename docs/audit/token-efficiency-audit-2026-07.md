# Auditoría de eficiencia de tokens — `ia4d-qa-automator` (edición Claude Code)

**Fecha**: 2026-07-21 · **Branch**: `design/token-efficiency` · **Autor**: Claude (Fable 5) bajo dirección de Claudio Jeldes

**Alcance acordado en entrevista**: dos planos (coste por run — prioritario, argumento €/suite ante cliente — y coste de contexto de sesión); todo sobre la mesa incluyendo cuestionar reglas duras con dato; dom-walker de copilot-edition fuera de scope; baseline nuevo instrumentado (S4 SauceDemo, 5 casos); fuentes oficiales Anthropic + comunidad + benchmarks.

---

## 1. Resumen ejecutivo

Un run S4 completo (SauceDemo, 5 escenarios, los 5 actos + verificación) cuesta **~$12,4 USD y ~35 min** con el pricing estándar 2026 (Sonnet 5 $3/$15). Es el **suelo**, no la media: SauceDemo es el sitio más simple posible; en sitios reales los snapshots del Playwright MCP multiplican el coste del mapeo ×2-4 (evidencia externa §5.2).

Dónde se va el dinero, medido:

1. **El orquestador es el 50% del coste** (~$6,3): 91 llamadas API que re-leen un prefijo creciente (command de 6,9k tokens + CLAUDE.md + resultados de subagents acumulados). 12M de tokens de cache-read a $0,3/MTok — baratos por unidad, dominantes por volumen.
2. **Writer+Reviewer ≈ $0,65-0,70 por test** (~$3,3 los cinco). Cada Writer arranca contexto fresco (~50-106k de cache-write) y hace 12-20 llamadas API con su ping-pong.
3. **Impuesto fijo por subagent: 13-20k tokens** de cache-write por invocación (system prompt + CLAUDE.md + tools), pagado ~18 veces por run. El mode-router paga 13,2k tokens para clasificar unos flags que un `if` resuelve.
4. **Los planners salen baratos en SauceDemo** (~$0,35/flujo) gracias al brief acotado de Fase B — la mitigación ya construida funciona.

Lo que ya está bien y no hay que tocar: model tiering Sonnet/Haiku (validado por benchmarks externos), handoff por archivos (evita el compounding), scaffolder determinístico, gates off por defecto, brief acotado.

La recomendación de mayor impacto no estructural: **sacar del camino LLM lo que ya es determinístico** (mode-router, compliance-checker — duplicado del hook pre-flight —, a11y-injector — duplicado del Writer) y **adelgazar el contexto residente del orquestador**. La estructural: **repensar el Reviewer de 5-10 invocaciones por run a 1 auditoría de lote**, respaldado por el dato externo de que los híbridos determinístico+LLM recuperan el 89% de la ganancia del review reflexivo a fracción del coste. Detalle en §6.

---

## 2. Metodología

Tres patas, ejecutadas en paralelo el 2026-07-21:

1. **Análisis estático del repo**: tamaño en tokens (~bytes/4) de todo lo que entra en contexto — CLAUDE.md, prompts de subagents, commands, handoffs, hooks, contracts.
2. **Baseline instrumentado**: run S4 completo contra SauceDemo (5 escenarios: `inicio-sesion` + 2 negativos, `carrito`, `pago`) ejecutado como sesión headless separada (`claude -p --output-format stream-json`), orquestador en Sonnet, subagents con su `model:` de frontmatter. El stream JSONL registra `input/output/cache_creation/cache_read` por mensaje y por sidechain — tokens exactos por subagent, no estimaciones.
3. **Investigación externa** (tres agentes de research independientes): documentación oficial Anthropic/Claude Code, experiencia de comunidad (Reddit/HN/GitHub issues/blogs) y benchmarks cuantitativos publicados. Cada claim con URL; lo no verificado se marca.

---

## 3. Anatomía estática: dónde vive el peso

### 3.1 Lo que se inyecta en cada sesión (y en cada subagent)

Cada invocación de subagent via Task arranca **contexto fresco**: system prompt del agente + CLAUDE.md del proyecto + definiciones de tools. No hereda nada del orquestador y arranca con caché fría (doc oficial de prompt caching). Un run S4 de 5 escenarios dispara ~15-18 subagents; el peso fijo se paga esa cantidad de veces.

| Pieza | Tokens aprox. | Se paga… |
|---|---|---|
| CLAUDE.md repo construcción | ~5.900 | 1× por sesión + 1× por subagent |
| CLAUDE.md template (cliente) | ~2.230 | ídem, en workspace desplegado |
| `autonomous.md` (command) | ~6.900 | 1× por run, en el orquestador |
| `ia4d-discovery-analyzer.md` | ~4.240 | 1× por run (**en Haiku**) |
| `ia4d-writer.md` | ~3.390 | ×5 (uno por escenario) |
| `ia4d-reviewer.md` | ~1.600 | ×5-10 (ping-pong N≤2) |
| `ia4d-a11y-injector.md` | ~1.070 | ×5 |
| `ia4d-judge.md` | ~990 | 0 (off por defecto) — ahorro ya materializado |
| Subagents nativos Playwright | ~720-850 c/u | 1× por flujo (planner), healer bajo demanda |
| Handoffs (discovery-report, plan fragments, contracts) | ~700-2.000 c/u | releídos por cada consumidor |

Los handoffs por archivo son **ligeros y correctos**: el orquestador recibe punteros, no payloads — el patrón evita el compounding de outputs en el contexto del orquestador que la comunidad identifica como anti-patrón.

### 3.2 El MCP `playwright-test` y los snapshots

El coste dominante esperado no es el prompt de ningún agente: son los **accessibility snapshots** que el planner/generator nativos reciben tras cada acción de navegador, residentes en el contexto del subagent durante toda su vida. Evidencia externa (§5): 3.800-12.000 tokens por snapshot en apps reales, hasta 50K en enterprise SPAs; el patrón MCP mide 3-4× más tokens que el mismo flujo con artefactos a disco.

### 3.3 Mitigaciones ya construidas (estado actual, sin cambiar nada)

El diseño actual ya incorpora varias de las palancas que la evidencia externa valida:

- **Planner por-flujo secuencial** (no monolítico) + brief acotado `--flows/--entry/--ignore` — Fase B midió 10 tool-uses vs 62 del modo ciego en Toolshop.
- **POM scaffolder determinístico** (`src/pom-scaffolder.ts`) y parser Gherkin determinístico — cero LLM en trabajo mecánico estructural.
- **Model tiering**: Sonnet solo donde hay razonamiento (Writer/Reviewer/refiner), Haiku en los mecánicos. Coincide con la palanca #1 de la comunidad.
- **Gates off por defecto** (Judge, PII): v0.2 ya eliminó del camino caliente dos subagents por run.
- **Handoff por archivos**: puntero en vez de payload.
- **`--max-scenarios` cap**: acota el blow-up de generación.

La auditoría busca lo que falta ENCIMA de esto, no redescubrirlo.

---

## 4. Baseline instrumentado — run S4 SauceDemo, 5 casos

**Setup**: `claude -p "/qa-automator:autonomous --url=https://www.saucedemo.com/ --flows=inicio-sesion,carrito,pago --max-scenarios=5"`, orquestador Sonnet 5, subagents con su `model:` de frontmatter, hooks activos, gates off (estado default v0.2). Sesión `5c909f54`, 2026-07-21. El run se ejecutó en 3 segmentos (una pausa ask-first legítima por fragmentos stale + una interrupción de proceso externa); el coste incluye ese re-priming de caché (~10-15% de inflado estimado — el baseline real de un run limpio es algo menor).

**Resultado funcional**: catálogo de 6 escenarios → cap 5 → TOP-5 por rank con drop auditado (no silencioso). 5/5 specs aprobados por el Reviewer (TC-001/002/003 en 1 iteración, TC-004/005 en 2). Ejecución: **4/5 verdes a la primera**; `TC-003 pago.compra-completa` roja, pendiente de Healer (post-proceso, decisión QA — no incluido en el coste).

**Pricing calibrado contra el `total_cost_usd` del CLI** (coincide al centavo con: Sonnet 5 estándar $3 input / $15 output / $6 cache-write 1h / $0,3 cache-read; Haiku 4.5 $1/$5/$1,25 (5m)/$0,1).

### 4.1 Tokens por subagent (parseo del stream JSONL, deduplicado por message-id)

| Agente (modelo) | Llamadas API | Input | Cache write | Cache read | $ aprox |
|---|---|---|---|---|---|
| **Orquestador** (Sonnet), 3 segmentos | 91 | 322 | 355.778 | 11.997.252 | **~6,3** |
| Writer TC-004 carrito (Sonnet, incl. reviewer interno) | 20 | 7.115 | 69.830 | 1.330.367 | ~0,84 |
| Writer TC-001 login (Sonnet, ídem) | 18 | 5.190 | 77.473 | 1.065.576 | ~0,80 |
| Writer TC-005 carrito-quitar (Sonnet) + Review TC-005 | 15+21 | 1.478 | 142.954 | 1.639.888 | ~1,36 |
| Writer TC-003 pago (Sonnet) | 12 | 10.309 | 61.643 | 714.370 | ~0,62 |
| Writer TC-002 login-bloqueado (Sonnet) | 13 | 1.046 | 50.625 | 713.297 | ~0,52 |
| Planner flujo inicio-sesion (Sonnet) | 23 | 46 | 33.012 | 625.706 | ~0,39 |
| Planner flujo pago (Sonnet) | 23 | 46 | 26.113 | 672.507 | ~0,36 |
| Planner flujo carrito (Sonnet) | 17 | 34 | 24.017 | 462.953 | ~0,28 |
| Discovery-analyzer (Haiku) | 4 | 34 | 32.149 | 60.470 | ~0,07 |
| a11y-injector ×5 (Haiku) | 15 | 130 | 96.750 | 155.065 | ~0,21 |
| Compliance-checker (Haiku) | 5 | 42 | 18.364 | 68.117 | ~0,05 |
| Mode-router (Haiku) | 1 | 10 | 13.223 | 0 | ~0,03 |

(Output tokens por-agente no fiables en el stream parcial; totales por segmento del CLI: fase 1 = 29,8k out, fase 3 = 30,9k out; fase 2 estimada ~50k. El $ por agente prorratea esto.)

**Coste por segmento**: fase 1 (Actos 1-2, planners) = **$2,54** CLI · fase 2 (discovery + writers) ≈ **$7,2** calculado · fase 3 (a11y + verificación + summary) = **$2,66** CLI → **TOTAL ≈ $12,4** · wall-clock ≈ 35 min.

### 4.2 Lecturas del baseline

1. **El orquestador domina** (~51%). No es el prompt inicial: son las 91 llamadas × prefijo creciente. Cada tool-result de subagent, cada paso del command de 6,9k tokens, se re-lee al 100% de las llamadas restantes. El patrón de coste es cuadrático en turnos del orquestador.
2. **Impuesto fijo por subagent confirmado**: 13-20k cache-write hasta en los triviales (mode-router 13,2k para leer flags). Con ~18 invocaciones/run son ~300k tokens de arranque, ~$1,5.
3. **Los 5 a11y-injectors pagaron cache-write completo cada uno** (~19,5k×5) — invocaciones paralelas del mismo tipo no comparten caché caliente (race de write). Batching secuencial la aprovecharía; eliminarlos (§6) la elimina.
4. **Writer con input no-cacheado alto** (TC-003: 10,3k): el prompt del Task lleva contenido inline además de rutas. Revisar que el orquestador pase punteros, no payload.
5. **Reviewer dentro del Writer**: el ping-pong queda contabilizado en el sidechain del Writer (excepto TC-005, visible aparte: $0,31 el review). Confirma ~$0,3 por invocación de Reviewer.
6. **La calidad no se resiente por medir**: 5/5 approved y 4/5 verdes a la primera es consistente con las fases A-F.

---

## 5. Evidencia externa

### 5.1 Oficial (Anthropic / Claude Code, julio 2026)

- **Cada subagent = contexto propio + caché propia, arranca fría** ([code.claude.com/docs/en/prompt-caching](https://code.claude.com/docs/en/prompt-caching)). No hay cifra oficial de overhead fijo por invocación.
- **Multi-agente ≈ 15× los tokens de un chat; agentes ≈ 4×** — Anthropic, [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) (2025-06). Solo se justifica cuando el valor de la tarea paga el múltiplo; rinde mal en tareas con pocos componentes paralelizables.
- **Prompt caching automático en Claude Code**; cache hit = 0,1× input; write 5min = 1,25×, write 1h = 2×. Cambiar de modelo o effort a mitad de sesión invalida toda la caché ([pricing](https://platform.claude.com/docs/en/about-claude/pricing.md)).
- **Pricing 2026** ($/MTok input/output): Sonnet 5 promo $2/$10 (hasta 2026-08-31, luego $3/$15); Sonnet 4.6 $3/$15; Haiku 4.5 $1/$5; Opus 4.8 $5/$25.
- **CLAUDE.md**: "Keep it concise. For each line, ask: would removing this cause Claude to make mistakes? If not, cut it. Bloated CLAUDE.md files cause Claude to ignore your actual instructions" ([best-practices](https://code.claude.com/docs/en/best-practices.md)).
- **Tool Search (deferred MCP tools)**: automático desde `ENABLE_TOOL_SEARCH=auto` (carga si <10% de la ventana); reduce el peso de tool definitions al inicio de sesión.
- **Sin datos oficiales** de coste del Playwright MCP ni benchmarks de browser automation.

### 5.2 Comunidad (recurrente, no anecdótico salvo indicación)

- **Subagents queman presupuesto**: tema recurrente en HN/Reddit/GitHub ("85% del usage vino de sesiones subagent-heavy"; issue [claude-code#55051](https://github.com/anthropics/claude-code/issues); análisis [youcanbuildthings.com](https://youcanbuildthings.com/articles/claude-code-subagents-token-usage/), 2026-05). Causa mecánica: contexto fresco + re-lecturas + caché fría por subagent. Gotcha: `CLAUDE_CODE_SUBAGENT_MODEL` pisa silenciosamente el `model:` del frontmatter y anula el tiering.
- **Playwright MCP**: [issue oficial #1216](https://github.com/microsoft/playwright-mcp/issues/1216) — cada respuesta devuelve el accessibility tree completo; medición independiente: **~114K tokens vía MCP vs ~27K vía CLI** para el mismo flujo de login (4,2×) ([scrolltest](https://scrolltest.medium.com/playwright-mcp-burns-114k-tokens-per-test-the-new-cli-uses-27k-heres-when-to-use-each-65dabeaac7a0), 2026-02). Los snapshots stale residentes son el asesino silencioso. Recomendación comunitaria: MCP para exploración corta (<10 pasos), artefactos a disco para sesiones largas.
- **MCP tool definitions**: 10-67K tokens de overhead por sesión con varios servers; el server `playwright` ≈ 13,6K tokens de schemas. Tool Search de Claude Code lo mitigó (−46,9% en el caso reportado).
- **Cache reads dominan el volumen** en sesiones reales de Claude Code (caso HN: 56% de la factura equivalente eran cache reads). El caching aplica al prefijo estable (system prompt + tools + contract), nunca a los snapshots (cada uno distinto).
- **Playwright Test Agents nativos**: sin mediciones de primera mano en foros. Blogs: ~$4-7 por plan de 50 tests (~340K tokens) — metodología no auditada. Las mediciones propias del spike (32K planner / 30,7K generator en SauceDemo) son de los pocos datos primarios que existen.

### 5.3 Benchmarks cuantitativos

- **$/tarea agéntica estandarizada** (200K in + 30K out, [PointFive](https://www.pointfive.co/blog/the-pointfive-coding-task-index), 2026-07): Haiku 4.5 $0,35 · Sonnet 5 $1,05 · Opus 4.8 $1,75. "Reading is 87% of the tokens but 57% of the cost" — el input domina el volumen; los snapshots de Playwright son casi todo input.
- **Supervisores ligeros** reducen consumo ~29,7% (GAIA, vía [Augment Code](https://www.augmentcode.com/guides/multi-agent-cost-compounding)). **Auto-verificación reflexiva**: mejor accuracy a ~2,3× el coste del baseline; híbridos recuperan 89% de la ganancia a fracción del coste — el dato más cercano publicado al coste de un review-loop tipo Writer↔Reviewer.
- **LLM-as-Judge**: paper [arXiv 2512.01232](https://arxiv.org/html/2512.01232v1) — rango $0,45-$78,96 por 1.000 evaluaciones (175×); el modelo pequeño **ganó** en accuracy al grande en judging estructurado. Respalda con dato externo la decisión Haiku-para-Judge.
- **Haiku 4.5** ≈ 90% del rendimiento de Sonnet 4.5 en coding agéntico a ⅓ del precio (SWE-bench 73,3% vs 77,2%, [Anthropic oficial](https://www.anthropic.com/news/claude-haiku-4-5)). Patrón recomendado por Anthropic: Sonnet orquesta, equipo de Haikus ejecuta.
- **Caching en producción**: casos publicados de −59% a −90% del gasto en la porción cacheada con hit-rate >84%.
- **Coste de test-generation publicado**: mediana $0,052/test generado (Issue2Test, no verificado en fuente primaria); $2-8 por ciclo completo de PR con Sonnet (DevAssure, vendor). Nadie ha medido públicamente el coste del ping-pong review en test-generation.

---

## 6. Recomendaciones

Dos niveles, como se acordó. Ahorro estimado sobre el baseline de $12,4; los porcentajes son estimaciones sobre datos medidos, no promesas.

### Nivel 1 — no estructural (quick wins, sin tocar arquitectura)

**R1. Eliminar del camino LLM lo ya determinístico.** Ahorro directo ~$0,3/run + menos turnos de orquestador (que es donde duele). Tres piezas, por orden de claridad:
- **mode-router** ($0,03 + 1 turno): clasifica flags explícitos. Es un `if` en el command o 10 líneas en `src/`. El agente ya "responde por texto y no persiste fichero" — está a medio camino de no existir.
- **compliance-checker** ($0,05 + 1 turno): duplica en LLM lo que `hooks/pre-flight.ts` ya valida en regex en cada llamada MCP. Un script `npx tsx src/scripts/check-compliance.ts <url>` invocado por el command da el mismo verdict con exit code, más determinístico aún (refuerza la regla dura #5, no la debilita). El gate sigue sin override.
- **a11y-injector ×5** ($0,21 + 5 turnos): el Writer YA inyecta el scan AxeBuilder (paso 3 de su prompt); el injector es red de seguridad duplicada. Sustituir por verificación AST determinística (grep/ts-morph: ¿hay AxeBuilder tras el goto?) que solo escale a LLM si falta. La regla dura "scan siempre inyectado" se preserva — cambia el mecanismo de garantía, no la garantía.

**R2. Dieta del contexto residente del orquestador.** El 51% del coste. Palancas concretas:
- `autonomous.md` (6,9k tokens): mover los bloques de ejemplo de shell, la casuística de recovery del planner y el detalle del checkpoint a un doc de referencia lazy o a scripts. Objetivo ≤3k tokens. Cada token quitado se deja de re-leer ~90 veces por run.
- Task prompts con punteros, no payload: el baseline muestra 5-10k de input no-cacheado en algunos Writers (§4.2.4). Auditar los prompts que construye el command.
- Menos turnos: consolidar pasos del command que hoy son idas y vueltas (p.ej. la resolución de IDs del registro + construcción de outputs es un solo script determinístico posible — hoy es prosa que el orquestador ejecuta paso a paso).

**R3. CLAUDE.md por plano.** El del template (2,2k) está bien; vigilar que no crezca — se paga en cada subagent de cada run de cliente. El del repo (5,9k) solo afecta a construcción, pero su sección "Estado actual" (~60% del fichero, crece monotónicamente) conviene moverla a un `STATUS.md` lazy: en sesiones de construcción se inyecta en los ~18 subagents igual que en el orquestador.

**R4. Poda de prompts de subagents calientes.** `ia4d-discovery-analyzer.md` (4,2k, Haiku, 1×/run) y `ia4d-writer.md` (3,4k, ×5/run) acumulan historia de decisiones en prosa. Podar lo que no cambia el output (la justificación de cada regla puede vivir en referencias). Objetivo −30-40%. El writer se paga 5 veces por run.

**R5. Batching de invocaciones del mismo tipo.** Los 5 a11y-injectors pagaron cache-write completo cada uno (§4.2.3). Si R1 no se aplica de inmediato: invocar subagents del mismo tipo secuencialmente (o el primero solo, luego el resto) convierte 4 de los 5 writes en reads (0,1×). Aplica igual a Writers si alguna vez se serializan — hoy son paralelos por diseño (regla del command), y el paralelismo vale más que este ahorro; solo tenerlo en cuenta.

Estimación conjunta Nivel 1: **−20-30% del coste/run** (≈ $9-10 en el escenario SauceDemo) y −8 invocaciones de subagent.

### Nivel 2 — estructural (cuestiona reglas duras, con dato; decides tú)

**R6. Reviewer por lote, no por spec (toca regla dura #8).** Medido: ~$0,3/invocación de Reviewer, 5-10 invocaciones/run según iteraciones → $1,5-3/run. Evidencia externa: la auto-verificación reflexiva mejora accuracy a ~2,3× el coste del baseline, y las configuraciones híbridas recuperan el 89% de la ganancia a fracción del coste (GAIA/Augment, §5.3). Propuesta que preserva el posicionamiento "juez independiente": (a) checks objetivos del Reviewer (locators, waits, asserts, banned APIs — ya son mecánicos y están en el style-enforcer AST) pasan a validación determinística pre-review; (b) UN Reviewer LLM por run audita el lote de 5 specs en una sola sesión (contexto fresco, sigue siendo independiente del Writer) y devuelve feedback por spec; (c) el ping-pong N≤2 se mantiene solo para los specs rechazados. Ahorro estimado: $1-1,5/run manteniendo el argumento estructural — el juez sigue siendo otro contexto, otra sesión, otro rol. Riesgo: un reviewer de lote puede diluir atención por spec; validar con un A/B sobre las fases ya corridas antes de adoptarlo.

**R7. Orquestación determinística de actos mecánicos (toca la regla suavizada #2 en dirección favorable).** El Acto 2.5 (cap + tabla + tc-registry) y el Verification step son 100% codificables; hoy los ejecuta el orquestador leyendo prosa, a ~$0,3-0,5 de cache-reads por acto. Un `run-s4.ts` que encadene los pasos no-LLM y solo invoque LLM donde hay juicio reduciría los 91 turnos del orquestador a ~30-40. Es la versión agresiva de R2; el techo de ahorro del plano orquestador es ~$3-4/run. Coste: el command deja de ser legible como prosa para I+D — mantener el .md como documentación del flujo y que invoque el script.

**R8. Lo que NO se recomienda cambiar.** Compliance pre-flight sin override (es barato tras R1 y es el posicionamiento), Writer en Sonnet (la calidad 5/5-approved depende de él; Haiku ahorraría ~$1/run con riesgo directo al argumento de venta), Judge off por defecto (ya hecho; cuando se encienda, el dato externo respalda Haiku: en judging estructurado el modelo pequeño no pierde accuracy — arXiv 2512.01232), y el brief acotado (es la mejor optimización que ya tienes).

Estimación conjunta Nivel 1+2: **−40-50%** → objetivo ~$6-7 por run de 5 tests en sitios clase SauceDemo.

---

## 7. Marco €/run (argumento cliente)

Números para el pitch, con sus condiciones:

| Escenario | Coste estimado | Base |
|---|---|---|
| Run 5 tests, sitio simple (hoy) | ~$12,4 (~11,5€) | Medido §4 |
| Run 5 tests, sitio simple (con Nivel 1) | ~$9-10 | Estimado |
| Run 5 tests, sitio simple (Nivel 1+2) | ~$6-7 | Estimado |
| Sitio real medio (SPA, auth) | ×2-4 sobre lo anterior | Snapshots MCP dominan el mapeo (§5.2: 3,8-12k tokens/snapshot; 4,2× MCP vs artefactos a disco). El brief acotado amortigua (Toolshop: 10 vs 62 tool-uses) |
| Healer (cuando hay rojos) | +$0,5-0,9/spec sanado (μ $0,72) | **Medido** (fase Q1 quality-greens, 2026-07-22): 3/3 rojos sanados, ~$2,2 y ~10 min el lote; causa raíz compartida en POM → 1 fix cura N specs (no aditivo por rojo); output auditado post-heal (Reviewer 3/3 approved). Detalle en [quality-greens-plan.md](quality-greens-plan.md) |
| Pricing promo Sonnet 5 (hasta 2026-08-31) | −33% en toda la tabla | $2/$10 vs $3/$15 |

Contexto competitivo: $2,5/test generado con Reviewer independiente, trazabilidad y A11y está dentro del rango publicado para test-generation LLM ($0,05/test sin capas de calidad hasta $2-8/ciclo completo por PR — §5.3), y las 4,5 h/QA que sustituye un run de 5 tests (dato del spike: 22 min vs 4,5 h manual por suite comparable en blogs) hacen el €/run irrelevante frente al coste de la hora de QA. **El argumento no es "es barato", es "cuesta lo que un café y viene auditado".** El riesgo de coste real está en sitios grandes sin brief — y el command ya lo bloquea por diseño (modo ciego requiere confirmación explícita).

Dónde medir en adelante: el `total_cost_usd` del stream-json en runs headless (gratis, ya instrumentado — el script `parse-usage.mjs` de esta auditoría queda reutilizable), o OTEL si Inetum quiere telemetría continua.

### 7.1 Resultado final del ciclo 1 (cierre 2026-07-22, tras Fases 1-4 del plan)

Medido, no estimado: **$12,4 / 35 min → $11,2 / 18 min** (run limpio ajustado ≈ $10), orquestador 91→46 llamadas API, 18→9 subagents/run, calidad de review intacta (5/5 approved en todas las fases), reglas duras de producto sin tocar. Detalle por fase en [token-efficiency-plan.md](token-efficiency-plan.md).

**Corrección a este informe con lo aprendido**: la estimación original de −40-50% (~$6-7) sobreestimaba la grasa del plano orquestador (asumía ~$4-5; medido ~$1,5-2 — el prefijo del main lo dominan los tool-results × turnos, no la prosa, y R7 capturó ese techo entero). El ahorro grande del ciclo 1 fue **wall-clock (−50%)**, que refuerza el lead de venta "en minutos" más que los $1,2 ahorrados. R6 (reviewer de lote) resultó tener la premisa de coste falsa (+13%) y se descartó por A/B; su subproducto (pre-review determinístico, $0) se adoptó.

**Puntos de revisión abiertos al cierre del ciclo 1** (carril calidad, fuera del scope tokens — es la próxima inversión de diseño):
1. **0/5 verdes a la primera en F4** por dos clases pre-existentes verificadas contra el sitio real: gap del discovery en la pantalla cart (`getByRole('generic')` sin accessible name) y observación imprecisa del planner (clase `error` siempre presente traducida a assert de camino feliz). Ningún gate estático actual las caza — son correctitud semántica de lo observado.
2. Fix del origen del bug del Reviewer (JSON concatenado en el fichero per-spec; el consumidor ya es tolerante desde F4).
3. `src/pom-scaffolder.ts` inyecta locators hardcodeados no presentes en el discovery (flaggeado en F2).
4. Carril Healer como post-proceso (principio ya establecido; los rojos de F4 son su caso de uso).

---

## 8. Segundo ciclo de auditoría (2026-07-22, sobre el estado post-F4)

Mismo método, sin run nuevo: el baseline de F4 (streams `baseline-fase4{,-2}.jsonl`, $11,21 CLI) ES el estado actual. Estructura de coste medida hoy (pricing estándar):

| Bloque | $ aprox | % | Composición |
|---|---|---|---|
| **Writers ×5 (Sonnet)** | ~5,5-6 | **~52%** | Input-side ~$4 (388k cache-write + 5,5M cache-read) + su parte del output (~$1,5-2) |
| **Orquestador (Sonnet)** | ~2,5-2,7 | ~23% | 46 calls, 5,0M cache-read + diagnóstico post-rojos |
| **Output total del run** | (~3 embebido) | — | 200k tokens a $15/MTok: specs, feedback, plan fragments, diagnóstico. El ciclo 1 no lo midió por-agente (caveat del parser); ahora es visible y relevante |
| Planners ×3 (Sonnet, nativos) | ~1 | ~9% | Ya optimizados por brief; escalan con el sitio |
| Discovery + mecánica (Haiku/script) | ~0,1 | ~1% | Residual — el ciclo 1 hizo su trabajo aquí |

El plano orquestador está agotado (§7.1). **El margen restante vive en los Writers y en el precio del modelo que los corre.** Palancas del ciclo 2, rankeadas por ahorro esperado × riesgo:

**C2-1. Writer en Haiku 4.5, con el Reviewer en Sonnet como gate (revisa el R8 del ciclo 1).** Ahorro potencial **~$3,5-4/run** (writers ÷3 en input, ÷3 en output) — la palanca más grande que queda, y desde F3 es barata de probar (A/B sobre discovery congelado, Actos 4-5, ~$1,5). El ciclo 1 la descartó a priori por riesgo al argumento de venta; lo que cambió: (a) el A/B congelado existe y mide exactamente el riesgo (¿sube la tasa de rechazo/iteraciones? ¿bajan los verdes?); (b) la red de calidad post-F3/F4 (pre-review determinístico + Reviewer Sonnet independiente + verificación real) contiene al Writer barato; (c) la evidencia externa ya lo respaldaba (Haiku ≈90% de Sonnet en coding agéntico; patrón oficial Anthropic "Sonnet orquesta, Haikus ejecutan"). El argumento de venta hasta MEJORA si aguanta: "Writer económico vigilado por un juez Sonnet independiente". Si el A/B muestra más iteraciones de ping-pong, el ahorro se come solo en parte y el dato decide. Criterio de no-degradación: mismo approved-rate a iteración ≤1, mismas clases de verdes/rojos, feedback del Reviewer sin inflación de must-fix.

**C2-2. Orquestador en Haiku 4.5 (la idea de esta iteración, corregida: ya corre Sonnet; el downgrade es a Haiku).** Ahorro **~$1,5-1,8/run**. Post-F4 el main conserva solo juicio (guarda 6.5, checkpoint, diagnóstico) — que es exactamente lo que NO conviene abaratar a ciegas. Probar DESPUÉS de C2-1 y por separado: si Haiku-main falla la guarda 6.5 o empobrece el diagnóstico, se revierte (es un flag de lanzamiento, no un cambio de código). Nota operativa: NO usar `CLAUDE_CODE_SUBAGENT_MODEL` (pisa el frontmatter de TODOS los subagents y anularía el tiering); el modelo del main se fija con `--model` del run.

**C2-3. Arranque escalonado de Writers (warm-cache).** Los 5 Writers paralelos pagan cada uno el cache-write del prefijo compartido (system prompt + CLAUDE.md + tools, ~15-20k). Lanzar el Writer 1, esperar su primera respuesta, lanzar los otros 4 → ~4×17k writes se vuelven reads. Ahorro **~$0,4-0,5/run**, riesgo cero, coste de implementación trivial (una línea en el command), +30-60s de wall-clock. Corrección al ciclo 1: la estimación inicial de esta palanca (~$1-1,5) era alta — solo el prefijo de sistema es compartible; los tool-results de cada Writer son únicos.

**C2-4. Dieta de output (~$0,3-0,5, aritmético — no medir con run).** El output se paga 5×. Candidatos: `evidence.level: full` del contract demo genera specs más largos (test.step + screenshot por paso — es la vitrina PRO; para contracts de cliente, `steps` o `minimal` como default documentado); verbosidad del feedback del Reviewer (ya acotado por el formato per-spec); fragmentos del planner (nativos, no tocar).

**C2-5. Gobernanza del modelo del run (previene regresión, no ahorra).** Las mediciones asumen main en Sonnet. Un cliente que lance el command en una sesión con Opus 4.8 paga ×1,67 el plano orquestador sin enterarse. Documentar en el command/README del template: los runs S4 se lanzan con `--model sonnet` (o el default de la org fijado a Sonnet).

**Techo del ciclo 2 si C2-1/2/3 aterrizan**: ~$11,2 → **~$6-7/run** — el objetivo original del ciclo 1, alcanzado por la ruta correcta (el precio del modelo donde el trabajo es contenible, no la prosa). Con la promo Sonnet 5 vigente hasta 2026-08-31, ~$4-5. La condición de todo el ciclo: **la calidad la firma el Reviewer Sonnet y la verificación real — cualquier A/B que la mueva, se descarta como R6.**

### 8.1 Cierre del ciclo 2 y del carril (2026-07-22)

El techo de arriba no se alcanzó, y el motivo quedó medido: **C2-1 (Writer Haiku) resultó falso** — el descuento del modelo se lo comió la contención (Reviewer Sonnet ×2,5 invocaciones, wall-clock ×2,3, +17% tokens; approved a iteración ≤1 degradado 4/4→2/4, 9 must-fix vs 0). Descartado por A/B congelado, como R6. **C2-2 (main Haiku) se cerró sin ejecutar** por decisión QA: valor esperado $1,5-1,8 contra coste de medición ~$11-22 y la señal de F6 en contra (Haiku falla justo en la disciplina multi-paso que el main conserva). Solo aterrizó C2-3/4/5 (F5, ~$0,4-0,5 aritmético + gobernanza).

**Resultado final del carril completo (ciclos 1+2, F1-F7)**: $12,4/35 min → **~$10,7/18 min** (−14% en $, −50% en tiempo), orquestador 91→46 llamadas, 18→9 subagents, cinco hipótesis de ahorro falsificadas por ~$5 de A/Bs congelados, cero degradación de calidad y reglas duras de producto intactas. Conclusión estructural: **el coste restante es el trabajo real** (Writers Sonnet con juez independiente + planners nativos) — no queda grasa barata; las palancas que quedaban eran todas trade-offs calidad-por-dinero y los datos las mataron.

**Subproducto con valor de catálogo**: F6 fue, de facto, una prueba adversarial de la Quality layer — con un Writer degradado a propósito, el Reviewer Sonnet cazó 9 must-fix, la red determinística (pre-review + verify-a11y) cazó lo que el Reviewer dejó pasar tras el churn, y el rescate del a11y-injector se ejecutó por primera vez en real y funcionó. La afirmación "QA es juez independiente" tiene ahora evidencia empírica adversarial, no solo diseño.

**El carril se cierra aquí.** La siguiente inversión de valor no son tokens: es el carril calidad (verdes a la primera — puntos abiertos de §7.1, más el endurecimiento del prompt del Writer con el patrón de import de axe que F6 identificó como clase sistemática).

---

## Anexo — evidencia del baseline

- Streams: `s4-run-stream{,2,3}.jsonl` (scratchpad de la sesión de auditoría; sesión headless `5c909f54`).
- Artefactos del run: `.work/saucedemo/` (summary, audit-log, allure-results), `tests/e2e/saucedemo/TC-00*.spec.ts`, `docs/test-plans/saucedemo/*.plan.md`.
- Nota de limpieza: queda un spec stale del run S3 de 2026-07-08 (`TC-003_inicio-sesion.credenciales-invalidas.spec.ts`) conviviendo con los nuevos — el run archivó los fragmentos de plan stale pero no los specs. Mismo principio de no-contaminación del paso 5.c, hueco pendiente en `tests/e2e/<site-id>/`.
