# Proyecto: `ia4d-qa-automator` — categoría Documentación y Calidad del catálogo `ia4d-*`

Construir el primer agente QA del catálogo Inetum: **`ia4d-qa-automator`**. Multiplicador de productividad para SDETs e ingenieros QA, multi-modo según la información disponible, con marco QA propio (no fase 07 estricta de AISD), Quality layer Writer+Reviewer+Judge que materializa "QA es juez independiente", y capa transversal de compliance regulado, accesibilidad y trazabilidad auditable.

Es el primer entregable de una cartera más amplia (`test-explorer`, `test-healer-pro`, `test-data-architect`, `test-quality-analyst`, `ai-feature-quality`, etc.). Cada uno tendrá su propio SPEC cuando llegue su turno. **Foco actual: solo `qa-automator`**.

## Sobre nosotros

Ingeniero QA / SDET con experiencia en banca y seguros regulados. Foco profesional: experto en agentes Claude Code aplicados a QA — intersección rara entre conocimiento QA en dominios regulados y capacidad agéntica.

## Posicionamiento del producto

- **Lead de venta**: *"Tu SDET pasa de un flujo funcional (o solo URL) a tests Playwright estructurados con POM, A11y baked-in y trazabilidad auditable, en minutos, con un Reviewer independiente que audita al Writer antes de exponer el código"*. Velocidad + estructura como impacto demostrable.
- **Argumento estructural** (no de venta, de naturaleza): **dev no puede ser juez y parte**. `ia4d-testing-core` es la herramienta del dev que escribe tests sobre su propio código. `ia4d-qa-automator` es la herramienta del juez QA independiente. Misión distinta, no perspectiva distinta. Las herramientas QA tienen **otra forma de operar**.
- **Backup (regulated safety)**: compliance pre-flight sin override, PII detector ES (DNI/IBAN/Luhn/teléfono/email), A11y baked-in (axe-core, WCAG 2.1 AA / EAA 2025), audit log JSON append-only para evidencia regulatoria.
- **Público primario**: SDET (usuario directo) + QA Manager (decisor cliente) + I+D Inetum (decisor catálogo).
- **Anti-positioning**: NO sustituye a `ia4d-testing-core`. Coexisten con misiones incompatibles — testing-core opera desde la perspectiva dev (whitebox total sobre código propio), qa-automator desde la perspectiva juez QA (greybox o black-box, cuatro modos según input).

## Marco QA propio (no AISD fase 07 estricta)

`ia4d-qa-automator` opera **transversal por disciplina QA propia**, no por imitar a `ia4d-quality-engineer-expert`. Justificación: QA es disciplina, no fase del proceso dev. Automatizar un sitio tiene estrategias distintas a desarrollar código.

Cinco actos:

1. **Comprender** — Determinar modo de entrada (S1/S2/S3/S4) y validar target.
2. **Mapear** — Discovery del target. Identificar pantallas, flujos, criticidad, riesgo.
3. **Estructurar** — POM determinístico, Style Contract aplicado, fixtures, datos sintéticos.
4. **Materializar** — Writer genera tests; capa transversal (compliance/PII/A11y/style) los enforce.
5. **Juzgar** — Reviewer audita al Writer (ping-pong con N≤2 iteraciones), Judge puntúa, SDET sign-off.

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
└── ia4d-{code-analyzer,spec-parser,spec-refiner}.md    (stubs S1/S2/S3, v0.2+)

