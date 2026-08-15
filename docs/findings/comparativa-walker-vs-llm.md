# Comparativa medida: walker determinista vs. descubrimiento/ejecución por LLM

- **Fecha**: 2026-08-16
- **Operador**: agente Claude Code (Opus 5), sesión `design/kernel-v2`
- **Modelo de los subagentes medidos**: Sonnet en todos los casos, para que la comparación no mezcle gamas
- **Sitios**: Sakai (Angular 19 + PrimeNG 19) y OrangeHRM 5.8 (SPA, con sesión)

Dos experimentos independientes. El primero compara **descubrimiento**; el segundo compara
**ejecución de una suite de regresión**. Los artefactos son reproducibles: los guiones están
en `copilot/fixtures/`, el FD de entrada en `docs/findings/artefactos/`.

Todo lo que hay aquí está medido en esta sesión. Donde no lo está, se dice.

---

## Experimento 1 — Descubrimiento sobre Sakai

Mismo sitio, mismo alcance acotado a tres funcionalidades, mismo prompt.

| | Tokens | Reloj | Salida |
|---|---|---|---|
| Planner nativo, pasada A | 161.267 | 6 min 15 s | 19 escenarios, 8 hallazgos de la app |
| Planner nativo, pasada B | 113.948 | 3 min 40 s | 21 escenarios, 6 hallazgos |
| Refiner (FD → guion) | 70.034 | 4 min 43 s | guion de 11 pasos, 4 huecos marcados |
| Walker × 3 (guion reconciliado) | **0** | 18,2 / 19,8 / 23,4 s | 18/18 pasos, `dom-map` idénticos |
| Walker sobre el guion del refiner | **0** | 31,1 s | 0/11, con las once causas |
| Walker verificando un hallazgo | **0** | 10,8 s | 4/4 |
| Walker arbitrando la contradicción | **0** | 13,5 s | 8/8 |

### Resultados

**Dispersión entre pasadas del LLM**: +41,5% en tokens, +70% en reloj, 46 vs 27 usos de
herramienta, 19 vs 21 escenarios. Mismo prompt, mismo sitio, mismo día.

**Contradicción factual entre pasadas.** La pasada A afirmó que el buscador de "Manage
Products" filtra únicamente por el campo Name. La pasada B afirmó que "parece matchear al
menos por nombre y categoría". Son incompatibles. El arbitraje determinista
(`copilot/fixtures/sakai-arbitraje.walk.json`, 13,5 s, 0 tokens) probó las cuatro categorías
visibles: las cuatro devuelven cero. **A acertó, B se equivocó.** Ninguna capa del camino LLM
lo detectó; un plan construido sobre B habría codificado una regla de negocio inventada.

**Determinismo del walker**: los tres `dom-map` salieron idénticos byte a byte — mismas
pantallas, mismos desenlaces, mismo peldaño de resolución por paso, mismo bloqueo con la
misma razón. Dispersión de reloj ±13%, dispersión de resultado 0%.

**El eslabón débil no es el walker, es el refiner.** Su guion dio 0/11. Escribió en español
sobre una aplicación en inglés (donde el FD *citaba* el literal lo respetó; donde lo
*describía* se lo inventó traducido: `Buscador`, `Guardar`, `2 de 2`) y puso `entry` en la
raíz del sitio, porque el FD daba la URL base y nombraba la pantalla pero no su ruta — como
un FD real. Los ocho pasos del alta cayeron en cascada desde ahí.

### Caveats de este experimento

- El refiner se invocó como agente de catálogo pidiéndole seguir el contrato *lean*, y el
  flavor lean declara Haiku. **70.034 es cota superior**, no el coste de la configuración
  prevista.
- El Planner se acotó a tres flujos. Sin acotar exploraría más y costaría más.
- Los productos no son el mismo: el Planner entrega un plan de pruebas; el walker entrega un
  smoke ejecutado y un `dom-map`. No son sustitutos y compararlos como tales sería tramposo.

---

## Experimento 2 — Ejecución de una suite de regresión sobre OrangeHRM

Cinco casos escritos con vocabulario de FD, sin mirar el DOM
(`copilot/fixtures/orangehrm-regresion.walk.json`): acceso inválido, acceso válido, listado
de empleados, filtrado por nombre y consulta de datos personales.

| | Tokens | Reloj | Veredicto emitido |
|---|---|---|---|
| Solo LLM (ejecuta y verifica) | 145.135 | 3 min 14 s | 5/5 pasa |
| Walker + rescate, memoria vacía | 93.923 | 55 s | 17/18 pasos, CP04 declarado no verificado |
| Walker, estado estacionario | **0** | 46 s / 58 s | 17/18, y el rojo es correcto |

