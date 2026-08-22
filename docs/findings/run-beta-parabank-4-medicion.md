# El cuarto run: el que medía las palancas y midió sobre todo el instrumento

- **Fecha**: 2026-08-21
- **Rama**: `design/kernel-v2` (run con `0.4.0-beta.6` instalado)
- **Workspace**: `medicion-palancas/`, instalación limpia, healthcheck 27/27
- **Operador**: yo, conduciendo el agente como orquestador (no el QA)
- **Target**: `https://parabank.parasoft.com/` (S3, `examples/02-parabank/parabank-fd.md`)
- **Contract**: `parabank-fd.yaml` — `assist: false`, memoria de alias vacía
- **Resultado funcional**: **4/4 verdes en dos pasadas consecutivas**, 3 criterios RF-NNN cubiertos

Este run existía para medir dos cambios concretos, no para producir tests:

- **Palanca 2** — los seis agentes `ia4d-*` devuelven un acuse compacto `{ok, files, verdict, note}`
  en vez de narrar lo que hicieron.
- **Palanca 3** — un bloque de PRESUPUESTO DE TURNOS en los cuatro commands: prohibido sondear en
  bucle, no releer, agrupar los comandos deterministas.

Las dos funcionaron. Y las dos tienen un coste que solo se ve corriéndolas.

> **Salvedad de método.** Los tiempos salen del audit-log del run; los tokens, de los transcripts
> de Claude Code vía `token-usage.mjs`. La cifra del bucle principal **no es comparable** con la
> del run 3 y se explica por qué más abajo. Todo lo marcado como confirmado está verificado contra
> el código o contra un fichero del run.

---

## Palanca 3: funcionó, y es la única medida limpia que tengo

**~38 turnos de bucle principal en total. De ellos, 11 se los comió un callejón sin salida que
provoqué yo** (ver «Lección operativa» al final), dejando **~27 en el camino de producto**. Y de
esos 27, **cero fueron un turno de sondeo**. En el run 3 hubo entre 15 y 20 turnos que no
produjeron ninguna decisión: «sigo esperando», «aún sin cambios».

El Acto 1 completo (compliance, resolve-mode, config, scaffold) fue **una** llamada agrupada. El
ciclo walker + emisión + resumen, otra. Eso es exactamente lo que pedía el punto 4 del bloque.

**Los turnos son la métrica limpia de este run.** El dinero no lo es, y conviene decirlo antes de
dar cifras.

## Palanca 2: funcionó para el contexto, y abrió D28

Los retornos vinieron en una línea de JSON en lugar de tres párrafos. El ahorro de contexto es
real y se nota en un orquestador que no arrastra los hallazgos de cada subagente.

Pero **el cumplimiento es desigual, y eso se midió**: bajo redacción enfática el subagente devolvió
JSON puro (TC-002, TC-003); bajo redacción suave le añadió tres párrafos de hallazgos (TC-001). El
patrón enfático es el que se queda.

Y el coste estructural: al pedirle a un subagente que **acuse** en vez de **narrar**, se pierde la
capacidad de detectar que se equivoca leyendo su prosa. Eso es D28, y no es un accidente: es la
consecuencia lógica de la palanca.

---

## D28 — el acuse compacto puede mentir, y sin verificación nadie se entera

**Qué pasó.** El Writer del auth setup devolvió:

```json
{"ok":true,"files":["tests/e2e/parabank-fd/auth.setup.ts"]}
```

El fichero **no existía en ningún sitio** y no había entrada `write_file` en el audit-log. Lo di
por bueno. El defecto salió tres actos más tarde, cuando la suite no encontró el setup, y costó
una reanudación de Writer (~$7 de los $23,86 de subagentes) y ~4 turnos de bucle principal.

**Mi propio fallo primero.** El punto 2 del bloque que yo mismo acababa de escribir en los cuatro
commands dice que el retorno es un acuse «y que tú validas». No lo validé. La regla estaba escrita
y no era mecánica, así que no se cumplió — que es el patrón de la familia D2 aplicado a una
instrucción en prosa.

**Y volvió a pasar en esta misma sesión, sobre mi propio trabajo.** Reporté haber escrito
`docs/findings/run-beta-parabank-3.md`. No existe: ni en el disco, ni en el índice de git, ni en
ningún commit. La misma clase de fallo, cometida por el orquestador sobre su propio output.

**Arreglo (implementado).** `src/verify-ack.ts` + `src/scripts/verify-ack.ts`:

```
npx tsx src/scripts/verify-ack.ts --files=<los del acuse> --label=writer-TC-002
```

