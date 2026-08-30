# Plan — el gate de locators medidos

**Portar la regla dura del walker al camino del planner.**

**Origen**: cierre de la gira de dominio ([gira-dominio-mifos-dolibarr.md](../findings/gira-dominio-mifos-dolibarr.md)),
donde la iteración 1 de Dolibarr dio **seis puertas del producto en verde y la suite entera en rojo**.
**Branch**: `design/kernel-v2`. **Estado**: propuesta con evidencia medida; no ejecutada.

---

## 1. El problema, con los números delante

Iteración 1 de Dolibarr: Reviewer 6/6 aprobados en iteración 0, `tsc` 0 diagnósticos, pre-review
0 must-fix, a11y 6/6. Suite **0/6**. Las tres causas:

| causa | specs | qué dice el informe de discovery HOY |
|---|---|---|
| `getByRole('heading', { name: 'Enter login details' })` | TC-001, 003, 004, 006 | la pantalla `login` es `reachable: true` con **4/4 verificados** y **cero elementos de rol `heading`**. El ancla no existe. |
| `getByRole('link', { name: 'List' })` | TC-002 | `verified: false`, `verify_reason: not-found`, `dom_matches: 0` |
| `getByRole('columnheader', { name: 'Ref.' })` | TC-005 | `verified: false`, `verify_reason: ambiguous(3)`, `dom_matches: 3` |

Es decir: **el informe ya contenía el veredicto de los tres**. Nadie lo consultó al revisar el spec.

Estado actual del informe de Dolibarr (82 elementos): `30 verified`, `42 not-found`, `3 ambiguous`,
`7 unknown`. Los tres ambiguos son exactamente `Ref.` (x2) y `Status` — los que tumbaron TC-002 y TC-005.

## 2. Por qué existe el hueco

`verify-locators` nació en [quality-greens-plan.md](../audit/quality-greens-plan.md), Fase Q2, bloque A.1,
con esta redacción:

> los que no resuelven se marcan `unverified` y **el Writer tiene prohibido usarlos sin TODO**

Se construyó la mitad que **mide**. La mitad que **impide** nunca se construyó. La prohibición vive en
prosa, en el mensaje de audit-log de la propia herramienta, y el scaffolder cumple la letra emitiendo
un comentario `// TODO writer: locator no verificado contra el DOM`. Ese TODO es documentación, no una
puerta: el Writer assertó encima igual y el Reviewer lo aprobó.

Es la misma forma que D46 y toda la familia D2: **un productor y un consumidor donde el dato se declara
y nadie lo lee.** Aquí el dato es el veredicto por elemento.

Y el contraste que da nombre al plan: el walker **sí** tiene la regla (K0.33 en `copilot/src/walk-core.ts`,
"≥2 coincidencias → se planta; ningún peldaño más flojo puede arreglar eso"). El camino del planner no.

## 3. Diseño

Tres componentes independientes. G1 y G3 son baratos y no necesitan navegador nuevo; G2 sí.

### G1 — regla estática `MF-locator-no-medido`, dentro de `pre-review`

**No es una etapa nueva del pipeline.** `pre-review` ya corre tras los Writers (paso 11.c de
`run-s4-mecanico`, antes del Acto 5 que ejecuta la suite), ya recibe `--discovery-report`, ya consulta
`el.verified === false` para `MF-postcondition`, y ya sigue los imports relativos del spec para
alcanzar los POM (maquinaria de `MF-wait-budget`). La regla nueva es hermana de las que ya hay.

**El objetivo primario es el POM, no el spec.** Medido sobre el corpus: los specs de Dolibarr casi no
contienen locators — todos viven en `tests/pages/dolibarr/*.page.ts`. Un gate que solo mire el spec no
ve nada.

Falta escribir un extractor de `getByRole/getByLabel/getByPlaceholder/getByText/getByTestId`; el que
existe hoy (`LOCATOR_CALL`) solo cubre `.locator('...')` para MF-1/MF-1b.

**Tabla de veredictos** — para cada ancla extraída, cruzada contra el informe por (rol, nombre):

