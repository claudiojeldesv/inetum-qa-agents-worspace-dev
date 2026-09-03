# Ensayo del panel — cinco paradas, y lo que debes ver en cada una

**Para qué**: probar de una pasada todo lo que el panel sabe hacer, sin esperar diez minutos de
regresión. Tres casos cortos sobre el portal de reservas, escritos **con huecos a propósito**.

No es una regresión: es un ensayo. Que acabe con pasos bloqueados es el resultado correcto.

Los textos de este documento están **copiados del panel real**, no redactados de memoria. Si ves algo
distinto, es un hallazgo y merece contarse.

## El comando

```bash
cd C:/Users/USUARIO/qa/rbp && npx.cmd tsx copilot/src/dom-walker.ts --script=.work/ensayo/ensayo-panel.walk.json --contract=config/style-contracts/restful-booker.yaml --base-url=https://automationintesting.online --work-dir=.work/ensayo-run --criterios=.work/ensayo/criteria.json --rescue-budget=0 --assist --assist-timeout=600 --actor="Claudio Jeldes" --fd=.work/ensayo/ensayo-panel-fd.md --headed
```

| | |
|---|---|
| `--criterios=` | el `criteria.json` del FD. **Sin esto el panel no enseña la línea del FD** |
| `--actor=` y `--fd=` | sin los dos, el panel de **veredicto no se abre** |
| `--assist-timeout=600` | 10 minutos por parada. En la pasada anterior caducaron dos a los 5 |
| `--rescue-budget=0` | sin IA: todas las paradas son para ti |

**Antes de empezar**, comprueba que arranca bien. Debe imprimir:

```
[dom-walker] criterios del FD: 3 desde .work/ensayo/criteria.json
[dom-walker] memoria de aliases: …\config\hint-aliases\ensayo-panel.json
```

Si la segunda línea trae un aviso de «directorio EFÍMERO», la memoria morirá con el run.

---

## Parada 1 · `ep01/s5` — varios «Book now»

Aparece tras rellenar las fechas y pulsar Check Availability. **Debes ver esto**:

```
Necesito que me eches una mano.                      paso s5
«Book now» aparece 3 veces en esta pantalla y no sé cuál es el bueno.
Y por el nombre no se distinguen: todos se llaman igual.
No es que no exista: es que hay varios.
Pulsa «¿Cuál de ellos?» y te digo en qué zona de la pantalla está cada uno.
```

### Qué hacer

1. **Pulsa «¿Cuál de ellos?»** (primer botón azul). Debe abrirse una caja con **tres botones en
   palabras**:

   ```
   Está en varias zonas de la pantalla. ¿En cuál lo busco?
     el de «Single»
     el de «Double»
     el de «Suite»
   ```

2. **Pulsa «el de «Single»»**. La barra de estado debe decir
   `zona elegida: «Single» — pulsa Parar para enviarlo`, y en la lista de abajo aparece una fila con
   el badge **`zona «Single»`** — gris, no ámbar: **no es frágil**.

3. **Antes de Parar, mira el caso completo**: pulsa **`▤`** (arriba a la derecha, junto a `─` y `◌`).
   El panel se **ensancha** —no debe desaparecer— y arriba debes leer:

   ```
   Elegir la zona cuando el nombre no basta
   6 pasos · 2 con comprobación
   EP01 · ensayo-panel-fd.md:17-36
   El FD espera: Se abre la ficha de la habitación individual, y no la de otra habitación del catálogo.
   ```

   Y los 6 pasos: `s1..s4` con el número en verde, `s5` resaltado en azul, y los de acción diciendo
   *«acción · sin resultado que comprobar»*. Vuelve a pulsar `▤` para salir.

4. **Pulsa Parar.**

### Por qué importa

Si usas «Ver todo lo que hay» en su lugar, el locator sale `.nth(1)` y al terminar verás
`NO promovido a alias: locator frágil`. La zona se funde como `scope: {text:'Single'}` y **el motor lo
resuelve solo desde la próxima vez**. Es la diferencia entre decirle dónde está el botón y enseñarle a
leer el plan.

---

## Parada 2 · `ep01/s6` — el resultado esperado

**Si elegiste «Single», este paso pasa y no verás nada.** Es el resultado correcto.

Si eliges otra habitación se abre el panel de veredicto, porque no aparece «Single Room». Ese par es
lo que distingue «resolvió» de «resolvió el correcto».

---

## Parada 3 · `ep02/s1` — el FD está en castellano y la app en inglés

```
Necesito que me eches una mano.                      paso s1
No encuentro «Contacto» en esta pantalla.
Lo más parecido que veo es:
· Contact
Si es alguno de ésos, señálamelo. Si no, enséñame dónde está.
```

El FD pide **Contacto**; la aplicación dice **Contact**. Aquí no hay ambigüedad: hay un solo elemento
y el plan lo llama de otra manera. Es el desencuentro de idioma más común en campo.

### Qué hacer

1. **Pulsa «Ver todo lo que hay»**. Sale el inventario, con lo más parecido arriba.
2. Busca la fila del enlace **Contact** y **pulsa la fila** (no hace falta Grabar). Debe aparecer un
   **recuadro naranja** sobre el enlace de la página.
