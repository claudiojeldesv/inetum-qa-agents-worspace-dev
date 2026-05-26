# Functional Design — SauceDemo (demo MVP)

> FD plausible para el demo del MVP de `ia4d-test-pilot`. Es un FD **manual** redactado en markdown libre, no producido por `ia4d-functional-design-expert`. Sirve como input a `/test-pilot:plan` para demostrar el mapeo criterio → caso de test sin depender de la integración formal con el FD-expert (non-goal MVP).

## 1. Producto

SauceDemo (`https://www.saucedemo.com/`) es una aplicación e-commerce demo de Sauce Labs orientada a probar Playwright/Selenium contra una app pública. No es un sistema real de producción.

Catálogo: 6 productos físicos (mochilas, camisetas, linternas, etc.). Flujo: login → catálogo → carrito → checkout → confirmación.

## 2. Roles

- **Usuario estándar** (`standard_user` / `secret_sauce`): puede recorrer todo el flujo end-to-end sin friction.
- **Usuario bloqueado** (`locked_out_user`): autenticación rechazada con error visible.
- **Usuario problemático** (`problem_user`): puede loginar pero la UI tiene defectos deliberados (imágenes mezcladas, ordenación rota).
- **Usuario lento** (`performance_glitch_user`): login y navegación con latencia artificial.

Todos los anteriores comparten contraseña `secret_sauce` y están declarados en `config/allowed-targets.yaml#syntheticCredentials`.

## 3. Criterios funcionales

### 3.1. Autenticación

- **RF-001** · Login con `standard_user` redirige a `/inventory.html` y la cabecera muestra "Swag Labs".
- **RF-002** · Login con `locked_out_user` mantiene al usuario en `/` y muestra mensaje de error en `[data-test="error"]` que contiene la frase "Sorry, this user has been locked out".
- **RF-003** · Login con password incorrecto produce mensaje de error sin redirección.
- **RF-004** · Logout desde el menú lateral devuelve al login y borra el estado del carrito.

### 3.2. Catálogo

- **RF-005** · La página de inventario lista exactamente 6 productos con nombre, descripción, precio e imagen.
- **RF-006** · El selector de orden permite ordenar por nombre (A→Z, Z→A) y por precio (asc, desc). El orden aplicado es consistente con la opción seleccionada.

### 3.3. Carrito

- **RF-007** · Añadir un producto al carrito incrementa el badge del icono carrito y cambia el botón "Add to cart" a "Remove" en la tarjeta del producto.
- **RF-008** · Quitar un producto del carrito decrementa el badge y restaura el botón "Add to cart".
- **RF-009** · La página del carrito (`/cart.html`) lista los productos añadidos con cantidad, nombre y precio. Si el carrito está vacío, no muestra productos y el botón "Continue Shopping" sigue accesible.

### 3.4. Checkout

- **RF-010** · El checkout requiere First name, Last name y Zip/Postal Code. Cualquier campo vacío produce error en `[data-test="error"]`.
- **RF-011** · Checkout con datos válidos avanza al resumen (`/checkout-step-two.html`), donde subtotal, tax e ítem total son visibles y todos numéricos mayores que 0. Este criterio verifica **presencia y no-vaciedad**, no la aritmética.
- **RF-012** · Finalizar el checkout (`/checkout-complete.html`) muestra mensaje "Thank you for your order" y vacía el carrito.
- **RF-014** · En `/checkout-step-two.html`, los valores cumplen `tax == round(subtotal * 0.08, 2)` y `total == subtotal + tax`. Tasa de impuesto fija al 8% (declarada por SauceDemo). Este criterio verifica **corrección aritmética** — acoplado a la tasa; si SauceDemo la cambia, el test rompe deliberadamente para que el SDET revise.

### 3.5. Robustez / errores

- **RF-013** · El usuario `problem_user` puede loginar pero las imágenes del catálogo no corresponden al producto. Documentar como bug conocido — el agente no debe "arreglarlo", debe detectarlo y reportarlo en el plan.

## 4. Restricciones de testing

- Modo greybox. No leemos código fuente de SauceDemo.
- Solo credenciales sintéticas declaradas en `config/allowed-targets.yaml`.
- Cada test cubre **un** criterio (cita `RF-NNN` en JSDoc).
- Tests independientes (`test()` blocks sin estado compartido).
- Axe-core check inyectado por defecto (Slice 7) en cada test, incluso si el criterio funcional no lo exige.
- Sin `page.waitForTimeout()` — solo waits semánticos.

## 5. Lo que el FD **NO** cubre

- Estilos visuales pixel-perfect (fuera de scope MVP).
- Tests de performance bajo carga (SauceDemo no es un entorno real).
- Tests cross-browser (MVP es Chromium-only).
- API directa contra backend (SauceDemo no expone API formal).
- Internacionalización (la app es solo inglés).
