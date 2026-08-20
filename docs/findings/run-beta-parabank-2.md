# El segundo run de campo: el walker abandonado en el minuto diez

- **Fecha**: 2026-08-18
- **Rama**: `design/kernel-v2` (run con `0.4.0-beta.2` instalado)
- **Workspace**: `prueba-beta2/`, instalación limpia — Vía A, cache del plugin reinstalada
- **Operador**: el QA, conduciendo el agente; sin acceso al código fuente durante el run
- **Target**: `https://parabank.parasoft.com/` (S3, mismo FD en markdown libre)
- **Contract**: `parabank-fd.yaml` heredado del run anterior (`walker.enabled: true`,
  `rescue_budget: 0`, `assist: true`) — `/setup` no se volvió a ejecutar
- **Duración**: 1h 14m 29s

Este run existía para probar tres cosas de K0.43 y K0.44: que el refiner emite un guion válido
a la primera, que la memoria sobrevive a un run cuya postcondición falla, y que el panel
reaparece cuando una navegación se lo lleva.

**Solo la primera se probó.** Las otras dos no llegaron a ejecutarse, y el motivo de que no
llegaran es el hallazgo del run.

> **Salvedad de método.** Este informe se apoya en el transcript de la sesión pegado por el QA,
> no en telemetría. Los tiempos salen de los propios cronómetros que el harness imprime; las
> llamadas a herramienta aparecen colapsadas, así que la ausencia de un paso en el relato no
> demuestra que no se ejecutara. Lo que sí está verificado contra el código va marcado.

---

## Lo que sí se confirmó: K0.43

El refiner emitió `walk-script.json` con el esquema correcto —`flow`, `criteria`, `id` en cada
paso, `target` en el `goto`— y el walker arrancó sin ronda de corrección. El defecto que en el
run anterior rompía el camino insignia en **cada** ejecución de S3 está cerrado con dato.

Es lo único que se confirmó.

> **Corrección.** La primera versión de este informe decía que `logout/s1` salió como
> `{role:'link', name:'Log Out'}` en inglés porque *"donde el FD cita un literal, el refiner lo
> respetó"*. **Es falso, y lo desmiente el propio FD.** `template/examples/02-parabank/parabank-fd.md`
> son 46 líneas de prosa **sin una sola comilla**: no cita ni un literal, en ningún sitio. Sobre
> el cierre de sesión dice literalmente *"el cliente debe poder cerrar su sesión"*. De ahí a
> `name: 'Log Out'` no hay cita: hay **fabricación de un caption**, que es exactamente lo que el
> prompt del refiner prohíbe. Acertó por casualidad. Ver D14.

---

## Dónde se fueron los 74 minutos

| Bloque | Tiempo | Qué es |
|---|---|---|
| Esperando al `discovery-analyzer` | **~27 min** | El agente corrió 3m 24s |
| Panel asistido que nadie atendió | **10 min** | Timeout exacto: 08:51:44 → 09:01:44 |
| Writers (W1 escalonado + W2/W3 en paralelo) | ~14 min | LLM |
| Refiner | ~9 min | LLM |
| Trabajo determinista (walker, 4 runs de Playwright, probes MCP, ficheros) | ~14 min | |

**El walker no es el coste.** Su segunda pasada hizo 8/12 pasos y emitió un spec en segundos.
El run se lo comen los subagentes LLM (~23 min) y **~30 minutos de espera muerta**.

---

## D11 — El diagnóstico falso que costó el run

El orquestador escribió, textualmente:

> *"No es que el hint esté en español y la app en inglés — es que no hay label que resolver."*

Es falso, y lo desmiente nuestra propia medición sobre esa misma página. El DOM es
`<p><b>Username</b></p>` seguido de `<input name="username">`: texto visible y a continuación un
control. Es la forma exacta para la que existe el tier `anchored` (K0.19/K0.21). En el run de
K0.43, con los literales corregidos y **sin tocar nada más**, esa pantalla dio 8/9 pasos y
0 rescates resolviendo por `anchored(label:'Username')`.

