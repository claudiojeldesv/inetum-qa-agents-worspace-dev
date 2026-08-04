# SPEC — Kernel v2 (`@inetum/qa-walk`) + Client Packs

**Estado**: CONGELADO 2026-07-31 (sesión de diseño Claudio + Claude). **Origen**: evolución del
dom-walker de `copilot/src/` (H1, validado) hacia componente de producto. **Relación con SPEC.md**:
este documento especifica la columna determinística; el SPEC del agente no cambia. Las reglas duras
del CLAUDE.md (compliance sin override, validación determinística, no fabricar, datos productivos
fuera del contexto) aplican íntegras y este spec no las repite.

---

## 1. Propósito

Empaquetar la red determinística como producto independiente de plataforma (Claude Code / Copilot /
CI headless): un **kernel genérico versionado** con puntos de extensión, y el conocimiento de cada
cliente como **pack** instalable. El LLM queda en los bordes (refiner, writer, rescate); el bucle
caliente es código.

Tesis económica que lo justifica (medida): el coste LLM escala con turns × contexto reacumulado, no
con trabajo hecho. Todo lo movible a código cuesta $0 por ejecución para siempre. Tesis de cliente:
los clientes corporativos son homogéneos por dentro (2-4 familias de stack para ~100 apps) — el
conocimiento se paga por familia, no por aplicación.

## 2. Decisión arquitectónica

**Kernel + Client Packs** (opción B de la sesión de diseño), con dos matices:

- Las recetas YAML declarativas (opción A) son el **nivel 1** del puerto de widgets: el 80% de los
  widgets se declara en YAML interpretado por el kernel; el 20% perverso es código TypeScript en el
  pack. No son alternativas, son niveles.
- El modelo de sitio (opción C, estilo MBT/GraphWalker) queda **diferido pero sembrado**: el kernel
  deja de destruir conocimiento al final del run (hoy borra `walk-state.json`); los dom-maps se
  fusionan en un `site-model.json` acumulativo por cliente. El motor de planificación sobre el grafo
  NO se construye — decisión con dato cuando haya 3-4 apps caminadas.

```
@inetum/qa-walk (kernel)                 @inetum/qa-walk-pack-<cliente>
├── motor de pasos/estado/checkpoint     ├── contract-defaults.yaml
├── escalera de resolución (§5)          ├── resolvers/        (código TS)
├── clasificador de fallos (§6)          ├── widgets/          (YAML nivel 1 + TS nivel 2)
├── protocolo de rescate (§9)            ├── capture/          (enrichers TS)
├── poda/dedupe/naming/fingerprint       ├── session/          (providers TS)
├── site-model merge                     ├── templates/        (*.walk.json parametrizados)
└── 4 puertos:                           ├── hint-aliases.json (memoria de instancias, auto)
    resolvers | widgets |                ├── lessons.md        (memoria de patrones, curada)
    capture-enrichers | session          └── glossary.md       (vocabulario de dominio)
```

Regla de pureza: **el kernel no contiene conocimiento de ningún cliente.** Un `if` con nombre de
cliente en el kernel es un bug de arquitectura. Todo lo específico entra por los puertos o por datos.

## 3. Contratos de datos

### 3.1 Style Contract → perfil de sitio (extensiones)

```yaml
stack:
  family: angular-material      # selecciona resolvers/widgets/settle del pack
  session: nace                 # provider de login (nace | portal-todos | form | none)
  environment: pre              # activa perfil de entorno (§8)
settle:
  absent: ['.cdk-overlay-backdrop', 'mat-spinner']   # señal de quietud por familia
  timeout_ms: 8000
timeouts:                       # por entorno; PRE sube, PROD-like baja
  action_ms: 15000
  assertion_ms: 15000
session:
  strategy: replay              # persist | replay (sitios que invalidan sesión)
  prologue: login.walk          # plantilla que se re-ejecuta en reanudación/expiración
budget:
  rescues: 3                    # QA_RESCUE_BUDGET sigue siendo override
```

App nueva de familia conocida = contract fino (URL, context path, `stack:`) — una tarde, no un
estudio. Familia desconocida = modo genérico degradado (kernel solo, más open_questions).