.claude/commands/qa-automator/
├── healthcheck.md
├── autonomous.md                                       (S4 funcional)
├── code-driven.md  req-driven.md  spec-refiner.md      (stubs)
```

**Regla arquitectónica suavizada**: por defecto, los subagents `ia4d-*` no se invocan entre sí — la orquestación vive en los commands con handoff por archivos. **Excepción documentada y nombrada**: el par Writer↔Reviewer se invoca directamente vía Task tool dentro del Writer (composición explícita del patrón Writer+Reviewer, no acoplamiento ad-hoc). Auditabilidad se preserva por `audit-log.json`, no por estructura. Ver [`references/composition-rules.md`](references/composition-rules.md).

Detalle completo en [`SPEC.md`](SPEC.md).

## Wrapper sobre Playwright Test Agents nativos

Playwright v1.56+ trae tres subagents nativos (Planner, Generator, Healer) instalados con `npx playwright init-agents --loop=claude`. **No los reimplementamos** — los rodeamos con capas que aportan lo que Microsoft no construirá: compliance regulado, convenciones de cliente, trazabilidad auditable, A11y obligatorio, PII detection ES, Quality layer Writer+Reviewer+Judge.

Datos consolidados del Slice 0.5 (ver [`docs/findings/spike-playwright-mcp.md`](docs/findings/spike-playwright-mcp.md)):

| Invocación | Tokens | Tool uses | Duración |
|---|---|---|---|
| Planner SauceDemo | 32,051 | 38 | 3.4 min |
| Generator (1 test) | 30,751 | 25 | 3.4 min |

Modelo confirmado para Planner/Generator nativos: `sonnet`. Para subagents `ia4d-*`: Sonnet para Writer/Reviewer/Spec-refiner (razonamiento), Haiku para Judge y mecánicos (style-enforcer/pii-scanner/a11y-injector/discovery-analyzer/mode-router).

## Reglas duras

1. **Patrón Inetum cumplido externamente** (Orquestador → Sub-agentes → Comandos → Hooks → MCPs visibles para I+D, en la ficha del catálogo y en la documentación pública), arquitectura peer internamente. No hay contradicción.
2. **Subagents no se invocan entre sí salvo excepción documentada**. Por defecto, commands orquestan vía Task tool. Handoff por archivos. Excepción nombrada: Writer↔Reviewer.
3. **Compliance pre-flight + PII detector no tienen flag de override**. Cualquier salto rompe el SPEC.
4. **Style Contract L0** declara convenciones del cliente (POM, naming, locators, fixtures). El agente lo lee y enforce el output del Generator nativo. Si no hay contract, default del agente + log.
5. **Validación determinística**, no LLM-as-validator. AST + JSON Schema + regex. LLM-as-judge sí existe — pero es scoring de calidad, no validador binario de compliance.
6. **Datos productivos fuera del contexto**. El agente trabaja con artefactos de definición (FD/TD/OpenAPI) y datos sintéticos declarados. Nunca con dumps reales. Context Injector (v0.4 con asterisco "no genérico") es la única excepción contemplada y queda fuera de MVP/v0.2/v0.3.
7. **POM esqueleto generado por código determinístico** (`src/pom-scaffolder.ts`), no por LLM. El LLM solo rellena locators y acciones específicas. Justificación: velocidad + estructura consistente.
8. **Quality layer obligatorio**: Writer + Reviewer + Judge los tres activos. El Reviewer puede pedir hasta dos iteraciones al Writer antes de aprobar. El Judge da score numérico final.
9. **Behavioral non-negotiables siempre activos**: surface assumptions, push back con dato, scope discipline, verify-don't-assume, no rationalize shortcuts. Si una tarea está fuera del SPEC, decirlo, no estirar.

## Estado actual

- **v0.1 commit-eado** (`c5a2be2`, 82 archivos, 9845 líneas). Validación híbrida via Slice 6.5: 3/3 specs E2E verdes contra SauceDemo, judge scores 0.9-0.96.
- **Pendiente cierre v0.1**: validación end-to-end LLM-LLM en sesión Claude Code nueva (los subagents `ia4d-*` creados en sesión no son invocables hasta restart).
- **v0.2 — Interactuar con el caos** (próxima fase, no arrancada): redefinida para atacar el gap entre sandbox SauceDemo y caos web real. Orden estricto: cierre v0.1 → recolección honesta contra sitios reales (opencart, parabank, expandtesting) → hardening por categoría observada → ajustes Quality layer → telemetría + budget cap. TMS connectors deferidos a v0.2.x.
- **Sin plazo de calendario comprometido**. Plan en fases con checkpoints.

## Documentación viva

Carga **eager** (siempre presente vía referencia mental al cargar este CLAUDE.md): nada por ahora. El SPEC.md se lee bajo demanda.

Carga **lazy** (Claude lee cuando la tarea lo pide):

| Doc | Cuándo abrirlo |
|---|---|
| [`SPEC.md`](SPEC.md) | Definición del agente: objective, modos, commands, structure, code style, boundaries, roadmap |
| [`docs/findings/spike-playwright-mcp.md`](docs/findings/spike-playwright-mcp.md) | Mediciones reales del Planner+Generator, decisiones data-dependent cerradas |
| [`references/compliance-rules.md`](references/compliance-rules.md) | Qué bloquea el pre-flight, sin override |
| [`references/pii-patterns.md`](references/pii-patterns.md) | Regex DNI/IBAN/Luhn/teléfono/email ES |
| [`references/composition-rules.md`](references/composition-rules.md) | Excepción Writer↔Reviewer documentada |
| [`references/writer-reviewer-protocol.md`](references/writer-reviewer-protocol.md) | Ping-pong, criterios de salida, N=2 rondas máximo |
| [`references/style-contract-schema.md`](references/style-contract-schema.md) | Schema YAML del Style Contract |
| [`references/audit-log-schema.md`](references/audit-log-schema.md) | Schema JSON del audit log |
| [`METODOLOGIA AISD.md`](METODOLOGIA%20AISD.md) | Manual operativo del catálogo Inetum — 10 fases DF→MVP |
| [`docs/Inetum/Catalogo/`](docs/Inetum/Catalogo/) | Fichas de agentes ya admitidos en el catálogo Inetum |
| [`.claude/agents/playwright-test-*.md`](.claude/agents/) | Subagents nativos Microsoft (referencia técnica, no editar) |
| [`conversacion-gemini.txt`](conversacion-gemini.txt) | Referencia estratégica del pivot desde test-pilot |

## Vocabulario del proyecto

Distinguir según audiencia:

- **Hacia I+D Inetum y docs formales**: Orquestador, Sub-agentes, Comandos, Hooks, MCPs. AISD (DF, DT, RF, criterios, fases). Marco QA propio (5 actos).
- **Internamente / arquitectura**: subagent, command, hook, MCP. Cuatro módulos S1/S2/S3/S4. Capa transversal. Quality layer. Regla suavizada.
- **No mezclar dentro del mismo documento.** Crea esquizofrenia.

## Preferencias de trabajo con Claude

Las preferencias transversales (sin sycophancy, prosa directa, sin emojis, push back con dato, surface assumptions) viven en `~/.claude/CLAUDE.md` global. Resumen aplicable aquí: **no asumir; ante duda relevante, preguntar antes de actuar o escribir**. Trivialidades de formato sí se asumen; intención no.
