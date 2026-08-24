# Documento Funcional — Portal de RRHH OrangeHRM (edición para el ejercicio del panel)

**Proyecto**: OrangeHRM OS 5.9 — portal de recursos humanos
**Versión**: 1.0-panel
**Entorno de pruebas**: https://opensource-demo.orangehrmlive.com/

---

> ## Qué es esto y en qué se diferencia de los otros dos FD
>
> `orangehrm-fd.md` y `orangehrm-fd-citado.md` existen para medir **una** variable: si citar los
> literales de pantalla cambia lo que el motor resuelve. Este documento **no mide eso**. Este
> documento existe para **provocar el panel de asistencia de forma controlada**.
>
> Un FD todo citado resuelve entero y el panel no llega a abrirse: no hay nada que probar. Un FD
> sin citar nada abre siete paneles idénticos, que aburre y mide una sola cosa. Así que este
> mezcla a propósito: **cita donde quiere que vuele y no cita —o cita mal— donde quiere que se
> plante**, y cada caso está diseñado para plantarse **por un motivo distinto**.
>
> ### De dónde sale cada literal, porque un fixture cocinado no vale nada
>
> - `Username`, `Password`, `Login`, `Dashboard`, `PIM`, `Leave`, `Employee Information`,
>   `Leave List`, `Reset`, `Search`, `No Records Found` — medidos contra el DOM real el
>   2026-08-22 (ver `orangehrm-fd-citado.md`) y **vueltos a comprobar el 2026-08-24**.
> - `-- Select --` **aparece 3 veces** en la pantalla de ausencias. Medido el 2026-08-24 contando
>   nodos visibles, no supuesto. Es el corazón del CP-04.
>
> ### Lo que se deja mal a propósito
>
> Los CP-02, CP-03, CP-04 y CP-05 nombran elementos que **no existen con ese nombre**. No es un
> descuido: es el ejercicio. Un FD real de un cliente tiene exactamente estos defectos —el
> analista escribe «Buscar empleado» y el botón pone «Search»— y el panel existe para que el QA
> los resuelva sin salirse de la herramienta.

---

## 1. Acceso al portal — **CP-01**

El portal es de acceso restringido. La pantalla de acceso presenta dos campos, **"Username"** y
**"Password"**, y un botón **"Login"**.

Un usuario registrado debe poder acceder introduciendo sus credenciales. Las credenciales de
demostración están publicadas en la propia pantalla de acceso: usuario `Admin`, contraseña
`admin123`.

Tras un acceso correcto el sistema muestra el panel principal, cuyo encabezado es **"Dashboard"**.

> **Este caso tiene que volar sin que aparezca ningún panel.** Es el control del ejercicio: si
> aquí te sale un panel, el problema no es el diseño de la prueba, es el motor.

## 2. Búsqueda de empleados en el módulo de personal — **CP-02**

Desde el panel principal, un usuario autenticado abre el módulo de personal a través del elemento
de navegación **"PIM"**, que muestra el panel **"Employee Information"**.

Para lanzar la consulta, el usuario pulsa el botón **"Search Employee"** del formulario de
filtros.

> **Lo que debería pasar**: el botón se llama solo `Search`. El panel tiene que decirte que no
> encuentra «Search Employee» **y ofrecerte candidatos**, porque comparten palabra.

## 3. Acceso al módulo de ausencias — **CP-03**

Desde el panel principal, el usuario abre el módulo de gestión de ausencias pulsando el elemento
de navegación **"Ausencias"** del menú lateral.

> **Lo que debería pasar**: el menú está en inglés y dice `Leave`. Como «Ausencias» no comparte
> ninguna palabra con nada de la pantalla, el panel tiene que reconocer que **no tiene nada que
> ofrecerte** y decirlo, en vez de enseñarte una lista de relleno.

## 4. Filtrado por tipo de ausencia — **CP-04**

En la pantalla **"Leave List"**, el usuario despliega el selector de tipo de ausencia, que se
muestra con el texto **"-- Select --"**, y elige un valor.

> **Lo que debería pasar — este es el caso que da nombre a todo esto (D27)**: hay **tres**
> desplegables en esa pantalla y los tres ponen `-- Select --`. El panel tiene que decirte que
> aparece tres veces y que **no sabe cuál**, no que no existe. La respuesta correcta del QA aquí
> es señalar el que toca; la respuesta que el panel provocaba antes era «No existe aquí».

## 5. Resultado de la consulta de ausencias — **CP-05**

Tras lanzar la búsqueda en **"Leave List"** con los filtros por defecto, el sistema comunica el
resultado mostrando el texto **"Solicitudes encontradas"** seguido del número de solicitudes.

> **Lo que debería pasar**: la aplicación no dice eso — con los filtros por defecto dice
> `No Records Found`. El panel tiene que enseñarte **lo que la pantalla sí dice**, para que
> decidas si la aplicación tiene razón (y el plan está viejo) o si esto es un defecto.
>
> **Y aquí hay algo que quiero que mires con lupa**: si los textos que te ofrece son `Leave` y
> `Leave List` —que son el título y la miga de pan, o sea **mueble**— y no el resultado de verdad,
> eso es **D54** asomando: el motor mete los encabezados en el mismo cubo que los resultados. No
> es un fallo del ejercicio; es un defecto abierto y esta es la primera vez que se le ve la cara
> en el panel.
