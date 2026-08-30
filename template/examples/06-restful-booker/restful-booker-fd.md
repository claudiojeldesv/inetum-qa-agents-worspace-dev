# Diseño Funcional — Portal de reservas del hotel · Regresión funcional

Documento de definición de pruebas. Registro corporativo: pasos simples, un verbo por línea, la
comprobación escrita como la espera el negocio.

Aplicación bajo prueba: portal público de reservas del hotel **Shady Meadows B&B** con panel de
administración. Diez casos de regresión: flujos de negocio y consultas sobre lo que la interfaz
muestra (textos, botones, tablas).

Datos de prueba: huésped sintético **Ana Prueba** (`ana.prueba@example.com`, teléfono
`01234567890`). Usuario administrador dado de alta. Cada caso que reserva usa su propia ventana de
fechas para no pisar a los demás.

---

## CP001 — Reserva de habitación individual

**Objetivo**: verificar que un huésped puede reservar la habitación individual desde el portal
público y recibe la confirmación.

**Precondiciones**: la habitación individual existe y tiene disponibilidad en la ventana de fechas
del caso (10/11/2026 a 12/11/2026).

### Pasos

1. Acceder al portal.
2. Comprobar que se muestra el título **Welcome to Shady Meadows B&B test**.
3. Introducir la fecha de entrada `10/11/2026`.
4. Introducir la fecha de salida `12/11/2026`.
5. Pulsar el botón **Check Availability**.
6. En la tarjeta de la habitación **Single**, pulsar el botón **Book now**.
7. Comprobar que se muestra el título **Single Room**.
8. Comprobar que se muestra el bloque **Price Summary**.
9. Pulsar el botón **Reserve Now**.
10. Introducir el nombre del huésped.
11. Introducir el apellido del huésped.
12. Introducir el correo del huésped.
13. Introducir el teléfono del huésped.
14. Pulsar el botón **Reserve Now**.
15. Comprobar que se muestra el mensaje **Booking Confirmed**.

### Resultado esperado

La reserva queda confirmada y el sistema muestra las fechas de la estancia junto al mensaje de
confirmación.

---

## CP002 — Consulta de disponibilidad

**Objetivo**: verificar que la consulta de disponibilidad devuelve el catálogo de habitaciones.

**Precondiciones**: ninguna.

### Pasos

1. Acceder al portal.
2. Introducir la fecha de entrada `17/11/2026`.
3. Introducir la fecha de salida `18/11/2026`.
4. Pulsar el botón **Check Availability**.
5. Comprobar que se muestra la sección **Our Rooms**.
6. Comprobar que se muestra la habitación **Single**.
7. Comprobar que se muestra la habitación **Double**.
8. Comprobar que se muestra la habitación **Suite**.

### Resultado esperado

El catálogo muestra las tres habitaciones del hotel con su precio por noche.

---

## CP003 — Consulta del detalle de la suite

**Objetivo**: verificar que la ficha de una habitación muestra sus características y políticas.

**Precondiciones**: la suite existe en el catálogo.

### Pasos

1. Acceder al portal.
2. En la tarjeta de la habitación **Suite**, pulsar el botón **Book now**.
3. Comprobar que se muestra el título **Suite Room**.
4. Comprobar que se muestra la sección **Room Features**.
5. Comprobar que se muestra la sección **Room Policies**.
6. Comprobar que se muestra el horario de entrada **Check-in: 3:00 PM - 8:00 PM**.
7. Comprobar que se muestra la regla **No smoking**.

### Resultado esperado

La ficha de la suite muestra características, políticas de entrada y salida y normas de la casa.

---

## CP004 — Envío de mensaje de contacto

**Objetivo**: verificar que un visitante puede enviar un mensaje al hotel desde el formulario de
contacto.

**Precondiciones**: ninguna.

### Pasos

1. Acceder al portal.
2. Ir a la sección de contacto.
3. Introducir el nombre `Ana Prueba`.
4. Introducir el correo `ana.prueba@example.com`.
5. Introducir el teléfono `012345678901`.
6. Introducir el asunto `Consulta sobre desayuno`.
7. Introducir el mensaje `Hola, quisiera saber el horario del desayuno para una estancia de dos noches. Gracias.`
8. Pulsar el botón **Submit**.
9. Comprobar que se muestra el agradecimiento **Thanks for getting in touch Ana Prueba!**

### Resultado esperado

El sistema confirma la recepción del mensaje citando el nombre del remitente y el asunto enviado.

---

## CP005 — Validaciones del formulario de contacto

**Objetivo**: verificar que el formulario de contacto rechaza el envío vacío e informa de cada
campo obligatorio.

**Precondiciones**: ninguna.

### Pasos

1. Acceder al portal.
2. Ir a la sección de contacto.
3. Pulsar el botón **Submit** sin rellenar ningún campo.
4. Comprobar que se muestra el error **Name may not be blank**.
5. Comprobar que se muestra el error **Subject may not be blank**.
6. Comprobar que se muestra el error **Message may not be blank**.

### Resultado esperado

El mensaje no se envía y el sistema enumera los campos obligatorios que faltan.

---

## CP006 — Acceso al panel de administración

**Objetivo**: verificar que el administrador accede al panel y ve el inventario de habitaciones.

**Precondiciones**: usuario administrador dado de alta.

### Pasos

1. Acceder al panel de administración.
2. Introducir el usuario administrador.
3. Introducir la contraseña.
4. Pulsar el botón **Login**.
5. Comprobar que se muestra la columna **Room #**.
6. Comprobar que se muestra la columna **Type**.
7. Comprobar que se muestra la columna **Price**.
8. Comprobar que se muestra la habitación **101** en el listado.

