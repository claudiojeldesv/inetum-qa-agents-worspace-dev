# El primer run de campo del plugin: S3 completo contra ParaBank

- **Fecha**: 2026-08-17
- **Rama**: `design/kernel-v2` (el run se ejecutó con `0.4.0-beta.1` instalado)
- **Workspace**: `prueba-beta/`, hermano y limpio — plugin recién instalado, ni un fichero
  heredado del repo de desarrollo
- **Operador**: el QA (Claudio Jeldes), conduciendo el agente; sin acceso al código fuente
  del producto durante el run
- **Target**: `https://parabank.parasoft.com/` (S3, FD en markdown libre)

Primer ejercicio del camino que nunca se había ejecutado entero:
`setup → refiner → walk-script → walker como MOTOR → walk-to-spec → .spec.ts`.
Hasta aquí ese camino existía en piezas verificadas por separado y en tests; nadie lo había
recorrido de punta a punta desde una instalación limpia.

---

## Qué se confirmó, y por qué no se puede repetir a voluntad

**La predicción escrita antes del run se cumplió.** Estaba anotada en la sesión previa: el FD
está en castellano, la aplicación en inglés, así que *los pasos deberían plantarse en seco y
saltar el panel; si en vez de plantarse alguno actúa, se para el run*.

Lo medido: `login/s5` dio `postcondition_unmet` buscando "resumen de cuentas", los campos
fueron al panel asistido, y **ningún paso resolvió otro elemento y actuó**. Cero EQUIVOCADO en
un caso construido para producirlo — un guion entero escrito en un idioma que la aplicación no
habla es el peor escenario posible para la escalera.

Segunda pasada, con los literales medidos y **sin tocar nada más**: **8/9 pasos, 0 rescates**,
resolviendo por `anchored(label:'Username')` y `anchored(label:'Password')`. Semántico, sin
posición.

Esto es el drift de idioma FD↔app —*el* caso corporativo, FD del cliente en español sobre COTS
en inglés— resuelto **midiendo**, no adivinando. Y resuelto en el orden correcto: el walker se
plantó primero, el humano señaló, la segunda pasada fue determinista.

### K0.35 se cobró su primer hallazgo de campo

`/parabank/overview.htm` sin sesión responde con firma de página de error de servidor. Sin el
detector de K0.35 eso habría salido como `drift: postcondición no observada` + `hint
irresoluble` — dos diagnósticos que mandan al QA a revisar el plan y los locators cuando lo que
pasa es que la aplicación se cayó. Con él, sale como lo que es.

Se confirmó en una segunda ruta (`/parabank/activity.htm`): **0 elementos interactivos, 0 texto
de negocio**. Misma firma. El walker aplicó la política declarada —no ir probando rutas una a
una— y paró.

**Salvedad obligatoria antes de usar esto fuera**: ParaBank es la aplicación demo de Parasoft y
se distribuye con defectos sembrados a propósito para demostrar herramientas de testing. Ese
500 puede ser uno de ellos. Como evidencia de que *el walker lo ve a coste cero* vale igual;
como "encontramos un fallo en un portal de banca" **no se puede presentar sin verificarlo**.

### Lo demás que funcionó

| pieza | qué hizo |
|---|---|
| entrevista de `setup` | emitió el contract y **lo pasó por el validador** antes de darlo por bueno. El QA la señaló como lo mejor del run |
| gate de compliance | **bloqueó** (C1, exit 2) por URL sin barra final que no matchea el glob. No era falso positivo |
| gate de `open_questions` | RF-004 y RF-005 quedaron bloqueados. No se fabricó ni el mensaje de saldo insuficiente ni la confirmación del pago |
| guarda anti-fabricación 8.5 | el planner se quedó sin herramientas de navegador y reportó `NOT MAPPED` en vez de inventar un plan |
| `secret: true` | la contraseña salió del código a `process.env.QA_PARABANK_FD_PASSWORD` |
| `walk-to-spec` | emitió `login.spec.ts` y `logout.spec.ts` con `@criterion RF-NNN`, scan axe, `test.step()` y screenshot por paso, a **coste cero** |

**Balance final: 2 de 4 flujos cubiertos sin gastar un token de LLM.**

---

## D1 — El refiner emite un guion que el walker rechaza

**Es el defecto del ciclo**, y no por lo que cuesta sino por dónde muerde: rompe justo la
pieza que K0.42 puso PRIMERO por diseño. El walk determinista **nunca arranca a la primera** en
S3.

