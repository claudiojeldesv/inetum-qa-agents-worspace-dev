# Plan — el example completo de Restful Booker

**Una carpeta que cualquier usuario del producto puede recorrer para ver TODAS las puertas de entrada
funcionando sobre un mismo sitio real: setup, S4, S3, S2, y el ciclo del walker con panel y con rescate
IA. Onboarding y demo a la vez.**

**Origen**: pedido del QA el 2026-09-03 — *«dejar una versión que le dé la posibilidad al usuario de
tener un example con las nuevas funcionalidades de qa-automator [...] probemos todas las puertas de
entrada más la del FD con rescate, o semi manual. Que podamos ver el setup y demás»*. Afinado en
entrevista de 4 rondas (§2), con un ajuste del 2026-09-04: el command del rescate — la pieza no probada —
pasa a **spike-puerta** que pruebo yo antes de construir nada más (E-17, §4.1). **Branch**:
`design/example-rbp` (desde `design/kernel-v2`). **Estado**: **ENTREVISTADO — pendiente del visto bueno
del QA antes de implementar**. Pasa por delante de los demás planes abiertos hasta entregarse.

---

## 1. La foto final

`template/examples/06-restful-booker/` ampliada (es la fuente de verdad: `build:template` la preserva,
`field:deploy` la reparte). Al terminar contiene:

```
06-restful-booker/
  README.md                     ← índice con el orden recomendado y qué enseña cada guía
  restful-booker-fd.md          ← ya existe (FD onesait, 10 casos)
  criteria.json                 ← generado del FD con qa:criterios (determinista)
  reservas.feature              ← NUEVO: 3-4 escenarios Gherkin derivados del FD, RF coherentes
  regresion-corta.walk.json     ← NUEVO: 2-3 casos del FD, elegidos con dato (§3.4)
  guias/
    01-setup.md                 ← vivir la entrevista y comparar tu contract con el canónico
    02-autonomous.md            ← S4: solo la URL
    03-spec-refiner.md          ← S3: el FD + la URL
    04-req-driven.md            ← S2: el .feature + la URL
    05-panel.md                 ← walker semi-manual: panel, zonas, veredicto, acta, fusión
    06-rescate.md               ← walker con rescate IA conducido por el command nuevo
```

El usuario lo vive así: `npm run field:deploy -- --site=restful-booker --dest=<ruta>` → abre el README
→ recorre las guías en orden (cada una también funciona suelta). Comandos en PowerShell, textos de los
paneles copiados de la pantalla real (lección D81), sin mención de coste en tokens.

## 2. Las decisiones congeladas (entrevista 2026-09-03, 4 rondas)

Se escriben con su motivo para no re-litigarlas.