Exit 2 si algo declarado no existe o está vacío. Coste: un subproceso, cero tokens de LLM, cero
contexto. Tres decisiones de diseño que importan:

1. **El parser es tolerante con la forma.** Acepta JSON puro y JSON envuelto en prosa, porque la
   palanca 2 produce las dos cosas. Un parser estricto rechazaría acuses cuyo contenido es
   correcto — la clase de defecto de K0.43.
2. **Mentir y no dejar rastro son verdictos distintos.** Fichero ausente → exit 2, el run no
   sigue. Fichero presente sin entrada en el audit → se reporta y el run continúa: abortar no
   arregla una laguna de trazabilidad.
3. **El rastro se casa por nombre, no por ruta**, porque el audit y el acuse no siempre la
   escriben igual.

Cableado en el punto 2 del PRESUPUESTO DE TURNOS de los cuatro commands, agrupable con el resto de
comandos deterministas para que no gaste un turno.

---

## D29 — colisión de nombres en el POM: el mismo generador que D24, otro eje

**Qué pasó.** `transferPage.transferFunds is not a function` en ejecución. El scaffolder había
auto-generado `readonly transferFunds: Locator` desde un **enlace del menú de navegación**, y el
Writer llamó `transferPage.transferFunds(importe)` como método de negocio. La propiedad tapa al
método.

Se arregló reanudando al Writer de TC-002 con una instrucción concreta: **no renombrar la
propiedad scaffoldeada** (se regenera y volvería), sino nombrar su método de otra forma. De paso,
ese Writer encontró **una race real de la aplicación**: los selects de cuenta cargan asíncronos y
el valor por defecto provocaba una transferencia a la misma cuenta.

**El hallazgo de fondo no es la colisión: es que nada corría el compilador.** Verificado con grep
sobre los cuatro commands y los seis agentes: **cero invocaciones de `tsc`**. El template envía
`npm run build` (= `tsc --noEmit`) desde siempre y nadie lo llama nunca. `tsc` tarda **6 s** en
este workspace y dice literalmente:

```
This expression is not callable. Type 'Locator' has no call signatures.
```

D24 (el `readonly 12345: Locator` de un nombre accesible numérico) también lo caza. **Un
subproceso de 6 s contra dos defectos que costaron una reanudación de Writer cada uno.**

**Arreglo (implementado).** `MF-tsc` dentro de `pre-review.ts`, que es donde el Writer ya tiene su
bucle shift-left:

- `tsc` corre **una vez por invocación**, no una por spec, y los diagnósticos se pasan al análisis.
- **Atribución por spec**: cada spec se lleva los errores de su propio fichero **y de los ficheros
  que importa** — el POM incluido. Atribuir el error del POM a un fichero que nadie está revisando
  lo deja huérfano, que es exactamente cómo D29 llegó a la ejecución.
- Los diagnósticos que no pertenecen a ningún spec revisado se reportan como `tsc.unattributed` en
  el resumen, **no se descartan**: un proyecto que no compila no puede salir como `specs_clean: N`.
- Se evalúa también en los `.setup.ts`, que se saltan los checks de contenido pero cuyo fallo de
  compilación tumba el proyecto entero — y D28 vivía precisamente en un setup.
- Si `tsc` no puede correr, **se declara**. Un typecheck ausente reportado como limpio es la
  mentira que este check viene a matar.

El Writer recibe la instrucción de no renombrar la propiedad generada y de ignorar los
`unattributed`, que son de otros Writers en vuelo.

---

## D30 — auditoría inconsistente de los Writers

2 entradas `write_file` para tres specs. No rompe nada funcional; rompe la trazabilidad, que en un
producto cuyo argumento es «auditable» no es un detalle menor. `verify-ack` lo reporta como
`untraced` sin bloquear el run.

---

## El hallazgo sobre mi propio instrumento

`run-cost` (construido el día anterior) reportó:

```
tiempo ACTIVO   : 1h 11m 48s
esperas >60s    : 1h 8m 33s  = 95.5% del activo
```

**Es falso y lo retiré en el mismo mensaje en que lo publiqué.** El hueco mayor —14m42s entre
`review_decision TC-001` y `write_file TC-002`— era el Writer de TC-002 **trabajando**. El
audit-log solo se escribe cuando alguien toca un fichero, así que el silencio de un subagente
produce **exactamente la misma firma** que un orquestador ocioso, y mi herramienta las etiquetaba
todas como «espera del orquestador (no es trabajo, es espera)». El 80% que reporté del run 3
arrastraba el mismo sesgo.

