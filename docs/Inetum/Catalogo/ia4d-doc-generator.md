① Agente Principal

NOMBRE	ia4d-doc-generator
ROL	Orquestador
VERSION	v5.1.16
Objetivo

Usa este agente cuando necesites documentación técnica completa, auditorías de seguridad o análisis de deuda técnica para cualquier codebase.

② Uso del Agente

Orquestador: auto-detecta el contexto y delega a los sub-agentes según la tarea.

@ia4d-doc-generator Use this agent when you need comprehensive technical documentation, security audits, or technical debt analysis for any project. Coordinates specialized sub-agents to deliver complete, navigable docum
③ Casos de Uso

Análisis y desarrollo con ia4d-doc-generator
Automatización de tareas de Documentación y Calidad
Generación de artefactos especializados
Integración con el ecosistema documentation, audit
④ Sub-Agentes Especializados (10)

doc-debt-analyzer
Specialized agent for technical debt identification and quantification. Analyzes code complexity, duplication, test coverage, documentation gaps, and architecture violations to provide actionable reme

Activación:
@ia4d-doc-generator → [doc-debt-analyzer]
doc-diagram-generator
Specialized agent for generating architecture and flow diagrams using Mermaid. Creates C4 model diagrams, sequence diagrams, class diagrams, ERD, and deployment diagrams from code analysis. Use this a

Activación:
@ia4d-doc-generator → [doc-diagram-generator]
doc-debt-analyzer
Specialized agent for technical debt identification and quantification. Analyzes code complexity, duplication, test coverage, documentation gaps, and architecture violations to provide actionable reme

Activación:
@ia4d-doc-generator → [doc-debt-analyzer]
doc-diagram-generator
Specialized agent for generating architecture and flow diagrams using Mermaid. Creates C4 model diagrams, sequence diagrams, class diagrams, ERD, and deployment diagrams from code analysis. Use this a

Activación:
@ia4d-doc-generator → [doc-diagram-generator]
doc-flow-extractor
Specialized agent for extracting functional and business flows from source code. Identifies user journeys, API flows, data pipelines, and event-driven sequences to document application behavior. Use t

Activación:
@ia4d-doc-generator → [doc-flow-extractor]
doc-html-generator
Specialized agent for generating navigable HTML documentation sites. Creates styled, interactive documentation with navigation, search, and embedded diagrams from structured analysis data. Use this ag

Activación:
@ia4d-doc-generator → [doc-html-generator]
doc-security-auditor
Specialized agent for security vulnerability detection and audit. Scans code for security issues including injection vulnerabilities, authentication flaws, sensitive data exposure, and dependency vuln

Activación:
@ia4d-doc-generator → [doc-security-auditor]
doc-tech-detector
Specialized agent for automatic technology stack detection. Scans project structure, configuration files, and dependencies to identify all technologies, frameworks, libraries, and tools used in a proj

Activación:
@ia4d-doc-generator → [doc-tech-detector]
ia4d-auditor-agent
Use this agent when you need to generate comprehensive technical documentation and audit reports for any codebase. The agent automatically detects technologies, audits security vulnerabilities and tec

Activación:
@ia4d-doc-generator → [ia4d-auditor-agent]
ia4d-auditor-compact
Use this agent when you need a compact, fast version of the documentation and audit agent. This is a streamlined version that performs the same core functions (tech detection, security audit, technica

Activación:
@ia4d-doc-generator → [ia4d-auditor-compact]
⑤ Flujo de Interacción

Prompt → Orquestador → Sub-agentes → Comandos → Resultado

invokes

analyzes & delegates

sub-agent 1

sub-agent 2

sub-agent 3

sub-agent 4

sub-agent 5

sub-agent 6

👤 User Prompt

🎯 ia4d-doc-generator\nORCHESTRATOR

✅ Code · Analysis · Report

Which agent?

🤖 doc-debt-analyzer

🔀 Merge Results

🤖 doc-diagram-generator

🤖 doc-debt-analyzer

🤖 doc-diagram-generator

🤖 doc-flow-extractor

🤖 doc-html-generator

⚡ Execute Commands

/analyze-debt

/detect-technologies

/extract-flows

/generate-adr

/generate-audit

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

/analyze-debt

/detect-technologies

/extract-flows

/generate-adr

/generate-audit

/generate-diagrams

🤖 Sub-Agentes (8)

doc-debt-analyzer

doc-diagram-generator

doc-debt-analyzer

doc-diagram-generator

doc-flow-extractor

doc-html-generator

doc-security-auditor

doc-tech-detector

🎯 ia4d-doc-generator

⑥ Entradas / Salidas

Entradas

Código fuente, commits git, especificaciones

Salidas

Documentación HTML/MD, changelog, release notes, ADRs

⑦ Comandos Disponibles (10)

/ia4d-doc-generator:analyze-debt
Analyze and quantify technical debt

Ejemplo:
/analyze-debt
/ia4d-doc-generator:detect-technologies
Automatically detect project technology stack

Ejemplo:
/detect-technologies
/ia4d-doc-generator:extract-flows
Extract and document functional flows from code

Ejemplo:
/extract-flows
/ia4d-doc-generator:generate-adr
Generate Architecture Decision Records from code analysis or create new ADRs with standard templates

Ejemplo:
/ia4d-doc-generator:generate-adr [--title=<title>] [--analyze]
/ia4d-doc-generator:generate-audit
Generate complete documentation and technical audit for any code project

Ejemplo:
/generate-audit --agent ia4d-auditor-agent --context ./proyecto
/ia4d-doc-generator:generate-diagrams
Generate architecture and flow diagrams from code

Ejemplo:
/generate-diagrams
/ia4d-doc-generator:generate-docs
Generate technical documentation without security/debt audit

Ejemplo:
/generate-docs
/ia4d-doc-generator:generate-fd
Generate a Functional Design document from technical documentation, audit reports, or extracted functional flows.

Ejemplo:
/generate-fd --input ./docs/technical-spec.md --project SYSTEM
/ia4d-doc-generator:generate-openapi
Generate OpenAPI specification from code analysis for Spring Boot, FastAPI, Express, NestJS, and other frameworks

Ejemplo:
/ia4d-doc-generator:generate-openapi [path] [--framework=<framework>]
/ia4d-doc-generator:init-docs
Initialize documentation structure for a project

Ejemplo:
/init-docs