① Agente Principal

NOMBRE	ia4d-technical-design-expert
ROL	Orquestador
VERSION	v1.0.2
Objetivo

Usa este agente cuando necesites crear un Documento de Diseño Técnico (DT) a partir de un Diseño Funcional (DF) y/o Análisis de Software, o diseñar esquemas de base de datos y specs de API.

② Uso del Agente

Orquestador: auto-detecta el contexto y delega a los sub-agentes según la tarea.

@ia4d-technical-design-expert Use this agent when you need to create a Technical Design (TD) document from a Functional Design (FD) and/or Software Architecture (SA). Generates detailed technical specifications: API contracts (Ope
③ Casos de Uso

Análisis y desarrollo con ia4d-technical-design-expert
Automatización de tareas de Documentación y Calidad
Generación de artefactos especializados
Integración con el ecosistema technical-design, openapi
④ Sub-Agentes Especializados (4)

api-designer
Use this agent to design REST or GraphQL API contracts from Functional Design requirements. Produces OpenAPI 3.0 specifications with full schemas, authentication, error responses, and pagination conve

Activación:
@ia4d-technical-design-expert → [api-designer]
schema-designer
Use this agent to design database schemas from a Functional Design data model. Produces ER diagrams (Mermaid ERD), DDL scripts, index strategy, and constraint definitions aligned with business rules (

Activación:
@ia4d-technical-design-expert → [schema-designer]
sequence-modeler
Use this agent to generate sequence diagrams in Mermaid format from Functional Design flows. Produces one diagram per main RF flow showing actors, frontend, API, services, database, and external syste

Activación:
@ia4d-technical-design-expert → [sequence-modeler]
validator
Use this agent to validate Technical Design document completeness and quality using the td-checklist (30-point score). Returns a quality score with gap report and severity classification.

Activación:
@ia4d-technical-design-expert → [validator]
⑤ Flujo de Interacción

Prompt → Orquestador → Sub-agentes → Comandos → Resultado

invokes

analyzes & delegates

sub-agent 1

sub-agent 2

sub-agent 3

sub-agent 4

👤 User Prompt

🎯 ia4d-technical-design-expert\nORCHESTRATOR

✅ Code · Analysis · Report

Which agent?

🤖 api-designer

🔀 Merge Results

🤖 schema-designer

🤖 sequence-modeler

🤖 validator

⚡ Execute Commands

/generate-api-spec

/generate-db-schema

/generate-td

/td-from-fd

/validate-td

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

⚡ Comandos (5)

/generate-api-spec

/generate-db-schema

/generate-td

/td-from-fd

/validate-td

🤖 Sub-Agentes (4)

api-designer

schema-designer

sequence-modeler

validator

🎯 ia4d-technical-design-expe

⑥ Entradas / Salidas

Entradas

Código fuente del proyecto, descripción de la tarea

Salidas

Código generado, análisis, documentación, recomendaciones

⑦ Comandos Disponibles (5)

/ia4d-technical-design-expert:generate-api-spec
Generate an OpenAPI 3.0 specification from Functional Design requirements. Maps RF-NNN to endpoints, PAN field inventories to schemas, and RN business rules to validation constraints.

Ejemplo:
/ia4d-technical-design-expert:generate-api-spec --fd ./docs/FD-ORDERS-001.md
/ia4d-technical-design-expert:generate-db-schema
Generate a database schema (ER diagram + DDL) from the functional data model in a Functional Design document. Produces Mermaid ERD and SQL CREATE TABLE statements.

Ejemplo:
/ia4d-technical-design-expert:generate-db-schema --fd ./docs/FD-ORDERS-001.md
/ia4d-technical-design-expert:generate-td
Generate a complete Technical Design document from a Functional Design (FD) and/or Software Architecture (SA). Orchestrates API design, DB schema, sequence diagrams, and implementation patterns.

Ejemplo:
/ia4d-technical-design-expert:generate-td \
/ia4d-technical-design-expert:td-from-fd
Generate a Technical Design document from a Functional Design document, inferring architecture style and tech stack when no SA document is available.

Ejemplo:
/ia4d-technical-design-expert:td-from-fd --fd ./docs/FD-ORDERS-001.md
/ia4d-technical-design-expert:validate-td
Validate a Technical Design document against the td-checklist (30-point quality score). Returns a scored report with gap severity classification and actionable recommendations.

Ejemplo:
/ia4d-technical-design-expert:validate-td --td ./docs/TD-ORDERS-001.md