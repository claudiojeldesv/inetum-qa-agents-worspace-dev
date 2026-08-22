---
description: Módulo S3 — Spec-refiner (Forma B). Genera tests E2E desde un FD (markdown libre) + URL de staging, con trazabilidad RF-NNN y detección de drift FD↔implementación. Funcional en v0.2.
argument-hint: "--fd=<path> --url=<URL> [--style=<contract.yaml>]"
---

# /ia4d-qa-automator:spec-refiner

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


Módulo **S3 Spec-refiner (Forma B)** del agente `ia4d-qa-automator`. Entrada = **FD en markdown libre + URL de staging**. El FD da el *qué* (criterios RF-NNN, flujos); la URL da el *cómo* (DOM real, locators, run verde). Reusa el motor S4 validado (discovery, POM scaffolder, Writer↔Reviewer↔Judge, los 3 componentes de Fase C); las únicas piezas propias de S3 son la ingestión del FD (`ia4d-spec-refiner`), el planner en modo **mapear-contra-DOM** y el **diff de drift**.

Valor diferenciador sobre S4: (1) **trazabilidad real** — el `@criterion` cita un RF-NNN del FD, no prosa del discovery; (2) **detección de drift** — un flujo que el FD declara y staging no expone se **reporta como gap, NO se fabrica el test**.

## Arguments

- `--fd=<path>` (obligatorio): FD en markdown.
- `--url=<URL>` (obligatorio): URL de staging, debe estar en `config/allowed-targets.yaml`. **Forma B exige URL** — sin target no hay DOM, locators ni run verde (Forma A descartada).
- `--style=<path>` (opcional, default: el contract del sitio si existe, p.ej. `config/style-contracts/parabank.yaml`): YAML del Style Contract.
- `--output-dir=<path>` (opcional, default: `tests/e2e/<site-id>`): dónde se escriben los `.spec.ts` (namespaced por sitio).
- `--criteria-dir=<path>` (opcional, default: `.work/<site-id>` = `<workDir>`): dónde el refiner escribe `criteria.json` + `refinement-questions.md`.

## Procedure (los 5 actos)

### Acto 1 — Comprender

1. Resuelve el módulo (determinístico, no LLM): ejecuta `npx tsx src/scripts/resolve-mode.ts` con los flags recibidos tal cual.
2. Confirma en el JSON `module: "S3", status: "functional"`. Si `status: "needs_input"` (`--fd` sin `--url`) → aborta y dile al QA que Forma B exige URL de staging. Forma A (FD sin target) no está implementada.
3. Gate de compliance (determinístico, no LLM — **sin override**): ejecuta `npx tsx src/scripts/check-compliance.ts <--url>`. Escribe `.work/compliance-verdict.json` y registra al audit-log.
   - Exit 2 (`block`) → aborta (exit 2). `warn` → muestra y pregunta (ask-first).

**1.a — Namespace por sitio + limpieza (PRIMERO, antes de la ingesta, NO negociable):** deriva `<site-id>`
del basename del `--style`; define `<workDir>=.work/<site-id>` (todos los artefactos efímeros ahí,
**incluido `criteria.json`**) y los dirs `tests/{e2e,pages,components}/<site-id>/`; **limpia `<workDir>/`
al arrancar** (no toca `config/tc-registry/<site-id>.json`); **exporta `QA_WORK_DIR=<workDir>`** en el run.
Pasa rutas namespaciadas a los subagentes. La limpieza corre **antes** de que el refiner escriba, para no
borrar el `criteria.json` recién generado. Runs de sitios distintos no se contaminan.

**1.b — Ingestión del FD** (sustituye al brief manual de S4):
4. Invoca `ia4d-spec-refiner` via Task tool:
   ```
   --fd=<--fd> --target-url=<--url>
   --output=<criteria-dir>/criteria.json
   --questions-output=<criteria-dir>/refinement-questions.md
   --walk-output=<workDir>/walk-script.json
   --site-id=<site-id>
   ```
   `--walk-output` (y su `--site-id`) solo si el contract NO trae `walker.enabled: false`. Es el
   guion que el Acto 2 ejecuta a coste cero antes de gastar un token de planner.

