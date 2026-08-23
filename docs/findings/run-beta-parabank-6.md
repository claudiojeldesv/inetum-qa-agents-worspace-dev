# Re-test de ParaBank con `beta.14` — el peldaño que resolvía y no dejaba nada que emitir

**2026-08-22/23.** Target: `https://parabank.parasoft.com/parabank/index.htm`.
Workspace: `Demos/Presentacion/11-08/qa-automator/loop-parabank`, **instalación limpia** desde el
payload de `0.4.0-beta.14` (scaffold → `npm install` → `playwright install` → healthcheck 32/32).
Entrada: `examples/02-parabank/parabank-fd-citado.md` (S3, Forma B).

Dos cosas que traía pendientes este sitio: la **pasada doble verde**, que el run 5 dejó
«bloqueada por entorno» con ParaBank en HTTP 500 más de una hora, y comprobar si el efecto del
idioma medido en OrangeHRM se reproducía en un segundo sitio. Las dos se cierran. Y aparece el
defecto más caro de la serie.

---

## 1. El efecto del idioma se reproduce, y no era una casualidad de OrangeHRM

| FD | Pasos del walker | Bloqueados |
|---|---|---|
| `parabank-fd.md` (sin citar ni un literal) | 2 / 7 | 5 |
| **`parabank-fd-citado.md`** (mismos requisitos, literales citados) | **17 / 18** | **1** |

Misma aplicación, mismo walker, misma escalera. La única variable es si el FD cita entre comillas
los captions de pantalla. Con dos sitios midiendo lo mismo, el mecanismo deja de ser una
observación de un caso: **el refiner emite los `hint` en el idioma del documento**, y un FD en
castellano contra una app en inglés produce hints que no pueden resolver por construcción.

El único paso no ejecutado es `logout/s7` y **no es un fallo de resolución**: es
`postcondition_unmet` — tras pulsar `Log Out`, el campo `Username` no vuelve a estar en la
pantalla que el FD dice que debería. El walker lo reportó como drift y siguió. Es un hallazgo de
negocio para el QA, no una avería del producto.

### Lo que hizo bien el refiner, y conviene no perder

El FD deja **a propósito** sin citar las etiquetas de la pantalla de transferencia y las del
beneficiario. El refiner no las inventó: mandó `transfer-funds` entero a `walk_gaps` con el motivo
escrito («traducir esas descripciones a captions en inglés sería fabricar exactamente lo que la
nota de método del FD prohíbe»), y dejó `bill-pay` emitido **hasta** el paso citado, con
`blocked_after_step: "s6"`. También evitó fabricar el caption del botón de login: como el FD no lo
cita, envía el formulario con `press: Enter`.

Los tres flujos salieron **autocontenidos a la primera** — cada uno repite su login. La regla es
la que D44 añadió ayer; no puedo separar cuánto es el prompt nuevo y cuánto es varianza del
modelo, pero el check `check-walk-script --contract=` pasó en verde sin reintento.

---

## 2. D46 — `emit_locator` estaba declarado, consumido y probado. Nadie lo producía.

Con 17/18 pasos y 0 rescates, `walk-to-spec` emitió **cero** specs. Los tres flujos encolados para
el Writer, todos por lo mismo:

```
paso s2: 'anchored(label:'Username')' es notación de diagnóstico, no código Playwright
         — el walker no dejó locator emisible para este paso (D20)
```

El peldaño `anchored` existe precisamente para el legacy corporativo: campos sin `id`, sin
`label for`, sin `aria-label`, sin `placeholder` — nombre accesible vacío, etiqueta en una celda
hermana. Es el patrón de ParaBank y de medio mundo empresarial. Y era justo ahí donde el camino
determinista no entregaba nada.

**Lo que lo hace la instancia más pura de la familia D2** (declarado ↔ consumido, con el
productor ausente):

