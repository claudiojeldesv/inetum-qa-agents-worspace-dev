# Diseño Funcional — Tarificador de pólizas de vehículo · Regresión funcional

Documento de definición de pruebas. Registro corporativo: pasos simples, un verbo por línea, la
comprobación escrita como la espera el negocio.

Aplicación bajo prueba: tarificador público de pólizas de vehículo **Vehicle Insurance
Application** (Tricentis, versión 1.0.1). El alta de un presupuesto es un asistente de cinco
pasos: datos del vehículo, datos del tomador, datos del producto, selección de tarifa y envío
del presupuesto. Diez casos de regresión: flujos de tarificación, consultas sobre la tabla de
tarifas y validaciones de negocio.

Datos de prueba: tomador sintético **Ana Prueba** (nacida el `03/15/1990`, domicilio
`Calle Falsa 123`, `28001` `Madrid`, `Spain`, ocupación `Employee`), correo
`ana.prueba@example.com`, teléfono `0034600000000`, usuario `anaprueba` con contraseña
`SecretPass123!`. Vehículo de referencia: **Audi** de `110` kW, fabricado el `06/12/2020`,
`5` plazas, gasolina (`Petrol`), precio de lista `32000`, matrícula `QA-1234`, `12000` millas
anuales. Producto de referencia: inicio el `12/01/2026`, suma asegurada `5.000.000,00`,
bonificación `Bonus 1`, daños `Partial Coverage`, producto opcional `Euro Protection`, sin
coche de cortesía (`No`). Las fechas van en formato `MM/DD/YYYY`, como las pide la pantalla.

---

## CP001 — Tarificación de una póliza de automóvil

**Objetivo**: verificar que el asistente calcula la tabla de tarifas para un automóvil con los
datos completos del caso y muestra los cuatro precios anuales.

**Precondiciones**: ninguna. La tarificación no requiere usuario.

### Pasos

1. Acceder al portal.
2. Pulsar la opción **Automobile** del menú.
3. Comprobar que se muestra el paso **Enter Vehicle Data**.
4. Seleccionar la marca (**Make**) `Audi`.
5. Introducir la potencia (**Engine Performance**) `110`.
6. Introducir la fecha de fabricación (**Date of Manufacture**) `06/12/2020`.
7. Seleccionar el número de plazas (**Number of Seats**) `5`.
8. Seleccionar el combustible (**Fuel Type**) `Petrol`.
9. Introducir el precio de lista (**List Price**) `32000`.
10. Introducir la matrícula (**License Plate Number**) `QA-1234`.
11. Introducir el kilometraje anual (**Annual Mileage**) `12000`.
12. Pulsar el botón **Next »**.
13. Introducir el nombre (**First Name**) `Ana`.
14. Introducir el apellido (**Last Name**) `Prueba`.
15. Introducir la fecha de nacimiento (**Date of Birth**) `03/15/1990`.
16. Marcar el género **Male**.
17. Introducir la dirección (**Street Address**) `Calle Falsa 123`.
18. Seleccionar el país (**Country**) `Spain`.
19. Introducir el código postal (**Zip Code**) `28001`.
20. Introducir la ciudad (**City**) `Madrid`.
21. Seleccionar la ocupación (**Occupation**) `Employee`.
22. Marcar la afición (**Hobbies**) `Speeding`.
23. Pulsar el botón **Next »**.
24. Introducir la fecha de inicio (**Start Date**) `12/01/2026`.
25. Seleccionar la suma asegurada (**Insurance Sum**) `5.000.000,00`.
26. Seleccionar la bonificación (**Merit Rating**) `Bonus 1`.
27. Seleccionar el seguro de daños (**Damage Insurance**) `Partial Coverage`.
28. Marcar el producto opcional **Euro Protection**.
29. Seleccionar coche de cortesía (**Courtesy Car**) `No`.
30. Pulsar el botón **Next »**.
31. Comprobar que se muestra la tarifa **Silver**.
32. Comprobar que se muestra la tarifa **Gold**.
33. Comprobar que se muestra la tarifa **Platinum**.
34. Comprobar que se muestra la tarifa **Ultimate**.
35. Comprobar que la fila **Price per Year ($)** muestra los precios **88.00**, **260.00**,
    **510.00** y **972.00**.

### Resultado esperado

La tabla de tarifas muestra las cuatro opciones con su precio anual calculado para los datos
del caso. El precio es reproducible: los mismos datos producen los mismos precios.

---

## CP002 — Solicitud de envío del presupuesto Gold

**Objetivo**: verificar que el solicitante puede elegir la tarifa Gold y recibir el presupuesto
por correo.

**Precondiciones**: los datos del caso son los del CP001 (vehículo, tomador y producto de
referencia).

### Pasos