### Resultado esperado

El panel muestra el inventario de habitaciones en una tabla con número, tipo, accesibilidad,
precio y detalles.

---

## CP007 — Alta de habitación

**Objetivo**: verificar que el administrador puede dar de alta una habitación y que ésta aparece
en el inventario.

**Precondiciones**: sesión de administrador iniciada (CP006).

### Pasos

1. Acceder al panel de administración con sesión iniciada.
2. Introducir el número de habitación `701`.
3. Seleccionar el tipo **Twin**.
4. Seleccionar accesible **true**.
5. Introducir el precio `123`.
6. Marcar la característica **WiFi**.
7. Pulsar el botón **Create**.
8. Comprobar que se muestra la habitación **701** en el listado.

### Resultado esperado

La habitación queda dada de alta y aparece como una fila más del inventario con su tipo y precio.

---

## CP008 — La reserva llega a la bandeja del administrador

**Objetivo**: verificar que una reserva hecha en el portal público genera un aviso en la bandeja
de mensajes del administrador.

**Precondiciones**: la habitación doble tiene disponibilidad en la ventana de fechas del caso
(24/11/2026 a 26/11/2026).

### Pasos

1. Acceder al portal.
2. Introducir la fecha de entrada `24/11/2026`.
3. Introducir la fecha de salida `26/11/2026`.
4. Pulsar el botón **Check Availability**.
5. En la tarjeta de la habitación **Double**, pulsar el botón **Book now**.
6. Pulsar el botón **Reserve Now**.
7. Introducir el nombre del huésped.
8. Introducir el apellido del huésped.
9. Introducir el correo del huésped.
10. Introducir el teléfono del huésped.
11. Pulsar el botón **Reserve Now**.
12. Comprobar que se muestra el mensaje **Booking Confirmed**.
13. Acceder al panel de administración con sesión iniciada.
14. Abrir la bandeja de **Messages**.
15. Comprobar que se muestra el aviso **You have a new booking!**

### Resultado esperado

La reserva del portal público genera un aviso de nueva reserva en la bandeja del administrador a
nombre del huésped que reservó.

---

## CP009 — Lectura de un mensaje de la bandeja

**Objetivo**: verificar que el administrador puede abrir un mensaje de la bandeja, leer sus datos
y cerrar la ventana.

**Precondiciones**: sesión de administrador iniciada. Existe al menos un mensaje en la bandeja
con asunto `Consulta sobre desayuno` (lo deja el CP004).

### Pasos

1. Acceder al panel de administración con sesión iniciada.
2. Abrir la bandeja de **Messages**.
3. Comprobar que se muestra la columna **Name**.
4. Comprobar que se muestra la columna **Subject**.
5. Pulsar sobre el mensaje con asunto **Consulta sobre desayuno**.
6. Comprobar que la ventana muestra el remitente **From: Ana Prueba**.
7. Comprobar que la ventana muestra el correo **ana.prueba@example.com**.
8. Cerrar la ventana con el botón **Close**.
9. Comprobar que se muestra la columna **Subject**.

### Resultado esperado

La ventana del mensaje muestra remitente, teléfono, correo y texto completo; al cerrarla se
vuelve a la bandeja. El contador de mensajes sin leer disminuye tras la lectura.

---

## CP010 — Reserva rechazada por fechas ocupadas

**Objetivo**: verificar que el sistema no permite reservar una habitación en fechas ya ocupadas y
avisa al huésped.

**Precondiciones**: la habitación individual tiene disponibilidad en la ventana de fechas del
caso (01/12/2026 a 03/12/2026) al empezar el caso.

### Pasos

1. Acceder al portal.
2. Introducir la fecha de entrada `01/12/2026`.
3. Introducir la fecha de salida `03/12/2026`.
4. Pulsar el botón **Check Availability**.
5. En la tarjeta de la habitación **Single**, pulsar el botón **Book now**.
6. Pulsar el botón **Reserve Now**.
7. Introducir los datos del huésped y pulsar el botón **Reserve Now**.
8. Comprobar que se muestra el mensaje **Booking Confirmed**.
9. Repetir la misma reserva: volver al portal, introducir las mismas fechas, elegir la misma
   habitación y enviar los mismos datos del huésped.
10. Comprobar que el sistema muestra un **aviso de fechas no disponibles** y permite volver al
    catálogo.

### Resultado esperado

La segunda reserva no se registra. El sistema informa de que las fechas no están disponibles y el
huésped puede corregirlas sin perder la sesión.

---

## Nota para quien ejecute la prueba

Este documento se diseñó **desde la interfaz** (textos, botones y tablas observados el
2026-08-30), no desde una especificación previa. Aun así, hay tres tensiones conocidas que el
ejecutor va a encontrar, y las tres son deliberadas:

- **CP010**: el comportamiento que el documento exige en el paso 10 es el que el negocio espera,
  no necesariamente el que la aplicación tiene. Si la aplicación no avisa, no es un problema de
  localización: hay que decidir quién tiene razón y dejar constancia.
- **CP009**: el contador de la bandeja (**Messages N**) cambia con cada lectura y la bandeja es
  compartida — el número absoluto no es un oráculo estable. La comprobación del documento es la
  señal (la ventana se abre, se lee y se cierra), no el número.
- **Los datos de la demo se reinician por ventanas**: cada caso crea lo que consulta dentro del
  propio caso (CP008 reserva y luego consulta; CP009 depende del mensaje que deja CP004 en el
  mismo run). Si un caso se ejecuta suelto, su precondición lo dice.

La cara de **Branding** del panel queda fuera del alcance a propósito: modifica la web para todos
los usuarios de la demo compartida.