**Red corporativa (heredado de core v1, obligatorio en el kernel)**: proxy vía convención de entorno
`HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` (`proxy-env.ts`, commit `f076f83`) — TODO lanzador de navegador
del kernel la honra (el Chromium de Playwright no usa el PAC del sistema; sin esto, en red corporativa
no hay run). Resolución de URLs bajo context path vía semántica única de `app-url.ts` (commit
`6bae906`). Ninguna de las dos es opcional ni re-implementable por el pack.

### 3.2 walk-script v2

Cambios sobre v1 (`copilot/src/walk-types.ts`):

- **Acciones `expect_text` / `expect_state`**: postcondiciones del FD como pasos. El refiner las
  emite desde los `then`. El walk pasa de discovery a **smoke ejecutable del FD**: drift
  FD↔aplicación detectado en Acto 2, a $0, con el texto de negocio capturado con locator verificado
  (cierra el gap semántico clase checkout/SauceDemo en origen).
- **Macros `use:`**: `{use: "login"}`, `{use: "nav-modulo", args: {modulo: "437"}}` expanden
  plantillas parametrizadas del pack. El login NUNCA va inline en un guion.
- `optional:` y `screen:` sin cambios. Validación del guion se amplía a las acciones nuevas.

### 3.3 dom-map v2

- Elementos ganan **procedencia de resolución**: `resolved_via` + `failed_attempts[]` (alimenta a
  verify-locators y al Reviewer sin pasada extra).
- **`business_text[]`** por pantalla: textos de resultado no interactivos (role=alert/status,
  headings de confirmación, clases de banner del DS vía enricher) con locator candidato.
- **Diálogos como sub-pantalla**: `role=dialog` abierto en la captura → pantalla propia
  (`<screen>/dialog-<slug>`) con elementos scoped al diálogo.
- **`fingerprint`** por pantalla: hash estable del conjunto podado de elementos. Identidad para el
  site-model y detección de drift entre runs.
- `frame_path` sin cambios en el walker; **gap a cerrar aguas abajo**: `pom-scaffolder` debe emitir
  `page.frameLocator(...)` cuando el elemento trae frame_path (hoy el dato se pierde al materializar).

### 3.4 site-model.json (semilla de C)

Merge acumulativo de dom-maps por cliente: pantallas (por fingerprint), transiciones, aliases usados,
historial de fingerprints (drift). Solo lectura/merge en v2 — sin planificador.

## 4. Los cuatro puertos

| Puerto | Firma conceptual | Ejemplo del pack |
|---|---|---|
| **Resolver** | `canHandle(hint) → LocatorAttempt[]` | botón-icono por title/aria-label; item de menú Mod-NNN |
| **Widget adapter** | `match(el, ctx) → bool` + `interact(action, value)` | datepicker readonly del DS (3 clicks); grilla con paginación |
| **Capture enricher** | `enrich(frame, screen) → DomElement[]` | banners `.o-alert[role=status]` como business_text |
| **Session provider** | `login(ctx)` + `isExpired(url) → bool` | nace (Kerberos: `--auth-server-allowlist` + doble form), portal-todos, form genérico |

Widgets nivel 1 = recetas YAML (`match` + secuencia `interact`) interpretadas por el kernel; nivel 2
= TS cuando el YAML no alcanza.

## 4-bis. Modo asistido (K0.10) — enmienda al spec congelado

Añadido tras el piloto onesait, donde el walker se atascó en un submenú que abre por
hover: el item existía en el DOM (el locator resolvía) pero el click moría con
`Timeout 10000ms exceeded`, sin señalar la causa. **No es un problema de identidad
del elemento, es de coreografía** — y ningún rescate LLM lo arregla, porque el
locator ya era correcto.

