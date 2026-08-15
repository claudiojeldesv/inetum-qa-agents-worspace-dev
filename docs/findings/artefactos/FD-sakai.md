# Diseño Funcional — Mantenimiento de catálogo de productos

Aplicación: back-office de catálogo. URL de pruebas: https://sakai.primeng.org

Este documento describe tres funcionalidades del módulo de catálogo. Es la entrada
del QA: prosa funcional, sin referencias al HTML ni a identificadores técnicos.

## F1. Consulta y filtrado del catálogo

El usuario accede a la pantalla **Manage Products**, que muestra el catálogo paginado
con las columnas Code, Name, Image, Price, Category, Reviews y Status.

La pantalla dispone de un buscador. Al escribir un término, la tabla se reduce a los
productos cuyo nombre lo contiene, y el pie de la tabla indica cuántos registros se
están mostrando.

**Criterio de aceptación**: buscando "Blue" el catálogo debe quedar reducido a dos
productos y el pie debe indicar que se muestran 2 de 2.

## F2. Alta de producto

Desde la pantalla de catálogo, la acción **New** abre la ventana **Product Details**,
donde se informan: Name, Description, Inventory Status, Category, Price y Quantity.

Al guardar, el producto queda incorporado al catálogo y es localizable por el buscador.

**Criterio de aceptación**: dando de alta un producto llamado "Poliza Hogar Basica"
con precio 250, estado INSTOCK y categoría Electronics, al buscarlo por su nombre
debe aparecer en la tabla.

## F3. Formulario de datos

La pantalla **Form Layout** presenta varios bloques de captura de datos. El bloque de
texto de ayuda contiene el campo Username, con una indicación bajo el campo.

**Criterio de aceptación**: el campo Username admite texto y conserva el valor introducido.

## Fuera de alcance

Dashboard, resto de pantallas de componentes, exportación y borrado.
