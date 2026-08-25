# FD — OrangeHRM: Consulta de personal y cancelación de baja (CP001)

Entorno: preproducción (`https://opensource-demo.orangehrmlive.com`). Módulo S3 (spec-refiner),
flavor lean. Un único caso de prueba.

## Datos del caso

- **Credenciales**: usuario y password correctos, desde `synthetic_fixtures.credentials[0]` del
  Style Contract.
- El caso es **no destructivo**: la baja que se inicia en el paso 7 se cancela en el paso 8, de
  modo que el listado queda como estaba y el caso se puede re-ejecutar.

## CP001 — Consulta del listado de personal, cancelación de una baja y consulta de ausencias

### Paso 1 — Acceso

El usuario accede a la URL de la aplicación. La aplicación solicita credenciales; el usuario
introduce el usuario en el campo "Username" y la contraseña en el campo "Password", y pulsa
**"Login"**.

**Comprobación 1**: se muestra la página principal de la aplicación.

### Paso 2 — Acceder al listado de personal

Ir a la opción del menú lateral: **PIM > Employee List**.

**Comprobación 2**: se muestra la pantalla de información de empleados, con un formulario de
filtros en la parte superior y el listado de empleados debajo.

### Paso 3 — Lanzar la consulta

Pulsar el botón **"Buscar"** de la botonera del formulario de filtros.

**Comprobación 3**: el sistema recupera el listado de empleados e indica el número de registros
encontrados.

### Paso 6 — Iniciar la baja de un empleado

Pulsar el icono de papelera de la primera fila del listado.

**Comprobación 6**: se muestra la ventana de confirmación de baja, con el mensaje de advertencia
de que el registro se eliminará de forma permanente.

### Paso 7 — Cancelar la baja

Pulsar **"No, Cancel"** en la ventana de confirmación.

**Comprobación 7**: la ventana se cierra y el empleado sigue en el listado.

### Paso 8 — Ir a la consulta de ausencias

Ir a la opción del menú lateral: **Ausencias**.

**Comprobación 8**: se muestra la pantalla de listado de solicitudes de ausencia, con su
formulario de búsqueda.

### Paso 9 — Consultar las solicitudes

Con los filtros que el sistema trae por defecto, pulsar el botón **"Search"**.

**Comprobación 9**: la búsqueda devuelve el número de solicitudes encontradas.

### Paso 10 — Cierre

Pulsar el botón de cerrar **"X"**.

**Comprobación 10**: se muestra la pantalla inicial de la aplicación.
