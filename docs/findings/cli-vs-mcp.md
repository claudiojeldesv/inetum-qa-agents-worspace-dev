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
