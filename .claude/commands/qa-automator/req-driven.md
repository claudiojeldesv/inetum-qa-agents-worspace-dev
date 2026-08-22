---
description: Módulo S2 — Req-driven. Genera tests E2E desde un .feature Gherkin maduro + URL de staging, con trazabilidad RF-NNN, parameterización (Scenario Outline) y detección de drift spec↔implementación. Funcional desde v0.2 Fase E.
argument-hint: "--gherkin=<path> --url=<URL> [--style=<contract.yaml>]"
---

# /ia4d-qa-automator:req-driven

> **Pre-check (workspace).** Este comando corre DENTRO de un workspace desplegado del agente. Antes de continuar, verifica que en el directorio actual existen `config/allowed-targets.yaml` y `playwright.config.ts`. Si falta alguno, NO sigas: indica al usuario que ejecute `/ia4d-qa-automator:init <carpeta>` (o abra su workspace ya desplegado) y detente.

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


Módulo **S2 Req-driven** del agente `ia4d-qa-automator`. Entrada = **Gherkin `.feature` maduro + URL
de staging**. El `.feature` da el *qué* (criterios RF-NNN ya estructurados por el autor, con
`Given/When/Then` explícito); la URL da el *cómo* (DOM real, locators, run verde). Reusa el motor
S4/S3 validado (discovery, POM scaffolder, Writer↔Reviewer↔Judge, los 3 componentes de Fase C); las
únicas piezas propias de S2 son la ingestión del `.feature` (`ia4d-spec-parser`, determinístico),
el planner en modo **mapear-contra-DOM** y el **diff de drift** — los mismos que S3.

Diferencia con S3 (Spec-refiner): S2 **no refina**. Asume Gherkin limpio. El `Then` es explícito,
así que no hay ambigüedad que escalar — un Scenario **sin** `Then` no se rellena, se reporta y se
enruta a `/ia4d-qa-automator:spec-refiner` (S3). Diferencia con S4: trazabilidad real (`@criterion` cita
RF-NNN + `source_ref` del `.feature`) y detección de drift.

Valor extra sobre S3: **parameterización**. Un `Scenario Outline` + `Examples` se materializa como
un test data-driven (un caso por fila), citando el mismo RF-NNN.

## Arguments

- `--gherkin=<path>` (obligatorio): archivo `.feature` Gherkin.
- `--url=<URL>` (obligatorio): URL de staging, debe estar en `config/allowed-targets.yaml`. Sin
  target no hay DOM, locators ni run verde.
- `--style=<path>` (opcional, default: el contract del sitio si existe, p.ej. `config/style-contracts/parabank.yaml`).
- `--output-dir=<path>` (opcional, default: `tests/e2e/<site-id>`, namespaced por sitio).
- `--criteria-dir=<path>` (opcional, default: `.work/<site-id>` = `<workDir>`): dónde el parser escribe
  `criteria.json` + `refinement-questions.md`.
- `--openapi=<path>`: **diferido a v0.4**. Si se pasa, el command informa y aborta (los tests de API
  necesitan un `ia4d-api-test-writer` que no existe aún; no comparten el motor DOM-céntrico).

## Procedure (los 5 actos)

### Acto 1 — Comprender

1. Resuelve el módulo (determinístico, no LLM): ejecuta `npx tsx src/scripts/resolve-mode.ts` con los flags recibidos tal cual.
2. Confirma en el JSON `module: "S2", status: "functional"`. Si `--openapi` sin `--gherkin` → `stub`, aborta con su `user_message` (deferral v0.4). Si `--gherkin` sin `--url` → `needs_input`, aborta: S2 exige URL de staging (sin target no hay run verde).
3. Gate de compliance (determinístico, no LLM — **sin override**): ejecuta `npx tsx src/scripts/check-compliance.ts <--url>`. Escribe `.work/compliance-verdict.json` y registra al audit-log.
   - Exit 2 (`block`) → aborta (exit 2). `warn` → muestra y pregunta (ask-first).

