# MAPFRE Seguro Hogar — Wizard de Tarificación (DOM Mapping)

## Application Overview

Wizard lineal de tarificación de seguro de hogar de MAPFRE. URL de entrada: https://precio.mapfre.es/calcular-seguro-hogar/es/direccion?origen=SEO&PPPO=MINTER&flujo=fq. El flujo es estrictamente secuencial: cada pantalla bloquea la siguiente hasta que el campo requerido tiene valor válido. El wizard está implementado como SPA con navegación por history.pushState; navegar directamente a una URL intermedia sin sesión previa devuelve la pantalla de entrada. Hay un diálogo de cookies al primer acceso que debe aceptarse antes de interactuar. DISCREPANCIAS respecto al diseño de flujos original: (1) Flow 3 'select-resolved-address' con texto 'ARENAL 24' NO APARECE con los datos especificados — la API devuelve next:'piso-o-unifamiliar' directamente tras CALLE REINA VICTORIA 24 en CP 03201, sin pantalla de desambiguación. (2) Flow 4 describe un desplegable 'Piso' con valor '01', pero el DOM real muestra radio-buttons en la pantalla 'Detalle de vivienda'. (3) Entre los flows 2 y 5 existen pantallas intermedias no listadas en el diseño original: Tipo de vivienda, Detalle de vivienda, Metros construidos, Datos de la vivienda (habitaciones/baños), Año de construcción, Código Postal (confirmación), Continente y Contenido.

## Test Scenarios

### 1. Wizard de tarificación hogar — flujo completo con datos reales

**Seed:** ``

#### 1.1. Flow 1 — enter-postal-code: pantalla código postal

**File:** `tests/e2e/mapfre-hogar/flow-01-postal-code.spec.ts`

**Steps:**
  1. Navegar a https://precio.mapfre.es/calcular-seguro-hogar/es/direccion?origen=SEO&PPPO=MINTER&flujo=fq
    - expect: La página carga con título 'Calcula tu Seguro de Hogar'
    - expect: Aparece un dialog de cookies con heading 'MAPFRE ESPAÑA S.A. Aviso de Cookies'
  2. Hacer click en el botón 'Aceptar' del dialog de cookies (role=button, name='Aceptar', dentro del dialog ref=e112)
    - expect: El dialog desaparece
    - expect: Queda visible el campo textbox con label 'Código Postal' (role=textbox, name='Código Postal')
  3. Hacer click en el textbox 'Código Postal' y escribir '03201'
    - expect: El campo muestra el valor '03201'
    - expect: Aparece un paragraph con texto 'ELX-ELCHE, ALICANTE-ALACANT' bajo el campo (validación en tiempo real)
    - expect: El botón ACEPTAR pasa de disabled a clickable
  4. Hacer click en el botón 'ACEPTAR' (role=button, name='ACEPTAR')
    - expect: La URL cambia a /calcular-seguro-hogar/es/direccion-completa
    - expect: Aparece la pantalla 'Dirección' con heading level=2 'Dirección'

#### 1.2. Flow 2 — enter-street-autocomplete: pantalla calle y número

**File:** `tests/e2e/mapfre-hogar/flow-02-street.spec.ts`

