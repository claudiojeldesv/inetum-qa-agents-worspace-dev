# Loop de convergencia — OrangeHRM (2026-08-22)

Target: `https://opensource-demo.orangehrmlive.com/`, módulos **Login / PIM / Leave**.
Versión: `0.4.0-beta.13` para el run; los parches D44/D45 que salieron de este loop van en `beta.14`.
Workspace del run: `Demos/Presentacion/11-08/qa-automator/loop-orangehrm` (instalación limpia).

Dos carriles independientes contra el mismo sitio:

1. **Batería de sonda** — ocho casos construidos para exponer al walker, con el veredicto
   esperado **declarado por escrito antes de ejecutar nada**.
2. **Carril de negocio** — el recorrido real `FD → refiner → walk-script → walker → specs →
   suite`, repetido dos veces regenerando desde el refiner.

El criterio de parada acordado: **4 iteraciones o 2 runs verdes consecutivos**. Cerró en 2.

---

## 1. La batería de sonda: 8/8, cero EQUIVOCADO

Expectativas en [`docs/test-plans/orangehrm/sonda-walker-esperado.md`](../test-plans/orangehrm/sonda-walker-esperado.md),
escritas antes del run. Si se hubieran escrito después no serían una medición, serían una
racionalización.

| # | Qué sondea | Esperado | Medido | |
|---|---|---|---|---|
| P1 | peldaño `getByPlaceholder` | acierto | `getByPlaceholder('Type for hints...')` | ✔ |
| P2 | tier `anchored` sobre un campo **sin ningún nombre accesible** | acierto | `anchored(label:'Employee Id')` | ✔ |
| P3 | `-- Select --` ×3, todos con rol `generic` | **planta** | bloqueado, *ambiguo* | ✔ |
| P4 | `yyyy-dd-mm` como nombre accesible de 2 campos | **planta** | bloqueado, *ambiguo* | ✔ |
| P5 | 99 botones icon-only sin nombre accesible | bloqueado, **irresoluble** | irresoluble | ✔ |
| P6 | literal con espacio de cola (`'First (& Middle) Name '`) | acierto + `matched_text` | acierto, `matched_text` anotado | ✔ |
| P7 | postcondición falsa (`(0) Records Found` contra `(102)`) | `postcondition_unmet` | `postcondition_unmet` | ✔ |
| P8 | control inexistente (`Export to PDF`) | bloqueado, **irresoluble** | irresoluble | ✔ |

`stats`: 8 flujos, 48 pasos, 43 ejecutados, **5 bloqueados** (los cinco que tenían que
bloquear), 0 rescates, 1 `postcondition_unmet`.

Lo que importa de esta tabla no es que salga verde, es **dónde se plantó**. P3 y P4 son los
casos donde adivinar habría producido un test que valida otra cosa; el walker paró. Y P5/P8
bloquearon por **irresoluble**, no por *ambiguo*: los dos motivos mandan a acciones contrarias
—irresoluble se arregla señalando el elemento, ambiguo acotando con `scope`— y confundirlos
cuesta una tarde.

P2 es el caso que más dice del producto: `Employee Id` en OrangeHRM no tiene placeholder, ni
`aria-label`, ni `label for`. Solo un `<label>` suelto al lado. El tier `anchored` lo resolvió.
Es el patrón de medio mundo empresarial.

---

## 2. El A/B del idioma: la variable era el FD, no el walker

Tres sitios, mismo walker, misma escalera:

| FD | Sitio | Pasos resueltos | Bloqueados |
|---|---|---|---|
| sin citar literales | ParaBank | 2 / 7 | 5 |
| sin citar literales | SauceDemo | 6 / 23 | 17 |
| **con literales citados** | **OrangeHRM** | **22 / 22** | **0** |

Y OrangeHRM es el más difícil de los tres: SPA en Vue, ni un `label for`, ningún `<select>`
nativo, cero `data-test` en el formulario de búsqueda.

El mecanismo, medido y no inferido: el refiner emite los `hint` **en el idioma del FD**. Con un
FD en castellano contra una app en inglés emite `{"label": "nombre de usuario"}` y la escalera
no tiene nada que buscar. Con el FD citando `"Username"` emite `{"label": "Username"}`.

**Consecuencia operativa**: la palanca más barata del producto no está en el walker, está en
pedirle al cliente un FD que cite los literales de pantalla. Cuesta una frase en el brief.

---

## 3. El carril de negocio, dos iteraciones

### Iteración 1

`22/22` pasos, 0 bloqueados, 0 rescates. `walk-to-spec` emitió **3 specs y ningún flujo
encolado para el Writer** — la primera vez en todo el proyecto que el camino determinista
entrega la suite entera a coste cero. 3/3 verdes en dos pasadas.

Coste: **18 minutos activos y UNA invocación de subagente** (el refiner). Sin planner, sin
discovery-analyzer, sin Writers, sin Reviewers.

### Iteración 2 — misma entrada, guion distinto

Mismo FD, mismo prompt, mismo agente. Y el refiner emitió **otra cosa**:

| | iteración 1 | iteración 2 |
|---|---|---|
| nombres de flujo | `pim-employee-list` | `view-employee-list` |
| ref a fixtures | `$fixtures.credentials.0.password` | `$fixtures.credentials[0].password` |
| login en flujos 2 y 3 | repetido dentro de cada flujo | **solo en el flujo 1** |
| `click "Search"` en Leave | sí | no |
| hint de navegación | `{"text": "PIM"}` | `{"name": "PIM"}` |

