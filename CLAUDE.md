# Proyecto: `ia4d-qa-automator` — categoría Documentación y Calidad del catálogo `ia4d-*`

Construir el primer agente QA del catálogo Inetum: **`ia4d-qa-automator`**. Multiplicador de productividad para ingenieros QA, multi-modo según la información disponible, con marco QA propio (no fase 07 estricta de AISD), Quality layer Writer+Reviewer+Judge que materializa "QA es juez independiente", y capa transversal de compliance regulado, accesibilidad y trazabilidad auditable.

Es el primer entregable de una cartera más amplia (`test-explorer`, `test-healer-pro`, `test-data-architect`, `test-quality-analyst`, `ai-feature-quality`, etc.). Cada uno tendrá su propio SPEC cuando llegue su turno. **Foco actual: solo `qa-automator`**.

## Sobre nosotros

Ingeniero QA con experiencia en banca y seguros regulados. Foco profesional: experto en agentes Claude Code aplicados a QA — intersección rara entre conocimiento QA en dominios regulados y capacidad agéntica.

## Posicionamiento del producto

- **Lead de venta**: *"Tu Ingeniero QA pasa de un flujo funcional (o solo URL) a tests Playwright estructurados con POM, A11y baked-in y trazabilidad auditable, en minutos, con un Reviewer independiente que audita al Writer antes de exponer el código"*. Velocidad + estructura como impacto demostrable.
- **Argumento estructural** (no de venta, de naturaleza): **dev no puede ser juez y parte**. `ia4d-testing-core` es la herramienta del dev que escribe tests sobre su propio código. `ia4d-qa-automator` es la herramienta del juez QA independiente. Misión distinta, no perspectiva distinta. Las herramientas QA tienen **otra forma de operar**.
- **Backup (regulated safety)**: compliance pre-flight sin override, PII detector ES (DNI/IBAN/Luhn/teléfono/email), A11y baked-in (axe-core, WCAG 2.1 AA / EAA 2025), audit log JSON append-only para evidencia regulatoria.
- **Público primario**: Ingeniero QA (usuario directo) + QA Manager (decisor cliente) + I+D Inetum (decisor catálogo).
- **Anti-positioning**: NO sustituye a `ia4d-testing-core`. Coexisten con misiones incompatibles — testing-core opera desde la perspectiva dev (whitebox total sobre código propio), qa-automator desde la perspectiva juez QA (greybox o black-box, cuatro modos según input).

## Marco QA propio (no AISD fase 07 estricta)

`ia4d-qa-automator` opera **transversal por disciplina QA propia**, no por imitar a `ia4d-quality-engineer-expert`. Justificación: QA es disciplina, no fase del proceso dev. Automatizar un sitio tiene estrategias distintas a desarrollar código.

Cinco actos:

1. **Comprender** — Determinar modo de entrada (S1/S2/S3/S4) y validar target.
2. **Mapear** — Discovery del target. Identificar pantallas, flujos, criticidad, riesgo.
3. **Estructurar** — POM determinístico, Style Contract aplicado, fixtures, datos sintéticos.
4. **Materializar** — Writer genera tests; capa transversal (compliance/PII/A11y/style) los enforce.
5. **Juzgar** — Reviewer audita al Writer (ping-pong con N≤2 iteraciones), Judge puntúa, QA sign-off.

## Cuatro módulos de entrada

| Módulo | Entrada | Estado MVP v0.1 |
|---|---|---|
| **S1 Code-driven** | Repo frontend (React/Vue/HTML) | Stub documentado |
| **S2 Req-driven** | Gherkin / OpenAPI / specs maduras | Stub documentado |
| **S3 Spec-refiner** | DF flojo / PDF / Jira mal redactado | Stub documentado |
| **S4 Autonomous (MCP)** | Solo URL | **Funcional** |

En MVP v0.1 solo S4 es funcional. S1/S2/S3 están documentados con prompts iniciales y un command que devuelve `not implemented v0.1`. Roadmap en [SPEC.md](SPEC.md).

## Contexto Inetum

