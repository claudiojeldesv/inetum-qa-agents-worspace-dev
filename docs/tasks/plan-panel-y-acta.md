# Plan — el panel decide, y la decisión queda firmada

**Que el QA pueda adaptar el plan de pruebas a la realidad de la aplicación, en el momento y sin
perder trabajo, y que cada decisión suya quede con su autor y su evidencia.**

**Origen**: sesión del 2026-08-24. El producto detecta el drift entre el FD y la aplicación, lo
escribe en un informe y ahí muere: no hay camino de vuelta desde «el QA mira el drift y decide que la
app tiene razón» hacia el plan. En un entorno corporativo cambiante eso convierte al agente en un
muro, y a un muro se le pasa por el lado — el QA edita el FD o los tests a mano, por fuera de la
herramienta, y la herramienta deja de servir.

**Estado**: diseño cerrado con el QA, maquetas auditadas contra el código
([auditoria-maquetas-panel.md](../findings/auditoria-maquetas-panel.md)). **P0 y P1 cerrados el
2026-08-24. P2 y P5 (fases A y B) cerrados el 2026-08-28.** Quedan P6, P3 y P4, en ese orden.

---

## 1. Decisiones ya tomadas — no volver a discutirlas

Cerradas con el QA en la sesión. Quien ejecute este plan las hereda:

1. **El agente nunca decide cuál es el oráculo; el QA sí.** El trabajo del agente es que esa decisión
   sea barata, visible y reversible — no arbitrarla.
2. **Se bloquean las invenciones del agente, nunca las decisiones del QA.** Que el agente se niegue a
   fabricar un test para un flujo que no existe está bien. Que se niegue a que el QA declare que la
   app tiene razón, no. Hoy el producto confunde las dos.
3. **La aprobación NO exige verificación en limpio.** Exige evidencia, y la evidencia tiene grado. Con
   una póliza que se quema no se puede reproducir desde cero, y eso no puede ser un muro.
4. **El panel tiene dos posturas**, no una: compacta mientras señalas la aplicación, desplegada
   mientras lees el caso. Se excluyen por naturaleza.
5. **En el panel el caso se VE y se toca el paso en curso.** Editar el caso entero a gusto pide una
   ventana propia: un editor flotando sobre la aplicación bajo prueba es un producto más grande y un
   editor peor.
6. **El agente que revisa los cambios presenta, nunca filtra.** Puede agrupar y ordenar; ocultar, no.
   Si juzga «este cambio es equivalente, no hace falta preguntar», hemos reintroducido un agente
   afirmando.
7. **El diff siempre contra el FD original, nunca contra la grabación anterior.** Si cada sesión se
   compara con la anterior, el plan se aleja sin que nadie vea la distancia total.
8. **Coreografía y oráculo no pesan igual.** Añadir un paso es *cómo se llega*; cambiar un resultado
   esperado es *qué significa correcto*. Lo primero se acepta en bloque, lo segundo uno a uno.
9. **Los locators no llegan al QA.** Un locator es fontanería del test, no un hecho sobre el FD. Solo
   se le molesta si el cambio significa que el *elemento* es otro. Una confirmación que avisa de todo
   se acaba clicando sin leer, y entonces la firma no vale nada.
10. **El hash es evidencia de manipulación, no no-repudio.** Quien tenga permiso de escritura puede
    recalcularlo. Lo que sí se garantiza mecánicamente: el plan no se modifica sin una decisión con
    hash coherente detrás.

## 2. Fases

### P0 — Prerrequisitos · CERRADO el 2026-08-24

**D10 y D23**: lo grabado por el QA sobrevive al panel y al proceso (puente `__qaAssistTrack`,
persistencia en `assist-pending.json`, recuperación con tres cerrojos de identidad). Commit `0491701`,
verificado en campo. **Todo lo demás de este plan se apoya en esto**: sin supervivencia de lo grabado,
la vía en caliente no vale nada.

