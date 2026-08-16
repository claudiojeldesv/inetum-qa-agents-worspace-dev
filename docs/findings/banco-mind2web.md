# El banco de resolución contra Mind2Web

- **Fecha**: 2026-08-16
- **Rama**: `design/kernel-v2` (K0.40)
- **Corpus**: Mind2Web (OSU-NLP, CC-BY-4.0) — 137 sitios reales, 31 dominios, acciones humanas
  anotadas sobre el HTML de la página en el instante de cada acción
- **Coste en LLM**: $0. El banco es determinista y corre offline.

Hasta aquí, todo lo que sabíamos de la escalera de resolución venía de sitios que elegimos
nosotros: la gira de stacks (PrestaShop, UI5, JSF, PrimeNG, Vaadin), el banco corporativo y
los fixtures. Cinco sitios y un puñado de guiones no pueden desmentir la afirmación central
del producto. Un corpus de 137 sitios que nadie de este equipo eligió, sí.

---

## Qué mide, y sobre todo qué NO mide

El hint se deriva **del elemento anotado**. Así que esto **no mide inferencia** —dada una
tarea en prosa, ¿qué elemento hay que tocar?— y presentarlo como si lo hiciera sería
tramposo.

Mide **desambiguación**: dadas las palabras que una persona vería en pantalla, entre los
cientos o miles de elementos de una página real, ¿la escalera encuentra ESE elemento, se
planta, o coge otro en silencio?

Esa es la pregunta del producto. El QA escribe el paso mirando la pantalla o leyendo un FD
que la describe; lo que puede salir caro no es que el walker no encuentre —eso se ve— sino
que encuentre otra cosa.

**Regla dura de la derivación**: al hint solo entra lo que una persona percibe (texto
visible, nombre accesible, marcador, título, texto alternativo). Nunca `id`, `class`,
posición ni nada estructural. Si entrara un `id`, el banco estaría midiendo un selector.

**Configuración deliberadamente desfavorable**: los cinco peldaños en el orden por defecto
del kernel, iguales para los 137 sitios. No hay client pack, no hay alias aprendidos, no hay
`settle` declarado. Ajustar el vocabulario por sitio sería el sesgo que este banco existe
para evitar.

---

## Los cuatro desenlaces, y por qué nunca se suman

| desenlace | qué pasó | qué significa para el producto |
|---|---|---|
| `acierto` | resolvió el nodo anotado | — |
| `dentro` | resolvió un **descendiente** del anotado | en un clic el evento burbuja: el negocio ocurre igual |
| `planta` | no resolvió | honesto: va al panel asistido o al rescate |
| **`EQUIVOCADO`** | resolvió **otro** elemento | el único fallo intolerable |

`dentro` es la categoría discutible y hay que justificarla porque es la única que podría
estar inventada para que la cifra quede bonita. En un corpus real la mitad de los controles
son `<a><span>Texto</span></a>`, y el peldaño de texto resuelve al nodo más profundo que
contiene el texto: el `<span>`, no el `<a>` que anotó la persona. Un clic sobre el `<span>`
burbujea hasta el `<a>`, se ejecuta el mismo manejador y el negocio ocurre igual. Cuál de los
dos nodos es "el elemento" es una decisión de modelado del dataset, no un hecho de la página.

Tres cautelas para que la categoría no sea una amnistía, y las tres tienen su test:

1. **Solo hacia dentro.** Resolver un ANCESTRO del anotado es `EQUIVOCADO` y se queda así:
   pulsar el contenedor pulsa su centro, que puede ser otro hijo.
2. **Solo con acciones que propagan** (`click`, `hover`). Escribir o seleccionar sobre un
   descendiente no equivale a nada.
3. **Nunca se suma al acierto.** Línea propia y recuento propio.

**Límite declarado**: offline no se puede comprobar que el descendiente no pare la
propagación (`stopPropagation`, `pointer-events: none`). Es la parte de esta categoría que se
sostiene por argumento y no por medida.

---

## Las tres reparaciones de la foto

