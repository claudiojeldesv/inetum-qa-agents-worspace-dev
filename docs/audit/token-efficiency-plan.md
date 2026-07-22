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

**Medición — mitigación del bloqueo de F3**: el baseline de F4 exige `claude -p` real (el A/B in-session de F3 no da `total_cost_usd` ni cuenta las llamadas del main, que es LA métrica de esta fase). Si el classifier de permisos vuelve a bloquear el `claude -p` anidado desde la sesión ejecutora: el QA lanza el comando del protocolo **a mano desde una terminal normal** (está completo en la sección de protocolo, con output a `.work/audit-runs/baseline-fase4.jsonl`) y la sesión ejecutora solo parsea el stream. No sustituir la medición por estimación in-session — el criterio de salida de F4 no se puede firmar sin el run completo.

**Commit**: `perf(qa-automator): fase 4 token-efficiency — orquestación mecánica a run-s4-mecanico.ts, main <60 calls`

**Nota de expectativas**: con F4 + F3 adoptada, el objetivo realista pasa a **~$8-9/run** (no los $6-7 originales del informe — esa cifra asumía el ahorro de R2 que F2 refutó).

---

## CICLO 2 (2026-07-22) — el margen vive en los Writers, no en el orquestador

Base: §8 del [informe](token-efficiency-audit-2026-07.md) (re-auditoría sobre el baseline F4: writers ~52% del coste, orquestador agotado, output ahora visible ~$3). Mismas reglas: protocolo enmendado, A/B congelado para todo lo que toque calidad, efectos <$1 por aritmética.

### Fase 5 — Quick wins C2 (C2-3 + C2-4 + C2-5). Riesgo cero.

1. Arranque escalonado de Writers: el command lanza el Writer del primer escenario, espera su retorno de primera respuesta (o sencillamente lo completa), y lanza los 4 restantes en paralelo. Ahorro ~$0,4-0,5 (aritmético — no se mide con run).
2. Documentar `evidence.level` como knob de coste en el schema del Style Contract y README del template (full = vitrina; steps/minimal = default cliente).
3. Gobernanza de modelo: nota en `autonomous.md`/README del template — runs con `--model sonnet`; prohibido `CLAUDE_CODE_SUBAGENT_MODEL` (pisa el tiering).

**Criterio de salida**: red estructural verde; sin medición de run (efectos bajo el suelo de ruido, se firman por aritmética). **Commit**: `perf(qa-automator): fase 5 token-efficiency — stagger writers + gobernanza modelo/evidence`

### Fase 6 — Writer en Haiku, A/B congelado (C2-1). La palanca grande (~$3,5-4). Toca asignación de modelos, no reglas duras.

1. A/B sobre discovery congelado (Actos 4-5, mismo catálogo): brazo A = Writers Sonnet (estado actual), brazo B = Writers Haiku 4.5 (`model: haiku` en frontmatter del writer, **Reviewer se queda en Sonnet** — el juez no se abarata).
2. Métricas de decisión: approved-rate a iteración ≤1 (hoy: mayoría iter 0), nº y severidad de must-fix del Reviewer, verdes/rojos por clase en verificación real, y coste neto por brazo (si Haiku necesita 2 iteraciones sistemáticamente, el ping-pong se come el ahorro — medirlo, no asumirlo).
3. Si adopta: actualizar la tabla de modelos en CLAUDE.md/SPEC ("Writer: Haiku 4.5 vigilado por Reviewer Sonnet") y el argumento en la ficha del catálogo. Si no: documentar y cerrar, como R6.

**Criterio de salida**: decisión con dato, ambos desenlaces cierran. **Commit**: `perf(qa-automator): fase 6 token-efficiency — writer Haiku A/B (<resultado>)`

### Fase 7 — Orquestador en Haiku (C2-2). Condicional a F6; ~$1,5-1,8.

