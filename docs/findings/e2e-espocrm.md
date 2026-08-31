# Ciclo E2E en terreno virgen (III) — EspoCRM demo

- **Fecha**: 2026-08-31
- **Sitio**: https://demo.espocrm.com/ (redirige a `demo.eu.espocrm.com`) — EspoCRM, CRM de
  negocio open-source con Advanced Pack, Sales Pack y Project Management. Tercer sitio jamás
  tocado por el producto antes de su ciclo. Elegido para completar la gira de familias: RBP
  era SPA React pública+admin, Tricentis un wizard jQuery de formularios, y esto es la
  **aplicación de negocio con sesión, listados y alta de registros** — lo más cercano al
  back-office que usa un cliente de banca/seguros.
- **Método**: el mismo protocolo de los dos ciclos anteriores — reconocimiento con capturas →
  planner nativo → FD onesait de 10 casos diseñado DESDE la UI → walk-script → tres modos
  medidos (motor solo · walker+IA · solo IA) → estreno manual del QA al final.
- **Artefactos**: FD en `template/examples/08-espocrm/espocrm-fd.md` · walk-script en
  `docs/demo/espocrm-regresion.walk.json` · capturas y literales en `.work/e2e-espocrm/` ·
  contract `config/style-contracts/espocrm.yaml` · receta `config/field-sites/espocrm.yaml`.

---

## 1. Reconocimiento (capturas + literales)

Pase visual propio (12 capturas en `.work/e2e-espocrm/capturas/`, literales exactos en
`literales.json`) más una sonda de entrada. Lo que el sitio ES:

- **La puerta no tiene contraseña**: un `<select>` de usuario (única opción `Administrator`)
  y un botón `Login`. No hay credencial que declarar — el contract va con `auth.enabled: false`
  y la puerta se pasa con pasos del guion.
- **El idioma se elige en la puerta y manda sobre toda la UI**. El desplegable `Language` viene
  preseleccionado con el locale del navegador (en esta máquina, `es_ES`) y queda en la URL
  (`?l=es_ES`) tras entrar. Un guion que no fije el idioma **no es reproducible entre
  máquinas**: los literales cambian. El CP001 lo fija a propósito.
- **Módulos de negocio** en el menú lateral: Cuentas, Contactos, Posibles clientes,
  Oportunidades, más Actividades, Soporte y el paquete de ventas (Presupuestos, Órdenes de
  venta, Facturas…). Listado con buscador y filtro `Todos`, ficha de registro con paneles de
  relaciones, alta (`Crear cuenta`) y borrado con confirmación. Oportunidades abre en **Kanban**
  por etapa (Prospección · Calificación · Propuesta · Negociación · Cerrado ganado).

### Los rasgos que muerden (medidos, no supuestos)

1. **CERO nombres accesibles en los formularios**: ningún control tiene `id`, `name` ni
   `label for=`. La etiqueta es texto adyacente sin vínculo. Lo único estable es el atributo
   `data-name` (`name`, `website`, `billingAddressCity`, `save`, `cancel`…). Es el terreno
   natural del peldaño **anclado** de la escalera (el que nació para el legacy JSP de
   ParaBank) — y en este ciclo se le vio trabajar en una SPA moderna, no en legacy.
2. **I18N PARCIAL — defecto real del sitio**: con la sesión en español, las **cabeceras del
   listado siguen en inglés** (`Name` / `Industry` / `Type` / `Country`), igual que el panel
   `Details` y las pestañas de la ficha (`Account` / `Stream` / `Support` / `Sales`), mientras
   los valores y el resto de la UI sí están traducidos. CP010 lo pisa a propósito: un cliente
   regulado de habla hispana no acepta una pantalla a medio traducir. Veredicto correcto:
   «el FD tiene razón».
3. **DEMO COMPARTIDA y simultánea** (lo dice su propia pantalla): los datos son estado
   compartido. El contador pasó de `1–12 / 12` a `1–13 / 13` **durante el propio ciclo**,
   porque el planner creó su registro mientras el reconocimiento miraba. Los recuentos
   absolutos no son oráculo; lo que un caso crea, el caso lo borra (CP007 crea, CP009 borra).
