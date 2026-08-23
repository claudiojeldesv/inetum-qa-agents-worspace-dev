# Gira de dominio — Mifos X (caído) y Dolibarr (2 iteraciones)

**2026-08-23.** Primeros dos sitios de la gira de aplicaciones de **negocio** reales — no showcases
de widgets. Objetivo: un plan de regresión hecho por el planner nativo (5-6 casos) y dos
iteraciones completas de generación y ejecución, para ver qué salta.

Versión: `0.4.0-beta.15` + los parches D48–D52 que salieron de aquí. Workspaces desplegados desde
el payload, instalación limpia, healthcheck 32/32 en los dos.

---

## 1. Mifos X — caído, y la comprobación de disponibilidad que mentía

`demo.mifos.io` (core banking Angular sobre Apache Fineract) quedó **descartado por entorno**:

```
GET /                                      200   (shell Angular, 89 KB)
GET /fineract-provider/actuator/info       502   Bad Gateway
GET /fineract-provider/api/v1/authentication  502
```

El frontend sirve; el backend detrás del proxy no. El planner lo reprodujo 7 veces en 9 minutos
con esperas crecientes antes de rendirse, y **se negó a escribir los casos** de Clientes,
Préstamos, Ahorros y Contabilidad porque habría tenido que inventar literales. Correcto.

**Lección para mí, no para el producto**: mi comprobación previa de disponibilidad hizo un GET a
la raíz, vio 200 y dio el sitio por bueno. En una SPA eso mide **el shell**, no la aplicación. Un
200 en `/` no dice nada; hay que tocar un endpoint del backend.

Queda pendiente de reintento. La pantalla de acceso sí se midió: campos `Username` y `Password`,
botón `Login` (deshabilitado hasta rellenar ambos), selectores `Tenant` (`default`) y `Server`.

---

## 2. Dolibarr — el plan

Dolibarr ERP/CRM **23.0.1**, perfil de demo "Company manufacturing products", **solo lectura**.
Plan del planner nativo: 6 casos de regresión (Acceso ×2, Terceros, Productos, Pedidos,
Facturas), con la sección de literales medidos contra el DOM y una lista de elementos **sin
nombre accesible**. Ningún módulo descartado.

El planner aportó además un hallazgo operativo que no es un caso: el listado de productos sin
filtrar mezcla `Product` y `Service`; con el módulo `service` deshabilitado, abrir la ficha de un
Service devuelve `Access denied.` aunque el registro aparezca listado. El plan navega por el
listado filtrado (`type=0`) para esquivarlo.

---

## 3. Los cinco defectos que saltaron ANTES de generar un solo test

### D48 — el idioma de la aplicación lo decide una cabecera que nadie fijaba

Medido con tres contextos de Playwright contra la misma URL:

| `locale` | idioma servido |
|---|---|
| `es-ES` | español |
| `en-US` | inglés |
| sin fijar | **inglés** (el default de Playwright) |

Mi navegador de exploración la veía en **español**. O sea: el navegador que mide los literales y
el que ejecuta los tests pueden estar mirando **dos aplicaciones distintas**, y el síntoma sería
«hint irresoluble» — que manda a mirar el hint. Estuve a punto de sembrarle al planner los
literales equivocados.

Es el reverso del A/B ParaBank/SauceDemo/OrangeHRM: allí la variable era el idioma del
**documento**; aquí el de la **aplicación**, y lo decide el cliente HTTP.

Cerrado con un campo `locale` en el contract, honrado por `playwright.config.ts`, el walker
(incluido su replay de verificación, que si no verificaría el parche contra una página
traducida), `verify-locators` y la sonda de sesión. Sin declarar no se toca nada.

### D49 — el discovery-analyzer se inventó una URL

Le puso `url_pattern: /user/login.php` a la pantalla de acceso. **Devuelve 404**, y ese literal no
aparece en ninguna parte del plan — que dice explícitamente que al login se llega pulsando un
perfil. Una ruta que "suena a Dolibarr" es fabricación con pasos extra. Devuelto a su productor;
lo corrigió dejando el campo vacío y añadiendo notas de por qué.

### D50 — el muro de login que no redirige