Solo si F6 cerró (con cualquier desenlace) y el apetito sigue: baseline completo con `--model haiku`, mismos criterios de calidad + atención específica a la guarda 6.5 (juicio "¿navegó de verdad?"), la decisión del checkpoint y la calidad del diagnóstico post-rojos. Es un flag de lanzamiento: si degrada, se revierte sin tocar código. Efecto ~$1,5-1,8 — medible con run limpio.

**Criterio de salida**: decisión con dato. **Commit**: `perf(qa-automator): fase 7 token-efficiency — main Haiku (<resultado>)`

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
| Fase 3 (A/B congelado) | 2026-07-21 | n/a (A/B in-session) | ~+$0,2-0,5 estimado si se adoptara el lote ⚠️ | A: 4 / B: 5 | n/a | A: 4/4 · B: 4/4 (iter 0) | A: 2/4 · B: 2/4 | **CERRADA**: reviewer de lote **DESCARTADO** por A/B (sin ahorro, feedback más pobre); pre-review determinístico **ADOPTADO** como red post-review (paso 11.c). Ver notas Fase 3 |
| Fase 4 (R7) | 2026-07-22 | 11,21 | −0,72 vs F1 (−6%) | 9 | 46 | 5/5 | 0/5 ⚠️ pre-existente | **CERRADA**: main 79→46 calls (LA métrica de la fase, criterio <60 cumplido con margen); $9-10 limpio no alcanzado — el objetivo estaba calibrado contra la F2 contaminada. Ver notas Fase 4. **Cierra el ciclo 1** (§7.1 del informe) |
| Fase 5 (C2 quick wins) | 2026-07-22 | n/a (sin run, por diseño) | ~−$0,4-0,5 aritmético | n/a | n/a | n/a | n/a | **CERRADA**: stagger de Writers (C2-3, los 3 commands funcionales), `evidence.level` documentado como knob de coste (C2-4), gobernanza de modelo (C2-5). Efectos bajo el suelo de ruido → firmados por aritmética (enmienda 4 del protocolo). Ver notas Fase 5 |
| Fase 6 (Writer Haiku A/B) | 2026-07-22 | n/a (A/B in-session) | ~$0 neto o peor (la premisa −$3,5-4 refutada) | A: 4 / B: 4+1 rescate | n/a | A: 4/4 iter 0 · B: 0/4 iter 0, 2/4 iter ≤1, 2/4 iter 2 | A: 2/4 · B: 2/4 (mismas clases) | **CERRADA**: Writer Haiku **DESCARTADO** por A/B — approved-rate a iter ≤1 degradado, 9 must-fix (vs 0), Reviewer Sonnet ×2,5 invocaciones se come el ahorro. Writer sigue Sonnet. Ver notas Fase 6 |
| Fase 7 (Main Haiku, condicional) | | | | | | | | |

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

**Notas Fase 3** (A/B sobre discovery congelado, 2026-07-21; evidencia en `.work/audit-runs/{frozen-fase3,fase3-arm-a,fase3-arm-b}/`):

