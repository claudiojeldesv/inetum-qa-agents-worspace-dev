# Plan — el veredicto de guion caducado

**Que el walker sepa decir *«este guion ya no describe esta aplicación: para, y que lo mire un QA»* — en
vez de reportar cuarenta bloqueos como si fueran cuarenta incidentes independientes.**

**Origen**: §8.1 de [`plan-rescate-en-proceso.md`](plan-rescate-en-proceso.md), señalado por el QA al leer
la Fase 0. El plan del rescate lo dejó fichado con una hipótesis (H6) y sin dato. **Branch**: por abrir
(`design/guion-caducado`). **Estado**: **PROPUESTO** — nada construido. Este documento incorpora la
revisión de literatura del 2026-09-03 (§2), que **cambia el diseño respecto a la ficha original**: el
umbral por volumen se cae, y en su lugar entra una clasificación por forma sobre datos que en su mayoría
**ya calculamos**.

> **Lo que la investigación cambió, en una línea**: la señal no está en **cuánto** falla, sino en **si lo
> que falla tiene candidato y tiene causa común**. Y las dos cosas ya se miden.

---

## 1. El problema, con nuestros números

Un walk-script de regresión contra una aplicación que lleva tres sprints cambiando. Los bloqueos dejan de
ser incidentes y pasan a ser la norma. Hoy el walker:

- reporta **N bloqueos independientes**, uno por paso;
- pide rescate (o abre panel) por cada uno que sea material de rescate;
- termina con un informe que no dice lo único que importa: **que el problema es el guion, no la aplicación**.

Ningún modelo de rescate salva eso. El en proceso es el que peor se porta (N pausas seriales); el diferido
necesita una pasada por capa. **Lo que falta no es un peldaño más de la escalera: es un veredicto.**

**Y el volumen bruto no lo distingue.** Dato propio, del censo ([censo-de-bloqueos.md](../findings/censo-de-bloqueos.md)):

| | Restful Booker | Tricentis | EspoCRM | total |
|---|---:|---:|---:|---:|
| pasos | 111 | 237 | 89 | 437 |
| bloqueados | 39 | 64 | 18 | **121** |
| `drift` | 13 | 24 | 7 | 44 |
| `accion` | 0 | 18 | 1 | 19 |
| `cascada` | 17 | 20 | 3 | 40 |
| `panel` | 6 | 0 | 0 | 6 |
| `rescate` | 3 | 2 | 7 | **12** |

Los tres guiones estaban **escritos el mismo día desde la UI**: ninguno estaba caducado. Y sin embargo
Tricentis dio 64 bloqueos. Un umbral sobre bloqueados habría declarado podrido el guion más nuevo del
repositorio. En Restful Booker el desglose es aún más claro: **39 bloqueos que son un puñado de causas y
34 consecuencias** (17 `cascada` + 13 `drift`, que no son problemas de resolución).

## 2. Lo que la literatura ya cerró

Revisión hecha el 2026-09-03. Enlaces en §11. Lo que importa para el diseño:

**a) La distinción que buscamos ya tiene nombre, y no es nuestro.** El SLR de *test breakage* (41
estudios) clasifica los tests tras un cambio en **usable**, **inservible-reparable** y **obsoleto** — y
separa cambios **estructurales** (layout, locators) de **lógicos** (la funcionalidad ya no es esa).
«Guion podrido» = alta proporción de **obsoletos** con cambio **lógico**. Adoptamos ese vocabulario:
inventarnos otro nos aísla de veinte años de trabajo ajeno.

**b) Un solo cambio puede tumbar el 74% de la suite sin que nada esté podrido.** Memon & Soffa (2003):
un cambio de estructura dejó **inservibles 296 de 400** casos, y el **71,3%** de ellos era **reparable con
una sola corrección**. Es la refutación empírica del umbral por volumen, hecha veintitrés años antes de
que lo propusiéramos.

