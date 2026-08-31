# Plan — el rescate que no muere

**Pausar el walker en el sitio, resolver, y seguir desde el mismo paso con el mismo navegador — en vez
de morirse y re-ejecutar el flujo entero.**

**Origen**: la pregunta del QA al cierre del tercer ciclo E2E en terreno virgen — *«¿no es factible que
en cuanto exista un error se pause el walker, la IA investigue, y se siga desde ese mismo paso con esa
misma instancia de navegador?»*. La investigación previa (workflow de 4 agentes sobre la
incompatibilidad «todo de una» vs. rescate) había planteado una falsa dicotomía: reactivo con replay
contra diferido con cosecha. Faltaba la tercera, que el propio producto ya usa con humanos.
**Branch**: `design/kernel-v2`. **Estado**: **Fase 0 EJECUTADA** (2026-08-31) — resultados en
[censo-de-bloqueos.md](../findings/censo-de-bloqueos.md); H1 corregida, H2 y H4 confirmadas, H3 parcial,
H5 pendiente de A/B. Fase 1 autorizada, no empezada. Fase 2 diseñada y **congelada**.

> **Lo que el censo cambió**: el abanico paralelo **no se construye** (12 rescates reales en 121
> bloqueos). Y el premio del en proceso no es el que yo defendía: son los **40 pasos en cascada** que hoy
> nadie llega a intentar, no el ahorro de sobres. Además apareció **D74**, que pasa a ser requisito de la
> Fase 1. Detalle en §7.

---

## 1. La pregunta, con su ejemplo

Dos pasos consecutivos que se plantan: `s8` «pulsar Aceptar» y `s9` «pulsar Cerrar».

| | Reactivo (hoy, `exit 42`) | Diferido (cosecha + 2ª pasada) | **En proceso** |
|---|---|---|---|
| Evidencia de `s9` | tras **replay** completo del flujo | tras una **pasada extra** entera | **inmediata**: el navegador ya está en la pantalla que abrió el arreglo de `s8` |
| Llamadas | 2 | 1 + 1 en la 2ª pasada (+3ª si hay otra capa) | 2 |
| Runs / pasadas | 3 | 2-3 | **1** |

Con puertas encadenadas el diferido necesita **una pasada por capa**. Y no es hipotético: en Restful
Booker, **4 de las 13** micro-llamadas fueron a pasos detrás de una puerta bloqueada.

## 2. Lo que la investigación ya cerró (y no hay que volver a discutir)

**a) El mecanismo existe y está probado — para humanos.** `assistResolve`
([dom-walker.ts:4035](../../copilot/src/dom-walker.ts)) pausa el walker **en proceso** con
`await new Promise(...)` + `assistTimeoutMs` (línea 207, 600 s por defecto) mientras el QA señala el
elemento en el navegador, y **continúa en la misma instancia, misma sesión, mismo paso**. Sin `exit`,
sin replay. El rescate LLM no lo hace porque `consumeRescueResponse`
([dom-walker.ts:4988](../../copilot/src/dom-walker.ts)) es una **lectura de un solo intento** del
fichero: no hay bucle de espera. Le falta literalmente eso.

**b) La regla dura #5 no se toca.** El walker escribe un fichero y espera un fichero. Sigue sin hablar
con ningún LLM. El handoff es el mismo; lo único que cambia es que no se muere en medio.

**c) `exit 42` no existía por pureza, sino por el modelo de orquestación.** Si el orquestador lanza el
walker como llamada bloqueante, necesita que el proceso **termine** para recuperar el control. Con el
walker en segundo plano, el orquestador puede vigilar `rescue-request.json`, contestar y dejar que el
walker lo recoja sin haberse movido de la pantalla.

**d) El coste era el sobre, no la carta.** Los ~44-94k por rescate eran el **arranque de un subagente**
(system prompt + `CLAUDE.md` auto-inyectado + herramientas). La petición podada pesa 4,3 KB (~3k).
Contestando directo: **~3-5k por rescate**. Tres rescates ≈ 12k, menos que **un solo** envoltorio.
Corolario: **agrupar dejó de tener sentido económico** — se agrupaba para ahorrar sobres.