La única causa del bloqueo era el hint en castellano. El arreglo costaba cero.

Lo que hizo en su lugar: rescate MCP con el navegador y escritura a mano de
`config/hint-aliases/parabank-fd.json` con locators **CSS**. Tres consecuencias, en orden de
gravedad creciente:

1. Pagó tokens y reloj por algo que el walker resuelve gratis.
2. **Envenenó la memoria durable.** Esos alias quedan cementados sobre claves en castellano
   (`nombre de usuario`) que el refiner no debería volver a emitir una vez arreglado D14, y con
   locators CSS en lugar del vocabulario semántico. Nacen muertos, y `hint-aliases` es
   precisamente el artefacto que se versiona y se revisa en PR.
3. **Arregló un solo flujo.** Transfer y bill-pay se quedaron con los hints en castellano y el
   walker se abandonó. De ahí salen los 14 minutos de Writers: tres de los cuatro RF cubiertos
   fueron por LLM por una decisión, no por una limitación.

El giro es especialmente caro porque el mecanismo correcto ya estaba en marcha: el panel
asistido estaba abierto en `login/s2`. Contestarlo habría producido el alias por la vía buena
—`source:'human'`, K0.44— en vez de a mano y en CSS.

## D12 — El panel se abrió y nadie se lo dijo al QA

**Verificado contra el código**: `copilot/src/dom-walker.ts:5147` hace
`headed: (values.headed ?? false) || assist`. `--assist` fuerza navegador visible. El panel se
abrió de verdad, en una ventana real, con la aplicación delante. El QA estaba al teclado.

Nadie se lo dijo. El orquestador lanzó el walker como una llamada de shell con la salida
buffereada (`Select-Object -Last 60` no emite hasta que el proceso termina), no vio nada, y leyó
el silencio como cuelgue. Diez minutos, y luego lo mató.

Eso no es solo tiempo perdido: **es el run entero de la prueba de K0.44/D3**, que se prueba
cuando el QA señala con el ratón y el alias se promueve con `source:'human'`. Ese momento
existió, duró 600 segundos y se perdió.

El command dice `[--assist si walker.assist]` y no dice nada más. Falta la línea que instruya al
orquestador a **anunciar el panel y ceder el turno**. `/setup` ya pregunta *"¿hay alguien
delante?"*; el valor se guarda y luego nadie avisa a ese alguien.

## D13 — Los subagentes en background, y ~30 minutos de espera muerta

El command lo prohíbe en mayúsculas: *"Writers SIEMPRE en foreground: pasa
`run_in_background: false` EXPLÍCITO en cada Task/Agent"*. El orquestador reportó —con
honestidad, sin disimularlo— que el Agent de ese harness no expone el parámetro.

La regla tenía razón y el coste de no poder cumplirla está ahora medido: **40% del run**. El
caso más claro es el `discovery-analyzer`, que corrió 3m 24s con el orquestador esperando 27m 21s
su notificación.

Lo estructural, que es lo que importa: la regla instruye al **orquestador** sobre los argumentos
de una herramienta. Es una instrucción a un LLM sobre cómo llamar a algo, y el producto no puede
imponerla ni verificarla. Es la familia D2 otra vez, con el agravante de que aquí ni siquiera es
declarativo — depende de qué exponga el runtime del día.

**No es un problema de superficie.** El default del Agent tool es background en Claude Code, y lo
sigue siendo. Cambiar de terminal a otra interfaz no lo arregla; lo que lo arregla es necesitar
menos subagentes, que es exactamente lo que el walker existe para conseguir.

## D14 — «Citar y no traducir» no tiene dientes

Esta es la causa raíz, y no es que el refiner desobedeciera: **es que obedeció**.

