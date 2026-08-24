# A/B del FD literal — ParaBank, primera medición con payload sellado

**Fecha**: 2026-08-24. **Rama**: `design/kernel-v2`.
**Diseño escrito ANTES de correr**, con tres predicciones falsables. Las tres se contrastan abajo,
incluida la que no salió como se esperaba.

## Por qué se repite algo ya medido

El A/B previo de ParaBank (2/7 sin citar vs 17/18 citado) se midió con `0.4.0-beta.1x` **sin
sellar** y **anterior a G1/G3**. El propio proyecto declaró después que ninguna medición anterior a
`field:deploy` es reproducible, ni siquiera en la misma máquina. Ésta es la primera medición del
efecto con payload sellado.

| | |
|---|---|
| Producto | commit `d4487ce`, rama `design/kernel-v2`, **árbol sucio** (P1 del acta sin commitear) |
| Payload | `c1f9ad50ccb374ad881cb518d291608062dda206784547a28c65801d2418325a` · 139 ficheros · v0.4.0-beta.15 |
| Workspace | `C:\Users\USUARIO\qa\pb`, healthcheck **36/36** |
| Target | `https://parabank.parasoft.com/` |

El árbol sucio queda declarado en `FIELD.json` y **es una limitación real de esta medición**: el
hash del payload la fija, pero no hay commit al que volver hasta que P1 se cierre.

## Método

- **Variable**: el FD. `examples/02-parabank/parabank-fd.md` (sin citar literales) vs
  `parabank-fd-citado.md` (con captions citados). Un solo cambio entre los dos documentos.
- **Constantes**: sitio, style contract, walker, escalera, locale.
- **Aislamiento**: `workDir` y `hint-aliases` separados por brazo (`--aliases=`). Sin esto el
  segundo brazo hereda la memoria del primero y el A/B no mide nada.
- **`--rescue-budget=0` en los dos brazos**: el rescate es una llamada LLM y podría resolver un
  hint en castellano, que es justo la variable bajo estudio.
- **Sin `--assist`**: una persona señalando es otra variable (y es el experimento E8).
- Guiones validados con `check-walk-script --contract=` antes de tocar navegador. **Los dos
  válidos a la primera** — ninguna reemisión, que es lo que D1 existía para forzar.
- Acuses de los dos refiners verificados con `verify-ack` (D28) antes de darlos por buenos.

## Resultado

| Brazo | Pasos | Resueltos | Bloqueados | Rescates | Asistencias |
|---|---|---|---|---|---|
| sin citar | 11 | **2** (18%) | 9 | 0 | 0 |
| **citado** | 12 | **12** (100%) | **0** | 0 | 0 |

Los 2 del brazo sin citar son los dos `goto`: no llevan hint, así que no pueden fallar por idioma.
**Ni un solo paso con hint resolvió en el brazo sin citar.**

### P1 — el efecto existe. Confirmada.

18% vs 100% dentro del mismo sitio, mismo motor, mismo día. El efecto es más grande que en la
medición anterior (2/7 = 29% vs 17/18 = 94%), aunque los denominadores no son comparables porque
cada refiner emitió su propio guion.

### P2 — el mecanismo es el idioma, no la escalera. Confirmada, y limpia.

Los 9 bloqueos, clasificados: **9 de 9 son de la clase que predice el mecanismo. Cero fallos de
escalera.**

| Clase | N | Ejemplo |
|---|---|---|
| `hint irresoluble` con hint en castellano | 7 | `fill` sobre `label: "nombre de usuario"` |
| `drift: postcondición no observada`, texto en castellano | 2 | `expect_text "resumen de cuentas"` |

Ni un caso de «hint correcto, elemento presente, la escalera no lo encuentra». Si lo hubiera
habido, el mecanismo publicado sería falso y habría un defecto de escalera atribuido al FD desde
hace tres sitios. No lo hay.

### P3 — nada resolvió al elemento equivocado… pero salió otra cosa. Ver D56.

Ningún paso resolvió en silencio a un elemento distinto del pretendido. Los peldaños del brazo
citado son legibles y coherentes con el sitio (JSP sin `label for`):

```
login/s2   fill        anchored(label:'Username')
login/s3   fill        anchored(label:'Password')
login/s5   expect_text getByText('Accounts Overview')
logout/s6  click       getByRole('link', { name: 'Log Out', exact: true })
logout/s7  expect_text getByText('Username')
```

`anchored` ×4 es el peldaño que existe **para** el legacy corporativo, haciendo su trabajo.

---