**e) «Todo de una» nunca fue posible, y el diferido tampoco lo arregla.** La evidencia del paso N+1 no
existe hasta ejecutar N. El diferido solo agrupa **la capa visible**.

**f) La varianza entre sitios ya la absorbió el triaje.** Llamadas de rescate por sitio: RBP **sin**
triaje 13 (538k, 0 desbloqueos) → **con** triaje 3 (136k, 4); Tricentis 2 (~92k, 1 + alias promovido);
EspoCRM 2 (~85k, 0 netos); OrangeHRM 8 (6 legítimos). De un orden de magnitud de horquilla a **2-8**.
**Si la decisión fuese «por sitio», elegirías lo mismo en los cuatro.**

**g) La única ventaja estructural del diferido es el paralelismo.** El en proceso es **serial por
construcción** (el walker está parado). Con 2-3 rescates son 30-100 s de reloj muerto: nada. Con 25,
serían ~10-15 min, y ahí la cosecha puede abanicar N llamadas a la vez — **pagando N sobres**. El punto
de cruce es función de N, que es justo lo que no se sabe al arrancar.

**h) Por eso no es un parámetro por sitio.** Lo que decide es **N** y **la profundidad de capas**, y
ninguna de las dos se conoce *antes* del run: fijarlas por configuración es adivinar — el mismo error de
«no sé lo que viene», un nivel más arriba. Lo que **sí** es parámetro es *quién escucha*, que se sabe en
la puerta y **se autodetecta**, igual que el asistido solo espera si hay canal humano declarado.

## 3. Las cuatro decisiones congeladas

Tomadas por el QA en la entrevista del 2026-08-31. Se escriben con su motivo para que nadie las
re-litigue en la sesión siguiente.

| # | Decisión | Motivo |
|---|---|---|
| **D-a** | La primera rebanada **solo instrumenta y mide**. No toca el camino del rescate. | Riesgo cero sobre tres workspaces sellados, y `K` se calibra con dato en vez de con opinión. Coste asumido: la mejora no llega en esta rebanada. |
| **D-b** | Cuando llegue, el en proceso es **el comportamiento por defecto, con plazo de salida**: si nadie contesta, degrada a `exit 42` sin perder el run. | La autodetección evita esperar cuando no hay orquestador; el plazo cubre el fallo de la autodetección. Un flag opcional no se usaría por inercia y no acumularía dato. |
| **D-c** | Contesta **el orquestador directo** (~3-5k). Si declina, o su locator no pasa la verificación contra el DOM vivo, **entonces** un subagente fresco (~44k). | Lo barato primero, lo caro solo cuando lo barato falla — un peldaño más de la escalera de resolución. Riesgo reconocido en §8. |
| **D-d** | **El estreno manual del QA va primero.** | Los tres workspaces están medidos con el modelo reactivo: cambiar el rescate debajo quita la línea base. Y el estreno puede destapar flecos que cambien el plan. |

## 4. Fase 0 — el censo retroactivo (cero código nuevo de producto, cero tokens de LLM)

Los artefactos de los tres ciclos **ya están en disco**: `.work/e2e-{rbp,tricentis,espocrm}/motor-solo*/`
con `dom-map.json` y `audit-log.json`, y los guiones en `docs/demo/*.walk.json`. Con eso se calcula la
línea base **sin ejecutar nada**, porque `open_questions` trae `{flow, step, action, hint, reason}` y el
guion trae el orden de los pasos — que es todo lo que `puertaBloqueadaAntes` necesita.

Lo que sale del censo, por sitio:

| métrica | por qué importa |
|---|---|
| `steps_blocked` (ya está: **39** RBP · **64** Tricentis · **18** EspoCRM) | la masa bruta |
| reparto por clase del triaje (`cascada` / `panel` / `rescate`) | **la cifra clave**: cuánta masa absorbe el triaje y cuántas llamadas quedan de verdad |
| profundidad máxima de cascada por flujo | capas = pasadas extra que el diferido necesitaría |
| **pares de puertas consecutivas bloqueadas** | el caso exacto del QA, contado |

Lo que **no** es retro-computable y necesita run fresco: el reloj de las esperas (nunca ocurrieron) y la
marca de ambigüedad de los runs con presupuesto 0 (su `reason` dice «presupuesto agotado», no la clase).

**HECHO (2026-08-31)**: [`copilot/src/rescue-census.ts`](../../copilot/src/rescue-census.ts) (10 tests),
reutilizando `triajeDelBloqueo` y `puertaBloqueadaAntes` sin duplicar lógica. Tablas y veredictos en
[censo-de-bloqueos.md](../findings/censo-de-bloqueos.md). La comprobación cruzada contra lo que el walker
escribió dio **cero discrepancias** en los tres sitios.

## 5. Fase 1 — la instrumentación (la rebanada autorizada)

**Qué se añade.** Un censo de bloqueos por run, emitido **siempre** (no detrás de `--capture-corpus`).
Hoy existe `bloqueados.jsonl` con la forma correcta, pero está tras el gate del corpus
([dom-walker.ts:1810](../../copilot/src/dom-walker.ts)) y registra `motivo` en prosa, sin clase, sin
capas y sin reloj. Y `dom-map.stats` solo trae `steps_blocked` / `rescues_used`: cuentas sin estructura.

**Dónde va.** `config/rescue-profiles/<site>.jsonl`, **una línea por run**, siguiendo el precedente de
`config/timing-profiles/<site>.json` (acumula muestras por sitio, versionado, con fecha) y la forma JSONL
del acta (`config/decisions/<site>.jsonl`). Por línea:

- `steps_blocked`, y el reparto `{cascada, panel, rescate}` — la clase que el walker **ya calcula** en el
  momento del bloqueo ([dom-walker.ts:5699](../../copilot/src/dom-walker.ts)); solo hay que persistirla.
- `cascade_depth_max` y `gate_pairs`: pares de puertas consecutivas bloqueadas en el mismo flujo.
- Reloj: duración del run, y —en runs con rescate— `replay_ms` realmente pagado por las reanudaciones.
- Procedencia: viewport efectivo con su origen, presupuesto, modo, y si hubo checkpoint.

**Lo que la instrumentación tiene prohibido**: cambiar una sola decisión del walk, añadir un token,
esperar a nadie, ralentizar el run, o depender de un flag para emitirse. Es observación pura — y por eso
es seguro que aterrice **antes** del estreno (ver §9).

## 6. Fase 2 — el en proceso (diseñada, NO autorizada)

Congelada aquí para que exista el día que el dato la desbloquee.

1. **Autodetección de escucha.** El orquestador declara canal (fichero centinela o variable de entorno al
   lanzar en segundo plano). Sin canal declarado → camino de hoy, `exit 42`, sin esperar a nadie. Mismo
   patrón que el canal humano del asistido.
2. **Bucle de espera sobre `rescue-response.json`**, copiando `assistResolve`: `deadline` + sondeo +
   `finish(null)` al agotarse. Al agotarse **no** se cuelga: degrada a `exit 42` y el run sigue siendo
   reanudable (D-b).
3. **Respuesta directa con escalada** (D-c): el orquestador lee la petición podada y contesta; si declina
   o el locator no pasa la verificación contra el DOM vivo (invariante 4), subagente fresco una vez.
4. ~~**Umbral `K` adaptativo**~~ — **RESUELTO POR LA FASE 0: el abanico no se construye.** El censo dio
   12 rescates reales en 121 bloqueos (máximo 7 en un sitio): `K` nunca se cruzaría. Se cae el umbral, se
   cae el camino paralelo, y el diseño queda más pequeño — que era el desenlace que se buscaba.
   **Y el premio del en proceso resultó ser otro**: no el ahorro de sobres que yo defendía, sino los
   **40 pasos en `cascada`** que hoy quedan condenados detrás de una puerta y nunca se llegan a intentar.
   Resolver la puerta en el sitio los pone en juego en el mismo run. (Cota superior 40: que se intenten no
   garantiza que pasen.)
