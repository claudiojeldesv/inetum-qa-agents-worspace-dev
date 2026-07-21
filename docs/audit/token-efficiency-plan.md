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
4. **A/B obligatorio antes de adoptar**: mismo baseline dos veces — reviewer per-spec (estado Fase 2) vs de lote — comparando verdicts, nº de must-fix detectados y verdes a la primera. Si el de lote detecta menos must-fix reales o aprueba algo que el per-spec rechazaba, **se descarta y se documenta**: el informe ya establece que es la única recomendación con riesgo sobre el argumento de venta.
5. Si se adopta: actualizar regla dura #8 en CLAUDE.md/SPEC (matiz, no eliminación: "Writer + Reviewer obligatorios; el Reviewer audita por lote con pre-review determinístico por spec"), `composition-rules.md` y `writer-reviewer-protocol.md`.

**Criterio de salida**: decisión documentada (adoptado con A/B verde, o descartado con el dato). Ambos desenlaces cierran la fase.

**Commit**: `perf(qa-automator): fase 3 token-efficiency — pre-review determinístico + reviewer de lote (A/B: <resultado>)` o `docs(qa-automator): fase 3 — reviewer de lote descartado por A/B`

---

## Fuera de plan (explícito)

- **R7** (orquestación en script `run-s4.ts`): se decide DESPUÉS de ver el ahorro real de Fases 1-2. Techo ~$3-4/run; coste en legibilidad ante I+D.
- **Dom-walker / port copilot-edition**: fuera de scope por decisión de entrevista (carril propio).
- **Writer a Haiku, tocar compliance sin override, encender Judge**: descartados en el informe (R8).
- **Hueco de specs stale** (`tests/e2e/<site-id>/` no se limpia): tarea aparte ya flaggeada, no bloquea; el protocolo de medición lo neutraliza borrando el namespace antes de cada baseline.

## Prerequisito antes de Fase 1

Commitear en `design/token-efficiency` el estado actual: informe, este plan, `src/scripts/parse-usage.mjs`, y la evidencia del baseline que se quiera versionar (specs generados y test-plans del run instrumentado, o descartarlos — decisión al abrir la sesión de Fase 1). Un working tree limpio por fase es lo que hizo reversible la reorganización.

## Resultados

| Fase | Fecha | $ run | Δ vs anterior | Subagents | API calls main | Approved | Verdes 1ª | Notas |
|---|---|---|---|---|---|---|---|---|
| Baseline (auditoría) | 2026-07-21 | 12,4 | — | 18 | 91 | 5/5 | 4/5 | Incluye ~10-15% de inflado por interrupciones |
| Fase 1 | | | | | | | | |
| Fase 2 | | | | | | | | |
| Fase 3 | | | | | | | | |
