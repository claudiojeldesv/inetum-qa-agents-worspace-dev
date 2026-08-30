# Ciclo E2E en terreno virgen — Restful Booker Platform

- **Fecha**: 2026-08-30
- **Sitio**: https://automationintesting.online/ (Shady Meadows B&B — RBP v2.2, React SPA,
  cara pública + admin). Elegido por el QA entre 3 candidatos vivos (Tricentis Insurance,
  EspoCRM demo, éste). Primer sitio del producto **jamás tocado antes de este ciclo**.
- **Método**: el ciclo completo del producto, en el orden del protocolo — reconocimiento con
  capturas → planner nativo → FD onesait de 10 casos diseñado DESDE la UI → walk-script →
  tres modos medidos (motor solo · walker+IA · solo IA) → estreno manual del QA al final.
- **Artefactos**: FD en `template/examples/06-restful-booker/restful-booker-fd.md` · plan del
  planner en `docs/qa-plans/restful-booker-platform-test-plan.md` · walk-script y capturas en
  `.work/e2e-rbp/` · contract `config/style-contracts/restful-booker.yaml` · receta
  `config/field-sites/restful-booker.yaml`.

---

## 1. Reconocimiento (capturas + literales)

Pase visual propio (15 capturas en `.work/e2e-rbp/capturas/`, literales exactos en
`literales.json`) y en paralelo el planner nativo. Lo que el sitio ES:

- **Pública**: home única con disponibilidad (Check In / Check Out → Check Availability),
  3 habitaciones semilla (Single £100 · Double £150 · Suite £225), reserva por habitación
  (Price Summary con desglose → Reserve Now → formulario por PLACEHOLDER
  Firstname/Lastname/Email/Phone → **«Booking Confirmed»**), y contacto con 8 validaciones
  enumerables y éxito personalizado (**«Thanks for getting in touch Ana Prueba!»**).