4. **El aviso de validación es efímero y el toast no**: al guardar una cuenta sin nombre
   aparecen DOS señales — un toast `No válido` que persiste y un popover `Nombre es requerido`
   anclado al campo que **desaparece en cuanto el campo recibe el foco**. De ahí la
   discrepancia con el planner (§2), que reportó «sin toast».
5. **Los desplegables de negocio (Tipo, Industria) no son `<select>` nativos**: disparador +
   lista. La familia «selectOption lanzó sobre un div», por tercera vez en tres ciclos y en su
   tercera variante distinta.

## 2. El planner nativo (S4, descubrimiento)

281.971 tokens · 118 usos de herramienta · ~15 min → plan en `docs/qa-plans/espocrm-test-plan.md`
(7 suites, 19 casos). Lo que trajo por su cuenta:

- **El diálogo de duplicado** al crear una cuenta con nombre existente («The record you are
  creating might already exist») — que el reconocimiento no vio y que es exactamente el riesgo
  que corre CP007 en una demo compartida donde un pase anterior no llegó a borrar.
- La pantalla de **conversión de Posibles clientes** (marcada como irreversible: exploró el
  camino de Cancelar, no lo ejecutó), el Kanban de Oportunidades con su alternador a listado,
  el menú global de creación rápida y el buscador global con resultados agrupados.
- El texto literal del diálogo de borrado, verificado creando y borrando un registro de usar y
  tirar.
- **Una sección propia de «oráculos estables vs. inestables»** al principio del plan, por
  iniciativa suya, al recibir el aviso de que la demo es compartida.
- **Un dato en disputa con el reconocimiento**: afirma que la validación del nombre vacío
  muestra «borde y etiqueta en rojo, sin toast». La captura del reconocimiento tomó el toast
  `No válido`. La explicación medida está en el rasgo #4: el popover se va con el foco y el
  toast tiene su propia vida. Dos observaciones honestas que se contradicen porque miraron en
  instantes distintos — a resolver en vivo.
- Dejó en la demo compartida la cuenta «QA Prueba Inetum» y el contacto «Ana Prueba» (lo
  declara en el plan). El FD usa «QA Inetum Prueba» — distinto orden, sin colisión.

## 3. FD onesait + walk-script

FD de 10 casos en registro corporativo (un verbo por línea, oráculos en negrita), diseñado
DESDE la UI: CP001 acceso fijando idioma · CP002 consulta de la cartera · CP003 búsqueda por
nombre · CP004 ficha de la cuenta · CP005 relaciones (contactos y oportunidades) · CP006
validación del alta · CP007 alta de cuenta · CP008 la cuenta creada aparece en la cartera ·
CP009 baja con confirmación · CP010 el listado en el idioma de la sesión (la tensión
deliberada).

Walk-script de 10 flujos / 89 pasos anclado al FD, validado contra el contract. Hints
semánticos honestos sin pre-afinar: en particular **no se declaró `data-name` como testid**,
aunque el sitio lo ofrece, porque eso es pre-afinar y la fricción restante ES la medición.

## 4. Los tres modos (resultados)

_(se rellena con cada run)_

### 4.0 El defecto que se comió el primer run — D71, el viewport que nadie declaraba

El primer run de la línea base salió **23/89 pasos y 66 bloqueados**, y el reporte honesto
llevaba la pista delante: `0 ciclos de ocupado en 440 ms` en todos los pasos y un solo
«pantalla». Dos causas, ambas del producto y ambas genéricas:

1. **La ventana de quietud confunde «aún no ha empezado» con «ya terminó»**. La entrada asentó
   a los 463 ms sin ver actividad porque el bundle de la SPA todavía estaba arrancando: el
   primer paso resolvió contra un DOM vacío y todo el flujo cascadeó. Peor: la **capa 4
   (calibración con el p95)** guardó esas muestras de ~440 ms como si fueran el tiempo real
   del sitio — el perfil de tiempos aprende de runs que nunca vieron la aplicación y envenena
   los siguientes. Con `--quiet-ms=2500` la entrada pasa a asentar en 4.569 ms **con 2
   reinicios de ventana** y el login resuelve.
2. **D71 — el viewport no lo declaraba NINGUNA capa**: ni CLI, ni contract, ni script. Todo
   run heredaba el default de Playwright (1280×720) sin que apareciera en un solo artefacto.
   EspoCRM pliega su menú lateral a esa anchura: el enlace `Cuentas` **existe en el DOM y
   nunca es visible**. A/B de una sola variable, mismo momento y mismos pasos:

   | Viewport | `Cuentas` visible |
   |---|---|
   | 1280×720 (heredado) | **NUNCA** en 20 s — 1 nodo en el DOM, oculto |
   | 1400×900 (declarado) | **1.553 ms** |

   El alcance va más allá de este sitio: **los tres ciclos E2E han corrido a 1280×720 sin que
   nadie lo supiera**. En RBP y Tricentis no mordió porque sus maquetas son de ancho fijo — no
   por diseño, por suerte.

**La rebanada** (genérica, en `walk-core`, 9 tests): `resolveViewport` (CLI > contract > el
default de Playwright, que **no se cambia**: inventar uno propio movería en silencio la línea
base de todas las mediciones anteriores, que es justo el error que el defecto documenta), el
campo `viewport` del Style Contract, y la línea que el walker imprime SIEMPRE al abrir el
contexto — declarado o no, el viewport deja de ser invisible. Más `notaTextoOculto`, que
convierte el «texto no visible» en accionable: cuando el texto **existe en el DOM pero está
oculto**, el motivo lo dice y nombra el viewport del run («esto es layout, no drift del
negocio»). Sin esa frase, el QA sale a buscar un drift que no existe.

### 4.1 Motor solo (0 tokens, línea base)

**71/89 pasos · 0 rescates · 18 bloqueados · 3 pantallas · exit 0**, con el viewport declarado
a 1400×900. El impacto de D71, con lo demás igual:

| | viewport heredado (1280×720) | viewport declarado (1400×900) |
|---|---|---|
| Pasos completados | 23/89 | **71/89** |
| Bloqueados | 66 | **18** |
| Pantallas descubiertas | 1 | 3 |

Lo que queda bloqueado ya es material honesto del sitio y del guion:

- **El buscador del listado es ambiguo de verdad** (cp003/cp008/cp009 s5): hay dos
  `searchbox` en la pantalla — el global de la cabecera y el del listado, y este último no
  tiene nombre accesible ninguno. Bloqueo correcto; clase panel.
- **El oráculo efímero, cazado** (cp006/s8): el toast `No válido` **pasó** y el popover
  `Nombre es requerido` **no estaba** — desaparece en cuanto el campo recibe el foco. Esto
  zanja la discrepancia con el planner (§2): los dos tenían razón sobre instantes distintos.
- **El FD nombra un menú que la pantalla no rotula** (cp009/s8): el FD dice «abrir el menú de
  acciones» y el guion buscó un botón `Acciones`; la ficha lo pinta como `...`. Discrepancia
  FD↔UI legítima, para el panel.
- **Campos de dirección con ámbito** (cp007 s8/s9): `placeholder: Ciudad` acotado a
  «Dirección de facturación» — el sitio repite los mismos placeholders en facturación y envío,
  así que el ámbito es imprescindible y aquí no resolvió.
- **Una carrera de render bien contada** (cp010/s2): el `<select>` de idioma existía y su label
  resolvió, pero sus opciones aún no estaban pobladas. El mensaje lo dice con exactitud —
  «la opción 'Spanish (Spain)' no existe en el `<select>` (opciones reales: ∅) — nunca se
  adivina» — en vez de culpar al locator.
