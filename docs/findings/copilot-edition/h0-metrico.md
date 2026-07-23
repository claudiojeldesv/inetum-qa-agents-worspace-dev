# H0 — Métrico: coste por acto y matriz de modelos (edición Copilot)

**Estado**: PREPARADO — pendiente de ejecución interactiva por Claudio. **Fecha de preparación**: 2026-07-18.
**Gate de la fase**: tabla de coste por acto rellenada + target de coste por suite fijado con datos.

Los runs interactivos de Copilot no puede ejecutarlos el agente. Este documento contiene los pasos exactos; los números se pegan en las tablas de abajo y con eso se cierra el gate.

## Qué se mide

Tres configuraciones sobre el flujo S4 del spike (`/qa-autonomous`, SauceDemo, `flows=inicio-sesion,compra max=3`):

| Run | Sesión (orquestador) | Writer/Reviewer | Mecánicos (planner/discovery/a11y/healer) |
|---|---|---|---|
| A | Claude Sonnet 5 | `['Claude Sonnet 5', 'Claude Sonnet 4.6']` | Haiku 4.5 (ya pinneados) |
| B | Claude Sonnet 5 | `['Claude Haiku 4.5']` | Haiku 4.5 |
| C (opcional) | Claude Haiku 4.5 | `['Claude Haiku 4.5']` | Haiku 4.5 |

Nota: A y B comparten sesión Sonnet para aislar la variable writer/reviewer (el coste por subagent se lee por separado en la UI). C mide el suelo todo-Haiku — con sesión Haiku el cost-tier impide subir el writer, por eso C exige la variante haiku aplicada.

## Preparación (una vez)

1. VS Code actualizado; extensión Copilot con coste por sesión/subagent visible (feature de junio 2026).
2. Admin: Sonnet 5 y Haiku 4.5 habilitados en la policy de la org. Sin esto, no hay matriz.
3. En `../qa-copilot-spike/`: hooks habilitados (banner "Enable"), MCP `playwright-test` operativo (`.vscode/mcp.json`), `npm run build:hooks` ejecutado si `hooks/dist/` no existe.
4. Existe `measurement/set-models.mjs` (instrumentación H0, ya creado). Estado actual: variante `sonnet` aplicada.

## Pasos exactos por run

1. En terminal, dentro del spike: `node measurement/set-models.mjs sonnet` (Run A) o `haiku` (Runs B y C).
2. Sesión de chat NUEVA en VS Code (nunca reusar sesión: el contexto acumulado contamina el coste). Modo agente. Modelo de sesión según la tabla.
3. Anota la hora de inicio y, si el panel de usage lo muestra, los créditos consumidos del pool antes de empezar.
4. Lanza: `/qa-autonomous url=https://www.saucedemo.com/ flows=inicio-sesion,compra max=3`
5. No intervengas salvo bloqueo real. Si un subagent cuelga >10 min (patrón GPT-mini del spike; con Haiku no se reprodujo), anótalo y cancela el run — el cuelgue es dato.
6. Al terminar, captura de la UI de la sesión: coste total y coste por subagent (créditos; tokens in/out/cached si se muestran). Además: duración total, iteraciones de review por spec, healer invocado sí/no, resultado (`npx playwright test tests/e2e/saucedemo/` → N passed).
7. Preserva evidencia: copia `.work/saucedemo/` y `.work/audit-log.json` a `measurement/runs/<A|B|C>/`.
8. Rellena la fila correspondiente en las tablas de abajo.

## Tablas de captura

### Coste por acto/subagent (créditos por run)

| Componente (acto) | Run A | Run B | Run C | Notas |
|---|---|---|---|---|
| Orquestador — sesión (actos 1/2.5/3, delta tras restar subagents) | | | | |
| planner × flujo (acto 2) | | | | 2 flujos |
| discovery-analyzer (acto 2) | | | | |
| pom-scaffolder (acto 3) | 0 | 0 | 0 | determinístico |
| writer × spec (acto 4) | | | | hasta 3 specs |
| reviewer × review (acto 5) | | | | iteraciones aparte |
| a11y-injector | | | | |
| healer (solo si rojos) | | | | |
| **Total sesión** | | | | |
| **Por caso (total / specs verdes)** | | | | |

### Calidad (¿el barato degrada?)

| Métrica | Run A | Run B | Run C |
|---|---|---|---|
| Specs verdes / generados | | | |
| Iteraciones de review (total) | | | |
| Healer necesario (sí/no, nº fixes) | | | |
| Violaciones de style contract detectadas por reviewer | | | |
| Duración total (min) | | | |

### Proyección promo vs post-promo

Fórmulas (tarifas del plan, verificadas 2026-07-16/18):

- Post-promo (desde 2026-09-01): créditos atribuidos a Sonnet 5 × **1.5** (2.00–10.00 → 3.00–15.00 $/Mtok). Haiku sin cambio.
- Cuota Business post-promo: 3.000 → **1.900** créditos/user/mes (pooled).

| Métrica | Run A | Run B | Run C |
|---|---|---|---|
| Coste/suite promo (créditos) | | | |
| Coste/suite post-promo (créditos) | | | |
| Suites/mes con 3.000 (promo) | | | |
| Suites/mes con 1.900 (post-promo) | | | |

### Referencia del spike (medido 2026-07-16, pre-instrumentación fina)

| Run | Config | Créditos | Por caso |
|---|---|---|---|
| D3 (1 caso) | Todo Sonnet 5 | 118,8 | ~119 |
| D4 (3 casos + healing + re-review) | Haiku mecánicos + Sonnet W/R | ~222 | ~74 |

## Target (a fijar con los datos — no antes)

Al cerrar las tablas: fijar `target de coste por suite S3` (créditos post-promo, 3 specs) que la edición Copilot debe cumplir en el gate de H2. La arquitectura H1/H2 sustituye planner+discovery (los actos caros del spike) por el dom-walker determinístico, así que el target razonable saldrá de: `(writer + reviewer + refiner + mapping) del run ganador + margen`.

**TARGET FIJADO**: _pendiente_.
