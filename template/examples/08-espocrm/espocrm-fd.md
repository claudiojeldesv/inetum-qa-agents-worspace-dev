# Diseño Funcional — CRM comercial · Regresión funcional

Documento de definición de pruebas. Registro corporativo: pasos simples, un verbo por línea, la
comprobación escrita como la espera el negocio.

Aplicación bajo prueba: **CRM comercial** (EspoCRM) con los módulos de Cuentas, Contactos,
Posibles clientes y Oportunidades. Diez casos de regresión sobre los flujos que usa a diario un
gestor comercial: entrar, consultar la cartera, buscar un cliente, abrir su ficha, revisar sus
relaciones, dar de alta una cuenta nueva, comprobar que aparece y darla de baja.

La sesión se abre **en español**: el idioma se elige en la propia pantalla de acceso y manda
sobre toda la aplicación.

Datos de prueba: cuenta sintética **QA Inetum Prueba** (sitio web `www.qa-inetum-prueba.es`,
correo `contacto@qa-inetum-prueba.es`, ciudad `Madrid`, país `España`). El caso que la crea es
el mismo que la borra al final de la regresión.

---

## CP001 — Acceso al CRM

**Objetivo**: verificar que el gestor accede al CRM en español y ve los módulos de su trabajo.

**Precondiciones**: ninguna.

### Pasos

1. Acceder al CRM.
2. Seleccionar el usuario **Administrator**.
3. Seleccionar el idioma **Spanish (Spain)**.
4. Pulsar el botón **Login**.
5. Comprobar que se muestra el módulo **Cuentas** en el menú.
6. Comprobar que se muestra el módulo **Contactos** en el menú.
7. Comprobar que se muestra el módulo **Posibles clientes** en el menú.
8. Comprobar que se muestra el módulo **Oportunidades** en el menú.

### Resultado esperado

El gestor entra al CRM y el menú principal ofrece los módulos comerciales en español.

---

## CP002 — Consulta de la cartera de cuentas

**Objetivo**: verificar que el listado de cuentas muestra la cartera con sus datos de
clasificación.

**Precondiciones**: sesión iniciada (CP001).

### Pasos

1. Acceder al CRM con la sesión iniciada.
2. Pulsar el módulo **Cuentas** del menú.
3. Comprobar que se muestra la cuenta **AFP Supply** en el listado.
4. Comprobar que se muestra la cuenta **Janeville** en el listado.
5. Comprobar que se muestra el sector **Venta al por mayor**.
6. Comprobar que se muestra el tipo **Cliente**.

### Resultado esperado

El listado presenta la cartera de cuentas con su sector y su tipo, y permite abrir cualquiera
de ellas.

---

## CP003 — Búsqueda de una cuenta por nombre

**Objetivo**: verificar que el buscador del listado filtra la cartera por el nombre de la
cuenta.

**Precondiciones**: sesión iniciada. La cuenta `AFP Supply` existe en la cartera.

### Pasos

1. Acceder al CRM con la sesión iniciada.
2. Pulsar el módulo **Cuentas** del menú.
3. Introducir el texto de búsqueda `AFP`.
4. Pulsar la tecla Intro para buscar.
5. Comprobar que se muestra la cuenta **AFP Supply** en el resultado.
6. Comprobar que no se muestra la cuenta **Janeville** en el resultado.

### Resultado esperado

El listado queda filtrado a las cuentas cuyo nombre coincide con el texto buscado.

---

## CP004 — Ficha de la cuenta

**Objetivo**: verificar que la ficha de una cuenta muestra sus datos de contacto, su dirección
y su clasificación comercial.

**Precondiciones**: sesión iniciada. La cuenta `AFP Supply` existe en la cartera.

### Pasos

1. Acceder al CRM con la sesión iniciada.
2. Pulsar el módulo **Cuentas** del menú.
3. Pulsar sobre la cuenta **AFP Supply**.
4. Comprobar que se muestra el correo **contact@afp-supply.de**.
5. Comprobar que se muestra el teléfono **+49125648741**.
6. Comprobar que se muestra la dirección **Teltower Damm 301**.
7. Comprobar que se muestra el país **Germany**.
8. Comprobar que se muestra el sector **Venta al por mayor**.

### Resultado esperado

La ficha muestra los datos de contacto, la dirección de facturación y la clasificación
comercial de la cuenta.

---

## CP005 — Relaciones de la cuenta

**Objetivo**: verificar que la ficha de la cuenta muestra los contactos y las oportunidades
asociados.

**Precondiciones**: sesión iniciada. La cuenta `AFP Supply` tiene contactos y oportunidades
asociados.

### Pasos

1. Acceder al CRM con la sesión iniciada.
2. Pulsar el módulo **Cuentas** del menú.
3. Pulsar sobre la cuenta **AFP Supply**.
4. Comprobar que se muestra el apartado **Contactos**.
5. Comprobar que se muestra el apartado **Oportunidades**.
6. Comprobar que se muestra el contacto **Frederick Devine**.
7. Comprobar que se muestra la oportunidad **Laptops for employees**.
8. Comprobar que la oportunidad está en la etapa **Cerrado ganado**.

### Resultado esperado

La ficha reúne, junto a los datos de la cuenta, las personas de contacto y las oportunidades
comerciales asociadas a ella.

---

## CP006 — Validación del alta de cuenta

**Objetivo**: verificar que el alta de una cuenta exige el nombre e informa al gestor cuando
falta.

**Precondiciones**: sesión iniciada.

### Pasos