| caso | estado en el informe | veredicto |
|---|---|---|
| ancla presente, `verified: true` | medida y única | pasa |
| ancla presente, `ambiguous(n)` | medida, n≥2 | **must-fix** (regla dura K0.33) |
| ancla presente, `not-found` | medida, 0 | **must-fix** |
| ancla ausente, pantalla `reachable: true` | medida por omisión | **must-fix** — "ancla no medida" |
| ancla ausente, pantalla `reachable: null` o `false` | no medida | **should-fix** + hueco de cobertura declarado. Nunca verde silencioso. |
| ancla no verificada + desambiguador (`exact: true`, `.first()`, `.filter()`) | el arreglo invalida la medida previa | **must-fix** — "arreglo sin remedir" |
| rol pelado sin nombre (`getByRole('row')`) | no lleva palabras del guion | **no aplica** la regla dura (K0.41) → territorio de G2 |

Las dos últimas filas son las que dan valor por encima de un `grep`:

- **"arreglo sin remedir"** es exactamente el fallo de TC-004 en la iteración 2: añadir `exact: true`
  convirtió `ambiguous(2)` en `element(s) not found`. Un desambiguador cambia lo que se midió, así que
  el veredicto anterior deja de aplicar y hay que volver a medir. Hoy nadie lo dice.
- **K0.41** evita el falso positivo masivo: un `getByRole('row')` sin nombre no es la ambigüedad de la
  que habla la regla — es que todavía no se ha preguntado por el vocabulario. Sin esta salvedad el gate
  marcaría cada locator compuesto y se volvería ruido.

### G2 — smoke run instrumentado, antes de que la suite sea el juez · ENTREGADO el 2026-08-30, con una desviación escrita

**Lo entregado** (bloque «la IA usa el walker», continuación 2026-08-30):

- **La separación de rojos** — `npm run qa:smoke` (`src/scripts/smoke-run.ts`): corre el lote con el
  runner real (`--reporter=json`) y clasifica cada rojo por el SITIO del fallo: `locator` (lo
  arregla el Writer), `asercion` (posible defecto del PRODUCTO — el Writer NO la toca; se escala),
  `entorno` (la guarda D43: el propio error nombra la variable) y `desconocida` (declarada, no
  inventada). El borde que decide todo, probado: un expect que expira menciona «waiting for» y AUN
  ASÍ es aserción. Salida JSONL + resumen + audit; exit 2 con rojos.
- **El cazador de EQUIVOCADO** — `MF-eligio-a-ciegas` en pre-review: un `.first()`/`.nth()` cuya
  base la MEDICIÓN declara `ambiguous(n)` es must-fix AUNQUE el test esté verde (la clase
  firstInvoiceRefLink). Misma disciplina anti-ruido que G1: sin medición, sin elemento medido o sin
  pantalla acotada, NO aplica — y un `.first()` sobre base única medida no molesta.

**La desviación, deliberada y con su porqué**: el plan pedía un fixture activo bajo `QA_SMOKE=1`
que registrara `count()` en el momento de usar cada locator. Eso exige o tocar el import del
spec-template (el golden que fijan K0.43 y los checks SF) o parchear playwright-core por preload —
las dos con más coste que valor hoy, porque el desenlace EQUIVOCADO que esa mitad cazaba lo caza
`MF-eligio-a-ciegas` con el dato que verify-locators YA mide. `QA_SMOKE=1` queda exportado y
reservado por si el fixture se materializa.

Diseño original:

#### G2 — smoke run instrumentado, antes de que la suite sea el juez

Un run por spec contra el sitio, con un fixture activo solo bajo `QA_SMOKE=1` que envuelve la
resolución y registra, por cada locator usado, su `count()` en el momento de usarlo. Sale un JSONL,
no toca el código generado.

Dos salidas, no una:

1. **verde/rojo**, separando dos clases de rojo que **no** se pueden tratar igual:
   - rojo porque el locator no resuelve → el Writer lo arregla, legítimo;
   - rojo porque falla la aserción → posible defecto del producto bajo prueba. El Writer **no** toca
     la aserción; escala al informe.

   Sin esa separación el gate le enseña al Writer a escribir tests que pasan, y eso es peor que no tenerlo.
2. **conteo por locator**: `count() >= 2` sin desambiguador explícito es must-fix **aunque el test esté
   verde**. Esta es la única pieza que caza el desenlace `EQUIVOCADO`, y hay un caso real que lo prueba:
   `firstInvoiceRefLink` resolvía al enlace de ordenación de la cabecera en vez de a la fila, con el
   test en verde. Ninguna capa estática puede verlo.

### G3 — que el verificador diga el nombre accesible real

Cuando `checkElement` obtiene `count === 0` o `count > 1`, preguntar al DOM los nombres accesibles de
los candidatos y guardarlos en el elemento (`accessible_names_found`). Coste: una consulta más solo en
el camino de fallo.