**c) La masa de la rotura es reparable, no podredumbre.** Hammoudi, Rothermel & Tonella: **1.065 roturas
en 453 versiones, 73,62% causadas por locators obsoletos**. Eso es exactamente lo que nuestra escalera,
los aliases durables y las zonas (D88/D90) ya absorben. **La podredumbre es el residuo**: oráculos que no
aparecen y puertas que ya no existen.

**d) Un plan viejo no se repara paso a paso: se regenera.** Pinto, Sinha & Orso (FSE 2012): de todos los
cambios sobre tests, solo el **22%** son reparaciones; el resto son **borrados, añadidos y
refactorizaciones**. Esto **cambia el consumidor del veredicto**: no `merge-assist-patch` (fundir parches
paso a paso), sino `qa:propuesta` (rehacer el guion).

**e) Nuestra pregunta exacta tiene un paper, y confirma el enfoque.** Hao et al., ECOOP 2013, *«Is this a
bug or an obsolete test?»* — clasificación de la **causa del fallo** por características del fallo. Su
motivación es literalmente nuestra regla: *las técnicas de reparación asumen que todo fallo es un test
obsoleto*, y asumir eso es adoptar defectos. Su límite: **por test, no por suite**.

**f) Clasificar por síntoma funciona solo si el síntoma es específico.** 230.439 fallos reales: los
clasificadores aciertan con excepciones distintivas y fracasan con las genéricas (`AssertionError`,
`NullPointerException`). Corolario para nosotros: **la señal tiene que ser el reparto por clase**, no un
contador agregado. Nuestras cinco familias y las causas del panel (`ausente`, `ambiguo`, `zona-ausente`,
`unico-pero-falla`, `resultado-ausente`) son síntomas específicos. **El vocabulario ya está construido.**

**g) Ningún estado de un test se decide con una ejecución.** Google: 16% de tests flaky, 84% de las
transiciones verde→rojo involucran uno. De ahí que el veredicto se emita **contra la línea base del propio
sitio**, no en absoluto, y que el primer run de un sitio **no pueda juzgarse**.

**h) Una tasa alta de curación es un olor, no un éxito.** Consenso de la industria del self-healing, con
el caso documentado del formulario de pago: quitaron una validación, el self-healing «arregló» los tests
buscando otros elementos y pasaron en verde hasta producción. Umbral típico: **~0,9 de confianza para
aplicar solo; por debajo, humano**. Nuestro D89 (posicional no entra en memoria durable) y el veredicto
firmado están del lado correcto de esa línea; el veredicto de guion caducado **es** ese olor, hecho
explícito.

**i) La fragilidad se puede predecir sin ejecutar.** EASE 2024: una puntuación estática del test + la
página correlaciona con las roturas de versiones posteriores. Ángulo que el plan original no tenía.

**Y el hueco que nadie ha cubierto**: el mismo SLR dice que solo el **12%** de los estudios se ocupa de
**detectar** (el 70% repara), y **ninguno emite veredicto a nivel de suite** — todo es por test. Ahí está
el sitio de esta pieza, y no es un sitio ocupado.

## 3. Las siete correcciones al plan original

| # | Corrección | Fundamento |
|---|---|---|
| **1** | Contar **causas raíz**, no bloqueos: colapsar cascadas antes de contar. | Memon (b) + censo propio (39 bloqueos con 34 consecuencias dentro). `rescue-census.ts` ya tiene las piezas. |
| **2** | Separar **renombrado** de **desaparecido** con el dato que ya medimos: un `ausente` **con** candidatos parecidos = la app lo llama de otra forma (reparable); **sin** candidatos = ya no está (obsoleto). | Hammoudi (c) + Pinto/Orso (d) + Hao (e). |
| **3** | Juzgar **contra la línea base del propio sitio**, no en absoluto. Primer run = sin veredicto, y se dice con esas palabras. | Google (g). |
| **4** | **Dos niveles**: `aviso` (olor: tasa anómala, el run sigue) y `parada` (veredicto). Declarado en el Style Contract, como el resto de gates. | Self-healing (h) + regla dura #10. |
| **5** | Consumidor correcto: el veredicto lleva a **regenerar** (`qa:propuesta`), no a fundir parches. | Pinto/Orso (d). |
| **6** | Prevención barata: **puntuación de fragilidad del guion** en `check-walk-script`, sin ejecutar nada. | EASE 2024 (i). |
| **7** | Vocabulario **usable / reparable / obsoleto**, con cambio **estructural** vs **lógico**. | SLR (a). |