`verify-locators` reportó **74 locators `unverified`** y `reachable: true` en pantallas que en
realidad mostraban el formulario de acceso: Dolibarr sirve el login **en la propia URL pedida,
con 200 y sin redirigir**, así que la guarda de ruta que ya existía (`landedPath !== expectedPath`)
no salta.

Y `unverified` **miente en la dirección cara**: se lee como «estos locators están mal» y manda al
QA a arreglar 74 locators correctos. Cerrado con una detección post-hoc y genérica: si no resolvió
**ni uno** de los elementos esperados y hay un campo de contraseña a la vista, el veredicto pasa a
`unknown` con motivo `login-wall`. En la pantalla de login de verdad sus propios elementos sí
resuelven, así que no se dispara. Resultado: de `74 unverified` a **82 `unknown`** — de acusar a
declarar ignorancia.

### D51 — el manejador de auth da por hecho que el login vive en una URL

`auth.enabled: true` monta un setup que navega a `login_path`, rellena y guarda `storageState`.
Aquí la portada es un selector de perfiles y hay que **pulsar** uno; navegar directo rebota. No es
una rareza del demo: es la forma de los **aterrizajes SSO y los selectores de tenant** de banca y
seguros.

Cerrado con `auth.entry_steps`: una ruta de entrada **declarada** que `verify-locators` reproduce
una vez, en la gramática de locators que el producto ya tiene (`css=…` / `getBy*`), no un lenguaje
nuevo. Efecto medido:

| | antes | con la ruta declarada |
|---|---|---|
| `session_bootstrap` | `failed` | **`applied`** |
| verificados | 0 | **26** |
| no resueltos | 0 | 45 |
| `unknown` | 82 | 11 |

### D52 — la pantalla que solo existe durante la entrada

Con la ruta declarada seguía habiendo un agujero: la pantalla de login **no tiene URL** y la ruta
pasa de largo, así que no se verificaba nunca. Y ahí vivía el defecto que costó 4 specs. Cerrado
con un paso `verify_screen: <pantalla>` dentro de la propia ruta: se verifica al pasar por ella.
Login pasó de `reachable: null, 0 verificados` a **`reachable: true, 4 de 4 verificados`**.

---

## 4. Iteración 1 — 0 de 6

Seis Writers, todos aprobados por el Reviewer en iteración 0, `pre-review` limpio (`tsc` 0
diagnósticos, 0 must-fix), a11y 6/6. Y **la suite en rojo entera**.

| causa | specs |
|---|---|
| `getByRole('heading', { name: 'Enter login details' })` → **no existe** | TC-001, 003, 004, 006 |
| `getByRole('link', { name: 'List' })` → **2 coincidencias** | TC-002 |
| `getByRole('columnheader', { name: 'Ref.' })` → **3 coincidencias** | TC-005 |

El árbol de accesibilidad capturado en el fallo lo dice todo: la pantalla de acceso **no tiene ni
un `heading`**. El literal `Enter login details` existe; su **rol** no. El plan lo llamó
"encabezado de formulario" y toda la cadena lo creyó.

Y `Ref.` es subcadena de `Ref. customer` y de `Project ref.`; `getByRole(..., {name})` hace
coincidencia por subcadena.

**La conclusión del ciclo, y es la importante:**

> El plan cita **literales medidos**, pero los **roles** que menciona no están medidos, y nadie
> comprueba que la pareja (rol, nombre) identifique a **exactamente un** elemento.
>
> La regla dura del walker —≥2 coincidencias visibles: plántate, no adivines— **no existe en el
> camino del planner**. El walker se habría plantado en `List` y en `Ref.`; el planner los afirmó
> y los Writers los enviaron a producción.

---

## 5. Iteración 2 — 3 de 6

Regenerados los seis con el informe ya **verificado contra el DOM** (D51+D52) y con la causa raíz
de cada rojo por delante.

**Verdes: TC-001 (login), TC-003 (productos), TC-006 (login inválido).**

**Rojos, con dos causas nuevas y distintas:**

- **TC-002 y TC-005 — `toHaveURL` es una aserción sobre estado compartido.** Las URLs recibidas
  traen `…&page=354` y `…&page=874`: la paginación del demo viaja **en el query string** y persiste
  por sesión. La regla «no assertes datos del demo compartido» se dio para los datos de pantalla y
  nadie la aplicó a la URL. Una URL exacta es un dato.
