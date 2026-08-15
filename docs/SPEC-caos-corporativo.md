# SPEC — Red de caos corporativo (kernel v2)

Endurecimiento del dom-walker frente a las clases de fallo que rompen la automatización
contra aplicaciones Angular/CDK y JSF/PrimeFaces, más el vocabulario de aserciones de
tabla y cardinalidad. Continuación de `docs/SPEC-kernel-v2.md` (fases K0.13–K0.17).

**Origen**: dos investigaciones con fuentes (desplegables no nativos + tablas; caos
Angular/SPA), sintetizadas en un catálogo de modos de fallo con su columna "cubierto /
descubierto". Este documento convierte lo descubierto en fases con criterio de
aceptación. No es greenfield: commands, estructura y estilo de código ya están fijados
en `SPEC.md` y `CLAUDE.md`; aquí solo se especifica lo nuevo.

---

## 1. Objetivo

Que el recorrido determinista sobreviva al DOM real de una app corporativa moderna sin
perder sus dos invariantes: **$0 en el camino feliz** y **nunca adivinar**. Cada mejora
tapa una clase concreta del catálogo, se prueba contra un fixture que la reproduce, y
—si puede enmascarar un fallo real— deja rastro en el audit-log.

**Usuario**: el mismo QA de siempre. El vocabulario del guion no debe crecer más de lo
imprescindible; la mecánica la absorbe el código.

**No-objetivo**: piercing de shadow DOM cerrado, manejo de `ExpressionChanged`/hidratación
(dev/SSR, absorbidos por huella+quietud). La investigación los descartó por riesgo casi
nulo en un run funcional contra producción. No se construyen.

---

## 2. Principio rector (no negociable)

La frontera de todo el sistema, que estas fases deben respetar:

> **El código no adivina y el LLM no inventa.**

Corolarios que aplican aquí:
- Toda desambiguación nueva sigue la regla dura: **una coincidencia visible = adelante;
  dos o más = se planta** y sube a la asistencia. Nada elige "el primero".
- El refiner emite `hint` y `scope` desde el vocabulario del FD. **Nunca** emite
  `locator` (no ha visto el DOM) ni un `scope`/portal que el FD no nombre.
- Cualquier mecanismo que pueda hacer pasar un test que debería fallar (auto-descarte de
  estorbos) va **off por defecto** y **auditado** (familia de la regla #10).

---

## 3. El modelo `scope` vs portal (decisión cerrada)

Resultado del análisis: **no hacen falta dos mecanismos.** El `scope` de K0.16 ya
resuelve el contenedor **a nivel de página entera** (`resolveScope` recorre page + frames),
así que encuentra un contenedor aunque viva en un portal colgado del `<body>`.

Hay dos formas de "dentro de", y ambas son el mismo `scope` apuntado a contenedores
distintos:

- **Contiene-por-DOM** (modal, form-group): `scope: {role: 'dialog', name: '…'}`. El
  diálogo envuelve al objetivo.
- **Contiene-en-portal** (listbox/menú de un desplegable, menú CDK): `scope: {role:
  'listbox'}` / `{role: 'menu'}`. El contenedor vive en el portal, pero `scope` lo
  encuentra igual porque busca a nivel de página.

**El único error posible** es apuntar el `scope` al disparador o al formulario en vez de
al contenedor real. Eso es una **regla de redacción del refiner**, no código:

> El `scope` es siempre la cosa que realmente contiene al objetivo (el diálogo, el menú,
> la lista) — nunca el botón que lo abrió.

Se descartó explícitamente un marcador `portal: true` (Opción B): no compra robustez
—contra un widget sin ARIA un flag no inventa roles— y añade una forma de equivocarse.
Para el widget patológico sin ARIA, el modo asistido ya captura un `locator` de cadena
hacia el panel (vía K0.16), que se funde en el guion.

Fuentes: CDK `OverlayContainer` (portal a `document.body`), PrimeFaces `…_panel`
`role="listbox"`, W3C APG Combobox, Playwright locators (resolución page-level).

---

## 4. Fases

Orden por payoff/riesgo. Cada fase se acepta de forma independiente contra fixtures
deterministas (decisión: `corp-bench` + fixtures sintéticos, offline; onesait es
validación de campo aparte, **no** gate).

### Fase 1 — `select` inteligente + resolución en portal  ★ desbloqueo de onesait

El único cambio de vocabulario es que **no hay cambio de vocabulario**: `select` sigue
siendo un paso con `hint` (el disparador) + `value` (la opción). El driver ramifica:

1. `tagName === 'SELECT'` (vía `evaluate`) → nativo → `selectOption(value)` (hoy).
2. Si no → widget: clic en el disparador para abrir; esperar el `role="listbox"`
   **visible a nivel de página** (oráculo: `aria-expanded=true` del disparador si lo
   emite, con la ventana de quietud como respaldo); resolver la opción como
   `getByRole('option', {name: value})` **dentro del único listbox visible**, con
   `uniqueOrNull` y matching accent-insensitive (se reutiliza el normalizador K0.1).
3. Sin `listbox`/`option` resoluble → cae a la asistencia (que puede capturar un
   `locator` de cadena hacia el panel, K0.16). Nunca adivina.

Matiz JSF/PrimeFaces: el panel es `…_panel role="listbox"` con `<li role="option">` en
portal; la receta (2) lo cubre localizando por rol+texto. **Los ids `j_id…`/`…_N` no se
usan jamás** (regla dura, ya en `looksGeneratedId`).

- **Aceptación**: fixture `mat-select-portal.html` (desplegable cuyo panel se dibuja en
  `document.body`) → el paso `select` elige la opción correcta sin `scope` explícito;
  y un `<select>` nativo sigue pasando por la rama 1. Ambos en `corp-bench`.
- **Tradeoff**: dos fases internas (abrir + elegir) en vez de una llamada; mata la clase
  entera "selectOption lanzó sobre un div" y "clicó el texto y pegó en el chip
  seleccionado".

### Fase 2 — Auto-descarte de estorbos (backdrop / snackbar / consentimiento)

Estorbos que la ventana de quietud **no puede ver** por diseño: el DOM está quieto, el
overlay solo está *encima* interceptando el puntero (`cdk-overlay-backdrop`,
`mat-snack-bar-container`, banners de cookies).

- Mecanismo: `page.addLocatorHandler` sobre un conjunto **declarado por el client pack**
  de selectores de estorbo; el handler los descarta (Escape / botón de cierre) antes de
  que la accionabilidad se re-evalúe.
- **Postura (decisión): opt-in por client pack.** Off por defecto. Nada se descarta
  salvo que el pack lo autorice para ese sitio. Bloque nuevo en el Style Contract:
  `obstructions: { dismiss: [ <selector>… ] }`.
- **Auditoría obligatoria**: cada descarte es un evento de primera clase en el audit-log
  (`action: 'skip'`, `phase: 'obstruction-dismiss'`, selector + paso). El informe de
  reconciliación puede así decir "este run solo pasó porque se barrieron N estorbos" —
  misma filosofía que `ok_after_retry` es ruido pero se cuenta.

- **Aceptación**: fixtures `backdrop-fantasma.html` (backdrop que tarda en desvanecerse
  sobre un botón) y `snackbar-intercept.html` (toast que auto-desaparece sobre un
  control) → con el pack que declara el estorbo, el paso pasa y el audit-log registra el
  descarte; **sin** declararlo, el paso se bloquea con motivo claro (no se barre en
  silencio).
- **Tradeoff**: puede enmascarar un bug real (barrer un overlay que no debía estar). Por
  eso off por defecto y todo auditado; la decisión de encenderlo es del QA por sitio.

### Fase 3 — Matar animaciones (knob del contract)

Las animaciones de ruta/diálogo mantienen la caja del elemento en movimiento y retrasan
la accionabilidad; alguna desplaza el objetivo a mitad del clic.

- Mecanismo: `reducedMotion: 'reduce'` en el contexto + inyección de CSS
  (`*{transition:none!important;animation:none!important}`) en cada navegación.
- Knob del Style Contract: `settle: { disable_animations: bool }`. **Default on** para
  runs funcionales; se apaga para regresión visual (donde la animación es el objeto de
  prueba).
- **Aceptación**: fixture `anim-lenta.html` (botón con transición de entrada larga) →
  con el knob on el paso resuelve rápido y estable; con off, la ventana de quietud lo
  absorbe igual pero más lento (comparativa medida en `step_reports`).
- **Tradeoff**: cambia levemente el comportamiento de la app; podría ocultar un bug
  dependiente de animación (raro en QA funcional). Por eso es knob, no imposición.

### Fase 4 — `scroll_until` para virtual scroll  (menor probabilidad — ver §6)

Listas virtualizadas (`cdk-virtual-scroll`) renderizan solo lo visible; la fila objetivo
no existe en el DOM hasta hacer scroll.

- Acción nueva del guion: `scroll_until` con `hint` (el objetivo) + `container` (el
  viewport scrollable) + `max_steps`. Bucle acotado: scroll del viewport, re-resolver la
  escalera cada iteración, parar en *encontrado* / *max_steps* / *sin filas nuevas*.
- Regla dura: "no encontrado tras N scrolls" es **ambiguo** entre ausencia real y N
  pequeño → se reporta como tal, no se afirma que el registro no existe.
- **Aceptación**: fixture `virtual-scroll.html` (5000 filas, ~viewport renderizado) → el
  objetivo off-screen se materializa y se resuelve; un objetivo inexistente agota
  `max_steps` y se reporta sin afirmar ausencia.
- **Tradeoff**: necesita condición de parada dura o bucla infinito. Probabilidad media en
  apps corporativas; se construye por decisión del QA aun sabiendo que la investigación
  lo diferiría.

### Fase 5 — Settle consciente de debounce en inputs  (menor probabilidad — ver §6)

Campos con `debounceTime`: tras teclear hay un hueco de calma **igual al debounce** antes
de que salga la petición. La ventana de quietud muestreada en ese hueco ve calma falsa —
es la clase K0.17 ("todavía no ha empezado") reubicada en inputs.

- Mecanismo: un `fill`/`type` sobre un campo marcado como debounced no cierra la ventana
  de quietud hasta que (a) transcurre el intervalo declarado **o** (b) aparece el oráculo
  del resultado. Se prefiere exigir un `expect_after` tras el input (el resultado),
  espejo de la capa 3 de K0.13.
- Marca: `debounced: true` (o `debounce_ms`) en el paso, emitida por el refiner cuando el
  FD describe un buscador/typeahead. Default conservador: en cualquier input de texto
  seguido de un `expect_*`, esperar al resultado antes de asentar.
- **Aceptación**: fixture `busqueda-debounce.html` (300 ms) → escribir y asertar el
  resultado pasa; sin la espera consciente, el mismo guion asertaría contra la lista
  vieja (par falsable, estilo K0.13).
- **Tradeoff**: requiere el hint del refiner/contract para distinguir un campo debounced
  de uno instantáneo; el default conservador es seguro pero algo más lento.

### Fase 6 — Aserciones de tabla y cardinalidad  (capacidad aparte, comprometida)

El dolor real del cliente: *"valida que trae más de X registros"*, *"cada cuadro tiene X
opciones"*. Vocabulario nuevo, reparto de trabajo intacto (**el código captura, el LLM
interpreta**).