**La pasada de textos, cerrada el 2026-08-24.** El panel ya no dice «El FD dice: click sobre texto
"X"» —que además era falso desde que el texto lo produce el diagnóstico y no el FD— sino qué no
cuadra y qué se le pide al QA. El aviso del paso que muta también dejó de nombrar `retry_safe`.
Hay un test que falla si cualquier mensaje del panel contiene jerga del motor.

**Decisión sobre los `console.error` de `assistResolve`**: se quedan como están, a propósito. No los
lee el QA en el panel: los lee quien lanzó el run, en su terminal. La lección de D10/D12 fue que
esos mensajes tienen que ser explícitos y accionables («PANEL ABIERTO… el walker está BLOQUEADO…
escrito assist-pending.json»); suavizarlos para que suenen menos técnicos los empeoraría para su
único destinatario.

### P1 — El acta de decisiones · CERRADO el 2026-08-24

Implementado en [`src/decisions.ts`](../../src/decisions.ts) (núcleo),
[`src/scripts/record-decision.ts`](../../src/scripts/record-decision.ts) (registro, `npm run qa:decide`) y
[`src/scripts/check-decisions.ts`](../../src/scripts/check-decisions.ts) (validador, `npm run qa:decisions`).
Schema y operativa: [decisions-schema.md](../references/decisions-schema.md). 28 tests en
`tests/unit/decisions.test.ts`; el validador entra en el healthcheck (32 → 36 comprobaciones)
**verificando la cadena de verdad**, no la presencia del fichero.

Lo medido, no solo escrito:

- Los dos pares falsables del plan, corridos contra los scripts reales: tres decisiones sembradas,
  alterada la del medio a mano → señalada **la del medio y solo ella**, con su `rf`, su actor y los dos
  hashes; y una decisión sin `actor` → exit 2. El healthcheck, verde con acta sana y rojo con acta
  manipulada, nombrando la entrada.
- **Dos cosas que el plan no pedía y el diseño exigía**: `appendDecision` se **niega** a escribir sobre
  una cadena rota (encadenar encima sella la manipulación y la vuelve indistinguible de una decisión
  legítima), y cada decisión queda **anclada en el audit-log** (`rule: "decision-recorded"`). El ancla
  es lo único que caza la **cola truncada**: borrar las últimas N entradas siempre deja una cadena
  válida. Hay un test en verde que documenta ese límite en vez de taparlo, y el validador lo dice por
  pantalla cuando corre sin `--audit`.
- El fichero de pendientes se reescribe **después de cada firma**, no al final: si el proceso muere a
  mitad, lo firmado no se vuelve a firmar. Y el `actor` del pendiente manda sobre el de la consola —
  no se reasigna autoría.

Diseño original, para referencia:

`config/decisions/<site>.jsonl`, append-only, durable como los hint-aliases (`config/` sobrevive a la
limpieza de `.work/`). Una entrada por decisión:

```
{ rf, paso, decision: 'app' | 'fd' | 'defer',
  valor_nuevo?, fd_hash, script_hash, evidencia: 'desde-cero'|'en-vivo'|'sin-verificar',
  actor, timestamp, supersedes?, hash }
```

- `hash` = sha256 de todo lo anterior **más el hash de la entrada previa** → cadena. Alterar o borrar
  una decisión vieja rompe la cadena.
- Validador `src/scripts/check-decisions.ts` que recomputa la cadena; entra en el healthcheck.
- `actor` sale de una variable declarada. **Si no hay actor, no hay decisión** (fail-closed).
- Revisable: `supersedes` apunta a la entrada anterior; manda la última, la traza queda.
- Reutilizar `hashScript` de `copilot/src/walk-core.ts`.
  **Desviación al implementar, deliberada**: no se importa. `src/` es la capa baja —
  `copilot/src/dom-walker.ts` importa de `src/`, no al revés— y meter la dependencia inversa por
  una línea de crypto ataría el validador al walker entero. `hashJson` de `src/decisions.ts` usa el
  MISMO algoritmo, y un test de acoplamiento (`hashJson(script) === hashScript(script)`) pone la
  suite roja si alguna de las dos deriva.

