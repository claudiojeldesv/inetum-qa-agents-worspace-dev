① Agente Principal

NOMBRE	ia4d-qa-automator
ROL	Orquestador
VERSION	v0.3.1
Objetivo

Usa este agente cuando necesites generar tests E2E en Playwright TypeScript con marco QA propio, compliance regulado, accesibilidad (axe-core / WCAG 2.1 AA / EAA 2025) baked-in y Quality layer Writer+Reviewer+Judge. Multi-modo según el insumo: solo URL (S4 — funcional), FD/spec floja + URL (S3 — funcional), Gherkin maduro + URL (S2 — funcional; OpenAPI diferido a v0.4), o repo frontend (S1 — stub, v0.3). Diferenciador estructural frente a ia4d-testing-core: dev no puede ser juez y parte; las herramientas QA tienen otra forma de operar.

② Uso del Agente

Instalación (marketplace de Claude Code): instala el plugin desde el catálogo y ejecuta /ia4d-qa-automator:init <carpeta> para desplegar el workspace de ejecución del agente (runtime + config + agentes nativos + labs) y dejarlo listo (scaffold + npm install + healthcheck). Distribución híbrida: el plugin publica los agentes ia4d y todos los commands (namespace único /ia4d-qa-automator:*, visibles en el catálogo y disponibles globalmente); el workspace aporta el sustrato de ejecución (proyecto Playwright pineado + config por cliente + hooks project-scoped). Motivo: el entregable es una suite ejecutable y auditable por cliente, no cabe (ni conviene) globalizar el proyecto Playwright.

Orquestador: auto-detecta el contexto y delega a los sub-agentes según el módulo de entrada (S1/S2/S3/S4) y los cinco actos del marco QA propio (Comprender → Mapear → Estructurar → Materializar → Juzgar).

@ia4d-qa-automator Use this agent when you need to generate E2E tests with regulated compliance, A11y baked-in, deterministic POM, and a Writer+Reviewer+Judge Quality layer that materializes "QA is an independent judge". Four input modes; S2/S3/S4 functional, S1 stub.
③ Casos de Uso

Análisis y desarrollo con ia4d-qa-automator
Automatización de tareas de Documentación y Calidad
Generación de artefactos especializados (POM, .spec.ts, criteria.json, drift-report.json, judge-report.json)
Detección de drift entre la especificación (FD/Gherkin) y lo que la app realmente expone
Integración con el ecosistema testing, accessibility, compliance
④ Sub-Agentes Especializados (12 propios + 3 nativos)

ia4d-mode-router
Use this agent to classify the input as S1/S2/S3/S4. S2/S3/S4 route to functional pipelines; S1 (and the OpenAPI path of S2) route to informative stubs.

Activación:
@ia4d-qa-automator → [ia4d-mode-router]

ia4d-compliance-checker
Use this agent to validate target URL + mode against allowed-targets.yaml. Hard gate — no override.

Activación:
@ia4d-qa-automator → [ia4d-compliance-checker]

ia4d-pii-scanner
Use this agent to scan generated .spec.ts files for PII patterns banca-ES (DNI, IBAN, Luhn, real-domain emails, ES phones). Off por defecto, reactivable con QA_ENABLE_PII (funcionalidad opcional, no gate obligatorio). La guarda anti-test.fixme() del hook sigue siempre activa, independiente de este scanner.

Activación:
@ia4d-qa-automator → [ia4d-pii-scanner]

ia4d-discovery-analyzer
Use this agent to post-process the native Planner output into a structured discovery-report.json consumable by POM scaffolder and Writer.

Activación:
@ia4d-qa-automator → [ia4d-discovery-analyzer]

ia4d-spec-refiner (S3)
Use this agent to ingest a Functional Design (free markdown) + URL and emit a structured criteria.json (RF-NNN), an exploration brief and refinement-questions.md. Extrae y marca huecos; nunca fabrica criterios.

Activación:
@ia4d-qa-automator → [ia4d-spec-refiner]

ia4d-spec-parser (S2)
Use this agent to parse a mature Gherkin .feature into the same criteria.json contract. Determinístico (src/gherkin-to-criteria.ts, @cucumber/gherkin), no interpreta prosa con el LLM. OpenAPI diferido a v0.4.

Activación:
@ia4d-qa-automator → [ia4d-spec-parser]

ia4d-style-enforcer
Use this agent to enforce the project's Style Contract YAML on a generated .spec.ts (locator priority, no waitForTimeout, POM placement, excepción CSS legacy declarada).

Activación:
@ia4d-qa-automator → [ia4d-style-enforcer]

ia4d-a11y-injector
Use this agent to inject AxeBuilder({ page }).analyze() at the start of every test() block. WCAG 2.1 AA / EAA 2025. El scan se inyecta siempre; el gate que aborta (fail_on_violations) está off por defecto (modo warning) y es configurable por sitio.

Activación:
@ia4d-qa-automator → [ia4d-a11y-injector]

