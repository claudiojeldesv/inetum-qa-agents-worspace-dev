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

Historial completo de fases, releases y hallazgos en [`docs/STATUS.md`](docs/STATUS.md) (las entradas nuevas se añaden ARRIBA allí; aquí solo las 3-4 más recientes, comprimidas). Los defectos D-NN están catalogados en [`docs/references/indice-defectos.md`](docs/references/indice-defectos.md) — 55 a fecha 2026-08-24, con guarda mecánica.

- **G1/G3 + I6 · el gate de locators medidos, y D10/D23 (2026-08-24)** — la regla dura del walker llevada al camino del planner (`MF-locator-no-medido` en pre-review) y el verificador reportando el nombre accesible real. Medido: 6/6 del corpus rojo marcados, 0 falsos positivos en 5 specs verdes. En sitio nuevo (the-internet) iter1 4/6 e iter2 6/6 doble verde, contra 0/6 y 3/6 de Dolibarr sin gate. Y lo grabado por el QA ya sobrevive al panel y al proceso (D10/D23, verificado en campo). Qué implementar ahora y en qué orden: [`docs/tasks/continuacion-2026-08-24.md`](docs/tasks/continuacion-2026-08-24.md).
- **D46/D47 — re-test ParaBank (beta.14)**: D46 cerrado (el productor de `emit_locator` que faltaba; 0→2 specs con el mismo dom-map) y primera pasada doble verde de ParaBank (2/2 ×2). El efecto del idioma del FD reproducido en segundo sitio (2/7 sin citar vs 17/18 citado). D47 abierto por diseño. Detalle: [`docs/findings/run-beta-parabank-6.md`](docs/findings/run-beta-parabank-6.md).
- **D44/D45 — loop OrangeHRM cerrado en 2 verdes**: carril determinista entero (3 specs, $0, 18 min); A/B del idioma cerrado sobre tres sitios (OrangeHRM 22/22 con FD citado); D44 (flujo no autocontenido) cazado por `check-walk-script --contract=`; D45 (baseURL por defecto apuntando a otro sitio) cerrado con precedencia + aviso. Detalle: [`docs/findings/loop-orangehrm.md`](docs/findings/loop-orangehrm.md).
- **K0.45–K0.47 — segundo run de campo ParaBank y panel auditado**: D12/D18/D19/D20 cerrados (marcador en disco, deriva de versión en healthcheck, gate por ausencia de oráculo, lista blanca de locators emisibles fail-closed); las 10 salidas del panel auditadas (`executed`/`fragile`; lo frágil nunca entra en memoria durable). Detalle: [`docs/findings/run-beta-parabank-2.md`](docs/findings/run-beta-parabank-2.md).
- **K0.44 — la memoria distingue QUIÉN resolvió**: D3 (promoción de aliases bloqueada por drift ajeno — el gate de postcondición solo frena al subagente, no a la persona) y D10 (el panel muere con la navegación; vigilante + re-inyección acotada a 3) cerrados, ambos pendientes de verificación de campo. Detalle: [`docs/findings/run-beta-parabank.md`](docs/findings/run-beta-parabank.md).

Trabajo posterior a estas entradas (gira de dominio D48–D52, plan del gate de locators medidos, genericidad del motor): ver los findings enlazados abajo y [`docs/STATUS.md`](docs/STATUS.md).

## Documentación viva

Carga **eager** (siempre presente vía referencia mental al cargar este CLAUDE.md): nada por ahora. El SPEC.md se lee bajo demanda.

Carga **lazy** (Claude lee cuando la tarea lo pide):

| Doc | Cuándo abrirlo |
|---|---|
| [`SPEC.md`](SPEC.md) | Definición del agente: objective, posicionamiento, modos, commands, structure, code style, boundaries, roadmap |
| [`docs/STATUS.md`](docs/STATUS.md) | Historial completo de fases, releases y hallazgos (la vieja sección "Estado actual") |
| [`docs/references/indice-defectos.md`](docs/references/indice-defectos.md) | **El catálogo D1–D55**: qué es cada defecto, dónde se midió, dónde vive el arreglo, estado. Primer sitio donde buscar un D-número |
| [`docs/references/field-sites-schema.md`](docs/references/field-sites-schema.md) | **Montar un workspace de campo**: `npm run field:deploy -- --site=<sitio> --dest=<ruta>`. Recetas en `config/field-sites/`, sello `FIELD.json`, y por qué el desplegador verifica el allowlist pero JAMAS lo escribe |
| [`docs/SPEC-kernel-v2.md`](docs/SPEC-kernel-v2.md) | Spec congelado del kernel v2 (K0.1–K0.17: escalera de resolución, walk-script, aliases) |
| [`docs/SPEC-caos-corporativo.md`](docs/SPEC-caos-corporativo.md) | Spec de la gira de stacks corporativos (K0.18–K0.41, un ciclo por sección; usa un D1..D4 LOCAL por ciclo) |
| [`docs/findings/`](docs/findings/) | Informes de campo, uno por run o loop: `run-beta-parabank[-N].md` (6 runs), `loop-convergencia-saucedemo.md`, `loop-orangehrm.md`, `gira-dominio-mifos-dolibarr.md`, `genericidad-del-motor.md`, `coste-tokens-qa-automator.md`, `gates-off-by-default.md` |
| [`docs/findings/spike-playwright-mcp.md`](docs/findings/spike-playwright-mcp.md) | Mediciones reales del Planner+Generator, decisiones data-dependent cerradas |
| [`docs/findings/banco-mind2web.md`](docs/findings/banco-mind2web.md) | La escalera medida contra Mind2Web (6.249 casos, 73 sitios): método, las tres reparaciones de la foto y sus ablaciones, limitaciones del corpus, y el experimento que se midió y se deshizo |
| [`docs/findings/comparativa-walker-vs-llm.md`](docs/findings/comparativa-walker-vs-llm.md) | Walker determinista vs. LLM (Sakai y OrangeHRM): tokens, reloj, determinismo, verde falso en AMBOS motores, 5 defectos abiertos y 7 hipótesis falsables con su experimento |
| [`docs/tasks/continuacion-2026-08-24.md`](docs/tasks/continuacion-2026-08-24.md) | **EMPIEZA AQUÍ si retomas el trabajo**: estado, qué implementar y en qué orden, y las reglas operativas que ya se pagaron |
| [`docs/tasks/`](docs/tasks/) | Planes activos: `plan-panel-y-acta.md` (el panel decide y la decisión queda firmada), `plan-datos-consumibles.md` (el dato que se quema), `plan-gate-locators-medidos.md` (la regla dura del walker en el camino del planner) |
| [`docs/audit/`](docs/audit/) | Auditorías y planes cerrados: token-efficiency, quality-greens (origen de `verify-locators`) |
| [`docs/references/compliance-rules.md`](docs/references/compliance-rules.md) | Qué bloquea el pre-flight, sin override |
| [`docs/references/pii-patterns.md`](docs/references/pii-patterns.md) | Regex DNI/IBAN/Luhn/teléfono/email ES |
| [`docs/references/composition-rules.md`](docs/references/composition-rules.md) | Excepción Writer↔Reviewer documentada |
| [`docs/references/writer-reviewer-protocol.md`](docs/references/writer-reviewer-protocol.md) | Ping-pong, criterios de salida, N=2 rondas máximo |
| [`docs/references/style-contract-schema.md`](docs/references/style-contract-schema.md) | Schema YAML del Style Contract |
| [`docs/references/audit-log-schema.md`](docs/references/audit-log-schema.md) | Schema JSON del audit log |
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
