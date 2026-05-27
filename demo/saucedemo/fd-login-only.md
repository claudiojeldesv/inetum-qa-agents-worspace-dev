# Functional Design — SauceDemo · solo login (scope acotado)

> Subset del FD principal (`demo/saucedemo/fd.md`) restringido a los criterios de autenticación. Útil para validar el flujo `/test-pilot:plan` + `/test-pilot:generate` con un batch pequeño (~4 tests) en lugar de los 14 del FD completo.

## 1. Producto

SauceDemo (`https://www.saucedemo.com/`). Solo evaluamos el flujo de login en `/` y su redirección a `/inventory.html`. No tocamos catálogo, carrito ni checkout en este subset.

## 2. Roles

- **Usuario estándar** (`standard_user` / `secret_sauce`): autenticación exitosa.
- **Usuario bloqueado** (`locked_out_user` / `secret_sauce`): autenticación rechazada con mensaje.

Las credenciales sintéticas están declaradas en `config/allowed-targets.yaml#syntheticCredentials`. El compliance gate permite usarlas.

## 3. Criterios funcionales

### 3.1. Autenticación

- **RF-001** · Login con `standard_user` redirige a `/inventory.html` y la cabecera muestra "Swag Labs".
- **RF-002** · Login con `locked_out_user` mantiene al usuario en `/` y muestra mensaje de error en `[data-test="error"]` que contiene la frase "Sorry, this user has been locked out".
- **RF-003** · Login con password incorrecto produce mensaje de error sin redirección. Se prueba con `standard_user` / `wrong_password`. El elemento `[data-test="error"]` debe ser visible (sin asserting sobre el texto, robusto a cambios de copy).
- **RF-004** · Logout desde el menú lateral devuelve al login.

## 4. Restricciones de testing

- Modo greybox.
- Solo credenciales sintéticas declaradas.
- Cada test cubre **un** criterio (cita `RF-NNN` en JSDoc).
- Tests independientes — cada test logea desde 0 (no asume sesión previa).
- Axe-core check obligatorio en cada test (lo inyecta Slice 7).
- Sin `page.waitForTimeout()`.

## 5. Lo que el subset **NO** cubre

- Catálogo, carrito, checkout, ordenación, robustez `problem_user`. Ver `fd.md` para esos criterios.
- Tests cross-browser.
- Aritmética de checkout (RF-011, RF-014 del FD completo).