1. Realizar la tarificación completa del CP001 (pasos 1 a 30).
2. Seleccionar la opción de precio **Gold**.
3. Pulsar el botón **Next »**.
4. Comprobar que se muestra el paso de envío con el campo **E-Mail**.
5. Introducir el correo `ana.prueba@example.com`.
6. Introducir el teléfono `0034600000000`.
7. Introducir el usuario (**Username**) `anaprueba`.
8. Introducir la contraseña (**Password**) `SecretPass123!`.
9. Confirmar la contraseña (**Confirm Password**) `SecretPass123!`.
10. Introducir el comentario (**Comments**) `Solicitud de prueba QA. Ignorar.`
11. Pulsar el botón **« Send »**.
12. Comprobar que se muestra la ventana con el mensaje **Sending e-mail success!**
13. Cerrar la ventana con el botón **OK**.

### Resultado esperado

El sistema confirma el envío del presupuesto con el mensaje de éxito y, al cerrar la ventana,
el asistente queda listo para una nueva solicitud.

---

## CP003 — Consulta de las coberturas de la tabla de tarifas

**Objetivo**: verificar que la tabla de tarifas describe las coberturas de cada opción.

**Precondiciones**: los datos del caso son los del CP001.

### Pasos

1. Realizar la tarificación completa del CP001 (pasos 1 a 30).
2. Comprobar que se muestra la fila **Online Claim**.
3. Comprobar que se muestra la fila **Claims Discount (%)**.
4. Comprobar que se muestra la fila **Worldwide Cover**.
5. Comprobar que la fila **Claims Discount (%)** muestra los valores **No**, **2**, **5** y **10**.
6. Comprobar que la fila **Worldwide Cover** muestra los valores **No**, **Limited**,
   **Limited** y **Unlimited**.

### Resultado esperado

Cada opción de tarifa declara sus coberturas: reclamación online, descuento por siniestralidad
y cobertura mundial, crecientes de Silver a Ultimate.

---

## CP004 — Tarificación de una motocicleta

**Objetivo**: verificar que el asistente tarifica una motocicleta con sus campos propios
(modelo y cilindrada), distintos de los del automóvil.

**Precondiciones**: ninguna.

### Pasos

1. Acceder al portal.
2. Pulsar la opción **Motorcycle** del menú.
3. Comprobar que se muestra el campo **Model**.
4. Comprobar que se muestra el campo **Cylinder Capacity**.
5. Seleccionar la marca (**Make**) `Honda`.
6. Seleccionar el modelo (**Model**) `Scooter`.
7. Introducir la cilindrada (**Cylinder Capacity**) `125`.
8. Introducir la potencia (**Engine Performance**) `11`.
9. Introducir la fecha de fabricación (**Date of Manufacture**) `03/10/2022`.
10. Seleccionar el número de plazas (**Number of Seats**) `2`.
11. Introducir el precio de lista (**List Price**) `4000`.
12. Introducir el kilometraje anual (**Annual Mileage**) `4000`.
13. Pulsar el botón **Next »**.
14. Introducir los datos del tomador: nombre `Ana`, apellido `Prueba`, nacimiento
    `03/15/1990`, género **Female**, dirección `Calle Falsa 123`, país `Spain`, código postal
    `28001`, ciudad `Madrid`, ocupación `Public Official`.
15. Pulsar el botón **Next »**.
16. Introducir la fecha de inicio (**Start Date**) `12/01/2026`.
17. Seleccionar la suma asegurada (**Insurance Sum**) `3.000.000,00`.
18. Seleccionar el seguro de daños (**Damage Insurance**) `No Coverage`.
19. Pulsar el botón **Next »**.
20. Comprobar que se muestra la tarifa **Silver**.
21. Comprobar que se muestra la tarifa **Ultimate**.
22. Comprobar que se muestra la fila **Price per Year ($)**.

### Resultado esperado

El asistente tarifica la motocicleta con su formulario propio (sin bonificación ni coche de
cortesía) y muestra la tabla con las cuatro opciones y su precio anual.

---

## CP005 — Validación de la potencia del motor

**Objetivo**: verificar que el campo de potencia rechaza valores no numéricos e informa del
rango admitido.

**Precondiciones**: ninguna.

### Pasos

1. Acceder al portal.
2. Pulsar la opción **Automobile** del menú.
3. Introducir la potencia (**Engine Performance**) `abc`.
4. Pasar al campo siguiente para que la pantalla valide.
5. Enfocar de nuevo el campo de potencia.
6. Comprobar que se muestra el aviso **Must be a number between 1 and 2000**.

### Resultado esperado

El campo queda marcado como inválido y el aviso declara el rango admitido (número entre 1 y
2000).

---

## CP006 — Regla de la fecha de inicio de la póliza

**Objetivo**: verificar que la fecha de inicio exige una antelación mínima de un mes.

**Precondiciones**: los pasos de vehículo y tomador se rellenan con los datos de referencia
del CP001 para llegar al paso del producto.

### Pasos

1. Realizar los pasos 1 a 23 del CP001 (vehículo y tomador completos).
2. Introducir la fecha de inicio (**Start Date**) `09/15/2026`.
3. Pasar al campo siguiente para que la pantalla valide.
4. Enfocar de nuevo el campo de fecha de inicio.
5. Comprobar que se muestra el aviso **Must be more than one month in the future**.

### Resultado esperado

La fecha con menos de un mes de antelación se rechaza y el aviso enuncia la regla de negocio.

---

## CP007 — El teléfono del envío solo admite dígitos

