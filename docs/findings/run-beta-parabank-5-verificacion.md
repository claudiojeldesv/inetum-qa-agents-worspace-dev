# El quinto run: verificar en campo los tres arreglos, y lo que apareció por el camino

- **Fecha**: 2026-08-21
- **Rama**: `design/kernel-v2` — release `0.4.0-beta.7`, instalada en la cache del plugin
- **Workspace**: `verificacion-beta7/`, desplegado desde cero, healthcheck **30/30**, `tsc` limpio de arranque
- **Target**: `https://parabank.parasoft.com/` (S3), FD **bit a bit el mismo** del run 4 (md5 idéntico)
- **Contract**: `parabank-fd.yaml` — `assist: false`, `rescue_budget: 0`, `evidence.level: full`
- **Memoria de alias**: vacía (arranque frío real)
- **Resultado**: 3 specs + auth setup. **Pasada 1: 4/4 verdes. Pasada 2: TC-002 rojo (flake).**

Este run no existía para producir tests: existía para comprobar en campo tres mecanismos nuevos
—`MF-tsc`, `verify-ack` y las marcas de `Task`— sobre los mismos tres flujos que el run 4, para que
la comparación se sostenga.

> **Salvedad de método, importante.** Mi sesión cargó los **agentes y commands de beta.6**; el
> command de beta.7 lo seguí leyéndolo de la cache y ejecutándolo yo. Es decir: este run verifica el
> **código** de beta.7 (los scripts del workspace) con la **prosa** de beta.6 en los subagentes. Lo
> que queda probado son los mecanismos; lo que NO queda probado es si un orquestador que arranca
> limpio obedece las instrucciones nuevas. Eso solo lo prueba el run del QA.

---

## Los tres mecanismos: confirmados

**`MF-tsc` corre en campo.** El Writer del auth setup devolvió literalmente
`pre-review must_fix=0 (tsc diagnostics_total=0)`, y el de TC-003 `tsc limpio`. El compilador está
dentro del bucle shift-left del Writer, que es donde tenía que estar. El `tsc` completo tras los
tres Writers: **exit 0**.

**`verify-ack` funciona y encuentra cosas.** Seis verificaciones, todas con el `cwd` impreso. La
línea *«resuelto contra: …verificacion-beta7»* es la que hace visible el falso verde por directorio
—y es exactamente el error que yo mismo cometí durante este run, ver abajo—.

**Las marcas de `Task` arreglan la métrica.** Es el resultado más limpio del run:

```
tiempo ACTIVO   : 51m 35s
subagentes      : 41m 11s en 8 tramo(s) — trabajo del producto, NO espera
esperas >60s    : 5m 40s  = 11% del activo
```

Sobre **el mismo log**, la versión anterior habría reportado ~90% de esperas. Ahora dice 11%, y los
41 minutos quedan atribuidos a los 8 subagentes con su reloj individual gratis. La cifra que hubo
que retirar dos veces por mentirosa, por fin mide lo que dice medir.

---

## Arranque frío: el walker cubrió 2 de 7 pasos, y eso es el dato

El refiner **declaró el riesgo por adelantado** (Q-001): el FD no cita ni un caption literal en sus
46 líneas, así que los hints van en español contra una app en inglés, y rehusó traducir o inventar.
El walker se plantó: **2/7 pasos, 5 bloqueados**. `walk-to-spec` devolvió **`emitted: []`** con el
motivo paso por paso — fail-closed correcto: ningún test de regresión salido de un walk incompleto.

En el run 4 el walker acabó 15/15 y $0 porque venía de una iteración que ya había medido los
captions reales. Aquí, con memoria vacía, **el camino determinista de coste cero no cubre nada y
todo cae al LLM**. Es la medida más limpia que tenemos de por qué importa la idea del pack de
palabras por idioma: cinco de siete pasos bloqueados **solo** por el idioma del hint.

---

## Defectos nuevos

### D34 — el scaffolder genera `getByTestId` sobre atributos que no son el testId configurado