| # | Decisión | Motivo |
|---|---|---|
| E-1 | Destinatario doble: onboarding del QA que recibe el producto **y** demo para enseñar | una sola pieza, más pulido en los textos |
| E-2 | Sitio: **Restful Booker** (automationintesting.online) | ya tiene FD de 10 casos, contract, receta, criteria y línea base; cara pública sin login + admin con login (enseña el auth del setup); CP010 pisa un defecto real → el veredicto brilla |
| E-3 | Forma: **carpeta `examples/` del template**, modular — una guía por puerta con README índice | el usuario del plugin lo recibe; cada guía usable suelta |
| E-4 | Alcance: setup + S4 + S3 + S2 + walker panel + walker rescate. **S1 fuera** (ni como stub visible) | decisión del QA en ronda 1 |
| E-5 | S2: `.feature` **corto derivado del FD** (3-4 escenarios, mismos flujos, RF-NNN coherentes) | comparabilidad entre puertas sin pagar 10 specs |
| E-6 | Rescate IA: **se vive en vivo**, sin artefactos pregrabados | es el producto real |
| E-7 | Las guías **no hablan de coste** (tokens/minutos) | decisión del QA en ronda 2 |
| E-8 | Setup: el usuario **vive la entrevista** y compara su contract con el canónico (`qa:config`) | formativo; el canónico queda como red |
| E-9 | Entrega: **template + repo listos**. El build del plugin NO es parte de este plan | «versión» en sentido de material verificado, no de release |
| E-10 | Walker semi-manual: **2-3 casos del FD real** (~15-20 min de pantalla), no la regresión de 111 pasos | los 111 no enseñan nada nuevo tras el tercer panel |
| E-11 | Estructura: **ampliar `06-restful-booker`**, no carpeta nueva | un sitio, una carpeta; el FD ya vive ahí |
| E-12 | **Verificado por mí primero**: despliego un workspace limpio y recorro cada guía de verdad antes de entregarlo | lección D81 — los textos salen de lo que se ve, no de memoria |
| E-13 | Orden: **setup → S4 → S3 → S2 → panel → rescate** | de menos material a más; la puerta «solo URL» impresiona sin preparar nada |
| E-14 | Fechas que se queman: **automático + explicado** — ventana propia por run donde el material lo permita, y la guía explica el porqué | el dato que se quema es lección de QA real, no estorbo a esconder |
| E-15 | El run con rescate lo conduce un **command dedicado** (pieza nueva de producto), no un prompt canónico | decisión del QA en ronda 4 — menos fricción, más producto |
| E-16 | **Branch propio, va primero**: `design/example-rbp`; los demás planes abiertos esperan | decisión del QA en ronda 4 |
| E-17 | El command del rescate **se prueba primero y lo pruebo yo** (spike-puerta, §4.1): nada más se construye hasta que se sostenga | ajuste del QA del 2026-09-04 — «el command no está probado y lo vamos a dejar probado» |

## 3. El material, pieza a pieza

### 3.1 Lo que ya existe y se reusa tal cual

- **FD** `restful-booker-fd.md` (10 casos onesait) — solo se toca para el mecanismo de fechas (§3.5).
- **Contract canónico** `config/style-contracts/restful-booker.yaml` (viaja en el template).
- **Receta de campo** `config/field-sites/restful-booker.yaml` y el sello `FIELD.json`.
- **Regresión completa** `docs/demo/restful-booker-regresion.walk.json` — referencia, no protagonista.

### 3.2 `criteria.json` — generado, no escrito

`npm run qa:criterios` sobre el FD (parser determinista, `src/fd-to-criteria.ts`). Con él, el panel de
las guías 05/06 enseña `CPxx · restful-booker-fd.md:NN-NN` y el resultado esperado en palabras del FD.
Se commitea generado Y la guía enseña el comando que lo regenera.

### 3.3 `reservas.feature` — el material de S2

3-4 escenarios derivados de casos del FD (candidatos: CP001 reserva pública, CP008 mensaje de contacto,
un Scenario Outline sobre datos inválidos). Los `# RF-NNN` apuntan a los mismos criterios que el FD →
la trazabilidad se ve cruzar puertas. Pasa por `check-walk-script`-equivalente de S2 (el parser
`gherkin-to-criteria.ts`) antes de darse por bueno.

### 3.4 `regresion-corta.walk.json` — los 2-3 casos, elegidos con dato

No se eligen por gusto: el censo ya dice qué pasos de RBP bloquean y por qué (39 bloqueos: 6 `panel`,
3 `rescate`, 13 `drift`...). Criterio de selección: que entre los 2-3 casos salgan **al menos** un
`ambiguo` (los tres «Book now» → zonas D90), un renombrado (inventario), y un veredicto de
postcondición (CP010, el defecto real del sitio, donde «el FD tiene razón» es la respuesta correcta).
La selección exacta se hace en F2 leyendo el dom-map sellado, y se documenta en el propio walk-script
(campo `note` por caso: qué función del panel enseña).

### 3.5 Fechas por run — mecanismo mínimo determinista (NUEVO)

Hoy los `value` del walk-script son literales y las fechas de reserva de RBP son estado persistente:
un re-run choca (409). Mecanismo mínimo:

- Token `{{hoy+N}}` (opcional `{{hoy+N:DD/MM/YYYY}}`) en `value` de los walk-scripts, resuelto **al
  cargar el guion** por una función pura en `walk-core` (testeable sin navegador, cero LLM, cero red).
