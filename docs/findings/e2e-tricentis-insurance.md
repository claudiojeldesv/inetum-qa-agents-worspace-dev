# Ciclo E2E en terreno virgen (II) — Tricentis Vehicle Insurance

- **Fecha**: 2026-08-31
- **Sitio**: https://sampleapp.tricentis.com/101/ (Vehicle Insurance Application v1.0.1 —
  tarificador de pólizas de vehículo, demo oficial de Tricentis; landing de marketing +
  wizard de 5 pasos, sin login). Segundo sitio del producto jamás tocado antes de su ciclo;
  elegido entre los dos finalistas del ciclo RBP (Tricentis Insurance y EspoCRM) por ser
  dominio seguros — el vocabulario del cliente objetivo — y por su familia de UI (fachada
  jQuery ideal-forms sobre formularios nativos ocultos).
- **Método**: el mismo protocolo del ciclo RBP — reconocimiento con capturas → planner
  nativo → FD onesait de 10 casos diseñado DESDE la UI → walk-script → tres modos medidos
  (motor solo · walker+IA · solo IA) → estreno manual del QA al final. **Novedad de este
  ciclo**: es el primer terreno virgen que el walker pisa con el **triaje del rescate
  (D68/D69) de serie** — en RBP el triaje se construyó DESPUÉS de medir el rescate ciego.
- **Artefactos**: FD en `template/examples/07-tricentis-insurance/tricentis-insurance-fd.md` ·
  walk-script en `docs/demo/tricentis-regresion.walk.json` · capturas y literales en
  `.work/e2e-tricentis/` · contract `config/style-contracts/tricentis-insurance.yaml` ·
  receta `config/field-sites/tricentis-insurance.yaml`.

---

## 1. Reconocimiento (capturas + literales)

Pase visual propio (20 capturas en `.work/e2e-tricentis/capturas/`, literales exactos en
`literales.json`) más tres sondas dirigidas (paso 3, envío, determinismo). Lo que el sitio ES:

- **Landing de marketing** en `/101/`; el wizard vive DETRÁS del nav de tipos de vehículo
  (Automobile / Truck / Motorcycle / Camper) y corre entero en `app.php`.
- **Wizard de 5 pasos** con pestañas: Enter Vehicle Data → Enter Insurant Data → Enter
  Product Data → Select Price Option → Send Quote. Los formularios del paso 1 y 3 **varían
  por tipo de vehículo** (Motorcycle añade Model y Cylinder Capacity y pierde Fuel Type,
  Merit Rating y Courtesy Car; Truck añade Payload y Total Weight).
- **Tabla de tarifas computada**: Silver/Gold/Platinum/Ultimate con Price per Year ($) y
  filas de coberturas (Online Claim, Claims Discount (%), Worldwide Cover). **Determinista**:
  la misma configuración dio 88.00/260.00/510.00/972.00 en dos runs separados; otra
  configuración dio 122/233/344/455. El precio exacto es oráculo legítimo POR configuración.
- **Envío final** («Send Quote»): E-Mail, Phone, Username, Password ×2, Comments → « Send » →
  ventana modal «**Sending e-mail success!**» (botones Cancel/OK). Con datos inválidos:
  «**Not finished yet...** / **There is still some data missing!**».

### Los rasgos que muerden (medidos, no supuestos)

1. **Fachada ideal-forms**: los `<select>`, radios y checkboxes nativos están OCULTOS tras
   una UI estilizada (jQuery ideal-forms). `selectOption` sin `force` se cuelga esperando
   visibilidad; el gesto del usuario real es el dropdown/label visible. Es la familia
   «selectOption lanzó sobre un div» que el select inteligente del walker (Fase 1 caos
   corporativo) maneja en Angular Material/PrimeFaces — aquí en su variante jQuery 2015.
2. **El Next NAVEGA con errores**: pulsar «Next »» con el paso incompleto no bloquea — el
   wizard avanza y deja un contador rojo de errores en la pestaña (7 en Vehicle Data vacío).
   El gate real está aguas abajo: la tabla se niega a calcular («Please, complete the first
   three steps to see the price table.») y el envío rechaza («Not finished yet...»).
   El CP010 del FD pisa esta tensión a propósito.
