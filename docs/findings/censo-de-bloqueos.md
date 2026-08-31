# Censo de bloqueos — Fase 0 del plan del rescate en proceso

**De 121 pasos «bloqueados» en tres sitios, solo 12 eran material de rescate. El 10%.**

**Qué es**: el recuento, por clase, de todo lo que se plantó en los tres ciclos E2E en terreno virgen
(Restful Booker, Tricentis Insurance, EspoCRM). **Retroactivo**: calculado desde `dom-map.json` y los
walk-scripts que ya estaban en disco. Cero navegador, cero tokens, cero runs nuevos.

**Para qué**: contestar con número, y no con opinión, los pares falsables de
[plan-rescate-en-proceso.md](../tasks/plan-rescate-en-proceso.md) §7 — antes de escribir una línea del
diseño que proponen.

**Herramienta**: [`copilot/src/rescue-census.ts`](../../copilot/src/rescue-census.ts) (10 tests).
Reutiliza `puertaBloqueadaAntes` y `triajeDelBloqueo` de `walk-core` sin duplicar la lógica.

```bash
npm run qa:censo -- --map=.work/e2e-espocrm/motor-solo-d/dom-map.json --script=docs/demo/espocrm-regresion.walk.json
```

---

## 1. Decisión de método: la cascada se recalcula, no se lee

Los runs de Tricentis y EspoCRM ya traen «en cascada de sNN» en el `reason` porque el triaje (D68) había
aterrizado; el de Restful Booker es **anterior** y no lo trae. Leer la clase del texto habría medido dos
sitios con una vara y el tercero con otra. Se recalcula desde el orden del guion para los tres, y donde el
texto sí está se usa como **comprobación cruzada**.

**Resultado de la comprobación: cero discrepancias en los tres sitios.** El recálculo coincide con lo que
el walker escribió, donde lo escribió. El censo no se está midiendo a sí mismo.

## 2. El descubrimiento que obligó a rehacer el modelo: cinco familias, no tres

El triaje tiene tres clases. La masa bloqueada tiene **cinco familias**, y solo una es material de rescate:

| familia | qué es | ¿va al LLM? |
|---|---|---|
| `drift` | postcondición del FD no observada | **No** — el locator no falló, falló el oráculo |
| `accion` | el locator resolvió y la **acción** fue rechazada (fachada, familia D70) | **No** — el elemento se encontró |
| `cascada` | hay una puerta bloqueada antes en el mismo flujo | No — no puede existir |
| `panel` | ambigüedad o ámbito fallido | No — elegir es del QA |
| `rescate` | hint irresoluble limpio | **Sí, y solo esta** |

Mezclar las cinco bajo «bloqueados» es lo que hacía parecer que Restful Booker tenía 39 problemas de
resolución. Tenía **3**.

## 3. La tabla maestra

Runs **motor solo** (presupuesto 0), que son los únicos con el `reason` original intacto — ver §5.

| | Restful Booker | Tricentis | EspoCRM | **total** |
|---|---:|---:|---:|---:|
| pasos del guion | 111 | 237 | 89 | 437 |
| bloqueados | 39 | 64 | 18 | **121** |
| `drift` | 13 | 24 | 7 | 44 |
| `accion` (D70) | 0 | 18 | 1 | 19 |
| `cascada` | 17 | 20 | 3 | 40 |
| `panel` | 6 | 0 | 0 | 6 |
| **`rescate`** | **3** | **2** | **7** | **12** |
| puertas bloqueadas | 15 | 14 | 5 | 34 |
| **capas máx** | **6** | **4** | **2** | — |
| **pares adyacentes** | **3** | 0 | **3** | **6** |

## 4. El coste del replay, en pasos re-ejecutados

Runs **walker+IA**. Cada rescate mata el proceso (`exit 42`) y la reanudación re-ejecuta el flujo **desde
su primer paso** (D66). Los pasos que se vuelven a ejecutar se cuentan solos:

| | rescates pedidos | pasos re-ejecutados | equivalente |
|---|---:|---:|---|
| Restful Booker | 13 | **62** | **56% de un run entero, tirado** |
| Tricentis | 2 | 25 | 11% |
| EspoCRM | 3 | 5 | 6% |

El caso extremo tiene nombre: **`cp001-reserva-individual` de Restful Booker pidió 5 rescates** (s5, s8,
s9, s10, s13). Cada uno re-ejecutó el flujo desde el principio: 4+7+8+9+12 = **40 pasos re-ejecutados en
un solo flujo**, que acabó corriendo **seis veces** para completarse una.

En el modelo en proceso esos 62, 25 y 5 pasos valen **cero**: el navegador nunca se movió de la pantalla.

## 5. Dos hallazgos que no estaban en la lista de hipótesis

### 5.1 El replay no solo es caro: **fabrica bloqueos nuevos** (D73, ahora con cifra)

