# Documento Funcional — Tarificador Seguro de Hogar Mapfre

**Proyecto**: Mapfre — cálculo de precio de Seguro de Hogar (flujo `fq`)
**Versión**: 1.0
**Entorno de pruebas**: https://precio.mapfre.es/calcular-seguro-hogar/es/direccion?origen=SEO&PPPO=MINTER&flujo=fq

> FD para el módulo S3 (Spec-refiner). Redactado en prosa libre. Describe un asistente
> lineal de tarificación: cada pantalla recoge un dato y avanza a la siguiente. El
> criterio de éxito del flujo es navegacional — que cada pantalla acepte la entrada y
> avance, terminando cuando la pantalla de fecha de nacimiento acepta la fecha. NO hay
> assert de precio/prima: la prueba termina en fecha de nacimiento.
>
> Los datos concretos de entrada (código postal, dirección, opciones) se incluyen como
> datos de ejemplo del flujo. El DNI NO se reproduce aquí (PII boundary): se solicita un
> DNI válido; el valor concreto vive en `synthetic_fixtures` del style-contract.

## 1. Introducción y alcance

El tarificador de Seguro de Hogar permite a un usuario obtener una cotización
introduciendo, paso a paso, los datos de la vivienda a asegurar y los datos del
solicitante. Este documento describe el flujo de tarificación (`flujo=fq`) desde la
pantalla de dirección hasta la captura de la fecha de nacimiento. Quedan fuera de alcance
las pantallas posteriores a la fecha de nacimiento (coberturas, precio, contratación) y
los flujos de origen distintos de `SEO`/`MINTER`.

El asistente es un flujo lineal: cada pantalla valida su entrada y, al pulsar "Aceptar"
(o seleccionar una opción), avanza a la siguiente. El comportamiento esperado de cada
pantalla es que acepta la entrada indicada y presenta la pantalla siguiente.

## 2. Código postal de la vivienda

La primera pantalla solicita el código postal de la vivienda a asegurar. El usuario debe
poder introducir un código postal y pulsar "Aceptar". Tras aceptar un código postal
válido, el sistema debe avanzar a la pantalla de dirección.

Dato de ejemplo: código postal `03201`.

## 3. Dirección — calle y número

Tras el código postal, el sistema solicita la calle. El campo de calle ofrece
autocompletado: al escribir parte del nombre, el sistema sugiere calles coincidentes y el
usuario debe poder seleccionar la sugerencia. El usuario introduce además el número de
portal. Al pulsar "Aceptar", el sistema debe avanzar a la pantalla de selección de
dirección.

Datos de ejemplo: escribir `REINA`, seleccionar la sugerencia de autocompletado
`REINA VICTORIA`, número `24`.

## 4. Selección de la dirección resuelta

El sistema presenta una lista de direcciones resueltas a partir del código postal, la
calle y el número introducidos. El usuario debe poder seleccionar la dirección correcta de
la lista. Tras la selección, el sistema debe avanzar a la pantalla de datos de la vivienda.

Dato de ejemplo: seleccionar la opción que contiene el texto `ARENAL 24`.

> **Nota para sign-off (posible inconsistencia del script de origen)**: en la pantalla 3
> se introduce la calle `REINA VICTORIA 24`, pero la opción a seleccionar aquí contiene
> `ARENAL 24` — calles distintas. Se reproduce literal lo indicado en el script. Confirmar
> si es el nombre oficial que devuelve la resolución de dirección o un error del script.

## 5. Datos de la vivienda — Dirección (piso)

La pantalla con título "Dirección" solicita el piso de la vivienda mediante un desplegable.
El usuario debe poder seleccionar el piso y pulsar "Aceptar", tras lo cual el sistema avanza
a la pantalla de ocupación de la vivienda.

Dato de ejemplo: en el desplegable "Piso", seleccionar `01`.

## 6. Ocupación de la vivienda

La pantalla con título "Ocupación de la vivienda" presenta los datos de ocupación con un
valor por defecto. El usuario debe poder confirmar pulsando "Aceptar", tras lo cual el
sistema avanza a la pantalla de sistemas electrónicos de seguridad.

## 7. Sistemas electrónicos de seguridad

La pantalla con título que comienza por "Sistemas electrónicos" presenta varias opciones de
sistema de seguridad. El usuario debe poder seleccionar una opción. Tras la selección, el
sistema avanza a la pantalla de protección domótica.

Dato de ejemplo: seleccionar la primera opción, con texto
`Con contrato de mantenimiento y con vigilancia permanente`.

## 8. Sistema de protección domótica

La pantalla con título "¿Dispones de sistema de protección domótica?" ofrece una elección
(Sí / No). El usuario debe poder elegir una opción, tras lo cual el sistema avanza a la
pantalla de sistemas no electrónicos de seguridad.

Dato de ejemplo: elegir `No`.

## 9. Sistemas NO electrónicos de seguridad

La pantalla con título "Sistemas NO electrónicos de seguridad" presenta los datos con un
valor por defecto. El usuario debe poder confirmar pulsando "Aceptar", tras lo cual el
sistema avanza a la pantalla de documento de identidad.

## 10. Documento de identidad

La pantalla con título "Documento de identidad" solicita el DNI del solicitante. El usuario
debe poder introducir un DNI válido y avanzar a la pantalla de fecha de nacimiento.

El valor concreto del DNI NO se incluye en este documento (PII boundary): es un DNI de
prueba sintético declarado en `synthetic_fixtures` del style-contract.

## 11. Fecha de nacimiento

La pantalla con título "Fecha de nacimiento" solicita la fecha de nacimiento del
solicitante. El usuario debe poder introducir una fecha válida. **El criterio de éxito del
flujo es que esta pantalla acepta la fecha introducida**; la prueba termina aquí.

Dato de ejemplo: fecha de nacimiento `01/02/1990`.
