# Documento Funcional — Tienda Online SauceDemo

**Proyecto**: SauceDemo — e-commerce de práctica de Sauce Labs
**Versión**: 1.0
**Entorno de pruebas**: https://www.saucedemo.com/

> Fixture de validación del módulo S3 (Spec-refiner). FD redactado en prosa libre, sin
> identificadores RF-NNN explícitos — el refiner debe estructurarlo él. A diferencia del FD de
> ParaBank, este no incluye ambigüedad deliberada ni flujos no expuestos: los tres
> comportamientos son claros y mapeables contra el DOM (demo limpio, todo verde).

## 1. Introducción y alcance

SauceDemo es una tienda online de demostración. Este documento describe el acceso de usuarios y
el flujo de compra de un producto. Quedan fuera de alcance la gestión de catálogo, la
administración de usuarios y los métodos de pago reales.

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
debe completar el pedido y mostrar al usuario una confirmación de que el pedido se ha realizado.