El prompt (`.claude/agents/ia4d-spec-refiner.md`) dice:

> *"Where the FD only describes ('el botón de envío'), use the description and lower `confidence`
> on that criterion — do NOT invent a caption, and above all do NOT translate it."*

El FD de ParaBank **describe y no cita**. Así que el refiner usó la descripción, que está en
castellano, contra una aplicación en inglés — obedeciendo la instrucción al pie de la letra— y
bajó el `confidence`.

**Verificado contra el código**: `grep confidence` en `walk-types.ts`, `walk-core.ts` y
`dom-walker.ts` devuelve **vacío**. Nadie lo lee. La única consecuencia prevista para un hint que
el propio refiner sabe débil es escribir un número que ningún consumidor abre.

La regla necesita una consecuencia real. Es la misma enfermedad que K0.43/D1 y que
`fd_ingested`: declarado, y la ejecución vive en la buena voluntad de otro.

**Y hay una segunda mitad, peor.** El FD **no cita nada en absoluto** — 46 líneas de prosa sin
una comilla. Verificado: `grep '"'` sobre el fichero no devuelve nada. Así que *todos* los hints
de este guion son necesariamente descripciones, y la rama «cita el literal» del prompt **no era
alcanzable en este run**. Con este FD, el refiner no puede producir un hint correcto: es
estructural, no un tropiezo.

Salvo que el refiner **no fue consistente**: para el login y la transferencia usó la descripción
en castellano (obediente), y para el logout emitió `name: 'Log Out'` en inglés, un caption que el
FD nunca escribe. Eso no es traducir, es **inventar**, y el prompt lo prohíbe con esas palabras
(*"do NOT invent a caption"*). Acertó, que es la forma más peligrosa de fabricar: un acierto por
casualidad enseña a confiar en el mecanismo que lo produjo.

O sea que D14 tiene dos caras y hay que arreglar las dos: la regla no tiene consecuencia
(`confidence` no lo lee nadie) **y** el refiner no la sigue de forma estable. La segunda no se
arregla con dientes en el consumidor; se arregla midiendo si el refiner honra una cita cuando la
tiene — cosa que este run **no probó**, porque no había ninguna.

## D15 — `walk-to-spec` no sabe que hay `auth`

**Verificado contra el código**: `grep -i "storageState|auth"` sobre
`copilot/src/walk-to-spec.ts` devuelve **vacío**.

Consecuencia medida: emitió `login.spec.ts` sin neutralizar el `storageState`, así que el test
que verifica el login heredaba sesión, `index.htm` no renderizaba el formulario y el spec moría.
Con `auth.enabled: true` en el contract y un flujo que **es** el login, el spec tiene que nacer
con la sesión limpia.

## D16 — El `discovery-analyzer` tira los locators medidos

El orquestador tenía locators autoritativos medidos contra el DOM vivo. El analyzer los
descartó y re-abstrajo a `role` + nombre **en castellano** (`"Importe a transferir"`), que no
existe como nombre accesible en la aplicación. `verify-locators` los marcó **0/6**.

La guarda de Q2 hizo su trabajo y el Writer recibió la advertencia. Pero la tubería tiró dato
autoritativo que ya tenía en la mano para sustituirlo por una abstracción falsa.

## D17 — `QA_WORK_DIR` exportado tarde (menor)

El command lo pide en el paso 1.a, **antes** de la ingesta. Se exportó después, y el refiner
escribió al `.work/audit-log.json` genérico en lugar del namespaciado. Error del orquestador,
no del spec — pero es la clase de requisito que un spec no debería dejar en «acuérdate de
exportar una variable de entorno».

## D2 — Segunda instancia de campo

`action: 'fd_ingested'` sigue fuera de la unión `AuditAction`. El orquestador se construyó un
helper en el `workDir` para rodearlo. La familia nombrada en K0.43 ya no es teórica: dos runs de
campo, dos instancias, y en este run se le suma `confidence` (D14).