ia4d-writer
Use this agent to write a Playwright .spec.ts from a plan/criteria entry + Style Contract + POM scaffolded. Can invoke ia4d-reviewer directly via Task tool (named composition exception, documented).

Activación:
@ia4d-qa-automator → [ia4d-writer] → [ia4d-reviewer]

ia4d-reviewer
Use this agent to audit a .spec.ts written by ia4d-writer against objective criteria. Returns approved or rejected with structured feedback (max N=2 iterations).

Activación:
@ia4d-qa-automator → [ia4d-writer] → [ia4d-reviewer]

ia4d-judge
Use this agent to score the final test on a 0-1 scale across seven axes (assertions, selectors, waits, isolation, criterion coverage, a11y, structure). Métrica de reporte, no gate; off por defecto, reactivable con QA_ENABLE_JUDGE.

Activación:
@ia4d-qa-automator → [ia4d-judge]

Stub documentado (no funcional)
- ia4d-code-analyzer (S1, v0.3)

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

✅ Tests E2E · Audit · Drift · Report

Acto 1 — Comprender
  🤖 ia4d-mode-router
  🤖 ia4d-compliance-checker
  🤖 ia4d-spec-refiner (S3) / ia4d-spec-parser (S2)

Acto 2 — Mapear
  🤖 playwright-test-planner (nativo)
  🤖 ia4d-discovery-analyzer

Acto 3 — Estructurar
  ⚙️  src/pom-scaffolder.ts (código TS determinístico)
  🤖 ia4d-style-enforcer

Acto 4 — Materializar
  🤖 ia4d-writer ⟷ 🤖 ia4d-reviewer (excepción nombrada, N≤2)
  🤖 ia4d-a11y-injector
  🤖 ia4d-pii-scanner (vía hook PostToolUse; off por defecto)

Acto 5 — Juzgar
  🤖 ia4d-judge (off por defecto)

⚡ Execute Commands

/ia4d-qa-automator:init      (despliega el workspace — command del plugin)
/ia4d-qa-automator:healthcheck
/ia4d-qa-automator:autonomous     (S4)
/ia4d-qa-automator:spec-refiner   (S3)
/ia4d-qa-automator:req-driven     (S2)
/ia4d-qa-automator:config
/ia4d-qa-automator:report
/ia4d-qa-automator:code-driven    (stub → v0.3)

⑤b Arquitectura del Plugin

Orquestador → Sub-agentes → Comandos → Hooks → MCPs

Distribución híbrida: el plugin publica los 12 agentes ia4d + los 9 comandos (visibles en el catálogo, namespace /ia4d-qa-automator:*). El command init despliega el workspace de ejecución, donde viven los hooks (project-scoped), el MCP playwright-test y los 3 agentes nativos pineados a la versión de Playwright. El patrón canónico (Orquestador → Sub-agentes → Comandos → Hooks → MCPs) se cumple repartido a propósito: hooks y MCP a nivel proyecto por compliance y por reproducibilidad regulada.

result

🔌 MCPs / Herramientas

playwright-test (nativo Microsoft, run-test-mcp-server)
filesystem
yaml parser

🪝 Hooks (cableados en .claude/settings.json)

PreToolUse: compliance pre-flight (mcp__playwright-test__.*) — siempre activo, sin override
PostToolUse: PII scan (off por defecto, QA_ENABLE_PII) + guarda anti-test.fixme() (siempre activa) sobre Write|Edit
Stop: audit-write (cierre de sesión)

⚡ Comandos (7 en el workspace + init del plugin)

/ia4d-qa-automator:init (plugin)
/ia4d-qa-automator:healthcheck
/ia4d-qa-automator:autonomous (S4)
/ia4d-qa-automator:spec-refiner (S3)
/ia4d-qa-automator:req-driven (S2)
/ia4d-qa-automator:config
/ia4d-qa-automator:report
/ia4d-qa-automator:code-driven (stub)

🤖 Sub-Agentes (12 propios + 3 nativos)

ia4d-mode-router
ia4d-compliance-checker
ia4d-pii-scanner
ia4d-discovery-analyzer
ia4d-spec-refiner (S3)
ia4d-spec-parser (S2)
ia4d-style-enforcer
ia4d-a11y-injector
ia4d-writer
ia4d-reviewer
ia4d-judge
ia4d-code-analyzer (stub)
+ playwright-test-{planner,generator,healer} (nativos Microsoft)

🎯 ia4d-qa-automator

⑥ Entradas / Salidas

Entradas

- Solo URL (S4, funcional): https://www.saucedemo.com/ + opcionalmente config/style-contracts/<project>.yaml
- FD flojo / PDF / markdown (S3, funcional): path al documento + URL de staging
- Gherkin maduro (S2, funcional): path al .feature + URL de staging
- Repo frontend (S1, stub v0.3): path al repo + framework

Salidas