Tres de esas cinco diferencias son inocuas y una fue **mejor** que la iteración 1:

- Las dos sintaxis de fixture funcionan: `resolveFixtureRef` ya aceptaba puntos e índices. No
  era un defecto — era robustez que ya estaba puesta.
- `{"name": "PIM"}` resolvió, aunque por el **peldaño débil** (texto visible, el último de la
  escalera). El walker lo declaró en la salida en vez de callarlo.
- El `click "Search"` de la iteración 1 sobraba: `No Records Found` aparece al navegar. La
  iteración 2 lo dejó fuera, lo marcó como `Q-002` abierta, y **acertó**. La pregunta abierta
  quedó resuelta empíricamente por el walker.

La cuarta produjo **D44**.

### Resultado

`21/21` pasos, 0 bloqueados, 0 rescates, 4 pantallas. 3 specs emitidos, 0 encolados, $0.
`pre-review` limpio (`tsc` 0 diagnósticos, 0 must-fix), a11y 3/3 con el scan inyectado.
**3/3 verdes en tres pasadas consecutivas.**

Con esto el loop cierra: **2 regeneraciones completas y verdes**.

---

## 4. D44 — un flujo que hereda la sesión del anterior está roto por construcción

La iteración 2 puso el login solo en el primer flujo y arrancó los otros dos con `click "PIM"`.
El esquema lo dio por **VÁLIDO** —lo es— y el fallo apareció con el navegador ya arrancado, en
el segundo flujo, como *«hint irresoluble»*.

Ese mensaje manda a mirar el hint. El `aria_snapshot` del `rescue-request.json` decía la verdad:

```
- heading "Login" [level=5]
- textbox "Username"
- textbox "Password"
- button "Login"
```

La pantalla era la de **login**. El walker aísla la sesión entre flujos (D42) y vuelve a `entry`
antes de cada uno, a propósito: sin eso un flujo hereda la contaminación del anterior. La
consecuencia —que todo flujo tiene que ser autocontenido— no la decía **ningún** contrato.

**La iteración 1 no acertó por saber la regla. Acertó porque le salió así.**

### El arreglo, y por qué no es prosa

Se comprueba en `copilot/src/check-walk-script.ts`, con el contract delante:

- Si `auth.enabled: true`, todo flujo tiene que rellenar algo de `$fixtures.credentials`.
- `"unauthenticated": true` en el flujo lo exime (pantalla pública, login inválido).
- Sin `--contract` la comprobación **no corre**, y la salida lo declara (`aviso: sin
  --contract...`). Una comprobación que se salta en silencio se lee como «comprobado y bien»:
  es exactamente la raíz de D30.

El prompt del refiner también lo dice ahora, pero **como respaldo, no como mecanismo**:
arreglar al productor con prosa es una moneda al aire. D34 se arregló así y midió 18/18 en un
run y **0/31** en el siguiente con el prompt idéntico.

### El camino de recuperación funcionó

El protocolo del paso 4.b del command —devolver la salida literal del validador al mismo
refiner, un reintento y no más— reemitió los tres flujos autocontenidos **a la primera**, sin
tocar `criteria.json`. El defecto se cerró **antes de arrancar el navegador**.

---

## 5. D45 — el `baseURL` por defecto apunta a otro sitio

Se me olvidó exportar `QA_BASE_URL`. `playwright.config.ts` caía directo en
`https://www.saucedemo.com/`, los tres specs de OrangeHRM navegaron allí, la página salió en
blanco y Playwright dijo:

```
locator.fill: Test timeout of 30000ms exceeded.
  - waiting for getByPlaceholder('Username', { exact: true })
```

Con el POM **byte a byte idéntico** al de la iteración 1, que estaba verde. El mensaje manda a
mirar el locator; la causa era que la suite entera corría contra otra aplicación. Gasté dos runs
—uno de ellos «descartando paralelismo»— antes de abrir la captura, que estaba en blanco y lo
decía todo.

Es error mío de operación, pero el default es una trampa que un cliente pisa igual. Arreglado
con precedencia **`QA_BASE_URL` > `site-profile.target_url` > default**, más un aviso cuando se
cae al default teniendo un site-id que no es ese sitio. El default se queda: los labs de
saucedemo dependen de él. La regla vive en `resolveBaseUrl` (`src/session-policy.ts`) con sus
tests; el config solo la consume.

Verificado en campo en las dos ramas: sin `QA_BASE_URL` la suite sale verde tomando la URL del
perfil medido, y con un site-id sin perfil imprime el aviso.

---

## 6. Qué queda sin verificar

- **La rama de sesión única de la sonda no está probada en campo.** OrangeHRM permite dos
  sesiones simultáneas (medido: `multiple`), así que solo se ejercitó ese lado. La clasificación
  `single-last-wins` / `single-first-wins` tiene tests unitarios y los dos consumidores, pero
  ningún target real. Primera cosa que probar en un cliente de banca.
- **ParaBank sigue pendiente de re-test con beta.13.** Es el único sitio donde
  `rescatarAtributoDeTestId` se ejercita de verdad. El sitio estuvo en HTTP 500 más de una hora.
- **D44 se ha visto una vez.** Sabemos que el check lo caza y que el reintento lo cierra; no
  sabemos cada cuántos runs el refiner reincide.
- El carril de negocio de OrangeHRM **no cubre RF-002** (login inválido): el style contract solo
  declara la credencial válida y el refiner no fabrica datos de prueba. Queda en `walk_gaps` con
  su `Q-003`, que es el comportamiento correcto — pero es un criterio sin test.