**4.b — Valida el guion AL EMITIRLO, antes de que lo vea el walker.** Salta este paso solo si no
se pidió `--walk-output`.

```sh
npx tsx copilot/src/check-walk-script.ts <workDir>/walk-script.json
```

Exit 0 = válido, sigue. Exit 2 = inválido: **no lo arregles tú** (el guion es artefacto del
refiner; reescribirlo aquí esconde el defecto y lo repite el próximo run). Pasa la salida del
script **entera y literal** de vuelta al mismo `ia4d-spec-refiner` —incluye los errores, el
esqueleto canónico y las reglas— y pídele que reemita. Exit 1 = no se pudo leer: es un fallo de
escritura del refiner, mismo tratamiento.

**Un reintento, no más.** Si la segunda emisión tampoco valida, para y enséñale al QA los errores
de las dos: un refiner que no acierta el esquema con el esquema delante es un defecto del producto
y hay que verlo, no rodearlo por el planner en silencio.

Existe porque `validateWalkScript` solo corría en el consumidor: el error aparecía al arrancar el
navegador, y recuperarse costaba extraer el contrato de tipos a mano (medido en el primer run de
campo: `docs/findings/run-beta-parabank.md`, D1). Es el mismo patrón con el que `/setup` valida el
Style Contract que emite.
5. Lee `criteria.json`. De él salen: los criterios RF-NNN y el **brief** (`brief.flows`, `brief.entry`, `brief.ignore`) que en S4 teclea el QA.
6. **Gate de open_questions (ask-first, no override).**

   **Lo que bloquea es la AUSENCIA DE ORÁCULO, no la existencia de una pregunta.** Un criterio
   se excluye de este run si —y solo si— su `then` es `[AMBIGUO ...]`: sin resultado esperado,
   generar el test sería fabricar el comportamiento. Eso es lo que no se hace.

   Una pregunta abierta que **no** quita el oráculo (una duda sobre un caption, una asunción
   sobre un literal ya citado) **no bloquea**: se muestra y se sigue. El refiner cuelga
   típicamente una `Q` a *cada* criterio, así que tratar «`open_questions` no vacío» como
   bloqueo excluye el run entero y no genera nada — medido en campo (ParaBank, 2026-08-19:
   seis criterios, seis preguntas, dos `then` ambiguos, y la lectura literal dejaba el run a
   cero).

   `refinement-questions.md` trae una columna **«¿bloquea?»** por pregunta. **Léela y respétala**:
   es el propio refiner declarando qué quita el oráculo y qué no, y es más fina que cualquier
   regla que puedas aplicar desde aquí. Si una `Q` marcada como bloqueante afecta a un criterio
   con `then` citado, gana la columna.

   Muestra al QA la tabla completa —qué se genera, qué no, y por qué— y sigue con los criterios
   que tienen oráculo. Los excluidos van al run-summary como pendientes de respuesta; el QA
   puede contestarlos y re-ejecutar.
7. Registra al audit-log: `{ source: 'command', action: 'fd_ingested', metadata: { criteria_count, blocked_count, flows } }`.

### Acto 2 — Mapear (modo mapear-contra-DOM, no descubrir)

**7.b — EL WALK DETERMINISTA VA PRIMERO (K0.42). No es una optimización: es el orden correcto.**

Con un FD hay un guion, y ejecutarlo cuesta **cero tokens**. El planner nativo cuesta entre 113.000
y 161.000 (medido, dos pasadas sobre Sakai) y en esas dos pasadas **se contradijo a sí mismo** sobre
un hecho de la aplicación. Gastar eso en flujos que el walker ya recorre y verifica contra el DOM
vivo es pagar por una opinión donde ya hay una medida.