- N x .spec.ts (con @criterion RF-NNN cuando hay S2/S3; tags nativos + @tc-id)
- tests/pages/*.page.ts (POMs determinísticos)
- discovery-report.json
- criteria.json (S2/S3) + drift-report.json (drift spec↔implementación)
- audit-log.json (JSON-lines append-only)
- review-feedback.json (Writer↔Reviewer iteraciones)
- judge-report.json (scores 0-1 por test; solo con Judge activo)
- qa-automator-run-summary.json
- Reporte ejecutivo single-file + Allure enriquecido (vía /ia4d-qa-automator:report)

⑦ Comandos Disponibles

/ia4d-qa-automator:init
Despliega el workspace del agente en una carpeta y lo deja listo (scaffold + npm install + healthcheck). Command del plugin; primer paso tras instalar.

Ejemplo:
/ia4d-qa-automator:init mi-workspace-qa

/ia4d-qa-automator:healthcheck
Smoke test: versión, subagents detectados, MCP server, configs, cableado de hooks.

Ejemplo:
/ia4d-qa-automator:healthcheck

/ia4d-qa-automator:autonomous
Módulo S4. Orquesta los 5 actos desde una URL. Acota por módulos con --flows.

Ejemplo:
/ia4d-qa-automator:autonomous --url=https://www.saucedemo.com/ --flows=login,checkout

/ia4d-qa-automator:spec-refiner
Módulo S3. FD/spec floja + URL. Extrae criterios RF-NNN, marca huecos, detecta drift FD↔implementación.

Ejemplo:
/ia4d-qa-automator:spec-refiner --fd=docs/fd/login-flow.md --url=https://parabank.parasoft.com/

/ia4d-qa-automator:req-driven
Módulo S2. Gherkin maduro + URL. Trazabilidad RF-NNN, parameterización (Scenario Outline), drift.

Ejemplo:
/ia4d-qa-automator:req-driven --gherkin=features/login.feature --url=https://parabank.parasoft.com/

/ia4d-qa-automator:config
Valida un Style Contract (campos, enums, typos, coherencia) y muestra la configuración efectiva de la sesión (gates on/off, evidencia, auth, locators). Determinístico.

Ejemplo:
/ia4d-qa-automator:config --style=config/style-contracts/saucedemo.yaml

/ia4d-qa-automator:report
Genera el reporte ejecutivo single-file + el reporte Allure enriquecido a partir de un run ya ejecutado.

Ejemplo:
/ia4d-qa-automator:report

/ia4d-qa-automator:code-driven (stub → v0.3)
Módulo S1. Analiza un repo frontend. Devuelve mensaje informativo.

Ejemplo:
/ia4d-qa-automator:code-driven --repo=./my-frontend --framework=react

## Diferenciación con ia4d-testing-core

| Dimensión | ia4d-testing-core | ia4d-qa-automator |
|---|---|---|
| Perspectiva | Dev sobre su propio código (whitebox total) | Ingeniero QA externo o juez QA (greybox o black-box, multi-modo) |
| Fase AISD | 07 (Testing) estricta | Transversal por disciplina QA propia (toca 01, 04, 07, 08) |
| Misión | "Test su propio código" | "Juez independiente sobre la app" |
| Quality layer | LLM-as-judge unilateral | Writer + Reviewer obligatorios (iteración explícita N≤2) + Judge opcional |
| Compliance | No central | Pre-flight sin override + PII detector banca-ES opcional (reactivable) |
| A11y | Opcional | Scan baked-in siempre; gate configurable por sitio |
| Trazabilidad | No nativa | @criterion RF-NNN (S2/S3) + drift-report + audit-log JSON-lines |
| Output | Tests subproducto del código generado | Tests + POM + criteria + drift + audit + review + judge |
| Modelo decisor | Dev / Tech Lead | QA Manager + Ingeniero QA |

No sustitución. Coexisten con misiones incompatibles. Dev no puede ser juez y parte.

## Métricas verificadas

- Unit tests del runtime verdes (vitest); healthcheck estructural verde.
- S4 validado contra SauceDemo (golden path verde) y sitios reales (expandtesting, Toolshop, ParaBank, OrangeHRM).
- S3 (Spec-refiner) validado contra ParaBank 3/3 verde y contra producción real regulada (Mapfre Hogar): detección de drift sin fabricar tests.
- S2 (Req-driven, Gherkin) validado contra ParaBank 5/5 verde, con parameterización data-driven y drift reportado sin fabricar.
- Empaquetado de plugin validado end-to-end: scaffold limpio → npm install → healthcheck verde → unit verdes.

## Roadmap

| Versión | Foco |
|---|---|
| v0.2 | S2 (Gherkin) + S3 (Spec-refiner) + hardening contra el caos web real (a11y gate configurable, auth-handler, excepción CSS legacy) + gates off por defecto |
| v0.3.0 | Empaquetado como plugin de marketplace (repartidor + init) + tooling de coste de tokens |
| v0.3.1 (actual) | Distribución híbrida: agentes + comandos publicados por el plugin (inventario visible, namespace único); runtime/hooks/MCP/config en el workspace |
| v0.3.x | S1 (Code-driven) + AST parsers React/Vue |
| v0.4 | S2 OpenAPI (API tests) + Context Injector* (asterisco: rompe genericidad) + PR automation |