## 4. El vocabulario, traducido a lo que ya tenemos

La traducción es completa: **no hay que medir nada nuevo para nombrarlo**, solo para el punto 2.

| Literatura | Nuestro dato | De dónde sale hoy |
|---|---|---|
| usable | paso verde | `stats.steps_ok` |
| inservible **reparable** — estructural | `rescate` con candidatos · `panel` (`ambiguo`) · alias promovido · `accion` (D70) | familia del censo + candidatos del panel |
| inservible **reparable** — cascada | `cascada` | `puertaBloqueadaAntes` |
| **obsoleto** — el elemento ya no está | `ausente` **sin** candidatos y sin puerta bloqueada antes | **falta instrumentar** (§5, F1) |
| **obsoleto** — el negocio ya no dice eso | `drift` (`resultado-ausente`) sin candidato adoptable | familia + candidatos del veredicto |
| cambio **lógico** (no solo layout) | `drift` + `ausente` sin candidato, **repartidos entre muchos flujos** | derivado |

**La firma del guion caducado, entonces**: proporción alta de **obsoletos**, **repartidos entre flujos**,
**sin causa raíz común**, y **por encima de su propia línea base**. La firma del sitio difícil (Tricentis)
es la contraria: mucha `accion` y `cascada`, concentradas, con causa raíz común.

## 5. Fases

Cada fase termina en un artefacto medible y **ninguna toca el camino del rescate**.

### F0 — extender el censo, sin ejecutar nada (cero tokens, cero navegador)

`rescue-census.ts` ya lee `dom-map.json` + walk-script y clasifica las cinco familias. Se le añade:

- **`causas_raiz`**: bloqueos que no son `cascada` ni tienen puerta bloqueada antes. El número del punto 1.
- **`flujos_afectados` / `flujos_totales`**: la dispersión. Un cambio de layout concentra; un guion
  caducado se reparte.
- **`obsoletos_estimados`**: `drift` + `ausente`, **marcado como estimación** mientras F1 no exista —
  porque sin candidatos no se puede distinguir renombrado de desaparecido, y decir que sí se puede sería
  fabricar.
- **`reparto`**: las cinco familias normalizadas **sobre causas raíz**, que es el vector de forma.

Salida: un bloque `forma` en el JSON del censo, y las mismas cifras recalculadas para los tres sitios
sellados. **Sirve de línea base retroactiva** sin volver a correr nada.

### F1 — instrumentar el near-miss en el bloqueo (el único dato que falta)

Hoy los candidatos parecidos **se miden solo cuando el panel se abre** (`diagnosticarParaPanel`,
[dom-walker.ts:4770](../../copilot/src/dom-walker.ts)), y `BlockedStep`
([walk-types.ts:451](../../copilot/src/walk-types.ts)) no los guarda. En una regresión nocturna sin humano
—el caso en que el veredicto más falta hace— **el dato no existe**.

Se añade a `BlockedStep`:

```ts
/** Cuántos nombres de la pantalla se parecen al pedido, medido AL BLOQUEAR. 0 = nada parecido. */
near_miss?: number;
/** Los primeros, para poder auditar la clasificación a mano. */
near_miss_top?: string[];
```

Coste: la consulta al DOM que **ya se hace** para contar coincidencias, más el ranking que ya existe
(`candidatosParaInforme`). Cero tokens. `blockStep` es sincrónico, así que se sigue el patrón que ya
existe en el motor (`ultimaAmbiguedad`, `ultimoAmbitoFallido`): la escalera lo deja en un campo y
`blockStep` lo lee. **Observación pura: no cambia ninguna decisión del run.**

### F2 — la línea base por sitio