El `raw_html` de Mind2Web no es HTML de navegador: es un volcado **serializado** del DOM vivo.
Cargarlo tal cual mide el formato del volcado, no la página. Tres cosas se pierden por el
camino, y las tres se restauran **con datos que el propio volcado trae**:

| # | qué se perdió | por qué importa | con qué se restaura |
|---|---|---|---|
| 1 | los guiones de los nombres de atributo (`aria_label`) | para un navegador `aria_label` no existe: no da nombre accesible. Tres peldaños muertos por formato | se deshace solo en `aria_*` y `data_*` (whitelist) |
| 2 | los nodos de texto vienen envueltos en un `<text>` inventado | el motor de texto resuelve al nodo más profundo → devolvería el `<text>`, no el elemento anotado | se desenvuelve |
| 3 | **no hay ni una hoja de estilo** (medido: cero `<link>`, cero `<style>`, cero `<script>`) | sin CSS lo oculto se vuelve visible, y la visibilidad es carga estructural de la regla dura | `bounding_box_rect`, la geometría real medida en la captura |

La tercera es la lección de K0.32 otra vez, sobre datos ajenos. Y me costó dos intentos:

- Primer intento: ocultar todo nodo con `bounding_box_rect="-1,-1,-1,-1"`. **Ocultaba 85 de
  743 objetivos anotados en un solo shard.** Ninguno de esos 85 tenía `-1` propio (medido: los
  743 traen caja) — los tapaba un **ancestro** sin caja. Un ancestro sin caja con hijos
  dibujados no es una rareza del volcado: es exactamente lo que hace `display: contents`.
- Corregido: un nodo sin caja se oculta **solo si tampoco hay nada dibujado dentro**. Los 85
  descartes bajaron a 9, sin coste de tiempo.

Es la misma corrección que K0.32/K0.39 —caja cero no es oculto— aplicada un nivel más arriba,
y no la apliqué a la primera.

### La mitad falsable: qué pasa si se quitan

Cada reparación es desactivable por bandera, y ese es el experimento. Sobre el mismo shard,
46 casos:

| configuración | acierto | dentro | planta | EQUIVOCADO |
|---|---|---|---|---|
| las tres | 25 | 8 | 13 | **0** |
| sin deshacer los guiones | 23 | 8 | 14 | **0** |
| sin desenvolver `<text>` | 20 | **13** | 13 | **0** |
| sin restaurar la visibilidad | 19 | 7 | **20** | **0** |

Lo que dice esta tabla: **ninguna reparación mueve el EQUIVOCADO**. Lo que mueven es cuánto
puede resolver la escalera, no si falla en silencio. Sin desenvolver, cinco aciertos se
convierten en `dentro` (el `<text>` roba la resolución, exactamente el artefacto previsto).
Sin visibilidad, siete casos más se vuelven ambiguos y se plantan — el coste de no tener CSS,
medido.

Salvedad honesta: con el EQUIVOCADO ya en cero, esta ablación no puede distinguir si las
reparaciones lo *habrían* bajado. Demuestra que no lo esconden, no que no lo toquen.

---

## La limitación que NO se puede reparar: el corpus no trae `href`

Medido: en una página cualquiera del volcado hay **429 anclas, cero `href` y cero
`role="link"`**. Mind2Web elimina el `href`.

Un `<a>` sin `href` **no tiene rol de enlace** — eso es la especificación de HTML, no una
rareza del volcado. Consecuencia directa: en este corpus `getByRole('link', …)` está
estructuralmente muerto salvo donde la página declarara `role="link"` a mano.

No se repara, y la razón importa: las otras tres reparaciones restauran lo que el volcado
**grabó**. El `href` no lo grabó. Se podría inventar uno a partir de `is_clickable`, pero eso
ya no es restaurar, es adivinar — y la línea entre las dos cosas es lo único que hace
defendible el resto.

Lo que sí se hizo es dejar de mentir sobre el rol: el adaptador calcula el rol que el
elemento tiene **en esta foto**, no el que su etiqueta suele implicar. Antes mapeaba
`a → link` a ciegas y eso **produjo un EQUIVOCADO** en uniqlo: el `<a>` anotado no era
enlace, pero otro de la misma página traía `role="link"` explícito, así que
`getByRole('link', {name:'Women'})` resolvió el otro.