Salta este paso **solo** si el contract trae `walker.enabled: false`. Si no hay `walk-script.json`
(el refiner no lo emitió), dilo y sigue por el planner — no lo escribas tú.

1. Corre el walker sobre el guion del refiner:
   ```sh
   npx tsx copilot/src/dom-walker.ts --script=<workDir>/walk-script.json \
     --contract=<--style> --base-url=<--url> --work-dir=<workDir>/walk \
     --rescue-budget=<walker.rescue_budget del contract> [--assist si walker.assist]
   ```

**Si vas a pasar `--assist`, AVISA AL QA ANTES de lanzarlo. No es cortesía: es la
diferencia entre un run de dos minutos y uno de doce.** `--assist` abre una ventana de
navegador visible, y cuando un paso no resuelve aparece un panel dentro de esa ventana. La
espera **solo la resuelve una persona pulsando ahí**; el walker se queda bloqueado hasta
`walker.assist_timeout` (600s por defecto) por cada paso que se plante.

Antes de lanzar, dile al QA con estas tres cosas: (a) que se va a abrir un navegador y que
**lo tiene que mirar**; (b) que si sale un panel, la secuencia es *Grabar → hacerlo en la app
→ Parar*; (c) que mientras no lo atienda el run no avanza. Después lanza el walker y **cede
el turno** — no lo lances y te pongas a hacer otra cosa.

**No canalices la salida del walker por un buffer.** `| Select-Object -Last N`, `| Out-String`
y `| head` no emiten nada hasta que el proceso termina, así que el aviso de panel abierto que
el walker imprime **no te llega** y el silencio se lee como cuelgue. Medido en campo: diez
minutos con el panel abierto, el QA delante, y nadie enterado
(`docs/findings/run-beta-parabank-2.md`, D12).

**Si el walker parece colgado, mira `<workDir>/walk/assist-pending.json` antes de concluir
nada.** Si existe, no está colgado: está esperando a una persona, y el fichero dice en qué
flujo y paso, por qué, cuándo expira y qué hay que hacer. Reléváselo al QA literalmente.
Si no existe, entonces sí es otra cosa.
2. Emite specs de lo verificado, también a coste cero:
   ```sh
   npx tsx copilot/src/walk-to-spec.ts --walk-script=<workDir>/walk-script.json \
     --dom-map=<workDir>/walk/dom-map.json --style-contract=<--style> \
     --out-specs=tests/e2e/<site-id> --out-pages=tests/pages/<site-id>
   ```
   `walk-to-spec` decide qué flujo es emisible y **cuál no, con el motivo**. Un flujo cuya aserción
   pasó con un paso anterior bloqueado (`after_blocked`, K0.39) **no se industrializa**: un verde
   sospechoso no se convierte en test de regresión.
3. **Reparte el trabajo restante.** `emitidos` = flujos ya cubiertos. `cola` = los que necesitan LLM.
   A partir de aquí, **el planner y el Writer trabajan SOLO sobre la cola**. Nunca sobre un flujo ya
   emitido: regenerarlo con LLM tira el determinismo por el que se pagó.
4. Registra al audit-log:
   `{ source: 'command', action: 'walk_first', metadata: { emitidos, cola, motivos, pasos_ok, pasos_bloqueados } }`.

**7.c — Lo que el walker dice y hay que enseñar al QA, no enterrar en un JSON.** Del `dom-map`,
súbele al resumen del run:
- Los pasos **bloqueados**, con su motivo distinguido: *irresoluble* (no existe) se arregla señalando
  el elemento; *ambiguo* (designa varias cosas) se arregla acotando con `scope`. Mandan a acciones
  contrarias y confundirlos hace perder una tarde.
- Los **verdes con sospecha**: coincidencia parcial (`matched_text`), postcondición tras paso
  bloqueado (`after_blocked`), y peldaño débil sin red (`peldano_debil` + `sin_red`). Ninguno cambia
  el veredicto; todos dicen dónde mirar.
- El **drift de negocio** (`postcondition_unmet`): el FD decía que aparecería X y no apareció. Es el
  hallazgo más valioso del acto y no cuesta un token.

