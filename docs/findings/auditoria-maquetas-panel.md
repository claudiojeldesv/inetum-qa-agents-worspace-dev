# Auditoría de las maquetas del panel: qué se puede hacer de verdad

**2026-08-24.** Las cinco maquetas del panel asistido, revisadas elemento por elemento contra el
código. El disparador fue una pregunta del QA que destapó un elemento inventado, y al tirar del hilo
salieron tres más.

El criterio de la auditoría es el mismo que el del producto: **una interfaz que enseña un dato que
nadie produce es una instancia de la familia D2** — algo declarado sin productor. Una maqueta que
promete lo que el código no puede dar no es una maqueta optimista, es una especificación falsa.

---

## Los cuatro elementos que había que quitar

### 1. «Aparece esto» como respuesta — el que destapó la auditoría

La pantalla de discrepancia mostraba, al lado del texto que el plan esperaba, el texto que había
aparecido en su lugar. **El producto no sabe eso.** `findVisibleText` devuelve `null` cuando el
literal del plan no está: sabe que falta, no qué hay en su sitio. Y encontrarlo no es trivial —
podría ser cualquier cosa de la página.

**Sustituido por lo que sí se puede**, en tres capas:

- El panel dice *el plan esperaba «X» · no aparece*. Eso es exacto y ya se sabe.
- Ofrece **candidatos acotados**: solo textos de resultado de esa pantalla. Y aquí está la clave —
  el producto ya distingue el resultado del mueble: `business_text` (K0.3) captura únicamente texto
  no interactivo con rol de resultado (`heading`, `alert`, `status`, `text`). El menú, el pie y el
  banner de cookies quedan fuera por construcción, no por filtro añadido.
- Los ordena por **parecido con lo que el plan esperaba**. Esa comparación por palabras compartidas
  ya existe: es `candidatosParaInforme`, escrita hoy para G3 sobre nombres accesibles. Aquí es el
  mismo problema un nivel arriba — textos de resultado de una región en vez de nombres de un rol.
- Y siempre la salida *«ninguno de estos, lo señalo yo»*, que reutiliza la captura de clics que ya
  funciona.

Con dos consecuencias que la maqueta ahora enseña:

**Si la lista sale vacía, eso es información**: la aplicación no muestra nada, y empuja hacia *es un
defecto*. La ausencia de candidatos es un dato, no un hueco.

**Nunca juzga negaciones.** Está medido en campo (K0.37, OrangeHRM): el plan pedía `Records Found`,
la pantalla decía `(0) No Records Found`, el literal aparecía y el caso salió VERDE. Decidir que
«No X» niega a «X» es específico del idioma — en castellano «0 resultados encontrados» contiene
«resultados encontrados». El producto cita lo medido y deja juzgar a quien puede.

### 2. El halo verde sobre el botón que el walker busca

La primera maqueta rodeaba el botón «Cancelar» con un halo, como si el panel señalara dónde pulsar.
**El panel pregunta precisamente porque no lo encuentra**: si supiera dónde está, no habría panel.

Lo que sí existe: el panel resalta en la página el elemento de **la fila que tienes bajo el ratón en
su lista** — un rastro que ya funciona hoy y que es buena UX. El halo se mudó ahí, en azul (color de
«esto es lo que has grabado») y no en verde (que leía como «pulsa aquí»).

### 3. «Añadir paso a mano»

Un paso de acción necesita un locator, y un locator necesita un elemento señalado. No se puede teclear
un paso de la nada; el canal de comandos del panel tiene `recapture`, `remove`, `target`, `assert` y
`edit`, y no tiene `add` — por buena razón.

Pero hay una distinción real que la maqueta ahora respeta: **una comprobación de texto sí se puede
añadir escribiendo**, porque `findVisibleText` opera sobre una cadena y no necesita locator. Así que
el botón pasa a ser **«Añadir comprobación de texto»**, que es exactamente lo que se puede.

### 4. «Debería aparecer» en los doce pasos

En el caso completo puse un resultado esperado en cada paso. Falso: solo lo tienen los pasos con un
`expect_*`. Los de acción pura no tienen nada que comprobar, y decir lo contrario invita a exigir
aserciones donde el plan no las pide. Ahora seis de doce dicen *acción · sin resultado que comprobar*.

---

## Lo que se queda porque sí se puede

Verificado en el código, no supuesto:

| Elemento | Por qué es viable |
|---|---|
| `paso 4 de 12 · cancelación` | el guion tiene los flujos con su array de pasos |
| La tira de los 12 (hecho / aquí / pendiente / no cuadra) | `WalkState` ya lleva `completed[]`, `open_questions[]` y `step_reports[]` |
| `guardado 14:32:07 ✓` | **ya funciona** desde el arreglo de D10/D23 de hoy: cada gesto escribe a disco |
| `es el paso` / `comprueba` / `para llegar` | el panel ya marca objetivo y aserción; `AssistPatchStep.role` distingue `opener` de `target` |
| Editar el locator de una fila | ya existe, y **valida en vivo**: si no resuelve a exactamente uno, no lo acepta |
| `Criterio RF-014 · fd-polizas.md:212` | `criteria.json` lleva `source_ref: "fichero.md:12-18"` como trazabilidad obligatoria |
| Grado de evidencia («sin repetir desde cero») | `verifyAssistPatch` ya degrada a verificación en vivo cuando el camino previo muta negocio, y lo dice en `verify_reason` |
| El panel recuperado con su aviso | **ya funciona** (D10/D23) |
| Colapsar y modo fantasma | interfaz pura, sin dato nuevo |

## Lo que se queda marcado como pendiente de mecanismo

No se quita —es el diseño acordado— pero la maqueta ahora dice que falta:

- **El acta de decisiones**: la lista de cambios necesita comparar contra el guion original; la firma
  necesita dónde guardarse. De ahí dependen las etiquetas `plan` / `tuyo`, el recuento de cambios,
  «el plan se ha movido» y la pantalla de aprobación entera.
- **Reordenar pasos** desde el panel.
- Y la línea que no cruzo: en el panel **el caso se ve y se toca el paso en curso**. Editar el caso
  entero a gusto pide una ventana propia — un editor flotando sobre la aplicación bajo prueba es un
  producto más grande y un editor peor.

---

## Los textos

Segunda pasada, por la misma razón que la primera: se me había colado mi vocabulario de diseño en
una pantalla que lee un QA a las cuatro de la tarde. Fuera «qué se considera correcto», «origen:
aplicación», «verificado en vivo», «coreografía», «drift», «distancia al FD».

La forma que funciona es la que pidió el QA: **etiqueta y valor, en dos líneas**.

> El plan dice — ~~Solicitud de anulación registrada~~
> Aparece esto — Anulación en trámite

Y el resto: `drift` → **no cuadra** · `FD` → **plan** · `objetivo` → **es el paso** ·
`comprobación` → **comprueba** · `espera:` → **debería aparecer:** · «Distancia al FD original» →
**el plan se ha movido**.

Nota de alcance sobre los textos, por si algún día se vende fuera: **el marco del panel está en
castellano cableado, sin traducción**. El contenido, en cambio, es dinámico y su idioma lo manda la
aplicación — un literal no se traduce nunca, porque el test lo va a buscar tal cual. Así que un panel
en castellano puede mostrar literales en inglés, y eso es correcto.

## Enlaces

1. Grabando un paso — https://claude.ai/code/artifact/123dacb3-68c4-4119-bdb9-999b1ded216a
2. Caso completo — https://claude.ai/code/artifact/267e9b32-fe2c-48d2-b05e-88cc2ac3ce0b
3. Discrepancia con el FD — https://claude.ai/code/artifact/6e370136-efdc-4f21-9507-19a4ea69b034
4. Aprobar y firmar — https://claude.ai/code/artifact/3e8e3836-d9cc-4344-8a2a-1fe493559342
5. Posturas del panel — https://claude.ai/code/artifact/5ab90e14-396c-4f3f-9bef-8f83781dfcb2

Recorrido interactivo (guiado, con la muerte y recuperación del panel en vivo):
https://claude.ai/code/artifact/01722b21-89eb-4089-91e9-323dfd3d5708

## La lección, que no es sobre maquetas

Cuatro elementos inventados en cinco pantallas, y ninguno lo detecté yo: lo destapó una pregunta del
QA sobre el más visible. El resto salieron al tirar del hilo. **Una maqueta es una especificación**, y
las especificaciones de este proyecto se auditan igual que el código: contra lo que el productor
realmente emite, no contra lo que el consumidor querría recibir. Es la misma regla que cerró D46 y la
misma que G1 impone ahora sobre los locators.