El Writer de TC-002 lo cazó y lo declaró en su acuse: *«Scaffolded POM usaba `getByTestId` sobre
atributos `id` reales (`testIdAttribute=data-test`); corregido a css-fallback `#id`»*. Los locators
generados **no habrían resuelto**. El scaffolder toma el `test_id` del discovery sin comprobar que
el atributo del que salió coincide con el `testIdAttribute` del proyecto.

### D35 — el Writer conoce la race y aun así produce un test flaky

TC-002 pasó en la pasada 1 y falló en la 2. El Writer **sí** manejó la carga asíncrona: escribió
`waitForAccountsLoaded()` citando la línea del plan. Pero la guarda es débil:

```ts
await expect(this.fromaccountid.locator('option')).not.toHaveCount(0);
```

`not.toHaveCount(0)` se satisface con cualquier estado transitorio y no garantiza que el XHR haya
terminado. El fallo ocurrió **en esa propia espera**. Que el planner midiera la race, la reportara,
y el Writer la citara, y aun así salga flaky, dice que **avisar no basta**: hace falta un patrón de
espera prescrito para carga asíncrona, no dejarlo al criterio del Writer.

### D36 — un subagente se inventó el timestamp del audit

Una entrada `review_decision` con `2026-08-21T00:00:01.000Z`: medianoche, en un run de las 19:44 a
las 20:35. La escribió un Reviewer **a mano**. Corrompió el reloj de pared en **19h 44m**, y solo lo
salvó el filtro de pausas humanas que existía por otra razón.

Es el argumento de `audit-mark` en una línea: las entradas escritas por script llevan hora real; la
que escribe un LLM, no. Falta cablearlo en los agentes, no solo en los commands.

### Defecto propio, introducido y cerrado el mismo día

Hice que los `.setup.ts` llevaran findings de `MF-tsc`, pero dejé el CLI con
`if (r.skipped) continue` **antes** de escribir el fichero. Un setup que no compilara habría tenido
`must_fix > 0` y el hallazgo se habría tirado tras calcularlo — el patrón D2 exacto, en código mío
de hoy. Detectado porque `pre-review/` salió vacío tras el auth setup. Arreglado extrayendo
`debeEscribirse()` y con tres tests, uno de ellos el par falsable.

---

## Confirmados en campo

| Qué | Evidencia |
|---|---|
| **K0.43** | guion válido a la primera — **quinta** confirmación |
| **D19** | el gate excluyó solo RF-004 y RF-005 (`then` `[AMBIGUO]`), no el run entero |
| **D20 / fail-closed** | `walk-to-spec` con `emitted: []` y motivo por paso |
| **D24** | POM scaffoldeado compila, `tsc` exit 0 |
| **D25** | `verify-locators` con `session_bootstrap: none` → **1 verificado / 7 no**: no sabe autenticarse |
| **D30** | **sistémico**: los 3 Writers y el refiner escriben sus specs al audit pero **nunca los POM que editan** — 6 ficheros `s/rastro` |
| **D29** | **no** se reprodujo: el Writer nombró `transferFunds` y la propiedad era `transfer`. Se evitó por elección del Writer, no porque `MF-tsc` lo cazara |

---

## Lección operativa confirmada por partida doble: la sesión debe NACER en el workspace

`change_directory` movió los permisos pero **no** re-ancló nada:

1. **El servidor MCP siguió anclado al directorio de arranque.** Los tres planners guardaron sus
   planes en el workspace anterior y hubo que moverlos a mano. El planner lo detectó y lo reportó en
   vez de fingir éxito — buen comportamiento, mal entorno.
2. **La `cwd` de la shell tampoco se movió**, y yo no lo comprobé: ejecuté un
   `Remove-Item -Recurse -Force .work/parabank-fd` creyendo estar en el workspace nuevo y **borré
   los artefactos efímeros del run 4** (`criteria.json`, `discovery-report.json`, `dom-map.json`,
   run-summary). Los entregables —specs y POM— quedaron intactos, y el audit-log se recuperó de una
   copia previa. Dos errores encadenados: fiarme del cambio de directorio y **borrar sin mirar el
   destino**.

