---
description: Despliega el workspace de ia4d-qa-automator en una carpeta y lo deja listo (scaffold + npm install + healthcheck). Primer paso tras instalar el plugin.
argument-hint: "[carpeta-destino]  (default: qa-automator-workspace)"
---

# /ia4d-qa-automator:init

Arranca un workspace QA completo a partir del plugin instalado. Es lo primero que ejecuta un
Ingeniero QA tras descargar el plugin del marketplace. (Los commands del plugin se invocan con el
prefijo del plugin `ia4d-qa-automator:`; los del workspace desplegado son `qa-automator:*`.)

## Qué hace

Copia el workspace de arranque (agentes, commands, hooks, runtime, config, labs) a la carpeta que
indiques, instala dependencias y verifica el runtime. Tras esto **el agente vive en el `.claude/` de
ESE proyecto**: ábrelo en el IDE y usa `/qa-automator:*` desde ahí.

## Pasos (ejecútalos en orden)

Carpeta destino = primer argumento (`$ARGUMENTS`), o `qa-automator-workspace` si no se indica.

1. **Scaffold determinístico.** Ejecuta el script empaquetado (copia el workspace sin
   `node_modules`):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scaffold/scaffold.mjs" "<carpeta-destino>"
   ```
   Si el destino no está vacío el script aborta: pide otra carpeta o vuelve a ejecutar con `--force`
   solo si el usuario confirma que quiere sobrescribir.

2. **Instala dependencias** dentro del workspace:
   ```bash
   cd "<carpeta-destino>" && npm install && npx playwright install chromium
   ```

3. **Toggles (opcional).** Si el usuario quiere ajustar gates (PII/Judge/a11y), copia el ejemplo:
   ```bash
   cp .env.example .env
   ```

4. **Verifica el runtime:**
   ```bash
   npm run qa:healthcheck
   ```
   Debe terminar en `Healthcheck OK`. Si falla, reporta qué pieza falta (el propio script lo dice) y
   no continúes.

5. **Cierra con instrucciones al QA:** dile que abra `<carpeta-destino>` en el IDE (VS Code /
   JetBrains) y que pruebe el primer lab:
   ```
   /qa-automator:autonomous --url=https://www.saucedemo.com/ --flows=login,checkout
   ```
   La guía de uso completa está en el `CLAUDE.md` y `README.md` del workspace.

## Notas

- No inventes rutas ni ficheros: el scaffold es determinístico y ya trae todo. Tu trabajo es
  orquestar los comandos y reportar resultados, no generar contenido.
- Si `${CLAUDE_PLUGIN_ROOT}` no está definido en el entorno, localiza `scaffold/scaffold.mjs` dentro
  del directorio de instalación del plugin y ejecútalo con esa ruta absoluta.