3. **Reglas de validación con literal exacto**: Start Date «Must be more than one month in
   the future» (medido: 09/15/2026 inválida, 11/30/2026 válida, diseñando el 2026-08-31);
   Phone «Must be only digits» (+34… se rechaza; 0034… pasa); Engine Performance «Must be a
   number between 1 and 2000». Los tooltips solo se muestran CON EL CAMPO ENFOCADO.
4. **Ids inconsistentes del propio sitio**: todo el wizard usa ids en minúsculas salvo
   `#EuroProtection`, `#LegalDefenseInsurance` y `#Comments` (CamelCase).
5. **Las fechas del FD caducan**: `12/01/2026` cumple la regla del mes hasta el 1 de
   noviembre de 2026; después el caso cae por dato, no por producto (anotado en el FD).
   La fecha inválida del CP006 (`09/15/2026`) no caduca jamás.

## 2. El planner nativo (S4, descubrimiento)

235.979 tokens · 157 usos de herramienta · ~2h43 (la demo iba lenta esa tarde) → plan en
`specs/tricentis-insurance-test-plan.md`. Más caro que en RBP (146k) y con botín mayor:

- **Confirmó por su cuenta** los rasgos del reconocimiento: el Next NO bloquea con inválidos
  (la tensión que CP010 pisa — dos fuentes independientes, como el crash del 409 en RBP), el
  gate de la tabla, el teléfono solo dígitos, y el **determinismo del precio** (misma config
  dos veces → mismos precios; config distinta → precios distintos).
- **Dos candidatos a defecto que ni el reconocimiento ni el FD tenían**: List Price acepta
  valores NEGATIVOS sin validación, y Date of Manufacture acepta fechas futuras arbitrarias
  (mientras Start Date sí valida su regla del mes — validación asimétrica entre fechas).
- **Un error JS real en el ÉXITO**: al enviar el presupuesto, la consola escupe
  `ReferenceError: e is not defined` (calculations.js:489) y el modal de éxito arrastra el
  texto residual «Not valid!» de la plantilla del modal de error — exactamente el «! Not
  valid!» que la sonda del reconocimiento capturó en el innerText sin explicárselo.
- **Un rasgo de sesión con valor para el guion**: Prev/Next y las pestañas conservan los
  datos; recargar la página o cambiar de tipo de vehículo los BORRA todos.

## 3. FD onesait + walk-script

FD de 10 casos en registro corporativo (un verbo por línea, oráculos en negrita), diseñado
DESDE la UI: CP001 tarificación de automóvil con precios exactos · CP002 envío del presupuesto
Gold (cerrar ventana con OK) · CP003 coberturas de la tabla · CP004 tarificación de motocicleta
(campos propios) · CP005 validación de potencia · CP006 regla de fecha de inicio · CP007
teléfono solo dígitos + envío rechazado · CP008 Prev conserva los datos · CP009 la tabla se
niega sin datos · CP010 el asistente no debe avanzar con inválidos (la tensión deliberada:
el FD exige quedarse; la aplicación navega dejando contador — veredicto del QA).

Walk-script de 10 flujos / 237 pasos anclado al FD, validado contra el contract. Hints
semánticos honestos sin pre-afinar: la fricción restante ES la medición.

## 4. Los tres modos (resultados)

_(se rellena con cada run)_

### 4.1 Motor solo (0 tokens, línea base)

**173/237 pasos · 0 rescates · 64 bloqueados · 3 pantallas · exit 0.** Un solo run, sin haber
visto el sitio jamás. Lo que el reporte cuenta:

- **La cascada madre de este sitio es la fachada**: los `check` sobre radios y checkboxes
  fallan con el patrón exacto «`getByLabel('Male')` RESUELVE, pero la acción sobre el input
  oculto se rechaza» (ideal-forms esconde el nativo). Sin género marcado, el paso 2 queda
  inválido → **el gate del negocio** (la tabla se niega a calcular) tumba el resto del flujo:
  los 8 asserts de precios de CP001 caen aguas abajo de UN checkbox. Es la variante
  radio/checkbox de la familia «selectOption lanzó sobre un div» — el select inteligente
  (Fase 1) resuelve los `select` de esta misma fachada, y por eso los 24 selects del guion
  pasaron TODOS a la primera; los radios/checkboxes aún no tienen ese peldaño.