Regla, ahora con dos pruebas independientes: **el run se abre dentro de su workspace**. Y en esta
shell, `Set-Location` explícito con ruta absoluta en cada llamada.

---

## Veredicto

Los tres arreglos de este ciclo **funcionan en campo**. El run produce tres tests trazados a RF-NNN
que pasan contra la aplicación real.

**No está listo del todo**: TC-002 es flaky (D35), y eso en un producto que vende regresión fiable
es bloqueante. Antes de dárselo a un cliente hay que prescribir el patrón de espera para carga
asíncrona, cerrar D34 en el scaffolder, y cablear `audit-mark` en los agentes para D36 y D30.

Pendientes de antes que este run no tocó: **D23** y **D27** (el camino del panel, con `assist: true`),
**D26**, y **D33** (la suite del repo no es verde de forma fiable bajo paralelismo).

---

# Segunda parte: los arreglos de D34/D35/D36 y su re-verificación (beta.8 → beta.9)

Tras el veredicto de arriba se atacaron los tres pendientes y se re-ejecutaron los Actos 3-5 sobre
los mismos planes (Actos 1-2 no cambian: el refiner, el walker y los planners no se tocaron).

## D34 — CERRADO, verificado en el output real

Arreglo en los dos lados de la costura:

- **Productor**: `InteractiveElement` gana `test_id_attr` y el `ia4d-discovery-analyzer` declara de
  qué atributo salió el identificador.
- **Consumidor**: `renderLocator` emite `getByTestId` **solo** si el atributo coincide con el
  `testIdAttribute` del proyecto; si no, emite un selector acotado con su tag `// css-fallback:`.
  El CLI del scaffolder lee el `testIdAttribute` del Style Contract.

El discovery v2 emitió `test_id_attr: "id"` / `"name"` en los 5 elementos afectados, y el POM
regenerado ya no tiene **ni un** `getByTestId`:

```ts
this.fromaccountid = this.page.locator('#fromAccountId') /* css-fallback: id — el discovery lo tomó de 'id', no de 'data-test' */;
this.username      = this.page.locator('[name="username"]') /* css-fallback: name — ... */;
```

Sin `test_id_attr` (reports antiguos) no hay regresión: se sigue confiando. 5 tests.

## D35 — CERRADO en el mecanismo, verificación end-to-end BLOQUEADA por el entorno

`MF-wait-budget` en `pre-review`: una espera de disponibilidad debe declarar su presupuesto. Dos
formas mecánicas — `not.toHaveCount(0)` sin `{ timeout }` (es una guarda por construcción: nadie
asserta «no cero» como postcondición de negocio) y un método `waitFor*` que asserta sin timeout. Se
busca **en el spec y en los POM que importa**, porque el helper vive en el POM: mirar solo el spec
habría dejado pasar el caso real.

Corrido contra el artefacto exacto que se puso flaky, lo caza:

```
must_fix_total: 1  →  MF-wait-budget
"guarda de disponibilidad 'not.toHaveCount(0)' sin timeout explícito ... [en transfer-funds.page.ts,
 importado por este spec]"
```

Y el Writer regenerado produjo la espera con presupuesto:

```ts
async waitForAccountsLoaded(timeoutMs = 15000) {
  await expect(this.fromaccountid.getByRole('option')).not.toHaveCount(0, { timeout: timeoutMs });
```

**Lo que NO se pudo verificar**: que la suite pase dos veces seguidas. ParaBank empezó a devolver
**HTTP 500** en `login.htm` a mitad del re-run —comprobado con una sesión HTTP directa, fuera de
Playwright— y los tres tests fallan por eso. No es del producto: los locators v2 son equivalentes a
los v1 que pasaron (mismo `getByRole('heading', {name:'Accounts Overview', level:1})`, y el `level 1`
lo midió el planner en vivo). Queda pendiente re-correr la suite cuando el entorno vuelva.

