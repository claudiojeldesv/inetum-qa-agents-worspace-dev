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

## Orden recomendado

De menos material a más. Cada guía funciona también suelta.

1. **`guias/01-setup.md`** — la entrevista que emite el Style Contract del sitio, y comparar el tuyo con
   el que viene aquí.
2. **`guias/02-autonomous.md`** — S4: solo la URL. La puerta que no necesita que prepares nada.
3. **`guias/03-spec-refiner.md`** — S3: el FD y la URL. Trazabilidad `CPxxx` y detección de drift.
4. **`guias/04-req-driven.md`** — S2: el `.feature` y la URL. La misma trazabilidad por otra puerta.
5. **`guias/05-panel.md`** — el walker semi-manual: cuando no encuentra algo, te pregunta.
6. **`guias/06-rescate.md`** — el walker con IA: cuando no encuentra algo, se lo pregunta a Claude.

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
