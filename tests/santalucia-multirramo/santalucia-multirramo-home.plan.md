# Santalucía Seguros Multirramo — Landing Home Happy-Path

## Application Overview

Landing comercial de Santalucía Seguros Multirramo (https://www.santalucia.es/es/segurosmultirramo). Sitio de producción real de una aseguradora española regulada. La página es una single-page landing sin navegación principal de sitio: presenta la identidad de marca, un formulario de captación de leads en el hero, una promoción activa (Días Azules / tarjeta regalo), tres bloques de producto (Hogar, Decesos, Vida), un carrusel de opiniones Google, una sección de propuesta de valor corporativa y un footer legal mínimo. Un banner de cookies OneTrust aparece en el primer acceso. La cabecera es fija (sticky) y contiene el logotipo, dos números de teléfono segmentados (atención al cliente / contratación) y un botón CTA «Te llamamos GRATIS» que aparece al hacer scroll. Contexto de prueba: landing de paid-search — los parámetros UTM de la URL de entrada son analítica, no criterio funcional. Scope de este plan: happy-path navegacional de la home — identidad, estructura, cabecera, productos y CTAs. No cubre: simuladores de tarificación, fichas de producto en profundidad, secciones legales del footer, blog corporativo, ni otras secciones del sitio.

## Test Scenarios

### 1. Santalucía Multirramo — Home Happy-Path

**Seed:** ``

#### 1.1. TC-01 Aterrizaje e identidad de la sección Seguros Multirramo

**File:** `tests/santalucia-multirramo/tc01-landing-identity.spec.ts`

**Steps:**
  1. Navegar a la URL canónica de la landing: https://www.santalucia.es/es/segurosmultirramo (sin parámetros UTM). Si aparece un banner de cookies (OneTrust u otro proveedor), hacer clic en el botón «Aceptar» para continuar sin mapear ese flujo como criterio.
    - expect: La página carga con HTTP 200 y sin error de navegación.
    - expect: El título del documento (document.title) es «Seguros Santalucía».
    - expect: La URL canónica (link[rel=canonical]) apunta a https://www.santalucia.es/es/segurosmultirramo.
    - expect: El banner de cookies desaparece tras aceptar.
  2. Verificar el encabezado H1 visible en el hero de la página.
    - expect: Existe exactamente un H1 en la página.
    - expect: El texto del H1 es «SANTALUCÍA SEGUROS» (mayúsculas, sin tilde).
  3. Verificar el subencabezado H2 inmediatamente bajo el H1 en el hero.
    - expect: Existe un H2 con el texto «La tranquilidad de tenerlo todo previsto».
  4. Verificar que el logotipo de marca Santalucía está presente en la cabecera (banner).
    - expect: La cabecera contiene una imagen con alt «Santalucía Seguros».
    - expect: La imagen del logotipo es visible en viewport (no oculta por CSS).
  5. Verificar que la imagen hero principal está presente en la sección inicial del main.
    - expect: Existe una imagen con alt descriptivo del contenido (escena de familia/hogar). El alt no está vacío ni es decorativo sin descripción.

#### 1.2. TC-02 Cabecera fija — elementos de contacto y CTA sticky

**File:** `tests/santalucia-multirramo/tc02-header-nav.spec.ts`

**Steps:**
  1. Navegar a https://www.santalucia.es/es/segurosmultirramo y aceptar el banner de cookies si aparece. Verificar el contenido de la cabecera (banner) en posición inicial (scroll = 0).
    - expect: La cabecera contiene el logotipo «Santalucía Seguros».
    - expect: Aparece la etiqueta «Atención al cliente» con el número de teléfono 900 24 20 20 como enlace href=tel:+34900242020.
    - expect: Aparece la etiqueta «Contrata tu seguro» con los números 868110394 y 900 10 32 92 como enlaces tel: funcionales.
    - expect: El botón «Te llamamos GRATIS» en la cabecera NO es visible en la posición inicial (scroll = 0) — solo aparece al hacer scroll.
  2. Hacer scroll hasta aproximadamente 800 px desde el top (superando el hero) y volver a inspeccionar la cabecera.
    - expect: La cabecera permanece visible y fija en la parte superior de la ventana (position: sticky o fixed).
    - expect: Aparece el botón «Te llamamos GRATIS» en la cabecera con rol button y cursor pointer.
    - expect: Los números de teléfono siguen siendo visibles en la cabecera.
  3. Hacer clic en el botón «Te llamamos GRATIS» de la cabecera (visible solo tras hacer scroll).
    - expect: Se abre un diálogo modal (role=dialog) superpuesto sobre la página.
    - expect: El modal contiene el encabezado «Te llamamos gratis» seguido de «Hazte con tu seguro».
    - expect: El modal incluye un selector (combobox) «Elige tu seguro» con las opciones: Hogar, Decesos, Vida, Salud.
    - expect: El modal incluye un campo de texto «Teléfono» (obligatorio), una casilla obligatoria de aceptación de protección de datos, y el botón «Te llamamos».
    - expect: El modal incluye una sección alternativa «O también puedes llamarnos tú» con los mismos números de teléfono de la cabecera.
    - expect: El modal muestra el horario comercial: «Lunes a viernes de 9:00 a 21:00».
  4. Hacer clic en el botón «Cerrar ventana de diálogo» (aria-label) dentro del modal.
    - expect: El modal se cierra.
    - expect: El foco vuelve al área principal de la página.
    - expect: La URL no cambia (permanece en la landing).

#### 1.3. TC-03 Secciones de producto visibles en home (Hogar, Decesos, Vida)

**File:** `tests/santalucia-multirramo/tc03-product-sections.spec.ts`

**Steps:**
  1. Navegar a https://www.santalucia.es/es/segurosmultirramo y aceptar cookies. Desplazarse hasta la sección «¿Y si hoy protegieras lo que más quieres?» (segunda sección principal bajo el hero).
    - expect: Existe un H2 con el texto «¿Y si hoy protegieras lo que más quieres?».
    - expect: El párrafo introductorio que menciona «seguros de Santalucía combinan coberturas amplias» es visible.
  2. Verificar la tarjeta de producto «Seguros de hogar».
    - expect: Existe un H3 con el texto «Seguros de hogar».
    - expect: El texto de apoyo «Tu espacio seguro empieza aquí» es visible.
    - expect: Se muestran los tres planes: H4 «Hogar Completo» (marcado como «Opción recomendada»), H4 «Hogar Eficaz» y H4 «Hogar Premium», cada uno con descripción de texto no vacía.
    - expect: Aparece el botón «Te llamamos GRATIS» dentro de la tarjeta Hogar con rol button y cursor pointer.
  3. Verificar la tarjeta de producto «Seguros de decesos».
    - expect: Existe un H3 con el texto «Seguros de decesos».
    - expect: Se muestran los tres planes: H4 «Equilibrado Completo +» (marcado como «Opción recomendada»), H4 «Equilibrado Completo» y H4 «Estable Completo», cada uno con descripción de texto no vacía.
    - expect: Aparece el botón «Te llamamos GRATIS» dentro de la tarjeta Decesos.
  4. Verificar la tarjeta de producto «Seguros de vida».
    - expect: Existe un H3 con el texto «Seguros de vida».
    - expect: Se muestran los tres planes: H4 «Temporal Renovable» (marcado como «Opción recomendada»), H4 «PlanVida General y Single» y H4 «PlanVida Mujer Plus», cada uno con descripción de texto no vacía.
    - expect: Aparece el botón «Te llamamos GRATIS» dentro de la tarjeta Vida.
  5. Hacer clic en el botón «Te llamamos GRATIS» de la tarjeta «Seguros de hogar».
    - expect: Se abre un modal (role=dialog) contextualizado para hogar.
    - expect: El encabezado del modal contiene «Hazte con tu seguro de hogar» (el producto está preseleccionado, no hay dropdown de tipo en este modal).
    - expect: El modal contiene el campo «Teléfono», la casilla obligatoria de protección de datos y el botón «Te llamamos».
    - expect: El modal contiene la sección alternativa de llamada con los números de contacto y el horario comercial.
  6. Cerrar el modal haciendo clic en «Cerrar ventana de diálogo». Verificar que la landing sigue visible e intacta.
    - expect: El modal se cierra sin navegar a otra URL.
    - expect: Las tres tarjetas de producto siguen siendo visibles en la página.

#### 1.4. TC-04 Formulario de captación en hero — visibilidad y selector de seguros

**File:** `tests/santalucia-multirramo/tc04-hero-form.spec.ts`

**Steps:**
  1. Navegar a https://www.santalucia.es/es/segurosmultirramo y aceptar cookies. Verificar el formulario de captación visible en el hero (panel derecho «Te llamamos GRATIS»).
    - expect: Existe un H2 con el texto «Te llamamos GRATIS» dentro del hero.
    - expect: El párrafo «Hazte con tu seguro» está visible sobre el grupo de radio buttons.
    - expect: El formulario contiene cuatro radio buttons con los valores: «Hogar» (checked por defecto), «Decesos», «Vida» y «Salud».
    - expect: El radio button «Hogar» está marcado (checked) al cargar la página sin interacción previa.
    - expect: Existe un campo textbox con label «Teléfono» (marcado como obligatorio con asterisco).
    - expect: Existe una casilla de aceptación de protección de datos con el texto «He leído y acepto la información sobre la Protección de datos.» y el link «Protección de datos» funcional.
    - expect: Existe una casilla opcional «Quiero recibir información sobre productos y ofertas que me puedan beneficiar.»
    - expect: El botón «Solicitar llamada» está visible y habilitado.
    - expect: El párrafo de horario «Nuestro horario de atención comercial: Lunes a viernes de 9:00 a 21:00» está visible.
  2. Hacer clic en el radio button «Decesos» en el formulario hero.
    - expect: El radio button «Decesos» queda seleccionado (checked).
    - expect: El radio button «Hogar» queda deseleccionado.
    - expect: Solo un radio button del grupo está marcado a la vez.
  3. Hacer clic en el radio button «Vida».
    - expect: El radio button «Vida» queda seleccionado.
    - expect: Los demás radio buttons quedan deseleccionados.
  4. Hacer clic en el radio button «Salud».
    - expect: El radio button «Salud» queda seleccionado.
    - expect: Los demás radio buttons quedan deseleccionados.
  5. Sin rellenar ningún campo del formulario, hacer clic en el botón «Solicitar llamada».
    - expect: El formulario no se envía (no hay navegación a otra URL ni mensaje de éxito).
    - expect: Se muestra algún indicador de validación (mensaje de error en el campo Teléfono y/o en la casilla obligatoria de protección de datos) — verificar que el navegador o la página impide el envío cuando los campos obligatorios están vacíos.

#### 1.5. TC-05 Banner promocional «Días Azules» y sección de opiniones

**File:** `tests/santalucia-multirramo/tc05-promo-reviews.spec.ts`

**Steps:**
  1. Navegar a https://www.santalucia.es/es/segurosmultirramo y aceptar cookies. Verificar el banner promocional «Días Azules Santalucía» visible bajo el hero.
    - expect: Existe un bloque con el texto «DÍAS AZULES SANTALUCÍA» (párrafo supertítulo).
    - expect: Existe un H2 con el texto «Consigue gratis una TARJETA REGALO».
    - expect: El párrafo descriptivo menciona «al contratar tu seguro de hogar, decesos o vida riesgo».
    - expect: Existe el link «Consulta las condiciones» apuntando a un PDF en el dominio santalucia.es (href contiene .pdf).
    - expect: La imagen de la promoción tiene un atributo alt no vacío y descriptivo.
  2. Desplazarse hasta la sección «Opiniones» y verificar su contenido.
    - expect: Existe un H2 con el texto «Opiniones».
    - expect: El párrafo «La voz de nuestros clientes» es visible.
    - expect: Se muestra la puntuación global de Google: un valor numérico en formato «4,xx /5» junto al texto de número de valoraciones «(xx.xxx valoraciones)».
    - expect: El logotipo de Google es visible en esta sección (img con alt «Logo Google»).
    - expect: Al menos 5 reviews de clientes son visibles en el carrusel inicial, cada una con imagen de estrellas y texto de reseña no vacío.
    - expect: Cada reseña contiene un link hacia el perfil de la oficina Santalucía en Google Maps.
  3. Hacer clic en el botón «Siguiente» (navegación del carrusel de opiniones).
    - expect: El carrusel avanza a la siguiente tanda de reseñas.
    - expect: El botón «Anterior» pasa de estado disabled a habilitado (ya que hay reseñas anteriores).
    - expect: El contenido de las reseñas visibles cambia (nuevos textos de opinión).
  4. Hacer clic en el botón «Anterior» del carrusel de opiniones.
    - expect: El carrusel retrocede al primer grupo de reseñas.
    - expect: El botón «Anterior» vuelve a estado disabled (primera posición del carrusel).
  5. Desplazarse hasta la sección «Por qué Santalucía es una compañía líder» y verificar su contenido.
    - expect: Existe un H2 con el texto «Por qué Santalucía es una compañía líder».
    - expect: Se muestran exactamente tres proposiciones de valor con encabezados H3: «Somos innovación», «Comprometidos con el entorno» y «Por servicio».
    - expect: Cada proposición tiene texto descriptivo no vacío.
  6. Verificar el footer de la página.
    - expect: El footer (contentinfo / role=contentinfo) contiene el texto «copyright © Santalucia.»
    - expect: Existen exactamente tres links legales: «Aviso Legal» (href=/informacion-legal), «Política de Privacidad» (href=/politica-de-privacidad) y «Política de Cookies» (href=/politica-de-cookies).
    - expect: No hay navegación corporativa completa en el footer (esta landing es intencionalmente minimalista).