**1.a — Namespace por sitio + limpieza (PRIMERO, antes de la ingesta, NO negociable):** deriva `<site-id>`
del basename del `--style`; define `<workDir>=.work/<site-id>` (todos los artefactos efímeros ahí,
**incluido `criteria.json`**) y los dirs `tests/{e2e,pages,components}/<site-id>/`; **limpia `<workDir>/`
al arrancar** (no toca `config/tc-registry/<site-id>.json`); **exporta `QA_WORK_DIR=<workDir>`** en el run.
Pasa rutas namespaciadas a los subagentes. La limpieza corre **antes** de que el parser escriba, para no
borrar el `criteria.json` recién generado. Runs de sitios distintos no se contaminan.

**1.b — Ingestión del `.feature`** (sustituye al brief manual de S4):
4. Invoca `ia4d-spec-parser` via Task tool:
   ```
   --gherkin=<--gherkin> --target-url=<--url>
   --output=<criteria-dir>/criteria.json
   --questions-output=<criteria-dir>/refinement-questions.md
   ```
5. Lee `criteria.json`. De él salen: los criterios RF-NNN y el **brief** (`brief.flows`,
   `brief.entry`, `brief.ignore`) que en S4 teclea el QA.
6. **Gate de open_questions (ask-first, no override).** Un `.feature` maduro no debería disparar
   ninguno. Si algún Scenario llegó **sin `Then`**, el parser lo marcó (`then: [AMBIGUO ...]`,
   `open_questions` no vacío). Muéstralos al QA (resumen de `refinement-questions.md`) y avisa:
   esos criterios **NO se generan**. Sugiere refinar el `.feature` (añadir el `Then`) o enrutar el
   caso por `/ia4d-qa-automator:spec-refiner` (S3). No se fabrica el resultado esperado.
7. Registra al audit-log: `{ source: 'command', action: 'feature_ingested', metadata: { criteria_count, blocked_count, flows } }`.

### Acto 2 — Mapear (modo mapear-contra-DOM, no descubrir)

**7.b — EL WALK DETERMINISTA VA PRIMERO (K0.42), igual que en S3.** Mismo argumento y con una
ventaja: aquí el Gherkin ya está estructurado, así que el guion no depende de interpretar prosa.

Salta este paso si el contract trae `walker.enabled: false` o si no hay `walk-script.json`.

Cuando exista el guion, el orden es idéntico a S3 (ver `spec-refiner.md`, pasos 7.b a 7.d): correr
`copilot/src/dom-walker.ts`, emitir specs de lo verificado con `copilot/src/walk-to-spec.ts`, y
dejar al planner y al Writer **solo la cola**, con el motivo de cada encolado.

> **Hueco declarado, no disimulado.** `src/gherkin-to-criteria.ts` emite hoy `criteria.json` y **no
> emite el guion**. Hasta que lo haga, S2 va por el planner como siempre. El emisor es trabajo
> determinístico (un `.feature` maduro ya trae los pasos), no una interpretación, y por eso NO se
> resuelve pidiéndoselo a un LLM: eso metería fabricación en el único módulo que hoy no la tiene.