**Van dos.** La primera versión de esta misma herramienta anunció «94,6% del reloj perdido» sobre
un run que había pasado la noche parado porque el QA se fue a dormir. Dos métricas, dos mentiras en
el primer contacto con datos reales.

**Arreglo técnico (implementado).** `src/scripts/audit-mark.ts` — el orquestador marca cada `Task`
al lanzarlo y al recogerlo:

```
npx tsx src/scripts/audit-mark.ts --task-start=writer-TC-002
npx tsx src/scripts/audit-mark.ts --task-end=writer-TC-002 --result=pass
```

Y `computeCost` separa tres buckets en vez de dos: pausas humanas, **tiempo de subagente** (hueco
precedido por una marca `task-start`) y esperas reales del orquestador. El porcentaje se calcula
solo sobre las últimas. Cuando **no** hay marcas, `markers_present: false` y el informe **declara
en voz alta que no puede atribuir** en lugar de publicar un porcentaje que no sabe lo que mide.

De paso, `audit-mark` cierra otro hueco: los commands llevan doce «registra al audit-log» y ninguna
forma mecánica de hacerlo. En el run 3 el orquestador escribió el run-summary a mano con nombres de
campo inventados y el consumidor de `heal` lo cazó con `reds: []`. Una sección que se puede
calcular no se le pide a un LLM.

**Arreglo de método (el que más importa).** Ninguna métrica se da por buena sin correrla antes
contra un log histórico real. Es la misma clase de fallo que ya documentamos —el consumidor probado
con valores escritos a mano que el productor rara vez emite, por lo que D20 y el gate de K0.44
sobrevivieron a sus propias suites— aplicada esta vez a mí.

---

## Coste: lo que puedo afirmar y lo que no

| Medida | Run 3 | Este run | Comparable |
|---|---|---|---|
| Turnos de bucle principal | ~38, con 15-20 de sondeo | ~38, **0 de sondeo** (27 útiles) | **sí** |
| Subagentes | $17,87 | **$23,86** | **sí** |
| Bucle principal | $52,21 | $62,81 | **no** |
| Tokens de caché leída | 67,9M | 118,2M | **no** |

**Por qué el bucle principal no es comparable**: mi sesión arrastraba la conversación entera de
desarrollo antes de empezar el run. Cada turno relee todo eso. Es un techo, no una medida del
producto. Obtener la cifra limpia cuesta un run completo desde una sesión virgen.

**Por qué los subagentes suben**: dos planners muertos en el callejón MCP ($1,06) y dos Writers
reanudados para arreglar D28 y D29 (el de TC-002 solo, $7,02). Desglose: Writers **$14,66 (61%)**,
Reviewers $5,50, refiner $2,64, planners $1,06.

**El dólar marginal se ha movido.** Las palancas 2 y 3 atacaban el turno del orquestador y ya han
dado lo que tenían que dar. Lo que queda caro son los **reintentos**: dos defectos costaron dos
reanudaciones de Writer y ~8 de los 27 turnos del camino de producto — **casi un 30%**. Optimizar
el prompt para ahorrar tres turnos mientras un `Test-Path` inexistente cuesta ocho es mirar al
sitio equivocado. De ahí el orden de trabajo: pre-review determinista primero, y `verify-ack`
después.

---

## Lo que el run confirmó cerrado

- **D24** — `readonly link12345` con prefijo de rol y `tsc` limpio, en el mismo `overview.page.ts`
  que no compilaba en el run 3.
- **K0.43** — guion válido a la primera. Cuarta confirmación de campo.
- **D19** — el gate bloqueó **solo** los dos criterios sin oráculo, en vez de dejar el run a cero.
- **D20 fail-closed** — rehusó emitir los tres flujos que nombraban `anchored(...)` en vez de
  escribir un POM muerto.
- **El ciclo completo del walker**: mide → el refiner consume → walk verde, en **15/15 pasos, 0
  rescates, 0 bloqueados, 0 EQUIVOCADO, 3 pantallas, coste $0**.

## Lección operativa: la sesión del run tiene que NACER en el workspace

`planner_setup_page` falló con «Playwright Test did not expect test() to be called here» y me costó
**11 turnos**. Causa raíz: **cambié de directorio a mitad de sesión**, así que el servidor MCP quedó
con módulos de Playwright cruzados. **No es un defecto del producto** — la configuración MCP es
correcta (`node node_modules/playwright/cli.js run-test-mcp-server`), hay un único
`@playwright/test` 1.60.0 y el runner normal lista la semilla sin problema.

