# Estreno del command de regresión con rescate — F1 del plan del example

**El command conduce el rescate de punta a punta. Dos pasadas sobre Restful Booker, cero
relanzamientos, y tres defectos que solo aparecen ejecutándolo — uno de ellos del motor y peligroso.**

Fecha: 2026-09-04. Branch `design/example-rbp`. Decisión **E-17** del
[plan del example](../tasks/plan-example-rbp.md): el command se prueba **antes** de construir el resto
del example, y lo pruebo yo siguiendo su propio texto al pie de la letra — salirme del texto para que
funcione cuenta como defecto del command, no como licencia.

Workspaces desplegados con `field:deploy` (limpios, fuera del repo): `qa/rbp-spike` (pasada 1) y
`qa/rbp-spike2` (pasada 2, con los arreglos dentro). Healthcheck 39/39 en los dos.

---

## 1. Qué se midió

| | Pasada 1 (sin arreglos) | Pasada 2 (con arreglos) |
|---|---:|---:|
| pasos del guion | 111 | 111 |
| ejecutados | 101 | 93 |
| bloqueados | 10 | 18 |
| presupuesto de rescate | 3 | 4 |
| rescates pedidos | 3 | 4 |
| **contestados por mí** | **3** | **4** |
| **relanzamientos (`exit 42`)** | **0** | **0** |
| turnos gastados esperando | 0 | 0 |

**Cero relanzamientos es el titular.** El walker se paró siete veces en total, esperó en la misma
pantalla y siguió desde el mismo paso. Con el camino viejo, cada una de esas siete habría matado el
proceso y la reanudación habría re-ejecutado el flujo desde su primer paso.

Las dos pasadas **no son comparables entre sí** en pasos ejecutados y bloqueados, y decirlo importa: el
sitio es un demo de estado compartido y el catálogo de habitaciones cambió entre ellas (§4).

## 2. Lo que funcionó tal como se diseñó

**El stage `esperar` cumple su razón de ser: cero turnos de sondeo.** Siete paradas, siete turnos, uno
por decisión. El bloqueo devuelve el control solo cuando hay una petición (`exit 3`) o cuando el run
terminó (`exit 0`), así que no hubo ni un «sigo esperando».

