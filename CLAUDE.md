# Proyecto: `ia4d-test-pilot` — categoría QA del catálogo `ia4d-*`

Construir el primer agente de la categoría QA del catálogo Inetum: **`ia4d-test-pilot`**. Multiplicador de productividad para SDETs que envuelve los Playwright Test Agents nativos (v1.56+) y añade compliance, enforcement de convenciones cliente, accesibilidad baked-in y trazabilidad auditable. Diseñado para sectores regulados (banca, seguros) pero vendible primero por productividad inmediata.

Es el primer entregable de una cartera más amplia (`test-explorer`, `test-healer`, `test-data-architect`, `test-quality-analyst`, `ai-feature-quality`, etc.). Cada uno tendrá su propio SPEC cuando llegue su turno. **Foco actual: solo `test-pilot`**.

## Sobre nosotros

Ingeniero QA / SDET con experiencia en banca y seguros regulados. Foco profesional: experto en agentes Claude Code aplicados a QA — intersección rara entre conocimiento QA en dominios regulados y capacidad agéntica.

## Posicionamiento del producto

- **Lead de venta**: *"Tu SDET genera tests E2E desde cero contra una app que no conocía en 30 minutos"*. Productividad demostrable, demo de 30 min.
- **Backup (regulated safety)**: compliance pre-flight, PII detector, A11y baked-in (EAA 2025 / WCAG 2.1 AA), audit log, traceability a criterios.
- **Público primario**: SDET (usuario directo) + QA Manager (decisor cliente) + I+D Inetum (decisor catálogo).
- **Anti-positioning**: NO vendemos "alternativa a `ia4d-testing-core`". Coexistimos con propósitos distintos — testing-core genera tests desde código (perspectiva dev), nosotros desde la spec contra la app (perspectiva QA).

## Contexto Inetum

- Portal corporativo GenAI con dos secciones: Plugins (~70, dev-céntrico) y Agentes (curado por I+D). Nuestro destino: **pestaña Documentación y Calidad** del catálogo de Agentes.
- **Patrón canónico Inetum**: Orchestrator + Sub-agents + Commands + Hooks + MCPs. Lo respetamos en la presentación al catálogo. Internamente usamos arquitectura peer (ver siguiente sección) — equivalente funcionalmente, más limpia técnicamente.
- **Metodología AISD** (10 fases de DF a MVP, ver [`METODOLOGIA AISD.md`](METODOLOGIA AISD.md)): nuestra suite opera **across the SDLC**, no adscrita a una fase. Precedente: `ia4d-quality-engineer-expert` también opera así.

## Arquitectura del proyecto

Peer subagents en `.claude/agents/`, orquestados por commands en `.claude/commands/test-pilot/`. Co-existen subagents nativos de Playwright (Microsoft) y subagents `ia4d-*` propios — nuestros los rodean, no los sustituyen.

```
.claude/agents/
├── playwright-test-{planner,generator,healer}.md   (nativos Microsoft, vía init-agents)
└── ia4d-{compliance-checker,pii-scanner,fd-to-plan,
        style-enforcer,a11y-injector,judge,exporter}.md   (nuestros)

.claude/commands/test-pilot/
└── {discover,plan,generate,audit,export,full-loop}.md   (orquestan vía Task tool + archivos)
```

**Regla arquitectónica fundamental**: ningún subagent invoca a otro subagent directamente. La orquestación vive exclusivamente en los commands. Handoff por contratos de archivo. Patrón derivado de Microsoft + agent-skills (addy-osmani).

Detalle completo en [`SPEC.md`](SPEC.md). No duplicar aquí.

## Wrapper sobre Playwright Test Agents

Playwright v1.56+ trae tres subagents nativos (Planner, Generator, Healer) instalados con `npx playwright init-agents --loop=claude`. **No los reimplementamos** — los rodeamos con capas que aportan lo que Microsoft no construirá: compliance regulado, convenciones de cliente, traceability auditable, A11y obligatorio, PII detection ES.

Diferenciadores defendibles a largo plazo (sostenibilidad >12 meses): los específicos del dominio regulado (PII regex ES, audit log compliance, Style Contract por cliente, integraciones Inetum). Diferenciadores de techo bajo (Microsoft puede hacerlos nativos): A11y baked-in, LLM-as-judge.

## Reglas duras