- **Desvío de protocolo, forzado y documentado**: el classifier de permisos de la sesión ejecutora bloqueó lanzar `claude -p` anidado, así que el A/B corrió **in-session** (mismos subagents vía Task/Agent tool, mismo discovery congelado, planners secuenciales). Consecuencia: sin `total_cost_usd` por brazo; el coste se atribuye por tokens de subagent reportados por el harness + la aritmética calibrada del baseline (reviewer ≈ $0,3/invocación). La comparación de CALIDAD — el criterio de decisión de la fase — no se ve afectada.
- **Congelación (Actos 1-3)**: catálogo de 4 escenarios (variance del discovery: menos que los 5-10 de F1/F2; ambos brazos comparten el mismo catálogo, que es lo que importa). Hallazgo del run: el planner de `pago` reportó un botón "Generate PDF order" que parecía fabricado; la guarda 6.5 lo escaló, el reintento lo confirmó y la verificación manual demostró que **es real pero dependiente de estado** (solo renderiza tras un checkout completado — la comprobación por navegación directa sin pedido era la defectuosa). Falso positivo de la guarda resuelto a favor del planner; la tesis drift-sin-fabricar aguanta.
- **Resultado calidad**: paridad en must-fix (0 vs 0 — sin caso discriminante: ambos brazos aprobaron 4/4 en iteración 0); el lote NO aprobó nada que el per-spec rechazara. Pero la riqueza del feedback cayó a la mitad (10 should-fix per-spec vs 5 del lote, confundido por variance de Writers) — la señal de dilución de atención que el informe anticipaba. Verdes a la primera 2/4 en ambos, con las MISMAS clases de fallo pre-existentes (gap del discovery en pantalla cart; locator genérico add-to-cart con strict mode) — no atribuibles al modo de review.
- **Resultado coste (la premisa de R6, refutada)**: tokens de subagent Actos 4-5 — brazo A ~339k (4 writers con review embebido) vs brazo B ~383k (+13%: 315k writers + 68k del reviewer de lote). El lote paga una sesión propia que re-lee TODO (4 specs + planes + pre-reviews + contract + discovery) y añade 4-6 pasos de orquestación al command (pre-review, manifest, invocación, lectura de verdicts) que en per-spec no existen (el ping-pong vive dentro del Writer, cero turnos del orquestador). En el perfil común (aprobación a la primera) el per-spec ya es mínimo: N invocaciones, no 2N. Y en runs CON rechazos — donde el ahorro teórico debía aparecer — el lote re-lee todo en cada ronda mientras el ping-pong solo re-paga el spec afectado. Neto estimado: $0,2-0,5/run PEOR o neutro, bajo el suelo de ruido (±$3).
- **Decisión (criterio del plan aplicado)**: **reviewer de lote DESCARTADO** — no por calidad (paridad sin caso discriminante) sino porque la hipótesis de ahorro es falsa y el feedback empobrece. **Pre-review determinístico ADOPTADO** como componente (a) de R6 en solitario: red objetiva post-review en el paso 11.c del command (0 falsos positivos sobre 13 specs reales aprobados: 5 de F2 + 4+4 del A/B), coste $0, refuerza la regla dura #5. La regla dura #8 NO se toca (Writer+Reviewer per-spec siguen obligatorios); `composition-rules.md` y `writer-reviewer-protocol.md` quedan como están. Los cambios de modo batch en los prompts de writer/reviewer se revirtieron (peso muerto pagado por invocación); el Reviewer conserva la tool `Write` (enmienda F3, elimina el choque del feedback con el permission-gate de F1/F2).

**Notas Fase 4** (streams: `.work/audit-runs/baseline-fase4{,-2}.jsonl`, sesión `7f8e70ec`, 2 segmentos, protocolo enmendado completo: tc-registry pre-creado con `{}`, `--allowedTools` ampliado, `claude -p` real — esta vez el classifier NO bloqueó el lanzamiento anidado):