---

## Lo que hizo bien, y no es poco

Cuatro cosas son trabajo QA de verdad, y conviene no enterrarlas bajo los defectos.

**El verde que habría mentido.** Encontró que `/parabank/overview.htm` sirve la tabla de cuentas
**y a la vez** `"An internal error has occurred and has been logged."`, y sacó la conclusión
correcta: un test que asserte solo el heading pasa en verde sobre una página en error. Cambió
RF-001 y RF-002 a assertar sobre `#accountTable`. Eso es criterio, no mecánica.

**RF-004 pasó de ambiguo a drift de negocio.** La cuenta 12345 está en `-$2300.00` y la pantalla
solo expone `"The amount cannot be empty."` y `"Please enter a valid amount."`. No hay validación
de fondos: el requisito del FD parece no estar implementado. Es incidencia antes que test.

**RF-005 no era drift.** Refutó a la vez el `drift_risk: high` del refiner **y el aviso del
propio FD**. `billpay.htm` existe completo con postcondición observable
(`"Bill Payment Complete"`). El único blocker real era que el contract no declara fixtures de
beneficiario — y el formulario pide además City, State, Zip, Phone y Verify Account #, que
`/setup` no preguntó.

**El rojo de TC-002, diagnosticado con disciplina.** No lo atribuyó a la aplicación: lo aisló
(pasa solo), lo reprodujo a mano (`Transfer Complete!` visible) y llegó a la causa real — el
logout de TC-003 invalida en servidor el `JSESSIONID` que TC-002 comparte vía `storageState`.
Luego confirmó el verde con **dos pasadas consecutivas** antes de declararlo estable, que es lo
que toca en un sitio con estado compartido.

Y omitió el planner nativo a propósito, alineado con K0.42: sus 113k–161k tokens medidos habrían
redescubierto un DOM que ya estaba medido.

---

## Pregunta abierta

Si `Log Out` resolvió nativo y sus pasos pasaron, **¿por qué `walk-to-spec` encoló el flujo de
logout** en vez de emitirlo? Si arrastraba un `after_blocked`, es el comportamiento correcto de
K0.39. Si no, hay otro defecto. La respuesta está en el `dom-map` de `prueba-beta2/`.

## Qué NO dice este run

No dice que el walker sea lento: no se le dejó correr. Recorrió dos veces, murió la primera en un
hint traducido con un panel que nadie atendió, y la segunda alcanzó 8/12 con alias de un solo
flujo antes de que se le abandonara.

No dice que K0.44 funcione ni que falle: **D3 y D10 siguen sin prueba de campo**. D3 se prueba
cuando un segundo run resuelva por `alias-hit` sin preguntar. D10, cuando el QA demuestre un paso
que navega y el panel reaparezca.

Y no dice nada sobre ParaBank como aplicación: es demo de Parasoft **con defectos sembrados**, así
que el error interno de `overview.htm` no se presenta fuera sin verificarlo.

---

## Estado de los defectos

| # | Defecto | Estado |
|---|---|---|
| D11 | Diagnóstico falso del tier anclado → rescate MCP innecesario + memoria envenenada | abierto |
| D12 | El panel se abre y el QA no se entera | abierto |
| D13 | Subagentes en background: ~30 min muertos; la regla no es imponible | abierto |
| D14 | `confidence` no lo consume nadie → «citar y no traducir» sin dientes | abierto |
| D15 | `walk-to-spec` ignora `auth.enabled` | abierto |
| D16 | El `discovery-analyzer` descarta locators medidos | abierto |
| D17 | `QA_WORK_DIR` exportado tarde | abierto (menor) |
| D2 | Familia «declarado que nadie valida ni consume» | criterio, no ticket — 2ª y 3ª instancia |
| D1 | El refiner emite un guion que el walker rechaza | **cerrado** (K0.43, confirmado en campo) |
