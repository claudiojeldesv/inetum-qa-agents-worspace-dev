# CLI vs MCP — el A/B que mató su propia hipótesis

**El respondedor de rescate por playwright-cli NO ahorra nada: empate al 0,1% en tokens, un 34% más
lento, calidad idéntica. El baremo lo mata. Y el porqué del empate es el hallazgo que reordena el plan:
el coste nunca fue del transporte — es del envoltorio, y el envoltorio no distingue transportes.**

**Qué es**: F1/A-B-1 de [plan-cli-en-vez-de-mcp.md](../tasks/plan-cli-en-vez-de-mcp.md). Tres pasos
bloqueados reales de los tres ciclos E2E (clase `rescate` del censo, verdad conocida, sin contaminación
en CLAUDE.md), cada uno resuelto por dos subagentes frescos idénticos salvo el instrumento: **brazo A**
con las herramientas MCP `playwright-test`, **brazo B** con `npm run qa:browse` (playwright-cli tras la
puerta F0). Más un **control**: un subagente sin tarea, para medir el suelo. Paridad dictaminada por
verificador determinista contra el DOM vivo ([.work/cli-ab/verificar.ts](../../.work/cli-ab/verificar.ts)),
taxonomía de rescue-bench. Fecha: 2026-09-01. Mismo modelo en ambos brazos (el de la sesión).

## 1. La tabla

| caso | brazo | tokens | margen sobre el suelo | reloj | veredicto vivo |
|---|---|--:|--:|--:|---|
| **control** (sin tarea, 0 tools) | — | **45.885** | — | 8 s | el envoltorio de EXISTIR |
| ab1 · EspoCRM searchbox | A-MCP | 76.760 | 30,9k | 134 s | UNICO, el input de búsqueda del listado |
| | B-CLI | 75.633 | 29,7k | 178 s | UNICO, **el mismo elemento** |
| ab2 · RBP test_id inexistente | A-MCP | 59.081 | 13,2k | 135 s | UNICO, `select#type` |
| | B-CLI | 57.952 | 12,1k | 166 s | UNICO, el mismo select |
| ab3 · Tricentis sin nombre accesible | A-MCP | 61.276 | 15,4k | 121 s | UNICO, `css=#engineperformance` |
| | B-CLI | 63.353 | 17,5k | 179 s | **el MISMO locator, carácter a carácter** |
| **total** | **A** | **197.117** | 59,4k | 390 s | 3/3 aciertos |
| | **B** | **196.938** | 59,3k | 523 s | 3/3 aciertos |

Diferencia en tokens: **0,09%**. Reloj: el CLI un **34% más lento**, consistente en los tres (el spawn
de `npm run` por comando + leer los `.yml` con Read). Paridad: perfecta — en ab3 idéntico literal.

## 2. Los tres porqués del empate (esto es lo que había que aprender)

1. **El 59-78% del coste de cada brazo es el suelo**, y el suelo es ciego al transporte: system prompt
   del subagente + `CLAUDE.md` auto-inyectado + superficie de herramientas de la sesión = **45,9k por
   nacer**, con cero trabajo hecho. El CLI no puede tocar eso porque no es suyo.
2. **El «impuesto de esquemas MCP» no existe en este harness.** Las herramientas MCP van DIFERIDAS
   (ToolSearch): el brazo A cargó solo las que usó. Los 4× de los foros comparan harnesses sin
   deferral y con snapshots inline sin límite — dos mitigaciones que aquí ya estaban de serie.
3. **Snapshot-a-fichero no ahorra si tienes que LEER el fichero.** El subagente necesita el snapshot
   para razonar: leerlo con Read cuesta lo mismo que recibirlo inline. Fichero gana solo cuando puedes
   **grepearlo o recortarlo** en vez de leerlo entero — y un subagente resolviendo un locator casi
   nunca puede.

## 3. Veredictos de las hipótesis

| # | hipótesis | veredicto |
|---|---|---|
| HC2 | el respondedor CLI cumple el baremo triple | **MUERTA**: ahorro 0%, reloj peor, paridad igual. Por los kill criteria del plan, **el respondedor de rescate por CLI no se construye** |
| HC4 | el reloj caliente del daemon es competitivo | **MUERTA**: +34% consistente (spawn de npm + Read de ficheros) |
| HC5 | el daemon no cruza estado entre brazos | sin contaminación observada; los brazos B cerraron sus sesiones y los marcadores se retiraron |