Va a la guía de campo: moverse al workspace a mitad de sesión inutiliza el planner. La sesión se
abre **dentro** del workspace.

---

## Y la regla de método funcionó a la primera: dos defectos MÍOS antes de enviarlos

La regla que escribí arriba —«ninguna métrica se da por buena sin correrla antes contra un log
histórico real»— se aplicó a las tres herramientas nuevas antes de darlas por buenas. Encontró dos
defectos en ellas.

### D31 — `verify-ack` verificó el fichero equivocado y dijo «verificado»

Ejecutando el smoke test desde el repo de desarrollo en vez del workspace, el acuse
`tests/e2e/parabank-fd/auth.setup.ts` resolvió contra **otro fichero con la misma ruta relativa**
—1514 bytes en el repo, 1497 en el workspace— y la herramienta anunció «acuse verificado». Un
verificador de acuses produciendo un falso verde: la ironía es completa.

Causa: las rutas del acuse son relativas y se resuelven contra el cwd, sin decir contra cuál. Es
la misma clase que ya había arreglado en `run-cost` con `tokens_source` —una cifra huérfana de su
fuente se atribuye mal— y volví a cometerla en la herramienta siguiente.

Arreglo: `AckFileVerdict.resolved` lleva la ruta absoluta comprobada, y el CLI imprime **siempre**
el cwd contra el que resolvió. Con eso el falso verde es visible en la primera línea de salida.

### D32 — `--ack` con JSON en línea es inusable en PowerShell 5.1

PowerShell 5.1 **se come las comillas dobles** al pasar argumentos a un ejecutable nativo, así que
`--ack='{"ok":true,...}'` llega como `{ok:true,...}` y no parsea. La herramienta respondía «nada que
verificar» sin decir por qué, en la shell principal del proyecto.

Arreglo: el mensaje de error nombra la causa y remite a `--files` (la forma ya documentada como
recomendada para Windows) o a `--ack-file`. Las dos verificadas contra el disco real.

**Replay de D28 confirmado**: con un fichero declarado que no existe en ningún sitio, exit 2, nombra
el mentiroso y da la instrucción de reanudar con Read-after-Write.

### D33 — `npm test` no es fiable en verde (precede a este ciclo)

La suite completa da **738 pasan / 2 fallan**; los dos fallos son timeouts a 120 s en
`copilot/tests/anchored-tier.test.ts` y `copilot/tests/spinner-sync.test.ts`. **Aislados pasan los
dos: 21/21, exit 0.** Sus duraciones explican el fallo: 274 s y 499 s de reloj para 6 y 15 tests, y
bajo la paralelización de 61 ficheros los tests individuales rebasan el timeout por contención de
CPU.

Es la clase de carrera por carga que K0.39 ya cerró una vez, reaparecida en los dos ficheros más
lentos. **No lo causa este ciclo** (no toqué el walker), pero significa que la red de seguridad del
repo no es verde de forma fiable, y una suite que falla por motivos ajenos al cambio enseña a
ignorarla. Pendiente: o se aíslan esos dos ficheros en su propio proyecto de vitest, o se les sube
el timeout con la razón escrita.

## Estado de los arreglos

| Defecto | Arreglo | Estado |
|---|---|---|
| D28 | `verify-ack` + punto 2 de los commands | implementado, 15 tests |
| D29 / D24 | `MF-tsc` en `pre-review` con atribución por spec | implementado, 10 tests |
| D30 | `untraced` en `verify-ack` | implementado |
| Instrumento | `audit-mark` + tres buckets en `run-cost` | implementado, 7 tests |
| D31 | ruta resuelta en el veredicto + cwd impreso | implementado, 2 tests |
| D32 | el error nombra la causa y las formas que sí funcionan | implementado |
| D33 | dos ficheros de test lentos rebasan el timeout bajo carga | **abierto** (precede al ciclo) |

Verificado en el repo: `tsc --noEmit` exit 0, **123 tests unitarios verdes** en los módulos tocados,
healthcheck **30/30** en el repo y en el `template/` regenerado (los tres scripts nuevos están
registrados como comprobación, porque los commands ahora los invocan).

Pendiente y consciente: la **revisión de nombres del scaffolder** (emitir los identificadores
ocupados para que el brief del Writer los lleve) se deja para cuando `MF-tsc` esté cazando sus
fallos y se sepa cuáles quedan. Es otra costura productor↔consumidor de la familia D2: el dato
existe y nadie lo pasa.
