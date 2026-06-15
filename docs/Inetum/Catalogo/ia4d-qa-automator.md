① Agente Principal

NOMBRE	ia4d-qa-automator
ROL	Orquestador
VERSION	v0.1.0
Objetivo

Usa este agente cuando necesites generar tests E2E en Playwright TypeScript con marco QA propio, compliance regulado, accesibilidad (axe-core / WCAG 2.1 AA / EAA 2025) baked-in y Quality layer Writer+Reviewer+Judge. Multi-modo según el insumo: solo URL (S4 — funcional en v0.1), repo frontend (S1 — v0.3), Gherkin/OpenAPI (S2 — v0.3), o FD flojo (S3 — v0.2). Diferenciador estructural frente a ia4d-testing-core: dev no puede ser juez y parte; las herramientas QA tienen otra forma de operar.

② Uso del Agente

Orquestador: auto-detecta el contexto y delega a los sub-agentes según el módulo de entrada (S1/S2/S3/S4) y los cinco actos del marco QA propio (Comprender → Mapear → Estructurar → Materializar → Juzgar).

@ia4d-qa-automator Use this agent when you need to generate E2E tests with regulated compliance, A11y baked-in, deterministic POM, and a Writer+Reviewer+Judge Quality layer that materializes "QA is an independent judge". Four input modes; S4 (URL-only) functional in v0.1.
③ Casos de Uso

Análisis y desarrollo con ia4d-qa-automator
Automatización de tareas de Documentación y Calidad
Generación de artefactos especializados (POM, .spec.ts, judge-report.json)
Integración con el ecosistema testing, accessibility, compliance
④ Sub-Agentes Especializados (10)

ia4d-mode-router
Use this agent to classify the input as S1/S2/S3/S4. In v0.1 only S4 routes to a functional pipeline.

Activación:
@ia4d-qa-automator → [ia4d-mode-router]

ia4d-compliance-checker
Use this agent to validate target URL + mode against allowed-targets.yaml. Hard gate — no override.

Activación:
@ia4d-qa-automator → [ia4d-compliance-checker]

ia4d-pii-scanner
Use this agent to scan generated .spec.ts files for PII patterns banca-ES (DNI, IBAN, Luhn, real-domain emails, ES phones). Hard gate — no override.

Activación:
@ia4d-qa-automator → [ia4d-pii-scanner]

ia4d-discovery-analyzer
Use this agent to post-process the native Planner output into a structured discovery-report.json consumable by POM scaffolder and Writer.

Activación:
@ia4d-qa-automator → [ia4d-discovery-analyzer]

ia4d-style-enforcer
Use this agent to enforce the project's Style Contract YAML on a generated .spec.ts (locator priority, no waitForTimeout, POM placement).

Activación:
@ia4d-qa-automator → [ia4d-style-enforcer]

ia4d-a11y-injector
Use this agent to inject AxeBuilder({ page }).analyze() at the start of every test() block. WCAG 2.1 AA / EAA 2025 baked-in. Not optional in MVP.

Activación:
@ia4d-qa-automator → [ia4d-a11y-injector]

ia4d-writer
Use this agent to write a Playwright .spec.ts from a plan entry + Style Contract + POM scaffolded. Can invoke ia4d-reviewer directly via Task tool (named composition exception, documented).

Activación:
@ia4d-qa-automator → [ia4d-writer] → [ia4d-reviewer]

ia4d-reviewer
Use this agent to audit a .spec.ts written by ia4d-writer against objective criteria. Returns approved or rejected with structured feedback (max N=2 iterations).

Activación:
@ia4d-qa-automator → [ia4d-writer] → [ia4d-reviewer]

ia4d-judge
Use this agent to score the final test on a 0-1 scale across seven axes (assertions, selectors, waits, isolation, criterion coverage, a11y, structure). Reporting metric, not gate.

Activación:
@ia4d-qa-automator → [ia4d-judge]

Stubs documentados (no funcionales en v0.1)
- ia4d-code-analyzer (S1, v0.3)
- ia4d-spec-parser (S2, v0.3)
- ia4d-spec-refiner (S3, v0.2)

⑤ Flujo de Interacción

Prompt → Orquestador → Sub-agentes → Comandos → Resultado

invokes

analyzes & delegates

acto 1: comprender

acto 2: mapear

acto 3: estructurar

acto 4: materializar

acto 5: juzgar

👤 User Prompt

🎯 ia4d-qa-automator\nORQUESTADOR

✅ Tests E2E · Audit · Report

Acto 1 — Comprender
  🤖 ia4d-mode-router
  🤖 ia4d-compliance-checker

Acto 2 — Mapear
  🤖 playwright-test-planner (nativo)
  🤖 ia4d-discovery-analyzer

Acto 3 — Estructurar
  ⚙️  src/pom-scaffolder.ts (código TS determinístico)
  🤖 ia4d-style-enforcer

Acto 4 — Materializar
  🤖 ia4d-writer ⟷ 🤖 ia4d-reviewer (excepción nombrada, N≤2)
  🤖 ia4d-a11y-injector
  🤖 ia4d-pii-scanner (vía hook PostToolUse)

Acto 5 — Juzgar
  🤖 ia4d-judge

⚡ Execute Commands

/qa-automator:healthcheck
/qa-automator:autonomous
/qa-automator:code-driven    (stub v0.1)
/qa-automator:req-driven     (stub v0.1)
/qa-automator:spec-refiner   (stub v0.1)