**El pre-flight de compliance bloquea de verdad** (regla dura #3, sin override): con
`--base-url=https://automationintesting.online` (sin barra final) salió `exit 2` con regla **C1**; con la
barra, aviso **W1** y `exit 3` pidiendo acuse. Dos desenlaces distintos por un carácter, lo que tiene una
consecuencia para las guías (§5).

**La petición trae su propio protocolo.** El campo `instructions` que escribe el motor ya dice la
gramática permitida y la regla de no inventar. El command no tiene que duplicarlo, y eso lo hace
resistente a que la gramática del motor cambie sin que nadie actualice la prosa.

**El snapshot podado basta para decidir.** En las siete paradas no necesité abrir ningún fichero más:
`hint`, `scope`, `budget_remaining` y el `aria_snapshot` de la vecindad llegaron en el JSON del stage.

**Las reglas del juicio mordieron dos veces, y con motivo verificable:**

- `cp007/s8` (campo de precio): dos `textbox` en el formulario, ninguno con label, placeholder ni nombre
  accesible. **Declinado** — elegir por posición podía escribir el precio en el número de habitación.
- `cp001/s5` (pasada 2): el paso pide «Book now» con ámbito `{text:'Single'}` y en la pantalla solo había
  dos tarjetas, **Double** y **Suite**. **Declinado** — «Single» aparecía solo como `alt` de imagen, no
  como habitación del catálogo.

**Y los locators por contenido funcionan donde la posición sería frágil:** `cp007/s6` y `s7` se
resolvieron con `getByRole('combobox').filter({ hasText: 'Suite' })` y `filter({ hasText: 'false' })` —
dos comboboxes sin testid, distinguidos por lo que contienen y no por el orden en que están.

## 3. Los tres defectos que solo aparecen ejecutando

### D95 — el rescate era más permisivo que el motor al que alimenta (del MOTOR, y es el grave)

El camino del rescate aceptaba `count >= 1` y hacía `loc.first()` cuando había varios, anotando
`resolved: true` **sin decir en ningún sitio que la respuesta había sido ambigua**.

Medido: `getByRole('combobox')` matcheaba **dos** comboboxes del alta de habitación —el tipo y el
accesible—, se aplicó al primero y **acertó por suerte**. El formulario siguiente donde el orden sea el
otro escribe en el campo equivocado y el run sale verde.

La asimetría es lo que lo hace injustificable: la escalera de resolución del propio motor **exige
unicidad** — en el mismo run bloqueó `Contact` con «matchea VARIOS elementos» y lo mandó al panel. Es
además el patrón que la literatura del self-healing señala como el fallo peligroso: curación silenciosa
del elemento equivocado.

Ahora `count > 1` bloquea el paso con el desenlace nombrando la conducta. Un `.nth(N)` deliberado sigue
valiendo (ahí `count` es 1): lo que se rechaza es la ambigüedad **sin cualificar**.

**Falsificado en campo con el mismo input**: en la pasada 2 respondí a propósito `getByRole('textbox')`
al paso que la pasada 1 había aceptado en silencio, y el dom-map quedó así:

```
cp007-alta-habitacion s8 | resolved: False | loc: getByRole('textbox')
  outcome: el locator del rescate matchea 2 elementos (getByRole('textbox')): ambiguo, no se aplica al primero
```

### D96 — `npx` + shell destrozaba los argumentos y dejaba el log a cero bytes

Dos síntomas, una causa: `npx` en Windows es un `.cmd` y lanzarlo obliga a pasar por el shell.

- `--locator="getByRole('combobox').filter({ hasText: 'Suite' })"` acabó en
  `"C:\Program" no se reconoce como un comando`. Cualquier locator con espacios o llaves —o sea, la
  mitad de la gramática— era inservible.
- La herencia de descriptores se perdía por el `cmd.exe` intermedio: **`walker.log` a 0 bytes**, y es el
  fichero que el propio command ofrece como única salida cuando algo se atasca.

Arreglo único para los dos: `node <tsx/dist/cli.mjs>` sin shell, en el spawn del walker y en las
invocaciones que el command documenta. Verificado en la pasada 2: log con contenido desde el primer
segundo (incluida la línea `RESCATE PENDIENTE ... El navegador NO se cierra`) y el locator con llaves
llegando literal.

### D97 — contestar es irreversible y no había forma de sondear

**Me pasó a mí conduciendo el estreno**, y por eso está fichado: usé `responder` para comprobar si el
comillado funcionaba, con un locator de prueba a medias (`getByRole('combobox')`, sin el filtro). Se
escribió, el walker lo consumió y **gastó uno de los tres rescates del presupuesto en una sonda**. Sin
vuelta atrás, porque el walker ya había actuado.

Dos puertas: `--dry-run` valida la gramática sin escribir nada, y contestar dos veces el mismo paso se
rechaza salvo `--rehacer` explícito. Verificado en la pasada 2: el `--dry-run` respondió `valido: true` y
`rescue-response.json` no llegó a existir.

## 4. Lo que el estreno enseñó sobre el sitio (y que cambia el example)

**El catálogo de habitaciones de RBP es estado compartido y mutable.** En la pasada 1 el paso `cp001/s5`
resolvió solo; en la pasada 2 pidió rescate porque **no había tarjeta «Single»** en la portada — solo
Double y Suite. Nadie tocó el guion entre las dos.

Consecuencia para el example, y refuerza **E-14**: el material no puede depender de que exista una
habitación concreta. El mecanismo de fechas por run que el plan ya contempla no basta para esto — el
catálogo lo cambia cualquiera que juegue con el admin del demo, incluido el propio run. Dos salidas
razonables para F2: elegir para el walk-script corto flujos que no dependan del catálogo, o que el caso
cree su propia habitación antes de reservarla. **Se decide en F2 con el guion delante**, no aquí.

**El walk-script no viaja con el template.** `docs/demo/` no se copia, así que el guion hubo que
copiarlo a mano al workspace. No es un defecto: es exactamente lo que F2 planea (el material vive en
`examples/06-restful-booker/`). Queda anotado para que no se olvide.

**Los commands tampoco viajan con el template** (`build-template` es «híbrido: solo agentes nativos, sin
comandos»): `/ia4d-qa-automator:regression` llega por el **plugin**, no por el workspace. La guía 06
tiene que decirlo, o el usuario buscará un command que no tiene.

## 5. Consecuencias para las guías del example

1. **La URL va con barra final**, literal y copiable: sin ella el pre-flight dice «URL not declared in
   allowed-targets» — que es **engañoso**, porque la URL sí está declarada; lo que falla es el patrón. No
   se toca el gate (regla dura #3), se pone la URL exacta en el comando de la guía.
2. **La guía 06 declara que el command viene del plugin**, no del workspace.
3. **El QA verá declinaciones, y son el resultado correcto.** Igual que el rechazo del texto inexistente
   en el ensayo del panel: hay que decirlo antes de que ocurra, o parece un fallo.
4. **El comando de la guía usa `node node_modules/tsx/dist/cli.mjs`** y explica por qué, para que nadie
   lo «limpie» a `npx`.

## 6. Estado

**El command se sostiene**: la alternativa de la ronda 4 (prompt canónico en la guía) **no hace falta** y
E-15 queda confirmada. El protocolo cabe en un command porque lo mecánico cabe en cinco stages y el juicio
se reduce a una cosa — el locator.

Suite: **1273/1274** en el momento del cierre; la única roja era la guarda mecánica del índice de
defectos exigiendo las filas de D95–D97, que es su trabajo. 23 tests propios del mecánico.

**Lo que este estreno NO valida**, y queda para F3 con el estreno del QA: la experiencia de alguien que
no soy yo leyendo la guía 06. Lo he conducido yo, y yo escribí el command.


---

# Apéndice — F3: recorrer el lab y escribir las guías (2026-09-04)

Las seis guías del lab 06 se escribieron **al recorrerlo**, no antes (E-12). Workspace nuevo
`qa/rbp-lab`, healthcheck 39/39.

## Lo que se verificó ejecutándolo

| Guía | Verificado de verdad | Cómo |
|---|---|---|
| 01 setup | el validador de contrato y el **estado efectivo de la sesión** | `contract-validator` sobre el contract del lab; salida transcrita literal |
| 02 autonomous | la resolución de módulo (`S4/functional`) y el pre-flight (`warn/W1`) | `resolve-mode`, `check-compliance` |
| 03 spec-refiner | la resolución (`S3/functional`), el pre-flight, y **los diez criterios con su línea del FD** | `resolve-mode`, `fd-to-criteria` en vista previa |
| 04 req-driven | la resolución (`S2/functional`) y **el parseo completo del `.feature`**: cuatro RF con `(TC-CPxxx)` y la tabla de ejemplos | `resolve-mode`, `parseFeature` |
| 05 panel | **el panel entero**, leído del shadow DOM del panel real: cabecera, diagnóstico, los tres grupos de botones y la vista de caso con la línea del FD | render + lectura; y los textos de las cinco paradas capturados del `assist-pending.json` de un run vivo |
| 06 rescate | **el ciclo completo**, cuarta pasada: tres rescates conducidos, cero relanzamientos | el command de punta a punta |

**Lo que NO se ejecutó de punta a punta**: los pipelines completos de S4, S3 y S2 (Planner + Generator
nativos). Se verificó su **entrada** —módulo, compliance, criterios— y las guías describen el resto
desde el contrato de cada command. Queda para el estreno del QA (F5), que es exactamente su función.

## Dos cosas medidas que cambiaron una guía

**Las dos «Contact»**, que el panel anuncia sin decir dónde están: medidas en el sitio el 2026-09-04 —
una en el menú de navegación (`href="/#contact"`, y=8) y otra en el pie (`href="#"`, y=3487). La guía lo
dice, en vez de mandar al QA a buscarlas.

**`--gherkin`, no `--feature`.** Al preparar la guía 04 usé `--feature=` y el resolutor devolvió
`module: "S4"` sin quejarse: se habría acabado en la puerta autónoma creyendo estar en la de requisitos.
No es un defecto del producto —el command documenta `--gherkin`— pero es una trampa fácil, y la guía la
señala con las dos salidas al lado.

## D98, que sólo apareció escribiendo la guía 05

Al recorrer el camino del panel con los plazos cortos, tres paneles caducaron y el paso siguiente murió
con `intercepts pointer events` **citando el host del propio panel**. El arreglo de D64 sólo cubría los
caminos de éxito. Detalle en el índice de defectos; verificado con el mismo input (7 bloqueados → 6, y
los seis legítimos).

Es el argumento de F3 en una línea: **una guía que se escribe recorriendo encuentra defectos que una
guía escrita de memoria no puede encontrar.**