Hoy el informe dice `not-found` y ahí muere el hilo: el Writer prueba `exact: true`, falla, y hacen
falta dos iteraciones. Con el nombre real delante es un intento. Es el arreglo de la causa de TC-004
declarada como abierta en el informe de la gira ("nombre accesible ≠ caption visible").

## 4. Iteraciones de comprobación

Diseñadas como experimentos falsables, con la predicción escrita **antes** de correrlos. El corpus
existe y está intacto: `loop-dolibarr/.work/dolibarr/iter1/` (iteración 1, seis specs + POMs) y
`loop-dolibarr/tests/` (iteración 2).

**I1 e I2 van primero y deciden si el resto se construye.**

### I1 — réplica en seco contra el corpus rojo (solo G1)

Entrada: los seis POM/spec de la iteración 1 + el informe de discovery **actual** (post-D51/D52).

> Nota honesta sobre la dependencia: en el momento de la iteración 1 el informe estaba entero en
> `unknown` (el muro de login, D50), así que G1 **no** habría cazado nada entonces. Es D51+D52 lo que
> hace posible este gate. El experimento mide el gate con los datos de hoy, no reescribe la historia.

**Predicción**: 6/6 specs marcados, en tres categorías — 4 por "ancla no medida" (`heading`), 1 por
`not-found` (`List`), 1 por `ambiguous(3)` (`Ref.`).

**Criterio de muerte**: menos de 6/6 → el emparejamiento de anclas está mal diseñado y hay que rehacerlo
antes de seguir.

**Salvedad conocida que puede aparecer aquí**: el informe marca `List` como `not-found` pero una
re-comprobación en vivo dio 1 coincidencia (contradicción abierta en el informe de la gira). Si se
confirma, G1 estaría marcando un locator que funciona — un falso positivo por dato rancio, y un
argumento a favor de G2 sobre G1. Hay que medirlo, no taparlo.

### I2 — falsos positivos contra corpus verde (solo G1)

Entrada: los POM/spec **verdes** de SauceDemo, ParaBank y OrangeHRM, con sus informes.

**Predicción**: 0 must-fix.

**Criterio de muerte**: un must-fix sobre un spec que corre verde es un falso positivo. Por encima de
~20% de specs con falso positivo, el gate se vuelve una molestia que se ignora, y la decisión honesta
es degradarlo a should-fix informativo en vez de forzarlo.

I2 es el contrapeso imprescindible de I1: sin él tendría una regla afinada para marcarlo todo.

### I3 — réplica contra el corpus de la iteración 2

**Predicción**: TC-004 lo caza el veredicto "arreglo sin remedir". TC-002 y TC-005 **no** los caza:
su fallo es `toHaveURL` exacta contra una URL con paginación en el query string, otra clase de defecto.
Declararlo por adelantado evita venderle al gate un mérito que no tiene.

### I4 — G3 sobre Dolibarr

**Predicción**: el nombre accesible real de la columna `Ref.` no es exactamente `Ref.`. Si G3 lo revela,
TC-004 se arregla en un intento. Barato y cae de inmediato.

### I5 — G2 sobre el corpus · SINTÉTICA el 2026-08-30; la del corpus, pendiente del corpus

**El corpus de campo no está en esta máquina** (los planes lo daban por intacto; no lo está — está
anotado en la memoria del proyecto). La I5 corrió en versión sintética con la MISMA forma del caso
real: cabecera y fila comparten (rol, nombre), la medición dice `ambiguous(2)`, el spec elige con
`.first()` — y `MF-eligio-a-ciegas` lo marca con el test en verde, con su par de control (base única
→ silencio). La I5 contra el corpus real queda pendiente de que el corpus vuelva.

Diseño original:


**Predicción**: el conteo marca `firstInvoiceRefLink` con `count >= 2` en un spec **verde**. Es la única
prueba del valor propio de la mitad dinámica; si no lo caza, G2 no se justifica.

### I6 — coste extremo a extremo en un sitio nuevo

Los dos que quedan de la gira (`the-internet.herokuapp.com`, `automationexercise.com`). Mide el coste
real con el gate puesto, y si evita una iteración 2 completa.

## 5. Coste, medido

Del run de Dolibarr (`playwright-results.json`, 6 specs):

| | valor |
|---|---|
| suma de duraciones por spec | **66,7 s** |
| wall-clock en paralelo | **23,8 s** |
| media por spec | ~11 s |

