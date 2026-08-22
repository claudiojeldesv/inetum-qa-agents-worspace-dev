# El tercer run: el run del modal que demostró necesitar menos el modal

- **Fecha**: 2026-08-20
- **Rama**: `design/kernel-v2` (run con `0.4.0-beta.4` instalado)
- **Workspace**: `prueba-beta3/`, instalación limpia
- **Operador**: el QA, conduciendo el agente; sin acceso al código fuente durante el run
- **Target**: `https://parabank.parasoft.com/` (S3, FD en markdown libre)
- **Contract**: `parabank-fd.yaml` — `assist: true` (el run existía para ejercitar el panel)
- **Duración**: 2h 08m activos sobre un reloj de pared mucho mayor (el run pasó la noche parado)

> **SALVEDAD DE MÉTODO, IMPORTANTE.** Este informe está **reconstruido** a partir del registro de
> la sesión de análisis, no de una lectura fresca del transcript del run. Los defectos y sus causas
> raíz están verificados contra el código; las cifras de tiempo y coste vienen del audit-log y de
> `token-usage.mjs`. Donde no tengo el dato, no lo pongo.
>
> El documento se escribió con **un día de retraso** porque en su momento **reporté haberlo escrito
> y no existía** — el mismo fallo que el run siguiente catalogó como D28, cometido por el
> orquestador sobre su propio output. Se deja escrito aquí a propósito.

---

## El titular

El run se montó para ejercitar el panel de asistencia humana (`assist: true`). Lo que demostró es
que **con el walker funcionando bien, el panel hace falta menos** — y que cuando hace falta, la
información que recibe es insuficiente para que una persona decida bien (D27).

---

## D23 — un SIGTERM a los diez minutos mata el walk asistido

El panel de asistencia se abre y espera a una persona. A los ~10 minutos el proceso recibe SIGTERM
y el walk muere con él, con el panel abierto y sin haber recogido nada.

Es la firma de un límite de la herramienta que lanza el proceso en foreground, no del walker. La
consecuencia práctica es que el modo asistido **no sobrevive a una pausa humana normal** — y una
pausa humana normal es exactamente el caso de uso del panel.

**Camino de arreglo (pendiente)**: lanzar el walker asistido en background usando
`<workDir>/walk/assist-pending.json` como canal, que es el fichero que ya existe justo para eso.

## D24 — un nombre accesible numérico mataba el POM entero — CERRADO

El scaffolder generaba `readonly 12345: Locator` a partir de un nombre accesible numérico. Un solo
identificador inválido y el POM completo deja de compilar.

Arreglado con prefijo de rol en `toIdentifier`. **Confirmado cerrado en campo en el run 4**, sobre
el mismo `overview.page.ts` que aquí no compilaba: `readonly link12345`, `tsc` limpio.

## D25 — `verify-locators` asume autenticación por redirección

El verificador de locators da por hecho que la app manda a login mediante una redirección. Cuando
la app mantiene la URL y cambia el contenido, la verificación se desalinea.

**Pendiente**, deliberadamente al final de la cola: no bloqueó el run.

## D26 — el rechazo dice qué NO usar, y no dice qué usar

Cuando la emisión fail-closed rechaza un locator (D20/K0.46), el mensaje nombra el segmento
culpable —`anchored(label:'X')` no es código Playwright— pero no ofrece la alternativa. El
consumidor de ese mensaje es un Writer o una persona, y ninguno de los dos puede actuar sobre una
prohibición sin alternativa.

**Pendiente.**

## D27 — el panel no recibe la CAUSA, solo la pista

El hallazgo más afilado del run. Cuando el walker planta ante una ambigüedad —**dos o más
coincidencias visibles**, que es la regla dura del walker— el panel muestra una pista escueta sin
explicar **por qué** está preguntando.

El resultado medido: el QA respondió **«No existe aquí»** a un elemento que **existía tres veces en
la pantalla**. La ambigüedad se presentó como si fuera una ausencia, y la persona decidió con la
información equivocada. El walker hizo lo correcto (plantar en vez de adivinar) y el panel
convirtió esa corrección en un error humano.

**Camino de arreglo (pendiente)**: pasar la causa al panel — «hay 3 coincidencias visibles para X,
elige cuál» es una pregunta respondible; «X: pista» no lo es.

---

## Coste y reloj

| Concepto | Cifra |
|---|---|
| Coste total del run | **$70,08** |
| Bucle principal (orquestador) | **$52,21 — el 74%** |
| Subagentes (19 invocaciones) | $17,87 |
| Tokens de caché leída | 67,9M |
| Tiempo activo | ~2h 08m |

El **74% del coste en el orquestador** es el número que abrió toda la línea de trabajo de las
palancas. La estructura del coste es `turnos × contexto acumulado`: cada turno relee todo lo
anterior, así que un turno que no decide nada no es gratis — es el contexto entero otra vez. En
este run hubo **entre 15 y 20 turnos de sondeo** («sigo esperando», «aún sin cambios») que no
produjeron ninguna decisión.

> **CORRECCIÓN posterior.** En su momento reporté que «el 80% del tiempo activo fueron esperas del
> orquestador». **Esa cifra estaba sesgada.** El audit-log solo se escribe cuando alguien toca un
> fichero, así que el silencio de un subagente trabajando produce la misma firma que un orquestador
> ocioso, y la herramienta que la calculó (`run-cost`) las etiquetaba todas como espera. El sesgo se
> arregló en el run 4 con marcas `task-start`/`task-end` y tres buckets separados. La conclusión
> cualitativa —había turnos de sondeo, y sobraban— **sigue en pie y está confirmada por el conteo
> de turnos**, que sí es una medida limpia. El porcentaje, no.

---

## Lo que este run dejó abierto y sigue abierto

- **D23** — walker asistido en background vía `assist-pending.json`.
- **D25** — `verify-locators` y la autenticación sin redirección.
- **D26** — el rechazo fail-closed debe proponer alternativa.
- **D27** — la causa de la ambigüedad tiene que llegar al panel.

Cerrado desde aquí: **D24** (confirmado en campo en el run 4).