- **Cambios de la fase**: `src/scripts/run-s4-mecanico.ts` (nuevo, ~700 líneas + 19 tests) encadena en 5 stages lo mecánico del command — `setup` (resolve-mode + compliance sin override + brief 5.b + namespace/limpieza 5.c), `check-fragments` (parte mecánica de la guarda 6.5; el juicio "¿navegó de verdad?" sigue en el orquestador), `checkpoint` (cap + IDs estables + tc-registry + `selection.json` + scaffold POM, Actos 2.5+3 en una llamada), `post-writers` (verify-a11y + consolidate-reviews + pre-review 11.c) y `verify` (skip del Judge, seed, `npx playwright test` con env-vars seteadas POR el script — elimina la clase de denials de F2 —, veredicto por-test vía reporter JSON opt-in en `playwright.config.ts`, run-summary ensamblado de artefactos). Exit codes 0/2/3: las pausas ask-first se preservan vía `pending` en el JSON (compliance-warn, brief ciego, selección del checkpoint) — el script las señala, el orquestador pregunta. `autonomous.md` reescrito (~2,6k tokens): documenta el flujo y delega; para I+D el patrón externo no cambia. Red estructural: tsc limpio, 204/204 tests, healthcheck 24/24 (2 checks nuevos), `build:template` OK. Smoke previo de los 5 stages sobre los artefactos congelados de F3 reprodujo exactamente su resultado.
- **Criterio de salida, parte cumplida**: **orquestador 46 llamadas API** (objetivo <60; F1 79, F2 115) — main cache-read 5,0M (F1 10,2M, F2 15,0M), ~$1,4-1,6 prorrateado (F1 ~$2,65, F2 ~$3,63). El plano orquestador que R7 atacaba se capturó entero: de las 46 calls, solo ~5-6 son stages mecánicos; el resto es juicio o inherente (9 Tasks de subagents, ~15 notificaciones idle de los 5 Writers paralelos, 13 del diagnóstico post-rojos). Wall-clock CLI: 12,4 + 5,2 ≈ **~18 min** (F1 ~21, baseline ~35) — los writers paralelos + stages colapsados también pagan en tiempo.
- **Criterio de salida, parte NO alcanzada**: total **$11,21** (CLI, 2 segmentos: $1,83 + $9,38) vs objetivo $9-10 limpio. Descomposición del gap: ~$0,3-0,5 de re-priming por la pausa legítima del checkpoint (catálogo 6 > cap 5, respuesta `TOP` — misma pausa que F2) y ~$0,6-0,7 del diagnóstico post-rojos (13 calls del main navegando el sitio real vía MCP para verificar causas raíz — juicio nuevo que F1/F2 no hicieron; producto mejor, no regresión). Ajustado a run limpio ≈ **$10**. Lectura honesta: el objetivo $9-10 se calibró cuando la referencia era la F2 contaminada (115 calls / $3,63 de main); sobre la F1 real (79 / $2,65) el techo del plano orquestador era ~$1,2/run — y R7 lo capturó. Lo que queda del coste vive en los subagents (planners $0,63 + writers $2,7 + discovery $0,04) y en el output/cache-write del propio run, fuera del alcance de R7. **El diseño juicio/mecánica NO está mal repartido** — el margen restante no está en el orquestador.
- **Calidad: 5/5 approved** (TC-001/002/003/005 en iteración 0; TC-004 en iteración 1). El run-summary mostró `unknown` para TC-004 por un bug NUEVO del Reviewer: escribió las dos iteraciones como objetos JSON pretty concatenados en el mismo fichero per-spec (tercera manifestación de la familia review-feedback; distinta del append concurrente ya resuelto). Fix del consumidor aplicado en esta fase: `consolidate-reviews.ts` parsea objetos concatenados por balance de llaves (test nuevo); la re-consolidación confirma el approved. El fix del origen (formato de escritura en el prompt del Reviewer) queda flaggeado como tarea aparte.
- **Verdes a la primera: 0/5** ⚠️ — peor que F1/F2 (3/5) pero con causas raíz verificadas por el orquestador contra el sitio real, ambas de clases PRE-EXISTENTES no atribuibles a F4 (mismos prompts de planner/writer/discovery): (1) TC-002/003/004 — `CartPage.yourCart` con `getByRole('generic', { name: 'Your Cart' })`: el rol `generic` no computa accessible name, el locator nunca resuelve; misma clase que los rojos de cart de F2/F3 (gap del discovery). (2) TC-001/005 — el planner documentó "los inputs agregan clase `error` en estado de error" y el Writer lo tradujo a `not.toHaveClass(/error/)` en el camino feliz; la clase es parte del nombre base SIEMPRE presente (`input_error form_input`): observación imprecisa del planner que ni la guarda 6.5 ni el pre-review pueden cazar (verifican evidencia concreta y compliance estático, no correctitud semántica de lo observado). Pre-review 5/5 clean, a11y 5/5 con scan. Rojos → decisión QA (Healer post-proceso), consistente con el principio de sanación al final.
- **Cierre del branch (lectura global F1-F4)**: baseline $12,4/35 min → **$11,2/18 min** con main 91→46 calls y 18→9 subagents, calidad de review intacta en todas las fases. El ahorro grande en $ que el informe estimaba (~$6-7) asumía que el plano orquestador era grasa (R2+R7 ~$4-5); medido, era ~$1,5-2. El resto del coste es estructural (subagents que hacen el trabajo real) y su palanca es otra familia (writers/planners), fuera del scope de esta auditoría. Expectativa realista post-F4 confirmada: **~$10-11/run** en clase SauceDemo con el protocolo actual (la promo Sonnet 5 lo dejaría en ~$7 hasta 2026-08-31).

