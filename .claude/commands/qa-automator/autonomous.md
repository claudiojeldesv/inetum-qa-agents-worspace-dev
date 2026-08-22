---
description: Módulo S4 — generación autónoma de tests E2E desde una URL. Orquesta los 5 actos del marco QA propio. Funcional en MVP v0.1.
argument-hint: "--url=<URL> [--style=<contract.yaml>] [--flows=a,b] [--negatives=flujo1,flujo2] [--entry=/path] [--ignore=x,y] [--max-scenarios=N]"
---

# /ia4d-qa-automator:autonomous

> **Pre-check (workspace).** Si no existen `config/allowed-targets.yaml` y `playwright.config.ts` en el directorio actual, NO sigas: indica al usuario que ejecute `/ia4d-qa-automator:init <carpeta>` y detente.

> ## PRESUPUESTO DE TURNOS (no negociable — es el 74% del coste del run)
>
> Medido el 2026-08-20: de $70 de un run, **$52 fueron el orquestador**, con 67,9M de tokens
> de caché releída. Tu coste no es lo que piensas: es `turnos × contexto acumulado`. Cada
> turno relee TODO lo anterior, así que un turno que no decide nada no es gratis — es el
> contexto entero otra vez.
>
> **1. PROHIBIDO SONDEAR EN BUCLE.** Lanza el subagente, **termina tu turno** y actúa cuando
> llegue su notificación. Nada de «espero», «sigo esperando», «aún sin cambios»: en el run 3
> hubo ~15-20 de esos turnos y **ninguno produjo una decisión**. Si de verdad sospechas que un
> subagente murió sin notificar (pasó una vez: una re-review se cortó en un cambio de sesión),
> permitido **UN latido cada ~5 min**, nunca un bucle. Excepción explícita:
> `<workDir>/walk/assist-pending.json` cuando hay un panel esperando a una persona — ese
> fichero existe justo para eso.
>
> **2. EL RETORNO DEL SUBAGENTE ES UN ACUSE, NO UNA FUENTE — Y SE VERIFICA.** Los `ia4d-*`
> devuelven `{ok, files, verdict, note}`. La verdad está en el fichero que escribieron.
> **No le pidas a un subagente que te resuma lo que hizo** ni lo reinvoques para preguntarle:
> abre su fichero. Y **antes de darlo por hecho, comprueba el acuse contra el disco**:
>
> ```
> npx tsx src/scripts/verify-ack.ts --files=<los files del acuse, separados por comas> --label=<agente-TC>
> ```
>
> Exit 2 = el acuse **miente** (algo declarado no existe o está vacío): reanuda al subagente con
> el hecho —«declaraste X, no existe»— y exígele Read-after-Write; no lo reintentes a ciegas ni
> escribas tú el fichero. Medido el 2026-08-21 (D28): un Writer devolvió `{"ok":true}` sobre un
> fichero que no existía en ningún sitio y sin entrada en el audit; salió tres actos más tarde y
> costó una reanudación (~$7) y ~4 turnos. **El acuse compacto ahorra contexto solo si se
> verifica**: el check cuesta un subproceso y cero tokens de LLM. Agrúpalo con el resto de
> comandos deterministas del punto 4.
>
> **3. NO RELEAS.** Un fichero leído se queda en tu contexto para siempre y se relee en cada
> turno posterior. Lee `criteria.json`, el `dom-map` o el audit-log **una vez**, quédate con la
> conclusión, y no vuelvas salvo que algo lo haya reescrito. Si necesitas un dato puntual de un
> JSON grande, extráelo con `node -e` en vez de volcarlo entero.
>
> **4. AGRUPA LOS COMANDOS DETERMINISTAS.** Varios pasos de shell consecutivos sin decisión en
> medio van en UNA llamada (`&&` / `;`), no en cuatro turnos. Los gates ask-first y las
> invocaciones LLM sí llevan turno propio: ahí el turno se paga porque hay juicio.
>
> **5. MARCA CADA `Task` AL LANZARLO Y AL RECOGERLO.** Justo antes de invocar un subagente y
> justo después de su acuse:
>
> ```
> npx tsx src/scripts/audit-mark.ts --task-start=<label>    # antes del Task
> npx tsx src/scripts/audit-mark.ts --task-end=<label> --result=pass   # tras el acuse
> ```
>
> No es burocracia: el audit-log solo se escribe cuando alguien toca un fichero, así que un hueco
> de 14 min entre dos entradas es **indistinguible** de un orquestador ocioso y de un subagente
> trabajando. Sin estas marcas, `run-cost` los cuenta todos como espera y publicó un «95,5% del
> activo en esperas» que hubo que retirar —el hueco mayor era un Writer produciendo—. Con ellas,
> el reloj se atribuye a quien lo consumió y sale gratis el tiempo por subagente. Agrupa la marca
> de inicio con los comandos deterministas que ya ibas a lanzar (punto 4): no gasta un turno.
> **Y usa este script en vez de teclear el JSON del audit a mano**, aquí y en cada «registra al
> audit-log» de este command: en el run 3 el orquestador se inventó nombres de campo escribiendo
> a mano y el consumidor de `heal` lo cazó con `reds: []`.