- El FD lo declara en su nota de datos («cada run usa su ventana propia») — la parte «explicado» de E-14.
- **No entra nada más**: pools, reservas de datos y objetos que se queman siguen siendo el
  [plan-datos-consumibles](plan-datos-consumibles.md). Esto es solo aritmética de calendario.

Riesgo asumido: dos usuarios recorriendo el example el mismo día pueden chocar igualmente (la ventana
sale de la fecha, no de un lock). La guía lo dice y enseña la salida (cambiar el offset).

### 3.6 El command nuevo: `/qa-automator:regression` (nombre propuesto)

La pieza de producto de E-15. Orquesta el run del walker con rescate de punta a punta:

1. Pre-flight de compliance (regla dura #3, sin override) y `qa:config` del contract.
2. Declara el canal (`rescue-channel.json`) y lanza el walker en background con `--rescue-budget` — el
   walker **espera en el sitio** (Fase 2 del rescate, ya medida: EspoCRM 84/89, cero relanzamientos).
3. Vigila `rescue-request.json` y contesta como **respondedor directo** (el protocolo que ya se condujo
   a mano en campo; el CLI como respondedor se midió y se descartó — empate en tokens, 34% más lento).
4. Al terminar: epílogo, `assist_patch`/parche con el comando de revisión relleno, acta (`check-decisions`).

Reglas que lo gobiernan: #2 (el command orquesta vía Task tool, subagents no se invocan entre sí),
#5 (handoff por ficheros: el walker sigue sin hablar con ningún LLM). Con tests: el protocolo del
respondedor tiene lógica citable (cuándo declina, cuándo verifica contra DOM vivo) que no puede vivir
solo en prosa del command.

**Decisión menor que asumo** (cámbiala si no te gusta): el nombre `regression`, en línea con los
commands existentes en inglés (`autonomous`, `heal`, `report`). Alternativas: `walk`, `run`.

### 3.7 Las seis guías

Estilo del `GUIA.md` del ensayo del panel, que ya está validado en campo: qué vas a ver **antes** de
verlo, comandos PowerShell copiables (`npx.cmd`/`npm.cmd`, sin `&&`, sin `rm`), los textos del panel
literales, una tabla «qué mirar con lupa» al final. Cada guía abre diciendo qué enseña y qué NO
(p. ej. 02-autonomous: «esto genera specs; el walker de las guías 05-06 es otra cosa»).

| Guía | Qué vive el usuario | Verificación de que salió bien |
|---|---|---|
| 01-setup | la entrevista `/qa-automator:setup` contra RBP; compara su contract con el canónico vía `qa:config` | los dos contracts validan; las diferencias son de preferencia, no de esquema |
| 02-autonomous | S4 con solo la URL: los 5 actos, specs generados, reporte | suite verde o rojos explicados; showcase abre |
| 03-spec-refiner | S3 con el FD: criteria RF-NNN, drift FD↔app señalado | el drift de CP010 aparece como drift, no como fallo |
| 04-req-driven | S2 con `reservas.feature`: trazabilidad RF en los specs | los RF del .feature aparecen citados en los specs |
| 05-panel | `regresion-corta` con `--assist`, presupuesto 0: zonas, inventario, comprobación de texto, veredicto firmado, fusión aprobada | acta coherente (`check-decisions`), alias durable donde toca, `[SE PIERDE]` donde toca |
| 06-rescate | el mismo guion conducido por `/qa-automator:regression`: el walker pausa, la IA contesta, sigue | cero relanzamientos; el epílogo separa lo resuelto por IA de lo que pide QA |

## 4. Fases

```
F0  branch design/example-rbp + inventario de 06 y docs/demo (qué se reusa, qué estorba)
F1  EL SPIKE DEL COMMAND — LA PUERTA DEL PLAN (§4.1): /qa-automator:regression mínimo,
    probado POR MÍ de punta a punta contra RBP. Si no se sostiene, el plan se
    detiene aquí y E-15 vuelve a la mesa — antes de haber construido nada más
F2  material determinista: criteria.json, reservas.feature, regresion-corta.walk.json
    (casos elegidos con el dom-map sellado), mecanismo {{hoy+N}} con sus tests
F3  verificación puerta a puerta EN WORKSPACE REAL (field:deploy limpio a qa/rbp):
    recorro cada puerta de verdad y ESCRIBO su guía con los textos de la pantalla
    — la guía no existe antes del recorrido (E-12, lección D81)
F4  README índice + pasada de coherencia (mismo vocabulario entre guías, orden E-13)
F5  cierre: suite completa verde, healthcheck del template, STATUS/CLAUDE.md,
    y el estreno: el QA recorre el example entero en su máquina
```

F1 va primero **a propósito**: el command es la pieza con más incógnitas y no depende de nada del
material nuevo — la regresión completa de RBP ya existe como walk-script y el `rescue-wait` del walker
está medido en campo (EspoCRM, cero relanzamientos). Probarlo antes de construir el resto es lo que
convierte el riesgo en dato barato. F3 exige F1 y F2. El estreno del QA (F5) es el criterio de hecho: si
una guía le hace preguntar algo que la guía debía contestar, es defecto de la guía y se anota como D-NN.

### 4.1 El spike del command — qué significa «probado por mí»

Ajuste pedido por el QA el 2026-09-04: el command no está probado y **se entrega probado**; lo pruebo yo
antes de seguir desarrollando (decisión **E-17**). Concretamente:

1. **Workspace real, limpio**: `field:deploy --site=restful-booker` a un destino nuevo.
2. **El command mínimo escrito** y desplegado como lo recibiría el usuario.
3. **Un run de verdad con rescate**: el walker en background con `--rescue-budget` y canal declarado,
   sobre la regresión existente de RBP (no la corta, que aún no existe), y yo conduciéndolo **siguiendo
   el texto del command al pie de la letra** — si tengo que salirme del texto para que funcione, eso es
   un defecto del command, no una licencia.
4. **Medible o no pasó**: peticiones de rescate contestadas, relanzamientos (esperado: cero), y el
   epílogo con parche y acta coherente (`check-decisions`). Los números van a un finding corto.

Lo que el spike NO valida (y queda para F3 con el estreno): la experiencia de un usuario que no soy yo
leyendo la guía 06. **Salida honesta si falla**: el protocolo no cabe en un command → se lo cuento al QA
con el dato y la alternativa de la ronda 4 (prompt canónico en la guía) vuelve como propuesta — la
decisión es suya, no mía.

## 5. Riesgos

- **RBP se reinicia por ventanas** (frontend y microservicios caen unos segundos). Las guías llevan la
  señal («si ves la página en blanco, espera un minuto») — clase `entorno`, no culpar al producto.
- **CP010 revienta el frontend con 409 si el arrange choca** — mitigado por `{{hoy+N}}`, y es a la vez
  la lección de la guía 05: el veredicto correcto es «el FD tiene razón».
- **La entrevista del setup tiene varianza** — la guía 01 no promete un contract idéntico, promete que
  valide y enseña a leer las diferencias.
- **El command nuevo es la pieza con más incógnitas** (nunca hubo command que condujera el rescate; en
  campo lo conduje yo a mano). Mitigado por E-17: es la PRIMERA fase y es una puerta — si el spike
  (§4.1) destapa que el protocolo no cabe en un command, se dice con el dato y se propone la
  alternativa, no se estira (regla #9). El coste hundido en ese caso: F0 y el propio spike, nada más.
- **Verificar S4/S3/S2 cuesta runs reales** con Planner/Generator nativos. Se verifica con los flows
  recortados donde exista el knob, y se dice en el finding qué se corrió exactamente.

## 6. Qué NO entra

- S1 (ni como stub visible) — decisión E-4.
- El build/release del plugin — decisión E-9.
- Coste en tokens dentro de las guías — decisión E-7.
- Artefactos pregrabados del rescate — decisión E-6.
- Pools de datos y objetos de negocio que se queman — sigue en [plan-datos-consumibles](plan-datos-consumibles.md); aquí solo fechas.
- Tocar el walker más allá del token `{{hoy+N}}` al cargar.