8. **Mapeo PLANNER POR FLUJO (secuencial, no monolítico) — SOLO sobre los flujos de la cola.** El planner nativo se cuelga si se le pide
   mapear muchos flujos de una vez (hallazgo: ~1h colgado con 6 flujos). Invócalo **un flujo por vez**,
   secuencial — **nunca en paralelo** (comparten el navegador del MCP). No hay timeout programático
   sobre un subagente Task: **acotar a un flujo es la mitigación**. Para **cada** `<flow>` de
   `brief.flows`, invoca `playwright-test-planner` (nativo) via Task tool, prompt en **modo mapear**:
   ```
   Mapea contra el DOM de <url> SOLO el flujo "<flow>" del .feature.
   Punto de entrada: <brief.entry>. NO explores otros flujos ni <brief.ignore>.
   Localiza las pantallas y elementos que realizan <flow> en el DOM real.
   Si <flow> NO existe en el DOM (ruta/pantalla ausente), repórtalo como NO MAPEADO —
   NO inventes pasos ni pantallas para que parezca cubierto.
   Guarda con planner_save_plan en fileName="docs/test-plans/<site-id>/<flow>.plan.md".
   ```
   Tras cada flujo, aplica la **guarda 8.5 por-flujo** sobre su fragmento.

   **8.5 — Guarda anti-fabricación POR FLUJO (NO negociable)**: el planner necesita el MCP
   `playwright-test`. Si está caído, se queda sin tools de navegador y puede **fabricar** un plan
   adivinado o **colgarse**. Tras el planner de cada flujo, verifica sobre su fragmento
   `docs/test-plans/<site-id>/<flow>.plan.md`: (a) existe (se llamó `planner_save_plan`); (b) el planner
   reporta uso de tools de navegador (`browser_navigate`/`browser_snapshot`), no solo `Read/Grep/Glob`;
   (c) trae locators/URLs concretos, no genéricos.
   - Si falla (o el planner se cuelga y el QA lo corta) → **reintenta UNA vez** ese flujo solo.
   - Si tras el reintento sigue fallando → **PAUSA y pregunta al QA**: (1) marcar el flujo como
     no-mapeado (va a `unmapped_flows`, el run sigue con el resto); (2) rescate con MCP directo por el
     orquestador (aviso: consume contexto); (3) abortar (exit 2). Registra al audit-log
     `{ source: 'command', action: 'warn'|'block', rule: 'planner-flow-recovery', metadata: { flow, choice } }`.
   - Un flujo fallido **no contamina a los demás**. Nunca pases al discovery-analyzer un fragmento que no
     navegó de verdad — sin discovery real no hay mapeo fiable contra los criterios.
9. Invoca `ia4d-discovery-analyzer` con `--planner-saved-plan=docs/test-plans/<site-id>/` (directorio de fragmentos), `--output=<workDir>/discovery-report.json` **y `--criteria=<criteria-dir>/criteria.json`** (activa el S3 mode, idéntico):
   - Output: `<workDir>/discovery-report.json` con el bloque `criteria_mapping` (`mapped` rf↔scenario, `unmapped_flows`).

**9.b — Diff de drift (determinístico, en el command — no LLM):**
10. Calcula `drift = brief.flows − {flows en criteria_mapping.mapped}`. Cruza con `criteria.json` para
    anotar el RF de cada flujo en drift. Escribe `<workDir>/drift-report.json`:
    ```json
    { "target_url": "<url>", "source_spec": "<--gherkin>",
      "drift": [ { "rf": "RF-004", "flow": "close-account",
                   "source_ref": "parabank.feature:33 (REQ-CLOSE)",
                   "reason": "declarado en el .feature, no mapeado en staging" } ],
      "covered": [ { "rf": "RF-001", "flow": "login", "scenario": "inicio-sesion.usuario-valido" } ] }
    ```
    El drift se **reporta**, no se fabrica. Registra al audit-log: `{ source: 'command', action: 'drift_detected', metadata: { drift_count, rfs } }`.

### Acto 3 — Estructurar

**10.b — Guarda determinística de locators (Q2):** `npx tsx src/scripts/verify-locators.ts --report=<workDir>/discovery-report.json --url=<--url> --style-contract=<--style>` — resuelve cada locator del discovery contra el DOM real y anota `verified`/`unverified` in-place (summary en `<workDir>/locator-verify.json`). Un locator `verified:false` queda prohibido para el Writer sin TODO o evidencia de estado del plan.