Módulo **S4 Autonomous**: de una URL (+ Style Contract opcional) a specs Playwright, en 5 actos (Comprender → Mapear → Estructurar → Materializar → Juzgar). Lo mecánico lo encadena `src/scripts/run-s4-mecanico.ts` (determinístico, Fase 4 token-efficiency) en 5 stages; tú conservas el juicio: brief, pausas ask-first, invocación de subagents, decisión del checkpoint y el reporte final. **Convención de los stages**: exit 0 = continúa con el `next` del JSON · exit 2 = aborta · exit 3 = el JSON trae `pending` → PAUSA ask-first y re-invoca el mismo stage con la respuesta del QA. Detalle operativo (warning verbatim, casuística planner) en `docs/references/autonomous-operations.md` — léelo solo cuando un paso te remita a él.

## Arguments

- `--url=<URL>` (obligatorio): debe estar en `config/allowed-targets.yaml`.
- `--style=<path>` (default `config/style-contracts/saucedemo.yaml`).
- `--output-dir=<path>` (default `tests/e2e/<site-id>`).
- `--flows=<a,b,c>`: flujos a cubrir; acota el planner.
- `--negatives=<f1,f2>`: override por-run de qué flujos añaden negativos (slugs español); sin él manda `test_design.coverage.negatives_by_flow` del contract. El principal se genera siempre; negativos = opt-in.
- `--entry=<ruta|url>` (default `--url`): punto de entrada de la exploración.
- `--ignore=<x,y>`: zonas a NO explorar.
- `--max-scenarios=<N>` (default 8): tope a materializar; superado → checkpoint 2.5.

## Acto 1 — Comprender (setup)

1. `npx tsx src/scripts/run-s4-mecanico.ts setup <flags del run tal cual>` — en UNA llamada: módulo (S4), compliance determinístico **sin override** (verdict a `.work/compliance-verdict.json`; el hook PreToolUse sigue activo de segunda barrera), brief 5.b y namespace+limpieza 5.c (efímero a `<workDir>=.work/<site-id>`, tc-registry intacto).
   - Exit 2 → aborta con la razón del verdict, exit 2.
   - `pending:"compliance-warn"` → muestra el warning al QA; si acepta, re-invoca con `--warn-acknowledged`.
   - `pending:"exploration-brief"` → muestra el WARNING de modo ciego (§1) y pide los módulos. Flujos → re-invoca con `--flows=…`. Respuesta EXACTA `EXPLORAR SIN ACOTAR` → `--blind-acknowledged`. Otra cosa o silencio → repite o aborta exit 2. **Nunca** modo ciego sin esa confirmación.
   - Exit 0 → el JSON trae `site_id`, `work_dir` y `dirs`: usa ESAS rutas namespaciadas en todos los prompts a subagents.

## Acto 2 — Mapear