- `StepReport.emit_locator` estaba **declarado** en `walk-types.ts`, con once líneas de docstring
  explicando por qué existe y citando este mismo sitio («medido en campo, ParaBank, 3 specs
  muertos y 0 tests»).
- Lo **consumía** `walk-to-spec` (`step.locator ?? report.emit_locator ?? report.resolved_via`).
- Lo **probaba** `k046-emision-no-verbatim.test.ts`… con el campo escrito a mano en el fixture:
  `rep('s2', { resolved_via: "anchored(...)", emit_locator: 'css=[name="password"]' })`.
- `grep -rn emit_locator copilot/ src/` → cuatro apariciones, **ninguna en el productor**.

Un test que le entrega al consumidor la salida del productor prueba el consumidor y crea la
ilusión de que la función existe. Ese es el patrón, y es el que hay que cazar en el resto del
código.

### El arreglo

El walker, al resolver por un peldaño cuya notación **no es código**, deriva un locator emisible
del elemento que ya tiene en la mano:

- La whitelist sale del contract — `locators.css_fallback_attributes`, que el contract de ParaBank
  declara como `[name, id]` **desde hace meses**, con un comentario que describe exactamente este
  comportamiento. El walker no la leía.
- Se acepta **solo** si el atributo identifica a **exactamente un elemento visible**, contado
  contra la página. Un `name` repetido (radios, filas de tabla) produciría un spec que revienta en
  strict mode la primera vez que se ejecute.
- **No toca `resolved_via`**: la medición del peldaño anclado es una de las cifras del producto y
  meterle el CSS la falsearía. Por eso el campo separado existía.
- La regla de «esto es código emisible» se mudó a `walk-core.ts` y ahora la usan los **dos** lados
  (el walker para decidir si deriva, el emisor para decidir si rechaza). Dos definiciones de lo
  mismo que puedan separarse es cómo empezó todo esto.

Si no se puede derivar nada, el campo queda ausente y `walk-to-spec` sigue rehusando con motivo
— mejor que emitir un fichero que no compila.

### Medido en campo, mismo guion, mismo dom-map

| | antes | después |
|---|---|---|
| specs emitidos | **0** | **2** (`login`, `bill-pay`) |
| flujos encolados para el Writer | 3 | 1 |
| motivo del que queda | notación no emisible | `logout/s7: postcondition_unmet` (drift real) |

El POM emitido usa el fallback declarado y nada más:

```ts
this.username = page.locator('[name="username"]').filter({ visible: true });
this.password = page.locator('[name="password"]').filter({ visible: true });
this.s5       = page.getByText('Accounts Overview').filter({ visible: true });
this.billPay  = page.getByRole('link', { name: 'Bill Pay', exact: true }).filter({ visible: true });
```

Los dos semánticos siguen siendo semánticos. El CSS aparece **solo** donde no había identidad.

5 tests nuevos sobre un fixture fiel al login real (inputs sin identidad, etiqueta en celda
hermana, `name` presente, y un señuelo con `name="username"` duplicado oculto). Incluye el test de
premisa —que el peldaño siga siendo el anclado— porque sin él el resto no probaría nada.

---

## 3. La pasada doble verde, por fin

`pre-review` limpio (`tsc` 0 diagnósticos, 0 must-fix), a11y 2/2 con el scan inyectado, y la suite
**2/2 verde en dos pasadas consecutivas** (20,7 s y 19,0 s), en serie.

Se ejecutó con `QA_SERIALIZE=1` a mano. Ver §5: el default no lo hace solo, y debería.

También cerró **D39** para este sitio: el `success_signal` del contract era
`getByRole('link', { name: 'Log Out' })`, que ParaBank pinta **también en su página de error** —
por eso el setup de auth pasó en verde contra un HTTP 500 en el run 5. Ahora es
`getByRole('heading', { name: 'Accounts Overview' })`, que solo existe en la pantalla de destino.

---