- **TC-004 — arreglar la ambigüedad con `exact: true` la cambió por lo contrario.** De
  `ambiguous(2)` a `element(s) not found`: el nombre accesible real no es exactamente `Ref.`. El
  plan citó el **caption visible**, no el **nombre accesible**, y no son lo mismo.

### El dato que explica los tres verdes

**TC-003 fue el único cuyo Writer ejecutó el spec contra el sitio real** (3 veces). Encontró lo
que ninguna otra capa podía:

- `List` resuelve a **4** coincidencias en vivo — el discovery decía `not-found`.
- `firstProductRefLink` **estaba resolviendo al enlace de ordenación de la cabecera**, porque la
  página tiene dos `table` ARIA y la fila de paginación contaba primero.
- El nombre accesible de la pestaña `Product` lleva un carácter inicial no normalizable que
  derrota a `exact: true` y a un regex `\s*`.
- `Statistics` aparece **4 veces** en esa pantalla.

Lo segundo es lo grave: **un locator resolviendo al elemento equivocado con el test en verde.** Es
el desenlace `EQUIVOCADO`, el único que el walker considera eliminatorio, ocurriendo en el camino
del planner porque ahí no hay nada que lo impida.

> Los tres Writers que razonaron sobre un informe sin ejecutar dieron rojo. El que ejecutó dio
> verde. No es una anécdota de este run: es la diferencia entre afirmar y medir.

---

## 6. Lo que hizo bien el producto, y conviene no perder

- El **pre-flight bloqueó al planner** contra un target no declarado, y el planner **no buscó
  rodearlo**: paró, explicó y pidió el alta. Incluso probó una vía alternativa y la abandonó al
  ver que era esquivar un control.
- Los subagentes **declararon sus huecos** en vez de rellenarlos: el planner con Mifos caído; el
  analizador con las URLs que no salían del plan; los Writers con las hipótesis de rol marcadas
  como `TODO` y no como hechos.
- El **Reviewer rechazó** el primer intento de TC-002 precisamente por presentar el cambio de
  `role=tab` a `role=link` como resuelto sin verificar.
- El **ownership de POM** aguantó: cuatro Writers detectaron que `login.page.ts` tenía un
  fallback CSS ya innecesario y **ninguno lo tocó**, porque no era suyo.
- **D34 se ejercitó por fin en campo**: el POM emitió
  `page.locator('#username') /* css-fallback: id — el discovery lo tomó de 'id', no de 'data-test' */`.

---

## 7. Abierto

- **Los tres rojos de la iteración 2.** Causas identificadas, sin arreglar.
- **`toHaveURL` sobre estado compartido** merece una regla del Reviewer, no un aviso en prosa: es
  mecánicamente detectable (una URL literal con query string en un `toHaveURL`).
- **Nombre accesible ≠ caption visible.** El plan debería citar los dos, o el verificador debería
  reportar el nombre accesible real cuando el literal no case.
- **Las fichas (`card`) no se verifican**: `verify-locators` navega a `/…/card.php` sin id y la
  pantalla no muestra registro. Hace falta que la ruta de entrada pueda llegar a una ficha.
- **El negativo no tiene fixture declarado.** Tres agentes independientes lo han señalado ya
  (ParaBank, OrangeHRM y aquí): `synthetic_fixtures` solo declara la credencial válida, así que el
  Writer del caso negativo tiene que inventarse el dato.
- **Contradicción sin resolver**: el discovery marca el enlace del perfil `not-found`; una
  re-comprobación en vivo da 1 coincidencia. El Writer la declaró y no tocó el informe.
- **Mifos X**, pendiente de que vuelva el backend.

De la conclusión del §4 sale un plan con diseño, coste medido e iteraciones de comprobación falsables:
[plan-gate-locators-medidos.md](../tasks/plan-gate-locators-medidos.md) — lleva la regla dura del walker
al camino del planner. Cubre el nombre accesible y el `EQUIVOCADO` de TC-003; NO cubre `toHaveURL`
sobre estado compartido ni el fixture del negativo, que siguen abiertos aquí.