- Portal corporativo GenAI con dos secciones: Plugins (~70, dev-céntrico) y Agentes (curado por I+D). Nuestro destino: **pestaña Documentación y Calidad** del catálogo de Agentes.
- **Patrón canónico Inetum**: Orquestador → Sub-agentes → Comandos → Hooks → MCPs. Lo respetamos en la presentación al catálogo. La ficha del catálogo (`docs/Inetum/Catalogo/ia4d-qa-automator.md`) sigue el formato canónico ①-⑦.
- **Metodología AISD** (10 fases de DF a MVP, ver [`METODOLOGIA AISD.md`](METODOLOGIA AISD.md)): nuestra suite opera **across the SDLC por disciplina QA propia**, conectándose a fase 01 (cuando S3 refina DF), fase 04 (cuando S2 consume OpenAPI), fase 07 (modo Testing principal) y fase 08 (evidencia para Validación).

## Arquitectura del proyecto

Peer subagents en `.claude/agents/`, orquestados por commands en `.claude/commands/qa-automator/`. Co-existen subagents nativos de Playwright (Microsoft, motor) y subagents `ia4d-*` propios (envuelven y enforce).

```
.claude/agents/
├── playwright-test-{planner,generator,healer}.md       (nativos Microsoft, vía init-agents, no editar)
├── ia4d-{compliance-checker,pii-scanner,style-enforcer,
│        a11y-injector}.md                              (capa transversal)
├── ia4d-{writer,reviewer,judge}.md                     (Quality layer)
├── ia4d-{discovery-analyzer,mode-router}.md            (S4 Autonomous + dispatcher)
├── ia4d-{spec-parser,spec-refiner}.md                  (S2/S3, funcionales)
└── ia4d-code-analyzer.md                               (stub S1, roadmap sin versión)

.claude/commands/qa-automator/
├── healthcheck.md  config.md  report.md                (soporte)
├── autonomous.md  req-driven.md  spec-refiner.md       (S4/S2/S3 funcionales)
└── code-driven.md                                      (stub S1)
```

Desde Fase 1 token-efficiency: `ia4d-mode-router` y `ia4d-compliance-checker` están **deprecated** (los commands ejecutan `src/scripts/resolve-mode.ts` y `src/scripts/check-compliance.ts`, determinísticos); `ia4d-a11y-injector` es **rescate** (el camino caliente es `src/scripts/verify-a11y.ts`).

**Regla arquitectónica suavizada**: por defecto, los subagents `ia4d-*` no se invocan entre sí — la orquestación vive en los commands con handoff por archivos. **Excepción documentada y nombrada**: el par Writer↔Reviewer se invoca directamente vía Task tool dentro del Writer (composición explícita del patrón Writer+Reviewer, no acoplamiento ad-hoc). Auditabilidad se preserva por `audit-log.json`, no por estructura. Ver [`docs/references/composition-rules.md`](docs/references/composition-rules.md).

Detalle completo en [`SPEC.md`](SPEC.md).

## Wrapper sobre Playwright Test Agents nativos

Playwright v1.56+ trae tres subagents nativos (Planner, Generator, Healer) instalados con `npx playwright init-agents --loop=claude`. **No los reimplementamos** — los rodeamos con capas que aportan lo que Microsoft no construirá: compliance regulado, convenciones de cliente, trazabilidad auditable, A11y obligatorio, PII detection ES, Quality layer Writer+Reviewer+Judge.

Datos consolidados del Slice 0.5 (ver [`docs/findings/spike-playwright-mcp.md`](docs/findings/spike-playwright-mcp.md)):

| Invocación | Tokens | Tool uses | Duración |
|---|---|---|---|
| Planner SauceDemo | 32,051 | 38 | 3.4 min |
| Generator (1 test) | 30,751 | 25 | 3.4 min |

Modelo confirmado para Planner/Generator nativos: `sonnet`. Para subagents `ia4d-*`: Sonnet para Writer/Reviewer/Spec-refiner y code-analyzer (razonamiento), Haiku para Judge y mecánicos (style-enforcer/pii-scanner/a11y-injector/discovery-analyzer/mode-router/spec-parser).