1. Acceder al CRM con la sesión iniciada.
2. Pulsar el módulo **Cuentas** del menú.
3. Pulsar el botón **Crear cuenta**.
4. Pulsar el botón **Guardar** sin rellenar ningún campo.
5. Comprobar que se muestra el aviso **No válido**.
6. Comprobar que se muestra el mensaje **Nombre es requerido**.

### Resultado esperado

La cuenta no se da de alta. El sistema señala el campo obligatorio que falta y el gestor
permanece en el formulario sin perder lo introducido.

---

## CP007 — Alta de una cuenta

**Objetivo**: verificar que el gestor puede dar de alta una cuenta nueva con sus datos básicos.

**Precondiciones**: sesión iniciada. No existe ninguna cuenta llamada `QA Inetum Prueba`.

### Pasos

1. Acceder al CRM con la sesión iniciada.
2. Pulsar el módulo **Cuentas** del menú.
3. Pulsar el botón **Crear cuenta**.
4. Introducir el nombre `QA Inetum Prueba`.
5. Introducir el sitio web `www.qa-inetum-prueba.es`.
6. Introducir la ciudad de facturación `Madrid`.
7. Introducir el país de facturación `España`.
8. Introducir la descripción `Alta de prueba QA. Ignorar.`
9. Pulsar el botón **Guardar**.
10. Comprobar que se muestra la ficha de la cuenta **QA Inetum Prueba**.
11. Comprobar que se muestra la ciudad **Madrid**.

### Resultado esperado

La cuenta queda dada de alta con sus datos y el sistema abre su ficha.

---

## CP008 — La cuenta dada de alta aparece en la cartera

**Objetivo**: verificar que una cuenta recién creada es localizable desde el buscador del
listado.

**Precondiciones**: la cuenta `QA Inetum Prueba` se ha dado de alta (CP007).

### Pasos

1. Acceder al CRM con la sesión iniciada.
2. Pulsar el módulo **Cuentas** del menú.
3. Introducir el texto de búsqueda `QA Inetum`.
4. Pulsar la tecla Intro para buscar.
5. Comprobar que se muestra la cuenta **QA Inetum Prueba** en el resultado.

### Resultado esperado

La cuenta creada forma parte de la cartera y se localiza por su nombre.

---

## CP009 — Baja de la cuenta

**Objetivo**: verificar que el gestor puede dar de baja una cuenta y que deja de aparecer en la
cartera.

**Precondiciones**: la cuenta `QA Inetum Prueba` existe (CP007).

### Pasos

1. Acceder al CRM con la sesión iniciada.
2. Pulsar el módulo **Cuentas** del menú.
3. Introducir el texto de búsqueda `QA Inetum`.
4. Pulsar la tecla Intro para buscar.
5. Pulsar sobre la cuenta **QA Inetum Prueba**.
6. Abrir el menú de acciones de la ficha.
7. Pulsar la acción **Eliminar**.
8. Confirmar la eliminación.
9. Comprobar que se muestra el listado de **Cuentas**.

### Resultado esperado

La cuenta queda dada de baja, el sistema pide confirmación antes de borrarla y al terminar
devuelve al gestor al listado de la cartera.

---

## CP010 — El listado se muestra en el idioma de la sesión

**Objetivo**: verificar que, con la sesión abierta en español, el listado de cuentas rotula sus
columnas en español.

**Precondiciones**: sesión iniciada en español (CP001).

### Pasos

1. Acceder al CRM con la sesión iniciada.
2. Pulsar el módulo **Cuentas** del menú.
3. Comprobar que se muestra la columna **Nombre**.
4. Comprobar que se muestra la columna **Industria**.
5. Comprobar que se muestra la columna **Tipo**.
6. Comprobar que se muestra la columna **País**.

### Resultado esperado

Todas las columnas del listado se rotulan en el idioma elegido en el acceso, igual que el resto
de la aplicación.

---

## Nota para quien ejecute la prueba

Este documento se diseñó **desde la interfaz** (textos, botones, listados y avisos observados el
2026-08-31), no desde una especificación previa. Hay cuatro tensiones conocidas que el ejecutor
va a encontrar, y las cuatro son deliberadas:

- **CP010**: el comportamiento que el documento exige es el que el negocio espera de una
  aplicación traducida, no necesariamente el que la aplicación tiene. Si las columnas siguen
  rotuladas en otro idioma, no es un problema de localización del elemento: hay que decidir
  quién tiene razón y dejar constancia. Un cliente regulado de habla hispana no acepta una
  pantalla a medio traducir, y ésta lo está: conviven rótulos en español con otros sin traducir.
- **El idioma se elige en la puerta y manda sobre todo lo demás**: la pantalla de acceso
  propone el idioma del navegador de cada máquina. Por eso el CP001 lo fija explícitamente. Un
  caso que no lo fije pasará en una máquina y fallará en otra, y el motivo no será el producto.
- **Los datos son compartidos**: el entorno lo usan varias personas a la vez. Los recuentos de
  registros no son comprobación válida y las cuentas de ejemplo pueden cambiar. Por eso CP007
  **crea** lo que CP008 consulta y CP009 lo **borra**: la regresión se deja el entorno como se
  lo encontró. Si un pase anterior no llegó a CP009, puede haber una cuenta duplicada.
- **Los campos del formulario no tienen etiqueta asociada**: la aplicación pinta el rótulo al
  lado del campo, sin vincularlo. Para una persona es evidente; para una automatización, no. Es
  un hallazgo de accesibilidad que merece reportarse por sí mismo.