- **Las guardas honestas trabajando**: `Enter Vehicle Data` pasó por COINCIDENCIA PARCIAL
  dentro de `Enter Vehicle Data7` — la guarda vio el CONTADOR DE ERRORES de la pestaña
  metido en el texto; cp009/s2 se resolvió por peldaño débil tocando «Select Price Option1»
  (mismo contador). El rasgo #2 del sitio, cazado por dos guardas distintas sin que nadie
  se lo pidiera.
- **cp008 (Prev conserva los datos) pasó entero** — con el aviso honesto de que el género
  había quedado sin marcar aguas arriba.
- **cp010 dejó la tensión registrada**: `expect_state Make visible` no se cumplió — la
  aplicación NAVEGÓ al paso siguiente con el formulario vacío, exactamente lo que el FD
  denuncia. El veredicto («el FD tiene razón») queda servido para el QA.
- cp004/s2-s3: `expect_state visible` sobre Model y Cylinder Capacity falló **por diseño del
  sitio** — el control nativo está oculto tras la fachada; lo visible es el disfraz. El FD
  dice «se muestra el campo» y tiene razón ANTE EL USUARIO; el DOM dice hidden. Material de
  veredicto fino, no de locator.

### 4.2 Walker + IA (rescates por subagente Haiku, CON triaje de serie)

**175/237 pasos · 2 micro-llamadas (~92k tokens: 45.6k + 46.8k) · 1 desbloqueo comprado ·
20 bloqueos enrutados a cascada SIN GASTO · exit 0 en 3 reanudaciones.** El contraste con el
walker+IA de RBP (que corrió SIN triaje y quemó 13 llamadas/538k/0 desbloqueos en su primer
contacto) es la validación del triaje en terreno virgen:

| Conducta | Nº | Detalle |
|---|---|---|
| Cascada → ni preguntar | 20 | todo lo aguas abajo de cada gate bloqueado (los asserts de precios de cp001/cp002/cp003/cp007…), a coste cero |
| Rescate solicitado | 2 | solo los hints limpios irresolubles llegaron a la IA |
| Resuelto y PROMOVIDO a alias | 1 | cp006/s23 `Start Date` → `getByRole('textbox', { name: 'MM/DD/YYYY' })` (el snapshot traía el único textbox con ese placeholder); s24 verificó el literal «Must be more than one month in the future» y la promoción llegó tras la postcondición confirmada |
| Declinó (`locator=null`) | 1 | cp005/s4: el snapshot traía `textbox: abc` SIN nombre accesible; el Haiku fresco declinó en vez de arriesgar el posicional `getByRole('textbox').nth(1)` que sí tenía sobre la mesa |
| ECO del hint | 0 | la guarda anti-eco no tuvo que actuar |

Los `action_failed` de la fachada (radios/checkboxes con label que resuelve e input oculto)
NO son fallos de resolución: no pasan por el rescate y quedan como material del panel del QA
— la clase correcta. D66/D69 verificados de paso: la sesión del checkpoint se descartó al
re-ejecutar y el aislamiento entre flujos sobrevivió las 3 reanudaciones.

**Candidato a mejora genérica (anotar, no implementar en este ciclo)**: `check`/`uncheck`
sobre fachada — si el input asociado al label está oculto, accionar el label/control visible,
como ya hace el select inteligente con los `select` de la misma fachada. Un solo peldaño
desbloquearía ~40 de los 64 bloqueos de la línea base (los 3 checks por flujo + sus cascadas).

### 4.3 Solo IA (el LLM ejecuta y verifica el FD)

**9/10 PASA · 310.273 tokens · 247 usos de herramienta · ~3h1m** (el reloj lo infló un
timeout de 30 minutos: `browser_click` esperando a que el radio oculto de la tarifa fuera
«visible y estable» — nunca lo es, está fuera de pantalla a propósito). Subagente Sonnet con
el FD y navegador propio, misma configuración que el ciclo RBP.