- **Admin** (`/admin`, admin/password del README — la pantalla NO las imprime): tabla de
  habitaciones (Room # / Type / Accessible / Price / Room details), alta con selects y
  checkboxes de features, bandeja **Messages** con badge que DECREMENTA al leer, modal de
  mensaje con **Close**, report (calendario), branding (excluido del alcance: muta la demo
  compartida para todos).

### Los tres rasgos que muerden (medidos, no supuestos)

1. **La demo se reinicia por ventanas**: frontend y microservicios caen unos segundos
   («This page couldn't load» en mitad de una sonda; curl 200 y chromium fallando a la vez).
   En el smoke esto es clase `entorno`, no culpa del Writer.
2. **DEFECTO REAL del sitio**: `POST /api/booking` → **409** en doble-booking (correcto), y el
   frontend revienta — `TypeError: Cannot read properties of undefined (reading 'length')`,
   página en blanco, título vacío, CERO mensaje al usuario. Reproducido también por el
   planner de forma independiente (dos veces). CP010 lo pisa a propósito.
3. **Las reservas son estado compartido y persistente entre reinicios** (un 409 llegó de una
   sonda de 20 minutos antes): cada caso reserva en su propia ventana de fechas.

## 2. El planner nativo (S4, descubrimiento)

145.823 tokens · 87 usos de herramienta · 10 min 24 s → 13 TCs en 5 suites con oráculos
literales. Encaja con lo medido en el spike (~130-160k por pasada de planner).

Contraste con el FD de 10 casos (diseñado a mano desde el reconocimiento): los 13 del planner
cubren los 10 del FD más tres extras — teléfono corto (variante de validación), calendario del
report (oráculo dependiente del mes en curso: excluido), branding read-only (excluido por
alcance). El planner confirmó por su cuenta el crash del 409, el ciclo público→admin
(«You have a new booking!» verificado con segunda pestaña) y el badge decreciente.

## 3. FD onesait + walk-script

FD de 10 casos en registro corporativo (un verbo por línea, oráculos en negrita), diseñado
DESDE la UI: CP001 reserva · CP002 disponibilidad · CP003 detalle suite · CP004 contacto ·
CP005 validaciones · CP006 acceso admin · CP007 alta habitación · CP008 la reserva llega a la
bandeja · CP009 lectura de mensaje (cerrar ventana) · CP010 fechas ocupadas (el caso del
defecto: el FD exige aviso; la aplicación revienta — el veredicto correcto es «el FD tiene
razón»).

Walk-script de 10 flujos / ~100 pasos anclado al FD, validado contra el contract. Hints
semánticos honestos sin pre-afinar: la fricción restante ES la medición.

## 4. Los tres modos (resultados)

_(se rellena con cada run)_

### 4.1 Motor solo (0 tokens, línea base)

**72/111 pasos · 0 rescates · 39 bloqueados · 4 pantallas · exit 0.** Un solo run, sin haber
visto el sitio jamás. Lo que hizo bien no es el número: es la HONESTIDAD del reporte —

- CP002, CP006 y CP009 completos a la primera (login admin incluido, por placeholders).
- **La cascada madre**: el `scope` `{text:'Single'}` resolvió a un contenedor que NO contiene el
  «Book now» (el título de la tarjeta, no la tarjeta), y los 4 flujos de reserva cayeron en
  cascada: 19 de los 39 bloqueos son pasos condenados aguas abajo de ese único fallo.
- **Se negó a adivinar** el link «Contact» (nav + footer, mismo nombre): ambigüedad real,
  bloqueo correcto.
- **Guardas honestas trabajando**: 'Our Rooms' pasó por COINCIDENCIA PARCIAL dentro del
  párrafo de bienvenida («All our rooms have comfortable beds…») y lo AVISÓ; 5 verdes con un
  paso anterior bloqueado, señalados; 1 resolución por peldaño débil, declarada.
- **Resolución equivocada silenciosa detectada a posteriori**: s11/s12 de CP001 (Email/Phone
  del formulario de huésped) rellenaron los campos del formulario de CONTACTO de la home —
  la clase EQUIVOCADO del banco de rescates, en vivo. El hint sin pantalla acotada resuelve
  donde puede.

### 4.2 Walker + IA (rescates por subagente Haiku)

**13 micro-llamadas · ~538k tokens · CERO pasos desbloqueados · 42 bloqueados (3 MÁS que la
línea base) · exit 0.** El resultado más informativo del ciclo:

| Conducta del rescate | Nº | Veredicto |
|---|---|---|
| Declinó (`locator=null`) con razón correcta | 10 | planta-correcta: ambigüedad real («4 Book now indistinguibles», «2 Contact») o elemento ausente (pasos condenados por la cascada) |
| **ECO del hint fallido** (`getByTestId('type')` cuando el snapshot no trae test-ids) | 3 | conducta NUEVA para la taxonomía del banco de rescates: ni acierto, ni EQUIVOCADO, ni planta — devuelve lo que ya falló y quema el intento |

Por qué cero desbloqueos, y por qué eso es un hallazgo y no un fracaso:

1. **La petición de rescate NO arrastra el `scope` del paso** (candidato a defecto): el walker
   sabía `{text:'Single'}` y el subagente recibió solo el hint — la única información que
   desambiguaba se quedó en casa. Con ella, la gramática TAMPOCO puede expresar «el Book now
   de la tarjeta Single» (no hay `nth` ni contenedores) — dos límites de diseño, medidos.
2. **El rescate en cascada quema presupuesto en pasos condenados**: 4 de las 13 llamadas
   fueron para pasos (Firstname, Reserve Now…) que no existían porque el paso anterior quedó
   bloqueado. El walker pide rescate de cada uno igualmente.
3. **Defecto hermano de D66 destapado** (candidato a D-número): D66 limpia la sesión al
   RE-ejecutar el flujo a medias, pero en la reanudación la sesión del checkpoint contamina
   el flujo SIGUIENTE — cp007 y cp009 aterrizaron en /admin YA logueados y su login se volvió
   irresoluble (cp009 pasó de 0 bloqueos en la línea base a 3 aquí). El aviso honesto
   («pasó, pero s2 había quedado sin ejecutar») lo dejó a la vista.
4. La declinación es la conducta CORRECTA (regla: no inventar) — la misma lección de la
   comparativa: el rescate es red para hints resolubles no enseñados; la ambigüedad
   estructural es del QA (panel, con firma) o del guion (scope bien anclado).

**La demo compartida mutó DURANTE el run**: el branding pasó de «Shady Meadows B&B test» a
«TestQA AYHxlj» (otro usuario) y de vuelta a «Shady Meadows B&B» (reset) — el oráculo de CP001
s1 nunca fue estable y el FD lo hereda. Los snapshots de rescate lo documentan.

### 4.3 Solo IA (el LLM ejecuta y verifica el FD)

**8/10 PASA · 212.197 tokens · 114 usos de herramienta · 9 min 38 s.** Subagente Sonnet con el
FD y navegador propio (misma configuración que la comparativa de 2026-08-16, que dio 145k por
5 casos — aquí 212k por 10: coherente).

- Los dos FALLA son los CORRECTOS: CP001 paso 2 (el branding compartido había mutado — la
  home decía «Welcome to Shady Meadows B&B», sin «test») y CP010 paso 10 (el crash).
- **Dos descubrimientos que ningún otro modo hizo**: (1) el buscador de disponibilidad SÍ
  filtra la habitación ocupada — la tarjeta Single DESAPARECE del catálogo con fechas
  tomadas, comportamiento de negocio correcto que ni el reconocimiento ni el planner habían
  visto; (2) el crash del 409 solo se alcanza esquivando el buscador (URL directa a
  `/reservation/<id>` con fechas ocupadas) — el defecto es de manejo de errores del cliente,
  no de la regla de negocio.
- Incidencias con valor: el 400 de `/api/message` visible en consola al validar el contacto;
  la bandeja compartida con mensajes de otros usuarios simultáneos («ttt ttt»).
- CP007 (alta con selects) le salió a la primera: la IA ve el DOM entero, no un hint.

## 4.4 La tabla que responde a la pregunta del ciclo

| Modo | Resultado | Tokens | Reloj | Qué queda después |
|---|---|---|---|---|
| Motor solo | 72/111 pasos; CP002/CP006/CP009 completos; 39 bloqueados CON causa exacta | **0** | ~7 min el run entero | dom-map determinista, aliases, timing profile, bloqueos accionables |
| Walker + IA (Haiku) | idéntico al motor solo MÁS 3 bloqueos nuevos (D69) | ~538k en 13 micro-llamadas | ~35 min (13 reanudaciones) | nada durable: 10 declinaciones correctas + 3 ecos; destapó D68/D69 |
| Solo IA (Sonnet) | 8/10 casos, veredictos correctos, 2 descubrimientos de negocio | ~212k **cada run** | ~10 min | prosa: ni acta, ni locators medidos, ni artefacto re-ejecutable |

La lectura no es «qué motor gana»: es la **división del trabajo** que el producto ya predica.
En terreno virgen la IA ejecutora es el mejor explorador (ve el DOM, rodea obstáculos, huele
incidencias) y el peor activo (todo se re-paga, nada queda). El walker es el peor explorador
(su primer contacto se planta donde el guion no ancla) y el mejor activo (todo lo que el QA
firme una vez corre gratis para siempre, con guardas honestas). El rescate automático, tal
como está, no puentea la distancia: declina bien (no inventa) pero D68 le esconde el scope y
D69 le envenena la sesión — las dos piezas nuevas del índice salieron de AQUÍ.

El camino del producto sigue siendo el del ciclo OrangeHRM: **paneles + acta + fusión** para
convertir los 39 bloqueos en un guion que corra en verde a 0 tokens — y eso es exactamente el
estreno manual del QA (§5).

## 5. Estreno manual del QA

PENDIENTE — se despliega a su workspace con la receta y el QA ejecuta con paneles (`--assist`).
Los bloqueos de la línea base son el material del ejercicio: señalar el «Book now» de la
tarjeta correcta, el «Contact» del nav, los selects del alta; y el veredicto de CP010 (el FD
tiene razón: la aplicación revienta sin aviso). Aviso operativo: las reservas del solo-IA
(10-12/11, 24-26/11, 01-03/12) pueden seguir vivas — si el arrange de CP001/CP008/CP010
choca con 409, es la demo compartida, no el producto (esperar al reset o cambiar ventana).