Fichero `config/rot-baselines/<site_id>.json`, mismo patrón que `config/timing-profiles/` (versionado,
por sitio, acumulativo, y efímero si la recipe del sitio lo declara así):

```json
{ "version": 1, "site_id": "restful-booker", "runs": [
  { "fecha": "2026-09-03", "pasos": 111, "causas_raiz": 9,
    "reparto": { "drift": 0.31, "accion": 0, "cascada": 0.43, "panel": 0.15, "rescate": 0.08 },
    "obsoletos": 2, "flujos_afectados": 4, "flujos_totales": 10 } ] }
```

Regla: **con menos de `min_runs` no hay veredicto**, y el informe lo dice («sin línea base: no puedo
pronunciarme»). Es la lección (g) aplicada.

### F3 — el veredicto, en dos niveles

Un módulo puro (cero `fs`, cero navegador — la forma de `walk-verdict.ts`): entran el censo de este run y
la línea base, sale `{ nivel, motivo, evidencia }`.

| nivel | cuándo | qué hace el run |
|---|---|---|
| `ninguno` | la forma cae dentro de lo que este sitio ya hacía | nada |
| `aviso` | los obsoletos suben sobre la línea base, pero hay causa raíz común o poca dispersión | **sigue**; el informe abre con el aviso |
| `parada` | obsoletos altos **y** repartidos **y** sin causa raíz común | deja de pedir rescates, **termina el run** y emite el veredicto |

Knob en el Style Contract, patrón regla #10 — **off por defecto**:

```yaml
# Veredicto de guion caducado. Off por defecto: un cliente que está afinando su
# primera suite no quiere que nadie la pare mientras la ajusta.
script_rot:
  enabled: boolean       # default false
  min_runs: integer      # default 3 — runs de línea base antes de pronunciarse
  warn_only: boolean     # default true — 'aviso' sí, 'parada' no, hasta que el cliente lo autorice
```

**Lo que el veredicto NO hace, y es la mitad del valor**: no repara, no reescribe el guion, no promueve
nada a memoria durable y **no decide quién tiene razón**. Dice «esto ya no describe la aplicación» y para.
Quien decide es el QA, y su decisión se firma en el acta como cualquier otra.

### F4 — el camino de vuelta

Ya existe entero: panel → acta firmada → `merge-assist-patch` → `qa:propuesta`. Lo único que falta es
**quién entra en él**. El veredicto escribe `rot-verdict.json` y el epílogo imprime el comando
—**relleno**, como ya hace con el parche de asistencia desde la Fase 2 del rescate.

### F5 — prevención: la fragilidad antes de correr

En `check-walk-script`, una puntuación **sin ejecutar nada** (EASE 2024): pasos sin `role` ni `scope`,
oráculos que solo comprueban texto libre, hints de una sola palabra, `.nth(` en locators manuales, pasos
sin postcondición. Sale como **aviso al emitir el guion**, nunca como bloqueo — un guion frágil sigue
siendo ejecutable, y bloquearlo repetiría el error de D1. Fase independiente: se puede hacer antes que
todo lo demás, o tirarla, sin tocar el resto.

## 6. Las hipótesis, y qué mata a cada una

| # | Hipótesis | Qué la mata |
|---|---|---|
| **H6** (reformulada) | La podredumbre se distingue del sitio difícil por el **reparto por clase** sobre **causas raíz**, no por el volumen | si el reparto de un guion envejecido a mano es indistinguible del de Tricentis sano, el veredicto automático es imposible y la decisión vuelve al QA — **desenlace legítimo, no fracaso** |
| **H7** | Un `ausente` **sin** near-miss es señal de obsoleto; **con** near-miss, de renombrado | si en campo los `ausente` sin candidatos resultan ser mayoritariamente elementos que sí estaban (otra pantalla, otro rol), la señal es ruido y hay que caerse al punto 1 a secas |
| **H8** | La dispersión entre flujos separa «cambió una pantalla» de «cambió la aplicación» | si un cambio de layout en una pantalla compartida (cabecera, menú) afecta a todos los flujos, la dispersión no discrimina y hay que ponderarla por pantalla en vez de por flujo |
| **H9** | Tres runs bastan de línea base | si la varianza run a run del reparto en un sitio estable supera la diferencia entre sano y podrido, hacen falta más runs — o la línea base no sirve |
| **H10** | La puntuación de fragilidad de F5 correlaciona con los bloqueos del run siguiente | si guiones con puntuación mala y buena se bloquean igual, F5 se cae sola |