- **Y el verde peligroso del ciclo** (cp002/s8): la postcondición pedía `Cliente` y la guarda
  de coincidencia parcial avisó de que en pantalla hay **`Posibles clientes`** — el enlace del
  menú lateral. El caso se habría dado por bueno sin mirar la columna `Type`. Es K0.37 otra
  vez, ahora en español y por inclusión de palabra. Ningún motor puede decidir eso: lo decide
  un QA, y por eso se canta.

También quedó registrado el peldaño que este sitio exige: `Username` se resolvió por
**`anchored(label:'Username')`** — el peldaño anclado, nacido para el legacy JSP de ParaBank,
trabajando en una SPA moderna con cero nombres accesibles.

### 4.2 Walker + IA (rescates por subagente Haiku, con triaje de serie)

**3 peticiones de rescate · 2 micro-llamadas gastadas (~85k) · CERO desbloqueos netos.** El
resultado peor de los tres ciclos, y por una razón que ninguno de los dos anteriores podía
enseñar — **D73, la fuga del presupuesto en la reanudación**:

1. El triaje hizo bien su trabajo al principio: de todos los bloqueos de la línea base, solo
   mandó a rescate **el buscador del listado** (cp003/s5), que es exactamente la clase que la
   IA puede resolver. El Haiku fresco lo resolvió a la primera con
   `getByRole('searchbox').nth(1)` — información posicional honesta sacada del snapshot, la
   gramática que D68 destapó.
2. **Y ese locator comprado nunca se consumió.** Al reanudar, D66 descarta la sesión del
   checkpoint y re-ejecuta el flujo **desde su primer paso**; la página no había pintado
   (D72), así que la puerta volvió a fallar y el run se atascó ANTES de llegar a s5. El
   presupuesto se gastó y el desbloqueo no se entregó.
3. Los siguientes rescates son la fuga en marcha: cp003/s1 y cp003/s2 pidieron rescate con un
   snapshot **prácticamente vacío** (`- contentinfo: - link "EspoCRM, Inc."` y nada más). El
   subagente declinó correctamente —la regla «no inventar» aguanta el peor input— pero cada
   declinación garantizada cuesta ~44k. Paso a paso, mientras la puerta no pinte.

El triaje enruta por CLASE de motivo y le falta una clase: **«la pantalla no había pintado»**,
que es diagnosticable de forma determinista y gratis (si el snapshot podado no tiene NINGÚN
elemento accionable, no hay nada que resolver). Queda propuesta en D73 con su remedio.

Observación de protocolo, de regalo: **una de las dos micro-llamadas respondió en prosa en vez
de escribir `rescue-response.json`** (la otra escribió el fichero correctamente). El
orquestador medió la entrega y queda anotado: la instrucción de escribir el archivo no es
suficiente por sí sola, y un orquestador automático debe contemplar la respuesta en texto.

### 4.3 Solo IA (el LLM ejecuta y verifica el FD)

**8/10 PASA · 242.276 tokens · 94 usos de herramienta · ~11 min.** Subagente Sonnet con el FD,
navegador propio y los dos avisos medidos (viewport 1400×900 y demo compartida).

- **Los dos FALLA son los CORRECTOS**, y el razonamiento de CP010 es el que el ciclo buscaba:
  «el propio producto demuestra en el resto de la pantalla que sí traduce, así que aquí
  incumple su propio estándar». Veredicto: el FD tiene razón.
- **Confirmó el diálogo de duplicado** que había traído el planner, ahora con su literal en
  español («El registro que está creando parece ser un duplicado»), y con él confirmó de paso
  el rasgo de la demo compartida: **la cuenta «QA Inetum Prueba» del run anterior seguía
  viva** porque su borrado había quedado bloqueado. La nota del FD anticipaba exactamente ese
  escenario.
- **Completó CP009 de verdad**: borró la cuenta que él mismo creó y dejó el entorno como lo
  encontró. Intentó además limpiar el residuo del run anterior y **el clasificador de permisos
  del entorno se lo impidió** — lo reportó en vez de insistir, que es la conducta correcta.