**Notas Fase 5** (quick wins C2, 2026-07-22; sin run por diseño — enmienda 4 del protocolo: efectos < $1 se firman por aritmética):

- **C2-3 stagger de Writers**: `autonomous.md` paso 5 + hard rule — el primer Writer se lanza SOLO y se espera su cierre (escribe el cache-write del prefijo compartido, ~15-20k tokens); los restantes van en paralelo y lo leen. Si el auth setup (4.b) corrió antes, la caché ya está caliente y todos van en paralelo. Aritmética: ~4×17k cache-writes ($6/MTok) → cache-reads ($0,3/MTok) ≈ **$0,4-0,5/run S4**, a cambio de +30-60s de wall-clock. **Extensión sobre el enunciado del plan** (que hablaba de "el command" en singular): `spec-refiner.md` y `req-driven.md` paso 12 comparten el patrón de Writers paralelos y recibieron el mismo cambio de una línea — misma clase, riesgo cero; excluirlos habría dejado S2/S3 pagando el cache-write frío sin razón.
- **C2-4 `evidence.level` como knob de coste**: documentado en el bloque `evidence` de `docs/references/style-contract-schema.md` (se propaga al template vía `build:template`), sección nueva "Coste del run — dos knobs" en `template/README.md`, y una frase en el párrafo "Reporte Allure PRO" de `template/CLAUDE.md` (donde se promociona `full`). Mensaje: `full` = vitrina/demo (specs más largos, output pagado por Writer); cliente = `minimal`/`steps`.
- **C2-5 gobernanza de modelo**: hard rule nueva en `autonomous.md` + la misma sección del README del template — los runs se lanzan con `--model sonnet` (las cifras están medidas ahí; Opus paga ×1,67 el plano orquestador sin ganancia) y **nunca** `CLAUDE_CODE_SUBAGENT_MODEL` (pisa el frontmatter de todos los subagents y anula el tiering Sonnet/Haiku). Previene regresión, no ahorra.
- **Red estructural verde**: tsc limpio, 204/204 tests, healthcheck 24/24, `build:template` OK. Criterio de salida de la fase cumplido; la validación conductual del stagger (¿el orquestador escalona de verdad?) queda absorbida por el A/B congelado de F6, que re-ejecuta Actos 4-5 con estos prompts.

**Notas Fase 6** (A/B Writer Sonnet vs Haiku 4.5 sobre discovery congelado de F3, 2026-07-22; evidencia en `.work/audit-runs/{fase6-arm-a,fase6-arm-b,pre-fase6}/`):