5. **Lo que muere con esto**: D66 y D73 (son hijos del replay), la 2ª pasada sembrada, el selector de
   flujos y la orquestación por capas. `exit 42` **no** muere: pasa a ser el camino de «nadie escucha».

Lo que **no** cambia y hay que llevarse intacto: triaje, poda del snapshot, anti-eco, verificación contra
el DOM vivo, y `aliasPromotionVerdict` (ya es agnóstico al momento — [walk-core.ts:1028](../../copilot/src/walk-core.ts)).

## 7. Los pares falsables

Cada hipótesis con la cifra que la mata. Sin esto, la Fase 2 sería una opinión con líneas de código.

| # | Hipótesis | Qué la mata | **Veredicto (Fase 0, 2026-08-31)** |
|---|---|---|---|
| **H1** | Tras triaje, la escala real es 1-3 rescates por sitio | un sitio con más de `K` de clase `rescate` | **corregida**: 3 / 2 / **7**. Muere la cifra, sobrevive el fondo — 12 de 121 bloqueos (**10%**). El abanico no se construye |
| **H2** | Las puertas consecutivas son comunes (el caso del QA) | cero pares en los tres sitios | **confirmada**: 6 pares en 2 de 3 sitios. `cp009-baja-cuenta` de EspoCRM encadena **tres** puertas: Acciones → Eliminar → Eliminar |
| **H3** | El replay domina el reloj del modelo reactivo | replay por debajo del 10% | **parcial**: 62 / 25 / 5 pasos re-ejecutados = **56%** / 11% / 6% de un run entero. Domina cuando los rescates se agrupan; el reloj en ms sigue sin medirse |
| **H4** | Existen cascadas de más de una capa | profundidad máxima 1 en todas partes | **confirmada, fuerte**: 6 / 4 / 2 capas. El diferido necesitaría **siete pasadas** en RBP — deja de ser alternativa |
| **H5** | El orquestador con el run entero en contexto no declina más que un subagente limpio | si declina más, D-c se invierte | **pendiente**: no contestable con artefactos, como el plan predijo. Exige A/B |

**H5 no se puede saltar**: la lección de frescura está medida (un subagente reutilizado con 14
declinaciones acumuladas declinó lo que uno limpio resolvía).

**Y dos hallazgos que no estaban en la lista** ([censo-de-bloqueos.md](../findings/censo-de-bloqueos.md) §5):

- **El replay fabrica bloqueos nuevos.** En EspoCRM, `cp003/s1` y `s2` salen `ok` sin rescate y quedaron
  bloqueados con rescate: **2 de las 3 llamadas** del sitio se gastaron en daño del propio mecanismo.
  Es D73, ahora con cifra.
- **D74 — el `reason` se sobrescribe** con el desenlace del rescate y destruye la clase original (RBP:
  `panel` de 6 a 1). Pasa a ser **requisito** de la Fase 1: sin persistir la clase como campo, la campaña
  de medición del estreno mediría el mismo espejismo.

## 8. Lo que este plan NO arregla

- **D72** — si la pantalla no ha pintado, el snapshot llega vacío **en cualquier modelo**. La guarda
  «pantalla sin accionables → no preguntes» sigue haciendo falta.
- **D71** no desaparece: el viewport sigue siendo una declaración que alguien tiene que hacer.
- **D70** (peldaño de fachada) es ortogonal.
- El riesgo de **D-c**: el contexto del orquestador es el menos fresco de todos. Mitigado por la escalada,
  medido por H5.