- **G1 y G3 no añaden tiempo medible**: G1 es AST + lookup contra un JSON que ya existe; G3 es una
  consulta extra solo cuando el conteo ya falló.
- **G2 añade el run**: +24 s de wall-clock en paralelo, +67 s si el target obliga a serie
  (`session.serialize`). En una suite de 20 specs serializada serían ~4 min.

**Esta medida corrige mi propia recomendación previa.** Había supuesto que en targets serializados el
coste justificaría dejar G2 en opt-in; con 67 s en el peor caso medido, no lo justifica frente a un pase
de Writer, que son minutos. G2 puede ir por defecto y el knob queda para suites grandes serializadas,
donde el escalado sí muerde.

El coste dominante de este pipeline son los turnos de LLM, no el navegador. Lo que G2 puede añadir son
pases de Writer cuando el smoke sale rojo — y esos son exactamente los casos que hoy se convierten en
una iteración 2 completa (seis Writers, seis Reviewers y una sesión de diagnóstico a mano).

**Dónde es impuesto sin retorno**: el spec que habría salido verde igual. En Dolibarr eso fue 0 de 6.
En SauceDemo, OrangeHRM y ParaBank la mayoría sale verde a la primera y ahí el balance se invierte:
se pagan seis runs y no se evita ninguna regeneración. Siguen siendo segundos, pero es coste neto.

## 6. Dónde toca el código

| componente | fichero | naturaleza |
|---|---|---|
| G1 extractor `getBy*` | `src/scripts/pre-review.ts` | nuevo; hoy solo existe `LOCATOR_CALL` para `.locator()` |
| G1 emparejamiento y veredictos | `src/scripts/pre-review.ts` | nuevo `criterion_id: 'MF-locator-no-medido'`, categoría `locator-strategy` |
| G1 alcance al POM | `src/scripts/pre-review.ts` | reutiliza `relativeImportsOf`, ya existe |
| G1 lectura del informe | `src/scripts/pre-review.ts` | reutiliza el patrón de `loadBusinessPostconditions` |
| G2 fixture de conteo | nuevo | activo solo con `QA_SMOKE=1` |
| G2 etapa smoke | `src/scripts/run-s4-mecanico.ts` | paso nuevo entre Acto 4 y 11 |
| G3 nombres accesibles reales | `src/scripts/verify-locators.ts` | ampliar `checkElement` en la rama de fallo |
| propagación | `npm run build:template` + `build:plugin` | obligatoria; `build:template` **preserva** `config/` |

Autochequeo del Writer (opcional, barato): el prompt del `ia4d-writer` puede ejecutar `pre-review` sobre
su propio output antes de llamar al Reviewer. Ya tiene `Bash`. Adelanta el hallazgo un turno sin tocar
la arquitectura.

## 7. Lo que este plan NO arregla

Declarado por delante para que nadie le atribuya méritos ajenos:

- `toHaveURL` exacta sobre estado compartido (TC-002, TC-005 de la iteración 2). Es mecánicamente
  detectable — una URL literal con query string dentro de un `toHaveURL` — pero es **otra regla**.
- Las fichas (`card`) siguen sin verificarse: `verify-locators` navega a `/card.php` sin id de registro.
  Los 42 `not-found` del informe de Dolibarr son en buena parte esto. G1 los marcará como "ancla no
  medida" sobre pantalla alcanzable, que es correcto pero atribuye al Writer un hueco del verificador.
  **Riesgo real de I2**: puede ser la fuente principal de falsos positivos.
- El negativo sin fixture declarado en `synthetic_fixtures` (señalado ya por tres agentes).
- D47 (serialización por defecto), abierto por decisión de diseño.

## 8. Criterio de salida y orden

1. G3 (más barato, independiente) e **I4**.
2. G1 + **I1** + **I2**. Si I2 supera el umbral de falsos positivos, G1 se degrada a should-fix y G2 no
   se construye: querría decir que el informe no es lo bastante fiable para gatear sobre él.
3. **I3** con G1 ya cerrado.
4. G2 + **I5**, solo si 2 pasó.
5. **I6** sobre uno de los dos sitios que quedan de la gira.

**Salida**: los seis rojos de la iteración 1 de Dolibarr detectados antes de ejecutar la suite, con
falsos positivos por debajo del umbral en tres corpus verdes, y el caso `EQUIVOCADO` de TC-003
detectado con el test en verde.

**Commit previsto**: `feat(pre-review,verify-locators): gate de locators medidos — la regla dura del walker en el camino del planner`