Desglose del camino con rescate: tramo determinista 20,8 s / 0 tokens hasta plantarse →
micro-llamada 93.923 tokens / 18,9 s → reanudación 15,7 s / 0 tokens.

### El caso del rescate no se fabricó

CP04 es el caso corporativo real: **FD del cliente en español, producto COTS en inglés**.
"Nombre del empleado" no se puentea a "Employee Name" sin adivinar. La escalera se plantó y
pidió ayuda con un paquete de 4.355 bytes (3.078 de árbol de accesibilidad podado).

**El rescate declinó.** Dos veces, con dos evidencias distintas:

1. Con el árbol podado: `locator=null`, alegando que veía dos `textbox` con el mismo nombre
   accesible y ninguno decía "Nombre del empleado". 93.923 tokens, 18,9 s.
2. Con el árbol completo (17.369 caracteres): `locator=null` otra vez, con mejor razón —
   OrangeHRM da a "Employee Name" y "Supervisor Name" el mismo marcador ("Type for hints...")
   y **ningún locator de la gramática permitida los distingue**. 103.767 tokens, 48 s.

Mi primera hipótesis fue que la poda había robado la evidencia. **La comprobé y es cierta
como defecto, pero no era la causa aquí**: el árbol completo contiene `text: Employee Name`
justo antes del campo y el podado no, porque el foco iba en español y no casaba con nada —
o sea, la poda va a ciegas justo cuando más falta hace un rescate. Pero con la evidencia
completa el LLM volvió a declinar. La hipótesis queda corregida: la poda es un defecto real y
**no** explica este fallo.

La cadena degradó como debe: determinista → planta → rescate → planta → panel asistido, donde
un humano señala una vez. Ningún eslabón adivinó.

### El hallazgo que no favorece al walker

**El LLM dio un verde falso.** CP04 salió "pasa" porque el literal del criterio —"Records
Found"— aparecía en pantalla, dentro de "**No** Records Found". El filtro no encontró nada y
el caso se declaró correcto.

Antes de usarlo como argumento se probó lo contrario
(`copilot/fixtures/orangehrm-falso-verde.walk.json`): se le dio al walker el locator
autoritativo para que llegara al mismo estado de pantalla. **El walker se come exactamente el
mismo verde falso**: `expect_text 'Records Found'` pasa, y `expect_text 'No Records Found'`
también, las dos a la vez.

El fallo no está en ninguno de los dos motores: está en el **criterio de aceptación del FD**,
que es ambiguo. Los dos ejecutaron fielmente una mala especificación. Con una diferencia que
va a favor del LLM: en su campo de incidencias avisó de que ningún empleado se llama "Odis" y
recomendó al analista revisar el criterio. El walker no dijo nada. Corregida la aserción para
exigir el conteo real, el walker sí lo caza: `drift: postcondición no observada`.

### Defectos del producto que salieron de esta comparativa

1. **`expect_text` registra el literal BUSCADO, no el texto del nodo que casó.** El
   `business_text` del `dom-map` dice `"Records Found"` cuando la pantalla decía "No Records
   Found". El artefacto de evidencia esconde justo el dato que delataría el verde falso.
   Arreglo del mismo patrón que K0.35/K0.36: citar lo medido, sin cambiar el veredicto.
2. **La poda del rescate va a ciegas cuando el foco no casa.** Foco en español contra árbol
   en inglés → ventana genérica que descarta las líneas que desambiguan. Medido: 17.369 → 3.078
   caracteres, con `Employee Name` perdido por el camino.
3. **La gramática del rescate es más pobre que la que el walker sabe leer.** Las
   instrucciones ofrecen `getByTestId | getByRole | getByLabel | getByText | css=`, pero
   `locatorFromChain` acepta además encadenado `>>` y sufijo `.nth(N)` (comprobado: el guion
   de la prueba de justicia resuelve con `.nth(0)`). No está documentado si la poda de
   gramática es deliberada — un locator posicional es frágil y quizá deba exigir aprobación
   humana — pero hoy no está escrito en ningún sitio.
4. **El informe dice "hint irresoluble" N veces cuando el problema es uno.** En el
   experimento 1, once bloqueos cuyo origen era un único `entry` equivocado. Clase de K0.17
   reaparecida. Hay señal honesta disponible sin adivinar: varios pasos consecutivos del mismo
   flujo irresolubles **sin que la pantalla haya cambiado** no son N problemas de locator.
