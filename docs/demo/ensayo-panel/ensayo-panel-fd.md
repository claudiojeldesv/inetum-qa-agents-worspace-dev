# Diseño Funcional — Ensayo del panel de asistencia

Documento de definición de pruebas **para ejercitar el panel**, no para medir el sitio. Tres casos
cortos sobre el portal de reservas del hotel *Shady Meadows B&B*, cada uno diseñado para que el
walker se plante en un sitio distinto y el QA tenga que usar una función distinta del panel.

Aplicación bajo prueba: `https://automationintesting.online/`.

Datos de prueba: huésped sintético **Ana Prueba** (`ana.prueba@example.com`).

**Qué NO es esto**: una regresión. Los casos están escritos a propósito con huecos —un elemento
nombrado de forma ambigua, otro que no se puede nombrar, un resultado esperado que la aplicación no
da— porque lo que se ensaya es la conversación con el QA cuando el plan y la aplicación no encajan.

---

## EP01 — Elegir la zona cuando el nombre no basta

**Objetivo**: verificar que un huésped puede abrir la habitación individual desde el catálogo cuando
el catálogo ofrece varias habitaciones con el mismo botón.

**Precondiciones**: el portal muestra el catálogo de habitaciones con disponibilidad.

### Pasos

1. Acceder al portal.
2. Comprobar que se muestra el título **Welcome to Shady Meadows B&B**.
3. Introducir la fecha de entrada.
4. Introducir la fecha de salida.
5. Pulsar el botón **Check Availability**.
6. Pulsar el botón **Book now** de la habitación individual.
7. Comprobar que se muestra el título **Single Room**.

### Resultado esperado

Se abre la ficha de la habitación individual, y no la de otra habitación del catálogo.

---

## EP02 — Señalar un elemento que el plan no sabe nombrar

**Objetivo**: verificar que el huésped puede llegar al formulario de contacto desde el portal.

**Precondiciones**: ninguna.

### Pasos

1. Acceder al portal.
2. Pulsar **Contacto** en la navegación.
3. Comprobar que se muestra el bloque **Send Us a Message**.
4. Pulsar el botón **Enviar formulario ya**.

### Resultado esperado

El portal ofrece un formulario de contacto accesible desde la página principal, con un botón de envío directo.

---

## EP03 — Cuando la aplicación y el plan no dicen lo mismo

**Objetivo**: verificar que el portal anuncia su garantía de precio y ofrece el botón de reserva
rápida en la página principal.

**Precondiciones**: ninguna.

### Pasos

1. Acceder al portal.
2. Comprobar que se muestra el mensaje **Precio garantizado**.
3. Pulsar el botón **Reserva rápida**.

### Resultado esperado

El portal muestra la garantía de precio y permite reservar en un paso desde la página principal.

---

## Nota para quien ejecute la prueba

Los tres casos tienen una tensión **deliberada**, y cada una ejercita una salida distinta del panel:

- **EP01 · paso 6**: «el botón Book now de la habitación individual» es correcto como frase de
  negocio y ambiguo como instrucción: hay uno por habitación. Es el caso de **«¿Cuál de ellos?»**.
- **EP02 · paso 2**: el documento está en castellano y la aplicación en inglés, así que «Contacto»
  no aparece en ninguna parte — lo que hay es «Contact». Es el desencuentro de idioma más común en
  campo, y el caso de **«Ver todo lo que hay»**: hay que señalar el elemento.
- **EP02 · paso 4**: «Enviar formulario ya» tampoco existe. Es el caso de **«Bloquear paso»**: la
  salida de «no quiero decidir esto ahora».
- **EP03 · pasos 2 y 3**: la garantía de precio y la reserva rápida **no existen en la aplicación**.
  Son el caso de **«No existe aquí»** y del **veredicto**: quien tiene razón es el plan o la
  aplicación, y la decisión se firma.