**Cómo sesga la medida**: en contra nuestra. Los enlaces son la clase más numerosa del
corpus, y en ella la escalera pierde su peldaño más fuerte y cae al de texto, que es donde
se produce el `dentro` y donde vive la ambigüedad. La cifra de `acierto` que salga es un
suelo, no un techo.

---

## Lo que descarta el adaptador, y por qué

Un caso descartado no puntúa a favor de nadie. Los motivos se cuentan y se declaran:

- **sin verdad anotada** — la acción no trae `pos_candidates`.
- **la verdad no es única en la foto** — el mismo `backend_node_id` aparece dos veces.
- **la verdad no se ve en la foto** — el objetivo estaba en un menú plegado que un paso
  anterior habría abierto. El banco evalúa pasos sueltos, así que no puede reproducirlo.
- **sin palabras que un QA pudiera escribir** — el elemento no tiene texto, ni nombre
  accesible, ni marcador, ni título, ni alternativo. Un paso sin palabras no es un paso.
- **las palabras no son un hint (demasiado largas)** — más de 100 caracteres. Si el único
  asidero es un párrafo entero, el caso no representa nada que el producto vaya a ver.

---

## Un defecto del walker, cazado por el corpus

**El marcador aceptaba substring cuando las palabras venían del NOMBRE.** Caso
`1ba150cb-1` (travelzoo): el paso pedía la sugerencia «Hotels» de un desplegable —hint
`{role:'listitem', name:'Hotels'}`—, el rol no resolvió, el marcador exacto tampoco, y el
substring encontró UNO: el `<input>` del buscador, cuyo marcador dice «Hotels, e.g. Las
Vegas». Resolvió el campo de búsqueda en lugar de la opción del menú, **en silencio**.

Es la misma clase que K0.33/D2, un peldaño más abajo: cuando ya se ha cambiado de atributo
(nombre accesible → marcador), aflojar además el matching son dos saltos encadenados y la
comparación deja de ser defendible. `label` —el vocabulario con el que el FD dice "lo que se
lee en el hueco del campo"— conserva su red de substring; `name` pasa a solo exacto.

---

## Dos defectos de MI ADAPTADOR, cazados por el mismo corpus

Se anotan aparte porque no son del producto y contarlos como fallos del walker sería tan
deshonesto como no contarlos:

1. **El `value` como nombre.** Derivaba el hint del atributo `value` de cualquier `<input>`,
   y de ahí salieron `{role:'checkbox', name:'1'}` y `{role:'textbox', name:'All'}` — hints
   que ningún QA escribiría, porque ese `value` no se ve. Viola la regla que yo mismo declaré
   (al hint solo entra lo perceptible). Corregido: solo en `submit`/`button`/`reset`, que son
   los que se dibujan con su valor dentro.
2. **La regla de visibilidad**, ya contada arriba: 85 objetivos anotados tapados por un
   ancestro sin caja.
3. **El rol del ancla**, ya contado arriba: `a → link` a ciegas sobre un corpus sin `href`.
4. **Una foto rota tumbaba el corpus entero.** Un `setContent` sobre una página concreta
   reventó el navegador (`Page crashed`) y se llevó por delante seis mil conversiones ya
   hechas. Es literalmente la regla que el manifiesto del banco ya declaraba —«una línea rota
   no puede tumbar un corpus de miles»— y que al adaptador se me olvidó aplicarle.

Los cuatro los cazó el corpus, no una revisión. Es el argumento de por qué el banco vale la
pena aunque el walker saliera perfecto: **mide también al que mide**.

---

## Resultado

**6.249 casos, 73 sitios reales, 0 tokens.** Sin client pack, sin alias aprendidos, sin
`settle` declarado y con el peldaño de enlace amputado por el corpus.

| desenlace | casos | % |
|---|---|---|
| acierto exacto | 4.170 | 66,7% |
| `dentro` (descendiente; el clic burbuja al anotado) | 645 | 10,3% |
| plantada honesta → panel o rescate | 1.396 | 22,3% |
| **EQUIVOCADO** | **38** | **0,6%** |

