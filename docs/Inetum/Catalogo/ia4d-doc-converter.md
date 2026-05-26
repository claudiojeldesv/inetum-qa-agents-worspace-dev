① Agente Principal

NOMBRE	ia4d-doc-converter
ROL	Orquestador
VERSION	v5.2.11
Objetivo

Usa este agente cuando necesites convertir documentación Markdown a formatos corporativos (Word, PDF, PowerPoint, HTML) con plantillas de aspecto profesional.

② Uso del Agente

Orquestador: auto-detecta el contexto y delega a los sub-agentes según la tarea.

@ia4d-doc-converter Use this agent when you need to convert Markdown documentation to corporate formats (Word, PDF, PowerPoint, HTML) with ABSOLUTE FIDELITY to corporate templates. Supports interactive format and templat
③ Casos de Uso

Análisis y desarrollo con ia4d-doc-converter
Automatización de tareas de Documentación y Calidad
Generación de artefactos especializados
Integración con el ecosistema markdown, conversion
④ Sub-Agentes Especializados (1)

template-design-extractor
Agent specialized in extracting design tokens from corporate templates (.docx, .pptx, .css).

Activación:
@ia4d-doc-converter → [template-design-extractor]
⑤ Flujo de Interacción

Prompt → Orquestador → Sub-agentes → Comandos → Resultado

invokes

analyzes & delegates

sub-agent 1

👤 User Prompt

🎯 ia4d-doc-converter\nORCHESTRATOR

✅ Code · Analysis · Report

Which agent?

🤖 template-design-extractor

🔀 Merge Results

⚡ Execute Commands

/convert-to-html

/convert-to-pdf

/convert-to-ppt

/convert-to-word

/extract-design-tokens

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

/convert-to-html

/convert-to-pdf

/convert-to-ppt

/convert-to-word

/extract-design-tokens

/list-templates

🤖 Sub-Agentes (1)

template-design-extractor

🎯 ia4d-doc-converter

⑥ Entradas / Salidas

Entradas

Código fuente, commits git, especificaciones

Salidas

Documentación HTML/MD, changelog, release notes, ADRs

⑦ Comandos Disponibles (6)

/ia4d-doc-converter:convert-to-html
Convert Markdown documentation to a navigable HTML documentation site with search, TOC, and corporate styling

Ejemplo:
/convert-to-html <markdown-path> [options]
/ia4d-doc-converter:convert-to-pdf
Convert Markdown documentation to PDF format with corporate styling, table of contents, and optional watermark

Ejemplo:
/convert-to-pdf <markdown-file> [options]
/ia4d-doc-converter:convert-to-ppt
Convert Markdown documentation to PowerPoint presentation (.pptx) using corporate templates with slide splitting

Ejemplo:
/convert-to-ppt <markdown-file> [options]
/ia4d-doc-converter:convert-to-word
Convert Markdown documentation to Word (.docx) format with interactive template selection and corporate branding fidelity

Ejemplo:
/convert-to-word <markdown-file> [options]
/ia4d-doc-converter:extract-design-tokens
Extract design tokens from a corporate template file (.docx, .pptx, .css).

Ejemplo:
/extract-design-tokens [template-file] [options]
/ia4d-doc-converter:list-templates
List all available corporate templates for document conversion grouped by format (Word, PDF, PowerPoint, HTML)

Ejemplo:
/list-templates [format]