## D56 — el oráculo que ya era cierto antes de empezar

**El hallazgo del día, y no estaba en las predicciones.**

`logout/s7` es `expect_text "Username"`: la postcondición con la que el refiner comprueba que,
tras cerrar sesión, el sistema devolvió al cliente a la pantalla de acceso. Pasó en verde.

El problema es que **ese literal ya era cierto en el estado inicial del flujo**. Probado con los
artefactos del propio run, sin volver a la aplicación:

- `logout/__entry` y `logout/s1` navegan a `index.htm`.
- `logout/s2` resolvió `anchored(label:'Username')` **en esa misma pantalla**, antes de ningún login.
- El `dom-map` registra `Username` en el `business_text` de la única pantalla capturada.

O sea: la aserción de que el logout funcionó **se cumple igual si el logout no se ejecuta**, si la
sesión nunca se abrió, o si la aplicación devuelve la pantalla de acceso por un error. No es un
verde falso —el logout sí ocurrió— es un **verde sin poder discriminante**, que es el que no avisa
el día que se rompa.

**Es la familia de D39 con el rol invertido.** D39 midió que una señal de éxito de auth (`Log Out`
visible) se satisfacía con una página de error HTTP 500. La lección quedó escrita, y está en el
`auth` del style contract de este mismo sitio:

> D39 — la señal de éxito tiene que existir SOLO en la pantalla de destino.

Esa regla se aplica **a la señal de auth del contract**. No se aplica a las postcondiciones que
emite el refiner, que nadie comprueba contra esa propiedad. El refiner no tuvo la culpa: el FD
citado no cita ningún literal exclusivo del estado post-logout, así que eligió el único que el FD
le daba para «pantalla de acceso».

### Por qué es arreglable de forma determinista

El walker **ya tiene el dato**. Captura el `business_text` de la pantalla de entrada de cada flujo
antes de ejecutar ningún paso. Una postcondición cuyo literal ya está presente en el estado
inicial del flujo es comprobable sin LLM y sin red:

> `MF-oraculo-no-discriminante`: si el `value` de un `expect_text` terminal ya aparece en el
> `business_text` del `__entry` de su flujo, el oráculo no distingue el resultado del punto de
> partida. Marcar, no bloquear — puede ser legítimo en un flujo idempotente, y el QA decide.

**Par falsable, disponible ya en este run**: la regla debe marcar `logout/s7` de
`.work/pb-citado/walk` y **no** marcar `login/s5` (`Accounts Overview`, que no está en la pantalla
de entrada) ni `logout/s5` (el mismo literal pero como paso intermedio, no terminal).

Y ahora que hay un sitio donde el QA puede decidir, la decisión tiene dónde firmarse: el acta de
P1 (`config/decisions/parabank.jsonl`) con `decision: 'fd'` si el criterio necesita un literal
mejor, o `'app'` con evidencia si el oráculo se acepta como está.

---

## Lo que este experimento NO decide

- **No dice que el brazo citado esté bien probado.** 12/12 son login y logout. `transfer-funds` y
  `bill-pay` **no produjeron pasos en ninguno de los dos brazos**: el refiner los mandó a
  `walk_gaps` por falta de fixtures de cuenta/importe/beneficiario y por `then` ambiguo. Es el
  comportamiento correcto —no fabricar— pero significa que el A/B mide el efecto del idioma sobre
  el tramo de autenticación, no sobre el de negocio.
- **Los dos brazos no son paso a paso idénticos.** El brazo sin citar hace `click` sobre
  `"iniciar sesión"`; el citado usa `press Enter`, porque el FD citado no cita el caption del botón
  de login y el refiner prefirió no inventarlo. Es la decisión correcta y a la vez una asimetría:
  11 pasos contra 12.
- **Una pasada por brazo.** No hay medida de varianza. El loop de OrangeHRM mostró que el mismo
  refiner con el mismo FD emite guiones distintos entre iteraciones.

## Reproducirlo

```bash
npm run field:deploy -- --site=parabank --dest=<ruta-corta>
```

Después, por brazo, con `hint-aliases` aislados y `--rescue-budget=0`:

```bash
npx tsx copilot/src/dom-walker.ts --script=.work/<brazo>/walk-script.json --contract=config/style-contracts/parabank.yaml --base-url=https://parabank.parasoft.com --work-dir=.work/<brazo>/walk --rescue-budget=0 --aliases=.work/<brazo>/hint-aliases.json
```

```bash
npx tsx copilot/src/walk-scoreboard.ts .work/pb-sin-citar/walk .work/pb-citado/walk
```