3. **Prueba «Añadir comprobación de texto»** antes de enviar:
   - escribe `Send Us a Message` → **debe aceptarlo**:
     `comprobación añadida: se guardará como expect_text`;
   - escribe `Formulario de contacto` → **debe rechazarlo**:
     `ese texto no se ve ahora mismo en la pantalla`. **Ese rechazo es la función, no un fallo**: un
     oráculo que nace roto no falla hoy, falla dentro de tres semanas en la regresión de otro.
4. **Pulsa Parar.**

---

## Parada 4 · `ep02/s3` — un botón que no existe

Sale justo después, **si resolviste la parada 3**. Si la dejaste caducar, este paso se suprime como
cascada y no lo verás: es correcto, no un fallo.

```
Necesito que me eches una mano.                      paso s3
No encuentro «Enviar formulario ya» en esta pantalla, ni nada que se le parezca.
Si hay que llegar por otro camino, enséñamelo. Si de verdad aquí no está, dilo con «No existe aquí».
```

### Qué hacer

**Pulsa «Bloquear paso»** — la salida de «no quiero decidir esto ahora». Debe bloquear sin ruido y
seguir con el caso siguiente.

> En la pasada anterior aquí señalaste **Submit**. Es una decisión legítima, pero no es la misma cosa:
> no dices *cómo se llega*, dices que **el elemento es otro**. Se promovió a alias durable, y al
> revisar el parche te habría salido en el bloque de «QUÉ SIGNIFICA CORRECTO» para aprobarlo uno a
> uno. Las dos salidas valen; esta vez prueba la otra.

---

## Parada 5 · `ep03/s1` — el plan pide algo que la aplicación no da

```
Esto no cuadra y no lo puedo decidir yo.             paso s1
El plan esperaba ver «Precio garantizado» y no aparece.
Los resultados que sí veo en esta pantalla son:
· Welcome to Shady Meadows B&B
· Check Availability & Book Your Stay
· Our Rooms
· Single · Double · Suite
· Our Location
· Contact Information
Si el bueno es uno de ésos, la aplicación cambió y el plan se quedó viejo. Si no hay ninguno, esto es un defecto.
```

### Qué hacer

**Pulsa «Es un defecto»**: ninguno de esos textos es la garantía de precio. El panel dirá
`firmando...` y luego `Registrando la decisión en el acta`.

La otra salida —«La aplicación tiene razón»— es para cuando uno de los textos de la lista **sí** es el
resultado bueno con otras palabras. No es el caso aquí.

**En la pasada anterior este panel caducó dos veces sin decisión**, así que no se firmó nada. Con
`--assist-timeout=600` tienes margen.

---

## Parada 6 · `ep03/s2` — «Reserva rápida» no existe

```
Necesito que me eches una mano.                      paso s2
No encuentro «Reserva rápida» en esta pantalla, ni nada que se le parezca.
Si hay que llegar por otro camino, enséñamelo. Si de verdad aquí no está, dilo con «No existe aquí».
```

**Pulsa «No existe aquí»**. Es la salida para cuando el elemento no está y no hay nada que señalar. El
paso se bloquea con esa causa y el run termina.

---

## Al terminar

El epílogo debe decir qué le enseñaste y **qué se pierde si no lo fundes**:

```
[dom-walker] enseñaste 2 paso(s) en el panel y están en assist-patch.json, NO en el guion
  - ep01-elegir-la-zona/s5 → getByText('Single', { exact: true }).locator('xpath=../..') >> getByRole('link', …)
  - ep02-senalar-el-elemento/s1 → getByRole('link', { name: 'Contact' })…
```

**La zona de `s5` NO debe salir marcada `[SE PIERDE]`**: no es posicional, así que entra en memoria
durable. Con el inventario sí saldría, y eso también sería correcto.

Luego revisa el parche (**no toca nada**, solo enseña lo que cambiaría):

```bash
cd C:/Users/USUARIO/qa/rbp && npx.cmd tsx copilot/src/merge-assist-patch.ts --work-dir=.work/ensayo-run --script=.work/ensayo/ensayo-panel.walk.json
```

Debe separar por peso: *CÓMO SE LLEGA* en bloque, *QUÉ SIGNIFICA CORRECTO* uno a uno.

Y el acta con tu veredicto:

```bash
cd C:/Users/USUARIO/qa/rbp && npx.cmd tsx src/scripts/check-decisions.ts
```

## Qué mirar con lupa

| Señal | Qué significa si falla |
|---|---|
| «¿Cuál de ellos?» ofrece **nombres de habitación** | si ofrece posiciones (`.nth`), D90 no funciona |
| El panel **se ensancha** con `▤`, no desaparece | fue el defecto de la primera versión |
| La línea `EP01 · ensayo-panel-fd.md:17-36` | sin ella, `--criterios` no llegó |
| El texto inexistente **se rechaza** | si lo acepta, el cerrojo del oráculo no funciona |
| La zona **no** sale `[SE PIERDE]` | si sale, la fragilidad se calcula mal |

## De la pasada anterior

Está guardada entera en `.work/ensayo-anterior/`: el parche, el log, los aliases y el perfil de
tiempos. No se borró nada, por si quieres comparar.