**7.d — La cola es información que el Writer hoy no tiene.** Al invocar al Writer sobre un flujo de
la cola, pásale **el motivo por el que quedó fuera**. Un flujo encolado porque un paso no resolvió
no es lo mismo que uno encolado porque usa `scroll_until`, y el Writer trabaja mejor sabiéndolo.

8. **Mapeo PLANNER POR FLUJO (secuencial, no monolítico) — SOLO sobre los flujos de la cola.** El planner nativo se cuelga si se le pide
   mapear muchos flujos de una vez (hallazgo: ~1h colgado con 6 flujos). Invócalo **un flujo por vez**,
   secuencial — **nunca en paralelo** (comparten el navegador del MCP). No hay timeout programático
   sobre un subagente Task: **acotar a un flujo es la mitigación**. Para **cada** `<flow>` de
   `brief.flows`, invoca `playwright-test-planner` (nativo) via Task tool, prompt en **modo mapear**:
   ```
   Mapea contra el DOM de <url> SOLO el flujo "<flow>" del FD.
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
9. Invoca `ia4d-discovery-analyzer` con `--planner-saved-plan=docs/test-plans/<site-id>/` (directorio de fragmentos), `--output=<workDir>/discovery-report.json` **y `--criteria=<criteria-dir>/criteria.json`** (activa el S3 mode):
   - Output: `<workDir>/discovery-report.json` con el bloque `criteria_mapping` (`mapped` rf↔scenario, `unmapped_flows`).

**9.b — Diff de drift (determinístico, en el command — no LLM):**
10. Calcula `drift = brief.flows − {flows en criteria_mapping.mapped}`. Cruza con `criteria.json` para anotar el RF de cada flujo en drift. Escribe `<workDir>/drift-report.json`:
    ```json
    { "target_url": "<url>", "source_fd": "<--fd>",
      "drift": [ { "rf": "RF-005", "flow": "bill-pay",
                   "fd_source_ref": "fd-parabank.md:38-42",
                   "reason": "declarado en el FD, no mapeado en staging" } ],
      "covered": [ { "rf": "RF-001", "flow": "login", "scenario": "inicio-sesion.usuario-valido" } ] }
    ```
    El drift se **reporta**, no se fabrica. Registra al audit-log: `{ source: 'command', action: 'drift_detected', metadata: { drift_count, rfs } }`.

### Acto 3 — Estructurar

**10.b — Guarda determinística de locators (Q2):** `npx tsx src/scripts/verify-locators.ts --report=<workDir>/discovery-report.json --url=<--url> --style-contract=<--style>` — resuelve cada locator del discovery contra el DOM real y anota `verified`/`unverified` in-place (summary en `<workDir>/locator-verify.json`). Un locator `verified:false` queda prohibido para el Writer sin TODO o evidencia de estado del plan.

11. Ejecuta el POM scaffolder sobre `<workDir>/discovery-report.json` **ya anotado** (igual que S4), namespaciado por sitio:
    ```sh
    npx tsx src/scripts/scaffold-poms.ts <workDir>/discovery-report.json tests/pages/<site-id> tests/components/<site-id>
    ```
    (Si necesitas inline y el `-e` falla en win32 —hallazgo Fase B #14— usa un `.mjs` en `<workDir>/`.)

### Acto 4 — Materializar

**11.b — Auth setup** (solo si el contract tiene `auth.enabled: true`): idéntico a S4 (ver `autonomous.md` Acto 4 paso 8.b). Genera `auth.setup.ts`.

12. Para cada `scenario` en `discovery-report.scenarios_recommended` **cuyo RF NO esté bloqueado por open_questions y NO esté en drift** (escalonado, warm-cache: el primer Writer solo — o el auth setup 11.b si corrió —, el resto en paralelo; **SIEMPRE FOREGROUND, PROHIBIDO `run_in_background`** — el patrón background mata el turno del orquestador y paga re-priming, hallazgo F2/Q1):
    - **Construye el `--output`** bajo `tests/e2e/<site-id>/<id>_<feature>.<condicion>.spec.ts` (ID estable del registro). Invoca `ia4d-writer` via Task tool con `--plan-entry`, `--style-contract`, `--pom-skeleton-dir=tests/pages/<site-id>`, `--output` (el construido), `--discovery-report=<workDir>/discovery-report.json` **y `--criteria=<criteria-dir>/criteria.json`** (activa el S3 mode: `@criterion` cita RF-NNN + source_ref; usa given/when/then del criterio).
    - El Writer escribe el `.spec.ts` e invoca al Reviewer (ping-pong N≤2). Pasa por el hook `pii-post.ts`.
13. (Opcional) `ia4d-style-enforcer` por cada `.spec.ts`.
14. (Obligatorio) Verificación a11y **determinística**: `npx tsx src/scripts/verify-a11y.ts tests/e2e/<site-id>/ --style-contract=<--style>` (scan siempre; gate por `a11y.fail_on_violations`, **default `false`** → modo warning; reactivable por-sitio con `true`). Exit 1 → `ia4d-a11y-injector` (rescate) solo para los `failed_specs`, y re-verifica. Igual que S4 (ver `autonomous.md` paso 11).

**14.b — Consolidar feedback (determinístico, no LLM):** el Reviewer escribió un fichero por spec en
`<workDir>/review-feedback/<spec>.json` (sin contención entre writers paralelos). Únelos en el
`<workDir>/review-feedback.json` plano: `QA_WORK_DIR=<workDir> npx tsx src/scripts/consolidate-reviews.ts`.
El Judge y el reporte leen el consolidado. (Evita la race de *append* concurrente que corrompía el fichero.)

### Acto 5 — Juzgar

15. **Judge opcional, off por defecto.** Solo si `QA_ENABLE_JUDGE` está seteado (PowerShell: `$env:QA_ENABLE_JUDGE`; bash: `$QA_ENABLE_JUDGE`) invoca `ia4d-judge` por cada `.spec.ts` con el `<workDir>/review-feedback.json` consolidado. Si no, **omite el Judge** y registra al audit-log `{ source: 'command', action: 'skip', rule: 'judge', reason: 'judge off (QA_ENABLE_JUDGE unset)' }`.
16. (Solo si el Judge corrió) Lee scores. Si >30% < 0.5 → pausa ask-first.
17. Genera `<workDir>/qa-automator-run-summary.json` con: tests generados (+ su RF), scores (o `judge: skipped`), verdicts, axe results, **criterios bloqueados (pendientes de respuesta QA)** y **drift** (RF declarados sin cobertura).

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

- `criteria.json` + `refinement-questions.md` (ingestión del FD)
- `<workDir>/drift-report.json` (RF declarados no mapeados en staging; `<workDir>`=`.work/<site-id>`)
- `<workDir>/discovery-report.json` (con `criteria_mapping`)
- `tests/pages/<site-id>/*.page.ts`, `tests/components/<site-id>/*.component.ts`, `tests/e2e/<site-id>/*.spec.ts` (con `@criterion RF-NNN`)
- `<workDir>/review-feedback/<spec>.json` (per-spec, escrito por el Reviewer) → consolidado en `<workDir>/review-feedback.json`; `<workDir>/judge-report.json`, `<workDir>/audit-log.json`
- `<workDir>/qa-automator-run-summary.json`

## Verification step

Idéntico a S4 (`autonomous.md`): ejecuta `npx playwright test tests/e2e/<site-id>/` seteando `QA_WORK_DIR=.work/<site-id>` (aísla artefactos del sitio) y `QA_BASE_URL` con `--url` (y `QA_STORAGE_STATE` si el contract tiene `auth.enabled: true`; `QA_SCREENSHOT`/`QA_TRACE` según `evidence.level` del contract — `full` fuerza ambos `on` — evidencia visual para `/ia4d-qa-automator:report`).

```sh
# Con auth (PowerShell):
#   $env:QA_WORK_DIR='.work/<site-id>'; $env:QA_BASE_URL='<--url>'; $env:QA_STORAGE_STATE='playwright/.auth/<project>.json'; npx playwright test tests/e2e/<site-id>/ --reporter=list
```

- Verdes → run exitoso. El QA ve qué RF cubre cada test verde, qué RF quedaron en drift, y qué RF están pendientes de respuesta a una refinement-question.

## Hard rules

- Forma B exige `--url`. Sin target, aborta (no hay Forma A).
- Gate de open_questions y compliance pre-flight: **sin override**.
- **Namespace por sitio (paso 1.a, antes de la ingesta)**: artefactos efímeros bajo `<workDir>=.work/<site-id>` (incluido `criteria.json`); specs/POM bajo `tests/{e2e,pages,components}/<site-id>/`; `QA_WORK_DIR` exportado; `npx playwright test tests/e2e/<site-id>/`; limpieza de `<workDir>` al arrancar (no toca `config/tc-registry/<site-id>.json`). Runs de sitios distintos no se contaminan.
- **`--assist` se anuncia ANTES de lanzarlo y se cede el turno** (7.b): abre un navegador visible y el panel solo lo resuelve una persona. Salida del walker **sin buffer**; si parece colgado, `<workDir>/walk/assist-pending.json` dice si hay alguien esperando. Nunca declares un cuelgue sin mirar ese fichero.
- **Un paso que se planta se arregla con el panel o con el literal medido, NO escribiendo alias a mano** (7.b): la escalera lleva tier `anchored` (K0.19/K0.21), que resuelve texto-visible→control sin necesidad de `label for`. Antes de dar por imposible un hint, comprueba si lo único que falla es la PALABRA (idioma, mayúscula, tilde). Medido en campo: se diagnosticó "no hay label que resolver" sobre una pantalla que la escalera ya resolvía, y el desvío costó el run (D11).
- **Planner por-flujo (paso 8) + guarda por-flujo (8.5)**: un flujo por vez, secuencial; reintento ×1; si falla, el QA decide (no-mapeado / rescate MCP / abortar).
- No se fabrica drift ni el `then` ambiguo. Un flujo no mapeado se reporta; un criterio ambiguo no se genera.
- Writer+Reviewer activos (igual que S4); el **Judge es opcional, off por defecto** (`QA_ENABLE_JUDGE`).
- **Writers en foreground SI el harness lo expone: pasa `run_in_background: false` EXPLÍCITO en cada Task/Agent** (en algunos harness el default es background — el default NO es seguro). Paralelo ≠ background.
  **Reconciliación de dos medidas que parecían chocar** (F2/Q1 vs. el run del 2026-08-20): el enemigo NO es el background, es el **bucle de sondeo** que suele venir detrás. Foreground = un turno bloqueado (barato). Background + esperar la notificación = un turno al lanzar y otro al volver (también barato). Background + «sigo esperando» ×20 = el contexto entero releído veinte veces, que es lo que costó el 74% del run. Si el harness no expone el parámetro —medido: pasó en el run 2— el background es inevitable y entonces manda el punto 1 del PRESUPUESTO DE TURNOS: lanzar y **terminar el turno**, nunca sondear. `ScheduleWakeup` para esperar subagents sigue prohibido.
- Guarda de locators (10.b) antes del scaffold: `verified:false` prohibido para el Writer sin TODO o evidencia del plan.
- Cada invocación de subagent y cada decisión (ingest, drift, bloqueo, judge omitido) registra al audit-log.
- Writers del Acto 4 escalonados: el primero solo (escribe la caché del prefijo compartido), el resto en paralelo — solo criterios no bloqueados.

## Reference

- `docs/references/fd-criteria-schema.md` — contrato de `criteria.json`
- [`.claude/commands/qa-automator/autonomous.md`](autonomous.md) — el motor S4 que S3 reusa (Actos 3-5 idénticos)