## 4. Corrección: dónde se ejercita de verdad el rescate de atributo (D34)

Llevaba varios informes diciendo que ParaBank era «el único sitio donde
`rescatarAtributoDeTestId` se ejercita de verdad». **Es falso, y lo he comprobado en vez de
repetirlo**: el dom-map de ParaBank tiene **63 elementos y 0 con `test_id`**. El rescate no puede
dispararse ahí, porque no hay ningún test-id que rescatar.

Dónde sí aplica: un sitio cuyo atributo de test **no** sea el que el walker asume por defecto.
Ese es SauceDemo (`data-test`). Pero en el run de SauceDemo la autodetección acertó el atributo
(`test_id_attribute: "data-test"`, 20 verificados / 12 sin verificar / **0 desconocidos**), así
que `getByTestId` resolvió y el rescate **no hizo falta**.

Estado real, sin adornos: `rescatarAtributoDeTestId` tiene cobertura unitaria y **no se ha
ejercitado en campo en ninguno de los tres sitios**. Solo se dispara cuando la autodetección
falla, y no ha fallado. No es una carencia de la prueba: es que el caso no se ha dado.

De propina, el intento de forzarlo dejó otro dato: `verify-locators` contra las pantallas de
ParaBank reportó `session_bootstrap: "unavailable"`, `reachable: false` y **54 elementos
`unknown`**. Las pantallas están tras el login y no había storageState. Declaró su ceguera en vez
de dar 0 violaciones por bueno, que es lo que tiene que hacer.

---

## 5. D47 (abierto, no arreglado) — el default de serializar está declarado y no se aplica

`src/session-policy.ts` dice, con su razonamiento escrito, que sin política declarada y sin
medición **se serializa**: «el coste de acertar serializando son minutos; el de fallar
paralelizando es una suite intermitente». Pero `playwright.config.ts` solo serializa si
`QA_SERIALIZE=1` o si existe un `config/site-profile/<site>.json` que lo diga. Sin perfil —el caso
de ParaBank hoy— corre en paralelo.

O sea: el fail-safe está escrito en un módulo y el consumidor hace lo contrario. Familia D2 otra
vez, y esta vez lo he pisado yo (exporté `QA_SERIALIZE=1` a mano porque me acordé).

No lo arreglo en caliente porque la corrección obvia —serializar siempre sin perfil— penalizaría a
todos los sitios **sin** auth, que son la mayoría de los labs. La regla correcta es «serializa si
el contract declara `auth.enabled: true` y no hay perfil medido», y para eso el config tiene que
saber qué contract corresponde al run, que hoy no sabe. Es diseño, no parche.

---

## 6. Lo que sigue sin verificarse

- **La rama de sesión única de la sonda.** Sigue sin campo. ParaBank era un buen candidato (JSP
  con sesión de servidor) pero la sonda es **intrusiva** —abre dos sesiones del `john` compartido
  de una demo pública— y ese gate lo decide una persona, no yo. Sigue a un comando de distancia.
- **`transfer-funds` y el camino asistido.** El flujo que el FD deja sin citar a propósito
  requiere el panel (`assist: true`) y un humano señalando, que es justo lo que mide la memoria de
  alias (D23/D27). Sin eso no hay `alias-hit` que comprobar.
- **RF-002** (bloqueo de acceso sin sesión) sigue sin oráculo: el FD no dice cómo se manifiesta.
  El refiner lo dejó en `walk_gaps` con `Q-001`. Correcto, y un criterio sin cubrir.
- **D33.** La suite completa falló una vez (9 de 813, todos en ficheros que lanzan navegador,
  873 s) y pasó limpia en la re-ejecución del **mismo código** (813/813, 377 s). Es la deuda de
  flakiness bajo carga, no una regresión — pero la primera vez perdí la lista de fallos por
  filtrar la salida con `Select-Object -Last`, que es el antipatrón que llevo días documentando.
