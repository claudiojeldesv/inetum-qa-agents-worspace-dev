# El ciclo cerrado: del panel al plan, medido en campo

**Fecha**: 2026-08-28. **Sitio**: OrangeHRM. **Rama**: `design/kernel-v2`.
**Quien resolvió los paneles**: el ingeniero QA, en su máquina. Lo que sigue son sus artefactos,
no una simulación.

## Qué se quería demostrar

Que lo que un QA resuelve en el panel **sobrevive al siguiente run**. Hasta ahora no sobrevivía: el
walker escribía `assist-patch.json`, imprimía «fúndelo en el guion y relanza», y nadie lo fundía —
medido antes en ParaBank, donde *«los tres parches del panel quedaron sin fundir»*
(`run-beta-parabank.md:168-176`). El producto recordaba **dónde está un elemento** (hint-aliases
durables) y olvidaba **qué pasos faltaban**.

El plan fijó el criterio: *«re-correr el caso SIN panel; si los pasos que se plantaban no pasan
solos, la fusión no vale de nada por bien que se firme»*.

## El resultado

| Run | Pasos | Bloqueados |
|---|---|---|
| sin panel, guion original | **10 / 16** | s7, s9, s10, s11, s13, s16 |
| tras fundir la 1ª sesión | **12 / 16** | s9, s10, s11, s16 |
| tras fundir la 2ª sesión | **15 / 16** | s16 |

**Sin `--assist` y sin nadie delante.** El único que queda es `s16`, y no va a caer nunca: el FD
pide «pulsar el botón de cerrar X» —un paso copiado del registro corporativo, donde toda ventana
se cierra así— y esa pantalla no tiene ningún control de cierre. El QA lo declaró con «No existe
aquí», que es drift real y no un fallo de la herramienta.

La predicción se escribió antes de correr y se cumplió entera: al fundir `s9`, el run pulsa la
papelera solo → se abre la confirmación → `s10` encuentra su texto → `s11` pulsa «No, Cancel».
Tres pasos por una decisión.

**El acta**: 4 decisiones, cadena coherente, todas `app · en-vivo · <actor>`. El grado `en-vivo` no
es un adorno: el camino previo contiene pasos de negocio, así que no hubo replay en limpio, y eso
queda escrito en vez de disfrazarse.

## El hallazgo que vale más que el 15/16

De los 15 pasos en verde, **uno no significa nada**:

```
s15: el FD pedía 'Records Found' y en pantalla hay 'No Records Found'
```

La búsqueda de ausencias **no devolvió ninguna solicitud** y el caso lo da por bueno, porque el
literal positivo es subcadena del negativo. Es **K0.37**, la clase que se midió en su día contra
un motor solo-LLM y contra el walker, y que dio verde en los dos.

Dos cosas que conviene separar:

- **El motor hizo lo correcto.** No cambió el veredicto —decidir que «No X» niega a «X» es
  específico del idioma— pero **lo cantó**, con el texto completo de la pantalla al lado. Sin esa
  nota, este verde falso habría pasado desapercibido en un informe de 15 verdes.
- **De las tres coincidencias parciales del run, solo una es peligrosa.** `(125) Records Found` y
  `The selected record will be permanently deleted…` son legítimas. Distinguirlas no lo puede hacer
  el motor: lo tiene que decidir un QA, y para eso está el acta.

La decisión que toca aquí es `decision: 'fd'` — el criterio del FD está mal escrito y necesita un
literal que discrimine. **Todavía no está firmada**: el disparador que abre el panel ante una
postcondición incumplida es la fase B, y este paso no falló, *pasó*. Un verde no abre panel.

Y ahí está el hueco que este run destapa mejor que ningún argumento: **el panel solo aparece
cuando algo se rompe**. Un verde sin poder discriminante no rompe nada.

## Los cinco defectos que costó llegar aquí

Ninguno se encontró razonando; los cinco salieron de usar la herramienta o de mirar sus artefactos.

| | Qué |
|---|---|
| **D59** | Los candidatos del panel traían nombres de empleados de la tabla al pedir un botón. 8 → 1 podando por el rol que declara el propio plan |
| **D60** | Un pedido de menos de 3 caracteres —«X», el botón de cerrar que el FD de onesait nombra tres veces— no producía candidatos NUNCA, y el panel afirmaba «ni nada que se le parezca» con el botón delante |
| **D61** | Con un modal abierto, los candidatos salían de la pantalla de fondo |
| **D62** | El panel capturaba el **icono**, no el botón que lo contiene. Un `<button><i/></button>` sin nombre es la forma corporativa de siempre, y bloqueó el ejercicio |
| **D63** | Todo lo anclado colgaba de `getByRole('<rol>', { name })`, y para un contenedor ese `name` sale del `textContent` — que Playwright no acepta. `getByRole('row', { name: '0452aaa aaa' })` resuelve a **CERO**: el único candidato posible nacía muerto y la asistencia se rendía DESPUÉS del trabajo del QA |

D62 y D63 son el mismo paso visto dos veces: primero el panel no capturaba, y una vez capturaba,
no sabía construirle un locator. Los dos los destapó el QA diciendo «cuando presiono el icono de
basura no lo coge».

## Una hipótesis que se midió y se cayó

Antes de dar con D63 supuse que el QA había pulsado *Parar* con la ventana de confirmación abierta,
y que por eso el locator no resolvía. Se midió: `getByRole('row', { name: … })` da cero **con el
modal abierto y con el modal cerrado**. La hipótesis era falsa y queda escrita, porque el descarte
también es dato.

## Coste del humano, primera cifra

El QA midió **3-4 minutos por panel** en la primera sesión, y dijo que se le iban en *«entender qué
hacía»* — orientación, no acción. Es el sumando que faltaba del modelo de coste (E8) y la primera
vez que existe una cifra. No se ha vuelto a medir tras los arreglos: hacerlo con el mismo caso
estaría contaminado por conocerlo, así que la próxima medición debería ser sobre otro sitio.

## Lo que este run NO demuestra

- **Que la fusión sirva en un caso con datos que se queman.** Aquí el caso es no destructivo a
  propósito: inicia una baja y la cancela. Un flujo que consume una póliza es otra cosa, y es el
  plan de datos consumibles.
- **Que el locator de `s9` aguante.** Es posicional y frágil, y está marcado como tal: «la fila 1,
  el botón 2». El día que el listado cambie de orden, se rompe. Se aceptó con esa etiqueta puesta y
  firmada, que es distinto de aceptarlo sin saberlo.
- **Que 15/16 sea la medida del producto.** Uno de esos 15 es el verde falso de `s15`.

## Reproducirlo

Guía paso a paso en [`guia-panel-orangehrm.md`](../demo/guia-panel-orangehrm.md). El guion de
partida, el FD y el parche real de la primera sesión están versionados en `docs/demo/`.
