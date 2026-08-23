# Documento Funcional — Portal de RRHH OrangeHRM

**Proyecto**: OrangeHRM OS 5.9 — portal de recursos humanos
**Versión**: 1.0
**Entorno de pruebas**: https://opensource-demo.orangehrmlive.com/

> **Nota de método.** Todos los literales de interfaz que aparecen entre comillas en este
> documento están **medidos contra el DOM real** el 2026-08-22, no redactados de memoria. La
> aplicación está en inglés; los captions se citan en inglés tal cual aparecen en pantalla, y la
> prosa que los rodea está en español. Es deliberado: es la variable que este documento existe
> para aislar.
>
> Alcance acotado a tres módulos: acceso, PIM y Leave. Quedan fuera Admin, Time, Recruitment,
> Performance, Directory, Maintenance, Claim y Buzz.

## 1. Acceso al portal

El portal es de acceso restringido. La pantalla de acceso se titula **"Login"** y presenta dos
campos, **"Username"** y **"Password"**, y un botón **"Login"**.

Un usuario registrado debe poder acceder introduciendo sus credenciales. Las credenciales de
demostración están publicadas en la propia pantalla de acceso: usuario `Admin`, contraseña
`admin123`. Tras un acceso correcto el sistema muestra el panel principal, cuyo encabezado es
**"Dashboard"**.

Cuando las credenciales no son válidas, el sistema **no** da acceso y muestra un aviso con el
texto exacto **"Invalid credentials"**. El usuario permanece en la pantalla de acceso.

## 2. Consulta del listado de empleados (PIM)

Desde el panel principal, un usuario autenticado debe poder abrir el módulo de personal a través
del elemento de navegación **"PIM"**.

El módulo presenta un panel de búsqueda cuyo encabezado es **"Employee Information"**, con un
formulario de filtros y los botones **"Reset"** y **"Search"**.

Bajo el formulario, el sistema muestra el listado de empleados con el número de registros
encontrados, en un texto que termina en **"Records Found"**. La tabla de resultados incluye,
entre otras, las columnas **"First (& Middle) Name"**, **"Last Name"** y **"Job Title"**.

> El número concreto de registros **no se fija en este documento**: es dato de un entorno
> compartido y cambia. Lo que el sistema debe garantizar es que el listado se muestra y declara
> cuántos registros ha encontrado.

## 3. Consulta de solicitudes de ausencia (Leave)

Desde el panel principal, un usuario autenticado debe poder abrir el módulo de ausencias a través
del elemento de navegación **"Leave"**.

El módulo presenta la pantalla **"Leave List"**, con un formulario de búsqueda que incluye un
campo de nombre de empleado —cuyo texto de ayuda es **"Type for hints..."**— y los botones
**"Reset"** y **"Search"**.

Con los filtros que el sistema trae por defecto, la búsqueda no devuelve solicitudes y el sistema
lo comunica con el texto exacto **"No Records Found"**.