## 4. Los dos hallazgos que valen más que el experimento

**a) La calidad no era del transporte NI del snapshot empaquetado: era del respondedor.** En ab3, el
Haiku del ciclo real —con el snapshot podado estático— **declinó**. Los DOS brazos de este banco —modelo
de la sesión, navegador interactivo, frescos— resolvieron con el mismo locator correcto, explicando
además por qué el label no forma nombre accesible. Un respondedor que puede MIRAR e interactuar supera
al que recibe una foto podada. Esto alimenta la Fase 2 del plan del rescate (la escalera de evidencia),
no este plan.

**b) La palanca de coste real tiene nombre y número: no arrancar subagentes.** El suelo de 45,9k por
nacimiento contra los ~3-5k de que el orquestador conteste directo con la petición podada (decisión D-c
del plan del rescate). Este banco lo cuantifica: **la decisión D-c vale ~10× más que cualquier elección
de transporte.**

## 5. Lo que sobrevive para el CLI (re-alcance de A/B-2)

El caso del subagente ha muerto; el caso del **orquestador** no — es el contrario exacto:

- El orquestador **no paga envoltorio** (ya existe), así que la comparación cambia de naturaleza.
- Para el orquestador, snapshot-a-fichero SÍ ahorra: puede **Grep** sobre el `.yml` en vez de tragarse
  el árbol entero en contexto — que es lo que hace el MCP inline. Es la diferencia entre buscar un
  literal en un fichero y leerse la pantalla completa.
- Y elimina los `recon.ts`/`probe-*.ts` a mano de los tres ciclos, con sus errores documentados.

**A/B-2 re-alcanzado**: orquestador con `qa:browse` contra la línea base real (scripts a mano de los
tres ciclos) en una tarea de reconocimiento acotada. Sin subagentes. Ahí el CLI juega en su terreno.

## 6. Límites de este banco

- 3 casos, 1 modelo, sitios-demo con snapshots pequeños. En páginas enterprise (árboles de 10-50k) el
  punto 3 del §2 podría invertirse *para el orquestador*; para el subagente el suelo seguiría mandando.
- El reloj del CLI incluye el peaje de `npm run` (~1-2 s/comando): invocando el binario directo bajaría,
  pero el camino sancionado es el wrapper y se mide lo que se usaría.
- Los brazos navegaron pasos previos ellos mismos (2-4 acciones); en la integración real de Fase 2 el
  walker ya está EN la pantalla — el coste de ambos brazos bajaría por igual, el empate no se movería.

---

# A/B-2 (re-alcanzado) — el orquestador con `qa:browse` contra el `recon.ts` a mano

**Aquí el CLI SÍ gana, ~2,6× en coste — pero por una razón distinta a la del plan: no porque el snapshot
vaya a fichero, sino porque no hay que ESCRIBIR UN PROGRAMA. El token caro es el de salida.**

**Diseño**: el veredicto de A/B-1 mató la comparación entre subagentes, así que A/B-2 se re-alcanzó al
caso contrario: **el orquestador** (que no paga envoltorio) haciendo un reconocimiento completo con
`qa:browse`, contra la línea base histórica de los tres `recon.ts` escritos a mano.
**Terreno limpio**: `practicesoftwaretesting.com` — en el allowlist, nunca sometido al protocolo de recon
en este proyecto. **Regla de disciplina declarada y cumplida**: no leer su Style Contract durante el brazo.

## 1. El resultado

| | línea base (`recon.ts` a mano) | brazo CLI (orquestador) |
|---|--:|--:|
| tokens de **salida** (lo caro: $25/M) | ~2.727 (media de los 3 scripts) | ~840 (14 comandos cortos) |
| tokens de **entrada** | ~3.000 (salida del script + partes de `literales.json`) | ~2.100 (8,4 KB: resultados + greps) |
| **coste relativo** (5/25 por M) | **~82,5** | **~31,5** |
| turnos | 1 escritura + N relanzamientos | 14 |

**≈2,6× más barato.** Y el desglose enseña dónde: **el 82% del coste de la línea base es OUTPUT** — el
programa que hay que redactar. Los comandos del CLI son de una línea.

## 2. La cobertura, honestamente

