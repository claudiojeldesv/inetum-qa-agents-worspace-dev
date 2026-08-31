# Proyecto: `ia4d-qa-automator` — categoría Documentación y Calidad del catálogo `ia4d-*`

Construir el primer agente QA del catálogo Inetum: **`ia4d-qa-automator`**. Multiplicador de productividad para ingenieros QA, multi-modo según la información disponible, con marco QA propio (no fase 07 estricta de AISD), Quality layer Writer+Reviewer+Judge que materializa "QA es juez independiente", y capa transversal de compliance regulado, accesibilidad y trazabilidad auditable.

Es el primer entregable de una cartera más amplia (`test-explorer`, `test-healer-pro`, `test-data-architect`, `test-quality-analyst`, `ai-feature-quality`, etc.). Cada uno tendrá su propio SPEC cuando llegue su turno. **Foco actual: solo `qa-automator`**.

Este fichero es un **mapa**, no un compendio: lo normativo vive aquí; lo informativo (posicionamiento, arquitectura, estado, mediciones) vive en `docs/` y se abre bajo demanda — tabla en «Documentación viva».

## Sobre nosotros

Ingeniero QA con experiencia en banca y seguros regulados. Foco profesional: experto en agentes Claude Code aplicados a QA — intersección rara entre conocimiento QA en dominios regulados y capacidad agéntica.

## Posicionamiento, marco QA y módulos (resumen — detalle en SPEC.md §1)

- **Posicionamiento**: dev no puede ser juez y parte — `ia4d-testing-core` es la herramienta del dev sobre su propio código; `ia4d-qa-automator` es la del juez QA independiente (greybox/black-box). Lead de venta, backup regulated-safety, público y anti-positioning: [SPEC.md](SPEC.md) §1 y [`docs/findings/diferenciacion-vs-testing-core.md`](docs/findings/diferenciacion-vs-testing-core.md).
- **Marco QA propio, 5 actos** (Comprender → Mapear → Estructurar → Materializar → Juzgar): tabla en [SPEC.md](SPEC.md) §1. QA es disciplina, no fase del proceso dev.
- **Cuatro módulos de entrada** (estado real y subagent driver en [SPEC.md](SPEC.md) §1 — fuente de verdad):
  - **S4 Autonomous** (solo URL) — funcional. **S3 Spec-refiner** (FD + URL) — funcional. **S2 Req-driven** (Gherkin + URL) — funcional; OpenAPI diferido. **S1 Code-driven** (repo frontend) — stub.
- **Contexto Inetum**: patrón canónico Orquestador → Sub-agentes → Comandos → Hooks → MCPs; destino la pestaña Documentación y Calidad del catálogo de Agentes. Ficha canónica ①-⑦ y mapeo AISD por fase: [`docs/Inetum/Catalogo/ia4d-qa-automator.md`](docs/Inetum/Catalogo/ia4d-qa-automator.md); metodología en [`METODOLOGIA AISD.md`](METODOLOGIA%20AISD.md).

## Arquitectura (resumen — detalle en SPEC.md §3)

Peer subagents en `.claude/agents/` (nativos Microsoft + `ia4d-*` propios), orquestados por commands en `.claude/commands/qa-automator/`. Handoff por archivos. Árbol completo, deprecations de token-efficiency y estructura del repo: [SPEC.md](SPEC.md) §3 y [`docs/references/composition-rules.md`](docs/references/composition-rules.md).

**Wrapper sobre Playwright Test Agents nativos**: Playwright v1.56+ trae Planner/Generator/Healer nativos (`npx playwright init-agents --loop=claude`). **No los reimplementamos** — los rodeamos con lo que Microsoft no construirá: compliance regulado, convenciones de cliente, trazabilidad, A11y obligatorio, PII ES, Quality layer. Mediciones reales en [`docs/findings/spike-playwright-mcp.md`](docs/findings/spike-playwright-mcp.md).

**Asignación de modelos** (normativa al crear o tocar subagents): Planner/Generator nativos → `sonnet`. Subagents `ia4d-*`: **Sonnet** para Writer/Reviewer/Spec-refiner y code-analyzer (razonamiento); **Haiku** para Judge y mecánicos (style-enforcer/pii-scanner/a11y-injector/discovery-analyzer/mode-router/spec-parser).

