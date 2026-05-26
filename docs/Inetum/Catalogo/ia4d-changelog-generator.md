① Agente Principal

NOMBRE	ia4d-changelog-generator
ROL	Orquestador
VERSION	v5.0.12
Objetivo

Usa este agente cuando necesites generar changelogs, release notes, guías de migración o documentación de versiones desde el historial git siguiendo conventional commits.

② Uso del Agente

Orquestador: auto-detecta el contexto y delega a los sub-agentes según la tarea.

@ia4d-changelog-generator Use this agent when you need to generate changelogs, release notes, migration guides, or version documentation from git history. Coordinates specialized sub-agents for parsing, analysis, and documenta
③ Casos de Uso

Análisis y desarrollo con ia4d-changelog-generator
Automatización de tareas de Documentación y Calidad
Generación de artefactos especializados
Integración con el ecosistema git, conventional-commits
④ Sub-Agentes Especializados (12)

changelog-auditor
Expert agent for auditing CHANGELOG.md files against Keep a Changelog standards, detecting issues, and providing actionable recommendations.

Activación:
@ia4d-changelog-generator → [changelog-auditor]
changelog-commit-parser
Use this agent when you need to parse commit messages following Conventional Commits specification. Examples:

Activación:
@ia4d-changelog-generator → [changelog-commit-parser]
changelog-commit-parser
Use this agent when you need to parse commit messages following Conventional Commits specification. Examples:

Activación:
@ia4d-changelog-generator → [changelog-commit-parser]
changelog-git-analyzer
Use this agent when you need to analyze git history, extract commits, or work with tags and branches. Examples:

Activación:
@ia4d-changelog-generator → [changelog-git-analyzer]
changelog-migration-guide-generator
Use this agent when you need to create migration guides for breaking changes or major version upgrades. Examples:

Activación:
@ia4d-changelog-generator → [changelog-migration-guide-generator]
changelog-release-notes-writer
Use this agent when you need to create user-facing release notes or release announcements. Examples:

Activación:
@ia4d-changelog-generator → [changelog-release-notes-writer]
changelog-version-manager
Use this agent when you need to detect, calculate, or manage semantic versions. Examples:

Activación:
@ia4d-changelog-generator → [changelog-version-manager]
ia4d-changelog-generator
Use this agent when you need to generate changelogs from git history, create release notes, maintain version documentation, or automate changelog generation. Examples:\n\n \n\n \n\n

Activación:
@ia4d-changelog-generator → [ia4d-changelog-generator]
changelog-git-analyzer
Use this agent when you need to analyze git history, extract commits, or work with tags and branches. Examples:

Activación:
@ia4d-changelog-generator → [changelog-git-analyzer]
changelog-migration-guide-generator
Use this agent when you need to create migration guides for breaking changes or major version upgrades. Examples:

Activación:
@ia4d-changelog-generator → [changelog-migration-guide-generator]
changelog-release-notes-writer
Use this agent when you need to create user-facing release notes or release announcements. Examples:

Activación:
@ia4d-changelog-generator → [changelog-release-notes-writer]
changelog-version-manager
Use this agent when you need to detect, calculate, or manage semantic versions. Examples:

Activación:
@ia4d-changelog-generator → [changelog-version-manager]
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

🎯 ia4d-changelog-generator\nORCHESTRATOR

✅ Code · Analysis · Report

Which agent?

🤖 changelog-auditor

🔀 Merge Results

🤖 changelog-commit-parser

🤖 changelog-commit-parser

🤖 changelog-git-analyzer

🤖 changelog-migration-guide-ge

🤖 changelog-release-notes-writ

⚡ Execute Commands

/analyze-commits

/audit-changelog

/compare-versions

/detect-version

/generate-changelog

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

/analyze-commits

/audit-changelog

/compare-versions

/detect-version

/generate-changelog

/generate-migration-guide

🤖 Sub-Agentes (8)

changelog-auditor

changelog-commit-parser

changelog-commit-parser

changelog-git-analyzer

changelog-migration-guide-

changelog-release-notes-wr

changelog-version-manager

ia4d-changelog-generator

🎯 ia4d-changelog-generator

⑥ Entradas / Salidas

Entradas

Código fuente, commits git, especificaciones

Salidas

Documentación HTML/MD, changelog, release notes, ADRs

⑦ Comandos Disponibles (9)

/ia4d-changelog-generator:analyze-commits
Analyzes git commits for changelog categorization and version suggestions

Ejemplo:
/analyze-commits
/ia4d-changelog-generator:audit-changelog
Perform a comprehensive audit of CHANGELOG.md for format compliance, version synchronization, and content completeness

Ejemplo:
/audit-changelog
/ia4d-changelog-generator:compare-versions
Compares changes between two versions

Ejemplo:
/compare-versions --v1 v1.0.0 --v2 v2.0.0
/ia4d-changelog-generator:detect-version
Detects current version and suggests next version based on changes

Ejemplo:
/detect-version
/ia4d-changelog-generator:generate-changelog
Generates CHANGELOG.md from git history following Keep a Changelog format

Ejemplo:
/generate-changelog --version 2.0.0
/ia4d-changelog-generator:generate-migration-guide
Creates migration guides for breaking changes between versions

Ejemplo:
/generate-migration-guide --from v1.0.0 --to v2.0.0
/ia4d-changelog-generator:generate-release-notes
Creates user-facing release notes from changelog or git history

Ejemplo:
/generate-release-notes --version 2.0.0
/ia4d-changelog-generator:init-changelog
Initializes a new CHANGELOG.md file with proper structure

Ejemplo:
/init-changelog
/ia4d-changelog-generator:validate-commits
Validates commit messages against Conventional Commits specification

Ejemplo:
/validate-commits