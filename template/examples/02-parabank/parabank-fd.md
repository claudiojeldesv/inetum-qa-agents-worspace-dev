# Documento Funcional — Portal de Banca Online ParaBank

**Proyecto**: ParaBank — banca demo Parasoft
**Versión**: 1.0
**Entorno de pruebas**: https://parabank.parasoft.com/parabank/index.htm

> Fixture de validación del módulo S3 (Spec-refiner). FD redactado en prosa libre, sin
> identificadores RF-NNN explícitos — el refiner debe estructurarlo él. Incluye una
> ambigüedad deliberada (comportamiento ante saldo insuficiente) y un flujo que el
> entorno de staging no expone en el happy-path (pago de recibos) para validar la
> detección de drift aguas abajo.

## 1. Introducción y alcance

ParaBank es el portal de banca online para clientes particulares. Este documento describe
las funcionalidades del área de cliente autenticado. Quedan fuera de alcance las funciones
de administración interna y la apertura de nuevas cuentas.

## 2. Acceso al portal

El portal es de acceso restringido. Un cliente registrado debe poder iniciar sesión
introduciendo su nombre de usuario y su contraseña. Tras una autenticación correcta, el
sistema debe mostrar el resumen de cuentas del cliente, con el saldo de cada una de sus
cuentas. El acceso a cualquier pantalla del área de cliente sin haber iniciado sesión no
debe estar permitido: el sistema debe impedir la visualización de datos de cuentas a un
usuario no autenticado.

## 3. Transferencia de fondos entre cuentas propias

Un cliente autenticado debe poder transferir un importe entre dos de sus propias cuentas.
La pantalla de transferencia debe permitir seleccionar la cuenta de origen, la cuenta de
destino e introducir el importe a transferir. El sistema debe validar que la cuenta de
origen dispone de saldo suficiente antes de ejecutar la operación. Una vez completada la
transferencia, el sistema debe confirmar al cliente que la operación se ha realizado,
indicando el importe transferido.

## 4. Pago de recibos domiciliados

El cliente debe poder dar de alta el pago de un recibo a un beneficiario. La pantalla de
pago de recibos debe solicitar los datos del beneficiario (nombre, dirección, cuenta) y el
importe del recibo, y permitir confirmar el pago con cargo a una de las cuentas del cliente.

## 5. Cierre de sesión

El cliente debe poder cerrar su sesión en cualquier momento. Tras el cierre de sesión, el
sistema debe devolver al cliente a la pantalla de acceso.
