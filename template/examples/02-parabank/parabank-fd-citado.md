# Documento Funcional — Portal de Banca Online ParaBank (edición con captions citados)

**Proyecto**: ParaBank — banca demo Parasoft
**Versión**: 1.0-citado
**Entorno de pruebas**: https://parabank.parasoft.com/parabank/index.htm

> **Qué es esto y en qué se diferencia de `parabank-fd.md`.** Variante del mismo FD con **una
> sola variable cambiada**: donde el documento nombra un elemento de pantalla, ahora **cita su
> caption literal entre comillas**. Todo lo demás es idéntico —misma prosa, misma ambigüedad
> deliberada sobre el saldo insuficiente, mismo flujo de pago de recibos— para que los runs de
> las dos ediciones sean comparables.
>
> **Por qué existe.** El FD original no cita **ni un literal** en sus 46 líneas, así que todos
> los hints que el refiner puede emitir son descripciones en castellano contra una aplicación
> en inglés, y fallan por construcción. Eso es un defecto conocido y medido dos veces (D14 en
> `docs/findings/run-beta-parabank-2.md`); volver a tropezar con él no aporta información y
> cuesta una hora de run. Esta edición lo **aparca de forma declarada** para poder medir el
> resto de la cadena. No lo arregla.
>
> **De dónde sale cada caption citado**, porque un fixture cocinado no vale nada:
> `Username` y `Password` se midieron contra el DOM real en los dos runs de campo (el segundo
> los resolvió por `anchored`); `Accounts Overview`, `Transfer Complete!`, `Bill Pay`,
> `Bill Payment Complete` y `Log Out` se midieron con MCP en el run del 2026-08-18.
>
> **Qué se deja SIN citar a propósito**: las etiquetas de los campos de la pantalla de
> transferencia y los del beneficiario. Dos razones. Una, no se midieron verbatim y
> **inventarlas sería hacer exactamente lo que se le reprocha al refiner**. Dos, hace falta que
> algún paso se plante en un sitio elegido por nosotros: un run que resuelve todo a la primera
> no prueba la memoria de alias, y lo que hay que medir es que el panel abre, el QA señala, y el
> run siguiente resuelve por `alias-hit` sin preguntar.

## 1. Introducción y alcance

ParaBank es el portal de banca online para clientes particulares. Este documento describe
las funcionalidades del área de cliente autenticado. Quedan fuera de alcance las funciones
de administración interna y la apertura de nuevas cuentas.

## 2. Acceso al portal

El portal es de acceso restringido. Un cliente registrado debe poder iniciar sesión
introduciendo su nombre de usuario en el campo "Username" y su contraseña en el campo
"Password". Tras una autenticación correcta, el sistema debe mostrar el resumen de cuentas del
cliente bajo el título "Accounts Overview", con el saldo de cada una de sus cuentas. El acceso
a cualquier pantalla del área de cliente sin haber iniciado sesión no debe estar permitido: el
sistema debe impedir la visualización de datos de cuentas a un usuario no autenticado.

## 3. Transferencia de fondos entre cuentas propias

Un cliente autenticado debe poder transferir un importe entre dos de sus propias cuentas.
La pantalla de transferencia debe permitir seleccionar la cuenta de origen, la cuenta de
destino e introducir el importe a transferir. El sistema debe validar que la cuenta de
origen dispone de saldo suficiente antes de ejecutar la operación. Una vez completada la
transferencia, el sistema debe confirmar al cliente que la operación se ha realizado mostrando
"Transfer Complete!", indicando el importe transferido.

## 4. Pago de recibos domiciliados

El cliente debe poder dar de alta el pago de un recibo a un beneficiario desde la pantalla a la
que da acceso el enlace "Bill Pay". La pantalla de pago de recibos debe solicitar los datos del
beneficiario (nombre, dirección, cuenta) y el importe del recibo, y permitir confirmar el pago
con cargo a una de las cuentas del cliente. Una vez confirmado, el sistema debe mostrar
"Bill Payment Complete".

## 5. Cierre de sesión

El cliente debe poder cerrar su sesión en cualquier momento mediante el enlace "Log Out". Tras
el cierre de sesión, el sistema debe devolver al cliente a la pantalla de acceso.