Conseguido en el brazo CLI: 3 pantallas (listado, ficha, login), inventario de controles con identidad
(**97 atributos `data-test`** — sitio rico en testids, lo contrario de EspoCRM), los 9 productos con sus
9 precios como oráculos, el árbol de categorías/marcas del filtro, los literales visibles del login, y
tres notas de comportamiento: **UI en español por locale** (`lang=es`, `navLang=es-ES`) con **precios en
USD** (i18n parcial), y versión declarada en el pie (`v2.4 | Built 2026-08-22 | Angular 20.0.5`).

**No conseguido en el mismo tiempo, y el script a mano SÍ lo lograba: los literales de validación.** El
`recon.ts` los captura porque guioniza `fill` + blur + `click` + espera + lectura en un flujo con estado;
por comandos sueltos, el submit por `eval` no disparó la validación de Angular. **Paridad: incompleta.**
Es la contrapartida exacta de la ventaja: sin programa no hay flujo con estado.

## 3. Dos hallazgos del terreno que valen aparte

- **El snapshot automático del CLI sufre D72.** Al entrar en `/auth/login` el `.yml` salió sin el
  formulario: la SPA no había pintado. Mismo defecto que perseguimos en el walker, en otra herramienta.
- **El formulario existe en el DOM y NO está en el árbol de accesibilidad** (`login-form: true`,
  `email: true` por `eval`, ausentes del snapshot). Con los controles fuera del árbol, los comandos por
  `ref` del CLI **no pueden alcanzarlos** y hay que caer a `eval`. El MCP tiene exactamente el mismo
  agujero: es el mismo árbol. Refuerza por qué el walker no se apoya solo en a11y.

## 4. Dos bugs de la puerta, encontrados POR USARLA (no leyéndola)

Ambos arreglados con test de regresión (15 en total en `qa-browse.test.ts`):

1. **Los globales del CLI pueden preceder al comando.** `--raw eval "…"` —la forma más barata de sacar
   un literal— era rechazada porque el parser tomaba `resto[0]` a ciegas. El comando es ahora el primer
   positional que no es flag.
2. **`shell: true` destrozaba los argumentos.** Un `eval` con espacios llegaba partido y un `|` se
   interpretaba como pipe de cmd.exe. Y sin shell, Node 20+ se niega a lanzar el `.cmd` de npx. Se
   invoca `cli.js` con `node` directamente: los argumentos viajan **verbatim**. Sin esto, el brazo CLI
   era inservible para cualquier extracción no trivial.

**Peaje residual medido**: en Windows, `npm run qa:browse -- …` reintroduce la capa de cmd. El camino
sancionado para argumentos complejos es `npx tsx src/scripts/qa-browse.ts` — misma puerta, sin
intermediario. La puerta se re-verificó tras cada arreglo: sigue bloqueando URL fuera de allowlist y
sesión ajena.

## 5. Veredicto de A/B-2 y qué se adopta

**HC3 (el recon por wrapper iguala la cobertura con menos turnos): PARCIAL.** Más barato (~2,6×) y con
menos trabajo de autoría, pero **no cubre lo que exige flujo con estado** (validaciones).

**Adopción propuesta — los dos, por fases del recon:**

| fase del recon | herramienta | por qué |
|---|---|---|
| exploración, inventario de controles, literales estáticos, notas | **`qa:browse`** | 2,6× más barato, cero autoría, y grepear el `.yml` bate a leer el árbol |
| sondas de comportamiento (validaciones, cascadas, flujos con estado) | **`probe-*.ts` a mano** | necesitan estado y esperas; un programa sigue siendo la herramienta correcta |

Es decir: el CLI sustituye al `recon.ts` **grande**, no a las `probe-*.ts`. En los tres ciclos eso habría
sido cambiar ~10,9 KB de programa por ~14 comandos, conservando las sondas (3,0-8,5 KB) donde hacen falta.

## 6. Límites de A/B-2

- **Un solo sitio y un solo operador** (yo, que además ya venía calentado por A/B-1).
- El reloj total del brazo (430 s) incluye **arreglar los dos bugs de la puerta**, que es coste único y
  no de recon; el recon propiamente fueron 14 turnos.
- La línea base es histórica y se compara por artefacto (bytes del script escrito), no re-ejecutándola:
  el coste real de la línea base fue **mayor** que el contabilizado, porque no incluyo sus relanzamientos
  documentados (EspoCRM re-lanzado por un proceso zombi, ids equivocados en Tricentis).