- Acciones/postcondiciones nuevas:
  - `expect_count` con operador (`>`, `>=`, `=`, `<`) y `value` numérico, sobre un `hint`
    de colección (filas, opciones). Usa `toHaveCount` cuando el operador es `=`
    (reintenta), y `count()` **tras** una espera por visibilidad para los demás
    (nunca leer `count()` sobre una tabla aún cargando → falso 0).
  - `expect_each` sobre un contenedor: cada sub-elemento cumple una condición (p.ej.
    "cada `listbox` tiene ≥ 1 `option`").
- Captura de tabla como datos: el notario copia la tabla a estructura (`headers` + `rows`)
  vía un único `evaluate`, **gateado detrás de una espera por visibilidad/`toHaveCount`**
  (evaluate no auto-espera). Queda en el dom-map para que la fase de derivación (LLM)
  compare contra lo que el plan esperaba. El LLM interpreta; **no** decide los hechos.
- **Aceptación**: contra la tabla de `corp-bench` (la de Consulta Declaraciones) →
  `expect_count rows > 0` pasa tras la búsqueda con resultados y se reporta incumplido
  (no error) cuando no hay datos; la tabla capturada aparece como datos estructurados en
  el dom-map con cabeceras y filas.
- **Tradeoff**: `evaluate` no tiene resiliencia de locator, por eso va **después** de la
  aserción que reintenta — dos pasos, no uno. Ordenar mal esto reintroduce el falso 0.

---

## 5. Cambios transversales

- **corp-bench como red entrenada**: cada clase descubierta entra como fixture del banco
  (`mat-select-portal`, `backdrop-fantasma`, `snackbar-intercept`, `anim-lenta`,
  `virtual-scroll`, `busqueda-debounce`). El banco de regresión pasa a **contener las
  trampas**; una regresión futura las pisa antes de llegar al cliente. (Ya demostró su
  valor en K0.17: cazó una regresión el mismo día.)
- **Refiner** (`ia4d-spec-refiner-lean` + espejo `.github`): regla de redacción del
  `scope` (§3), y emisión de `expect_count`/`expect_each`/`debounced` desde el vocabulario
  del FD. Prohibiciones intactas: nunca `locator`, nunca `scope` no nombrado por el FD.
- **Style Contract** (schema + validador + `/config`): bloques nuevos `obstructions`,
  `settle.disable_animations`; los campos de tabla no tocan el contract (viven en el
  guion). Claves desconocidas siguen rechazadas por el validador.
- **`step_reports[]`**: desenlaces nuevos donde apliquen; el descarte de estorbos y el
  scroll acotado quedan como telemetría, no como "fallo".
- **`template/`** propagado con `npm run build:template`. **SPEC-kernel-v2.md**
  referenciado; este doc es su continuación, no lo reemplaza.

---

## 6. Riesgos y salvedades (honestas)

- **Fases 4 y 5 van contra el consejo de la investigación** de diferirlas hasta tener un
  target que las ejercite (probabilidad media, no alta). Se construyen por decisión
  explícita del QA. Mitigación: aceptación por fixture sintético, coste acotado y visible;
  si al llegar no se ven necesarias, se saltan sin afectar al resto.
- **PrimeFaces**: los detalles finos (`…_panel`, bug del chevron PF13) vienen de doc, no
  de onesait. **No se codifican.** La red que protege es localizar por rol+texto. La
  verificación contra la versión real de onesait es validación de campo, fuera del gate.
- **Auto-descarte**: riesgo de enmascarar bug → off por defecto + auditado (§4 Fase 2).
- **Matar animaciones**: riesgo de ocultar bug de animación → knob, off en visual.
- **dom-walker sin gate de compliance**: sigue vigente el apunte de K0.17 — el walker es
  un componente; el gate vive en los commands. Runs manuales contra PRE no gatean. Es
  decisión asumida, no accidente.

---

## 7. Estrategia de prueba

Sin cambios de método respecto a K0.13–K0.17:
- **Puro** (vitest, sin navegador): matching de nombre de opción, detección de operador de
  `expect_count`, parsing de `scroll_until`, reglas de validación nuevas del walk-script.
- **Integración** (vitest + Chromium real, patrón `spinner-sync.test.ts` con workDir
  temporal): cada fixture nuevo, con **par falsable** donde aplique (política vieja falla,
  nueva pasa — Fases 1, 5).
- **Regresión**: `corp-bench` corre entero en cada `vitest run`; healthcheck 26/26;
  `tsc --noEmit` limpio; template propagado.
- **Gate de cada fase**: verde contra su fixture + banco entero sin regresión. Onesait
  real = validación de campo posterior, registrada aparte.

---

## 8. Orden de entrega propuesto

1. Fase 1 (select + portal) — desbloqueo onesait, cierra el hueco Angular nº 1.
2. Fase 3 (animaciones) — casi gratis, recorta reloj en todo lo demás.
3. Fase 2 (auto-descarte) — opt-in, auditado.
4. Fase 6 (tablas/cardinalidad) — capacidad de aserción, dolor real del cliente.
5. Fase 5 (debounce) y Fase 4 (virtual scroll) — las de menor probabilidad, al final.

Cada fase es un commit propio, TDD, con su fixture y su entrada en `docs/STATUS.md`.

---

## 9. Cierre — estado real y hallazgos post-implementación

Las **6 fases cerradas** (commits `18283d8`, `32b94ff`, `450ac5c`, `4c8a89e`,
`c104b9e`, `27c04ac`, sobre `bf44ada`). Verificado de forma independiente: 169/169 unit
copilot, healthcheck 26/26, `tsc` limpio, `template/` propagado. Tres hallazgos que no
estaban en el plan:

- **Bug `Locator.evaluate(string)` + `__name` de esbuild (Fase 6).** Pasar un string a
  `.evaluate()` nunca invoca con el elemento resuelto (siempre `undefined`), y el bug de
  `__name` reventaba dentro de `dom-walker.ts` bajo `tsx` aunque no en un script aislado.
  Solución: subir al `<table>` ancestro por XPath `ancestor::` sobre el locator, **cero
  código in-page**. Consolida la regla: *donde haya API nativa de Playwright, no metas
  código en la página* (más fuerte que "emítelo como string").

- **K0.18 — `started_empty` mide CONTENIDO, no interactivos.** La trampa de K0.17 volvió
  a morder en fixtures sin elementos interactivos, y el primer arreglo fue un *botón
  fantasma* en el fixture — que escondía un coste real: una pantalla estática rica en
  contenido pero sin controles (informe, tabla de resultados, confirmación de solo texto)
  arrancaba sin interactivos y, al no volver a mutar, pagaba el timeout completo en cada
  paso. Corregido en el producto: `hayContenido = interactivos > 0 || innerText no vacío`.
  Una tabla con filas cuenta como "la página arrancó"; solo el documento genuinamente en
  blanco (SPA sin montar) espera la mutación. Botones fantasma retirados de
  `tabla-simple.html` y `virtual-scroll.html`; el banco vuelve a ser fiel. Los tests de
  `pantalla-vacia.html` (nunca monta → reportado) y `spa-lenta.html` (monta tarde →
  espera) siguen verdes: la regla correcta se preserva.

- **Debounce 300→1500 ms (Fase 5), salvedad de cobertura.** Se subió el debounce del par
  falsable tras verlo fallar una vez bajo suite completa (jitter de IPC con 13 ficheros
  en paralelo), y se retiró de ese fichero el test de `debounced:true` con default 300 ms
  (queda a nivel unitario). Riesgo asumido: el par falsable ya no prueba la temporización
  ajustada; verificar que el unitario cubre el caso 300 ms.

## 10. K0.19 — tier anclado en la escalera determinista (descubierto en onesait)

