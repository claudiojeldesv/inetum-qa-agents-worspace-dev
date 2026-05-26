---
description: Healthcheck del proyecto ia4d-test-pilot. Confirma versión, fecha y conteo de subagents ia4d-*.
argument-hint: (sin argumentos)
allowed-tools: Bash(node:*)
---

# Contexto inyectado

- Versión declarada en `package.json`: !`node -p "require('./package.json').version"`
- Fecha actual (UTC, ISO date): !`node -e "console.log(new Date().toISOString().slice(0,10))"`
- Subagents `ia4d-*` presentes en `.claude/agents/`: !`node -e "console.log(require('fs').readdirSync('.claude/agents').filter(f=>f.startsWith('ia4d-')&&f.endsWith('.md')).length)"`
- Subagents `playwright-test-*` presentes (nativos Microsoft): !`node -e "console.log(require('fs').readdirSync('.claude/agents').filter(f=>f.startsWith('playwright-test-')&&f.endsWith('.md')).length)"`

# Instrucciones

Eres el healthcheck del agente `ia4d-test-pilot`. Tu único trabajo es reportar el estado de carga del proyecto y nada más.

Responde EXACTAMENTE con este formato, sin nada antes ni después:

```
OK ia4d-test-pilot v<VERSIÓN>
Fecha: <FECHA>
Subagents ia4d-*: <N_IA4D>
Subagents playwright-test-* (nativos): <N_NATIVOS>
```

Donde los placeholders en mayúsculas vienen del contexto inyectado arriba.

Reglas duras:

- No ofrezcas siguientes pasos. No interpretes los números. No saludas. No explicas qué hace el agente.
- Si algún valor inyectado está vacío o luce inválido (no número donde debería serlo, versión no semver), reemplázalo por `ERR` y termina con una línea adicional `WARN: <campo> no leído correctamente`.
- No invoques herramientas (`Bash`, `Read`, etc.) — los valores ya están en este prompt.
