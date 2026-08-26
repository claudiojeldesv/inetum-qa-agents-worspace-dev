# Plan — el panel decide, y la decisión queda firmada

**Que el QA pueda adaptar el plan de pruebas a la realidad de la aplicación, en el momento y sin
perder trabajo, y que cada decisión suya quede con su autor y su evidencia.**

**Origen**: sesión del 2026-08-24. El producto detecta el drift entre el FD y la aplicación, lo
escribe en un informe y ahí muere: no hay camino de vuelta desde «el QA mira el drift y decide que la
app tiene razón» hacia el plan. En un entorno corporativo cambiante eso convierte al agente en un
muro, y a un muro se le pasa por el lado — el QA edita el FD o los tests a mano, por fuera de la
herramienta, y la herramienta deja de servir.

**Estado**: diseño cerrado con el QA, maquetas auditadas contra el código
([auditoria-maquetas-panel.md](../findings/auditoria-maquetas-panel.md)). No implementado salvo P0.

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

Queda de P0: **pasada de textos del panel**. Los mensajes visibles usan vocabulario del motor
(«hint irresoluble», «drift»). Deben usar el del QA («no encuentro este elemento», «no cuadra»).
Fichero: `assistOverlayScript` en `copilot/src/dom-walker.ts` y los `console.error` de `assistResolve`.

### P1 — El acta de decisiones (la base: todo lo demás escribe aquí)

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

**Comprobación falsable**: sembrar tres decisiones, alterar la del medio a mano, el validador la
señala. Y una decisión sin `actor` se rechaza.

**Registro por flags o fichero de pendientes, NUNCA JSON en línea** (D32: PowerShell 5.1 lo destroza).

### P2 — La pantalla de discrepancia con candidatos

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

### P5 — La pantalla de aprobación

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

P0 (falta la pasada de textos) → **P1 primero, porque todo escribe en el acta** → P2 (la pantalla que
más valor da y la que el QA pidió) → P3 → P5 → P4 → P6.

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