Primer ciclo del loop de campo contra onesait real. El login fallaba con **cualquier**
hint: el probe del DOM mostró la causa exacta — `id="username"`/`"password"`,
`name="j_username"`, pero **sin `label for=`, sin `aria-label`, sin `placeholder`**. El
nombre accesible es vacío (la app rompe el contrato de accesibilidad), así que
role/name/label devuelven 0. La única seña que coincide con el vocabulario del FD
("Usuario") es el **texto visible en la celda hermana** (`nearby`).

Diagnóstico honesto: no es un bug del walker ni de onesait específicamente; es la clase
**label-en-celda** (JSF/JSP/legacy), y nuestra escalera determinista no la cubría — el
tier `anchored` existía solo en el camino asistido (`buildFallbackCandidates`), nunca en
`resolveHint`. Es el hueco nº 5 anotado en K0.17.

Arreglo genérico (`resolveAnchored`): último peldaño de `resolveHint`, tras fallar la
escalera semántica. Con un hint `{label:'X'}` (o text/name), trepa desde el texto visible
"X" a su contenedor (`row`/`listitem`/`group`) y coge el control único de dentro,
**control-agnóstico** (input de texto, de contraseña —que NO tiene rol textbox—, select o
textarea resuelven igual). Dos pasadas: literal y accent-insensitive. Regla dura intacta:
≥2 controles en el contenedor → `uniqueOrNull` se planta, no adivina.

Disciplina anti-sesgo: validado contra un fixture sintético de la CLASE
(`login-sin-label.html`, no una copia de onesait), con par falsable — `getByLabel`/
`getByRole({name})` crudos devuelven 0, la escalera del walker resuelve. Cero cadenas de
onesait en el código. El re-run de onesait es confirmación de campo, no el gate. La clase
ya era conocida genéricamente desde K0.11 (`form-sin-identidad.html`); esto **completa**
una capacidad que solo vivía en el asistido, no inventa una para el cliente.

Arquitectura reafirmada: **escalera genérica** (cubre lo bien construido + las roturas
comunes de a11y como esta) **+ memoria por cliente** (el `#username` estable de onesait
es material de alias, capturado una vez, no de código). Ninguna de las dos es específica
de onesait.

Guion CP001 actualizado: login a `{label:'Usuario'}`/`{label:'Contraseña'}` (vocabulario
FD, resuelto por el tier anclado). Pendiente el `value` real del `<input type=submit>`
para fijar la hint del botón (su nombre accesible ES el `value`).

No construido, siguiente rung probable del mismo loop: soporte `getByPlaceholder` en la
escalera (hoy el contract lo declara y `PRIORITY_TO_KIND` lo ignora) — para la clase
"solo placeholder" de Material/React, cuando aparezca un target que la ejercite.

## 11. K0.20 (A+B) — el panel deja ver, editar y re-capturar el locator

Feedback de campo del QA: el panel resuelve el paso atascado y dice por qué no se
encontró, pero no dejaba **corregir**. Rationale de fondo, y es la tesis de
reconciliación: *la página es la fuente de la verdad; los planes y DF quedan
desactualizados.* El panel debe dejar afinar contra la realidad.

La trampa nombrada y evitada: "capturar todo a mano" es codegen. Lo que lo diferencia
—y la línea que no se cruza— sigue siendo: (1) el walker intenta primero, solo lo que no
resuelve cae a la mano; (2) captura al guion **estructurado** (roles/labels/aliases),
no a selectores crudos; (3) **aprobación, no aplicación ciega** — el `assist-patch.json`
nunca se aplica solo; (4) la salida final debe ser el informe de reconciliación (esto
es D/R1, decisión aparte, no en A+B).

Alcance elegido por el QA: **A+B** (no el pivote a grabador completo).

- **A — ver y editar el locator.** El panel muestra ahora la CADENA del locator en cada
  fila (antes solo el badge de calidad). Botón ✎: el QA teclea un locator y se **valida
  en vivo** contra el DOM (tercer puente `__qaAssistResolve`: cuenta coincidencias, exige
  único) antes de aceptarlo. Aceptado → `manual_locator` en el elemento, tier `manual`,
  AUTORITATIVO: `locatorForPicked` lo usa y solo ese (si no resuelve único, badge en rojo
  y el QA lo corrige — no se cae a la escalera a escondidas, porque el QA eligió).
- **B — re-capturar una fila.** Botón ⟳: el siguiente señalamiento **sustituye** esa fila
  en su sitio (conservando su marca objetivo/comprobación), en vez de añadir otra. Antes
  solo se podía quitar (×) y volver a empezar.

`manual_locator` viaja en el envío (`AssistSubmission.sequence`) y de ahí al parche, así
que un locator corregido a mano se funde en el guion como cualquier otro paso — con la
misma revisión humana. Conducible por el canal `qa-assist-cmd` (`{edit:{row,locator}}`,
`{recapture:row}`), que es como lo prueban los tests contra el shadow-root cerrado.

Par de tests (fixture menú hover, DOM vivo): editar vía cmd valida en vivo y el
`manual_locator` llega a Node solo en la fila editada; re-capturar sustituye en su sitio
(2 filas, no 3). 20/20 en `assist-overlay.test.ts`.

No construido, y consciente: **C** (añadir un paso que el plan no tenía → inserción en el
patch + aprobación) y **D/R1** (grabador de caso completo con la página como fuente de
verdad, construido como reconciliación). Ambos son decisión deliberada aparte, con su
propia spec — no se cuelan por la puerta de atrás en A+B.

## 12. K0.21 — el tier anclado, corregido contra el DOM real (mi fixture era infiel)

Primer run del CP001 contra onesait con el tier anclado de K0.19: **s1/s2 (usuario,
clave) NO resolvieron** ("hint irresoluble"). El probe del `outerHTML` dio la causa —y me
delató—: onesait no usa tabla, usa `<form><div><h5>Usuario</h5><input title="username"
...></div>`. Mi fixture de K0.19 (`login-sin-label.html`) era una `<table><tr><td>`, y el
tier anclado trepaba a `role="row"`/`listitem`/`group`. Un `<div>` pelado no tiene rol →
el anclaje no encontraba contenedor. **Fixture infiel: validé contra una estructura que
no era la real** — justo el sesgo que el QA advirtió.

Además, los campos tienen `title="username"`/`"password"`, que SÍ es nombre accesible:
por eso el guion viejo con `name:'username'` funcionaba. Pero el FD dice "Usuario" (el
`<h5>` visible), y el salto FD↔title es lo que hay que puentear por la etiqueta visible.

Corrección (K0.21): el tier anclado **deja de depender de roles ARIA de contenedor**.
Desde el elemento de texto más interno que coincide (`.last()` en orden de documento),
coge el primer control que SIGUE a la etiqueta (`following::input|select|textarea`) —el
patrón label-antes-de-control, universal, cubre div-hermano y celda-hermana igual— con
fallback al control único del ancestro común. Control-agnóstico; `uniqueOrNull` se planta
ante ≥2. Fixture reescrito **fiel al DOM real** (div>h5+input, con `title`); el test
documenta la sutileza: `getByRole({name:'username'})` SÍ resuelve (por el title) pero
`{name:'Usuario'}`/`getByLabel('Usuario')` dan 0 — el tier anclado puentea desde la
etiqueta visible del plan. Botón del CP001 corregido a `value="Login"` (no "Acceder").

Lección de método, cruda: un fixture que no reproduce fielmente la estructura del target
da un verde que miente. El loop de campo lo cazó — por eso onesait es la fuente de
descubrimiento y el fixture solo la red de regresión, nunca al revés.

## 13. K0.22 — el QA tiene la última decisión: el panel salta también en postcondición fallida

Tras K0.21 el login resolvió solo (5/31 → 11/31). El nuevo bloqueo fue el menú de 3
niveles: `s6` salió `postcondition_unmet` — resolvió y clicó, pero no navegó a "Número
Póliza". Con `--assist` el panel **no** saltaba ahí: hasta ahora la asistencia solo se
disparaba en fallo de resolución o `action_failed` (excepción), no cuando un paso
"funcionaba mecánicamente" pero no surtía efecto.

