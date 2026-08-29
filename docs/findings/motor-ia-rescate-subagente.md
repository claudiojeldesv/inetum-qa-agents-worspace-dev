# Motor + IA con subagente: el rescate funciona, el checkpoint no — D66

**Fecha**: 2026-08-29 · **Pedido por el QA**: *«¿puedes probar el motor + IA con un subagente, y
luego revisar sus resultados?»* · **Caso**: el ciclo CP005 de OrangeHRM con el guion **sin fundir**
(`s7` pide un botón «Buscar» que la aplicación llama «Search») — el mismo drift que el ejercicio de
campo resolvió por el panel, ahora resuelto por la vía autónoma: `--rescue-budget=3`, sin `--assist`.

## Cómo funciona la modalidad (medido, no leído)

El walker NO llama a ningún LLM (regla dura #5): cuando la escalera no resuelve un hint y queda
presupuesto, escribe `rescue-request.json` —paso, hint, un snapshot ARIA **podado** alrededor del
vocabulario del paso, y las instrucciones de respuesta— hace checkpoint y **sale con exit 42**. El
orquestador delega la micro-llamada a un subagente y re-ejecuta; el walker consume
`rescue-response.json` y sigue.

## Lo que salió bien

- **La micro-llamada es barata y acierta el cruce de idiomas**: un subagente Haiku, con SOLO el
  snapshot podado (sin navegar), devolvió `getByRole('button', { name: 'Search' })` para el hint
  «Buscar». **46k tokens, 22 segundos.** El walker lo consumió, ejecutó, y terminó **6/8 con 1
  rescate** — el mismo marcador que el guion fundido.
- **La promoción a alias se negó sola, y con razón**: `rescate NO promovido a alias: postcondición
  del flujo no confirmada (rescate de subagente)`. Como `s8` sigue en drift, el veredicto de
  promoción (el arreglo de D3) no consolida el hallazgo. Consecuencia honesta: **la IA paga este
  rescate en CADA run mientras el drift viva**, frente al ciclo panel → acta → fusión, que lo deja
  gratis para siempre. Las dos vías llegan al mismo 6/8; solo una amortiza.

## Lo que salió mal — D66

La primera reanudación tras el exit 42 **envenenó el run**: el testigo de sesión (K0.35) restauró la
cookie y el navegador despertó **ya logueado**, pero la reanudación re-ejecuta el flujo a medias
**desde su primer paso** — y `fill Username` sobre el dashboard es irresoluble. El walker pidió
rescate de `s1` (un paso ya completado, con un snapshot de página logueada), y al intentarlo
**descartó la respuesta legítima del subagente para `s7`** como «respuesta de otro paso».
Orquestado a ciegas, eso es un bucle quema-tokens: cada reanudación pide rescates de login que
jamás resolverán, hasta agotar el presupuesto.

El conflicto es de diseño y queda **abierto** en el
[índice](../references/indice-defectos.md): saltar los pasos completados exige aterrizar en la
pantalla del paso pendiente (el deep-link que K0.24 declara no garantizable), y re-ejecutarlos exige
sesión limpia — las dos piezas (testigo de sesión y re-ejecución) son correctas por separado y
tóxicas juntas. **Workaround medido**: borrar `walk-session.json` antes de reanudar (re-login
limpio); con él, la reanudación consumió la respuesta y terminó.

## La comparación que responde a la pregunta original

| Vía | Resultado | Coste por run | Qué queda |
|---|---|---|---|
| Motor solo, guion fundido (panel + acta + fusión) | 6/8 | **0 tokens** | el locator en el guion, la decisión firmada |
| Motor + IA (rescate por subagente) | 6/8 | ~46k tokens **cada vez** (sin promoción mientras haya drift) | un registro de rescate `source: llm`, nada durable |

El rescate es la red para lo que nadie ha enseñado todavía; el ciclo del panel es cómo se deja de
pagar. Y `s6`/`s8` (postcondiciones en drift) **no son rescatables por diseño**: un LLM no tiene
autoridad para decidir quién tiene razón entre el FD y la aplicación — eso es del QA, por el panel
de veredicto, con firma.