**Steps:**
  1. Verificar que la pantalla muestra heading 'Dirección' (h2) con URL /direccion-completa
    - expect: Visible el textbox 'Localidad' (disabled) con valor 'ELX-ELCHE'
    - expect: Visible el textbox 'Nombre de la vía' (role=textbox, name='Nombre de la vía') vacío y habilitado
    - expect: Visible el textbox 'Número' (role=textbox, name='Número') inicialmente disabled
    - expect: El botón ACEPTAR está disabled
  2. Hacer click en el textbox 'Nombre de la vía' y escribir 'REINA' carácter a carácter (pressSequentially)
    - expect: El campo muestra 'REINA'
    - expect: Aparece un listbox (role=listbox) con un único listitem: 'CALLE REINA VICTORIA'
  3. Hacer click en el listitem 'CALLE REINA VICTORIA' dentro del listbox
    - expect: El campo 'Nombre de la vía' se rellena con el valor 'CALLE REINA VICTORIA'
    - expect: El listbox desaparece
    - expect: El textbox 'Número' pasa a estar habilitado
  4. Hacer click en el textbox 'Número' y escribir '24'
    - expect: El campo 'Número' muestra el valor '24'
    - expect: El botón ACEPTAR pasa de disabled a clickable
  5. Hacer click en el botón 'ACEPTAR'
    - expect: La URL cambia a /calcular-seguro-hogar/es/piso-o-unifamiliar
    - expect: NOTA: Flow 3 (select-resolved-address) NO APARECE — con CALLE REINA VICTORIA 24 en CP 03201, la API devuelve next='piso-o-unifamiliar' directamente sin pantalla de desambiguación de direcciones

#### 1.3. Flow 3 — select-resolved-address: NO MAPEADO con los datos especificados

**File:** `tests/e2e/mapfre-hogar/flow-03-address-disambiguation.spec.ts`

**Steps:**
  1. PANTALLA NO MAPEADA. Con los datos CALLE REINA VICTORIA 24 + CP 03201, el API backend devuelve directamente next='piso-o-unifamiliar' sin mostrar pantalla de desambiguación de direcciones. El elemento con texto 'ARENAL 24' no aparece en el DOM. La pantalla de 'Tipo de vivienda' aparece en su lugar.
    - expect: NO MAPEADO — la pantalla de selección de dirección resuelta con texto 'ARENAL 24' no existe en el DOM con los datos de prueba especificados

#### 1.4. Pantalla intermedia — Tipo de vivienda (no listada en el diseño original)

**File:** `tests/e2e/mapfre-hogar/flow-extra-01-tipo-vivienda.spec.ts`

**Steps:**
  1. Verificar pantalla con heading 'Tipo de vivienda' (h2), URL /piso-o-unifamiliar
    - expect: Visible un group con una list de dos botones-radio: 'Piso o apartamento Piso o apartamento' y 'Vivienda Unifamiliar Vivienda Unifamiliar'
    - expect: Ninguna opción está pre-seleccionada
    - expect: No hay botón ACEPTAR — la selección avanza automáticamente
  2. Hacer click en el botón 'Piso o apartamento Piso o apartamento' (role=button, name='Piso o apartamento Piso o apartamento')
    - expect: La URL cambia a /calcular-seguro-hogar/es/tipo-vivienda
    - expect: Aparece la pantalla 'Detalle de vivienda'

#### 1.5. Flow 4 — select-floor: pantalla Detalle de vivienda (desplegable descrito en diseño ≠ DOM real)

**File:** `tests/e2e/mapfre-hogar/flow-04-floor.spec.ts`

**Steps:**
  1. Verificar pantalla con heading 'Detalle de vivienda' (h2), URL /tipo-vivienda. DISCREPANCIA: el diseño describe un desplegable 'Piso' con valor '01'; el DOM real muestra radio-buttons, no un select/combobox.
    - expect: Visible un group con una list de cuatro listitem, cada uno con un radio y un button:
    - expect:   - 'PISO O APARTAMENTO EN PLANTA BAJA' (role=button, dentro de listitem con radio)
    - expect:   - 'PISO O APARTAMENTO EN PLANTA PRIMERA' (equivale al piso 01 del diseño)
    - expect:   - 'PISO O APARTAMENTO EN PLANTA INTERMEDIA'
    - expect:   - 'PISO O APARTAMENTO EN ÁTICO'
    - expect: No hay botón ACEPTAR — la selección avanza automáticamente
  2. Hacer click en el botón ' PISO O APARTAMENTO EN PLANTA PRIMERA' (name=' PISO O APARTAMENTO EN PLANTA PRIMERA') para seleccionar el equivalente a piso 01
    - expect: La URL cambia a /calcular-seguro-hogar/es/metros-construidos
    - expect: Aparece la pantalla 'Metros construidos (m2)'