## Reglas duras

1. **Patrón Inetum cumplido externamente** (Orquestador → Sub-agentes → Comandos → Hooks → MCPs visibles para I+D, en la ficha del catálogo y en la documentación pública), arquitectura peer internamente. No hay contradicción.
2. **Subagents no se invocan entre sí salvo excepción documentada**. Por defecto, commands orquestan vía Task tool. Handoff por archivos. Excepción nombrada: Writer↔Reviewer (composición explícita del patrón, no acoplamiento ad-hoc; auditabilidad por `audit-log.json`, no por estructura — ver [`docs/references/composition-rules.md`](docs/references/composition-rules.md)).
3. **Compliance pre-flight no tiene flag de override**. Cualquier salto rompe el SPEC. (El **PII detector** pasó a ser **off por defecto, reactivable** con `QA_ENABLE_PII` desde v0.2 `design/gates-off-by-default` — ver regla #10. La guarda anti-`test.fixme()` del mismo hook sigue siempre activa.)
4. **Style Contract L0** declara convenciones del cliente (POM, naming, locators, fixtures). El agente lo lee y enforce el output del Generator nativo. Si no hay contract, default del agente + log.
5. **Validación determinística**, no LLM-as-validator. AST + JSON Schema + regex. LLM-as-judge sí existe — pero es scoring de calidad, no validador binario de compliance.
6. **Datos productivos fuera del contexto**. El agente trabaja con artefactos de definición (FD/TD/OpenAPI) y datos sintéticos declarados. Nunca con dumps reales. Context Injector (v0.4 con asterisco "no genérico") es la única excepción contemplada y queda fuera de MVP/v0.2/v0.3.
7. **POM esqueleto generado por código determinístico** (`src/pom-scaffolder.ts`), no por LLM. El LLM solo rellena locators y acciones específicas. Justificación: velocidad + estructura consistente.
8. **Writer + Reviewer obligatorios**: el núcleo del Quality layer. El Reviewer puede pedir hasta dos iteraciones al Writer antes de aprobar. El **Judge es opcional, off por defecto** (`QA_ENABLE_JUDGE`) desde v0.2 `design/gates-off-by-default` — ver regla #10. Cuando se activa, da score numérico final.
9. **Behavioral non-negotiables siempre activos**: surface assumptions, push back con dato, scope discipline, verify-don't-assume, no rationalize shortcuts. Si una tarea está fuera del SPEC, decirlo, no estirar.
10. **Gates opcionales, off por defecto (v0.2 `design/gates-off-by-default`)**: `ia4d-pii-scanner`, `ia4d-judge`, el **gate** de `ia4d-a11y-injector` y la **sanación** (`healing`, desde v0.3 quality-greens Q3) están **apagados por defecto y reactivables**, NO eliminados — funcionalidades del producto que se encienden cuando el cliente las necesita. Las piezas siguen completas en el repo (hook, agente Judge, lógica del gate, command `/qa-automator:heal` + `run-heal-mecanico.ts`). Reactivación: `QA_ENABLE_PII=1` (PII), `QA_ENABLE_JUDGE=1` (Judge), `fail_on_violations: true` en el Style Contract (gate a11y por-sitio), `healing.enabled: true` en el Style Contract (autonomous encadena la sanación sobre los rojos; sin él, reporta rojos y termina — `/qa-automator:heal` queda siempre disponible como post-proceso desacoplado, con protocolo de auditoría post-heal: el Healer no es juez). El **scan** de a11y se sigue inyectando siempre; lo apagado es solo el gate que aborta. Esta regla matiza las reglas #3 y #8.

## Estado actual

Historial completo de fases, releases y hallazgos en [`docs/STATUS.md`](docs/STATUS.md) (las entradas nuevas se añaden ARRIBA allí; aquí solo las 3-4 más recientes, comprimidas). Los defectos D-NN están catalogados en [`docs/references/indice-defectos.md`](docs/references/indice-defectos.md) — 73 a fecha 2026-08-31, con guarda mecánica.

- **Ciclo E2E en terreno virgen III · EspoCRM (2026-08-31)** — CRM de negocio (sesión, listados, alta y baja), el back-office más parecido al de un cliente. El primer run salió 23/89 y la culpa era del producto: **D71 — el viewport no lo declaraba ninguna capa**, así que los TRES ciclos habían corrido al default de Playwright (1280×720) sin saberlo; EspoCRM pliega el menú a esa anchura y 'Cuentas' existe pero nunca es visible (A/B: NUNCA en 20 s vs **1553 ms** a 1400×900). Declarado el viewport: **71/89 y 18 bloqueos**. Cerrado con rebanada de 9 tests (`resolveViewport` con precedencia CLI > contract > default INTACTO, campo en el contract, el viewport impreso siempre, y `notaTextoOculto` que distingue «no está» de «está y no se ve»). Abiertos **D72** (la ventana de quietud confunde «no ha empezado» con «ya terminó», y la calibración aprende de runs ciegos) y **D73** (el rescate comprado se pierde al reanudar y detrás vienen declinaciones garantizadas de ~44k: al triaje le falta la clase «la pantalla no había pintado»). Modos: motor solo 71/89 con el peldaño ANCLADO resolviendo en SPA moderna y un verde peligroso cazado (`Cliente` ⊂ `Posibles clientes`); walker+IA 2 llamadas/~85k/0 desbloqueos netos; solo IA 8/10 con los dos FALLA correctos (~242k). Dossier: [`docs/findings/e2e-espocrm.md`](docs/findings/e2e-espocrm.md).

- **Ciclo E2E en terreno virgen II · Tricentis Insurance (2026-08-31)** — segundo sitio jamás tocado (tarificador de pólizas, dominio seguros), mismo protocolo y el **triaje de serie validado**: reconocimiento + 3 sondas → planner (236k; 2 candidatos a defecto propios y un ReferenceError en el envío exitoso) → FD de 10 casos con oráculo de precios determinista (88.00/260.00/510.00/972.00, medido ×2) → motor solo 173/237 con 64 bloqueos con causa (los 24 selects de la fachada ideal-forms TODOS verdes; la cascada madre son los radios/checkboxes ocultos) → walker+IA **2 llamadas/~92k/1 desbloqueo con alias promovido** (vs 13/538k/0 del primer contacto RBP sin triaje) → solo IA 9/10 con el único FALLA correcto (CP010) por 310k re-pagados. Descubrimiento mayor: radios de tarifa a `left:-9999px` con binding solo-jQuery — clic JS marca A LA VISTA sin actualizar el importe interno; la regla del futuro peldaño check-de-fachada (accionar el control VISIBLE) queda escrita con dato. Estreno manual del QA pendiente. Dossier: [`docs/findings/e2e-tricentis-insurance.md`](docs/findings/e2e-tricentis-insurance.md).

- **Ciclo E2E en terreno virgen · Restful Booker (2026-08-30)** — primer ciclo completo sobre un sitio jamás tocado: reconocimiento con capturas → planner nativo (13 TCs, 145k) → FD onesait de 10 casos desde la UI → walk-script → tres modos medidos: motor solo (72/111, 39 bloqueos con causa, 0 tokens), walker+IA (~538k, CERO desbloqueos — destapó D68 y D69) y solo IA (8/10, 212k re-pagados, 2 descubrimientos de negocio). El sitio tiene un defecto real (409 de doble-booking revienta el frontend) que CP010 pisa a propósito. **El mismo día se cerraron D68 y D69 con el triaje del rescate** (enrutar por clase de motivo + scope en la petición + gramática real + anti-eco + aislamiento en reanudación): re-medido en los DOS sitios — RBP de 13 llamadas/538k/0 desbloqueos a 3/136k/4, y OrangeHRM conserva su rescate legítimo 6/8. Queda el estreno manual del QA con paneles. Dossier: [`docs/findings/e2e-restful-booker.md`](docs/findings/e2e-restful-booker.md).

- **P3 · posturas del panel (2026-08-30)** — barra (─), fantasma (◌, transparente a los clics con la cabecera viva), Alt+P, la tira de pasos del caso entero, y preferencias durables por sitio (`config/panel-prefs/`). Escape no toca el panel POR CONTRATO DE TEST, y la medición que P3 exigía quedó fijada: el panel NO contamina el scan de axe. Primera rebanada bajo el protocolo del banco: 15/15 contra OrangeHRM real ANTES de la primera vez del QA, grabación incluida con el panel en barra. Queda P4 como decisión, no como tarea. Detalle en P3 de [`docs/tasks/plan-panel-y-acta.md`](docs/tasks/plan-panel-y-acta.md).
- **El bloque «la IA usa el walker» (2026-08-30)** — cuatro piezas que mueven tokens re-pagados a determinismo gratis: D66 (la reanudación del rescate ya no se envenena con la sesión del testigo), D16 (los locators MEDIDOS viajan al POM y al verificador con un solo parser fail-closed — 150/161 elementos en OrangeHRM, antes cero), D5 (el `expect_state` verde deja locator autoritativo: ~130k de planner ahorrados por flujo), y G2 del gate (`npm run qa:smoke` separa rojos de locator/aserción/entorno — el Writer jamás «arregla» un oráculo — y `MF-eligio-a-ciegas` caza el `.first()` sobre base ambigua CON el test en verde). Desviación de G2 escrita en [`docs/tasks/plan-gate-locators-medidos.md`](docs/tasks/plan-gate-locators-medidos.md).

Trabajo posterior a estas entradas (gira de dominio D48–D52, plan del gate de locators medidos, genericidad del motor): ver los findings enlazados abajo y [`docs/STATUS.md`](docs/STATUS.md).

## Documentación viva

Carga **eager** (siempre presente vía referencia mental al cargar este CLAUDE.md): nada por ahora. El SPEC.md se lee bajo demanda.

Carga **lazy** (Claude lee cuando la tarea lo pide):

| Doc | Cuándo abrirlo |
|---|---|
| [`SPEC.md`](SPEC.md) | Definición del agente: objective, posicionamiento, modos, commands, structure, code style, boundaries, roadmap |
| [`docs/STATUS.md`](docs/STATUS.md) | Historial completo de fases, releases y hallazgos (la vieja sección "Estado actual") |
| [`docs/references/indice-defectos.md`](docs/references/indice-defectos.md) | **El catálogo D1–D63**: qué es cada defecto, dónde se midió, dónde vive el arreglo, estado. Primer sitio donde buscar un D-número |
| [`docs/references/field-sites-schema.md`](docs/references/field-sites-schema.md) | **Montar un workspace de campo**: `npm run field:deploy -- --site=<sitio> --dest=<ruta>`. Recetas en `config/field-sites/`, sello `FIELD.json`, y por qué el desplegador verifica el allowlist pero JAMAS lo escribe |
| [`docs/SPEC-kernel-v2.md`](docs/SPEC-kernel-v2.md) | Spec congelado del kernel v2 (K0.1–K0.17: escalera de resolución, walk-script, aliases) |
| [`docs/SPEC-caos-corporativo.md`](docs/SPEC-caos-corporativo.md) | Spec de la gira de stacks corporativos (K0.18–K0.41, un ciclo por sección; usa un D1..D4 LOCAL por ciclo) |
| [`docs/findings/`](docs/findings/) | Informes de campo, uno por run o loop: `run-beta-parabank[-N].md` (6 runs), `loop-convergencia-saucedemo.md`, `loop-orangehrm.md`, `gira-dominio-mifos-dolibarr.md`, `genericidad-del-motor.md`, `coste-tokens-qa-automator.md`, `gates-off-by-default.md`, `banco-de-pruebas-paneles.md` |
| [`docs/findings/spike-playwright-mcp.md`](docs/findings/spike-playwright-mcp.md) | Mediciones reales del Planner+Generator, decisiones data-dependent cerradas |
| [`docs/findings/banco-mind2web.md`](docs/findings/banco-mind2web.md) | La escalera medida contra Mind2Web (6.249 casos, 73 sitios): método, las tres reparaciones de la foto y sus ablaciones, limitaciones del corpus, y el experimento que se midió y se deshizo |
| [`docs/findings/comparativa-walker-vs-llm.md`](docs/findings/comparativa-walker-vs-llm.md) | Walker determinista vs. LLM (Sakai y OrangeHRM): tokens, reloj, determinismo, verde falso en AMBOS motores, 5 defectos abiertos y 7 hipótesis falsables con su experimento |
|  [`docs/tasks/continuacion-2026-08-30.md`](docs/tasks/continuacion-2026-08-30.md) | **EMPIEZA AQUÍ si retomas el trabajo**: estado, qué implementar y en qué orden, y las reglas operativas que ya se pagaron |
| [`docs/tasks/`](docs/tasks/) | Planes activos: `plan-panel-y-acta.md` (el panel decide y la decisión queda firmada — P0/P1/P2/P5-A-B cerrados; quedan P6, P3, P4), `plan-datos-consumibles.md` (el dato que se quema), `plan-gate-locators-medidos.md` (la regla dura del walker en el camino del planner) |
| [`docs/demo/`](docs/demo/) | Guías de campo para el QA: `guia-panel-orangehrm.md` (resolver paneles y fundirlos en el plan) y `guia-veredicto-postcondicion.md` (decidir quién tiene razón cuando una postcondición no se cumple), con los artefactos reales de cada ejercicio |
| [`docs/audit/`](docs/audit/) | Auditorías y planes cerrados: token-efficiency, quality-greens (origen de `verify-locators`) |
| [`docs/references/compliance-rules.md`](docs/references/compliance-rules.md) | Qué bloquea el pre-flight, sin override |
| [`docs/references/pii-patterns.md`](docs/references/pii-patterns.md) | Regex DNI/IBAN/Luhn/teléfono/email ES |
| [`docs/references/composition-rules.md`](docs/references/composition-rules.md) | Excepción Writer↔Reviewer documentada |
| [`docs/references/writer-reviewer-protocol.md`](docs/references/writer-reviewer-protocol.md) | Ping-pong, criterios de salida, N=2 rondas máximo |
| [`docs/references/style-contract-schema.md`](docs/references/style-contract-schema.md) | Schema YAML del Style Contract |
| [`docs/references/audit-log-schema.md`](docs/references/audit-log-schema.md) | Schema JSON del audit log |
| [`docs/references/decisions-schema.md`](docs/references/decisions-schema.md) | **El acta de decisiones del QA** (`config/decisions/<site>.jsonl`): entrada, cadena de hashes, grados de evidencia, y qué garantiza y qué no |
| [`docs/references/autonomous-operations.md`](docs/references/autonomous-operations.md) | Operativa del modo autónomo |
| [`docs/references/fd-criteria-schema.md`](docs/references/fd-criteria-schema.md) | Schema de criteria.json (S3) |
| [`docs/references/spec-template.md`](docs/references/spec-template.md) | Forma canónica de un .spec.ts generado |
| [`CHANGELOG.md`](CHANGELOG.md) | Estado real por versión y releases |
| [`METODOLOGIA AISD.md`](METODOLOGIA%20AISD.md) | Manual operativo del catálogo Inetum — 10 fases DF→MVP |
| [`docs/Inetum/Catalogo/`](docs/Inetum/Catalogo/) | Fichas de agentes ya admitidos en el catálogo Inetum (la nuestra: `ia4d-qa-automator.md`) |
| [`.claude/agents/playwright-test-*.md`](.claude/agents/) | Subagents nativos Microsoft (referencia técnica, no editar) |

## Vocabulario del proyecto

Distinguir según audiencia:

- **Hacia I+D Inetum y docs formales**: Orquestador, Sub-agentes, Comandos, Hooks, MCPs. AISD (DF, DT, RF, criterios, fases). Marco QA propio (5 actos).
- **Internamente / arquitectura**: subagent, command, hook, MCP. Cuatro módulos S1/S2/S3/S4. Capa transversal. Quality layer. Regla suavizada.
- **No mezclar dentro del mismo documento.** Crea esquizofrenia.

Los **D-números** (D1–D55…) son defectos de campo — catálogo en [`docs/references/indice-defectos.md`](docs/references/indice-defectos.md). Los **K0.x** son ciclos del kernel v2 y de la gira de stacks. Ojo con las dos colisiones documentadas en la cabecera del índice.

## Preferencias de trabajo con Claude

Las preferencias transversales (sin sycophancy, prosa directa, sin emojis, push back con dato, surface assumptions) viven en `~/.claude/CLAUDE.md` global. Resumen aplicable aquí: **no asumir; ante duda relevante, preguntar antes de actuar o escribir**. Trivialidades de formato sí se asumen; intención no.