**Por qué no basta el recorder de Playwright**: no graba hover, es una limitación
conocida y abierta (microsoft/playwright [#5177](https://github.com/microsoft/playwright/issues/5177),
[#5481](https://github.com/microsoft/playwright/issues/5481),
[#37075](https://github.com/microsoft/playwright/issues/37075)); su workaround
oficial es escribir el `hover()` a mano. Nosotros tenemos algo que un recorder
genérico no: **sabemos cuál es el elemento objetivo**, así que en vez de grabar el
gesto podemos deducir y verificar el abridor.

**Peldaño nuevo en la escalera** (§5): `... → aliases → ASISTIDO (--assist) →
rescate LLM → open_questions`. En sesión con el QA se usa el asistido ($0 tokens y
capta la coreografía); en batch nocturno, el LLM. Ambos escriben el mismo artefacto.

**Mecánica**: `page.exposeFunction` registrada una vez (sobrevive navegaciones) +
overlay inyectado en la página de la app, en **shadow root cerrado** con marcador
`data-qa-assist-host`. Cerrado a propósito: los locators de Playwright no lo
atraviesan, así el panel no interfiere con la resolución del walker; y la captura
lo salta, así sus botones no acaban en el dom-map ni en los POMs. Modelo **Record**:
los clicks del QA **pasan a la app** (así navega y abre menús) y se registran; los
hovers sostenidos (>400 ms) también, que es justo el hueco del recorder. Al pulsar
Parar: el último click es el objetivo, lo anterior es el camino.

**Verificación por replay, no confianza**: el parche se re-ejecuta desde el entry en
un **contexto fresco** antes de proponerse. Sin eso, un camino que "funcionó porque
el QA tenía el menú abierto" se propondría como bueno y fallaría al día siguiente.

**El parche NUNCA se aplica solo**: se escribe en `assist-patch.json` y el QA lo
funde. El walk-script es artefacto de cliente afinado a mano; que un programa lo
reescriba en silencio es inaceptable.

**Procedencia en el audit-log**: `source: 'human'` frente al `llm_call` del rescate.
Cada locator con su origen —código, modelo o persona— con timestamp. En regulado,
poder decir "este locator lo validó un ingeniero QA el día X" pesa más que el resto
del sistema junto.

**Botón "No existe aquí"**: el QA declara drift. Va a `open_questions` con el mismo
tratamiento que un `expect_text` incumplido, y sale en `fd_drift`. Un humano
confirmando que el FD miente es evidencia, no un fallo.

**Opt-in duro**: `--assist` separado de `--headed`, con timeout (default 600 s). En
CI un navegador esperando a una persona cuelga el pipeline.

**Semi-automático solo la primera vez**: el QA resuelve una vez, el alias (identidad)
o el fragmento del pack (coreografía) queda escrito, y a partir de ahí es automático
en esa app y en las demás de la familia. Es **calibración asistida**, no vuelta al
manual — y es la puerta natural de entrada del cliente al producto.

### K0.11 — lo que faltaba, medido contra el Inspector de Playwright

Tras contrastar con lo que usan los pros (Inspector / extensión VS Code: *Pick
locator*, *Record at cursor*, 3 aserciones, *Clear*; **sin** edición por paso y
**sin** grabación de hover) quedaron claros tres huecos propios y cuatro cosas que
copiar.

**Escalera de locators ampliada** — el hueco grave, y el que explica el fallo real de
onesait s7: su generador produce un locator casi siempre (scoping, `filter`, `nth`);
el nuestro solo miraba identidad semántica y **se rendía después de que el QA
señalara el campo con el dedo**. Tiers nuevos, en orden: `semantic` → `scoped`
(ancestro con role+name) → `anchored` (fila/listitem/group filtrado por la etiqueta
vecina: el patrón label-en-celda de formularios Java) → `css` (solo si el id NO
parece generado: `j_id123`, `mat-input-3`, `:r3:`, `input-347` se descartan) →
`indexed` (`nth`, **siempre marcado frágil**). La fragilidad y el tier **viajan al
parche y al panel**: un `nth` funciona hoy y muere al insertar una fila, y el QA
tiene derecho a saberlo antes de aceptarlo. Grammar de cadena `A >> B >> C` con
sufijo `.nth(N)`, parser puro y resolución por segmentos sobre `Page | Frame |
Locator`.

Lección de la implementación: el primer anchored que escribí filtraba el
**formulario** por la etiqueta y devolvía **3 campos** — el formulario contiene todas
las etiquetas. Hay que estrechar a la **fila**. Medido contra DOM real, no razonado.

**Disparo en `action_failed`** — la asistencia solo se activaba cuando el elemento no
se encontraba, y el caso onesait era el contrario: resolvía y la acción fallaba. Caía
en el `catch` genérico y el panel ni se enteraba. Ahora se ofrece para el mismo paso,
y el motivo del bloqueo **incluye siempre el `via`**: distinguir "no es clicable" de
"matcheé el elemento equivocado" (un hint por texto puede resolver único sobre un
título o un div oculto — que es lo que pasaba de verdad en s6).

**UX del panel** — pausa/reanudar (explorar con la grabación parada y luego grabar la
ruta limpia: mata la causa raíz de la basura en la secuencia), limpiar, borrar por
fila, marcar objetivo, marcar comprobación (emite `expect_text`, cerrando el círculo
con K0.2), resaltado del elemento al pasar por la fila, y **aviso de identidad frágil
en vivo** por un segundo puente `exposeFunction`: el walker responde tier +
fragilidad por elemento capturado. El Inspector muestra el locator pero no juzga su
fragilidad. Y el panel **ya no se cierra al pulsar Parar**: espera el veredicto de la
verificación y lo muestra — el bug de ergonomía por el que el QA no llegó a ver por
qué había fallado s7.

**Minimización por replay** — delta-debugging acotado (cap 6 replays, `--no-minimize`
para saltarlo): se quita cada abridor y se re-verifica; se queda el conjunto mínimo
que sigue reproduciendo. El QA exploró antes de dar con el camino y **no tiene por qué
saber cuáles de sus pasos eran necesarios**: se prueba, no se pregunta.

Lo que NO se hace: competir con el Inspector como grabadora general. Nuestra ventaja
es contexto (sabemos qué paso está atascado), esquema propio (sin traducir código),
verificación y memoria. Donde somos flojos —calidad de locators— se copia, no se
inventa.

## 5. Escalera de resolución v2

Orden estricto; cada peldaño o resuelve mecánicamente o pasa al siguiente. El walker no decide jamás
que dos cosas significan lo mismo — verifica equivalencias que vienen de fuera.

1. **Normalizador determinístico** (nuevo): acentos + case + espacios plegados en ambos lados antes
   de comparar. Mata la clase GESTIÓN-con-tilde sin tokens.
2. **hint-aliases del pack**: match exacto del hint normalizado → locator ya pagado. Gratis.
3. **Escalera del contract** (v1): testid → role+name → label → text, sobre page + todos los frames.
4. **Estrechamiento mecánico de ambiguos** (nuevo): filtro por visibles (v1) + scope al `role=dialog`
   abierto + scope al contenedor de la interacción reciente (el form donde se rellenaron los últimos
   pasos). Si tras estrechar sigue >1 → NO es resoluble mecánicamente.
5. **Asistido** (§4-bis, solo con `--assist`): el QA señala visualmente; $0 tokens y
   captura además la coreografía (`hover` del abridor).
6. **Rescate LLM** (§9), con presupuesto.
7. **open_questions**. Nunca `.first()` a ciegas. Nunca inventar.

Prohibición absoluta: **`force: true` no existe** en el kernel. Un elemento que un usuario no puede
clickar es un hallazgo (a11y/UX), no un obstáculo a saltar. Excepción legítima (input visualmente
oculto de un checkbox custom) = widget adapter, escrito y testeado.

## 6. Clasificador de fallos

Ante cualquier fallo de paso, el kernel recolecta un **paquete de evidencia** determinístico: URL
actual, mensaje de actionability de Playwright, diálogos, banners de error (enricher), status HTTP de
la última navegación, errores de consola, snapshot ARIA podado. Un clasificador (tabla, no LLM) mapea
a clase con reacción declarada:

| Clase | Señal | Reacción |
|---|---|---|
| `session_expired` | URL rebota al patrón de login del contract | re-ejecutar prólogo de sesión + continuar del checkpoint ($0) |
| `app_error` | banner de error DS / 5xx / excepción JS | parar flujo, reportar como hallazgo con evidencia |
| `permission_denied` | 403 / banner de permisos | reportar: usuario de test sin rol |
| `element_missing` | página sana, locator no resuelve | escalera §5 |
| `action_failed:intercepted` | "intercepts pointer events" | settle + 1 reintento; persistente → hallazgo |
| `action_failed:disabled` | "element is disabled" | ¿pasos previos pendientes? orden : hallazgo |
| `environment_error` | goto falla tras N reintentos con backoff | reportar, continuar con el resto |
| `unknown` | nada de lo anterior | escalar con paquete de evidencia |

El walker sigue sin criterio: sensores + taxonomía + runbook. Solo `unknown` toca inteligencia.

## 7. Sesión y recuperación

- `strategy: persist` (v1: storage-state) o `strategy: replay` (corporativo hostil: cada reanudación
  o `session_expired` re-ejecuta el prólogo — segundos, $0).
- Semántica de reanudación sin cambios de v1: flujos completos se saltan; el flujo en curso se
  re-camina desde entry. **Tras un fallo, el estado in-page nunca se considera confiable**: siempre
  replay. "Saber que hay que partir de cero" no existe — se parte de cero siempre, porque es más
  barato que razonar sobre estado a medias.
- MFA/OTP interactivo: fuera de alcance. Prerrequisito de entrada (usuario de test exento en el
  entorno de pruebas), declarado en la propuesta al cliente.

## 8. Perfil de entorno (el caos de PRE)

- Timeouts de acción/aserción por entorno vía contract (§3.1). Las aserciones web-first de Playwright
  reintentan solas — la respuesta al "el servicio tardó 3s" es timeout correcto + settle de familia,
  jamás sleeps.
- `goto` con reintento y backoff (default 2 reintentos).
- **Retry-clasificado**: fallo → settle → UN reintento. Pasa al reintento → `flaky_environment`
  (ambos intentos al audit-log). Falla consistente → hallazgo real.
- Entregable nuevo derivado: **informe de flakiness del entorno** por run (transitorios vs
  consistentes, por pantalla/servicio). El caos de PRE se mide, no se sufre.

## 9. Rescate y memoria

Protocolo v1 intacto (handoff por archivos, exit 42, presupuesto, `locator: null` si no existe,
verificación mecánica de toda propuesta). Cambios:

1. **Promoción condicional** (regla nueva): un locator de rescate se promueve a `hint-aliases.json`
   SOLO si la postcondición de su paso se cumplió (transición esperada / expect posterior verde).
   Rescate que resolvió pero llevó al sitio equivocado → descartado y anotado. La memoria no se
   contamina.
2. **Aliases = memoria de instancias**, se llena sola. **lessons.md = memoria de patrones**, curada:
   el rescate propone lecciones candidatas con evidencia; promoción al pack por PR humano; inyección
   en prompts acotada (top ~10-15, con tope de tokens). Memoria sin curación = basura acumulándose en
   los prompts.
3. **Glosario de dominio**: vocabulario sí ("rescate = retirada de fondos"), narrativa de negocio no.
   El contexto sectorial aumenta la confianza del LLM para inferir lo que la app "debería" hacer —
   exactamente la fabricación contra la que guarda el diseño. La fuente de verdad del comportamiento
   es el FD.

Economía del rescate (para no re-discutirla): micro-llamada de un turno, snapshot podado ~120 líneas,
output de una línea — céntimos. El coste LLM peligroso es el bucle con contexto reacumulado, no la
llamada puntual. Presupuesto default 3; agotado → open_questions. 6 rescates en un guion no es un
problema de coste, es la señal de que el FD habla otro idioma que la app — hallazgo, no gasto.

## 10. Invariantes (reglas duras del kernel)

1. El kernel es prompt-free. Determinismo: dos runs sobre el mismo DOM = mismo dom-map módulo
   timestamps.
2. Ambiguo ≠ adivinable. `.first()` solo sobre locators de rescate ya verificados (v1).
3. `force` no existe.
4. Toda propuesta externa (rescate, alias) se verifica contra el DOM antes de ejecutarse.
5. Compliance pre-flight fuera y antes del walker, sin override (v1). El walker asume URL validada.
6. Todo estado en archivos; todo evento relevante al audit-log.
7. Exit codes: 0 ok · 1 error · 42 rescate pendiente (contrato con el orquestador, estable).
8. El kernel no conoce clientes. Conocimiento de cliente = pack (código en puertos) o datos
   (contract, aliases, plantillas, lecciones).
9. Datos sintéticos solo del contract (`$fixtures.*`); ref irresoluble = error, nunca inventar (v1).

## 11. Empaquetado y distribución

- `@inetum/qa-walk` (kernel) + `@inetum/qa-walk-pack-<cliente>`: paquetes npm en registry privado
  (Nexus/Artifactory). Kernel con semver; el pack pinnea rango de kernel.
- El pack se desarrolla como cualquier librería: tests (vitest; los puertos son unit-testeables sin
  navegador — patrón walk-core), changelog, PR review para lecciones y aliases masivos.
- Los adaptadores de plataforma (`.claude/agents/`, `.github/agents/`, prompt files) quedan FUERA del
  kernel — capa fina aparte, generada de fuente única (patrón `build:template` → `build:agents`).
- Prueba de despliegue honesta: repo limpio en la máquina de otro ingeniero corre contra el cliente
  sin el autor delante. Si no, es demo, no harness.

## 12. Fuera de alcance / diferido

- Motor de planificación sobre site-model (MBT). Decisión con dato tras 3-4 apps.
- Apps sin DOM caminable (canvas, Flash, Citrix, terminales embebidos). Se declara de entrada.
- MFA interactivo (prerrequisito, §7).
- Selectores posicionales/layout (`nth`, `right-of`) como estrategia general: prohibidos.
- La medición Fase B (créditos Copilot) es carril aparte y **antecede a invertir** en este kernel:
  sin números de créditos no hay caso de negocio que presentar.

## 13. Fases de implementación

| Fase | Contenido | Gate |
|---|---|---|
| **K0 — cierres sobre v1** (baratos, valor inmediato) — **IMPLEMENTADO 2026-07-31**, rama `design/kernel-v2` | normalizador en la escalera; `expect_*` en walk-script + refiner; captura de business_text + diálogo como sub-pantalla; frame_path → frameLocator en scaffolder; promoción condicional de rescates a aliases (persistencia, dejar de borrar el estado); **+ `MF-postcondition` en pre-review** (K0.7) y **etapa `gate` + refiner emitiendo el guion** (K0.8) | re-run SauceDemo lean: 3/3 verdes Y el caso checkout asertando "Thank you for your order!"; walk onesait CP001 completo con business_text capturado |

### Estado de K0 (implementado y validado en vivo, 2026-07-31)

Todo lo de abajo corre a **$0 tokens**. Lo único pendiente del gate es el run del Writer (~$1,6 de
Sonnet), que lo ejecuta el QA.

| Pieza | Evidencia |
|---|---|
| K0.1 normalizador | `normalizeText` + `accentInsensitivePattern` + `normalizedPlan`; segunda pasada de la escalera con regex accent-insensitive. Unit: casos onesait reales ("GESTIÓN", "Simulación/Declaración Rescates") |
| K0.2 `expect_text` / `expect_state` | Ejecutados por el walker; fallo → `open_questions` con prefijo `drift:` y SIN rescate (es hallazgo, no problema de locator). Éxito → el texto se registra como `business_text` con locator verificado en vivo |
| K0.3 business_text + diálogos | Captura de `heading`/`alert`/`status` + h1-h3; `role=dialog` abierto → sub-pantalla `<screen>-dialog` con elementos scoped. Live: `"Thank you for your order!"` capturado con `getByTestId('complete-header')` |
| K0.4 frameLocator | `frame_path` sobrevive el adapter; el scaffolder emite `page.frameLocator(...)` encadenado por segmento. Gap "el dato viajaba y se perdía al materializar" cerrado |
| K0.5 aliases persistentes | `config/hint-aliases/<site>.json`; lookup como primer peldaño; promoción **solo** con postcondición confirmada. **Ciclo completo validado**: hint fabricado → exit 42 → rescate → alias promovido → run posterior resuelve por `alias-hit` con 0 rescates |
| K0.7 `MF-postcondition` | pre-review con `--discovery-report`: si el discovery trae texto de resultado verificado y el spec no lo asserta → must-fix. **Validado contra el discovery real**: el spec que cierra sobre `backToProducts` sale con el must-fix, el que asserta el texto sale limpio. Cableado en lean-run, run-s4-mecanico y run-heal-mecanico (sanar no puede degradar el assert a chrome) |
| K0.8 refiner → guion | Etapa `gate` (compliance aislado antes de gastar LLM, exit 2 verificado); el refiner emite `walk-script.json` además de `cases.json`; `prepare` prefiere el guion del refiner sobre el fixture y lo declara en `walk_source`. **Drift FD↔app validado en vivo**: un `expect_text` que el FD afirma y la app no muestra sale como `fd_drift` en el Acto 2, a $0, antes de generar un solo spec |
| K0.10 modo asistido | `--assist`: overlay Record en shadow root cerrado, puente `exposeFunction`, acción `hover` nueva en el vocabulario, parche verificado por replay a `assist-patch.json`, audit `source: 'human'`. Refactor de la extracción in-page a fragmento compartido capture↔assist (si divergen, el locator del picker no coincide con el del dom-map: bug silencioso) — **probado neutro** comparando dom-maps con y sin refactor. Fixture `hover-menu.html` que reproduce el fallo de onesait (`Timeout 10000ms exceeded` con el elemento en el DOM): **sin** paso `hover` el walker se bloquea igual que en el cliente, **con** él hace 3/3 y captura el `business_text` |
| K0.12 espacios en la puntuación + **corrección de un hallazgo falso** | El normalizador plegaba acentos y espacios repetidos pero NO espacios *insertados* alrededor de la puntuación: el FD escribe `Rescates/Reinversión`, el menú de la app muestra `RESCATES / REINVERSIÓN`. `normalizeText` y `accentInsensitivePattern` los toleran (`\s*` alrededor de `/ - \| · , ; :`), y `aliasKey` los unifica. **Se retracta el "drift del FD" afirmado en K0.11**: el camino del FD (`GESTIÓN > Rescates/Reinversión > Simulación/Declaración Rescates`) era correcto de arriba abajo — el item de nivel 3 se llama EXACTAMENTE así. El error fue de lectura del árbol ARIA: `RESCATES / REINVERSIÓN` y `SIMULACIÓN RESCATES` aparecen con la misma indentación y los interpreté como sección+item cuando son **hermanos de nivel 2**, cada uno con su propio nivel 3. El guion clicaba la rama equivocada. Lección: la indentación del ariaSnapshot no basta para inferir jerarquía de menú — hace falta abrir cada nivel y listar lo visible |
| K0.11 escalera + UX del panel | Tiers `semantic/scoped/anchored/css/indexed` con fragilidad propagada; grammar de cadena `A >> B >> C` + `.nth(N)`; extracción in-page ampliada (ancla, texto vecino, nth, juicio de id generado); disparo en `action_failed` con el `via` en el motivo; panel con pausa/limpiar/borrar/objetivo/comprobación/resaltado y aviso de fragilidad EN VIVO; minimización por replay. **Fixture `form-sin-identidad.html`** (campo sin name/label/test-id con ids `j_id…`, patrón label-en-celda): el candidato `anchored` resuelve **único** contra DOM real y **discrimina entre campos hermanos** — el fallo de onesait s7 muerto con test |
| K0.9 tolerancia al BOM | `parseJsonLoose` en los 4 puntos donde el walker lee JSON ajeno (walk-script del refiner, rescue-response del rescate, hint-aliases del pack, walk-state). **Bug encontrado montando el workspace de prueba**: `Set-Content -Encoding utf8` de PowerShell 5.1 escribe BOM, `JSON.parse` moría, y la excepción escapaba a `run()` disfrazada de `"fallo de ejecución: Unexpected token"` — el paso quedaba bloqueado sin señalar la causa. Importa porque esos ficheros los escribe un **subagente en Windows**. `consumeRescueResponse` además ya no deja escapar la excepción: descarta el fichero con motivo explícito en el audit-log |

Red estructural: 344/344 unit, tsc limpio, healthcheck 26/26, determinismo del dom-map `true`,
template propagado. **Reproducible en un workspace limpio**: manual verificado paso a paso en
[`docs/tasks/probar-kernel-v2-k0.md`](tasks/probar-kernel-v2-k0.md) (clon del branch, 26/26 + 309/309
+ walk live + ciclo de aliases + drift + MF-postcondition, todo a $0).

**Doctrina que K0 fija** (aplica a K1-K3): el hint del refiner es una **hipótesis falsable** —
derivarlo del vocabulario del FD es su trabajo, porque el walker lo verifica y la escalera absorbe
el error. Lo prohibido es afirmar un resultado que el FD no afirma: un `then` `[AMBIGUO]` **nunca**
produce `expect_text`.
| **K1 — kernel + puertos** | extracción a paquete; registry de resolvers/widgets(YAML nivel 1)/enrichers/session; clasificador de fallos; retry-clasificado + perfil de entorno; macros `use:` | regresión: SauceDemo y OrangeHRM idénticos a v1 (0 rescates); fixture de familia con widget YAML resuelto |
| **K2 — pack onesait** | session provider nace (Kerberos), widgets del DS reales, enrichers de banners, plantillas login/nav-modulo, glosario; site-model acumulativo | walk de 2 apps onesait de la misma familia: la segunda sin tocar código del pack, ≤1 rescate |
| **K3 — memoria y drift** | lessons candidatas + curación; fingerprints + informe de drift entre runs; informe de flakiness | corrida repetida en PRE con informe de flakiness clasificado |

Orden respecto a los otros carriles: Fase B (medición Copilot) primero; gate de terminal + healthcheck
de garantías de plataforma en paralelo a K0 (son del harness de plataforma, no del kernel).

## 14. Matriz de validación (público antes de corporativo)

El kernel llega a K2 **ya probado**; K2 valida el pack y las condiciones de red del cliente, no el
kernel. Contracts de todos los sitios públicos ya en `config/style-contracts/`.

| Target | Qué valida | Gate |
|---|---|---|
| **SauceDemo** | Regresión baseline (escalera con test-ids, walk lean 16/16). Lo nuevo de K0: `business_text` capturado + `expect_text` asertando "Thank you for your order!" — la clase de gap semántico medida dos veces en Fase A muere aquí o no muere | K0 |
| **OrangeHRM** | SPA con login form: peldaños role/label (sin test-ids), `strategy: persist`, primer settle signal real (spinners), regresión H1 (7/7, 0 rescates — no puede empeorar) | K0/K1 |
| **ParaBank** | Proxy de familia legacy: server-rendered, navegación por links, forms clásicos. Lo más cercano público a JSF corporativo | K1 |
| **practicesoftwaretesting / expandtesting** | Timing (datos con retardo vía JS sin recarga — caso "el servicio tardó 3s"), widgets custom para las primeras recetas YAML | K1 |
| **Fixtures con inyección de caos** (route interception local) | Cobertura del clasificador §6 SIN esperar a PRE: abort→retry pasa (`flaky_environment`), respuesta 500 (`app_error`), retardo 5s (settle + timeouts de perfil), **borrado de cookies a mitad de flujo** (`session_expired` → prólogo → continúa del checkpoint) | K1 |
| Fixture iframe local (H1) | Regresión frame_path + gap frameLocator del scaffolder cerrado | K0 |

**Solo validable en el cliente** (se declara en la propuesta, no se simula): Kerberos/Nace real (el
flag `--auth-server-allowlist` y la coreografía se escriben antes, se prueban allí), proxy/PAC
corporativo real con sus `NO_PROXY`, y el caos genuino de su PRE (la inyección local cubre el
clasificador, no reemplaza la medición del entorno real).