## Reglas duras

1. **Patrón Inetum cumplido externamente** (Orquestador → Sub-agentes → Comandos → Hooks → MCPs visibles para I+D, en la ficha del catálogo y en la documentación pública), arquitectura peer internamente. No hay contradicción.
2. **Subagents no se invocan entre sí salvo excepción documentada**. Por defecto, commands orquestan vía Task tool. Handoff por archivos. Excepción nombrada: Writer↔Reviewer.
3. **Compliance pre-flight no tiene flag de override**. Cualquier salto rompe el SPEC. (El **PII detector** pasó a ser **off por defecto, reactivable** con `QA_ENABLE_PII` desde v0.2 `design/gates-off-by-default` — ver regla #10. La guarda anti-`test.fixme()` del mismo hook sigue siempre activa.)
4. **Style Contract L0** declara convenciones del cliente (POM, naming, locators, fixtures). El agente lo lee y enforce el output del Generator nativo. Si no hay contract, default del agente + log.
5. **Validación determinística**, no LLM-as-validator. AST + JSON Schema + regex. LLM-as-judge sí existe — pero es scoring de calidad, no validador binario de compliance.
6. **Datos productivos fuera del contexto**. El agente trabaja con artefactos de definición (FD/TD/OpenAPI) y datos sintéticos declarados. Nunca con dumps reales. Context Injector (v0.4 con asterisco "no genérico") es la única excepción contemplada y queda fuera de MVP/v0.2/v0.3.
7. **POM esqueleto generado por código determinístico** (`src/pom-scaffolder.ts`), no por LLM. El LLM solo rellena locators y acciones específicas. Justificación: velocidad + estructura consistente.
8. **Writer + Reviewer obligatorios**: el núcleo del Quality layer. El Reviewer puede pedir hasta dos iteraciones al Writer antes de aprobar. El **Judge es opcional, off por defecto** (`QA_ENABLE_JUDGE`) desde v0.2 `design/gates-off-by-default` — ver regla #10. Cuando se activa, da score numérico final.
9. **Behavioral non-negotiables siempre activos**: surface assumptions, push back con dato, scope discipline, verify-don't-assume, no rationalize shortcuts. Si una tarea está fuera del SPEC, decirlo, no estirar.
10. **Gates opcionales, off por defecto (v0.2 `design/gates-off-by-default`)**: `ia4d-pii-scanner`, `ia4d-judge`, el **gate** de `ia4d-a11y-injector` y la **sanación** (`healing`, desde v0.3 quality-greens Q3) están **apagados por defecto y reactivables**, NO eliminados — funcionalidades del producto que se encienden cuando el cliente las necesita. Las piezas siguen completas en el repo (hook, agente Judge, lógica del gate, command `/qa-automator:heal` + `run-heal-mecanico.ts`). Reactivación: `QA_ENABLE_PII=1` (PII), `QA_ENABLE_JUDGE=1` (Judge), `fail_on_violations: true` en el Style Contract (gate a11y por-sitio), `healing.enabled: true` en el Style Contract (autonomous encadena la sanación sobre los rojos; sin él, reporta rojos y termina — `/qa-automator:heal` queda siempre disponible como post-proceso desacoplado, con protocolo de auditoría post-heal: el Healer no es juez). El **scan** de a11y se sigue inyectando siempre; lo apagado es solo el gate que aborta. Esta regla matiza las reglas #3 y #8.

## Estado actual

Historial completo de fases, releases y hallazgos en [`docs/STATUS.md`](docs/STATUS.md) (carga lazy — ábrelo cuando la tarea pida contexto histórico). Lo más reciente, comprimido:

- **Caos corporativo Fase 4 (branch `design/kernel-v2`) — `scroll_until` para virtual scroll — CIERRA la serie de 6 fases**: acción `scroll_until` (hint=objetivo, container=viewport, max_steps=tope) para `cdk-virtual-scroll` (la fila objetivo no existe en el DOM hasta hacer scroll). Bucle ACOTADO: resuelve dentro del container (misma regla dura — visible único=adelante, ≥2=se planta), si no aparece scrollea con `page.mouse.wheel` (vía documentada por Playwright para listas virtualizadas) y reintenta tras settle. "No encontrado tras N scrolls" es AMBIGUO (nunca afirma ausencia). Misma trampa K0.17 que Fase 6 (`tabla-simple.html`) mordió otra vez: fixture de 5000 filas sin NINGÚN interactivo → cada iteración pagaba el timeout completo (10s) en vez de ~50ms reales — arreglado con el mismo parche (botón sin handler). Fixture `virtual-scroll.html`: fila 4000/5000 se materializa y resuelve, fila inexistente agota el tope y se reporta sin afirmar ausencia. 169/169 unit copilot, healthcheck 26/26. **Cierra `docs/SPEC-caos-corporativo.md` completo** (Fases 1/3/2/6/5/4). Salvedad de estabilización bajo suite completa: debounce de Fase 5 subido de 300 a 1500ms (margen insuficiente frente al jitter de IPC con 13 ficheros de test en paralelo).
- **Caos corporativo Fase 5 (branch `design/kernel-v2`) — settle consciente de debounce en inputs**: K0.17 reubicado en inputs — tras teclear hay un hueco de calma IGUAL al debounce antes de la petición, calma FALSA si `quiet_ms` genérico es más corto. Marca del paso `fill`: `debounced:true` (default 300ms) o `debounce_ms:N`. `settleProfileFor` ELEVA el piso de `quiet_ms` al debounce efectivo — nada más: si el resultado real tarda más, su mutación reinicia la cuenta igual que un spinner, así que "(b) aparece el oráculo" ya lo cubre el mecanismo de siempre. Par falsable en `busqueda-debounce.html`: mismo guion, contract no tuneado (`quiet_ms:50`) — sin `debounce_ms` el clic sobre el resultado se pierde (no existe aún), con él pasa. 167/167 unit copilot, healthcheck 26/26.
- **Caos corporativo Fase 6 (branch `design/kernel-v2`) — `expect_count`/`expect_each` + captura de tabla**: cardinalidad ("trae más de X registros"). `expect_count` (hint=colección + operator ∈ `>|>=|=|<` + value numérico): `toHaveCount` para `=`, `count()` tras espera de visibilidad para el resto, solo cuenta lo VISIBLE. `expect_each` (hint=contenedores + `each:{hint,operator,value}`): itera y sub-cuenta. `resolveCollection` no adivina "cuántos hay" (0 es dato legítimo), adivina "en cuál contenedor/frame" — ambiguo entre ≥2 → se planta. Tabla capturada (headers+rows) solo con ≥1 fila, gateada tras el conteo. **Hallazgo de dos capas**: `Locator.evaluate(string)` nunca invoca con el elemento como argumento (siempre `undefined`); y la hipótesis "arrow anónimo inline = inmune al bug `__name` de esbuild" es FALSA (revienta igual bajo `tsx` real). Solución: XPath `ancestor::` encadenado sobre el locator + `allTextContents()` — cero código in-page. 159/159 unit copilot, healthcheck 26/26.
- **Caos corporativo Fase 2 (branch `design/kernel-v2`) — auto-descarte de estorbos**: `page.addLocatorHandler` opt-in sobre `contract.obstructions.dismiss[]`, OFF por defecto (sin declarar, un estorbo bloquea el paso con el motivo de Playwright, nunca se barre en silencio). Descarte genérico: Escape → botón de cierre dentro del estorbo → clic al estorbo mismo. Cada descarte auditado (`skip`/`obstruction-dismiss`, selector+step). Enriquecido el mensaje de `action_failed` con la línea "intercepts pointer events" del call log multilínea de Playwright (antes: timeout desnudo sin causa). Fixtures `backdrop-fantasma.html` (Escape) y `snackbar-intercept.html` (botón "Cerrar" propio). 139/139 unit copilot, healthcheck 26/26.
- **Caos corporativo Fase 3 (branch `design/kernel-v2`) — matar animaciones**: knob `settle.disable_animations` (default ON en funcional). `reducedMotion:'reduce'` + CSS `transition/animation:none!important` inyectado con `context.addInitScript`, no `page.addStyleTag` (se perdería en cada navegación dura JSF/PrimeFaces). Bug cazado: `document.head`/`documentElement` son `NULL` en el instante en que corre un init script — inyectar a ciegas revienta en silencio en la consola de la página y la animación sigue entera; arreglado con `MutationObserver` sobre `document` esperando a que el parser cree `<html>`. Fixture `anim-lenta.html`: on → `action_ms`<1s, off → >1,3s, mismo resultado `ok` (comparativa de reloj, no par falsable). 135/135 unit copilot, healthcheck 26/26.
- **Caos corporativo Fase 1 (branch `design/kernel-v2`, spec [`docs/SPEC-caos-corporativo.md`](docs/SPEC-caos-corporativo.md)) — `select` inteligente + portal**: `selectSmart` ramifica por tagName real del disparador (`<select>` nativo → `selectOption` de siempre; widget no nativo → abrir, esperar único `role="listbox"` visible a **nivel de página entera**, resolver la opción por rol+texto normalizado con `uniqueOrNull`), sin campo nuevo en el guion (`select` sigue siendo hint+value) y sin declarar `scope`. Mata la clase "selectOption lanzó sobre un div" (Angular Material / PrimeFaces), el hueco Angular nº 1 que bloqueaba onesait. Fixture `mat-select-portal.html`, par falsable validado (selectOption ciego revienta, `selectSmart` resuelve sobre la misma página). 133/133 unit copilot, healthcheck 26/26, template propagado.
- **Kernel v2 Fase K0 (branch `design/kernel-v2`, spec congelado en [`docs/SPEC-kernel-v2.md`](docs/SPEC-kernel-v2.md))**: primeros cierres de la arquitectura **kernel genérico + client packs** (el walker deja de ser Copilot-only y pasa a componente de producto; conocimiento del cliente como pack por *familia de stack*, no por aplicación). Todo a $0 tokens: normalizador de acentos en la escalera de resolución (la clase GESTIÓN-con-tilde muere sin LLM); acciones `expect_text`/`expect_state` — las postcondiciones del FD se ejecutan contra la app viva y el walk pasa a ser **smoke ejecutable del FD** (drift FD↔app detectado en el Acto 2); captura de `business_text` (el texto de resultado no interactivo al que el walker era ciego) + diálogos como sub-pantalla; `frame_path` → `frameLocator` en el scaffolder; `hint-aliases` durables con **promoción condicional** (un rescate se paga una vez por cliente, y solo entra en memoria si su postcondición se cumplió); check **`MF-postcondition`** en pre-review (si el discovery trae el texto de resultado y el spec no lo asserta → must-fix: mata la clase "assert sobre el mueble" medida dos veces en Fase A); etapa `gate` (compliance antes de gastar LLM) y el **refiner emitiendo el walk-script** desde el FD. Validado en vivo: 16/16 pasos 0 rescates determinista, ciclo de memoria completo (rescate → alias → run posterior con `alias-hit`), drift fabricado cazado a $0, `MF-postcondition` probado contra el discovery real. 306/306 unit, healthcheck 26/26, template propagado. Pendiente del gate: el run del Writer (~$1,6) que ejecuta el QA.
- **K0.13 sincronización (branch `design/kernel-v2`)**: la clase "el spinner se abre 2 o 3 veces en la misma carga" resuelta a $0. **Ventana de quietud** en vez de "el spinner ya no está" (el hueco entre ciclos es calma FALSA; se exige quietud continuada, con umbral de **tasa** de mutaciones para que un reloj de polling no cuelgue el walk, y observación también dentro de los iframes); **`expect_after` como oráculo** — el reintento exige a la vez huella de pantalla intacta y acción que no muta negocio (`click`/`check`/`uncheck` no son reintentables por defecto: re-pulsar "Finalizar" crea dos declaraciones); **timeouts calibrados** por p95 observado en `config/timing-profiles/<site_id>.json`, que recalibra cada run. Desenlace por paso clasificado en `step_reports[]`: `ok_after_retry` es ruido de entorno y `postcondition_unmet` es candidato a drift — **mezclarlos en una cifra de "fallos" es lo que envenena el informe de reconciliación**. Bloque `settle` en el Style Contract = home del client pack para las señales del stack. Dos bugs cazados construyendo: settle inerte bajo `tsx` (esbuild envuelve las funciones con `__name`, que no existe en la página; vitest no lo añade → **369 tests en verde con el settle sin esperar nada** → el código in-page se emite como string y hay test que lanza el CLI real), y `networkidle` retrasando el inicio de la observación hasta perderse el primer ciclo (fuera). Par falsable en `copilot/fixtures/spinner-multi.html`: mismo guion, misma página, solo cambia la política de espera → con la naíf el clic se pierde, con la ventana pasa a la primera. 369/369 unit, healthcheck 26/26. **No construido y consciente**: clasificación de peticiones acción-vs-polling, y settle observado durante una *grabación* (lo que lo haría perfil medido en vez de heurística).
- **K0.16/K0.17 (branch `design/kernel-v2`)**: el guion aprende a decir **dónde**, y el primer ejercicio de descubrimiento contra una app de terceros. **K0.16** salió de un hallazgo previo al código: intentar expresar el CP001 del cliente con el vocabulario del guion era imposible — `hintLocatorPlan` solo produce locators planos y un `StepHint` no puede decir "dentro de", así que los tres botones "X" de las ventanas flotantes eran indistinguibles *y colisionaban en la misma clave de alias*; peor, un parche del modo asistido con locator por encima del tier plano **no se podía fundir** (en SauceDemo salieron `semantic` y el merge funcionó por suerte). Dos campos con productores separados: `scope` (contenedor, lo emite el **refiner** desde el FD, entra en `aliasKey`) y `locator` (cadena autoritativa, lo emite el **parche**; el refiner tiene prohibido emitirlo). El parche incluye ya `walk_steps` listos para pegar. Banco de regresión `corp-bench.html` + guion de 30 pasos con forma de CP001 (menú 3 niveles con señuelo, id JSF sin label, doble spinner, negocio dentro de un iframe, dos botoneras con un "Siguiente", cadena de 4 modales con dos "X" idénticos, tabla con selección): **30/30 sin rescates ni asistencia**. En su primera pasada encontró un defecto real: el literal "Rehusada" existe también como `<option>` del filtro, va antes en el DOM e invisible → `findVisibleText` hacía `.first()` y esperaba en vano (arreglado con `.filter({visible:true})`). **K0.17** = descubrimiento en OrangeHRM con guion escrito sin mirar el DOM y predicciones por escrito: primer run **2/9**, y el fallo real no estaba en mis predicciones — la SPA llega con el documento **vacío** y monta segundos después, o sea máximamente quieta, y la ventana la declaraba estable en 422 ms (K0.13 quitó `networkidle` y abrió el agujero). Arreglado exigiendo ≥1 mutación cuando el top arranca sin nada → **8/9**. Tres hallazgos más: el informe culpaba al guion (siete "hint irresoluble" cuando la verdad era una: pantalla sin elementos interactivos); la calibración era ciega justo donde hacía falta (solo guardaba settles limpios, así que los pasos que agotan el tope nunca lo aprendían — `s8` pasó de `settle_timeout` 10032 ms a `ok` 8075 ms en el segundo run); y el **`goto` con reintento del §8 estaba declarado y no implementado**, con `__entry` fuera del try/catch tumbando el run entero. **Y el banco cazó una regresión mía el mismo día**: la regla del arranque vacío aplicada a cada frame hacía que un `<iframe hidden>` nunca alcanzara la quietud (10 min de run, todo en `settle_timeout`) → acotada al documento principal. Sin construir y consciente: `select` sobre combobox no nativo, `expect_count`/`expect_each`, la escalera del guion más pobre que la del asistido (`anchored` solo existe al señalar), y `getByPlaceholder` del contract ignorado en silencio.
- **Quality-greens Fase Q4 identidad estable (branch `design/quality-greens`)**: reconciliación de slug drift en el checkpoint — registro v2 (`{id, source, nature, screens, aliases}`, legacy plano tolerado y migrado al write) + matching conservador (slug nuevo con candidato único mismo feature+naturaleza+destino → ID reusado, re-key al slug actual, viejo a `aliases`; ambiguo → ID nuevo reportado, nunca se adivina). Archivado post-selección: specs del namespace fuera de la selección → `tests/e2e/<site-id>/_archive/` (movidos, no borrados, auditados con acción `archive_file`; excluidos de playwright vía `testIgnore` y de tsc), + barrido de specs pre-namespace en la raíz de `tests/e2e/` (one-time: 16 archivados). Validado end-to-end con 2 checkpoints consecutivos drifteados: ID estable, registro sin duplicados, tsc verde sin limpieza manual. 263/263 unit, healthcheck 26/26. Pendiente QA: fusión de duplicados históricos del registro saucedemo (TC-004/007, TC-002/003/006).
- **Quality-greens Fase Q3 (branch `design/quality-greens`) — productización del Healer (patrón regla #10)**: knob `healing` off por defecto en el Style Contract (schema + validator + estado efectivo de `/config`), command **`/qa-automator:heal`** desacoplado (patrón report) con `src/scripts/run-heal-mecanico.ts` (stages setup/verify: compliance sin override, suite del namespace re-ejecutada —blast radius—, pre-review, verify-a11y, verdicts del Reviewer post-heal, `healed[]` al run-summary, audit-log por sanación), encadenado opt-in en `autonomous` (paso 11), y check `MF-regex-anchor` en pre-review (`toHaveClass` con regex sin anclas → must-fix; la clase del rojo TC-005 de Q2 muere, test con el caso real `input_error`). **Validado end-to-end contra rojo fabricado**: healer nativo 1 fix en POM con causa raíz correcta, Reviewer post-heal approved 0 MF, suite verde, re-ejecutable (segundo setup → no-op). Red estructural 248/248, healthcheck 26/26, template propagado.
- **Quality-greens Fase Q2 (branch `design/quality-greens`) — prevención + estabilización**: **verdes a la primera 4/5** (Q1: 2/5; F4: 0/5) a $11,06/run, cero ficheros basura. `src/scripts/verify-locators.ts` (guarda determinística: cada locator del discovery resuelto contra el DOM real, bootstrap de sesión contract-driven, anotación `verified`/`unverified`; en el stage `checkpoint` y en S2/S3), planner con evidencia de estado (clase F4 muerta), discovery-analyzer sin wildcards + `screens[]`, **ownership mecánico de POMs** (race eliminada con evidencia, Reviewer con procedencia objetiva de locators), writers foreground con `run_in_background: false` explícito (el harness backgroundea por defecto — hallazgo del baseline), audit-log inmune a rutas mangled. Salvedad: approved iter-0 3/5 (<4/5) por 2 rechazos de reglas nuevas (procedencia + MF-9), no race — aceptación pendiente del QA. Rojo único TC-005 (regex substring sobre evidencia precisa): heal pendiente, decisión QA.
- **Quality-greens Fase Q1 (branch `design/quality-greens`, desde `design/token-efficiency`)**: KPI principal demostrado — **5/5 verdes post-Healer** en baseline S4 SauceDemo. Fixes: patrón axe único en el Writer, sobrescritura por iteración del feedback del Reviewer (verificado en vivo), scaffolder regenera POMs desde el discovery actual (el hallazgo F2 eran ficheros stale, no hardcode). Healer medido por primera vez: 3/3 sanados, μ $0,72/spec (~$2,2 el lote), causa raíz compartida en POM → 1 fix cura N; output auditado post-heal (Reviewer 3/3 approved). Verdes 1ª 2/5, clase nueva única (locators por convención) → objetivo de Q2. Productización del Healer: decisión QA pendiente.
- **Token-efficiency Fase 6 (branch `design/token-efficiency`, ciclo 2)**: Writer en Haiku **descartado por A/B congelado** — approved-rate a iter ≤1 cayó 4/4→2/4, 9 must-fix (vs 0, con una clase sistemática: API de axe inventada), 2/4 writers no cerraron el protocolo solos, y el Reviewer Sonnet ×2,5 invocaciones se come el ahorro (~neutro o peor, wall-clock ×2,3). Verificación final en paridad (2/4, mismas clases): la red Reviewer+pre-review+rescate contiene al Writer barato, pero contiene pagando. El Writer sigue en Sonnet. F7 (main Haiku) condicional al apetito del QA, con señal desfavorable.
- **`template/` sincronizado vía `npm run build:template`**: el núcleo se edita en el repo y se propaga; el template no se edita a mano.
- **Reorganización híbrido moderado**: 7 carpetas de contenido en la raíz; lo efímero en `.work/` (gitignored). `hooks/` no se movió.
- **v0.2 cerrada** (release `v0.2.0`): S2/S3/S4 funcionales, gates off por defecto (regla #10), Fases A-F validadas (ParaBank, Mapfre Hogar, OrangeHRM; tesis drift-sin-fabricar demostrada contra prod real).
- **Principio del QA**: la sanación (Healer) va al final como post-proceso, no acoplada a la generación. **Sin plazo de calendario comprometido**.

## Documentación viva

Carga **eager** (siempre presente vía referencia mental al cargar este CLAUDE.md): nada por ahora. El SPEC.md se lee bajo demanda.

Carga **lazy** (Claude lee cuando la tarea lo pide):

| Doc | Cuándo abrirlo |
|---|---|
| [`SPEC.md`](SPEC.md) | Definición del agente: objective, modos, commands, structure, code style, boundaries, roadmap |
| [`docs/STATUS.md`](docs/STATUS.md) | Historial completo de fases, releases y hallazgos (la vieja sección "Estado actual") |
| [`docs/findings/spike-playwright-mcp.md`](docs/findings/spike-playwright-mcp.md) | Mediciones reales del Planner+Generator, decisiones data-dependent cerradas |
| [`docs/references/compliance-rules.md`](docs/references/compliance-rules.md) | Qué bloquea el pre-flight, sin override |
| [`docs/references/pii-patterns.md`](docs/references/pii-patterns.md) | Regex DNI/IBAN/Luhn/teléfono/email ES |
| [`docs/references/composition-rules.md`](docs/references/composition-rules.md) | Excepción Writer↔Reviewer documentada |
| [`docs/references/writer-reviewer-protocol.md`](docs/references/writer-reviewer-protocol.md) | Ping-pong, criterios de salida, N=2 rondas máximo |
| [`docs/references/style-contract-schema.md`](docs/references/style-contract-schema.md) | Schema YAML del Style Contract |
| [`docs/references/audit-log-schema.md`](docs/references/audit-log-schema.md) | Schema JSON del audit log |
| [`METODOLOGIA AISD.md`](METODOLOGIA%20AISD.md) | Manual operativo del catálogo Inetum — 10 fases DF→MVP |
| [`docs/Inetum/Catalogo/`](docs/Inetum/Catalogo/) | Fichas de agentes ya admitidos en el catálogo Inetum |
| [`.claude/agents/playwright-test-*.md`](.claude/agents/) | Subagents nativos Microsoft (referencia técnica, no editar) |

## Vocabulario del proyecto

Distinguir según audiencia:

- **Hacia I+D Inetum y docs formales**: Orquestador, Sub-agentes, Comandos, Hooks, MCPs. AISD (DF, DT, RF, criterios, fases). Marco QA propio (5 actos).
- **Internamente / arquitectura**: subagent, command, hook, MCP. Cuatro módulos S1/S2/S3/S4. Capa transversal. Quality layer. Regla suavizada.
- **No mezclar dentro del mismo documento.** Crea esquizofrenia.

## Preferencias de trabajo con Claude

Las preferencias transversales (sin sycophancy, prosa directa, sin emojis, push back con dato, surface assumptions) viven en `~/.claude/CLAUDE.md` global. Resumen aplicable aquí: **no asumir; ante duda relevante, preguntar antes de actuar o escribir**. Trivialidades de formato sí se asumen; intención no.