1. **Patrón Inetum cumplido externamente** (Orchestrator + Sub-agents + Commands + Hooks + MCPs visibles para I+D), arquitectura peer internamente. No hay contradicción — Inetum llama "sub-agente" a lo que aquí es subagent Claude Code.
2. **Subagents no se invocan entre sí**. Commands orquestan vía Task tool. Handoff por archivos.
3. **Compliance pre-flight + PII detector no tienen flag de override**. Cualquier salto rompe el SPEC.
4. **Style Contract L0** declara convenciones del cliente (POM, naming, locators, fixtures). El agente lo lee y enforce el output del Generator nativo. Si no hay contract, default del agente + log.
5. **Validación determinística**, no LLM-as-validator. AST + JSON Schema + regex. LLM-as-judge sí existe — pero es scoring de calidad, no validador binario de compliance.
6. **Datos productivos fuera del contexto**. El agente trabaja con artefactos de definición (FD/TD/OpenAPI) y datos sintéticos declarados. Nunca con dumps reales.
7. **Behavioral non-negotiables siempre activos**: surface assumptions, push back con dato, scope discipline, verify-don't-assume, no rationalize shortcuts. Si una tarea está fuera del SPEC, decirlo, no estirar.

## Estado actual

- **Slice 0 (spike Playwright MCP)**: CERRADO con verdict GO. Findings en [`docs/findings/spike-playwright-mcp.md`](docs/findings/spike-playwright-mcp.md). Mecanismo de activación confirmado: `npx playwright init-agents --loop=claude`. Funciona con Claude Code y Copilot. Nativos ya presentes en `.claude/agents/`.
- **Próximo paso**: arrancar Slice 1 (Foundation + init nativos). Tareas concretas en [`tasks/todo.md`](tasks/todo.md).
- **Definition of Done MVP**: demo grabada de 30 minutos contra SauceDemo cumpliendo el flujo del SPEC.
- **Sin plazo de calendario comprometido**. Plan en fases con checkpoints (`tasks/plan.md`).

## Documentación viva

Carga **eager** (siempre presente vía `@import` al final):

- Esta sección está deliberadamente vacía de `@import` por ahora. Toda la información operativa cabe en `CLAUDE.md` + `SPEC.md`. Si se añaden eager-imports, deben ser archivos que existen — no aspiracionales.

Carga **lazy** (Claude lee cuando la tarea lo pide):

| Doc | Cuándo abrirlo |
|---|---|
| [`SPEC.md`](SPEC.md) | Definición del agente: objective, commands, structure, code style, testing, boundaries |
| [`tasks/plan.md`](tasks/plan.md) | Plan por fases, dependency graph, checkpoints, riesgos |
| [`tasks/todo.md`](tasks/todo.md) | Siguiente tarea ejecutable con AC y verify |
| [`docs/findings/spike-playwright-mcp.md`](docs/findings/spike-playwright-mcp.md) | Findings del spike, verdict GO, mecanismo de activación |
| [`docs/spike/spike-protocol.md`](docs/spike/spike-protocol.md) | Protocolo histórico del spike (cómo se hizo) |
| [`METODOLOGIA AISD.md`](METODOLOGIA AISD.md) | Manual operativo del catálogo Inetum — 10 fases DF→MVP |
| [`docs/Inetum/Catalogo/`](docs/Inetum/Catalogo/) | Fichas de agentes ya admitidos en el catálogo Inetum |
| [`.claude/agents/playwright-test-*.md`](.claude/agents/) | Subagents nativos Microsoft (referencia técnica, no editar) |

## Vocabulario del proyecto

Distinguir según audiencia:

- **Hacia I+D Inetum y docs formales**: usar AISD (DF, DT, RF, criterios, fases) + patrón canónico (Orquestador, Sub-agentes, Comandos).
- **Internamente / arquitectura**: usar Claude Code estándar (subagent, command, hook, MCP) + agent-skills (skill, persona, anti-rationalization, evidence-based exit criteria).
- **No mezclar dentro del mismo documento.** Crea esquizofrenia.

## Preferencias de trabajo con Claude

Las preferencias transversales (sin sycophancy, prosa directa, sin emojis, push back con dato, surface assumptions) viven en `~/.claude/CLAUDE.md` global. Resumen aplicable aquí: **no asumir; ante duda relevante, preguntar antes de actuar o escribir**. Trivialidades de formato sí se asumen; intención no.