11. Ejecuta el POM scaffolder sobre `<workDir>/discovery-report.json` **ya anotado** (igual que S4/S3), namespaciado por sitio:
    ```sh
    npx tsx src/scripts/scaffold-poms.ts <workDir>/discovery-report.json tests/pages/<site-id> tests/components/<site-id>
    ```
    (Si necesitas inline y el `-e` falla en win32 —hallazgo Fase B #14— usa un `.mjs` en `<workDir>/`.)

### Acto 4 — Materializar

**11.b — Auth setup** (solo si el contract tiene `auth.enabled: true`): idéntico a S4 (ver
`autonomous.md` Acto 4 paso 8.b). Genera `auth.setup.ts`.

12. Para cada `scenario` en `discovery-report.scenarios_recommended` **cuyo RF NO esté bloqueado por
    open_questions y NO esté en drift** (escalonado, warm-cache: el primer Writer solo — o el auth
    setup 11.b si corrió —, el resto en paralelo; **SIEMPRE FOREGROUND, PROHIBIDO `run_in_background`** —
    el patrón background mata el turno del orquestador y paga re-priming, hallazgo F2/Q1):
    - **Construye el `--output`** bajo `tests/e2e/<site-id>/<id>_<feature>.<condicion>.spec.ts` (ID estable del registro). Invoca `ia4d-writer` via Task tool con `--plan-entry`, `--style-contract`, `--pom-skeleton-dir=tests/pages/<site-id>`,
      `--output` (el construido), `--discovery-report=<workDir>/discovery-report.json` **y `--criteria=<criteria-dir>/criteria.json`** (activa el S3
      mode: `@criterion` cita RF-NNN + source_ref; usa given/when/then del criterio).
    - **Parameterización**: si el criterio del RF trae un bloque `examples` (venido de un `Scenario
      Outline`), el Writer materializa un test data-driven (un caso por fila), todos citando el mismo
      RF-NNN. Ver `ia4d-writer` "S3 mode → parameterización".
    - El Writer escribe el `.spec.ts` e invoca al Reviewer (ping-pong N≤2). Pasa por el hook `pii-post.ts`.
13. (Opcional) `ia4d-style-enforcer` por cada `.spec.ts`.
14. (Obligatorio) Verificación a11y **determinística**: `npx tsx src/scripts/verify-a11y.ts
    tests/e2e/<site-id>/ --style-contract=<--style>` (scan siempre; gate por
    `a11y.fail_on_violations`, **default `false`** → modo warning; reactivable por-sitio con
    `true`). Exit 1 → `ia4d-a11y-injector` (rescate) solo para los `failed_specs`, y re-verifica.
    Igual que S4 (ver `autonomous.md` paso 11).

**14.b — Consolidar feedback (determinístico, no LLM):** el Reviewer escribió un fichero por spec en
`<workDir>/review-feedback/<spec>.json` (sin contención entre writers paralelos). Únelos en el
`<workDir>/review-feedback.json` plano: `QA_WORK_DIR=<workDir> npx tsx src/scripts/consolidate-reviews.ts`.
El Judge y el reporte leen el consolidado. (Evita la race de *append* concurrente que corrompía el fichero.)

### Acto 5 — Juzgar

15. **Judge opcional, off por defecto.** Solo si `QA_ENABLE_JUDGE` está seteado (PowerShell: `$env:QA_ENABLE_JUDGE`; bash: `$QA_ENABLE_JUDGE`)
    invoca `ia4d-judge` por cada `.spec.ts` con el `<workDir>/review-feedback.json` consolidado. Si no, **omite el
    Judge** y registra al audit-log `{ source: 'command', action: 'skip', rule: 'judge', reason: 'judge off (QA_ENABLE_JUDGE unset)' }`.
16. (Solo si el Judge corrió) Lee scores. Si >30% < 0.5 → pausa ask-first.
17. Genera `<workDir>/qa-automator-run-summary.json` con: tests generados (+ su RF), scores (o `judge: skipped`),
    verdicts, axe results, **criterios bloqueados** (Scenarios sin `Then`, si los hubo) y **drift**
    (RF declarados sin cobertura en staging).

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


## Outputs (consolidados)

- `criteria.json` + `refinement-questions.md` (ingestión del `.feature`)
- `<workDir>/drift-report.json` (RF declarados no mapeados en staging; `<workDir>`=`.work/<site-id>`)
- `<workDir>/discovery-report.json` (con `criteria_mapping`)
- `tests/pages/<site-id>/*.page.ts`, `tests/components/<site-id>/*.component.ts`, `tests/e2e/<site-id>/*.spec.ts` (con `@criterion RF-NNN`)
- `<workDir>/review-feedback/<spec>.json` (per-spec, escrito por el Reviewer) → consolidado en `<workDir>/review-feedback.json`; `<workDir>/judge-report.json`, `<workDir>/audit-log.json`
- `<workDir>/qa-automator-run-summary.json`

## Verification step

Idéntico a S4/S3 (`autonomous.md`): ejecuta `npx playwright test tests/e2e/<site-id>/` seteando `QA_WORK_DIR=.work/<site-id>` y `QA_BASE_URL` con `--url`
(y `QA_STORAGE_STATE` si el contract tiene `auth.enabled: true`; `QA_SCREENSHOT`/`QA_TRACE` según
`evidence.level` del contract — `full` fuerza ambos `on` — evidencia visual para `/ia4d-qa-automator:report`).

```sh
# Con auth (PowerShell):
#   $env:QA_WORK_DIR='.work/<site-id>'; $env:QA_BASE_URL='<--url>'; $env:QA_STORAGE_STATE='playwright/.auth/<project>.json'; npx playwright test tests/e2e/<site-id>/ --reporter=list
```

- Verdes → run exitoso. El QA ve qué RF cubre cada test verde, qué RF quedaron en drift, y (si los
  hubo) qué Scenarios se bloquearon por venir sin `Then`.

## Hard rules

- S2 exige `--gherkin` + `--url`. Sin target, aborta.
- S2 **no refina**: Scenario sin `Then` → se reporta y se enruta a S3, no se fabrica el resultado.
- Gate de open_questions y compliance pre-flight: **sin override**.
- **Namespace por sitio (paso 1.a, antes de la ingesta)**: artefactos efímeros bajo `<workDir>=.work/<site-id>` (incluido `criteria.json`); specs/POM bajo `tests/{e2e,pages,components}/<site-id>/`; `QA_WORK_DIR` exportado; `npx playwright test tests/e2e/<site-id>/`; limpieza de `<workDir>` al arrancar (no toca `config/tc-registry/<site-id>.json`). Runs de sitios distintos no se contaminan.
- **Planner por-flujo (paso 8) + guarda por-flujo (8.5)**: un flujo por vez, secuencial; reintento ×1; si falla, el QA decide (no-mapeado / rescate MCP / abortar).
- No se fabrica drift. Un flujo no mapeado se reporta como gap.
- La ingestión del `.feature` es determinística (`src/gherkin-to-criteria.ts` + `@cucumber/gherkin`),
  no LLM.
- Writer+Reviewer activos (igual que S4/S3); el **Judge es opcional, off por defecto** (`QA_ENABLE_JUDGE`).
- **Writers SIEMPRE en foreground: pasa `run_in_background: false` EXPLÍCITO en cada Task/Agent** (en algunos harness el default es background — el default NO es seguro). PROHIBIDO background y ScheduleWakeup para esperar subagents (F2/Q1/Q2). Paralelo ≠ background.
- Guarda de locators (10.b) antes del scaffold: `verified:false` prohibido para el Writer sin TODO o evidencia del plan.
- Cada invocación de subagent y cada decisión (ingest, drift, bloqueo, judge omitido) registra al audit-log.
- OpenAPI diferido a v0.4.

## Reference

- `docs/references/fd-criteria-schema.md` — contrato de `criteria.json` (compartido con S3)
- [`.claude/commands/qa-automator/spec-refiner.md`](spec-refiner.md) — el command S3 que S2 replica (Actos 2-5 idénticos)
- [`.claude/commands/qa-automator/autonomous.md`](autonomous.md) — el motor S4 que ambos reusan