Primera invocación del walker: **26 errores de esquema**. No es un typo, es sistemático.

**La causa raíz, medida contra el código, no inferida**: el prompt del refiner describe un
esquema que no existe.

| `.claude/agents/ia4d-spec-refiner.md` | `copilot/src/walk-types.ts` | lo que emitió |
|---|---|---|
| línea 46: «One `flow` per criterion group, **`id`** = the RF's flow name» | `WalkFlow.flow` | `"id": "login"` |
| no lo menciona | `WalkFlow.criteria` | `"criterion_refs": [...]` |
| no lo menciona | `WalkScript.version` / `.site_id` / `.entry` — los tres exigidos | ausentes |
| no lo menciona | `WalkStep.id`, requerido y único por flujo | pasos sin `id` |
| no lo menciona | `goto` usa `target` | `goto` con `hint: {url}` |

El prompt es el bug. Un agente que sigue sus instrucciones al pie de la letra produce un
artefacto inválido, y lo hará en cada run mientras el texto diga eso.

**Y hay una segunda mitad, que es la que convierte esto en clase.** `validateWalkScript` ya
existe (`copilot/src/walk-core.ts:780`) y el walker la ejecuta al **cargar** el guion
(`dom-walker.ts:5002`). O sea: la validación existe, es determinista y es buena — pero corre en
el consumidor, no en el emisor. El error se descubre cuando el navegador ya está arrancando, no
cuando el fichero se escribe.

**El propio producto ya resuelve esta clase en otro sitio**, y es exactamente lo que el QA
señaló como lo mejor del run: `setup` emite el contract y lo pasa por `contract-validator.ts`
antes de darlo por bueno. Mismo patrón, un consumidor lo tiene y el otro no.

Coste medido de no tenerlo: una ronda de corrección del refiner por run (~25k tokens según la
estimación del propio orquestador), más el trabajo manual de extraer el contrato de tipos a
mano para devolvérselo.

---

## D2 — Es una familia, no un caso suelto

Tres instancias en el mismo run de **«algo declarado que nadie valida ni consume, y falla en
silencio»**:

1. **El walk-script sin validar al emitirlo** (D1).
2. **`action: 'fd_ingested'` no está en la unión `AuditAction`.** El command lo pide, el tipo no
   lo tiene, y entra igual porque `tsx` no typechequea. El orquestador tuvo que escribir
   `as never` para que compilara mentalmente. El audit-log —el artefacto de evidencia
   regulada— acepta valores arbitrarios sin decir nada.
3. **`synthetic_fixtures` es freeform.** Se declaró `test_amounts: [100]`, el validador lo dio
   por bueno, y el refiner **siguió sin poder emitir la transferencia** porque los `select` de
   cuentas seguían en prosa. Un dato declarado que ningún consumidor lee.

Esta es literalmente la clase que se mató en **K0.39/D1** con `getByPlaceholder`: *"el contract
es la voz del cliente y una instrucción declarada que se descarta sin avisar es peor que no
admitirla"*. Se mató **en el walker**. Está viva entera en la capa de orquestación.

No es un ticket: es un criterio que aplicar mientras se arreglan los demás.

---

## D3 — Lo medido no sobrevive al siguiente run

El paso 1.a del command **borra `.work/<site-id>` al arrancar**. Los literales en inglés
—`Log In`, `Accounts Overview`, `Customer Login`, `Username`, `Password`— costaron **dos
pasadas de walker y una sesión de grabación humana**, y un relanzamiento los tira: el refiner
volvería a partir del FD en castellano y repetiría el ciclo entero.

El orquestador lo parcheó inventando `.work/parabank-fd-snapshot/`, hermano del workDir para
esquivar la limpieza. Es un apaño suyo dentro de un run, no una pieza del producto.

**Lo grave es que el mecanismo ya existe y S3 no lo usa.** `config/hint-aliases/<site_id>.json`
(K0.5) es exactamente *"para este cliente, «nombre de usuario» → Username"*: vive fuera de
`.work/`, es durable, versionable y revisable por PR. La condición de promoción se cumplió —la
postcondición pasó en la segunda pasada—, y aun así nada se promovió.

Segundo agujero de la misma naturaleza: los tres parches del panel quedaron en
`assist-patch.json` y **no se fundieron ni se promovieron**. Lo que el humano señaló con el
ratón se capturó y no se convirtió en memoria. Dos de esos tres eran `tier: indexed`,
`fragile: true` (`getByRole('textbox').nth(0)` y `.nth(1)`) — posicionales, y correctamente
descartados por el QA a favor de la etiqueta real. Pero el tercero tampoco sobrevivió.

