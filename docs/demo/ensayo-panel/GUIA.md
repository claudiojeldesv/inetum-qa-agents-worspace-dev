# Ensayo del panel — tres casos, todas las funciones

**Para qué**: probar de una pasada todo lo que el panel sabe hacer, sin esperar diez minutos de
regresión. Tres casos cortos sobre el portal de reservas, escritos **con huecos a propósito** para
que el walker se plante cinco veces, cada una en una función distinta.

No es una regresión: es un ensayo. Que acabe con pasos bloqueados es el resultado correcto.

**Un detalle que conviene saber antes**: dos pasos de acción seguidos que fallan solo abren UN panel
— el segundo se suprime como cascada, porque la pantalla que necesitaba nunca apareció (D78). Por eso
las paradas están repartidas entre los tres casos y no apiladas en uno.

## El comando

```bash
cd C:/Users/USUARIO/qa/rbp && npx.cmd tsx copilot/src/dom-walker.ts --script=.work/ensayo/ensayo-panel.walk.json --contract=config/style-contracts/restful-booker.yaml --base-url=https://automationintesting.online --work-dir=.work/ensayo-run --criterios=.work/ensayo/criteria.json --rescue-budget=0 --assist --assist-timeout=300 --actor="Claudio Jeldes" --fd=.work/ensayo/ensayo-panel-fd.md --headed
```

Lo que hace cada parte, por si quieres cambiarla:

| | |
|---|---|
| `--criterios=` | el `criteria.json` del FD. **Sin esto el panel no enseña la línea del FD** |
| `--actor=` y `--fd=` | sin los dos, el panel de **veredicto no se abre** (no se firma una decisión sin autor ni sin saber contra qué FD) |
| `--assist-timeout=300` | 5 minutos por parada, para leer sin prisa |
| `--rescue-budget=0` | sin IA: todas las paradas son para ti |

## Las cinco paradas, en orden

### 1 · `ep01/s5` — «Book now» aparece varias veces

El FD dice *«pulsar el botón Book now de la habitación individual»*. Correcto como frase de negocio,
ambiguo como instrucción: hay un Book now por habitación.

**Prueba aquí**: el botón **«¿Cuál de ellos?»**. Debe ofrecerte *el de «Single»*, *el de «Double»*,
*el de «Suite»* — en palabras, no locators. Elige **Single** y pulsa **Parar**.

Lo que se está probando de fondo: lo que elijas se funde en el guion como `scope: {text:'Single'}`,
o sea lenguaje de FD. La próxima vez el motor lo resuelve solo, sin preguntarte.

**Aprovecha esta parada para ver el caso completo**: pulsa `▤` arriba a la derecha. El panel se
ensancha y debe mostrar los 6 pasos, dónde estás, y arriba la línea del FD:

```
Elegir la zona cuando el nombre no basta
EP01 · ensayo-panel-fd.md:17-36
El FD espera: Se abre la ficha de la habitación individual, y no la de otra habitación del catálogo.
```

Vuelve a pulsar `▤` para seguir trabajando.

### 2 · `ep01/s6` — el resultado esperado

Si en la parada 1 elegiste **Single**, este paso **pasa** y no se abre nada. Si elegiste otra, verás
el panel de veredicto: la aplicación no muestra «Single Room» porque estás en otra habitación.

**Es el par falsable del ensayo**: distingue «resolvió» de «resolvió el correcto».

### 3 · `ep02/s1` — el plan no sabe nombrar el elemento

El FD dice *«abrir la zona de contacto»*, que no nombra ningún elemento concreto.

**Prueba aquí**: **«Ver todo lo que hay»**. Busca el enlace de contacto, pulsa su fila, comprueba que
el recuadro naranja cae donde esperas, y **Parar**.

**Y aprovecha para probar «Añadir comprobación de texto»**: escribe `Send Us a Message` (que sí está
en esa pantalla) y pulsa Añadir. Debe aceptarlo. Prueba después con `Formulario de contacto`, que no
está: debe **rechazarlo** con «ese texto no se ve ahora mismo en la pantalla». Ese rechazo es la
función, no un fallo.

### 3-bis · `ep02/s3` — «Enviar formulario ya» no existe

Sale justo después, **si resolviste la parada anterior**. Si la dejaste caducar, este paso se suprime
como cascada y no lo verás — que es el comportamiento correcto, no un fallo.

**Prueba aquí**: **«Bloquear paso»**, la salida de «no quiero decidir esto ahora». Debe bloquear sin
ruido y seguir con el caso siguiente.

### 4 · `ep03/s1` — el plan pide algo que la aplicación no da

El FD exige *«Precio garantizado»*. No existe en el sitio.

**Prueba aquí**: el **panel de veredicto**. Te enseña lo que la pantalla sí dice y te pide decidir
quién tiene razón. Elige **«Es un defecto»** — porque el plan pide algo que el negocio quería y la
aplicación no ofrece — y la decisión queda firmada en el acta con tu nombre y el hash del FD.

Si eliges «La aplicación tiene razón», el literal se adopta y el plan se mueve. Las dos salidas son
legítimas; lo que no es legítimo es que decida el agente.

### 5 · `ep03/s2` — «Reserva rápida» no existe

**Prueba aquí**: **«No existe aquí»**. Es la salida para cuando el elemento no está y no hay nada que
señalar. El paso se bloquea con esa causa y el run termina.

## Al terminar

El run imprime lo que le enseñaste y qué se pierde si no lo fundes:

```
[dom-walker] enseñaste N paso(s) en el panel y están en assist-patch.json, NO en el guion
  - ep01-elegir-la-zona/s5 → getByText('Single', { exact: true }).locator('xpath=../..') >> …
  Para revisarlo (no toca nada, enseña lo que cambiaría):
    npx.cmd tsx copilot/src/merge-assist-patch.ts --work-dir=… --script=…
```

Ejecuta ese comando de revisión: **no toca nada**, solo enseña lo que cambiaría, separado por peso —
*cómo se llega* en bloque, *qué significa correcto* uno a uno.

Y comprueba el acta:

```bash
cd C:/Users/USUARIO/qa/rbp && npx.cmd tsx src/scripts/check-decisions.ts
```

## Qué mirar con lupa

- **La zona debe decir el nombre de la habitación**, no `.nth(2)`. Si te ofrece posiciones, D90 no
  está haciendo su trabajo.
- **El panel no debe desaparecer** al pulsar `▤` (fue el defecto de la primera versión).
- **El texto rechazado** en la comprobación: si acepta uno que no está, el cerrojo no funciona.
- **Al terminar, revisa que la zona elegida NO esté marcada `[SE PIERDE]`**: una zona no es
  posicional, así que sí debe entrar en memoria durable. Un `.nth()` del inventario sí se pierde, y
  eso también es correcto.