- Reprodujo por su cuenta el hallazgo de accesibilidad (rótulos sin `for`/`id`).

### 4.3.1 El oráculo efímero, medido por tres observadores distintos

`Nombre es requerido` es el mejor material de este ciclo, porque los tres modos vieron cosas
distintas **y los tres decían la verdad**:

| Observador | Cuándo miró | Qué vio |
|---|---|---|
| Reconocimiento | inmediatamente tras pulsar Guardar | el popover **está** (capturado en PNG y en `literales.json`) |
| Planner nativo | durante su exploración | «borde y etiqueta en rojo, **sin toast**» |
| Walker (línea base) | tras estabilizar (~1,6 s) | el toast `No válido` **pasó**; el popover **no estaba** |
| Solo IA | tras sus propios pasos | buscó el texto en **todo el HTML** y no aparece en ningún sitio |

La lectura: el popover se pinta al guardar y **se va con el foco**; el toast tiene su propia
vida, más larga. Un oráculo así produce tests intermitentes en campo, y ningún motor puede
decidir por su cuenta si el fallo es del negocio o del reloj. Es material de panel: el QA mira,
decide y firma. (El juicio del solo-IA —«el usuario ve que algo falló pero no sabe qué campo
corregir»— es buen criterio QA, y con el matiz de que el aviso sí existe, brevemente.)

## 4.4 La tabla que responde a la pregunta del ciclo

| Modo | Resultado | Tokens | Reloj | Qué queda después |
|---|---|---|---|---|
| Motor solo | 71/89 pasos, 18 bloqueados con causa exacta, 3 pantallas | **0** | ~11 min | dom-map, perfil de tiempos SANO, el verde peligroso cantado, los bloqueos accionables |
| Walker + IA (Haiku, triaje) | idéntico a la línea base; el locator comprado se perdió en la reanudación | ~85k en 2 micro-llamadas | ~6 min (2 reanudaciones) | nada durable — pero destapó D73 |
| Solo IA (Sonnet) | 8/10 casos, los dos FALLA correctos, CP009 ejecutado de verdad | ~242k **cada run** | ~11 min | prosa; ni acta, ni locators medidos, ni artefacto re-ejecutable |

Tercer ciclo, misma división del trabajo — con una diferencia que este sitio enseñó y los dos
anteriores no podían: **cuando el entorno racea, el rescate automático no solo no ayuda, sino
que se paga dos veces** (la llamada que no se consume, y las declinaciones garantizadas que
vienen detrás). El camino sigue siendo el mismo: paneles, acta y fusión para convertir los 18
bloqueos en un guion que corra gratis.

## 5. Estreno manual del QA

PENDIENTE — se despliega a su workspace con la receta y el QA ejecuta con paneles (`--assist`).
Este sitio pide gestos de panel distintos a los dos ciclos anteriores, todos de **desambiguación
y de vocabulario**, no de fachada:

- **El buscador del listado** (cp003/cp008/cp009 s5): hay dos `searchbox` y el del listado no
  tiene nombre. Señalarlo una vez y queda firmado.
- **El menú de acciones de la ficha** (cp009/s8): el FD dice «menú de acciones», la pantalla lo
  rotula `...`. Es una discrepancia FD↔UI: el QA decide si se adopta el literal de la
  aplicación (`app`) o si el FD tiene razón.
- **Los campos de dirección con ámbito** (cp007 s8/s9): mismos placeholders en facturación y
  envío; el ámbito es imprescindible.
- **El veredicto de CP010** (el FD tiene razón: la pantalla está a medio traducir) y el del
  **oráculo efímero de CP006**, que es el más interesante de los tres ciclos.

Avisos operativos: fijar el viewport (ya va en el contract, 1400×900); la demo es compartida y
puede haber una cuenta «QA Inetum Prueba» residual de un pase anterior — si aparece el diálogo
de duplicado, es el rasgo, no el producto.
