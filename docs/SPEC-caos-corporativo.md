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