2. **Planner POR FLUJO, secuencial, NUNCA en paralelo** (comparten navegador MCP — §4).
   - **Dirigido**: por cada flujo, invoca `playwright-test-planner` via Task con:
     `Mapea contra el DOM de <url> SOLO el flujo "<flow>". Punto de entrada: <entry>. NO explores otros flujos ni <ignore>. Mapea el flujo principal (el camino esperado que cumple el propósito); no exhaustivo. Si <flow> está en <flujos-con-negativos>, recorre además una vez el camino de error/validación para capturar los locators del estado de error. Documenta atributos/clases/mensajes de estados condicionales (error, validación, vacío) SOLO si navegaste ese estado en esta sesión; lo no navegado márcalo explícitamente como "no verificado", nunca como observación de hecho. Guarda con planner_save_plan en fileName="docs/test-plans/<site-id>/<flow>.plan.md".`
     Tras cada planner, juzga su RESPUESTA (¿reporta tools de navegador — `browser_navigate`, `browser_snapshot`…— y locators/URLs concretos del sitio real?) sin releer el fragmento.
   - **Ciego**: un único planner completo → `docs/test-plans/<site-id>/<site-id>.plan.md`.

**2.5 — Guarda anti-fabricación (NO negociable).** Tras el último flujo: `npx tsx src/scripts/run-s4-mecanico.ts check-fragments --style=<--style> --flows=<a,b,c>` (ciego: `--plan=<file>`) verifica existencia/estructura/evidencia concreta de TODOS los fragmentos y lo registra al audit-log. El juicio "¿navegó de verdad?" sigue siendo tuyo sobre la respuesta del planner; el script aporta la parte mecánica.

- `failed_flows` (o tu juicio dice fabricado, o cuelgue cortado por el QA) → reintenta UNA vez ese flujo y re-verifica con `--flows=<flow>`.
- Sigue fallando → **PAUSA** (ask-first): 1) marcar no-mapeado (→ `unmapped_flows` del drift; el run sigue), 2) rescate MCP directo por el orquestador (§4), 3) abortar (exit 2). Registra la elección (`rule:'planner-flow-recovery'`).
- Un flujo fallido no contamina a los demás. **Nunca** pases al discovery-analyzer un fragmento que no pasó la guarda.

3. Invoca `ia4d-discovery-analyzer` con `--planner-saved-plan=docs/test-plans/<site-id>/` (directorio de fragmentos), `--output=<workDir>/discovery-report.json` y los **negativos efectivos** (override del brief o contract). Output: `inferred_domain` + `scenarios_catalog[]`. El analyzer NO asigna IDs.

## Actos 2.5 + 3 — Checkpoint + Estructurar (una llamada)

4. `npx tsx src/scripts/run-s4-mecanico.ts checkpoint --style=<--style> --url=<--url> --max-scenarios=<N>` — primero corre la **guarda determinística de locators** (`verify-locators.ts`: resuelve cada locator del discovery contra el DOM real y anota `verified`/`unverified` in-place; summary en `<workDir>/locator-verify.json`), luego aplica el cap, resuelve IDs estables contra el tc-registry (reusa por slug o alias; slug nuevo → **reconciliación de drift** con candidato único mismo feature+naturaleza+destino, ambiguo → `TC-NNN` correlativo nuevo; **nunca** keys de gestor inventados), reescribe el registro, **archiva post-selección** los specs del namespace fuera de la selección actual (+ specs pre-namespace sueltos en la raíz de `tests/e2e/`) a `_archive/` — no los borra, y persiste `<workDir>/selection.json` (con `tc_id`, `suite_tags`, `spec_path`, `screens` y `owned_poms` por escenario, `pom_ownership` global, drop auditado) y scaffoldea el POM determinístico (BasePage + `*.page.ts` + components, toggles del contract; los locators unverified quedan marcados en el POM). El bloque `identity` del output (reconciliados, empates `ambiguous`, archivados) va al reporte final al QA.
   - `pending:"checkpoint-selection"` (count > max) → **PAUSA**: muestra la `table` del JSON tal cual y pide lista de `#` (tags editables `3:@regression,@negative`), `TOP` o `TODOS`. Re-invoca con `--select=<respuesta literal>`. Ambiguo o silencio → no generes.
   - Exit 0 → continúa con los seleccionados de `selection.json`. Los NO seleccionados no se materializan ni registran (es la rienda, no un fallo).

## Acto 4 — Materializar