## 7. El experimento: envejecido controlado, cuatro brazos

Lo que la ficha original dejaba como *«correr un guion viejo contra un sitio que cambió, o envejecer uno a
mano»* — ahora con diseño, porque **un brazo solo no separa nada**:

| brazo | qué se hace | qué debería salir |
|---|---|---|
| **A · sano** | el guion de RBP tal cual (111 pasos, línea base ya medida) | `ninguno` |
| **B · roto reparable** | renombrar el **30%** de los hints a sinónimos que la app sí tiene («Book now» → «Reservar ahora») | muchos bloqueos, **con near-miss**, repartidos pero **reparables** → `aviso`, no `parada` |
| **C · podrido** | borrar el **30%** de las pantallas del guion (pasos hacia rutas que ya no existen) + oráculos con textos inexistentes | obsoletos altos, **sin near-miss**, repartidos → `parada` |
| **D · difícil sano** | Tricentis tal cual (237 pasos, 64 bloqueos, 18 de `accion`) | `ninguno` — es el falso positivo que más miedo da |

**Si B y C salen iguales, H7 muere.** Si D sale `parada`, el veredicto es inservible tal como está
diseñado y hay que rediseñarlo o dejarlo en `aviso` para siempre. Coste: cuatro runs de motor solo, cero
tokens de LLM, sobre workspaces sellados.

## 8. Genérico para banca, seguros y lo demás — y qué lo hace genérico

Condición puesta por el QA, y condiciona el diseño; no es un párrafo de cortesía:

1. **Nada del veredicto es específico de un sitio.** Las cinco familias, las causas del panel y las causas
   raíz se calculan desde artefactos que **producen los cuatro módulos** (S1–S4): `dom-map.json` y el
   walk-script. No hay heurística de dominio, ni lista de nombres, ni regex de aplicación.
2. **Los umbrales se aprenden, no se declaran.** Un núcleo bancario legacy con 40% de `accion` (fachadas
   que interceptan clics) y un portal de seguros SPA con 5% tienen líneas base distintas y **cada uno se
   juzga contra la suya**. Declarar un número en el contract sería adivinar el dominio del cliente — el
   mismo error que el `K` global.
3. **Off por defecto y con `warn_only`.** Patrón regla #10: la pieza está completa y se enciende cuando el
   cliente la necesita.
