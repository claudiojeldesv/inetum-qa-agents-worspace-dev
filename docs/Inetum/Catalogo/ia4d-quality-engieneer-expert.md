① Agente Principal

NOMBRE	ia4d-quality-engineer-expert
ROL	Orquestador
VERSION	v1.0.2
Objetivo

Usa este agente cuando necesites definir o auditar estándares de calidad en el ciclo de vida del desarrollo de software. Crea definiciones DoR, DoD, quality gates y auditorías de cumplimiento.

② Uso del Agente

Orquestador: auto-detecta el contexto y delega a los sub-agentes según la tarea.

@ia4d-quality-engineer-expert Use this agent when you need to define or audit quality standards across the software development lifecycle. Creates Definition of Done (DoD), Definition of Ready (DoR), Quality Gates per SDLC phase,
③ Casos de Uso

Análisis y desarrollo con ia4d-quality-engineer-expert
Automatización de tareas de Documentación y Calidad
Generación de artefactos especializados
Integración con el ecosistema quality, dod
④ Sub-Agentes Especializados (3)

dod-designer
Use this agent to create Definition of Done (DoD) and Definition of Ready (DoR) criteria. Produces customized checklists by story type (Feature, Bug, Tech Debt, Spike) with measurable criteria aligned

Activación:
@ia4d-quality-engineer-expert → [dod-designer]
metrics-analyst
Use this agent to define quality metrics targets for a project: DORA metrics, code quality thresholds, security acceptance criteria, and performance targets aligned with NFRs. Produces a measurable Qu

Activación:
@ia4d-quality-engineer-expert → [metrics-analyst]
quality-gate-validator
Use this agent to define Quality Gates for each SDLC phase or to audit existing artifacts against configured quality gates. Produces pass/fail verdicts per phase with blocking/warning issues identifie

Activación:
@ia4d-quality-engineer-expert → [quality-gate-validator]
⑤ Flujo de Interacción

Prompt → Orquestador → Sub-agentes → Comandos → Resultado

invokes

analyzes & delegates

sub-agent 1

sub-agent 2

sub-agent 3

👤 User Prompt

🎯 ia4d-quality-engineer-expert\nORCHESTRATOR

✅ Code · Analysis · Report

Which agent?

🤖 dod-designer

🔀 Merge Results

🤖 metrics-analyst

🤖 quality-gate-validator

⚡ Execute Commands

/audit-quality

/define-dod

/define-dor

/define-quality-gates

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

⚡ Comandos (4)

/audit-quality

/define-dod

/define-dor

/define-quality-gates

🤖 Sub-Agentes (3)

dod-designer

metrics-analyst

quality-gate-validator

🎯 ia4d-quality-engineer-expe

⑥ Entradas / Salidas

Entradas

Código fuente del proyecto, descripción de la tarea

Salidas

Código generado, análisis, documentación, recomendaciones

⑦ Comandos Disponibles (4)

/ia4d-quality-engineer-expert:audit-quality
Audit existing project artifacts against quality gates. Checks FD, SA, TD documents, CI/CD pipeline, test coverage, and security scans. Returns a Quality Gate Audit Report with pass/fail per phase and

Ejemplo:
/ia4d-quality-engineer-expert:audit-quality
/ia4d-quality-engineer-expert:define-dod
Create a Definition of Done customized for the project's team, methodology, and tech stack. Produces DoD checklists by story type (Feature, Bug, Tech Debt, Spike).

Ejemplo:
/ia4d-quality-engineer-expert:define-dod \
/ia4d-quality-engineer-expert:define-dor
Create a Definition of Ready with measurable criteria for sprint entry. Ensures stories are actionable before developers pick them up.

Ejemplo:
/ia4d-quality-engineer-expert:define-dor --team "Scrum, 2-week sprints"
/ia4d-quality-engineer-expert:define-quality-gates
Define Quality Gate criteria for each SDLC phase. Produces a Quality Gates document specifying what must be verified before advancing from requirements to FD, FD to architecture, architecture to TD, T

Ejemplo:
/ia4d-quality-engineer-expert:define-quality-gates \