- **Cero mediciones del en proceso y cero de la 2ª pasada sembrada**: nadie ha ejecutado ninguno de los
  dos, jamás. La Fase 2 no se toca hasta que H1-H4 tengan número.

### 8.1 El plan podrido — el caso que ningún modelo de rescate salva

Señalado por el QA al leer los resultados de la Fase 0, y es un hueco real de este plan.

Si el walk-script está **desactualizado** respecto a la aplicación —tres sprints de cambios de UI contra
una suite de regresión que nadie tocó—, los bloqueos dejan de ser incidentes y pasan a ser la norma. El en
proceso es entonces **el modelo que peor se comporta**: N bloqueos son N pausas seriales, y el run se
convierte en una sala de espera. Pero el diferido tampoco salva nada: sigue necesitando una pasada por
capa. **La conclusión honesta es que el problema no es de qué modelo de rescate, sino que ningún modelo de
rescate arregla un plan que ya no describe la aplicación.**

Lo que falta no es un peldaño más de la escalera: es **un veredicto que el walker hoy no sabe emitir**.
Hoy dice «bloqueado» paso a paso, 40 veces, como si fueran 40 incidentes independientes. Debería poder
decir *«este guion ya no describe esta aplicación: para, y que lo mire un QA»* — y eso es diagnosticable
de forma **determinista y gratis**, sin preguntarle a nadie: la señal es la proporción, no el elemento.

**Esto resucita el umbral `K` que la Fase 0 mató, pero con otro destino.** No «pasado `K`, cambia al
abanico» (eso sigue descartado), sino **«pasado `K`, deja de rescatar y emite el veredicto de plan
podrido»**. El mismo número, una salida distinta — y una que sí tiene consumidor: el camino de vuelta ya
existe entero en el producto (panel → acta firmada → `merge-assist-patch` → `qa:propuesta`). Lo que no
existe es **quién decide entrar en él**.

Alcance: es un plan aparte, no la Fase 2. Aquí queda registrado para que no se pierda, y con su par:

| # | Hipótesis | Qué la mata |
|---|---|---|
| **H6** | La podredumbre del plan se distingue del sitio difícil por la **forma** del bloqueo (puertas que fallan desde el primer paso, en muchos flujos a la vez), no por el volumen | si en un sitio sano la forma es indistinguible de la de un guion caducado, el veredicto automático es imposible y la decisión vuelve al QA — que es un desenlace legítimo, no un fracaso |

**Sin dato**: los tres sitios de la Fase 0 tenían planes escritos el mismo día desde la UI. El censo **no
mide este caso** y no puede pronunciarse sobre él. Medirlo es barato y hay una forma obvia: correr un
guion viejo contra un sitio que cambió, o envejecer uno a mano.

## 9. Secuencia, y el supuesto que la sostiene

```
Fase 0  censo retroactivo (cero código de producto)   ──► línea base de los 3 sitios
Fase 1  instrumentación (observación pura)            ──► el run sabe contar lo que le pasa
        ↓
ESTRENO MANUAL DEL QA en qa/rbp, qa/tri, qa/crm       ──► ES la campaña de medición
        ↓
Fase 2  en proceso — solo si H1-H4 lo respaldan
```

**Supuesto que hay que confirmar o vetar**: D-a («solo instrumentar») y D-d («tu estreno primero») se
combinan mejor si la instrumentación aterriza **antes** del estreno, porque entonces el estreno **es** la
campaña de medición — dato gratis, tres sitios, cero runs extra. Como la instrumentación es observación
pura (§5) y no cambia ni una decisión del walk, aterrizar antes no altera lo que el QA va a ver.

Si se prefiere no tocar nada antes del estreno, el estreno **no produce dato** y hace falta una cuarta
ronda de runs después, solo para medir. Es la lectura alternativa y es legítima; solo cuesta una ronda.

**Redespliegue**: los workspaces (`qa/rbp`, `qa/tri`, `qa/crm`) no reciben nada hasta un
`npm run field:deploy`. La línea base de cada uno queda intacta hasta que el QA decida.