5. **El coste del rescate está inflado ~30× por el mecanismo de entrega.** El paquete real son
   4,3 KB; los ~94k tokens son casi todos el prompt de sistema del subagente que lo
   transporta. Una llamada directa con solo el payload costaría del orden de 2-3k.

---

## Conclusiones, planteadas como hipótesis falsables

Ninguna de estas está probada con la muestra actual. Se enuncian de forma que un experimento
pueda tumbarlas, y cada una lleva el experimento que lo haría.

**H1 — El LLM produce afirmaciones factuales contradictorias sobre la misma aplicación entre
ejecuciones.** Evidencia actual: 1 contradicción en n=2. Muestra insuficiente. Se falsa si en
n≥5 pasadas no aparece ninguna discrepancia factual. → **E1**

**H2 — El veredicto de un LLM ejecutando regresión no es reproducible.** Evidencia actual: una
sola ejecución, con un verde falso. No hay medida de estabilidad. Se falsa si n≥5 ejecuciones
dan el mismo veredicto en los cinco casos. → **E5**

**H3 — El rescate LLM declina más de lo que resuelve.** Evidencia actual: 2 de 2 declinados.
Muestra ridícula. Si es cierto, el rescate es teatro y el fallback real es el panel asistido,
lo cual cambia el relato del producto. Se falsa si la tasa de resolución supera el 50% en un
corpus de N≥20 peticiones reales. → **E2**

**H4 — La poda del rescate baja la tasa de resolución sin bajar la tasa de EQUIVOCADO.** O
sea, es una falsa economía. Evidencia actual: n=1, y en ese caso no fue la causa. → **E3**

**H5 — El punto de equilibrio walker vs. LLM está por debajo de 3 ejecuciones del mismo
caso.** Evidencia actual: acotado a ~1,5 con supuestos, no medido, porque el coste de
producir un guion utilizable no está cerrado (el del refiner dio 0/11). → **E4**

**H6 — La clase "el literal positivo es subcadena del resultado negativo" produce verdes
falsos en los dos motores, y es frecuente en criterios de aceptación reales.** Evidencia
actual: 1 caso, medido en ambos. → **E6**

**H7 — El walker no resuelve nunca al elemento equivocado en silencio.** Es la afirmación
sobre la que descansa todo el producto y **nunca se ha medido a escala**. Evidencia actual:
un banco propio con corpus mínimo (K0.31) y siete sitios recorridos a mano. → **E7**

---

## Experimentos propuestos

Ordenados por lo que cambian, no por lo que cuestan.

### E7 — Banco de resolución a escala (Mind2Web)

**Hipótesis**: H7. La métrica que manda es **EQUIVOCADO**, no acierto: un walker que se planta
mucho es lento; uno que acierta el 95% y falla mudo el 5% es inservible para QA regulado.
**Montaje**: la infraestructura existe — `copilot/src/resolve-bench.ts` corre la escalera real
del producto sobre fotografías de DOM, y el capturador de corpus (K0.32) congela la
visibilidad, que era el bloqueo metodológico (los volcados de Mind2Web no traen CSS).
Enganchar el dataset es trabajo de datos, no de código. **Coste**: $0 en LLM, trabajo de
conversión. **Decide**: si la afirmación central del producto es cierta o es una creencia.

### E2 + E3 — Banco de rescates (los dos sobre el mismo corpus)

**Hipótesis**: H3 y H4. **Montaje**: reunir las peticiones de rescate reales que ya han
producido los siete sitios de la gira (hay `dom-map` con pasos bloqueados de BootsFaces,
tufarmacia, onesait, UI5, JSF 1.2, PrimeNG y OrangeHRM), reproducir cada una como
micro-llamada y clasificar en resuelto / declinado / **EQUIVOCADO**. La misma corrida en A/B,
podado vs. completo, da E3 gratis. **Coste**: N × ~3k tokens si se sirve directo, N × ~100k si
se sirve como subagente — y esa diferencia es en sí misma el quinto defecto documentado
arriba, así que conviene medirla. **Decide**: si el rescate se queda, se rediseña o se
sustituye por el panel.

### E1 + E5 — Varianza del LLM (n≥5)

**Hipótesis**: H1 y H2. **Montaje**: cinco pasadas del Planner sobre el mismo alcance y cinco
ejecuciones de la suite de regresión, todo con el mismo prompt. Métricas: dispersión de
tokens y reloj, **tasa de contradicción factual** entre pasadas, y **estabilidad del veredicto**
por caso. **Coste**: ~700k + ~700k tokens. **Decide**: si "el LLM no es admisible como juez en
un entorno auditado" es un argumento con dato o una opinión. Para banca es *el* argumento.