Ningún caso quedó sin veredicto.

### Los 38, desglosados — porque no son la misma cosa

| relación con lo anotado | casos | qué haría el walker en una app viva |
|---|---|---|
| **ajeno** | **21** | resolvió otro elemento: el fallo fuerte, y el único que puede ocurrir en silencio |
| `dentro` con acción que no propaga | 14 | resolvió un descendiente y la acción (`fill`/`select`) **falla en voz alta**, no calla |
| ancestro | 3 | resolvió un contenedor del anotado |

**El fallo fuerte es 21 sobre 6.249: 0,34%.** Los otros 17 se cuentan como EQUIVOCADO a
propósito —la métrica es "otro elemento", no "otro elemento en silencio"— pero mezclarlos en
una sola cifra sería exactamente el pecado que el banco denuncia en los informes ajenos.

### De qué peldaño salen

| peldaño | aciertos | EQUIVOCADO |
|---|---|---|
| `getByRole` | 2.954 (71% de los aciertos) | 5 |
| `getByText` | 1.216 | 33 |
| `getByLabel` | 0 | 0 |
| `getByPlaceholder` | 0 | 0 |
| `getByTestId` | 0 | 0 |

Es el resultado más informativo de todos y confirma el diseño de la escalera: **el peldaño
fuerte hace el 71% del trabajo y produce 5 fallos; el peldaño flojo, que es el último y solo
entra cuando los de arriba no resolvieron, produce 33.** La escalera falla donde era
previsible que fallara, no en sitios inesperados.

`getByTestId` sale a cero porque Mind2Web no capturó `data-testid` en estos sitios.

`getByLabel` y `getByPlaceholder` a cero **no** es una propiedad del corpus, y averiguar por
qué fue el hallazgo más caro de la sesión: hay 459 casos que traen el marcador en el hint y
**ninguno llega a esos peldaños**, porque un intento anterior —el rol pelado— se declara
ambiguo y detiene la escalera. Está contado entero más abajo, con el arreglo que se probó,
se midió y se deshizo.

### Concentración

Los 38 se reparten en 21 sitios de 73, y la cola es corta: parking 7, ebay 5, enterprise 4,
instacart/budget/cargurus/nyc 3 cada uno. No hay un sitio que envenene la medida.

### Convergencia

Al 40% del corpus (2.501 casos, 70 sitios) el reparto era 67,6 / 9,6 / 22,3 / **0,5%**. Al
100%: 66,7 / 10,3 / 22,3 / **0,6%**. La muestra había convergido a la mitad del run — la
cifra no depende de qué shards entren.

### Cómo leerla

- Es un **suelo, no un techo**. El corpus borra los `href`, así que en la clase más numerosa
  —los enlaces— la escalera pierde su peldaño más fuerte y cae al de texto, que es de donde
  salen 33 de los 38 fallos.
- **No mide inferencia**, mide desambiguación. Con las palabras correctas y una página real
  de cientos o miles de elementos, la escalera coge otro elemento en el 0,6% de los casos, y
  otro elemento *en silencio* en el 0,34%.
- Lo que no se puede concluir: nada sobre aplicaciones corporativas de banca o seguros. Los
  137 sitios de Mind2Web son web pública de consumo. Para eso está la gira de stacks, y son
  dos evidencias distintas que no se suman.

---

## El experimento que se hizo, se midió y se DESHIZO

Es el resultado más útil de la sesión, y no aparece en ninguna cifra de arriba porque el
cambio no se quedó.

**El hallazgo.** De los 6.249 casos, **459 traen el marcador en el hint** (`hint.label`, con
las palabras sacadas de un `placeholder`), y **ninguno llegó jamás al peldaño del marcador**:
155 resolvieron de rebote y 304 se plantaron. La causa está en `hintLocatorPlan`: cuando el
hint trae rol pero no nombre, el primer intento es un **rol pelado** —`getByRole('textbox')` a
secas—, y en una página con tres campos eso es ambiguo. La regla de K0.33 detiene la escalera
ahí, y el marcador, que sí llevaba la palabra buena, no se prueba nunca. **304 pasos: el 4,9%
del corpus.**