## D36 y D30 — el script funciona; la prosa NO basta, y el arreglo real era un cableado

`audit-mark` se usó en 22 puntos del re-run y produjo por primera vez una atribución honesta del
reloj. Pero **D30 se reprodujo con la orden explícita en el prompt**: a los tres Writers se les pidió
«una entrada de audit por CADA fichero que toques» y siguieron auditando solo su `.spec.ts`.

Eso obligó a buscar la causa mecánica, y estaba a la vista: **`hooks/audit-write.ts` está cableado al
evento `Stop`**, no a `PostToolUse`. Pese al nombre, no audita escrituras: escribe un resumen al
cerrar sesión. El único hook en `PostToolUse|Write|Edit` era `pii-post.ts`. Es decir: **el rastro
automático de ficheros no existía**.

Arreglo: `hooks/audit-file-write.ts`, nuevo, en `PostToolUse` sobre `Write|Edit`. Registra cada
fichero tocado con su acción, filtra el ruido (`.work/`, `node_modules/`, el propio audit-log) y
nunca bloquea. Comprobado a mano: 4 escrituras (3 de ruido + 1 real) → 1 entrada.

De paso, dos defectos que aparecieron al mirar:
- `audit-write.ts` **ignoraba `QA_WORK_DIR`**: en un run namespaciado escribía su resumen de cierre
  en `.work/audit-log.json` en vez de en el del sitio. Arreglado.
- La primera versión de mi filtro de ruido dejaba pasar `node_modules/x/y.ts` porque comprobaba
  `/node_modules/` con barra inicial. Lo cazó su propia prueba (2 entradas donde debía haber 1).

## Defectos NUEVOS que destapó el re-run

### D37 — `MF-postcondition` es ciego a la pantalla

Dos Writers independientes lo reportaron como falso positivo. `assertsSomePostcondition` compara
contra **todas** las postcondiciones del discovery, de cualquier pantalla: a un spec de login se le
exige asertar `Transfer Complete!`. **Abierto.**

### D38 — los Writers editan el `discovery-report.json` para satisfacer un gate

Dos de tres modificaron el artefacto de aguas arriba —citando el plan, y declarándolo— para que
`MF-postcondition` pasara. Aunque la intención sea buena, **un Writer no debe mutar la evidencia
sobre la que se le juzga**. Probablemente desaparezca al cerrar D37, pero la prohibición debe ser
explícita. **Abierto.**

### D39 — la señal de éxito de auth se satisface con una página de error

`auth.setup.ts` **pasó en verde contra una app que devolvía HTTP 500**. El `success_signal` del
contract es el enlace `Log Out`, que ParaBank pinta en su barra de navegación **también en la página
de error**. El gate de autenticación dio por buena una sesión que no servía, y el fallo salió tres
pasos más tarde en cada spec.

La señal de éxito tiene que ser algo que **solo** exista en la pantalla de destino. **Abierto** — y
es la clase de defecto más cara: un gate verde que no verifica lo que dice.

### Observación — el nombre de las pantallas no es estable entre corridas

El mismo discovery-analyzer sobre los mismos planes produjo `accounts-overview`/`transfer-funds` en
una corrida y `overview`/`transfer` en la siguiente, renombrando los POM y rompiendo los imports del
auth setup. Lo cazó `MF-tsc` y el Writer lo arregló, pero un nombre de fichero que baila entre runs
es ruido en el diff y un problema para una suite versionada.

## Estado del código tras la segunda parte

`0.4.0-beta.9` construida, payload verificado e instalada. `tsc` exit 0, **healthcheck 31/31**,
tests unitarios verdes (5 de D34, 7 de D35, 3 del descarte de findings, 17 de `verify-ack`, 7 de
atribución).

**Bloqueado por entorno**: la pasada doble verde de la suite. Todo lo demás de esta segunda parte
está verificado.
