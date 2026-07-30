# FD — ONESAIT Prestaciones: Rescate total Mod437 (CP001)

Entorno: preproducción (`https://spv.pre.mapfre.net/npa-escritorio`). Módulo S3 (spec-refiner),
flavor lean. Un único caso de prueba.

## Datos del caso

- **Credenciales**: usuario en MAYÚSCULAS y password correctos, desde `synthetic_fixtures.credentials[0]`
  del Style Contract local (`onesait.local.yaml`, no versionado — credenciales corporativas nunca
  en el repo).
- **Póliza**: número de póliza VIGENTE de la modalidad Mod437, desde `synthetic_fixtures.polizas[0].numero`.
- El caso es autolimpiante: la declaración creada se rehúsa al final (paso 13), dejando la póliza
  disponible para re-ejecución.

## CP001 — Rescate total Mod437, sin reinversión y sin transformación

### Paso 1 — Acceso

El usuario accede a la URL de la aplicación. La aplicación solicita credenciales; el usuario
introduce usuario (en mayúsculas) y password correctos.

**Comprobación 1**: se muestra la página principal de la aplicación.

### Paso 2 — Localizar la póliza

Ir a la opción del menú superior: **GESTION > Rescates/Reinversión > Simulación/Declaración
Rescates**. Introducir en el campo "Número Póliza" el número de póliza vigente de la modalidad del
caso y pulsar TAB para pasar al campo siguiente.

**Comprobación 2**: recupera los datos de la póliza, entre ellos los del tomador (nombre completo,
dirección) y los del beneficiario (nombre completo, tipo documento y número documento).

### Paso 3 — Tipo de prestación

Seleccionar en el desplegable del campo "Tipo Prestación" la opción **"Rescate Total"**. Pulsar
**"Siguiente"** en la botonera inferior.

**Comprobación 3**: acceso a la pantalla "Datos Tipo Prestación", donde se muestra el mensaje
"Le informamos que es posible reinvertir el importe de la prestación en caso de que lo necesite".

### Paso 6 — Finalizar declaración

Pulsar **"Finalizar"** en la botonera inferior.

**Comprobación 6**: se muestra la ventana "Finalizar Declaración".

### Paso 7 — Selección de firma

Pulsar en **"Oficina"** en la ventana flotante, y en **"Aceptar"**.

**Comprobación 7**: se muestra la ventana de confirmación de selección de firma.

### Paso 8 — Confirmar firma

Pulsar **"Sí"** en la ventana flotante.

**Comprobación 8**: se muestra la ventana de "Documento de Liquidación".

### Paso 9 — Cerrar documento de liquidación

Pulsar el botón de cerrar "X" de "Documento de Liquidación".

**Comprobación 9**: aparece la ventana de tarea "Gestionar Documentación y Firma".

### Paso 10 — Cerrar tarea

Pulsar el botón de cerrar "X" de la ventana de tarea "Gestionar Documentación y Firma".

**Comprobación 10**: se muestra la ventana inicial de ONESAIT.

### Paso 11 — Ir a consulta de declaraciones

Ir a la opción del menú superior: **CONSULTA E INFORMES > PRESTACIONES CONSULTAS > Consulta
Declaraciones**.

**Comprobación 11**: se muestra la pantalla "Consulta Declaraciones".

### Paso 12 — Buscar la declaración

Introducir en el campo "Número Póliza" el número de póliza utilizado en el paso 2. Seleccionar en
"Estado Declaración" la opción **"En elaboración"** y pulsar el botón **"Buscar"**.

**Comprobación 12**: la búsqueda devuelve resultado.

### Paso 13 — Rehusar la declaración

Pulsar el botón **"Rehusar Declaración"**. En la ventana que aparece, seleccionar como "Motivo
Rechazo" la opción **"Rehuse del cliente"** y pulsar el botón **"Aceptar"**.

**Comprobación 13**: se muestra la pantalla "Consulta Declaraciones" y el estado de la declaración
es **"Rehusada"**.

### Paso 14 — Cierre

Pulsar el botón de cerrar "X".

**Comprobación 14**: se muestra la ventana inicial de ONESAIT.