**4.b — Auth setup** (solo si `auth.enabled: true` en el contract): invoca `ia4d-writer` para `tests/e2e/<site-id>/auth.setup.ts` — `setup('authenticate', ...)` (`import { test as setup } from '@playwright/test'`) que navega a `auth.login_path`, usa `synthetic_fixtures.credentials[auth.credentials_ref]`, verifica `auth.success_signal` y persiste `storageState({ path: <auth.storage_state> })`. **Sin** AxeBuilder (es setup). Registra al audit-log (`rule:'auth-handler'`).

5. Por cada entrada de `selection.json` (**Writers escalonados, warm-cache**: lanza el PRIMERO solo y espera a que complete; los restantes en paralelo. Si 4.b corrió, la caché ya está caliente: todos en paralelo. **SIEMPRE FOREGROUND** — ver hard rules): invoca `ia4d-writer` via Task con `--plan-entry`, `--style-contract`, `--pom-skeleton-dir=tests/pages/<site-id>`, `--output=<spec_path>`, `--discovery-report=<workDir>/discovery-report.json`, `--tc-id=<tc_id>`, `--tags=<suite_tags>` y (si `selection.pom_ownership` no es `null`) `--owned-poms=<owned_poms del escenario, csv>`. **El prompt lleva RUTAS, nunca contenido inline.** El Writer invoca internamente al Reviewer (N≤2). El hook PostToolUse `pii-post.ts` corre solo.
6. (Opcional) `ia4d-style-enforcer` por spec.
7. `npx tsx src/scripts/run-s4-mecanico.ts post-writers --style=<--style>` — en UNA llamada: a11y determinística (paso 11: scan AxeBuilder tras el goto en cada `test()`, modo según `a11y.fail_on_violations`; el scan es no-opcional), consolidación anti-race del feedback (11.b) y pre-review determinístico (11.c, red objetiva post-review — informa, no bloquea).
   - Exit 1 → invoca `ia4d-a11y-injector` (rescate) SOLO por spec de `failed_specs` y re-invoca post-writers.
   - `pre_review.must_fix > 0` → algo se le escapó al Reviewer: repórtalo al QA en el summary (no es gate, no abortes).

## Acto 5 — Juzgar + Verificación

