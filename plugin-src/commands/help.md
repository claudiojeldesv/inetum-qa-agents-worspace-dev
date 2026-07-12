---
description: Qué es ia4d-qa-automator y cómo empezar (ejecuta /qa-automator:init para desplegar el workspace).
---

# /qa-automator:help

`ia4d-qa-automator` genera tests E2E Playwright estructurados (POM, accesibilidad baked-in,
trazabilidad auditable) desde una URL, un Gherkin o un documento funcional, con un Reviewer
independiente que audita el código antes de exponerlo. Opera como **juez QA independiente** (greybox
o black-box), no como el dev que testea su propio código.

## Empezar

Este plugin es el repartidor. El agente real vive en un **workspace** que despliegas una vez:

```
/qa-automator:init  mi-workspace-qa
```

Eso copia el workspace, instala dependencias y verifica el runtime. Después abre `mi-workspace-qa`
en el IDE y trabaja desde ahí:

- `/qa-automator:autonomous --url=<URL> --flows=<módulos>`   — S4, solo URL
- `/qa-automator:spec-refiner --fd=<path> --url=<URL>`       — S3, FD + URL
- `/qa-automator:req-driven --gherkin=<path> --url=<URL>`    — S2, Gherkin + URL
- `/qa-automator:config` · `/qa-automator:report` · `/qa-automator:healthcheck`

La guía completa está en el `CLAUDE.md` del workspace desplegado.
