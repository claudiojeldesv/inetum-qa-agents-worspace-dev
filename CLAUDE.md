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
10. **Gates opcionales, off por defecto (v0.2 `design/gates-off-by-default`)**: `ia4d-pii-scanner`, `ia4d-judge` y el **gate** de `ia4d-a11y-injector` están **apagados por defecto y reactivables**, NO eliminados — funcionalidades del producto que se encienden cuando el cliente las necesita. Las piezas siguen completas en el repo (hook, agente Judge, lógica del gate). Reactivación: `QA_ENABLE_PII=1` (PII), `QA_ENABLE_JUDGE=1` (Judge), `fail_on_violations: true` en el Style Contract (gate a11y por-sitio). El **scan** de a11y se sigue inyectando siempre; lo apagado es solo el gate que aborta. Esta regla matiza las reglas #3 y #8.

## Estado actual

Historial completo de fases, releases y hallazgos en [`docs/STATUS.md`](docs/STATUS.md) (carga lazy — ábrelo cuando la tarea pida contexto histórico). Lo más reciente, comprimido:

- **Token-efficiency Fase 6 (branch `design/token-efficiency`, ciclo 2)**: Writer en Haiku **descartado por A/B congelado** — approved-rate a iter ≤1 cayó 4/4→2/4, 9 must-fix (vs 0, con una clase sistemática: API de axe inventada), 2/4 writers no cerraron el protocolo solos, y el Reviewer Sonnet ×2,5 invocaciones se come el ahorro (~neutro o peor, wall-clock ×2,3). Verificación final en paridad (2/4, mismas clases): la red Reviewer+pre-review+rescate contiene al Writer barato, pero contiene pagando. El Writer sigue en Sonnet. F7 (main Haiku) condicional al apetito del QA, con señal desfavorable.
- **Token-efficiency Fase 5 (branch `design/token-efficiency`, ciclo 2 quick wins)**: Writers escalonados en los 3 commands funcionales (el primero solo — escribe la caché del prefijo —, el resto en paralelo; ~$0,4-0,5/run aritmético); `evidence.level` documentado como knob de coste (full = vitrina, cliente = minimal/steps) en schema + docs del template; gobernanza de modelo (`--model sonnet`, prohibido `CLAUDE_CODE_SUBAGENT_MODEL`). Sin medición de run por diseño (efectos bajo el suelo de ruido ±$3).
- **Token-efficiency Fase 4 (branch `design/token-efficiency`, cierre del plan)**: orquestación mecánica S4 → `src/scripts/run-s4-mecanico.ts` (5 stages: setup / check-fragments / checkpoint / post-writers / verify; exit 3 = pausa ask-first preservada, env-vars las setea el script). `autonomous.md` documenta el flujo y delega. Medido: main 79→46 calls, run $11,2 / ~18 min (baseline $12,4 / 35 min), 5/5 approved; 0/5 verdes por dos clases de fallo pre-existentes (gap discovery cart + observación imprecisa del planner) → Healer/ajuste, decisión QA. `consolidate-reviews` tolerante a objetos concatenados (bug multi-iteración del Reviewer; fix del prompt pendiente, flaggeado).
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