Decisión del QA: *el modal debe saltar siempre que un paso no logre lo esperado; el QA
tiene la última palabra.* Implementado: `postcondition_unmet` en un paso de acción abre
el panel con `--assist`, con nota explicativa ("resolvió y se ejecutó pero '<texto>' no
apareció — ¿camino equivocado? enséñame, o marca drift"). Es la reconciliación contra la
página: cuando el plan está desactualizado, el QA corrige contra lo que hay.

**Salvaguarda innegociable (endurecida en el ciclo):** la corrección del QA solo se
RE-EJECUTA si el paso es `isRetrySafe` (navegación/idempotente declarada). Al principio
puse `canReexec = huella-intacta || safe` y lo corregí a `canReexec = safe`: "huella
intacta" puede ser falso negativo (la acción mutó el backend sin cambiar la UI), y
re-disparar un "Finalizar" crearía una segunda declaración. Una acción de negocio ya
disparada NO se re-ejecuta ni con el panel abierto — su corrección se captura al parche
para el próximo run. El menú (`s6`, `retry_safe: true`) sí se re-ejecuta en vivo; un
"Finalizar" sin marcar, no.

Límite honesto: `expect_text`/`expect_state` (aserciones puras) siguen siendo hallazgos de
drift, no abren el panel — no hay elemento que señalar, el panel captura locators, no
presencia de texto.

Test de la guarda sin conducir el panel: con `--assist` y timeout corto, un paso de
negocio con postcondición imposible abre el panel, expira, y el contador del fixture
queda en `Creados: 1` — la mutación no se re-dispara pese a `--assist`. El flujo
interactivo completo (señalar el camino y que re-ejecute) lo valida el run de campo; queda
debido un test que conduzca el panel dentro de un run del walker.

## 14. K0.23 — el `<select>` nativo resuelve contra las opciones REALES (drift de mayúscula, descubierto en onesait)

Run de campo de CP001: con el login ya autónomo y el menú atravesado, el walker se colgó
en `s11` (`select` "Tipo Prestación" = "Rescate Total") con `locator.selectOption: Timeout
10000ms exceeded`. Hipótesis inicial (mía): `<select>` oculto tras una fachada (patrón
PrimeFaces/Material). **Falsa.** Un probe de solo-lectura en la consola sobre la pantalla
parada lo desmintió: el control es un `<select>` nativo, visible y accionable, con
`options: ["", "Rescate total"]`. El guion pedía "Rescate **T**otal" (mayúscula del FD) y
la página ofrece "Rescate **t**otal". `selectOption()` hace match EXACTO por value/label;
sin calzar, Playwright reintenta hasta agotar el tope → timeout opaco. Drift de mayúscula
FD↔app, de libro. (El probe evitó arreglar a ciegas algo que no era — la disciplina de
"verificar, no adivinar" pagó.)

Fix (genérico, no onesait): la rama nativa de `selectSmart` deja de hacer `selectOption`
a ciegas. Lee las opciones REALES del `<select>` y resuelve contra ellas — exacto primero;
si no, normalizado (`normalizeText`: accent + case + espacios, el mismo de la escalera) a
**una única** opción. Con dos que normalizan igual → se planta ("ambigua"); con ninguna →
reporta las opciones reales en el motivo (el drift es evidencia auditable, no se fabrica).
Cuando resuelve por el normalizador (no exacto), lo deja en el audit-log. Igual criterio
que la rama no-nativa (portal). Fixture `mat-select-portal.html` hecha fiel (opción en
minúscula + un `<select>` con dos opciones que normalizan igual); tres tests nuevos: drift
resuelto, ausente reportado, ambiguo plantado.

Límite honesto (fuera de scope, sin evidencia todavía): un `<select>` nativo **oculto**
tras una fachada seguiría dando timeout de accionabilidad con la opción ya resuelta — no lo
tocamos porque no lo hemos visto; se abordará cuando aparezca con un probe que lo demuestre.

## 15. K0.24 — ventana de pasos (`--from`/`--to`) y pausa entre pasos (`--step-delay`)

Petición de campo: más versatilidad al iterar un guion largo — no ejecutar siempre de
cabo a rabo, y poder ir con calma. Dos flags aditivos (los tres opcionales, sin campo
nuevo en el guion):

- `--to=<id>`: corre desde el principio y **para en ese paso**. Es la vía SEGURA de llegar
  a una pantalla e iterar sin pasar de ella — `--to=s12` en CP001 nunca dispara `s13`
  Finalizar. El `entry` siempre se ejecuta.
- `--from=<id>`: salta los pasos previos y arranca ahí, **asumiendo que el estado ya está**
  en esa pantalla. Límite honesto nombrado con el QA: el navegador nuevo arranca en `entry`
  y en apps con sesión server-side sin deep-link (onesait) NO aterrizará solo en un paso
  intermedio — para corporativo, la forma de llegar a una pantalla es `--to` (correr 1→N),
  no teletransportar. Se descartaron por diseño la pausa-manual-Enter y el replay-saltando-
  mutaciones (este último, además, es imposible tras un Finalizar server-side).
- `--step-delay=<ms>`: pausa fija entre pasos, TRAS el settle. Ritmo y observabilidad en
  `--headed`/demo, NO sincronización — el settle (K0.13) ya sincroniza de verdad.

La ventana se resuelve por flujo antes de navegar a `entry`; un id inexistente falla claro
en el arranque (no se saltan todos los flujos en silencio). Fixture `step-window.html` +
`step-window.test.ts` (5 casos: sin ventana, `--to`, `--from`, rango de un paso, `--step-delay`
no altera qué pasos corren).

Hallazgo colateral (nombrado, no arreglado — fuera de scope): el "resume" existente
(`walk-session.json` + replay) RE-EJECUTA los pasos completados para reconstruir el estado
in-page, y NO salta las acciones de negocio ya disparadas → reanudar un flujo con `s13`
Finalizar completado lo volvería a disparar (segunda declaración). Hoy no muerde porque el
loop de campo borra `.work/` en cada run, pero roza la invariante de mutación; es otra razón
por la que `--from` NO se construyó por la vía del replay.

## 16. K0.25 — la verificación del parche es MUDA (rodaje del panel contra SauceDemo)

Primer rodaje guiado del panel contra un target público (guion saboteado
`saucedemo.rodaje-panel.walk.json`: hint irresoluble, drift de mayúscula en select,
postcondición drifteada, hint ambiguo, guarda de mutación en Finish). Los cinco casos
sembrados funcionaron — y el rodaje encontró un defecto arquitectónico real que onesait
nunca habría dejado diagnosticar: **`verifyAssistPatch` re-ejecutaba los pasos previos del
flujo con el `executeStep` COMPLETO**, con tres consecuencias encadenadas, todas con
evidencia en `.work/rodaje-saucedemo`:

1. **El replay abría paneles de asistencia dentro de la verificación.** Al verificar el
   parche de `s14`, el replay (que había saltado `s7` por bloqueado y estaba en la pantalla
   equivocada) no resolvía `s9` → panel "Paso s9 bloqueado" DESPUÉS del panel de s14. Para
   el QA: incomprensible; y lo respondido ahí escribía estado desde un contexto fantasma.
2. **El replay pisaba el estado del run principal.** `pushReport` sobrescribe por clave →
   los tiempos reales quedaron sustituidos por los del replay (s1 asistido ~15 s → 563 ms);
   `current_screen` quedó pisado → transición registrada con `from` falso (`inventario` en
   vez de `carrito` para s9). El audit-log delató todo: `select drift tolerado` × 3 (una
   ejecución real + dos replays sin marcar).
3. **Saltarse los pasos bloqueados rompía el replay.** `s7` bloqueado era LA navegación al
   carrito; el replay siguió en el inventario y la cascada culpó a pasos inocentes — y de
   propina el tier anclado puenteó el hint ambiguo `Remove` (2 botones) al `<select>` de
   ordenación y lo clicó en silencio (la clase D4, predicha antes del run, observada en él).

Arreglo (flag `verifying`): durante el replay de verificación NO hay panel ni rescate (un
paso que no resuelve = `replay falló: ...`, honesto), NO se toca estado del run principal
(`pushReport`/`blockStep`/`captureScreen`/`recordTransition`/`recordBusinessText` con
cinturón; `current_screen` intacto; respuestas de rescate no se consumen), el audit-log
marca `verifying: true` en lo ocurrido dentro del replay, y un paso previo BLOQUEADO ya no
se salta: la verificación devuelve "no reproducible en limpio: el paso previo sX está
bloqueado" y el parche queda capturado con `verified: false` + motivo. Test
`verify-patch-mudo.test.ts` (3 casos) llamando al método directamente — con `assist: true`
a propósito: si la verificación dejara de ser muda, el panel se abriría en el replay y el
timeout corto delataría la regresión.

**D2 y D4, decididos por el QA ("decídelo tú" → recomendaciones aplicadas):**

**D2 — replay-si-no-muta.** Si el camino previo al paso contiene acciones de negocio
(`click`/`check`/`uncheck` sin `retry_safe`), NO hay replay en limpio (lo re-ejecutaría —
en onesait, verificar un parche tras Finalizar re-crearía la declaración): la verificación
degrada a EN VIVO — objetivo y comprobaciones resueltos contra la página actual, abridores
sin tocar (ya los ejecutó el QA). Garantía más débil y declarada: `verified: true` +
`verify_reason: "verificado SOLO EN VIVO: ..."` en el parche. La minimización (que también
replayea) se desactiva en ese caso — la verificación en vivo pasaría con cualquier
subconjunto y podaría de más.

**D4 — guarda de ambigüedad del ancla.** Primer intento (filtro de nodos-hoja vía
`filter({hasNot})`) FALSADO por probe: `has`/`hasNot` re-rootea incluyendo al propio
elemento → toda coincidencia se excluía a sí misma (0 hojas, el tier muerto; 3 tests lo
cazaron). El mismo probe reveló que el text engine NO matchea a los wrappers (solo al
portador más profundo del texto), así que el anidamiento que justificaba `.last()` no
produce matches múltiples — la guarda correcta es la regla dura de siempre:
`uniqueOrNull(matches)` (visible único = ancla; ≥2 visibles = ambigua → se planta;
duplicado invisible tipo `<option>` lo absorbe el filtro de visibilidad). Fixture
`ancla-ambigua.html` (par falsable: el puente `following::select` EXISTE y la guarda lo
corta) + 3 tests; los 3 de K0.19/K0.21 intactos.

## 17. K0.26 — el `select` no nativo resuelve la OPCIÓN, no el contenedor (PrestaShop falsó el listbox)

**Hallazgo de campo (gira de stacks, sitio 0: tienda PrestaShop).** Guion ciego, paso
`select` sobre el "Ordenar por": el trigger resolvió por texto, pero la rama no-nativa
de la Fase 1 exigía un único `role="listbox"` visible tras abrir — y el menú de
PrestaShop/Bootstrap es un `<ul>` mostrado por clase CSS, sin rol ninguno. Sobreajuste
retroactivo: la Fase 1 generalizó de una muestra de uno (Angular Material, que sí
expone listbox). De propina, el panel asistido tampoco podía enseñar el camino: el
grabador descartaba EN SILENCIO todo elemento de rol `generic` (el QA veía "no lo
registra"), y aunque registrara, `targetAction: 'select'` haría que el parche
re-lanzara selectSmart sobre la opción.

**Fix (dos capas, cero suposición de contenedor).** `waitForVisibleOption` sustituye a
`waitForVisibleListbox`: (1) si el widget SÍ declara un listbox único visible (página
entera + frames), la opción se resuelve SOLO dentro de él — saltarse un contenedor
declarado hacia texto suelto de la página sería adivinar; (2) sin listbox, la opción es
el texto que se hizo visible al abrir, único a nivel de página, exacto primero y
normalizado (accent+case) después, con el mismo audit `select drift tolerado` que la
rama nativa de K0.23. La regla dura decide en ambas capas (único → clic; ≥2 → planta;
0 → drift), y el diagnóstico al agotar el tope distingue `ausente` de `ambigua (N
coincidencias visibles)` para que el informe no mienta. Límite documentado: si el
trigger muestra la opción actualmente seleccionada y el guion pide ESA misma opción,
hay 2 visibles → planta honesta (el panel lo recoge).

**Fix menor del grabador.** El descarte de elementos sin identidad ya no es mudo: un
CLIC deliberado sobre rol `generic` explica el porqué y sugiere contenedor o edición
manual (✎). El hover sigue callado — avisaría en cada wrapper al mover el ratón.

**Validación.** Fixture `dropdown-sin-rol.html` (par falsable: la política vieja agota
el tope esperando un listbox que no existe; la capa 2 selecciona sobre la misma página)
con leyenda-señuelo "Nombre, de A a Z" duplicada fuera del menú que la regla dura
corta. 3 tests nuevos (drift de mayúscula resuelto / ausente reportado / duplicado
plantado) + los 6 de `mat-select-portal` intactos (Material sin regresión). 193/193
unit copilot, tsc limpio. Pendiente de campo: re-ejecutar el guion ciego de la tienda
SIN tocarlo — si s3 resuelve solo, la generalización queda demostrada contra un sitio
que el fix nunca miró por nombre.

**K0.26b — `uniqueOrNull` exige visible también con UNA coincidencia (el re-run de campo
lo cazó el mismo día).** El re-run del guion ciego dio dos datos: `s1` resolvió por
alias-hit (la memoria enseñada en el run anterior pagó — ciclo completo en cliente
nuevo), y `s3` falló ANTES del menú con un error nuevo: `anchored(label:'Ordenar por')
→ locator.click: Timeout`. Causa: el tier anclado puenteó la etiqueta al primer control
que sigue — el `<select>` OCULTO que PrestaShop esconde tras la fachada (la clase
"select oculto tras fachada" que K0.23 dejó como límite sin evidencia; ya la tiene) — y
`uniqueOrNull` con `count === 1` devolvía el locator SIN comprobar visibilidad,
contradiciendo su propio contrato ("único visible"). El walker quemaba el tope clicando
un invisible y el error culpaba a la acción. Fix: único-oculto → null (caer al
siguiente peldaño o al panel ANTES de ejecutar, con "hint irresoluble" honesto).
Fixture `dropdown-sin-rol.html` hecho fiel (etiqueta + `<select hidden>` + fachada) +
test del par falsable (irresoluble sí / Timeout no); anclado 6/6 y Material 6/6
intactos con la regla endurecida. 194 unit copilot (un rojo no reproducido en re-run
completo, sin atribuir — misma firma que el flake de K0.25 bajo suite paralela), tsc
limpio. Nota de campo: el panel tampoco podía enseñar la fachada (rol `generic`, el
aviso nuevo de K0.26 lo explicó en vez de callar) — la salida correcta es reconciliar
el guion con el texto visible real de la fachada, pendiente de que el QA reporte los
textos reales del widget.

## 18. K0.27a — el MARCADOR de peldaños + cierre del ciego de tufarmacia (sitio 0 de la gira)

**Cierre de tufarmacia (probe + reconciliación + run de verificación headless).** El probe
DOM de solo lectura desveló la verdad del "Ordenar por": NO hay select oculto — el trigger
es un `<a class="select-title">` **sin texto, sin nombre accesible y sin href** (solo un
caret), rol efectivo `generic`. Clase nombrada: **"trigger sin identidad accesible"**
(el tema rompe el contrato a11y, como el login de K0.19) — irresoluble por diseño con la
escalera actual; peldaño candidato futuro: *anchored-trigger* (de texto visible al primer
CLICABLE que sigue, misma regla dura). CP01-s3 queda como CENTINELA (`optional`) en el
guion: cuando el peldaño exista, empezará a pasar sin tocar el guion. Las opciones reales
("Ventas en orden decreciente", "Relevancia", "Nombre, A a Z"…) puntúan la predicción
ciega: drifteó (el formato real usa comas, no dos puntos). Run de verificación (headless,
sin panel, rescate LLM respondido con `locator=null` honesto — "el hallazgo real está en
s1"): **4/7** — buscador+Enter y la ficha de producto ENTERA sin asistencia (el par
"Alcohol 96º Aposan 250 ml" → "ALCOHOL 96º APOSAN 250 ML" resolvió por texto), s3
centinela y CP02 bloqueados con diagnóstico veraz.

**Dos clases nuevas con evidencia, nombradas para el próximo ciclo (NO arregladas aquí):**
(1) **texto-exacto-antes-que-substring** — 'Medicamentos' murió en el peldaño de texto
porque el footer contiene "Venta de *medicamentos*…" (substring, 2 visibles → planta),
cuando el match EXACTO era único (el enlace del nav); con exacto-primero CP02 pasa entero.
(2) **el anclado no es para clicks** — tras la planta del texto, `anchored` puenteó la
palabra de negocio a un control de formulario no relacionado y lo CLICÓ en silencio (la
postcondición lo cazó: la red funcionó, pero es la variante VISIBLE de la clase K0.26b);
el anclado existe para "etiqueta → control de formulario" (fill/select/check), un click
no busca inputs.

**El marcador (paso 1 del plan de escala).** `copilot/src/walk-scoreboard.ts`: agrega
`walk-state.json`/`dom-map.json` (el que exista — el run terminado consolida y borra el
state) + `audit-log.json` de N directorios de trabajo → tabla por run (desenlaces,
plantas, asistencias, alias-hits, rescates ±, drift de select) + distribución por
peldaño de resolución. Para eso `StepReport` gana **`resolved_via`** (la cadena que
devolvió la escalera), enhebrado en los pushReport del camino de acción — sin él, un
paso 'ok' no dice si lo resolvió el determinismo, un alias o el panel. Clasificador
puro (`classifyVia`: testid/role/label/placeholder/texto/texto-normalizado/anchored/
manual/css), inmune al prefijo de frame; audit cruzado para alias/asistencias/drift;
JSONL tolerante a líneas corruptas. 5 tests unitarios con artefactos sintéticos.
Primera tabla real sobre los 3 runs de tufarmacia emitida el mismo día.

## 19. K0.28 — el peldaño de texto prueba EXACTO primero, y el anclado no es para clicks

Las dos clases que el guion ciego de tufarmacia dejó nombradas con evidencia (§18),
arregladas en el mismo paso que las produjo: **CP02-s1**, un `click` con hint de texto
`'Medicamentos'`.

**A. texto-exacto-antes-que-substring.** `getByText('X')` es substring, así que la
palabra del menú también matcheaba la prosa del pie ("Venta de *medicamentos* con
receta…"): dos visibles → el peldaño se plantaba, cuando el match EXACTO era único y
era justo el objetivo. El plan de intentos emite ahora **dos** intentos de texto en vez
de uno: exacto y, detrás, substring (y su equivalente en la pasada normalizada: regex
**anclada** `^\s*…\s*$`, porque si no la segunda pasada reintroduce la ambigüedad que la
primera acaba de esquivar). Substring sigue siendo la red — el drift de sufijos ("Total:
12 €" cuando el FD dice "Total") es real y frecuente; lo que cambia es el orden.

No puede cambiar una resolución existente por otra: si el exacto es único, el substring
lo incluye, así que un substring que hoy resuelve único resuelve al MISMO elemento. Solo
convierte plantas en resoluciones. La gramática de locators gana la forma
`getByText('X', { exact: true })` en emisión y en lectura (aliases, `step.locator` y
replay leen lo que la escalera escribe; sin el parser, el peldaño 0 caería en silencio).

**B. el-anclado-no-es-para-clicks.** Al plantarse el texto, el tier anclado (K0.19)
cogía esa misma palabra como ANCLA y saltaba al primer control que la seguía —un campo
sin parentesco con el enlace— y lo clicaba; lo cazó la postcondición, no la resolución.
Es la variante VISIBLE de K0.26b: allí el puente iba a un control oculto, aquí a uno
visible y ajeno. La causa es estructural, no un fallo de guarda: el tier responde a
"¿qué CONTROL etiqueta este texto visible?", y esa pregunta solo tiene sentido cuando el
paso opera sobre un control. `ANCHORED_ACTIONS = {fill, select, check, uncheck, press}`;
`click`/`hover` fuera (su objetivo puede ser un enlace, un botón o una fila) y las
aserciones (`expect_state`) también, porque ahí un puente equivocado no falla: **miente**,
devuelve un veredicto sobre otro elemento. Sin el tier, el paso se planta y sube al
panel — honesto.

Nota de diseño: con (A) dentro, (B) es casi inalcanzable por hints de texto —el ancla
exacta que usaba el tier ahora la consume el peldaño de texto antes— pero sigue siendo
alcanzable con un contract cuya prioridad no incluya `getByText`, y es ahí donde el test
lo demuestra. Las dos capas se sostienen solas.

**Fixture y par falsable** (`texto-ambiguo.html`, reproduce la disposición, no el sitio):
enlace de menú + la misma palabra dentro de la prosa del pie + un buscador DESPUÉS del
enlace en orden de documento (es lo que hace falsable el puente). Siete tests: substring
ve dos / exacto ve uno; el walker resuelve y la postcondición lo confirma con
`resolved_via = getByText('Medicamentos', { exact: true })`; substring sigue funcionando
como red; el puente existe (`following::` llega al buscador); con contract sin `getByText`
el `click` se planta; y **el par falsable de la guarda**: mismo hint, misma página,
cambiando solo la acción a `fill`, el puente SÍ actúa. El test D4 de `anchored-tier`
pasa a `fill` a propósito: con `click` habría quedado un verde que no discrimina.

**Verificación de campo, mismo día, contra la página que produjo la clase**: el guion
ciego de tufarmacia pasa de **4/7 a 6/7** sin tocar el guion. `Medicamentos` resuelve por
el peldaño exacto, CP02 entero en verde (s2 'En stock' nunca había llegado a ejecutarse),
y el único rojo que queda es el CENTINELA documentado de §18 (trigger sin identidad
accesible), fallando exactamente como se predijo. 469/469 tests en verde en la suite
completa —sin flakiness en este run—, tsc limpio.

## 20. K0.29 — gira de stacks, sitio 1 (JSF + Bootstrap): tres defectos del kernel salidos de un run

**El sitio.** PrimeFaces, el sitio 1 previsto, quedó DESCARTADO: `showcase.primefaces.org`
sirve un muro de verificación anti-bot (Cloudflare) al navegador automatizado. Saltárselo
está prohibido y además invalidaría la medición; queda anotado en `allowed-targets.yaml`
para que nadie lo reintente a ciegas. Sustituto de la misma familia: **BootsFaces
Showcase** (JSF 2.x + Bootstrap), con las mismas patologías que onesait — ids generados
(`j_idt194j_idt196Inner`), AJAX parcial, fachadas (select2) sobre controles nativos.

**Protocolo (K0.17), con el sesgo declarado.** Guion ciego escrito mirando solo capturas
de pantalla (nunca el árbol de accesibilidad), seis predicciones por escrito antes de
correr, y una declaración explícita de la contaminación accidental: los mensajes de error
de *strict mode* de Playwright revelaron por el camino que 'SelectOneMenu' aparece dos
veces y que la fachada es select2. Se declara, no se disimula.

**Resultado: 2/7 en el primer run.** De ahí salieron tres defectos, y los tres son
genéricos (ninguno es de este sitio).

**D1 — un estorbo declarado que no se puede descartar ENVENENA el run entero.** El banner
de cookies es la librería `cookieconsent`; el contract lo declaró (`.cc-window`, acierto
del pack: el descarte se disparó) pero la estrategia genérica no puede quitarlo — y no
debe: su único botón es "Accept Cookies", y **aceptar el consentimiento no es decisión del
walker**. Lo grave no era eso, sino lo que Playwright hace después: tras correr el
manejador ESPERA a que el estorbo se oculte, y si no se oculta nunca, toda acción y toda
espera de accionabilidad agotan su tope. Su propio call log lo cantaba: *"locator handler
has finished, waiting for `.cc-window` to be hidden — 19 × locator resolved to visible"*.
Declarar el estorbo era PEOR que no declararlo. Arreglo en tres piezas: `noWaitAfter: true`
(nunca cuelga), **comprobación** después de la estrategia (antes se auditaba "estorbo
descartado" ANTES de intentarlo: el audit afirmaba un hecho que nadie había verificado) y
manejador inerte tras el primer fracaso, para no pagar ni auditar lo mismo en cada acción.
Nota deliberada: el botón de aceptar tiene `aria-label="dismiss cookie message"`; añadir
"dismiss" a la búsqueda de botones de cierre haría que el walker aceptara cookies en
nombre del usuario. **No se añade.**

**D2 — la petición de rescate se pedía a ciegas.** `ariaSnapshot(...).catch(() => '')`
convertía el síntoma de D1 en tres peticiones consecutivas con `aria_snapshot: ""` y ni
una palabra de por qué. Un rescate sin evidencia solo puede responder `null` honesto o
inventarse el locator, y lo segundo es justo lo prohibido. Ahora el error se captura, viaja
en el propio archivo (`snapshot_error`), se audita, y las instrucciones **empiezan** con el
aviso de ceguera (`rescueInstructions`, función pura y por tanto verificable sin navegador).

**D3 — y cuando el snapshot llegó, era todo menú.** Con D1 arreglado la petición traía
3.639 caracteres… de árbol de navegación: el tope de líneas se gastaba entero en la
cabecera y el formulario por el que se preguntaba no aparecía jamás. No estaba vacío,
estaba lleno de lo que no era. `pruneAriaSnapshot` acepta ahora un `focus` (el vocabulario
del hint, y el `value` salvo que sea `secret`): las líneas que lo mencionan entran primero
con su ventana de contexto, el resto rellena en orden de documento, y cada corte se
declara. El tope no sube — sigue siendo una micro-llamada.

**Verificación de campo, mismo día.** Mismo guion ciego, sin tocarlo: **2/7 → 4/7**. El
paso que moría en 10 s de timeout opaco (`menu-lateral/s1`) pasa en **1,06 s**, y la
petición de rescate llegó con el combobox por el que preguntaba delante de las narices.
Los tres pasos que siguen bloqueados lo están por una razón legítima: la página de
showcase repite el MISMO formulario tres veces (3 comboboxes con idéntico nombre
accesible, 6 botones "Submit AJAX"), el guion ciego no decía en cuál, y el walker se
plantó y lo dijo. Con el guion reconciliado —que sí lo dice— el flujo entero va **4/4 sin
rescates ni asistencia**, y con él queda demostrado lo que el ciego no llegó a probar: el
`select` sobre la fachada **select2 de BootsFaces resuelve solo**, o sea que la clase
K0.26/K0.26b generaliza a otro stack.

**Dos clases nuevas, con evidencia dura, NO arregladas aquí.** El 4/4 del guion reconciliado
incluye un **verde falso** y así queda anotado en el propio guion: `expect_text 'Honda'`
pasa, pero un probe de solo lectura demuestra que 'Honda' ya está visible TRES veces antes
de enviar nada, dentro de los bloques `<code>` con que la página documenta su ejemplo — la
aserción se habría cumplido igual si el envío no hubiera hecho nada.
(**F4**) `expect_text` es una búsqueda de texto en TODA la página y puede cobrarse un verde
de cualquier sitio: necesita poder decir DÓNDE (un `hint` que acote). En una app corporativa
el equivalente es el valor que aparece a la vez en el filtro y en la rejilla.
(**F5**) no hay forma de asertar el `value` de un campo de solo lectura, y en JSF
corporativo el resultado calculado vive justo ahí (`brandOutputID2` medido): candidato a
acción `expect_value`. Las dos son de la familia más peligrosa para un producto de QA —
equivocarse **en verde**— y por eso van nombradas con su evidencia en vez de estiradas hoy.

## 21. K0.30/K0.31 — aserciones que no mienten, consentimiento por diseño, y el banco

### F4/F5 — las dos formas de equivocarse EN VERDE

`expect_text` era una búsqueda de texto en TODA la página. En la gira eso se cobró un
verde falso (§20) y la clase es general: en una app corporativa el mismo literal aparece
en el filtro que acabas de rellenar y en la rejilla de resultados. Ahora el paso admite
**`scope`** —el mismo campo que el refiner ya emite desde el FD— y el texto tiene que
estar DONDE dice el negocio. Distinción que se cuida: un ámbito irresoluble se reporta
como tal, **no** como "el texto no aparece"; son dos hallazgos distintos y confundirlos
envenena el informe de reconciliación. Además, cuando la aserción pasa, **dónde** pasó
viaja al informe (`resolved_via`): una aserción que se cumple sin decir dónde es
justamente la que esconde los verdes falsos.

**`expect_value`** (acción nueva): el resultado calculado de las apps corporativas no es
texto, es el `value` de un campo deshabilitado — importe, prima, número de expediente
(medido: `brandOutputID2`). Compara exacto primero y normalizado después **con apunte en
el audit**, como el resto de la escalera; si el elemento resuelto no tiene valor legible
lo dice tal cual en vez de convertirlo en "no coincide". Entra en `ANCHORED_ACTIONS`
porque su objetivo es por definición un control: es exactamente la pregunta que el tier
anclado sabe responder. `expect_state` sigue fuera, porque su hint puede apuntar a
cualquier cosa.

### Consentimiento POR DISEÑO

El banner de cookies no es una rareza de un sitio: sale en la mayoría de los portales
corporativos. Tratarlo como "estorbo que el client pack declara si acaso" obligaba a
redescubrirlo cliente a cliente y, peor, un selector mal declarado envenenaba el run
entero (§20 D1). El walker ahora lo conoce como conoce las fachadas de los desplegables:
**por FAMILIA de CMP** (OneTrust, Cookiebot, cookieconsent, CookieYes, Quantcast, Didomi,
Usercentrics, TrustArc, Complianz, Borlabs, Iubenda, Termly, Klaro + patrones genéricos
para los CMP caseros, tan comunes en banca). Detección por familia, confirmación por DOM.

Reglas duras, en orden:

1. **Solo se actúa sobre algo SUPERPUESTO** (fixed/sticky, o absolute con z-index alto).
   La sección "Política de cookies" de la propia aplicación fluye con el documento y NO
   se toca. Sin esta guarda, la detección por familia se comería contenido legítimo — y
   un walker que borra contenido de la app bajo prueba no vale nada. Tiene fixture propio
   (`consent-falso-positivo.html`) y es el test que decide si esto es mejora o degradación.
2. **Rechazar antes que cerrar.** Ante un consentimiento, la opción correcta es la que
   menos datos cede. Reconocimiento multilingüe (es/en/de/fr/pt), y el test fija que el
   patrón de rechazo NO matchea "Aceptar" — confundirlos sería el peor fallo de la pieza.
3. **Cerrar / Escape**, con una guarda innegociable: no se pulsa nada que LEA como
   aceptación, aunque su `aria-label` diga "dismiss" (medido en vivo: hay CMP que
   etiquetan así su botón de aceptar; fiarse del aria-label habría otorgado el
   consentimiento creyendo que solo cerraba).
4. **Si lo único que queda es aceptar, NO se acepta jamás.** El consentimiento lo da el
   usuario. El banner se neutraliza localmente (ocultar + devolver el scroll al
   documento), lo que no envía ninguna señal al sitio, y el audit lo dice con esas
   palabras. El flujo sigue; la decisión no se falsifica.

Solo el contenedor más EXTERNO se procesa: los patrones genéricos por `aria-label*=cookie`
matchean también los enlaces de dentro del banner, y en vivo un solo banner producía tres
barridos y tres apuntes. `consent.enabled: false` lo apaga por completo (cuando el banner
ES el objeto de la prueba); `extra_selectors` añade el CMP casero del cliente. Los
contracts de tufarmacia y bootsfaces han perdido su declaración manual: ya no hace falta.

**Evidencia empírica (la regla del trade: mejor en 9, no peor en 1).** Fixtures: banner con
rechazo → rechaza; banner solo-aceptar → neutraliza sin consentir y el flujo sigue;
contenido estático que habla de cookies → intacto. En vivo: tufarmacia mantiene 6/7 con la
declaración manual retirada, y BootsFaces neutraliza su banner real sin consentir. Y una
regresión propia, cazada por el primer run de campo tras escribir la pieza: leer el texto
de un botón de cierre que no existe **no devuelve vacío, espera el tope por defecto (30 s)**;
como el barrido corre dentro de la espera de accionabilidad, una postcondición que sí
estaba en pantalla se declaró incumplida por el reloj (4/4 → 3/4). Arreglado (contar
primero, leer con tope corto) y con test de regresión determinista.

### K0.31 — el banco de resolución (listo para Mind2Web)

`copilot/src/resolve-bench.ts`: corre la escalera **real** del producto
(`DomWalker.forBench`, no una copia — un banco que evalúa una reimplementación mide la
reimplementación) sobre fotografías del DOM (`page.setContent`), offline y a $0, sin
ejecutar la acción (en una página muerta un clic no prueba nada y puede navegar). La
acción del caso sí se declara, porque desde K0.28 decide qué peldaños entran.

Tres desenlaces que **nunca se suman**: `acierto`, `planta` (no resolvió: honesto, va al
panel o al rescate) y **`EQUIVOCADO`** (resolvió otro elemento). La métrica que manda es la
tercera: un walker que se planta mucho es lento, uno que acierta el 95% y falla mudo el 5%
es inservible para QA regulado. El informe la pone en primer plano con el elemento que
resolvió, para poder depurarla, y el CLI sale con código 1 solo por EQUIVOCADO.

Formato de entrada JSONL deliberadamente agnóstico del dataset (`id`, `site`, `task`,
`html`/`html_path`, `action`, `hint`, `scope?`, `target`), para que enganchar Mind2Web —o
un corpus corporativo propio de showcases— sea un trabajo de DATOS y no de código; las
líneas rotas se descartan con aviso en vez de tumbar un corpus de miles.

El corpus mínimo de validación incluye a propósito un caso que DEBE salir `EQUIVOCADO`: un
banco incapaz de detectar un fallo mudo daría 100% siempre y sería peor que no tener banco.
Ese caso se declara **en los datos** (`"expect": "EQUIVOCADO"`), y esa distinción importa:
un control no es una medida, es un termómetro. No puntúa al walker —si contara, el corpus
de autovalidación dejaría una alarma roja permanente y un exit 1 que en CI se lee como
avería—, pero si algún día deja de dar su desenlace, el informe grita **BANCO ROTO** y
declara que la cifra de arriba no es fiable. El CLI sale con error por dos motivos, no por
uno: un `EQUIVOCADO` real del walker, o un control incumplido.

## 22. K0.32 — el capturador de corpus: cada walk deja banco

El banco de §21 funcionaba y estaba vacío. Lo que le faltaba no era código, eran páginas:
cada visita a un sitio real se perdía al cerrar el navegador, así que los hallazgos eran
anécdotas de un día en vez de regresión permanente. Con `--capture-corpus=<dir>`, todo
walk fotografía el DOM en el instante en que la escalera resolvió y emite casos listos
para el banco.

**De dónde sale la VERDAD (lo único que decide si esto sirve).** La tentación evidente es
anotar como verdad el elemento que el walker resolvió. Eso sería **medirse a sí mismo**:
el banco daría 100% por construcción, incluidos los casos en los que la escalera se
equivocó en silencio, que son justo los que hay que cazar. Solo entran casos con una
corroboración **independiente de la escalera**:

- **humana** — el QA señaló el elemento en el panel o escribió el locator (la más fuerte);
- **postcondición del FD cumplida** — se actuó sobre el elemento y la app respondió con el
  resultado de negocio esperado. No prueba que ese elemento sea el único canónico, pero sí
  que la acción logró lo que tenía que lograr, que es la noción de acierto que le importa
  al banco. Es el mismo criterio con el que un rescate se promueve a alias (K0.5).

Todo lo demás va a `pendientes.jsonl` **con su motivo y con el locator que usó el walker**,
para que el QA lo promueva a mano si quiere. La decisión vive en `corpusVerdict`, función
pura y por tanto verificable sin navegador: es el criterio, no un detalle de implementación.

**El objetivo se marca DENTRO de la foto** (`data-corpus-target`), no con un selector
reconstruido a posteriori: un atributo inyectado en el HTML serializado no puede volverse
ambiguo ni caducar. Y la foto se toma ANTES de ejecutar la acción, porque el DOM sobre el
que hay que medir la resolución es aquel en el que se resolvió.

**La lección que costó el primer corpus real, y que afecta a Mind2Web.** El primer volcado
de tufarmacia dio 3 casos con verdad… y el banco solo acertó 1: **dos casos que resolvían
EN VIVO se plantaban sobre su propia fotografía**. Misma causa en los dos: las hojas de
estilo son peticiones externas que la foto no lleva, y sin CSS lo que estaba oculto pasa a
estar visible — donde en vivo había UNA coincidencia visible, offline había dos, y la regla
dura se plantaba. La visibilidad no es cosmética para este walker: es carga estructural de
la regla. Así que la foto tiene que llevarla dentro: al capturar se marcan los elementos
que están ocultos en ese instante y se inyecta una regla que los mantenga ocultos sin
depender de ningún CSS externo (aplicarlo en vivo no cambia nada de lo que se ve —solo se
marca lo ya oculto— y se retira tras serializar). Con el congelado, el mismo corpus pasa a
**3/3 acierto, 0 EQUIVOCADO**: la foto reproduce el comportamiento en vivo.

Esto es un aviso metodológico para el corpus externo: los volcados de Mind2Web tampoco
traen CSS. Medir cualquier resolvedor que use visibilidad sobre HTML crudo sin reconstruir
la visibilidad da una cifra que no significa lo que parece. Fixture propio de la clase
(`corpus-css-externo.html` + hoja externa) con el par falsable sobre la MISMA foto:
quitándole el congelado hay 2 coincidencias visibles, con él 1.

**Apagado por defecto, y no por comodidad**: una foto es el HTML CRUDO de la pantalla, con
lo que hubiera dentro. Contra un entorno con datos reales eso es una decisión del QA, no un
efecto colateral de correr el walker (regla dura #6) — por eso la bandera es explícita y el
arranque avisa con esas palabras. Los corpus van a `.work/` (ignorado por git): publicar el
HTML de un sitio de terceros es otra decisión, y tampoco la toma el walker.

**Límites honestos**: `page.content()` serializa solo el documento principal, así que los
pasos resueltos dentro de un iframe se excluyen con ese motivo; y el rendimiento del corpus
depende de que el guion declare postcondiciones — un guion sin `expect_after` produce cero
casos con verdad, lo cual es correcto y además es el incentivo que ya empuja el check
`MF-postcondition`.

## 23. K0.33 — gira de stacks, sitio 2 (SAP UI5): el peldaño exacto no era solo del texto

Sitio 2 de la gira: **SAP UI5 1.151**, la familia de los back-office de seguros y los
portales de banca construidos sobre SAPUI5/Fiori. Objetivo: la app de demostración
*Shopping Cart* del Demo Kit — una aplicación UI5 completa (maestro-detalle, buscador,
carrito), no una página de documentación. Protocolo de guion CIEGO (K0.17): hints con solo
vocabulario visible en pantalla, predicciones por escrito antes de correr, guion intocado
entre la escritura y el run (`copilot/fixtures/openui5-ciego.walk.json`, con la declaración
de sesgo y las ocho predicciones dentro del propio fichero).

**Primer run: 10/13 pasos — y dos de esos diez eran mentira.** Esa es la lectura que
importa, no la cifra. El detalle salió de cuatro probes de solo lectura posteriores al run;
ninguna causa se dio por supuesta.

### D1 — el peldaño EXACTO no era solo del peldaño de texto

K0.28 puso el intento exacto delante del substring en `getByText`. Faltaba ver que
`getByLabel` y `getByRole({name})` **también matchean por substring**. El buscador del
catálogo tiene `aria-label="Search"` y vive dentro de una región etiquetada *"Product
Catalog Search and Navigation"*, que contiene la palabra: `getByLabel('Search')` devuelve
DOS y el paso se plantaba. Con el exacto delante, una.

El argumento de seguridad es el mismo de K0.28, palabra por palabra: si el exacto es único
está dentro del conjunto del substring, así que un substring que hoy resuelve único resuelve
al MISMO elemento. No puede cambiar una resolución por otra — solo convierte plantas en
resoluciones. La forma exacta se emite y **se relee** (aliases, `step.locator`, replay), y en
la pasada normalizada va como regex ANCLADA, o desharía el peldaño.

### D2 — un hint de NOMBRE no puede terminar en un substring de TEXTO

El peor hallazgo de la gira. El icono del carrito es un botón solo-icono; el hint del guion
era `{name:'Cart'}`. Sin `role` no se emite intento de rol, así que la escalera cae al
peldaño de texto: exacto → cero, substring → **una** coincidencia visible... el botón "Add
to Cart". El walker resolvió, pulsó, reportó `ok` y **añadió una segunda unidad al
carrito**: EQUIVOCADO con duplicación de negocio, que es exactamente lo que este componente
existe para no hacer. Nada lo cazó porque el paso no llevaba postcondición.

El arreglo no es "substring es peligroso" — para `text` sigue siendo la red que absorbe el
drift de sufijos ("Total: 12 €" desde 'Total'). Es que aquí se encadenan DOS saltos: se
cambia de atributo (nombre accesible → texto visible) y además se afloja el matching. Con el
atributo ya sustituido, la única comparación defendible es la exacta. Si el FD quería decir
"el texto que se ve", el guion tiene `text` para eso.

Y una regla dura nueva, hermana de esta: **la ambigüedad no se repara descendiendo de
peldaño**. Cero coincidencias significa "este vocabulario no describe al elemento aquí" y
tiene sentido probar otro peldaño; dos o más significa "la palabra del guion designa a
varias cosas", y ningún peldaño más flojo puede arreglar eso — solo elegir una por su
cuenta. La escalera para y el paso sube al panel, que es donde un humano desambigua.
Honestidad sobre esta regla: **en este run no salvó ningún caso**; su evidencia es
estructural y su coste medido fue cero (ningún banco con navegador se degradó).

### D3 — el verde falso que se apoyaba en un cartel

La postcondición "el producto está en el carrito" llevaba `scope: {name:'Shopping Cart'}`, y
resolvió al `MessageToast` que la app acababa de mostrar: *Product "Astro Laptop 1516" added
to your shopping cart* — un elemento que contiene A LA VEZ el nombre del ámbito y el texto
buscado. La aserción pasó en verde **sin que el carrito llegara a abrirse**. No probó que el
producto estuviera dentro: probó que salió un cartel diciéndolo. Es §20 en su forma más
traicionera, porque el aviso repite el hecho de negocio con las mismas palabras.

D2 lo mata en esta instancia (con solo el intento exacto, el toast ya no matchea). Se
consideró y **se descartó** una guarda estructural que prohibiera que un `role=alert` /
`aria-live` fuera ámbito: "en el mensaje de error aparece X" es una postcondición legítima,
y no hay ninguna instancia medida que sobreviva a D2. Queda **nombrada, no arreglada**.

### D4 — el consentimiento: dos puertas, no una

El CMP del Demo Kit es **TrustArc**, que ya estaba en el catálogo de familias, y su banner es
`position: fixed`. Aun así el run terminó con **cero apuntes de consentimiento y el banner
intacto**: un fallo por silencio, no por rojo — el modo de fallo que este componente tiene
prohibido. Dos causas encadenadas, las dos genéricas:

1. **El momento.** El barrido iba pegado al `goto`, y los gestores de consentimiento se
   cargan asíncronos: medido, el banner aparece a 1,95 s, mucho después. Después nada volvía
   a mirar, porque el `addLocatorHandler` solo dispara en comprobaciones de accionabilidad.
   Arreglo: barrer también **al final de cada settle** — ahí no cuesta nada (la pantalla
   acaba de quedarse quieta, o sea que el CMP ya se inyectó) y llega antes de actuar.
2. **"El más externo" no es "el banner".** TrustArc cuelga su barra de un envoltorio
   `div#consent_blackbar` de **altura cero**; el banner real (`#truste-consent-track`,
   1442x126) es hijo suyo. La regla de K0.30 elegía el envoltorio, la puerta de visibilidad
   lo descartaba —bien, no se ve— y el banner se saltaba por anidado. Las dos reglas juntas
   dejaban el CMP en pie. Arreglo: un ancestro solo tapa a su hijo **si él mismo se ve**.

Verificado en el sitio real: `banner de consentimiento descartado ... por rechazo:
DIV#truste-consent-track`. Rechazado, nunca aceptado, y auditado.

Límite residual conocido y aceptado: una página en la que el guion no da ningún paso (la de
entrada, en este guion) no se barre. Es inocuo —se abandona sin tocarla— y arreglarlo
costaría una espera fija en CADA navegación.

### Un verde falso en mi propio banco

Al quitar el substring del peldaño alimentado por `name` (D2), un test de `expect_count` que
llevaba verde desde la Fase 6 se puso rojo. No era una degradación: con la búsqueda sin
resultados la tabla se OCULTA, así que el ámbito `{role:'table', name:'Declaraciones'}` no
existe en pantalla — pero el plan caía al intento `getByText('Declaraciones')` y resolvía el
ámbito al `<h1>Consulta Declaraciones</h1>`. Contar filas dentro de un titular da 0, y ese 0
pasaba por "incumplido": **la respuesta correcta por el camino equivocado**, dentro del
banco que usamos para detectar justo eso. De paso, `resolveCollection` mezclaba "no encontré
DÓNDE contar" con "no sé en CUÁL contar" bajo la misma frase; ahora son dos diagnósticos,
por el mismo principio que separó ámbito-irresoluble de texto-ausente en K0.30.

### Resultado en campo, con el mismo guion ciego sin tocar

| | primer run | tras los arreglos |
|---|---|---|
| pasos `ok` | 10/13 | 10/13 |
| de los cuales, EQUIVOCADO | **1** (pulsó "Add to Cart" creyendo abrir el carrito) | 0 |
| de los cuales, verde falso | **1** (aserción contra el toast) | 0 |
| flujo del buscador | 1/4 (hint irresoluble) | **4/4** |
| flujo del carrito | 3/5, dos de ellos mintiendo | 2/5, los tres rojos honestos |

La cifra no se mueve; lo que cambia es cuánta de ella es verdad. Los tres rojos que quedan
dicen cosas distintas y correctas: el hint `{name:'Cart'}` es genuinamente ambiguo y sube al
panel, el ámbito declarado no se encuentra, y el total no está porque el carrito nunca se
abrió. Un walker que se planta es lento; uno que se equivoca en silencio es inservible.

### Predicciones del guion ciego, puntuadas

P1 (consentimiento) acertó el desenlace y falló la causa: predije "falta la familia" y la
familia estaba — fallaban el momento y la regla del envoltorio. P3 (maestro-detalle) exacta,
incluido el peldaño por el que resolvió. P4 (buscador) acertó el desenlace —fallo honesto, no
timeout— y **falló la causa**: predije el hueco de `getByPlaceholder` de K0.19 y era el
substring del nombre. P5 (icono) resolvió por una rama que no había escrito: no era ni que
resolviera ni que se plantara, es que resolvía OTRA COSA. P6 (ámbito) predije dos salidas y
ocurrió una tercera, la peor. P7 (total) falló: el literal era exacto, el rojo venía de D2.
Dos aciertos limpios de ocho: el guion ciego sigue ganándome, que es justo para lo que está.

### Lo que NO se tocó, y por qué

`getByPlaceholder` sigue declarado en el contract e ignorado por `PRIORITY_TO_KIND`: la
predicción P4 apuntaba ahí y la evidencia dijo otra cosa, así que sigue sin instancia medida.
El peldaño *anchored-trigger* (el "Ordenar por" de PrestaShop) tampoco: en UI5 el botón
solo-icono **sí** tiene nombre accesible ("Show Shopping Cart"), o sea que esta familia no
reproduce la clase y sigue con muestra de uno — no se construye. El Style Contract de
`openui5` se dejó **sin bloque `settle`** a propósito, pese a que UI5 tiene una señal de
ocupado conocida (`sapUiLocalBusyIndicator`): declararla antes de medir habría sesgado el run
— no sabríamos si el walker se sincroniza solo o si lo hizo la pista. No hizo falta: cero
`settle_timeout` en los dos runs.
