# Continuación — estado al cierre del 2026-08-30

**Punto de entrada único.** Supersede a [continuacion-2026-08-24.md](continuacion-2026-08-24.md)
(las reglas operativas que allí se pagaron siguen vigentes; no se repiten aquí). Branch
`design/kernel-v2`.

## Por dónde empezar

1. [`CLAUDE.md`](../../CLAUDE.md) — el mapa. 2. [`indice-defectos.md`](../references/indice-defectos.md)
— D1–D67 con guarda. 3. La cola de abajo, en su orden.

## Qué se cerró desde el doc anterior (2026-08-25 → 2026-08-30)

- **El arco entero del panel y el acta**: P2 + P5 fases A y B (veredicto sobre postcondición, fusión
  aprobada), el ciclo cerrado medido en campo (10/16 → 15/16 en el ejercicio del panel; 5/8 → 6/8 en
  el del ciclo, con las firmas del QA), y **P7, el banco de pruebas de paneles** (`npm run qa:bench`)
  con su protocolo: **el banco itera; el QA estrena**. Entradas en [STATUS.md](../STATUS.md) y
  findings enlazados desde ahí.
- **D57, D59–D63** (candidatos y captura del panel), **D64** (el panel tapaba el objetivo — mordió
  al QA dos veces; cerrado con `panelDejaDeInterceptar` y el banco como par falsable), **D65** (el
  motivo que juraba «se verificó» sin mirar `verified`).
- **La prueba de motor + IA con subagente** (pedida por el QA): la micro-llamada Haiku funciona
  (46k tokens, cruce de idiomas correcto, 6/8), la promoción a alias se negó sola con el drift vivo
  — y **D66**: la reanudación tras exit 42 se envenena con el testigo de sesión
  ([motor-ia-rescate-subagente.md](../findings/motor-ia-rescate-subagente.md)).

## La cola, en orden

### 1. P5 fase C — la propuesta de FD corregido · CERRADA el 2026-08-30 (D67 encontrado al primer uso; siguiente: P6)

Documento aparte (`<fd>.propuesta.md`), por plantilla determinista, derivado SOLO de decisiones
firmadas; un `defer` no aparece; nunca sobreescribe el FD del cliente. Diseño en el plan de sesión
del 28 y en [plan-panel-y-acta.md](plan-panel-y-acta.md) §P5. **Tiene su primer caso difícil
esperando en el acta de campo**: el QA adoptó «(110) Records Found» — el contador dentro del
literal (frágil por dato) frente a «Records Found» a secas (la trampa K0.37: casa dentro de «No
Records Found»). La propuesta tiene que poner ESA decisión delante del QA con el dato a la vista,
no esconderla.

### 2. P6 — la etiqueta de oráculo, con dientes · CERRADO el 2026-08-30 (siguiente: bloque 3, «la IA usa el walker»)

Cada criterio arrastra de dónde salió su oráculo (`fd` | `app` | `captura`), el test lo hereda en
su JSDoc, una regla de pre-review lo lee, y el resumen del run cuenta cuántos criterios respalda la
aplicación y no el FD. Ya tiene el dato debajo: el acta lleva decisiones reales (`app` con literal).

### 3. El bloque «la IA usa el walker» · ENTREGADO el 2026-08-30 (D66, D16, D5 cerrados; G2 con desviación escrita en su plan; I5 del corpus pendiente del corpus)

Origen: la pregunta *«¿es un ahorro que la misma IA utilice el walker?»* — sí, y el cableado está a
medio terminar. Cada pieza mueve trabajo de tokens re-pagados a determinismo gratis:

| Pieza | Qué es | Estado |
|---|---|---|
| **G2 + I5** de [plan-gate-locators-medidos.md](plan-gate-locators-medidos.md) | el smoke run instrumentado — la mitad dinámica del gate (G1 y G3 ya están, medidos I1–I4/I6) | pendiente |
| **D16** | el discovery-analyzer TIRA los locators que el walker midió; cada uno se re-paga aguas abajo | abierto |
| **D5** | un `expect_state` verde no deja locator autoritativo → su flujo cuesta una pasada de planner (~130k) | abierto |
| **D66** | la reanudación del checkpoint de rescate re-ejecuta el flujo a medias con la sesión restaurada: login irresoluble, respuesta legítima descartada, bucle quema-tokens si se orquesta a ciegas | abierto |

La frontera que la comparativa dejó medida y no se negocia: IA para semántica y primer contacto;
walker para repetir, verificar y arbitrar (13,5 s / 0 tokens el arbitraje que desempató a las dos
pasadas del planner).

### 4. P3 → P4 — posturas del panel

P3 (colapso, fantasma, tira de pasos, la colisión de `Escape`, medir si el panel contamina el scan
de axe). P4 se decide con P5 en la mano — puede que sobre. **Regla P7 en vigor: toda rebanada de
panel pasa por el banco contra el sitio real ANTES de la primera vez del QA.**

### 5. Flecos con dueño

- **El rechazo del panel no dice el GESTO que falta** (hallazgo del QA, 2026-08-29: pulsó tres
  veces «La aplicación tiene razón» sin literal; el motivo decía qué faltaba, no qué tocar). Es la
  primera rebanada candidata a estrenar el protocolo del banco.
- Escenarios de regresión del banco para los sitios de la gira (Dolibarr, ParaBank) — de paso, la
  medición pendiente del criterio de muerte de P2 (ruido de candidatos) sale casi gratis de sus
  informes.
- Abierta al QA: en el panel sordo del 29 (proceso congelado, sospecha QuickEdit), ¿botones grises
  con «firmando…» o normales sin reacción? Decide si hay defecto o solo aviso en las guías.
- E8 del veredicto: el tiempo por panel de veredicto sigue sin medirse por separado.

## Qué NO ha cambiado

Las reglas duras de `CLAUDE.md`, el orden P6 → P3 → P4 del plan del panel (este doc solo INSERTA el
bloque 3 entre P6 y P3), y los planes paralelos que no se tocan hasta que les llegue el turno:
[plan-datos-consumibles.md](plan-datos-consumibles.md).