**El razonamiento del arreglo.** La regla de K0.33 se justifica en que *«la palabra del guion
designa a varias cosas de la pantalla»*. Un rol pelado **no lleva ni una palabra del guion**:
«hay tres campos de texto» no es ambigüedad del vocabulario del QA, porque el vocabulario aún
no se ha consultado. Distinción estructural, no un umbral. Parecía sólida.

**Lo que midió el banco:**

| sub-corpus de 459 casos | acierto | planta | EQUIVOCADO |
|---|---|---|---|
| antes | 155 | 304 | **0** |
| con el arreglo | 344 | 104 | **11** |
| revertido | 155 | 304 | **0** |

189 plantadas convertidas en aciertos **y once fallos mudos donde no había ninguno**.

**Por qué se revierte.** Por la regla que este banco existe para defender: plantarse es lento,
equivocarse en silencio es inservible. El EQUIVOCADO no es moneda de cambio, ni siquiera a
189 contra 11. Si aceptara este trato, el resto del documento dejaría de significar nada.

**El diagnóstico, que es lo que sobrevive.** Los once salen **todos de `getByLabel`**, ninguno
del marcador, y **diez de los once resuelven algo que no es un campo**:

- 6 (delta): `getByLabel('City', exact)` → un `<div>` que CONTIENE al input anotado.
- 3 (ryanair): `getByLabel('Destination')` en substring → un `<a>` «12 top summer
  destinations…».
- 1 (united): → el propio elemento `<label>`.
- 1 (aa): → otro `<input>`. El único que sí es un campo.

O sea: la puerta se abre y el primero en colarse es el peldaño de etiqueta, que para unas
palabras sacadas de un *marcador* es el peldaño equivocado.

**Candidato para el siguiente ciclo, con la evidencia ya en la mano**: el peldaño de etiqueta
debería exigir que lo que resuelve sea un **control etiquetable**. `getByLabel` significa "el
campo etiquetado X", y un `<div>`, un `<a>` y un `<label>` no son campos. Esa guarda sola
mataría 10 de los 11. Queda **nombrado y sin construir**: son dos cambios de producto
apilados, el segundo necesita su propio par falsable, y uno de los once seguiría en pie.

---

### Las clases que quedan nombradas y sin arreglar

1. **El substring del nombre con palabras muy cortas.** `getByRole('link', {name:'S'})` —una
   talla— resolvió «Cookie Preferences». Un hint de una letra no identifica nada, pero la
   guarda evidente es un umbral, y este proyecto prefiere guardas estructurales. Sin diseño
   todavía.
2. **El mismo literal en el filtro y en el resultado** (ebay: «used», «Free Shipping»,
   «Hasbro»). Es la clase §20 otra vez, y el remedio ya existe en el producto —`scope`— pero
   el banco evalúa pasos sueltos y no puede usarlo.
3. **`dentro` con acción que no propaga puede ser mejor que lo anotado.** En mbta el walker
   resolvió el `<select>` que hay DENTRO del contenedor anotado; para un paso `select` ese es
   el elemento correcto y el anotado no lo es. Se cuenta como EQUIVOCADO por la regla que me
   impuse, y prefiero dejarlo así antes que ablandar la métrica una segunda vez.

---

## Cómo reproducirlo

```bash
# 1. bajar los shards del dataset (~5,9 GB) a .work/mind2web/shards/
# 2. convertir a corpus del banco
npx tsx copilot/src/mind2web-to-bench.ts .work/mind2web/shards --out=.work/mind2web/corpus-completo
# 3. medir
npx tsx copilot/src/resolve-bench.ts .work/mind2web/corpus-completo/corpus.jsonl --contract=copilot/bench/mind2web/contract.yaml
```

El corpus vive en `.work/` y **no se versiona**: son fotos de HTML crudo de sitios de
terceros (regla #6). Lo que se versiona es el adaptador, el contract del banco y este
documento.