**Objetivo**: verificar que el teléfono con prefijo internacional en formato `+` se rechaza, y
que el envío no se realiza mientras haya datos inválidos.

**Precondiciones**: tarificación completa con los datos del CP001 y tarifa **Gold**
seleccionada (pasos 1 a 3 del CP002).

### Pasos

1. Realizar los pasos 1 a 4 del CP002 (hasta el paso de envío).
2. Introducir el correo `ana.prueba@example.com`.
3. Introducir el teléfono `+34600000000`.
4. Pasar al campo siguiente para que la pantalla valide.
5. Enfocar de nuevo el campo de teléfono.
6. Comprobar que se muestra el aviso **Must be only digits**.
7. Introducir el usuario `anaprueba`, la contraseña `SecretPass123!` y su confirmación.
8. Pulsar el botón **« Send »**.
9. Comprobar que se muestra la ventana con el mensaje **Not finished yet...**
10. Comprobar que la ventana muestra el texto **There is still some data missing!**
11. Cerrar la ventana con el botón **OK**.

### Resultado esperado

El envío no se realiza con el teléfono en formato inválido: el sistema avisa de que faltan
datos y el solicitante puede corregir sin perder lo introducido.

---

## CP008 — Volver atrás conserva los datos introducidos

**Objetivo**: verificar que retroceder por el asistente con **« Prev** no pierde los datos ya
introducidos.

**Precondiciones**: ninguna.

### Pasos

1. Realizar los pasos 1 a 23 del CP001 (vehículo y tomador completos).
2. Pulsar el botón **« Prev** para volver al paso del tomador.
3. Pulsar el botón **« Prev** para volver al paso del vehículo.
4. Comprobar que la marca (**Make**) sigue siendo `Audi`.
5. Comprobar que la potencia (**Engine Performance**) sigue siendo `110`.
6. Comprobar que la matrícula (**License Plate Number**) sigue siendo `QA-1234`.

### Resultado esperado

El asistente conserva todos los datos al navegar hacia atrás; el solicitante puede corregir
cualquier paso sin volver a empezar.

---

## CP009 — La tabla de tarifas no se calcula sin los datos previos

**Objetivo**: verificar que la tabla de tarifas se niega a calcular si los tres primeros pasos
no están completos, e informa de ello.

**Precondiciones**: ninguna.

### Pasos

1. Acceder al portal.
2. Pulsar la opción **Automobile** del menú.
3. Pulsar directamente la pestaña **Select Price Option**.
4. Comprobar que se muestra el aviso **Please, complete the first three steps to see the price
   table.**
5. Comprobar que no se muestra la fila **Price per Year ($)**.

### Resultado esperado

Sin los datos de vehículo, tomador y producto, el sistema no calcula precios: muestra el aviso
y ninguna tarifa.

---

## CP010 — El asistente no debe avanzar con datos inválidos

**Objetivo**: verificar que al pulsar **Next »** con el paso incompleto el asistente impide el
avance y mantiene al solicitante en el paso con errores.

**Precondiciones**: ninguna.

### Pasos

1. Acceder al portal.
2. Pulsar la opción **Automobile** del menú.
3. Pulsar el botón **Next »** sin rellenar ningún campo.
4. Comprobar que se sigue mostrando el paso **Enter Vehicle Data** con sus campos (la marca
   **Make** visible).
5. Comprobar que el paso informa de los campos con error.

### Resultado esperado

El asistente no avanza con datos inválidos: el solicitante permanece en el paso de datos del
vehículo y ve qué campos debe corregir antes de continuar.

---

## Nota para quien ejecute la prueba

Este documento se diseñó **desde la interfaz** (textos, botones, tablas y avisos observados el
2026-08-31), no desde una especificación previa. Hay cuatro tensiones conocidas que el ejecutor
va a encontrar, y las cuatro son deliberadas:

- **CP010**: el comportamiento que el documento exige es el que el negocio espera de un
  asistente con validación, no necesariamente el que la aplicación tiene. Si la aplicación
  avanza de paso dejando un contador de errores en la pestaña, no es un problema de
  localización: hay que decidir quién tiene razón y dejar constancia.
- **El oráculo de precios pertenece a LA configuración**: los precios **88.00 / 260.00 /
  510.00 / 972.00** del CP001 se midieron dos veces con datos idénticos (el motor de tarifas
  es determinista). Cualquier cambio en un dato del caso — una fecha, la bonificación, un
  producto opcional — produce otros precios y el caso debe fallar. Eso es el oráculo
  trabajando, no un defecto.
- **Las fechas caducan**: la fecha de inicio `12/01/2026` cumple la regla del mes de
  antelación en la época en que se diseñó el documento. Si la regresión se ejecuta después del
  1 de noviembre de 2026, el caso cae por dato caducado, no por defecto del producto. La fecha
  inválida del CP006 (`09/15/2026`) en cambio no caduca: siempre incumplirá la regla.
- **Los desplegables no son nativos a la vista**: la aplicación estiliza selects, radios y
  checkboxes (el control nativo está oculto). El gesto del usuario real es sobre el control
  visible; una automatización que fuerce el control oculto está probando otra cosa.
