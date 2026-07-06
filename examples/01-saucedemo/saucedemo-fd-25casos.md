# Documento Funcional — Tienda Online SauceDemo (cobertura ampliada)

**Proyecto**: SauceDemo — e-commerce de práctica de Sauce Labs
**Versión**: 2.0
**Entorno de pruebas**: https://www.saucedemo.com/

> Input del módulo S3 (Spec-refiner). FD en prosa libre, sin identificadores RF-NNN explícitos:
> el refiner los asigna. A diferencia del FD base de este lab (3 comportamientos), este documento
> describe la superficie funcional completa del demo para una cobertura de ~25 criterios. Cada
> comportamiento se redacta de forma atómica y con su resultado esperado explícito, de modo que el
> refiner pueda mapearlo contra el DOM sin dejar huecos en `refinement-questions.md`. Todos los
> comportamientos son observables en el sitio real; ninguno describe funcionalidad no expuesta.

## 1. Introducción y alcance

SauceDemo es una tienda online de demostración con un catálogo fijo de seis productos. Este
documento describe el acceso de usuarios, la navegación del catálogo, la ordenación del listado,
la gestión del carrito, el proceso de pago y el cierre de sesión. Quedan fuera de alcance la
administración del catálogo, la gestión de usuarios, los métodos de pago reales y cualquier
persistencia server-side (el demo no mantiene estado de sesión en servidor).

Credenciales de prueba publicadas por Sauce Labs (no son PII): `standard_user` / `secret_sauce`
para el flujo principal; `locked_out_user` / `secret_sauce` para el caso de usuario bloqueado.

## 2. Acceso a la tienda

La tienda es de acceso restringido mediante usuario y contraseña.

- Un usuario válido que introduce `standard_user` y `secret_sauce` y confirma debe acceder
  correctamente; el sistema muestra el listado de productos.
- Un usuario bloqueado que introduce `locked_out_user` con su contraseña correcta debe ser
  rechazado; el sistema muestra un mensaje de error indicando que el usuario está bloqueado y no
  permite el acceso al listado de productos.
- Un usuario que introduce credenciales que no corresponden a ninguna cuenta debe ser rechazado;
  el sistema muestra un mensaje de error indicando que usuario y contraseña no coinciden.
- Si el usuario intenta acceder sin haber introducido el nombre de usuario, el sistema impide el
  acceso y muestra un mensaje de error indicando que el nombre de usuario es obligatorio.
- Si el usuario introduce el nombre de usuario pero deja la contraseña vacía, el sistema impide el
  acceso y muestra un mensaje de error indicando que la contraseña es obligatoria.

## 3. Catálogo de productos

Tras el acceso, el sistema presenta el catálogo de productos disponibles.

- El listado de productos debe mostrar los seis productos del catálogo.
- Cada producto del listado debe presentar, como mínimo, su nombre, su precio y su imagen.
- Al seleccionar el nombre de un producto en el listado, el sistema debe mostrar la ficha de
  detalle de ese producto, con su descripción y su precio.
- Desde la ficha de detalle de un producto, el usuario debe poder volver al listado de productos
  mediante la acción de retorno al catálogo.

## 4. Ordenación del listado

El listado de productos ofrece un control de ordenación con cuatro criterios.

- Al seleccionar la ordenación por nombre de la A a la Z, el listado debe presentar los productos
  ordenados alfabéticamente de forma ascendente.
- Al seleccionar la ordenación por nombre de la Z a la A, el listado debe presentar los productos
  ordenados alfabéticamente de forma descendente.
- Al seleccionar la ordenación por precio de menor a mayor, el listado debe presentar los
  productos ordenados por precio de forma ascendente.
- Al seleccionar la ordenación por precio de mayor a menor, el listado debe presentar los
  productos ordenados por precio de forma descendente.

## 5. Gestión del carrito

El usuario gestiona los productos que desea comprar a través de un carrito.

- Al añadir un producto al carrito desde el listado, el indicador del carrito debe reflejar una
  unidad.
- Al añadir varios productos distintos al carrito, el indicador del carrito debe reflejar el número
  total de productos añadidos.
- Cuando un producto se ha añadido al carrito, su botón en el listado debe cambiar para ofrecer la
  acción de quitarlo del carrito.
- Al quitar un producto previamente añadido desde el listado, el indicador del carrito debe
  decrementar en consecuencia.
- Al abrir el carrito, el sistema debe mostrar la relación de los productos previamente añadidos.
- Desde el carrito, la acción de seguir comprando debe devolver al usuario al listado de productos.
- El contenido del carrito debe mantenerse al navegar entre el listado y el carrito dentro de la
  misma sesión.

## 6. Proceso de pago

Desde el carrito, el usuario puede completar la compra a través de un proceso de pago.

- Al iniciar el pago e introducir nombre, apellido y código postal válidos, el sistema debe avanzar
  a la pantalla de revisión del pedido.
- Si el usuario intenta avanzar en el pago sin introducir el nombre, el sistema debe impedir el
  avance y mostrar un mensaje de error indicando que el nombre es obligatorio.
- La pantalla de revisión del pedido debe mostrar el resumen de los productos, el subtotal, el
  impuesto aplicado y el total a pagar.
- Al confirmar el pedido en la pantalla de revisión, el sistema debe completar la compra y mostrar
  una confirmación de que el pedido se ha realizado.

## 7. Cierre de sesión

- Un usuario autenticado debe poder cerrar la sesión desde el menú de la aplicación; al hacerlo, el
  sistema lo devuelve a la pantalla de inicio de sesión.