En EspoCRM, `cp003-busqueda-cuenta/s1` (select Username) y `s2` (select Language) salen **`ok`** en el run
sin rescate. En el run con rescate quedaron bloqueados **y se llevaron 2 de las 3 llamadas**.

No los rompió el sitio: los rompió la reanudación. El snapshot de la petición que quedó pendiente lo
enseña entero:

```
"aria_snapshot": "- contentinfo:\n    - link \"EspoCRM, Inc.\":"
```

La pantalla no había pintado (D72) y se pidió rescate igual, sobre evidencia vacía. **El 67% del
presupuesto de ese sitio se gastó en daño que causó el propio mecanismo de rescate.** Y el run terminó sin
`dom-map.json`: la secuencia reactiva se quedó en una petición pendiente y **no dejó informe**.

### 5.2 El `reason` se sobrescribe y **destruye la clase original** (D74, nuevo)

Restful Booker, mismo sitio, mismos pasos, dos runs:

| clase | motor solo | walker+IA |
|---|---:|---:|
| `panel` (ambigüedad/ámbito) | 6 | **1** |
| `rescate` | 3 | **11** |

No cambió el sitio: cambió el texto. Cuando se intenta un rescate, el `reason` se reescribe con el
desenlace (`rescate LLM respondió locator=null`, `el locator del rescate no resuelve en el DOM`) y la clase
original se pierde. Cuatro de las seis ambigüedades desaparecieron del registro y se contaron como
material de rescate.

**Consecuencia para el plan**: confirma con dato la decisión de §5 del plan — la clase hay que
**persistirla como campo en el momento del bloqueo**, no dejarla en una prosa que luego se pisa. Sin eso,
la instrumentación de Fase 1 mediría el mismo espejismo.

## 6. Los pares falsables, contestados

| # | hipótesis | veredicto |
|---|---|---|
| **H1** | escala 1-3 rescates por sitio | **corregida**: 3 / 2 / **7**. La cifra exacta muere; el fondo sobrevive — 12 de 121 bloqueos, **10%** |
| **H2** | las puertas consecutivas son comunes | **confirmada**: 6 pares en 2 de 3 sitios. `cp009-baja-cuenta` de EspoCRM es una cadena de **tres**: `click "Acciones"` → `click "Eliminar"` → `click "Eliminar"` (confirmar). El ejemplo del QA, en un flujo de negocio real |
| **H3** | el replay domina el reloj | **parcial**: domina cuando los rescates se agrupan en un flujo (56% en RBP), es menor cuando son pocos y tempranos (6-11%). Y esto son **pasos**, no milisegundos: el reloj sigue sin medirse |
| **H4** | existen cascadas de más de una capa | **confirmada, fuerte**: 6 / 4 / 2. El modelo diferido necesitaría hasta **siete pasadas** en Restful Booker |
| **H5** | el orquestador con contexto sucio no declina más que un subagente limpio | **no contestable** con artefactos, como el plan predijo. Exige A/B |

## 7. Qué cambia en el plan

1. **El abanico paralelo no se construye.** El umbral `K` nunca se cruzaría: 12 rescates reales en 121
   bloqueos, máximo 7 en un sitio. El diseño queda más pequeño, que era el desenlace que se buscaba.
2. **El en proceso sale reforzado, pero por otra razón que la que yo defendía.** Yo argumentaba economía
   de rescates. El número gordo es otro: **40 pasos en `cascada`** — condenados detrás de una puerta y
   nunca siquiera intentados. Resolver la puerta en el sitio los pone en juego **en el mismo run**. El
   premio es la cascada, no el ahorro de sobres.
3. **Y el camino humano ya cobra ese premio hoy.** `assistResolve` pausa en proceso, el QA señala, el run
   sigue: la cascada se destraba sola. El único que se muere y re-ejecuta es el LLM. La asimetría no
   tiene defensa técnica.
4. **H4 mata el modelo diferido**, incluso como camino principal: siete pasadas no es una alternativa.
   Sobrevive solo como red para «nadie escucha» (§6.1 del plan).
5. **D74 entra en Fase 1** como requisito, no como mejora: sin persistir la clase, la campaña de medición
   del estreno mediría el espejismo del §5.2.

## 8. Lo que Fase 0 no puede contestar

- **El reloj.** 62 pasos re-ejecutados no son 62 unidades de tiempo: los pasos no duran igual. `replay_ms`
  necesita run fresco — es justo lo que Fase 1 instrumenta.
- **H5**, que exige A/B con dos respondedores sobre la misma petición.
- **Cuántos de los 40 en cascada se resolverían de verdad** al abrir la puerta. Se pondrían en juego; no
  está dicho que pasen. La cota superior es 40, no la estimación.
- **El sesgo de cada run**: el de presupuesto 0 maximiza la cascada (nada se destraba) y el de rescate
  destruye la clase (§5.2). Ninguno de los dos es limpio, y por eso hace falta Fase 1.