### E6 — Banco de criterios trampa

**Hipótesis**: H6. **Montaje**: un conjunto de criterios donde el literal positivo es
subcadena del resultado negativo — "Records Found" ⊂ "No Records Found", "resultados" ⊂ "sin
resultados", "movimientos" ⊂ "No hay movimientos", "póliza encontrada" ⊂ "no se encontró
ninguna póliza". Medir cuántos marcan verde el LLM y el walker. Después implementar el arreglo
de "citar el texto del nodo que casó" y volver a medir — no el veredicto, sino la
**detectabilidad**. **Coste**: bajo. **Decide**: produce un arreglo de producto con número
antes/después, y una recomendación concreta para el analista funcional.

### E4 — Punto de equilibrio con reconciliación medida

**Hipótesis**: H5. **Montaje**: tres FDs reales, cadena completa refiner → walker →
reconciliación → walker hasta que la suite quede verde, contando tokens de todo. Comparar con
N × ejecución LLM. **Coste**: medio. **Decide**: la cifra que se pone en la propuesta
comercial, con su condición ("a partir de la N-ésima ejecución").

### E8 — El coste del humano en el panel asistido

**Hipótesis**: sin enunciar, porque no hay dato ninguno. Es la pata que falta de la economía:
si el rescate declina (H3), el fallback real es un QA señalando en pantalla, y **nadie ha
medido cuánto tarda**. **Montaje**: cronometrar a un QA resolviendo N pasos bloqueados con
`--assist`. Requiere al QA, no se puede hacer solo. **Decide**: si el modelo de coste del
producto está completo o le falta el sumando principal.

---

## Experimento E2+E3 — Banco de rescates (ejecutado)

