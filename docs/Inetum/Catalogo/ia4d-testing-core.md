① Agente Principal

NOMBRE	ia4d-testing-core
ROL	Orquestador
VERSION	v5.2.14
Objetivo

Usa este agente cuando necesites orquestación completa de testing en cualquier framework frontend. Auto-detecta el framework y coordina agentes de testing especializados.

② Uso del Agente

Orquestador: auto-detecta el contexto y delega a los sub-agentes según la tarea.

@ia4d-testing-core Use this agent when you need comprehensive testing orchestration across any frontend framework. Auto-detects framework and delegates to appropriate specialists.
③ Casos de Uso

Análisis y desarrollo con ia4d-testing-core
Automatización de tareas de Documentación y Calidad
Generación de artefactos especializados
Integración con el ecosistema testing, visual-regression
④ Sub-Agentes Especializados (3)

coverage-analyzer
Use this agent for test coverage analysis and improvement recommendations.

Activación:
@ia4d-testing-core → [coverage-analyzer]
e2e-testing-expert
Use this agent for E2E testing setup and implementation with Playwright.

Activación:
@ia4d-testing-core → [e2e-testing-expert]
visual-regression-expert
Use this agent for visual regression testing on any frontend framework. Supports baseline capture, comparison, and design tool integration.

Activación:
@ia4d-testing-core → [visual-regression-expert]
⑤ Flujo de Interacción

Prompt → Orquestador → Sub-agentes → Comandos → Resultado

invokes

analyzes & delegates

sub-agent 1

sub-agent 2

sub-agent 3

👤 User Prompt

🎯 ia4d-testing-core\nORCHESTRATOR

✅ Code · Analysis · Report

Which agent?

🤖 coverage-analyzer

🔀 Merge Results

🤖 e2e-testing-expert

🤖 visual-regression-expert

⚡ Execute Commands

/generate-ci-config

/generate-e2e

/run-ci

/run-coverage

/setup-playwright

⑤b Arquitectura del Plugin

Orquestador → Sub-agentes → Comandos → Hooks → MCPs

result

🔌 MCPs / Herramientas

filesystem

browser / web

code-exec

🪝 Hooks

PreToolUse

PostToolUse

Stop / Notify

⚡ Comandos (6)

/generate-ci-config

/generate-e2e

/run-ci

/run-coverage

/setup-playwright

/tdd-implement

🤖 Sub-Agentes (3)

coverage-analyzer

e2e-testing-expert

visual-regression-expert

🎯 ia4d-testing-core

⑥ Entradas / Salidas

Entradas

Código fuente, especificaciones funcionales

Salidas

Tests unitarios, E2E, configuración CI, reporte de cobertura

⑦ Comandos Disponibles (10)

/ia4d-testing-core:generate-ci-config
Enable dependency caching (default: true)

Ejemplo:
/generate-ci-config
/ia4d-testing-core:generate-e2e
Generate Page Object Model classes (default: true)

Ejemplo:
/generate-e2e --type=smoke
/ia4d-testing-core:run-ci
Output format: terminal|json|markdown (default: terminal)

Ejemplo:
/ia4d-testing-core:run-ci                         # Full pipeline
/ia4d-testing-core:run-coverage
Fail if coverage is below threshold (default: true)

Ejemplo:
/run-coverage
/ia4d-testing-core:setup-playwright
Include CI/CD configuration (default: true)

Ejemplo:
/setup-playwright
/ia4d-testing-core:tdd-implement
Strict mode: fail immediately if any TDD rule is violated

Ejemplo:
/ia4d-testing-core:tdd-implement "validate email format on registration"
/ia4d-testing-core:tdd
Test framework override: jest|vitest|jasmine|pytest|junit|rspec (auto-detected by default)

Ejemplo:
/ia4d-testing-core:tdd "validate email format on user registration"
/ia4d-testing-core:test-orchestrator
Generate combined report (default: true)

Ejemplo:
/test-orchestrator
/ia4d-testing-core:visual-report
Port to serve report (default: 3333)

Ejemplo:
/visual-report generate
/ia4d-testing-core:visual-snapshot
Design file ID (required with --design-token)

Ejemplo:
/visual-snapshot capture --tag="pre-refactor"