# Lab 06 — Restful Booker (todas las puertas sobre un mismo sitio)

El lab completo. Un solo sitio real —un portal de reservas de hotel con cara pública y panel de
administración— recorrido por **todas las puertas de entrada del agente**, más el ciclo del walker con
el panel y con rescate de IA. Si los labs 01-04 te enseñaron las puertas por separado, aquí las ves
sobre el mismo material y puedes comparar lo que produce cada una.

## Qué hay aquí, y para qué sirve cada pieza

| Fichero | Qué es | Lo usan |
|---|---|---|
| `restful-booker-fd.md` | El **Diseño Funcional**: 10 casos de regresión, registro corporativo, escritos desde la interfaz | S3, y el `criteria.json` |
| `criteria.json` | Los criterios `CP001..CP010` **generados** del FD con `qa:criterios` (parser determinista, sin LLM) | el walker, para citar `fd.md:línea` en el panel |
| `reservas.feature` | Cuatro escenarios en Gherkin derivados del FD, con `@TC-CPxxx` apuntando al caso | S2 |
| `regresion-corta.walk.json` | Recorte de **tres casos** del guion de regresión, elegidos por lo que se midió que hacen | el walker: panel y rescate |
| `ensayo-panel/` | Un **simulacro** de tres casos con huecos a propósito, con su propio FD y criterios | el recorrido completo del panel |
| `restful-booker-regresion.walk.json` | El guion **entero**: 10 casos, 111 pasos | la regresión de verdad, cuando quieras verla |

> **Dos FD y no es un error.** `restful-booker-fd.md` es el documento real del sitio, con sus diez
> casos y sus tensiones declaradas. El de `ensayo-panel/` es un **simulacro**: tres casos escritos para
> que se planten seis veces, una por cada función del panel. Uno enseña el producto trabajando; el otro
> te enseña a manejar el panel sin esperar a que la regresión se rompa sola.

## Por dónde se empieza: por la conversación, no por este índice

```
/ia4d-qa-automator:setup
```

**Eso es todo.** El setup mira primero qué hay en el workspace, te pregunta qué tienes para empezar —un
documento funcional, un Gherkin, sólo la URL— y de ahí **deduce la puerta**, emite tu Style Contract y
**se ofrece a lanzar el comando que toca**, ya relleno. Si vuelves otro día, detecta que ya tienes
contract y en vez de repetir la entrevista te pregunta qué quieres hacer.

Las guías de abajo **no son seis caminos que tengas que elegir**: son lo que leer **en la parada donde
el setup te deje**. Cada una explica una puerta con sus textos reales y qué mirar con lupa.

| Si el setup te lleva a… | Lee |
|---|---|
| la propia entrevista, y quieres entenderla | [`guias/01-setup.md`](guias/01-setup.md) |
| **S4** — sólo tienes la URL | [`guias/02-autonomous.md`](guias/02-autonomous.md) |
| **S3** — tienes un documento funcional | [`guias/03-spec-refiner.md`](guias/03-spec-refiner.md) |
| **S2** — tienes un `.feature` Gherkin | [`guias/04-req-driven.md`](guias/04-req-driven.md) |
| ejecutar una regresión y resolverla tú | [`guias/05-panel.md`](guias/05-panel.md) |
| ejecutar una regresión y que la resuelva la IA | [`guias/06-rescate.md`](guias/06-rescate.md) |

> **Y si prefieres el camino largo**, recórrelas en ese orden: va de menos material a más, y al final
> puedes comparar los tests que produce cada puerta sobre el mismo sitio. Cada guía funciona suelta.

## El sitio, y dos cosas que muerden

[automationintesting.online](https://automationintesting.online/) es la demo pública de
restful-booker-platform. Cara pública sin login, panel de administración con login.

**Es compartida y tiene estado.** No es un inconveniente del lab: es la lección. Otras personas usan la
misma demo, y lo que dejas dentro lo ven los demás.

- **El catálogo de habitaciones cambia.** Medido el 2026-09-04: entre dos pasadas del **mismo** guion
  desapareció la tarjeta «Single» de la portada sin que nadie tocara nada. Un caso que dependa de una
  habitación concreta puede plantarse por eso, y saber distinguirlo de un defecto es trabajo de QA.
- **Por eso el material no deja rastro fijo.** El alta de habitación de `regresion-corta` usa un nombre
  **único por run** (`7{{unico}}`) en vez del `701` del FD, para no llenar la demo de duplicados. Las
  fichas admitidas son `{{hoy}}`, `{{hoy+N}}`, `{{hoy-N}}` (con `:FORMATO` opcional) y `{{unico}}`, y
  se resuelven al ejecutar. Una ficha que el motor no reconozca **para el run** en vez de escribir las
  llaves dentro del campo.

## Antes de empezar

Desde la raíz del workspace, una sola vez:

```
npm install
npx playwright install chromium
npm run qa:healthcheck
```

Debe acabar con `Healthcheck OK`. Y la URL del sitio va **con la barra final**
(`https://automationintesting.online/`): sin ella el pre-flight de compliance responde «URL not
declared in allowed-targets», que suena a que falta permiso cuando lo que falla es el patrón.

> **Los commands vienen del plugin**, no del workspace. `/ia4d-qa-automator:regression` y compañía
> existen si tienes el plugin instalado; el workspace aporta los scripts, la configuración y este
> material.