`copilot/src/rescue-bench.ts`. Corpus de **7 pasos bloqueados reales** cosechados de cuatro
sitios y cuatro stacks: OrangeHRM (SPA con sesión), Sakai (Angular+PrimeNG), OpenUI5 y
BootsFaces (JSF 2.x). Las fotos del DOM salen del capturador con `--capture-corpus`; el
corpus vive en `.work/` y NO se versiona (regla #6: una foto es HTML crudo). La verdad la
marca una persona en `copilot/bench/rescates/verdad.jsonl`, con el porqué de cada caso.

### La taxonomía, que es lo único importante del diseño

Iba a medirse "tasa de acierto del rescate". Con el corpus real delante se ve por qué eso no
sirve: **cuatro de los siete casos que el walker bloquea no tienen respuesta única** — tres
etiquetas "Select your car's brand" idénticas en la misma página del showcase, tres botones
"Submit AJAX", tres campos "Email" en tres tarjetas. Ahí **declinar es acertar**.

| desenlace | qué significa |
|---|---|
| `acierto` | resolvió, y al elemento que marcó una persona |
| `EQUIVOCADO` | resolvió a otro, **o** eligió donde no había a quién elegir |
| `planta-correcta` | declinó, y el caso no tenía respuesta única |
| `planta-cobarde` | declinó, y sí la había |

El CLI sale con error solo por `EQUIVOCADO`, igual que el banco de resolución: plantarse es
lento, equivocarse en silencio es inservible.

### Resultado — los dos brazos, idénticos

| brazo | evidencia total | tokens | reloj | acierto | EQUIVOCADO | planta-correcta | planta-cobarde |
|---|---|---|---|---|---|---|---|
| podado (el de producción) | 32.297 car. | 127.260 | 2 min 27 s | 1 | **0** | 4 | 2 |
| completo | 296.220 car. | 132.850 | 4 min 44 s | 1 | **0** | 4 | 2 |

**H4 respondida, y en contra de mi sospecha: la poda no cuesta nada.** Nueve veces más
evidencia produce exactamente la misma clasificación en los siete casos. La hipótesis de que
podar era una falsa economía queda falsada con este corpus.

**Y el coste tampoco escala con la evidencia**: 9× de payload → +4% de tokens. Confirma por
segunda vez que la factura del rescate es el sobre, no la carta. Los ~127k tokens de siete
rescates son ~18k por rescate *amortizando* el prompt de sistema entre los siete; medido
antes de uno en uno, un solo rescate costaba ~94k. Servirlo como llamada directa con su
payload (4,3 KB) sigue siendo la optimización pendiente.

**H3 queda matizada, no confirmada.** El rescate declina mucho (6 de 7), pero **cuatro de esas
seis son correctas**: no se inventó ni uno de los cuatro controles. No es incompetencia, es
que la mayoría de lo que el walker bloquea es ambigüedad de verdad. Lo que hay que perseguir
son las **dos plantas cobardes**.

**Cero EQUIVOCADO en ambos brazos.** Con n=7 no es una tasa, pero es la métrica que decide y
de momento está limpia.

### Las dos plantas cobardes, y por qué se explican solas

- **OrangeHRM**: hay UNA sola etiqueta "Employee Name" y su grupo de campo contiene UN solo
  input. Hay respuesta. Lo que no hay es forma de escribirla: ese input no tiene id ni nombre
  accesible propio, y la gramática ofrecida no permite decir "el control que sigue a esa
  etiqueta". Las dos pasadas (podado y completo) lo razonaron igual.
- **OpenUI5**: declinó entre "Show Shopping Cart" y "Add to Cart". Este caso está marcado como
  resoluble por criterio propio y **declarado DEBATIBLE en `verdad.jsonl`**: si un evaluador
  humano lo lee distinto, se reclasifica, no se defiende.

Las dos apuntan al mismo sitio: **la gramática del rescate es más pobre que el parser del
walker**. `>>` encadenado y `.nth(N)` funcionan (comprobado) y no se ofrecen.

### Defectos encontrados montando el banco

1. **El congelado de visibilidad de K0.32 hundía diálogos enteros. ARREGLADO.** El
   `<p-dialog>` de PrimeNG es un elemento anfitrión de caja 0×0 cuyo contenido va posicionado;
   la regla lo marcaba oculto e inyectaba `display:none` sobre el diálogo completo. El
   objetivo aparecía invisible en una pantalla donde estaba a la vista y el caso quedaba
   inservible. Misma trampa que el envoltorio de altura cero de TrustArc (§23/D4): **caja cero
   no es oculto**. La condición correcta es "no se ve Y no contiene nada que se vea" — ocultar
   un envoltorio cambia la visibilidad de sus hijos, y la foto existe justo para conservarla.
   Verificado: el objetivo pasa de 0×0 a 413×32. Afecta también al futuro corpus de Mind2Web.
2. **La gramática del rescate no puede expresar un valor con apóstrofo. NO arreglado.** El
   brazo podado contestó `getByLabel("Select your car's type")` con comillas dobles porque el
   valor lleva apóstrofo; `locatorFromSource` acepta `getByLabel\('([^']*)'\)` — comillas
   simples y sin escape. La respuesta era legible para un humano y no para el walker. Afecta a
   cualquier app en inglés con posesivos, y a francés e italiano. En ESTE corpus no cambió
   ningún desenlace (el caso era un control), y por eso se documenta en vez de parchearse a
   ciegas.
3. **Un bug del propio banco, contado porque es el más instructivo.** El comparador usaba
   `Locator.evaluate(<cadena>)` para preguntar si el elemento resuelto llevaba la marca de
   verdad. Ese método **nunca recibe el elemento como argumento** — hallazgo de la Fase 6, ya
   documentado en este mismo SPEC y vuelto a pisar. Devolvía `undefined`, y el banco marcó
   **EQUIVOCADO un acierto**: el instrumento estuvo a punto de reportar exactamente el fallo
   que existe para detectar. Corregido con `getAttribute`, y ahora además verifica que la
   marca de verdad se llegó a poner (si la expresión no resuelve, el caso sale `sin-verdad` en
   vez de contaminar la cifra).

### Cómo reproducirlo

```
tsx copilot/src/dom-walker.ts --script=<guion> --contract=<contract> \
  --work-dir=.work/banco-rescates/w-<sitio> --rescue-budget=0 \
  --capture-corpus=.work/banco-rescates/c-<sitio>
tsx copilot/src/rescue-bench.ts emitir  --corpus=.work/banco-rescates --out=<dir> [--completo]
tsx copilot/src/rescue-bench.ts puntuar --corpus=.work/banco-rescates --respuestas=<dir>
```

Un corpus por sitio: `bloqueados.jsonl` se sobrescribe por run, igual que el manifest del
corpus de resolución.

### Qué NO decide este experimento

n=7. Sirve para matar hipótesis (H4 muerta) y para orientar, no para publicar tasas. Antes de
usar estas cifras fuera, el corpus tiene que crecer — y crece solo: cada walk con
`--capture-corpus` deja sus bloqueos fotografiados.
