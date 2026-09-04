# Guía 05 — el walker con panel: cuando no encuentra algo, te pregunta

**Qué vas a ver**: la regresión corre sola y, cuando el walker no consigue resolver un paso, **abre un
panel encima de la aplicación y se queda esperándote**. Tú se lo señalas, y el walker sigue desde ese
mismo paso. Lo que le enseñas puede quedarse en el plan para siempre.

**Qué NO es esto**: no es la IA. Aquí las preguntas son para ti. La versión con IA es la
[guía 06](06-rescate.md), y usa **el mismo guion** a propósito — verás por qué al final.

**Tiempo delante de la pantalla**: unos 15 minutos.

## El caso, antes de correr nada

Léete los casos **CP004** y **CP005** del [FD](../restful-booker-fd.md): enviar un mensaje de contacto,
y comprobar que el formulario vacío se queja. Sin el caso delante no puedes juzgar nada de lo que el
panel te pregunte.

## El comando

```powershell
cd C:\Users\USUARIO\qa\rbp-lab
```

```powershell
npx.cmd tsx copilot/src/dom-walker.ts --script=examples/06-restful-booker/regresion-corta.walk.json --base-url=https://automationintesting.online/ --contract=config/style-contracts/restful-booker.yaml --work-dir=.work/panel --criterios=examples/06-restful-booker/criteria.json --rescue-budget=0 --assist --assist-timeout=600 --actor="TU NOMBRE" --fd=examples/06-restful-booker/restful-booker-fd.md --headed
```

| | |
|---|---|
| `--assist` | abre el panel. Sin esto, los pasos se bloquean sin preguntarte |
| `--rescue-budget=0` | **sin IA**: todas las paradas son tuyas |
| `--criterios=` | sin esto, el panel no puede enseñarte la línea del FD |
| `--actor=` y `--fd=` | sin los dos, un veredicto no se puede firmar |
| `--assist-timeout=600` | diez minutos por parada. Si caduca, el paso se bloquea y el run sigue |
| `--headed` | el navegador visible. Aquí es obligatorio: el panel está dentro |

**La barra final de la URL no es un adorno**: sin ella el pre-flight responde `URL not declared in
allowed-targets`, que suena a falta de permiso cuando lo que falla es el patrón.

## Parada 1 · `cp004/s1` — hay dos «Contact» y no sabe cuál

Al arrancar, en la esquina superior derecha aparece el panel. **Esto es lo que dice, literal**:

```
Asistencia QA                                    esperando   ▤ ─ ◌

Necesito que me eches una mano.                        paso s1
El enlace «Contact» aparece 2 veces en esta pantalla y no sé cuál es el bueno.
Y por el nombre no se distinguen: todos se llaman igual.
No es que no exista: es que hay varios.
▸ Pulsa «¿Cuál de ellos?» y te digo en qué zona de la pantalla está cada uno.
```

Y debajo, los botones **agrupados por para qué sirven**:

```
── PARA RESOLVER ESTE PASO ──      [¿Cuál de ellos?]  [Ver todo lo que hay]
── SALIDAS ──                      [No existe aquí]   [Bloquear paso]
── DE PASO, MIENTRAS ESTÁS AQUÍ ── [Añadir comprobación de texto]
```

(Arriba, la fila de grabación: `Grabar` · `Pausa` · `Limpiar` · `Parar`.)

**Tiene razón: hay dos.** Uno en el menú de arriba y otro en el pie de página —comprobado en el sitio
el 2026-09-04—, los dos con el texto exacto «Contact». El bueno es el del menú.

### Qué hacer

1. **Antes de resolver, mira el caso entero**: pulsa **`▤`** (arriba a la derecha). El panel se
   **ensancha** —no debe desaparecer— y verás:

   ```
   Envío de mensaje de contacto
   8 pasos · 2 con comprobación
   CP004 · restful-booker-fd.md:94-115
   El FD espera: El sistema confirma la recepción del mensaje citando el nombre del
   remitente y el asunto enviado.

   s1  pulsar el enlace «Contact»
       debería verse: Send Us a Message
   s2  rellenar el campo «Name» con «Ana Prueba»
       acción · sin resultado que comprobar
   ...
   s8  comprobar el texto que muestra la pantalla
       debería verse: Thanks for getting in touch
   ```

   Esa línea `CP004 · restful-booker-fd.md:94-115` es el FD **dentro del panel**: sabes qué caso estás
   resolviendo y qué espera el negocio, sin salir a buscar el documento. Vuelve a pulsar `▤` para salir.

2. **Pulsa «¿Cuál de ellos?»**. Te ofrecerá, **en palabras**, la zona en la que está cada uno, para que
   elijas por dónde y no por posición. Elige el del menú de navegación.

