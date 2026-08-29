# El banco de pruebas de paneles — los modales, conducidos a máquina contra el sitio real

**Fecha**: 2026-08-29 · **Branch**: `design/kernel-v2` · **Origen**: pregunta del QA tras la
sesión de campo del panel de veredicto: *«¿hay alguna forma de que tú mismo puedas probar los
modales, y no tenga que ser yo el que deba probarlo?»*

La respuesta honesta obligaba a construir algo: de los cuatro defectos que esa sesión encontró,
tres eran cazables a máquina (el guardián pasándose de ancho, el rechazo sin rastro, las tildes) y
se escaparon porque los paneles solo se conducían contra fixtures propios — HTML escrito por
nosotros, nunca la aplicación de verdad. El cuarto («¿ahora cómo cierro esto?») no lo caza ninguna
máquina, y eso también quedó escrito.

## Qué se construyó

| Pieza | Qué es |
|---|---|
| [`copilot/src/bench-core.ts`](../../copilot/src/bench-core.ts) | Núcleo puro: escenario, validación, evaluación, las guardas |
| [`copilot/src/walk-bench.ts`](../../copilot/src/walk-bench.ts) | El conductor (`npm run qa:bench`): walker en proceso + escenario JSON |
| [`copilot/tests/walk-bench.test.ts`](../../copilot/tests/walk-bench.test.ts) | 8 tests: los pares del evaluador, las guardas medidas, y dos E2E donde el banco conduce el fixture por el canal de producción |

El banco arranca el `DomWalker` real, vigila `assist-pending.json` (el mismo marcador que le dice a
una persona «te espera») y despacha sobre el host del panel los mismos `qa-assist-cmd` que pulsaría
el QA: `{choose:N}`, `app`, `pick` + clic en la página, `record`/`stop`, `mover_panel`. Al terminar
compara acta, outcomes y motivos con lo que el escenario declara, y escribe `bench-report.json`.
Exit 2 si algo no cuadra.

**Dos modos**, porque leer el panel cambia el aislamiento: con `--abrir-panel` el shadow root se
fuerza a `open` y se auditan los TEXTOS (tildes, la salida escrita, mojibake); sin él, el shadow
queda cerrado como en producción y se audita el COMPORTAMIENTO. El informe deja escrito en qué modo
se corrió.

### Las guardas, que son el diseño

- **El actor es la constante `banco-de-pruebas`.** No hay parámetro, ni flag, ni env que lo cambie.
  Una decisión conducida por máquina con nombre de persona sería fabricar exactamente lo que el
  acta existe para impedir. Hay una comprobación que se ejecuta SIEMPRE, la pida o no el escenario:
  si una firma lleva otro actor, el informe sale rojo.
- **El acta del banco vive dentro de su work-dir** (`acta-banco.jsonl`), nunca en
  `config/decisions/`. Tampoco es configurable. El test E2E lo mide: tras el run, el acta del sitio
  no existe.
- **Por eso es un programa aparte y no una bandera del walker**: `--auto-veredicto` en la CLI de
  producción habría sido el camino corto y el error largo.
- **Un panel no previsto no cuelga el run**: gesto de socorro (`defer` en el de veredicto — que es
  literalmente lo que significa —, `block` en el de asistencia) y comprobación roja. Un panel que
  el escenario no esperaba ES un hallazgo del banco.

## Lo medido contra OrangeHRM real (ciclo CP005, el del ejercicio de campo)

Guion: [`docs/demo/orangehrm-ciclo.walk.json`](../demo/orangehrm-ciclo.walk.json) — login, PIM,
`s6` expect «Datos del empleado» (drift ES/EN), `s7` click «Buscar» (el botón se llama Search),
`s8` expect «Registros encontrados».

| Pasada | Resultado |
|---|---|
| Textos (`--abrir-panel`) | **30/30**: los tres paneles con sus tildes, «tres botones», la salida escrita, sin mojibake; 2 firmas `app` encadenadas; parche de s7 VERIFICADO; **s8 preguntó** (la corrección del camino roto, validada a máquina contra el sitio vivo) |
| Comportamiento (sellado) | **10/10**: mismas firmas, mismos outcomes, con el aislamiento de producción — «lo señalo yo» funciona igual con el shadow cerrado |
| Fusión (sandbox aparte) | preview agrupa el cambio como *elemento-distinto* («el plan nombraba “Buscar” y lo que hace el trabajo es un botón llamado “Search”»), `--aplicar --elemento=s7` firma `en-vivo`, original anclado, `check-walk-script` VÁLIDO, `check-decisions` cadena coherente |
| Verificación sin `--assist` | **6/8**: s7 pasa solo; s6 y s8 siguen `postcondition_unmet` — los rojos honestos, que un veredicto `app` no pinta de verde |

Cada pasada del banco tarda ~3–4 minutos de reloj y cero minutos de QA.

## Lo que el banco encontró mientras se construía

Que es la prueba de que sirve — dos iteraciones salieron rojas por causas reales:

1. **La suite probaba los paneles con una opción que producción no usa.** Los tests de fase B
   corren con `assistMinimize: false`; el banco arrancó igual y el parche de s7 salió `SIN
   VERIFICAR` → s7 bloqueado → el guardián del camino roto silenció s8 (correctamente, según su
   regla). En el run de campo la verificación en vivo ejecuta el target y s7 queda resuelto. El
   banco ahora calca el default de producción (`minimize: true`), y la divergencia quedó anotada.
2. **D64**: el panel de asistencia tapaba los botones Search/Reset (alineados a la derecha del
   formulario, justo bajo el panel fijo arriba-derecha) y el trial-click de la verificación en vivo
   moría en timeout — parche `SIN VERIFICAR` con un `verify_reason` de jerga (`locator.click:
   Timeout`) que no apunta al panel como causa. Una persona lo esquiva arrastrando el panel, quizá
   sin darse cuenta de que le salvó la verificación; el banco lo esquiva con el gesto
   `mover_panel`, que imita el arrastre. **El defecto de producto queda abierto** en el
   [índice](../references/indice-defectos.md): apartar el panel durante la verificación, o al menos
   un `verify_reason` que nombre la posibilidad.

Y una nota operativa: el audit-log de un run del banco ancla decisiones de `acta-banco.jsonl`; si
se le pasa a `check-decisions --audit` junto con OTRA acta (la del merge, p. ej.), el validador
canta `cola-truncada` — está comparando anclas de un acta contra otra. No es un defecto: es el
validador haciendo su trabajo con un emparejamiento equivocado. Cada acta con su audit.

## El límite, por escrito

De los cuatro defectos de la sesión de campo que motivó esto, el banco habría cazado tres. El
cuarto — una persona delante de un panel sin saber qué se espera de ella — no tiene automatización
posible: el banco sabe de antemano qué pulsar, y esa es precisamente la información cuya ausencia
constituye el defecto. Por eso el protocolo queda así: **el banco itera; el QA estrena.** Cada
rebanada nueva de panel se audita con el banco contra el sitio real ANTES de gastar la primera vez
de una persona, y esa primera vez se reserva para lo que solo ella puede medir: si se entiende.