4. **Auditable sin excepción.** El veredicto es determinista (sin LLM en la decisión — regla dura #5),
   lleva su evidencia, y la decisión del QA se firma en el acta con su grado de evidencia. En un entorno
   regulado, *«la regresión se paró»* sin registro de por qué es peor que no pararla.
5. **Nunca repara, nunca oculta.** Hao (e) y el caso del formulario de pago (h): la parada es visible, el
   guion no se toca, y ningún alias se promueve por efecto del veredicto.
6. **Habla el lenguaje del FD, no solo el de los locators.** El near-miss se mide contra los **nombres de
   la pantalla**, y el veredicto dice «el plan pide X y la aplicación no tiene nada parecido» — la frase
   que un QA de banca puede llevar a un análisis funcional. La cadena `criteria.json` → `source_ref` →
   panel ya enseña la línea del FD, y el veredicto se apoya en ella.
7. **Cero coste marginal.** Todo el dato nuevo (F1) es una consulta al DOM que ya se hacía. Un gate que
   encarece cada run no se enciende en un cliente con 2.000 casos nocturnos.

## 9. Riesgos, y lo que puede tumbar el plan

- **El falso positivo es el riesgo caro.** Parar una regresión nocturna de banca por un cambio grande y
  legítimo (un rediseño autorizado) cuesta credibilidad. Mitigación: `warn_only` por defecto, `min_runs`,
  y el brazo D del experimento existe para medirlo **antes** de encenderlo.
- **La instrumentación de F1 puede no discriminar.** Es H7 y se mide barato. Si muere, queda el punto 1
  (causas raíz), que **ya es una mejora sobre el informe de hoy** aunque no llegue a veredicto.
- **D91 sigue abierto** (la whitelist de emisión comprueba solo el prefijo del segmento). Ortogonal, pero
  toca el mismo camino de locators manuales.
- **La línea base es dato del cliente.** Vive en `config/`, y si la recipe del sitio declara directorio
  efímero, muere con el run: sin línea base no hay veredicto, y el informe lo dirá. **No se degrada a
  juzgar sin base.**
- **Nadie ha medido esto.** Los tres sitios del censo tenían guiones del día. Todo el §5 se construye
  sobre H6–H10 **sin dato propio todavía**, y el §7 es lo que lo convierte en dato.

## 10. Lo que NO entra

- **No entra reparación automática del guion.** Ni un solo paso reescrito por la máquina.
- **No entra LLM en la decisión.** El veredicto es aritmética sobre el censo.
- **No entra un `K` global.** Muerto dos veces: por la Fase 0 del plan del rescate y por Memon (b).
- **No entra clasificación por el texto del `reason`.** Se clasifica por campos del motor, como ya hace
  `blockStep`. La lección de D74.
- **No entra el modelo de aprendizaje de Hao et al.** Su árbol de decisión necesita corpus etiquetado por
  versión que no tenemos. Se toma su **formulación** (clasificar la causa), no su método.

## 11. Fuentes

- [Regression testing of GUIs — Memon & Soffa, ESEC/FSE 2003](https://www.cs.umd.edu/~atif/papers/MemonFSE2003.pdf)
- [A Systematic Literature Review of Test Breakage Prevention and Repair Techniques — Imtiaz et al., 2019](https://arxiv.org/abs/1909.10750)
- [An Incremental Approach for Repairing Record-Replay Tests — Hammoudi, Rothermel & Tonella, FSE 2016](https://tsigalko18.github.io/assets/pdf/2016-Hammoudi-FSE.pdf)
- [Understanding myths and realities of test-suite evolution — Pinto, Sinha & Orso, FSE 2012](https://dl.acm.org/doi/10.1145/2393596.2393634)
- [Is This a Bug or an Obsolete Test? — Hao et al., ECOOP 2013](https://link.springer.com/chapter/10.1007/978-3-642-39038-8_25)
- [230,439 Test Failures Later: An Empirical Evaluation of Flaky Failure Classifiers](https://arxiv.org/html/2401.15788)
- [Flaky Tests at Google and How We Mitigate Them](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html)
- [Towards Predicting Fragility in End-to-End Web Tests — EASE 2024](https://dl.acm.org/doi/10.1145/3661167.3661179)
- [Self-Healing Tests: What Works, What Doesn't](https://qate.ai/blog/self-healing-tests)
- [Playwright Test Agents — documentación oficial](https://playwright.dev/docs/test-agents)

## 12. Secuencia

```
F0  censo extendido (causas raiz, dispersion, reparto)   --> linea base retroactiva de 3 sitios
F1  near_miss en BlockedStep (observacion pura)          --> el dato que falta
    |
EXPERIMENTO §7 - cuatro brazos, motor solo, cero tokens  --> H6/H7/H8 con numero
    |                                    (si H6 o H7 mueren, el plan se detiene aqui con honor)
F2  linea base por sitio (config/rot-baselines/)
F3  el veredicto en dos niveles + knob del contract
F4  el camino de vuelta (rot-verdict.json + comando relleno)
F5  fragilidad estatica en check-walk-script  -- independiente: antes, despues, o a la basura
```

**El supuesto que lo sostiene**: que el reparto por clase discrimina. Si no lo hace, F0 y F1 siguen siendo
mejoras del informe (causas raíz en vez de bloqueos brutos) y el resto **no se construye**.