**Comprobación falsable**: sembrar tres decisiones, alterar la del medio a mano, el validador la
señala. Y una decisión sin `actor` se rechaza.

**Registro por flags o fichero de pendientes, NUNCA JSON en línea** (D32: PowerShell 5.1 lo destroza).

### P2 — La pantalla de discrepancia con candidatos · CERRADO el 2026-08-28

**Cerrado con la fase B del plan de fusión**, que era la otra mitad del mismo agujero: los
tres botones de veredicto no servían de nada mientras una postcondición incumplida no
abriera panel, y el disparador no servía de nada sin botones que decidieran.

Ya está lo que faltaba: los tres veredictos (`app` / `fd` / `defer`) firman en el acta de
P1 sin pasar por consola, la salida **«ninguno de estos, lo señalo yo»** toma el literal de
un texto pulsado en la página, y los tres continúan el run. El panel es otro
(`verdictOverlayScript`) y no un modo del de asistencia: allí el QA demuestra un camino
para construir un locator, aquí dicta quién tiene razón — no hay secuencia que grabar.

Tres cosas que el diseño exigió y el plan no pedía:

- **Fail-closed en la puerta.** Sin actor, sin FD o con un `rf` ambiguo, el panel **no se
  abre** y se dice por qué. Pedirle un veredicto a una persona para descubrir después que
  no se puede firmar tira su trabajo y pierde la decisión en silencio.
- **El rechazo devuelve el panel, no firma humo.** Un «la aplicación tiene razón» que no
  dice QUÉ dice la aplicación no es una decisión: la fase C no tendría con qué sustituir el
  criterio. `veredictoADecision` es el único juez y el panel se reinyecta con el motivo
  delante — duplicar la regla dentro de la página para «avisar antes» sería otra D2.
- **Un veredicto `app` NO pinta el paso de verde.** Lo que se midió es que el texto del FD
  no está; que el QA adopte otro literal cambia el criterio del PRÓXIMO run, no lo medido
  en éste. Hay un test dedicado a ello, porque es lo más fácil de estropear con buena
  intención.

**Sigue pendiente el criterio de muerte**: medir si los candidatos salen ruidosos en apps
reales. D59 podó 8 → 1 en un caso montando el ejercicio de OrangeHRM, pero eso es una
anécdota, no la medición.

Estado anterior, para referencia:

#### MEDIO HECHO el 2026-08-24

Adelantado al cerrar D27, porque era la misma causa: el panel no sabía lo que el walker ya sabía.
**Ya está**: la causa se mide contra la página antes de abrir el panel y se distinguen cuatro
(ausente / ambiguo / único-pero-falla / resultado-ausente); los candidatos salen rankeados por
`candidatosParaInforme`, la misma función que el informe de G3 —movida a `src/locator-candidates.ts`
para que la compartan—; y la regla dura de «si no hay candidatos, eso ES información» está puesta y
probada. Los candidatos se leen **en vivo**, no del dom-map: cuando un paso se planta la pantalla
puede no estar capturada todavía, y un candidato rancio es peor que ninguno.

**Faltaba entonces**: los tres botones de veredicto y la salida «ninguno de estos, lo señalo yo».
Cerrado el 2026-08-28 con la fase B, arriba.

Diseño original:

Cuando un `expect_text` no se cumple, el panel se abre (hoy **no** se abre en `postcondition_unmet`:
solo en hint irresoluble y acción fallida — eso hay que ampliarlo) y muestra:

- *el plan esperaba «X» · no aparece* — exacto, ya se sabe.
- **Candidatos**: los `business_text` de esa pantalla (`heading`/`alert`/`status`/`text`), que ya
  distinguen resultado de mueble. El menú, el pie y las cookies quedan fuera por construcción.
