# Documento Funcional — Tienda Online SauceDemo

**Proyecto**: SauceDemo — e-commerce de práctica de Sauce Labs
**Versión**: 2.0 (evoluciona la 1.0 del Lab 01)
**Entorno de pruebas**: https://www.saucedemo.com/

> Fixture del Lab 07 (modo incremental). Respecto a la v1.0 (`../01-saucedemo/saucedemo-fd.md`):
> las secciones 2 y el inicio de la 3 NO cambian; el final de la sección 3 **precisa** el
> comportamiento de la confirmación (requisito modificado); la sección 4 es **nueva** (requisito
> añadido). El diff del agente debe detectar exactamente eso — ni más, ni menos.

## 1. Introducción y alcance

SauceDemo es una tienda online de demostración. Este documento describe el acceso de usuarios,
el flujo de compra de un producto y el cierre de sesión. Quedan fuera de alcance la gestión de
catálogo, la administración de usuarios y los métodos de pago reales.

## 2. Acceso a la tienda

La tienda es de acceso restringido. Un usuario debe poder iniciar sesión introduciendo su
nombre de usuario y su contraseña. Tras una autenticación correcta con un usuario válido
(standard_user / secret_sauce), el sistema debe mostrar el listado de productos disponibles.

El sistema mantiene una lista de usuarios bloqueados. Cuando un usuario bloqueado
(locked_out_user / secret_sauce) intenta acceder con su contraseña correcta, el sistema debe
rechazar el acceso y mostrar un mensaje de error indicando que el usuario está bloqueado, sin
permitir la entrada al listado de productos.

## 3. Compra de un producto

Un usuario autenticado debe poder comprar un producto del catálogo. Desde el listado de
productos, el usuario añade un producto al carrito. La aplicación debe reflejar el producto en
el carrito. El usuario abre el carrito y continúa al proceso de pago, donde introduce sus datos
de envío (nombre, apellido y código postal) y confirma la compra. Una vez confirmada, el sistema
debe mostrar la página de confirmación con el mensaje "Thank you for your order!" y el carrito
debe quedar vacío (el indicador de artículos del carrito desaparece).

## 4. Cierre de sesión

Un usuario autenticado debe poder cerrar su sesión desde el menú lateral de la aplicación. Tras
cerrar sesión, el sistema debe devolver al usuario a la pantalla de inicio de sesión y no debe
ser posible volver al listado de productos usando el historial del navegador sin autenticarse
de nuevo.