3. **Pulsa Parar** para enviarlo.

### Por qué no usar «Ver todo lo que hay» aquí

Funciona, pero el locator sale posicional (`.nth(0)`) y al terminar leerás
`NO promovido a alias: locator frágil`: se usa en este run y **no entra en memoria durable**. La zona sí
entra, porque no es una posición sino un sitio con nombre. Es la diferencia entre decirle dónde está
el enlace **hoy** y enseñarle a leer el plan.

## Parada 2 · `cp005/s1` — el premio

El caso siguiente pide **el mismo enlace «Contact»**. Si lo de la parada 1 entró en memoria durable,
**este paso no te pregunta nada**: el walker lo resuelve solo y pasa de largo.

**Si te vuelve a preguntar, eso es un hallazgo**, no una molestia: significa que lo que enseñaste no se
guardó. Anótalo.

## Paradas 3, 4 y 5 · `cp007` — tres marcadores que no existen

El alta de habitación del panel de administración. El plan pide tres elementos por su **marcador de
código** y ninguno de los tres existe en la página. El panel lo dice así, literal:

```
Necesito que me eches una mano.                        paso s6
El plan pide la lista marcado en el código como "type" y en esta pantalla no
encuentro ese marcador, ni nada que se le parezca.
▸ Si está en otra pantalla → Grabar, haz el camino, Parar.
▸ Si la aplicación ya no lo tiene → «No existe aquí». Queda anotado como diferencia
  entre el plan y la aplicación, y el caso sigue.
```

Los otros dos son iguales, con `"accessible"` (paso s7, otra lista) y `"roomPrice"` (paso s8, un campo).

### Qué hacer

**Señálalos**: pulsa **Grabar**, haz clic en el elemento correcto del formulario, y pulsa **Parar**.
Para `type` es la lista de tipos de habitación; para `accessible`, la de `false`/`true`; para
`roomPrice`, la caja de texto vacía que hay tras las listas.

**El campo del precio es el interesante.** En la guía 06 la IA **declina** ese mismo paso, porque en lo
que ve no hay forma de distinguir las dos cajas de texto: ni etiqueta, ni texto de ayuda, ni nombre.
Tú lo resuelves con un clic porque **estás viendo la pantalla**. Ésa es exactamente la división del
trabajo entre las dos guías.

> **Si dejas caducar una parada**, el paso se bloquea y el run sigue sin él. Es una salida legítima —
> pero entonces la habitación no se crea, y la comprobación del paso `s11` fallará **por eso**, no
> porque la aplicación esté mal.

## De paso: prueba el cerrojo del oráculo

En cualquiera de las paradas, pulsa **«Añadir comprobación de texto»** y escribe algo que **no** esté
en la pantalla, por ejemplo `Formulario de contacto`. Debe **rechazarlo**:

```
ese texto no se ve ahora mismo en la pantalla
```

**Ese rechazo es la función, no un fallo.** Una comprobación que nace rota no falla hoy: falla dentro
de tres semanas, en la regresión de otro, y nadie sabrá por qué. Prueba después con un texto que sí
esté (`Send Us a Message` en la pantalla de contacto) y verás que lo acepta.

## Al terminar

El epílogo te dice qué le enseñaste y **qué se pierde si no lo fundes**:

```
[dom-walker] enseñaste N paso(s) en el panel y están en assist-patch.json, NO en el guion
```

Revisa el parche —**no toca nada**, sólo enseña lo que cambiaría:

```powershell
npx.cmd tsx copilot/src/merge-assist-patch.ts --work-dir=.work/panel --script=examples/06-restful-booker/regresion-corta.walk.json
```

Separa por peso: **cómo se llega** en bloque, **qué significa correcto** uno a uno. Y si firmaste algún
veredicto:

```powershell
npx.cmd tsx src/scripts/check-decisions.ts
```

## Qué mirar con lupa

| Señal | Qué significa si falla |
|---|---|
| «¿Cuál de ellos?» ofrece **zonas en palabras** | si ofrece posiciones (`.nth`), lo que enseñes no entrará en memoria durable |
| El panel **se ensancha** con `▤`, no desaparece | fue el defecto de la primera versión |
| La línea `CP004 · restful-booker-fd.md:94-115` | sin ella, `--criterios` no llegó |
| La parada 2 **no** vuelve a preguntar | si pregunta, la memoria durable no se guardó |
| El texto inexistente **se rechaza** | si lo acepta, el cerrojo del oráculo no funciona |
| Tras una parada caducada, los pasos siguientes **siguen funcionando** | si fallan con «intercepts pointer events», el panel se quedó tapando la página (era D98) |