8. **Judge off por defecto**: solo con `QA_ENABLE_JUDGE` seteado (`1`/`true`/`on`) invoca `ia4d-judge` por spec con el feedback consolidado y persiste los scores en `<workDir>/judge-report.json` ANTES del paso 9. Si no está seteado, el stage `verify` registra el skip solo.
9. `npx tsx src/scripts/run-s4-mecanico.ts verify --style=<--style> --url=<--url>` — borra `seed.spec.ts` si existe, ejecuta `npx playwright test tests/e2e/<site-id>/` con las env-vars correctas (baseURL, evidence del contract, storageState si hay auth — las setea el script, no las prefijes tú), parsea el veredicto por-test y ensambla `<workDir>/qa-automator-run-summary.json`.
10. (Solo si el Judge corrió) >30% de scores < 0.5 → pausa ask-first.
11. **Sanación (off por defecto, regla #10)**: si hay rojos Y el contract declara `healing.enabled: true`, encadena el procedimiento de `/ia4d-qa-automator:heal` (su doc manda: `run-heal-mecanico setup` → Healer por rojo secuencial foreground → Reviewer post-heal → `run-heal-mecanico verify`; el Healer NO es juez). Sin el knob (default) NO sanes: reporta los rojos y termina — el QA decide (/heal o ajuste manual).
12. **Reporta al QA**: verdes/rojos con su causa, must-fix del pre-review si los hay, `healed[]` si la sanación corrió, ruta del summary.

**17.b — El coste del run, calculado (no teclado).** Cierra SIEMPRE con:

```sh
QA_WORK_DIR=<workDir> npx tsx src/scripts/run-cost.ts
```

Lee el audit-log, escribe `<workDir>/run-cost.json` y **funde el bloque `cost` en el
run-summary por código**. Enseña al QA las tres cifras: **tiempo activo** (reloj menos las
pausas humanas), **esperas del orquestador** con su % sobre el activo, y el desglose de tokens.

No lo escribas tú a mano. Existe porque tras tres runs de campo «¿cuánto costó?» solo se podía
responder reconstruyéndolo desde un transcript, y porque en el run 3 el run-summary escrito a
mano llevaba nombres de campo inventados que el consumidor de `heal` cazó con `reds: []`. Una
sección calculable no se le pide a un LLM.

Las **esperas** son el hallazgo que este informe pone arriba solo: en el run 3 fueron el 80% del
tiempo activo. Si sale una espera grande tras invocar un subagente, es D13; si sale un corte
seco, mira si fue el tope de la tool (D23).


## Outputs

`docs/test-plans/<site-id>/*.plan.md` (versionados) · `<workDir>/{discovery-report,selection,review-feedback,a11y-verify,judge-report,audit-log,qa-automator-run-summary}.json` · `tests/pages/<site-id>/*.page.ts` + `tests/components/<site-id>/*.component.ts` · `tests/e2e/<site-id>/<id>_<feature>.<condicion>.spec.ts` · `config/tc-registry/<site-id>.json` (durable).

## Hard rules

- Cada invocación de subagent registra al audit-log; los stages del script registran lo suyo solos.
- Acto 1 (compliance) no se salta. Sin override.
- Namespace por sitio: efímero bajo `<workDir>`, specs/POM per-site, test filtrado por dir. Limpieza al arrancar sin tocar el tc-registry (lo hace `setup`).
- Planner por-flujo secuencial + guarda 2.5 (juicio tuyo + `check-fragments` mecánico); fallo tras reintento → PAUSA, decide el QA. Sin discovery real no hay generación.
- Modo ciego solo con `EXPLORAR SIN ACOTAR` exacto. El warning no se silencia.
- El cap no se salta en silencio; ignorarlo requiere `TODOS` explícito ("no silent caps").
- Writer+Reviewer (N≤2) obligatorios. Judge opcional off por defecto; su omisión se registra.
- IDs estables: reusa por slug/alias, reconcilia el drift de naming solo con candidato único (ambiguo → ID nuevo reportado, nunca se adivina), `TC-NNN` si es nuevo, nunca keys de gestor inventados. Naturaleza solo en el tag `@negative`, jamás en nombre/título.
- Specs fuera de la selección actual → `tests/e2e/<site-id>/_archive/` (auditado, nunca borrado — pueden llevar ediciones del QA). `_archive/` no corre (testIgnore) ni compila (tsc exclude).
- Negativos opt-in; criticidad inferida por el discovery-analyzer según propósito.
- **Task prompts a subagents llevan rutas, nunca payload inline.**
- Writers en Acto 4: primero UNO (escribe la caché del prefijo compartido), el resto en paralelo.
- **Writers SIEMPRE en foreground: pasa `run_in_background: false` EXPLÍCITO en cada Task/Agent** (en algunos harness el default es background — el default NO es seguro). PROHIBIDO background y PROHIBIDO ScheduleWakeup para esperar subagents: el patrón background mata el turno del orquestador antes de post-writers/verify (F2, Q1, Q2) y cada corte paga re-priming de caché. Paralelo ≠ background: varios Task síncronos en un mismo mensaje sí; Task en background no.
- Guarda de locators (Q2): el checkpoint anota el discovery contra el DOM real; un locator `verified:false` está prohibido para el Writer sin TODO o evidencia de estado del plan. Serializar Writers como mitigación de la race de POMs está PROHIBIDO (el ownership de `selection.json` es la mitigación).
- Sanación off por defecto (`healing.enabled` del contract, regla #10): sin el knob el run reporta rojos y termina — el Healer NUNCA corre en silencio. Con el knob, la sanación usa el protocolo post-heal completo de `/ia4d-qa-automator:heal` y queda en `healed[]` + audit-log.
- Gobernanza de modelo: el run se lanza con `--model sonnet`. **Nunca** `CLAUDE_CODE_SUBAGENT_MODEL` — pisa el frontmatter de TODOS los subagents y anula el tiering Sonnet/Haiku.
- Los stages con `pending` son pausas ask-first REALES: nunca inventes la respuesta del QA ni re-invoques con una selección/confirmación que no te dieron.

## Reference

- `docs/references/autonomous-operations.md` — §1 warning 5.b, §3 evidencia/shell (equivalentes manuales de `verify`), §4 casuística planner.
- `docs/references/composition-rules.md`
- `src/scripts/run-s4-mecanico.ts` — cabecera del script: contrato de stages y exit codes.
