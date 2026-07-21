# Plan de mejora — eficiencia de tokens de `ia4d-qa-automator`

**Base**: [token-efficiency-audit-2026-07.md](token-efficiency-audit-2026-07.md) (baseline medido: $12,4 / 35 min / run S4 SauceDemo 5 casos). **Branch**: `design/token-efficiency`, un commit por fase. **Ejecución**: una sesión nueva de Claude Code por fase; esta ventana de plan no ejecuta. Cada sesión ejecutora lee el informe + este plan y NADA más de contexto histórico.

**Regla de oro del plan**: ninguna fase se da por cerrada sin su medición. El ahorro se demuestra con el baseline repetible, no se estima.

---

## Protocolo de medición (idéntico en todas las fases)

1. Run baseline headless desde la raíz del repo (Git Bash):
   ```sh
   claude -p "/qa-automator:autonomous --url=https://www.saucedemo.com/ --flows=inicio-sesion,carrito,pago --max-scenarios=5" \
     --model sonnet --output-format stream-json --verbose --permission-mode acceptEdits \
     --allowedTools "Task,Read,Write,Edit,MultiEdit,Glob,Grep,LS,TodoWrite,Bash(npx *),Bash(node *),Bash(rm -rf .work/*),Bash(mkdir *),Bash(mv *),Bash(ls *),Bash(cat *),mcp__playwright-test__*" \
     > .work/audit-runs/baseline-fase<N>.jsonl
   ```
   Antes del run: borrar `tests/e2e/saucedemo/`, `docs/test-plans/saucedemo/` y `config/tc-registry/saucedemo.json` para partir de cero real (el baseline original arrastró stale y costó una pausa; ver hueco documentado en el anexo del informe).
2. Desglose: `node src/scripts/parse-usage.mjs .work/audit-runs/baseline-fase<N>.jsonl` (acepta varios streams si hubo reanudación). El `total_cost_usd` del evento `result` es la cifra oficial; el desglose por subagent es para atribuir el ahorro. Caveat conocido del parser: output tokens por-agente infracontados; usar los totales del CLI.
3. Comparar contra la fase anterior: coste total, nº invocaciones de subagent, llamadas API del orquestador, verdicts del Reviewer (5/5 approved esperado), verdes a la primera (≥4/5 esperado; `pago` falló también en el baseline original — un rojo ahí no es regresión).
4. Registrar los números en la sección "Resultados" de este archivo.

**Pricing de referencia** (calibrado contra el CLI, §4 del informe): Sonnet 5 $3/$15, cache-write 1h $6, cache-read $0,3; Haiku 4.5 $1/$5/$1,25(5m)/$0,1.

Red de seguridad estructural en cada fase, antes del baseline: `healthcheck` + `npm run build` + `npm test` (los del repo; en la reorganización eran 18/18 y 72/72 — el healthcheck cambiará en Fase 1, ver ahí).

### Enmiendas al protocolo (post-F2, 2026-07-21)

La F2 midió el suelo de ruido del protocolo: **~±$3/run** (denials del sandbox + variance del discovery 6→10 escenarios + re-primings por pausas). Ningún efecto menor a eso es medible con el baseline completo. Enmiendas obligatorias desde F3:

1. **Discovery congelado para A/B**: los dos brazos de una comparación parten del MISMO `discovery-report.json` + plan fragments + POM ya generados (Actos 1-3 se corren UNA vez y se archivan en `.work/audit-runs/frozen-<fase>/`); se mide solo Actos 4-5. Mata la variance del catálogo y baja el coste del A/B a la mitad.
2. **`--allowedTools` ampliado**: añadir los patrones que fallaron en F1/F2 (env-var inline y heredocs; en la práctica: `Bash(QA_WORK_DIR=*)`, `Bash(cat >*)` o equivalentes observados en los streams) y dar `Write` a `ia4d-reviewer` (persiste su propio feedback; hoy el Writer lo hace en su nombre cuando Bash choca con el gate).
3. **Pre-crear `config/tc-registry/saucedemo.json` con `{}`** antes del run (elimina la pausa ask-first de "registro borrado en frío").
4. **Efectos esperados < $1 no se miden con run**: se justifican por aritmética (tokens × re-lecturas × precio) y se anotan como estimación. El run se reserva para efectos > $2-3.

---

## Fase 1 — Determinístico (R1 + R3). Riesgo bajo.

**Objetivo**: eliminar del camino LLM lo que no requiere juicio. Ahorro directo modesto (~$0,3/run) pero −7 invocaciones de subagent y menos turnos del orquestador; deja el terreno limpio para atribuir el ahorro de la Fase 2.

