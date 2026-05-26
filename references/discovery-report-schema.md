# `discovery-report.md` — schema

El archivo `output/discover/discovery-report.md` resume la exploración hecha por `/test-pilot:discover` contra una URL. Es **markdown** (no JSON) porque su consumidor principal es humano (SDET, QA Manager) y secundario es el siguiente command de la cadena (`/test-pilot:plan` en Slice 6) que lo lee como contexto adicional.

Convive con `output/discover/plan.md` (que escribe el `playwright-test-planner` nativo vía `planner_save_plan`). El report **no duplica** el plan — lo referencia.

## Estructura

```markdown
# Discovery report

- **URL**: <URL absoluta evaluada>
- **Timestamp**: <ISO 8601 UTC>
- **Compliance verdict**: PASS
- **Plan source**: output/discover/plan.md
- **Style contract**: <path al YAML | "none">

## Resumen del Planner

<texto del Planner: número de escenarios + lista resumida de nombres>

## Plan completo

Ver [`plan.md`](plan.md). El Slice 6 (`/test-pilot:plan`) lo enriquece con criterios del FD.

## Observaciones

<bullets con cualquier cosa relevante que el Planner reportó: campos
requeridos, flujos peculiares, comportamientos no triviales, paths
que no fueron explorables>
```

## Campos requeridos

| Campo | Tipo | Notas |
|---|---|---|
| URL | string | URL absoluta tal cual el SDET la pasó al command, normalizada (sin trailing slash si no estaba). |
| Timestamp | string | ISO 8601 UTC con milisegundos. Momento de cierre del command, no de inicio. |
| Compliance verdict | string | Siempre `PASS` en MVP — si era BLOCK, el command aborta antes de escribir el report. |
| Plan source | string | Path relativo al repo. `output/discover/plan.md` en MVP. |
| Style contract | string | Path al style contract si `--style=` se pasó, o `"none"`. No se usa en discover; queda registrado para trazabilidad de slices futuros. |

## Secciones requeridas

- **Resumen del Planner** — texto libre proveniente del Planner. Si el Planner devolvió un número de escenarios, listarlo explícito: `Planner reportó **<N>** escenarios:` + bullets.
- **Plan completo** — sección de un solo párrafo que referencia `plan.md` con link relativo. No copies el contenido aquí.
- **Observaciones** — bullets. Si no hay nada que reportar, escribe `Sin observaciones particulares.`. No lo omitas — la sección debe existir para que Slice 6 sepa dónde buscar.

## Ejemplo válido

```markdown
# Discovery report

- **URL**: https://www.saucedemo.com/
- **Timestamp**: 2026-05-26T19:00:00.000Z
- **Compliance verdict**: PASS
- **Plan source**: output/discover/plan.md
- **Style contract**: none

## Resumen del Planner

Planner reportó **6** escenarios:

- Login con usuario válido
- Login con usuario bloqueado
- Añadir producto al carrito
- Vaciar carrito
- Checkout happy path
- Checkout con dirección inválida

## Plan completo

Ver [`plan.md`](plan.md). El Slice 6 (`/test-pilot:plan`) lo enriquece con criterios del FD.

## Observaciones

- El campo "ZIP/Postal Code" del checkout acepta cualquier string no vacío sin validación.
- `locked_out_user` produce mensaje de error en `[data-test="error"]`.
- No hay rutas autenticadas accesibles sin login — el menú lateral cierra sesión correctamente.
```

## Lo que el report **NO** captura

- Selectores concretos (eso vive en el plan.md del Planner).
- Tests ejecutables (eso es Slice 7 `/test-pilot:generate`).
- Criterios del FD (eso lo añade Slice 6 `/test-pilot:plan`).
- Screenshots o trazas (Playwright los guarda aparte si se le pide; este report es texto).
- Métricas de coste (tokens, tiempo) — diferido a v0.2.

## Consumidores

- **Humano** (SDET, QA Manager): leer el report tras correr discover para entender qué descubrió el Planner.
- **`/test-pilot:plan`** (Slice 6): toma el report como input opcional `--planner-output=` para que `ia4d-fd-to-plan` enriquezca el plan con criterios del FD.
- **`/test-pilot:full-loop`** (Slice 11): encadena discover → plan, así que el report es artefacto intermedio.