- Ordenados por palabras compartidas con lo esperado: reutilizar `candidatosParaInforme` de
  `src/scripts/verify-locators.ts` (escrita para G3; mismo problema un nivel arriba).
- Salida *«ninguno de estos, lo señalo yo»* → reutiliza la captura de clics que ya funciona.
- Tres botones: *la aplicación tiene razón* / *es un defecto* / *luego*. Los tres continúan el run.

**Dos reglas duras**: si no hay candidatos, **eso es información** (la app no muestra nada → empuja a
*es un defecto*). Y **nunca se juzgan negaciones** (K0.37: «(0) No Records Found» contiene «Records
Found» y dio verde en campo).

**Comprobación falsable**: un fixture donde el texto esperado no está y hay tres textos de resultado
→ salen los tres, ordenados, y el menú NO sale. Otro donde no hay ninguno → lista vacía.

### P3 — Posturas del panel

Colapsar a barra de una línea (con atajo, y recordando posición y estado por sitio), modo fantasma
(baja opacidad y deja de capturar eventos), y la **tira de pasos**: los N pasos del caso como marcas
—hecho / aquí / pendiente / no cuadra— a partir de `WalkState.completed`, `open_questions` y
`step_reports`, que ya existen.

Revisar la colisión de `Escape`: el QA lo usa para cerrar modales de la app y el manejador de cookies
también lo pulsa. **`Escape` no puede cerrar el panel ni perder nada.**

Higiene que evita una vergüenza en demo: **medir** si el panel contamina el scan de accesibilidad
(axe atraviesa shadow DOM por defecto; el shadow cerrado protege de los locators, no necesariamente de
axe). Medirlo antes de afirmar que está limpio.

### P4 — La postura de caso completo

Los pasos del caso con su resultado esperado **solo en los que llevan un `expect_*`** (los de acción
no tienen nada que comprobar), su procedencia y la línea del FD (`criteria.json` ya lleva
`source_ref: "fichero.md:12-18"`, trazabilidad obligatoria).

Al desplegar, el panel crece. Es correcto que tape la aplicación: en esa postura no se está señalando
nada en ella.

**Lo que NO entra**: reordenar y editar cualquier paso desde aquí (decisión 5).

### P5 — La pantalla de aprobación · FASES A y B CERRADAS el 2026-08-28

Plan propio y detallado en el fichero de plan de la sesión; lo entregado:

- **Fase A** — el núcleo de fusión (`copilot/src/walk-merge.ts`) y la aprobación
  (`copilot/src/merge-assist-patch.ts`). Cambios agrupados por peso, grado de evidencia por decisión,
  el original anclado en `config/baselines/`, y los cerrojos de escritura ANTES de gastar la atención
  del QA. **Validada en campo**: el mismo caso de OrangeHRM pasó de 10/16 a 15/16 sin `--assist` y
  sin nadie delante ([ciclo-cerrado-panel-a-plan.md](../findings/ciclo-cerrado-panel-a-plan.md)).
- **Fase B** — el disparador que faltaba: un `expect_text` incumplido abre panel de veredicto. Es lo
  que cerró P2 (arriba).

**Falta la fase C**: la propuesta de FD corregido (`<fd>.propuesta.md`), determinista, derivada solo
de decisiones firmadas. Ahora tiene con qué: el acta ya recoge veredictos `app` con su literal.

Diseño original de la pantalla, para referencia:

Los cambios **agrupados por peso**: recorrido en bloque con *aceptar todos*; lo que cambia un
resultado esperado, uno a uno y en grande. Chips de **grado de evidencia** —`desde-cero` /
`en-vivo` / `sin-verificar`— y de origen. Y la **distancia acumulada al FD original**.

El grado de evidencia ya está medio construido: `verifyAssistPatch` degrada a verificación en vivo
cuando el camino previo muta negocio y lo dice en `verify_reason`. Falta subirlo al nivel de la
decisión.

