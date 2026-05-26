① Agente Principal

NOMBRE	ia4d-flutter-expert
ROL	Orquestador
VERSION	v1.0.0
Objetivo

Usa este agente cuando necesites desarrollar apps Flutter, implementar gestión de estado, configurar navegación, optimizar el rendimiento de widgets, diseñar UIs Material 3 o generar tests en Dart.

② Uso del Agente

Orquestador: auto-detecta el contexto y delega a los sub-agentes según la tarea.

@ia4d-flutter-expert Use this agent when you need to develop Flutter apps, implement state management, configure navigation, optimize widget performance, design Material 3 UIs, or generate Dart tests. Examples: "implement
③ Casos de Uso

Análisis y desarrollo con ia4d-flutter-expert
Automatización de tareas de Frontend Framework
Generación de artefactos especializados
Integración con el ecosistema flutter, dart
④ Sub-Agentes Especializados (1)

flutter-test-generator
Use this agent to generate Flutter widget tests, unit tests for BLoC/Riverpod, integration tests, and mocks. Examples: "generate widget tests for UserCard", "write BLoC tests for AuthBloc", "create in

Activación:
@ia4d-flutter-expert → [flutter-test-generator]
⑤ Flujo de Interacción

Prompt → Orquestador → Sub-agentes → Comandos → Resultado

invokes

analyzes & delegates

sub-agent 1

👤 User Prompt

🎯 ia4d-flutter-expert\nORCHESTRATOR

✅ Code · Analysis · Report

Which agent?

🤖 flutter-test-generator

🔀 Merge Results

⚡ Processing

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

⚡ Comandos (0)

No direct commands

🤖 Sub-Agentes (1)

flutter-test-generator

🎯 ia4d-flutter-expert

⑥ Entradas / Salidas

Entradas

Código fuente del proyecto, descripción de la tarea

Salidas

Código generado, análisis, documentación, recomendaciones