- **El único FALLA es el CORRECTO**: CP010 — la aplicación avanza de paso con el formulario
  vacío; el veredicto razonado del ejecutor coincide con la nota del FD («me inclino por el
  FD… aunque el patrón de la app es una decisión de UX defendible») — la tensión funcionó
  como ejercicio de juicio, no como trampa.
- **El descubrimiento mayor del ciclo**: los radios de Select Option están posicionados a
  `left:-9999px` tras un label visual, y el binding de selección es SOLO-jQuery — un
  `.click()` nativo del DOM deja el radio MARCADO A LA VISTA pero NO actualiza el importe
  interno (`pricesum` se queda obsoleto) y el envío se rechaza. **Estado visual ≠ estado
  interno**: la trampa exacta contra la que el FD avisa («controles no nativos a la vista»)
  y la razón de diseño por la que el futuro peldaño de fachada debe accionar el CONTROL
  VISIBLE como un usuario, jamás el input oculto por JS.
- **Dato en disputa** (para el estreno del QA): el ejecutor afirma que Hobbies y Optional
  Products son obligatorios TAMBIÉN en Motorcycle (sin ellos su tabla no calculó); la sonda
  del reconocimiento obtuvo tabla en Motorcycle SIN marcar ninguno. Su navegador arrastraba
  además AUTOCOMPLETADO entre ejecuciones (campos sobrescritos solos — riesgo real que
  reportó con criterio). Dos observaciones honestas que se contradicen: a verificar en vivo.
- Confirmó por tercera vía el `ReferenceError: e is not defined` (calculations.js:489) al
  enviar, y el nodo oculto «Not valid!» conviviendo con el modal de éxito (riesgo para
  lectores de pantalla).

## 4.4 La tabla que responde a la pregunta del ciclo

| Modo | Resultado | Tokens | Reloj | Qué queda después |
|---|---|---|---|---|
| Motor solo | 173/237 pasos; 24 selects de fachada TODOS resueltos; 64 bloqueados con causa exacta | **0** | ~9 min el run entero | dom-map determinista, timing profile, bloqueos accionables, la tensión de CP010 registrada |
| Walker + IA (Haiku, triaje de serie) | 175/237; 1 desbloqueo comprado (la regla del mes verificada) + 1 alias promovido | ~92k en 2 micro-llamadas | ~15 min (3 reanudaciones) | alias durable `Start Date`, 20 cascadas a coste cero, las clases panel listas para el QA |
| Solo IA (Sonnet) | 9/10 casos, veredicto de CP010 razonado, 3 descubrimientos de negocio | ~310k **cada run** | ~3h (timeout de 30 min incluido) | prosa: ni acta, ni locators medidos, ni artefacto re-ejecutable |

La división del trabajo del ciclo RBP se repite EXACTA en otro dominio y otra familia de UI —
con una diferencia que es la validación del triaje: en RBP el primer contacto walker+IA costó
538k para comprar CERO desbloqueos; aquí, con el triaje de serie, costó 92k y compró un
desbloqueo con alias durable y la regla de negocio verificada. El gasto fue a la única clase
donde la IA podía ganar; la cascada y la fachada (clases panel) quedaron señaladas para el QA
sin quemar un token.

## 5. Estreno manual del QA

PENDIENTE — se despliega a su workspace con la receta y el QA ejecuta con paneles (`--assist`).
Los bloqueos de la línea base son el material del ejercicio, y este sitio pide EXACTAMENTE los
gestos del panel: señalar el radio **Male** visible (el de la fachada), el checkbox
**Speeding** / **Euro Protection**, y el radio de la tarifa **Gold** (el de `left:-9999px` —
donde el clic del panel, que es un clic REAL, sí actualizará el importe interno que el JS
nativo no toca). Y el veredicto de CP010 (el FD tiene razón: el asistente navega con el
formulario vacío). Aviso operativo: la fecha `12/01/2026` del FD caduca el 1 de noviembre de
2026; el autocompletado del navegador puede contaminar los campos (verificar el valor final
antes de avanzar, como reportó el solo-IA).