**Verificación aplazada** (el caso de la póliza quemada): al final de la sesión, o verificas en limpio
ahora, o **marcas para verificar en el próximo run con datos frescos**. Esa verificación pendiente
queda anotada y el siguiente run la recoge. La comprobación desde cero no desaparece: se aplaza a
cuando es posible.

**Comprobación falsable**: un caso con 6 cambios de coreografía y 1 de resultado esperado produce dos
grupos, no una lista de 7. Y con 20 de coreografía sigue siendo usable (decidir: listar, paginar o
resumir — pendiente).

### P6 — La etiqueta de oráculo, con dientes

Cada criterio arrastra de dónde salió su oráculo (`fd` | `app` | `captura`), y el test lo **hereda en
su JSDoc**. Y —esto es lo que evita que sea otro D2— **una regla de pre-review lo lee** y el resumen
del run cuenta cuántos criterios están respaldados por la app y no por el FD.

Informa, no impide. Ese recuento es lo que un QA Manager quiere ver, y lo que evita que la suite se
convierta en un espejo de la aplicación sin que nadie lo note.

## 3. Orden y criterios de parada

P0 → ~~P1~~ → ~~P2~~ → ~~P5 (fases A y B)~~ **hechos** → **P6, lo siguiente** → P3 → P4.

P6 se adelanta a P3/P4 porque ya tiene con qué contar: el acta lleva decisiones  reales y
P6 es exactamente el recuento de cuántos criterios están respaldados por la aplicación y no por
el FD. Sin decisiones firmadas era una etiqueta sin dientes; ahora tiene el dato debajo.

P4 va después de P5 a propósito: la pantalla de aprobación **ya es** una vista del caso completo, así
que puede que P4 sobre. Decidirlo con P5 en la mano en vez de construir las dos.

**Criterio de muerte de P2**: si los candidatos salen ruidosos (más de 5-6 por pantalla en apps
reales), la lista no sirve y hay que ir directo a «señálalo tú». Medirlo en Dolibarr y ParaBank antes
de pulir la interfaz.

## 4. Fuera de alcance, explícito

- Editor de casos completo en el panel (decisión 5).
- Traducción del marco del panel: está en castellano cableado. El **contenido** sí es dinámico y su
  idioma lo manda la aplicación — un literal no se traduce nunca porque el test lo busca tal cual.
- No-repudio criptográfico (decisión 10).
- El problema de los **datos consumibles**: es otro plan —
  [plan-datos-consumibles.md](plan-datos-consumibles.md) — y sin él los flujos que queman un dato no
  son repetibles, por mucho panel que haya.

## 5. Maquetas de referencia

**En el repo**: [`docs/demo/panel-ux/`](../demo/panel-ux/) — las siete, autocontenidas, con su
[README](../demo/panel-ux/README.md). Los enlaces de abajo son los Artifacts originales.

Auditadas contra el código; lo que enseñan es viable salvo lo marcado como pendiente de acta.

1. Grabando — https://claude.ai/code/artifact/123dacb3-68c4-4119-bdb9-999b1ded216a
2. Caso completo — https://claude.ai/code/artifact/267e9b32-fe2c-48d2-b05e-88cc2ac3ce0b
3. Discrepancia — https://claude.ai/code/artifact/6e370136-efdc-4f21-9507-19a4ea69b034
4. Aprobación — https://claude.ai/code/artifact/3e8e3836-d9cc-4344-8a2a-1fe493559342
5. Posturas — https://claude.ai/code/artifact/5ab90e14-396c-4f3f-9bef-8f83781dfcb2
6. Recorrido guiado — https://claude.ai/code/artifact/01722b21-89eb-4089-91e9-323dfd3d5708

Fuente local de la maqueta simple: `docs/demo/panel-ux/panel-ux.html` (doble clic).