Cambios, en orden:

1. **mode-router → código**. Crear `src/scripts/resolve-mode.ts`: recibe los flags, devuelve `{module, status}` por stdout (misma semántica que el agente: S2-Gherkin/S3/S4 funcionales, S1/S2-OpenAPI stub). Los 4 commands funcionales (`autonomous.md`, `req-driven.md`, `spec-refiner.md`, `code-driven.md`) sustituyen la invocación Task del Acto 1 por `npx tsx src/scripts/resolve-mode.ts <flags>`. El agente `ia4d-mode-router.md` NO se borra: se marca deprecated en su cabecera apuntando al script (auditabilidad; borrar es decisión del cierre del branch). Registrar al audit-log igual que hoy.
2. **compliance-checker → código**. Crear `src/scripts/check-compliance.ts` reutilizando la lógica de `hooks/pre-flight.ts` (misma validación URL vs `config/allowed-targets.yaml`; extraer la función compartida a `src/` si hace falta para no duplicar). Exit 0 = allow, exit 2 = block, verdict JSON a `.work/compliance-verdict.json` (misma ruta que hoy). Commands sustituyen la invocación Task. **El gate no cambia de semántica: sigue sin override** (regla dura #3 intacta; el hook PreToolUse sigue además activo como segunda barrera). `ia4d-compliance-checker.md` deprecated, no borrado.
3. **a11y-injector → verificación AST**. Crear `src/scripts/verify-a11y.ts` (ts-morph o regex robusta): comprueba que cada `test()` del spec tiene el scan AxeBuilder tras el goto y que el modo (annotation vs assert) corresponde a `a11y.fail_on_violations` del contract. Exit 0 = ok; exit 1 = lista de specs sin scan. El command lo ejecuta donde hoy invoca al injector ×5; **solo si falla**, invoca `ia4d-a11y-injector` para el spec concreto (el agente pasa de camino caliente a rescate). La regla dura "scan siempre inyectado" se garantiza igual o mejor: verificación determinística en vez de fe en el Haiku.
4. **CLAUDE.md del repo a dieta**: mover la sección "Estado actual" a `docs/STATUS.md` y dejar en CLAUDE.md un puntero de una línea + las 3-4 entradas más recientes. No tocar el CLAUDE.md del template.
5. Ajustar `healthcheck` a la nueva realidad (los checks que cuenten subagents/invocaciones cambiarán de N — revisar `src/` del healthcheck antes de asumir).

**Criterio de salida**: red estructural verde + baseline ≈ $11-12 con 5/5 approved y sin invocaciones de router/compliance/injector en el desglose del parser. `build:template` y validación del template al cerrar la fase.

**Commit**: `perf(qa-automator): fase 1 token-efficiency — mode-router/compliance/a11y-check determinísticos + CLAUDE.md split`

---

## Fase 2 — Dieta de contexto (R2 + R4). Riesgo medio: prompts podados pueden regresar comportamiento.

**Objetivo**: atacar el 51% del coste (orquestador) y el coste ×5 del Writer. Es la fase con más ahorro esperado del Nivel 1.

Cambios:

1. **`autonomous.md` de 6,9k → ≤3k tokens**. Mover a `docs/references/autonomous-operations.md` (lazy): los bloques de ejemplo shell del Verification step, el protocolo de recovery del planner (paso 6.5, mantener en el command solo el enunciado de la guarda + puntero), y la casuística del checkpoint 2.5 (mantener la tabla-formato mínima). Lo que se queda: los 5 actos, argumentos, hard rules. Criterio por línea: ¿su ausencia haría que el orquestador se equivoque? Si no, fuera.
2. **`ia4d-writer.md` de 3,4k → ~2k**: la justificación en prosa de cada regla va a `docs/references/writer-reviewer-protocol.md` (ya existe); el prompt conserva la regla escueta. Ídem `ia4d-discovery-analyzer.md` (4,2k → ~2,5k).
3. **Punteros, no payload, en los Task prompts**: auditar cómo el command construye los prompts de Writer (el baseline midió 5-10k de input no-cacheado en algunos Writers, §4.2.4 del informe). El prompt debe llevar rutas (`--plan-entry`, `--discovery-report`) y NO el contenido inline. Si el contenido inline viene del propio orquestador "siendo útil", añadir instrucción explícita en el command: "pasa rutas, nunca contenido".
4. No tocar los subagents nativos de Microsoft (regla del repo).

**Criterio de salida**: baseline con coste del orquestador claramente por debajo del de Fase 1 (objetivo: −25-40% en cache-read del main; total run ~$9-10), y calidad intacta (5/5 approved, mismos criterios). Si algún spec baja de calidad o el run se desvía del procedimiento (actos saltados, guardas ignoradas), la poda fue excesiva: restaurar la línea concreta y re-medir. **Ojo**: comparar también nº de llamadas API del orquestador — es el multiplicador, no solo el tamaño del prompt.

**Commit**: `perf(qa-automator): fase 2 token-efficiency — dieta de contexto (command ≤3k, prompts podados, punteros no payload)`

---

## Fase 3 — Reviewer de lote (R6). Experimental; toca regla dura #8. Decisión del QA al final.

**Objetivo**: pasar de 5-10 invocaciones de Reviewer por run a checks determinísticos + 1 auditoría de lote, preservando el juez independiente. Ahorro estimado $1-1,5/run.

Diseño propuesto (validar antes de adoptar):

1. **Pre-review determinístico**: extraer los checks objetivos del Reviewer (locators prohibidos, waits, banned APIs, min asserts, naming — los MF ya mecánicos) a `src/scripts/pre-review.ts` reutilizando la lógica AST del style-enforcer. Corre tras cada Writer; su output JSON alimenta al Reviewer.
2. **Reviewer de lote**: una única invocación de `ia4d-reviewer` por run que recibe los 5 specs + los pre-review JSON + contract + discovery, y devuelve verdict + feedback POR SPEC en los mismos ficheros per-spec de hoy (`<workDir>/review-feedback/<spec>.json` — el formato no cambia; el Judge y el reporte no se enteran).
3. **Ping-pong solo para rechazados**: el Writer se re-invoca únicamente para los specs con verdict `rejected` (N≤2 se mantiene por spec).
4. **A/B obligatorio antes de adoptar, sobre discovery congelado (enmienda post-F2)**: correr Actos 1-3 UNA vez y archivar sus artefactos; los dos brazos (reviewer per-spec vs de lote) re-ejecutan solo Actos 4-5 desde ese estado congelado. Comparar verdicts, nº de must-fix detectados y verdes a la primera sobre el MISMO catálogo. Si el de lote detecta menos must-fix reales o aprueba algo que el per-spec rechazaba, **se descarta y se documenta**: el informe ya establece que es la única recomendación con riesgo sobre el argumento de venta. Efecto esperado ($1-1,5) cerca del suelo de ruido del baseline completo — el A/B congelado es lo que lo hace medible.
5. Si se adopta: actualizar regla dura #8 en CLAUDE.md/SPEC (matiz, no eliminación: "Writer + Reviewer obligatorios; el Reviewer audita por lote con pre-review determinístico por spec"), `composition-rules.md` y `writer-reviewer-protocol.md`.

**Criterio de salida**: decisión documentada (adoptado con A/B verde, o descartado con el dato). Ambos desenlaces cierran la fase.

**Commit**: `perf(qa-automator): fase 3 token-efficiency — pre-review determinístico + reviewer de lote (A/B: <resultado>)` o `docs(qa-automator): fase 3 — reviewer de lote descartado por A/B`

---

## Fase 4 — Orquestación determinística (R7). Promovida desde "fuera de plan" tras F1-F2.

**Justificación con dato (F2)**: el prefijo del orquestador (~131k medios/call) lo domina el historial de tool-results × nº de turnos, no la prosa (podarla movió <3%). El único efecto del plano orquestador por encima del suelo de ruido (~$3-4/run) vive en reducir turnos. F1-F2 ya hablaron; esto es lo que queda.

**Objetivo**: orquestador de 115 llamadas API → ~40-50. Crear `src/scripts/run-s4-mecanico.ts` (nombre orientativo) que encadene los pasos SIN juicio que hoy el orquestador ejecuta leyendo prosa: limpieza 5.c + namespace, scaffold POM (Acto 3), resolución de IDs + escritura del tc-registry (Acto 2.5 salvo la decisión de selección), `verify-a11y`, consolidate-reviews, Verification step (env-vars + `npx playwright test` + parseo del veredicto) y ensamblado del run-summary. El orquestador LLM conserva: captura del brief y pausas ask-first, invocación de planners/discovery/writers, decisión del checkpoint cuando cap superado, y el reporte final al QA.

**Reglas que NO cambian**: compliance sin override, guarda anti-fabricación 6.5 (el juicio de "¿navegó de verdad?" sigue en el orquestador; el script solo verifica existencia/estructura del fragmento), ask-first en todas las pausas actuales.

**Tradeoff asumido** (decidido al promoverla): el command .md deja de ser prosa auto-contenida — queda como documentación del flujo que delega lo mecánico al script. Para I+D el patrón externo (Orquestador → Sub-agentes → Comandos → Hooks) no cambia.

**Criterio de salida**: baseline completo (con protocolo enmendado) ≈ **$9-10 limpio**, llamadas API del main < 60, calidad intacta (5/5 approved). Es el efecto grande: si no aparece con ese margen, el diseño del script está mal repartido (juicio vs mecánica) y se revisa antes de commitear.

**Commit**: `perf(qa-automator): fase 4 token-efficiency — orquestación mecánica a run-s4-mecanico.ts, main <60 calls`

**Nota de expectativas**: con F4 + F3 adoptada, el objetivo realista pasa a **~$8-9/run** (no los $6-7 originales del informe — esa cifra asumía el ahorro de R2 que F2 refutó).

---

## Fuera de plan (explícito)
- **Dom-walker / port copilot-edition**: fuera de scope por decisión de entrevista (carril propio).
- **Writer a Haiku, tocar compliance sin override, encender Judge**: descartados en el informe (R8).
- **Hueco de specs stale** (`tests/e2e/<site-id>/` no se limpia): tarea aparte ya flaggeada, no bloquea; el protocolo de medición lo neutraliza borrando el namespace antes de cada baseline.

## Prerequisito antes de Fase 1

Commitear en `design/token-efficiency` el estado actual: informe, este plan, `src/scripts/parse-usage.mjs`, y la evidencia del baseline que se quiera versionar (specs generados y test-plans del run instrumentado, o descartarlos — decisión al abrir la sesión de Fase 1). Un working tree limpio por fase es lo que hizo reversible la reorganización.

## Resultados

| Fase | Fecha | $ run | Δ vs anterior | Subagents | API calls main | Approved | Verdes 1ª | Notas |
|---|---|---|---|---|---|---|---|---|
| Baseline (auditoría) | 2026-07-21 | 12,4 | — | 18 | 91 | 5/5 | 4/5 | Incluye ~10-15% de inflado por interrupciones |
| Fase 1 | 2026-07-21 | 11,93 | −0,47 (−3,8%) | 9 | 79 | 5/5 | 3/5 | Ver notas Fase 1 abajo. Wall-clock ~21 min (vs ~35) |
| Fase 2 | 2026-07-21 | 14,67 | +2,74 (+23%) ⚠️ contaminado | 9 (+2 reviewers visibles) | 115 | 5/5 | 3/5 | **CERRADA (decisión QA 2026-07-21)**: aplicada, calidad intacta, hipótesis de ahorro grande refutada — ahorro real ~$0,2-0,3 (aritmético), bajo el suelo de ruido del protocolo (~±$3). Cambios se conservan. Origina las enmiendas al protocolo y la promoción de R7 a Fase 4 |
| Fase 3 (A/B congelado) | | | | | | | | |
| Fase 4 (R7) | | | | | | | | |

**Notas Fase 1** (streams: `.work/audit-runs/baseline-fase1{,-2}.jsonl`, sesión `42bce888`):

- **Criterio de salida cumplido**: total $11,93 (banda esperada $11-12), 5/5 approved (todos en iteración 0), y **cero invocaciones de mode-router/compliance-checker/a11y-injector en el desglose del parser**. Subagents 18→9 (3 planners + discovery + 5 writers; el Reviewer sigue embebido en el sidechain del Writer). Orquestador: 91→79 llamadas API, cache-read 12,0M→10,2M, ~$2,65 prorrateado.
- El run corrió en 2 segmentos por una **pausa ask-first legítima**: al borrar `config/tc-registry/saucedemo.json` (protocolo de medición), el orquestador detectó que reasignar IDs en frío cambia el significado de TC-003/TC-005 vs el histórico git y preguntó. Se respondió opción spec-literal (`{}`, cero real). Coste incluye el re-priming de caché del segundo segmento — el run limpio sin pausa sería algo menor, igual que en el baseline original.
- **Verdes a la primera: 3/5** (esperado ≥4/5). `TC-005 pago` rojo también en el baseline original (no regresión). `TC-001 login` es un rojo nuevo: locator `getByRole('img', { name: 'Swag Labs' })` no confirmado contra el DOM por el discovery, que el Reviewer ya había marcado should-fix no bloqueante — clase de fallo preexistente (la misma del baseline), no atribuible a los cambios de Fase 1 (los specs los siguen escribiendo los mismos Writer/Reviewer con los mismos prompts). Nótese además que el catálogo descubierto difirió del original (salió `credenciales-invalidas`, no salió `carrito.quitar-producto`): variance run-a-run del discovery, no del cambio.
- El ahorro directo de Fase 1 era modesto por diseño (~$0,3-0,5); el objetivo real era limpiar el terreno para atribuir la Fase 2 (dieta del orquestador, 51% del coste). El wall-clock sí cayó fuerte (~35→~21 min): menos invocaciones y 5/5 aprobados sin iteraciones.
- **Hallazgo de tooling** (para el radar, no bloquea): en headless, subagents con solo `Bash` (p.ej. `ia4d-reviewer`, sin `Write`) chocan con el permission-gate cuando el comando no calza literal con los patrones del allow-list (`Bash(npx tsx *)` con prefijo de env-var delante, p.ej.); el Writer tuvo que persistir el feedback en su nombre. Revisar allow-list o dar `Write` al Reviewer.

**Notas Fase 2** (streams: `.work/audit-runs/baseline-fase2{,-2,-3}.jsonl`, sesión `aad8f461`, 3 segmentos por 2 pausas ask-first legítimas: tc-registry borrado en stage → opción cero-real; checkpoint 10>5 → `TOP`):

- **Cambios de la fase (aplicados y estructuralmente verdes)**: `autonomous.md` 6.995→3.018 tokens (−57%; warning 5.b, tabla checkpoint, ejemplos shell y casuística → `docs/references/autonomous-operations.md`, nuevo, carga lazy); `ia4d-writer.md` 3.393→1.956 (−42%; justificaciones → sección "Notas de diseño" de `writer-reviewer-protocol.md`); `ia4d-discovery-analyzer.md` 4.241→2.345 (−45%); instrucción explícita punteros-no-payload en Acto 4 + hard rule nueva. Red estructural: tsc limpio, 167/167 tests, healthcheck 22/22, `build:template` OK. Calidad intacta: 5/5 approved (iter 0-1), actos y guardas respetados (las 2 pausas eran obligadas por diseño).
- **Criterio de salida NO demostrado**: total $14,67 (vs objetivo $9-10), orquestador 115 calls / 15,0M cache-read / ~$3,63 (vs 79 / 10,2M / ~$2,65 en F1). El prefijo medio por call (~131k vs ~129k) muestra por qué: el prefijo lo domina el historial de tool-results, no el command — los ~3,9k tokens podados son <3% del prefijo, invisibles bajo el ruido.
- **Contaminadores identificados (~$2,5-3,5 conjunto)**: (a) **27 permission denials** del sandbox de la sesión anfitriona (env-var inline `VAR=x cmd` y heredocs `cat >` bloqueados — la misma clase del hallazgo de tooling de F1, agravada): el orquestador quemó turnos escribiendo wrappers Node y persistiendo a mano el feedback del Reviewer TC-003; (b) **patrón nuevo: Writers lanzados en background** → 5 turnos idle de notificación re-leyendo el prefijo (no visto en F1); (c) **variance del discovery**: 10 escenarios (vs 6 en baseline y F1) — planners recorrieron caminos de error, seg2 22,6 min; TOP-5 sin negativos (mix distinto, comparabilidad de verdes limitada); (d) 2 re-primings de caché por las pausas. Output tokens anómalos: seg3 solo emitió 168,9k out (~$2,5), parte atribuible a wrappers/feedback manual.
- **Verdes a la primera: 3/5**. TC-001 y TC-002 rojos con el mismo root cause **pre-existente**: `src/pom-scaffolder.ts` inyecta locators hardcodeados no presentes en el discovery (`menuButton`/`title`/`logo` en InventoryPage; `orderSummary` en CheckoutStepTwoPage). No atribuible a la Fase 2 (el scaffolder no se tocó); misma clase que el rojo TC-001 de F1. Bug flaggeado como tarea aparte.
- **Lectura y decisión pendiente del QA**: la poda no regresó comportamiento, pero su ahorro (~$0,2-0,3/run estimado real: 3,9k tokens × ~90 re-lecturas + 1,4k × 5 writers) es un orden de magnitud menor que el ruido ambiental del protocolo actual. Opciones: (1) aceptar el dato y cerrar la fase como "aplicada, ahorro no medible con este protocolo" — el ahorro real de R2 estaba en **menos turnos** (R7), no en menos prosa; (2) re-medir en entorno limpio (terminal sin sandbox anfitrión + `--allowedTools` ampliado con los patrones que fallaron, o `Write` para el Reviewer); (3) pasar directamente a Fase 3/R7, donde vive el techo real del plano orquestador (~$3-4/run).