Que el walk-script sea artefacto del cliente y no se reescriba solo es una decisión correcta y
deliberada (K0.20). El agujero no es ése: es que **no hay ningún camino** por el que lo medido
o lo señalado llegue a memoria durable en S3.

---

## D4 — El healthcheck dijo 26/26 y el MCP no estaba conectado

`playwright-test` está declarado en `.mcp.json` y el healthcheck verifica que **el binario
responde**. Lo que no verifica —ni puede, desde fuera de la sesión— es que las herramientas
`mcp__playwright-test__*` estén vivas en la sesión que va a usarlas.

Reventó en el **paso 8**, que es el más caro del flujo: el planner arrancó, se quedó sin
herramientas de navegador y devolvió `NOT MAPPED`. La guarda hizo lo correcto; el problema es
que se llegó hasta ahí con un verde en la mano.

El propio orquestador lo dijo con las palabras exactas: *"config ≠ conexión viva en sesión"*.
Un check que no puede cubrir la única condición que importa en ese punto **no debería reportar
un verde que se lee como «listo»**.

---

## Lo demás, comprimido

| # | defecto | coste |
|---|---|---|
| D5 | `expect_state` no deja locator autoritativo → un paso **verde** (logout) se cae del emisor y su flujo se paga con una pasada de planner | ~130k tokens evitables; el orquestador lo rodeó cambiando la aserción a `expect_text` |
| D6 | El audit-log salió **partido en dos ficheros**: el refiner escribió en `.work/audit-log.json` en vez de `.work/<site>/audit-log.json` | el namespace por sitio existe para trazabilidad y lo rompió justo el artefacto de evidencia |
| D7 | No hay CLI para `appendAuditEntry`: el orquestador escribió **tres `.ts` desechables** (`log-ingest.ts`, `log-walk.ts`, `log-pause.ts`) dentro de `.work/` solo para registrar | fricción pura, y las entradas quedan redactadas por el agente en vez de emitidas |
| D8 | El command imprimió `--fd=<ruta>` como si fuera ejecutable; el QA lo pegó literal. Y la ruta que se ofreció después (`docs/demo/parabank/fd-parabank.md`) **no existe** — el spec del command cita un nombre que no es el del fixture (`examples/02-parabank/parabank-fd.md`) | deriva de documentación dentro del plugin; arreglo de un minuto |
| D9 | `--assist` estaba **declarado en el contract** (`walker.assist: true`, K0.42) y aun así se preguntó a mitad de run | el contract declarado y no obedecido: familia D2 otra vez |
| D10 | El panel se cerró solo a mitad del run de logout («algo pasó, se cerró el modal») | **sin diagnosticar y sin reproducir**. Queda nombrado |

---

## Qué NO dice este run

- **n=1, un sitio, un FD.** Nada de aquí es una tasa. Sirve para encontrar defectos, no para
  publicar cifras.
- **ParaBank no es banca.** Es una demo pública con defectos sembrados. El valor del run es que
  el camino S3 se recorrió entero contra una app de terceros desde una instalación limpia, no
  que el target sea representativo.
- **El cero EQUIVOCADO de este run no añade nada a §30.** Nueve pasos no mueven una medida de
  6.249 casos. Lo que sí aporta es que el modo de fallo bajo drift de idioma fue el previsto:
  plantarse, no equivocarse.
- **No se ejecutaron los actos 3 a 5.** Guarda de locators, scaffolder, Writer+Reviewer,
  verificación a11y y summary quedaron sin correr. Del Writer y el Reviewer este run no dice
  absolutamente nada.

---

## Orden de ataque acordado con el QA

1. **D1** — validar el walk-script al emitirlo, con el mismo patrón que ya usa `setup`, y
   corregir el prompt del refiner para que describa el esquema real. Bloquea el camino insignia
   en cada run y el arreglo ya está inventado dentro del propio producto.
2. **D3** — promoción a `hint-aliases` desde S3. Es lo que hace que la segunda ejecución se
   sienta distinta de la primera, que es el argumento comercial entero.
3. **D4** — que el healthcheck deje de dar verde donde no puede comprobar nada.

D2 no entra en la lista porque no es un ticket: es el criterio con el que se hacen los otros
tres.