- **Método**: mismo desvío que F3 (A/B in-session, sin `total_cost_usd`; coste por tokens de subagent del harness + calibración del baseline — la comparación de CALIDAD, que decide la fase, no se ve afectada). Estado congelado de `frozen-fase3` restaurado por brazo (discovery 4 escenarios, planes, POM, tc-registry); brazo A = Writers `model: sonnet` (frontmatter), brazo B = Writers con override `model: haiku` por invocación (el Reviewer anidado resuelve Sonnet desde su propio frontmatter — el juez no se abarató). Ambos brazos escalonados (F5), prompts idénticos salvo una frase de refuerzo de protocolo añadida al brazo B tras el primer lapso (asimetría menor, a FAVOR del brazo B). El `selection.json` congelado (formato F3 pre-checkpoint) se adaptó al schema del stage `verify` de F4 (`{total, selected[]}`) — compatibilidad, no cambio semántico. Verificación real con los stages `post-writers`/`verify` de `run-s4-mecanico.ts` en ambos brazos.
- **Brazo A (control, Sonnet)**: 4/4 approved en iteración 0, 0 must-fix, 8 should-fix, pre-review 4/4 clean, a11y 4/4. Verificación real 2/4 verdes (TC-002/003 rojos por el gap del discovery en cart — MISMAS clases que F3: reproducción exacta del A/B congelado, control válido). Tokens: 302,2k; 4 invocaciones de Reviewer; ~20,7 min de cómputo sumado.
- **Brazo B (Haiku 4.5)**: 0/4 approved en iteración 0; 2/4 a iteración ≤1 (TC-001, TC-003); TC-002 y TC-004 agotaron el presupuesto N≤2. **9 must-fix** del Reviewer (vs 0): API de axe inexistente (`injectAxe`/`getViolations` o paquete `axe-playwright`) en 3/4 specs — clase sistemática de conocimiento —, XPath parent-axis + CSS selector + bypass del POM (TC-002; el XPath sobrevivió a una ronda de corrección), locator crudo fuera del POM (TC-004). Además: **2/4 writers se detuvieron a mitad de protocolo** sin leer el veredicto del Reviewer (necesitaron re-invocación del orquestador — la clase `unknown verdict` de F4, agravada); 1 defecto que el Reviewer aprobó tras 2 iteraciones de churn (scan AxeBuilder ANTES del goto en TC-004) fue cazado por la **red determinística 11.c/verify-a11y** → primera invocación real del rescate `ia4d-a11y-injector` (funcionó: fix quirúrgico, 15,3k tokens); 1 fichero escrito con ruta Windows mal escapada en la raíz del repo. Verificación real 2/4 verdes con las MISMAS clases de fallo que el brazo A. Tokens: 354,6k (+17% pese al modelo barato: churn de iteraciones + 2 resumes); **10 invocaciones de Reviewer** (Sonnet, ×2,5); ~47,4 min de cómputo sumado (×2,3).
- **Resultado coste (la premisa de C2-1, refutada)**: el ahorro esperado (~$3,5-4, writers ÷3) asumía que el nº de invocaciones no crecía. Medido: el descuento Haiku aplica solo a la porción writer, mientras el ping-pong multiplica la porción Reviewer que sigue a precio Sonnet (4→10 invocaciones ≈ +$1,8 con la calibración de $0,3/invocación), añade un rescate, 2 turnos extra del orquestador y duplica el wall-clock de los Actos 4-5. Neto: **neutro en el mejor caso, peor con los costes de orquestación** — la contención se come el descuento entero.
- **Resultado calidad**: la verificación final quedó en paridad (2/4, mismas clases pre-existentes del discovery, no atribuibles al modelo) — **la red Reviewer Sonnet + pre-review determinístico + rescate a11y SÍ contiene al Writer barato**, y ese diseño queda validado con dato. Pero los criterios de no-degradación del plan se violan igualmente: approved-rate a iteración ≤1 cayó de 4/4 a 2/4 y los must-fix se inflaron de 0 a 9.
- **Decisión (criterio del plan aplicado)**: **Writer Haiku DESCARTADO** — como R6, no por el resultado final sino porque la hipótesis de ahorro es falsa y el proceso degrada (más iteraciones, protocolo poco fiable, más lento). `ia4d-writer.md` conserva `model: sonnet`; tabla de modelos de CLAUDE.md/SPEC y ficha del catálogo, sin cambios. **Seguimiento anotado, no reabre la fase**: 3 de los 9 must-fix son una única clase sistemática (API de axe) mitigable endureciendo el prompt del Writer con el patrón de import correcto; las demás clases (XPath, bypass POM, protocolo no cerrado) no tienen mitigación barata. **F7 (main Haiku) queda condicional al apetito del QA** — F6 cerró con dato, que era su prerequisito; el dato de F6 (Haiku falla en disciplina de protocolo multi-paso) es señal desfavorable para ponerle el juicio del orquestador (guarda 6.5, checkpoint, diagnóstico).