⑤b Arquitectura del Plugin

Orquestador → Sub-agentes → Comandos → Hooks → MCPs

result

🔌 MCPs / Herramientas

playwright-test (nativo Microsoft, vía npx playwright init-agents --loop=claude)
filesystem
yaml parser

🪝 Hooks

PreToolUse: compliance pre-flight (mcp__playwright-test__.*)
PostToolUse: PII scanner (Write|Edit sobre .spec.ts)
Stop: audit-write (cierre de sesión)

⚡ Comandos (5)

/qa-automator:healthcheck
/qa-automator:autonomous
/qa-automator:code-driven (stub)
/qa-automator:req-driven (stub)
/qa-automator:spec-refiner (stub)

🤖 Sub-Agentes (10 propios + 3 nativos)

ia4d-mode-router
ia4d-compliance-checker
ia4d-pii-scanner
ia4d-discovery-analyzer
ia4d-style-enforcer
ia4d-a11y-injector
ia4d-writer
ia4d-reviewer
ia4d-judge
ia4d-code-analyzer (stub)
ia4d-spec-parser (stub)
ia4d-spec-refiner (stub)
+ playwright-test-{planner,generator,healer} (nativos Microsoft)

🎯 ia4d-qa-automator

⑥ Entradas / Salidas

Entradas

- Solo URL (S4, funcional): https://www.saucedemo.com/ + opcionalmente config/style-contracts/<project>.yaml
- Repo frontend (S1, v0.3): path al repo + framework
- Gherkin u OpenAPI (S2, v0.3): paths a los specs
- FD flojo / PDF / Jira (S3, v0.2): path al documento + URL opcional

Salidas

- N x .spec.ts (≥3 para flujo MVP SauceDemo: login + cart + checkout)
- tests/pages/*.page.ts (POMs determinísticos)
- discovery-report.json
- audit-log.json (JSON-lines append-only)
- review-feedback.json (Writer↔Reviewer iteraciones)
- judge-report.json (scores 0-1 por test)
- qa-automator-run-summary.json
- playwright-report/ (HTML)

⑦ Comandos Disponibles (5)

/qa-automator:healthcheck
Smoke test: versión, subagents detectados, MCP server, configs.

Ejemplo:
/qa-automator:healthcheck

/qa-automator:autonomous
Módulo S4. Funcional en v0.1. Orquesta los 5 actos contra una URL.

Ejemplo:
/qa-automator:autonomous --url=https://www.saucedemo.com/ --style=config/style-contracts/saucedemo.yaml

/qa-automator:code-driven (stub v0.1, funcional v0.3)
Módulo S1. Analiza un repo frontend.

Ejemplo:
/qa-automator:code-driven --repo=./my-frontend --framework=react

/qa-automator:req-driven (stub v0.1, funcional v0.3)
Módulo S2. Consume Gherkin u OpenAPI.

Ejemplo:
/qa-automator:req-driven --gherkin=features/login.feature

/qa-automator:spec-refiner (stub v0.1, funcional v0.2)
Módulo S3. Refina un FD flojo o Jira mal redactado.

Ejemplo:
/qa-automator:spec-refiner --fd=docs/fd/login-flow.md --target-url=https://app.qa.example.com/

## Diferenciación con ia4d-testing-core

| Dimensión | ia4d-testing-core | ia4d-qa-automator |
|---|---|---|
| Perspectiva | Dev sobre su propio código (whitebox total) | SDET externo o juez QA (greybox o black-box, multi-modo) |
| Fase AISD | 07 (Testing) estricta | Transversal por disciplina QA propia (toca 01, 04, 07, 08) |
| Misión | "Test su propio código" | "Juez independiente sobre la app" |
| Quality layer | LLM-as-judge unilateral | Writer + Reviewer + Judge (los tres activos, Writer↔Reviewer iteración explícita) |
| Compliance | No central | Pre-flight + PII detector banca-ES como hard gate sin override |
| A11y | Opcional | Baked-in obligatorio (no opcional en MVP) |
| Output | Tests subproducto del código generado | Tests + POM + audit log + review feedback + judge scores |
| Audit trail | No nativo | audit-log.json JSON-lines append-only por defecto |
| Modelo decisor | Dev / Tech Lead | QA Manager + SDET |

No sustitución. Coexisten con misiones incompatibles. Dev no puede ser juez y parte.

## Métricas verificadas (MVP v0.1 contra SauceDemo)

- 42 unit tests verdes en 1.4 segundos (vitest).
- 3 E2E tests verdes en 7.2 segundos paralelos (Playwright contra SauceDemo).
- Wall-clock proyectado del flujo autonomous completo con LLM: ~7-8 min con paralelismo (basado en mediciones del spike: Planner 3.4 min + 3 × Generator 3.4 min en paralelo).
- Tokens proyectados del flujo MVP completo: ~125k (sin capa transversal LLM-bound).

## Roadmap

| Versión | Foco |
|---|---|
| v0.1 (MVP, actual) | S4 + capa transversal + Quality layer + flujo SauceDemo verde |
| v0.2 | S3 (Spec-refiner) + TMS connectors (Jira/Xray) + knowledge graph SQLite |
| v0.3 | S1 (Code-driven) + S2 (Req-driven) + AST parsers React/Vue |
| v0.4 | Context Injector* (asterisco: rompe genericidad, requiere adaptadores por cliente) + PR automation |