#### 1.6. Pantalla intermedia — Metros construidos (no listada en el diseño original)

**File:** `tests/e2e/mapfre-hogar/flow-extra-02-metros.spec.ts`

**Steps:**
  1. Verificar pantalla con heading 'Metros construidos (m2)' (h2), URL /metros-construidos
    - expect: Visible un textbox con id 'metrosConstruidos' (locator: #metrosConstruidos)
    - expect: Visible un botón sin label visible (decorativo, selector: button antes del textbox)
    - expect: ACEPTAR está disabled hasta que se introduce un valor
  2. Hacer click en el textbox #metrosConstruidos y escribir '80'
    - expect: El campo muestra '80'
    - expect: El botón ACEPTAR pasa a estar enabled
  3. Hacer click en el botón 'ACEPTAR'
    - expect: La URL cambia a /calcular-seguro-hogar/es/numero-habitaciones-banios

#### 1.7. Pantalla intermedia — Datos de la vivienda: habitaciones y baños (no listada)

**File:** `tests/e2e/mapfre-hogar/flow-extra-03-rooms.spec.ts`

**Steps:**
  1. Verificar pantalla con heading 'Datos de la vivienda' (h2), URL /numero-habitaciones-banios
    - expect: Visible textbox 'Número habitaciones, salones' (role=textbox, name='Número habitaciones, salones')
    - expect: Visible textbox 'Número baños' (role=textbox, name='Número baños')
    - expect: ACEPTAR disabled hasta que ambos campos tienen valor
  2. Escribir '3' en textbox 'Número habitaciones, salones' y '1' en textbox 'Número baños'
    - expect: Ambos campos muestran sus valores
    - expect: ACEPTAR habilitado
  3. Hacer click en ACEPTAR
    - expect: La URL cambia a /calcular-seguro-hogar/es/anio-construccion

#### 1.8. Pantalla intermedia — Año de construcción (no listada)

**File:** `tests/e2e/mapfre-hogar/flow-extra-04-year.spec.ts`

**Steps:**
  1. Verificar pantalla con heading 'Año de construcción' (h2), URL /anio-construccion
    - expect: Visible un textbox con id 'anioConstruccion' (locator: #anioConstruccion)
    - expect: ACEPTAR disabled
  2. Escribir '1990' en el textbox #anioConstruccion
    - expect: Campo muestra '1990'
    - expect: ACEPTAR habilitado
  3. Hacer click en ACEPTAR
    - expect: La URL cambia a /calcular-seguro-hogar/es/codigo-postal

#### 1.9. Pantalla intermedia — Confirmación Código Postal (no listada)

**File:** `tests/e2e/mapfre-hogar/flow-extra-05-cp-confirm.spec.ts`

**Steps:**
  1. Verificar pantalla con heading 'Código Postal' (h2), URL /codigo-postal
    - expect: Visible un textbox con valor pre-rellenado '03201'
    - expect: Visible paragraph con texto 'ELX-ELCHE, ALICANTE-ALACANT'
    - expect: ACEPTAR ya está habilitado
  2. Hacer click en ACEPTAR sin modificar nada
    - expect: La URL cambia a /calcular-seguro-hogar/es/uso

#### 1.10. Flow 5 — confirm-occupancy: pantalla Ocupación de la vivienda

**File:** `tests/e2e/mapfre-hogar/flow-05-occupancy.spec.ts`

**Steps:**
  1. Verificar pantalla con heading 'Ocupación de la vivienda' (h2), URL /uso
    - expect: Grupo 'Uso' con radio HABITUAL (pre-checked) y TEMPORADA
    - expect: Combobox 'Régimen vivienda' con opción seleccionada 'Soy propietario y utilizo la vivienda' y otras opciones: 'Soy propietario y alquilo la vivienda', 'Soy inquilino'
    - expect: Grupo 'Calidad construcción' con radio MEDIA (pre-checked) y ALTA
    - expect: Botón ACEPTAR habilitado sin necesidad de cambiar nada
  2. Hacer click en ACEPTAR sin modificar ningún valor
    - expect: La URL cambia a /calcular-seguro-hogar/es/sistemas-electronicos
    - expect: Aparece pantalla de sistemas electrónicos de seguridad

#### 1.11. Flow 6 — select-electronic-security: pantalla Sistemas electrónicos

**File:** `tests/e2e/mapfre-hogar/flow-06-electronic-security.spec.ts`

**Steps:**
  1. Verificar pantalla con heading 'Sistemas electrónicos de seguridad conectados a central de alarmas' (h2), URL /sistemas-electronicos
    - expect: Visible un group con una list de tres listitem, cada uno con radio y button:
    - expect:   - 'CON CONTRATO DE MANTENIMIENTO Y CON VIGILANCIA PERMANENTE' (primera opción)
    - expect:   - 'CON CONTRATO DE MANTENIMIENTO Y SIN VIGILANCIA PERMANENTE'
    - expect:   - 'NO DISPONGO DE NINGÚN SERVICIO DE ESTE TIPO'
    - expect: Ninguna opción pre-seleccionada
    - expect: No hay botón ACEPTAR — selección avanza automáticamente
  2. Hacer click en el botón ' CON CONTRATO DE MANTENIMIENTO Y CON VIGILANCIA PERMANENTE' (name=' CON CONTRATO DE MANTENIMIENTO Y CON VIGILANCIA PERMANENTE')
    - expect: La URL cambia a /calcular-seguro-hogar/es/sistema-proteccion-domotica

#### 1.12. Flow 7 — select-domotics: pantalla sistema domótico

**File:** `tests/e2e/mapfre-hogar/flow-07-domotics.spec.ts`

**Steps:**
  1. Verificar pantalla con heading '¿Dispones de sistema de protección domótica?' (h2), URL /sistema-proteccion-domotica
    - expect: Visible grupo '¿Dispone de sistema de protección domótica?' con una list de dos listitem:
    - expect:   - radio/button ' SI' (name=' SI')
    - expect:   - radio/button ' NO' (name=' NO')
    - expect: No hay botón ACEPTAR — selección avanza automáticamente
  2. Hacer click en el botón ' NO'
    - expect: La URL cambia a /calcular-seguro-hogar/es/sistemas-no-electronicos

#### 1.13. Flow 8 — confirm-non-electronic-security: pantalla Sistemas NO electrónicos

**File:** `tests/e2e/mapfre-hogar/flow-08-non-electronic-security.spec.ts`

**Steps:**
  1. Verificar pantalla con heading 'Sistemas NO electrónicos de seguridad' (h2), URL /sistemas-no-electronicos
    - expect: Visible una list con tres listitem, cada uno con un checkbox:
    - expect:   - checkbox 'REJAS EN LAS VENTANAS ' (role=checkbox, name='REJAS EN LAS VENTANAS ', unchecked)
    - expect:   - checkbox 'CAJA FUERTE ' (role=checkbox, name='CAJA FUERTE ', unchecked) con un button de info
    - expect:   - checkbox 'NINGUNO ' (role=checkbox, name='NINGUNO ', checked por defecto)
    - expect: Botón ACEPTAR ya habilitado
  2. Hacer click en ACEPTAR sin modificar los checkboxes
    - expect: La URL cambia a /calcular-seguro-hogar/es/capital-continente-propietario

#### 1.14. Pantalla intermedia — Continente (no listada)

**File:** `tests/e2e/mapfre-hogar/flow-extra-06-continente.spec.ts`

**Steps:**
  1. Verificar pantalla con heading 'Continente' (h2), URL /capital-continente-propietario
    - expect: Visible grupo '¿Deseas asegurar continente?' con radio SI (pre-checked) y NO
    - expect: Visible textbox 'Capital de Continente (€)' con valor pre-rellenado '71055'
    - expect: Paragraph informativo: 'No se puede incluir un capital de continente inferior al recomendado: 71055 €'
    - expect: ACEPTAR habilitado
  2. Hacer click en ACEPTAR sin modificar nada
    - expect: La URL cambia a /calcular-seguro-hogar/es/capital-contenido

#### 1.15. Pantalla intermedia — Contenido (no listada)

**File:** `tests/e2e/mapfre-hogar/flow-extra-07-contenido.spec.ts`

**Steps:**
  1. Verificar pantalla con heading 'Contenido' (h2), URL /capital-contenido
    - expect: Visible grupo '¿Deseas asegurar contenido?' con radio SI (pre-checked) y NO
    - expect: Visible textbox 'Capital de Contenido (€)' con valor pre-rellenado '27090'
    - expect: Paragraph: 'Puedes modificar el capital recomendado'
    - expect: ACEPTAR habilitado
  2. Hacer click en ACEPTAR sin modificar nada
    - expect: La URL cambia a /calcular-seguro-hogar/es/documento-identidad

#### 1.16. Flow 9 — enter-dni: pantalla Documento de identidad

**File:** `tests/e2e/mapfre-hogar/flow-09-dni.spec.ts`

**Steps:**
  1. Verificar pantalla con heading 'Documento de identidad' (h2), URL /documento-identidad
    - expect: Visible texto informativo: 'Con tu DNI/NIE podemos darte un precio más personalizado.'
    - expect: Visible un grupo con radio/button 'NIF (Persona física)' (pre-checked) y 'NIE (Extranjeros)'
    - expect: Visible un textbox con placeholder '12345678A' (locator: getByPlaceholder('12345678A', {exact: true}))
    - expect: ACEPTAR disabled
  2. Hacer click en el textbox de DNI y escribir '71416690B'
    - expect: El campo muestra '71416690B'
    - expect: ACEPTAR pasa a estar habilitado
  3. Hacer click en ACEPTAR
    - expect: La URL cambia a /calcular-seguro-hogar/es/fecha-nacim
    - expect: Aparece la pantalla 'Fecha de nacimiento'

#### 1.17. Flow 10 — enter-birth-date: pantalla Fecha de nacimiento (FIN del mapping)

**File:** `tests/e2e/mapfre-hogar/flow-10-birth-date.spec.ts`

**Steps:**
  1. Verificar pantalla con heading 'Fecha de nacimiento' (h2), URL /fecha-nacim. ELEMENTO FRÁGIL: los tres campos están implementados como textboxes anidados DENTRO de un elemento button (ref=e726/e736/e737), no como inputs independientes en el DOM de nivel superior.
    - expect: Visible un group con un button contenedor que envuelve tres textboxes internos:
    - expect:   - textbox día: placeholder 'dd', inicialmente contiene '/' (locator: getByPlaceholder('dd', {exact: true}))
    - expect:   - textbox mes: placeholder 'mm', inicialmente contiene '/' (locator: getByPlaceholder('mm', {exact: true}))
    - expect:   - textbox año: placeholder 'aaaa', vacío (locator: getByPlaceholder('aaaa'))
    - expect: Hint text: 'Escríbelo todo seguido, p. ej: 13/07/1972'
    - expect: ACEPTAR disabled
  2. Hacer click en el textbox día (getByPlaceholder('dd', {exact: true})) y escribir '01' carácter a carácter (pressSequentially)
    - expect: El campo día muestra '01 /'
    - expect: El foco se mueve automáticamente al campo mes
  3. Hacer click en el textbox mes (getByPlaceholder('mm', {exact: true})) y escribir '02' carácter a carácter (pressSequentially)
    - expect: El campo mes muestra '02 /'
    - expect: El foco se mueve automáticamente al campo año
  4. Hacer click en el textbox año (getByPlaceholder('aaaa')) y escribir '1990' carácter a carácter (pressSequentially)
    - expect: El campo año muestra '1990'
    - expect: Los tres campos contienen sus valores: día='01 /', mes='02 /', año='1990'
    - expect: ACEPTAR pasa a estar habilitado
    - expect: TEST TERMINA AQUÍ — no hacer click en ACEPTAR
