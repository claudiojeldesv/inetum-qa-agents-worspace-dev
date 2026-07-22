# Plan carril calidad — suites verdes sin degradar la Quality layer

**Origen**: puntos de revisión abiertos al cierre del carril token-efficiency (§7.1 y §8.1 de [token-efficiency-audit-2026-07.md](token-efficiency-audit-2026-07.md)). **Branch**: `design/quality-greens`, creado DESDE `design/token-efficiency` (hereda F1-F7; ese branch no se mergea a main todavía). **Ejecución**: una sesión nueva por fase, este documento como contrato; la ventana de plan no ejecuta.

**KPI principal (decisión QA 2026-07-22): verdes post-Healer 5/5** — la promesa de producto es que la suite entregada corre verde. Secundario: verdes a la primera (eficiencia de generación; hoy 0-3/5 según run).

**Guardrails — "conservar la calidad sin degradarla" (no negociables en este carril)**:
- La Quality layer no se toca: Writer/Reviewer en Sonnet, ping-pong N≤2, pre-review determinístico, Judge off. Cualquier cambio de prompt pasa A/B congelado si puede alterar verdicts.
- approved-rate del Reviewer y must-fix no empeoran vs el brazo de control (F6 brazo A: 4/4 iter 0, 0 must-fix).
- Coste/run dentro de ~$11 ± ruido (el carril calidad no re-infla lo que token-efficiency bajó). Medición con el protocolo enmendado del plan anterior (`parse-usage.mjs`, `total_cost_usd` del CLI).
- Los subagents nativos de Microsoft no se editan. Las mitigaciones de planner viven en el prompt por-flujo que construye el command, el post-proceso del discovery-analyzer o guardas determinísticas nuestras.

---

## Fase Q1 — Fixes ciertos + Healer medido

**Estrategia (decisión QA)**: Healer primero, prevención después — coherente con el principio "sanación al final" (Fase A) y cierra el gap de dato: el workspace actual nunca ha ejecutado ni medido el Healer.

1. **Prompt del Writer — patrón axe explícito**: añadir la línea dura con la ÚNICA API válida (`import AxeBuilder from '@axe-core/playwright'` + `new AxeBuilder({ page }).analyze()`; no existen `injectAxe`/`getViolations`/paquete `axe-playwright`). Clase sistemática identificada en F6 (3/4 specs); barata, previene también con Sonnet en días malos. Se propaga a template.
2. **Prompt del Reviewer — formato de escritura del feedback**: el fichero per-spec se escribe con UN objeto JSON (Write completo, no append; en iteración 2 sobreescribe con el estado final). Mata el origen de la familia "objetos concatenados" (F4); el consumidor tolerante se queda como red.
3. **pom-scaffolder — locators hardcodeados fuera**: eliminar los locators que el scaffolder inyecta sin respaldo del discovery (`menuButton`/`title`/`logo`/`orderSummary`, hallazgo F2). El esqueleto solo declara lo que el discovery vio; lo demás es del Writer con evidencia. Test unitario de la regla.
4. **Healer medido (la pieza nueva)**: run baseline S4 SauceDemo → sobre los rojos reales, invocar `playwright-test-healer` (nativo) por spec rojo, instrumentado: tokens/$ por spec sanado, tasa de éxito, wall-clock, y si la sanación respeta el Style Contract (pasar el spec sanado por pre-review + Reviewer — el Healer NO es juez, su output se audita igual). Con el dato, decidir la productización (¿paso opcional del command? ¿command aparte `/qa-automator:heal`?) — decisión QA al cierre de la fase, no antes.

**Criterio de salida**: KPI principal demostrado — **5/5 verdes post-Healer** en el baseline, con guardrails intactos y el coste del Healer medido y documentado (entra al marco €/run del informe §7 como línea real, no estimación).

**Commit**: `feat(qa-automator): fase Q1 quality-greens — fixes writer/reviewer/scaffolder + healer medido`

---

## Fase Q2 — Prevención + estabilización

Objetivo doble (decisión QA 2026-07-22, tras Q1): reducir la carga del Healer atacando las clases de rojos verificadas (F4 + la clase nueva de Q1), y eliminar las fuentes de inestabilidad que Q1 identificó ensuciando los guardrails.

**Bloque A — Prevención (causas raíz de los rojos):**

1. **Guarda determinística de locators del discovery**: script `src/scripts/verify-locators.ts` que, tras el discovery, resuelve cada locator del `discovery-report.json` contra el DOM real (playwright headless, `locator.count()`): los que no resuelven se marcan `unverified` y el Writer tiene prohibido usarlos sin TODO. Caza la clase cart de F4 (`getByRole('generic')`) Y la clase nueva de Q1 (locators por convención — heading asumido vs `data-test` real): en ambas, el locator fantasma muere antes de llegar al Writer. Coste: una pasada de navegador sin LLM.
2. **Prompt por-flujo del planner (lo nuestro, no el agente nativo)**: exigir evidencia de estado para observaciones condicionales — "documenta atributos/clases de estados de error SOLO si navegaste ese estado; si no, márcalo como no-verificado". Ataca la clase "clase `error` siempre presente" (F4). Validar con A/B congelado si cambia el contenido del plan.
3. **discovery-analyzer — degradar lo no verificable**: los elementos sin locator semántico verificable bajan de prioridad o se marcan, en vez de entrar silenciosamente al catálogo de selectores del Writer. Insumo de Q1: el should-fix común post-heal (el discovery no enumeraba `title` fuera de inventory).

**Bloque B — Estabilización (hallazgos Q1):**

4. **Race de POMs compartidos entre Writers paralelos** (el trigger del approved iter-0 2/5 y de los verdicts inconsistentes inter-Reviewer): mitigación a diseñar por la sesión ejecutora con evidencia, candidatas en orden de preferencia: (a) el scaffolder pre-rellena desde el discovery verificado (Q2.1) todo locator conocido — los Writers dejan de editar POMs compartidos en el caso común; (b) ownership: el command asigna cada POM compartido al primer Writer que lo necesita, el resto solo lee y deja TODO para una pasada de consolidación; (c) serializar Writers queda PROHIBIDO como solución (mata el paralelismo del wall-clock). Nota: Q2.1 también disuelve la mitad del problema inter-Reviewer ("¿fabricado?" deja de ser opinión con locators verificados).
5. **Writers-en-background prohibido**: hard rule en los 3 commands funcionales — los Writers se lanzan foreground/síncronos (el patrón background mató turnos del orquestador en F2 y Q1, pagando re-priming en cada corte).
6. **Normalización de rutas en `appendAuditEntry`** (código, no prompts): mata la clase "fichero basura por ruta Windows" de F4/Q1.

**Criterio de salida**: verdes a la primera ≥4/5 en baseline, approved iter-0 ≥4/5 (recuperar el nivel del control F6-A — mide la race), carga del Healer reducida vs Q1, guardrails intactos, cero ficheros basura.

**Commit**: `feat(qa-automator): fase Q2 quality-greens — prevención (verify-locators, planner, discovery) + estabilización (POM race, writers foreground, rutas)`

---

## Fase Q3 — Productización del Healer (patrón regla #10)

Decisión QA (2026-07-22, cierre Q1): la sanación entra al producto como los demás gates — **off por defecto, reactivable**. Independiente de Q2 (puede ejecutarse antes si una demo lo pide).

1. **Knob en el Style Contract**: bloque `healing` en el schema (`docs/references/style-contract-schema.md`), default `enabled: false`. Con `enabled: true`, el run de `autonomous` encadena la sanación tras el Verification step sobre los rojos; sin él, reporta rojos y termina (comportamiento actual).
2. **Command `/qa-automator:heal`** (mismo patrón desacoplado que `report`): lee los artefactos del último run (`<workDir>`, rojos del summary), invoca `playwright-test-healer` nativo por spec rojo, y aplica el **protocolo de auditoría post-heal validado en Q1** — el Healer no es juez: suite re-ejecutada + pre-review + Reviewer sobre los specs afectados + verify-a11y; actualiza el run-summary con `healed[]`, $/spec y verdicts. Re-ejecutable.
3. **Audit-log**: cada sanación registra spec, ficheros tocados, causa raíz y verdicts post-heal (trazabilidad regulatoria del cambio sobre código de test).
4. Propagación a template + healthcheck + docs (README del template: el marco €/run incluye la línea Healer medida en Q1: μ $0,72/spec, 1 fix cura N).
5. **Check determinístico nuevo en pre-review** (añadido al cierre de Q2): `toHaveClass` con regex sin anclas (`/error/` matchea substrings de clases base) → must-fix. Mata para siempre la clase del rojo TC-005 de Q2. Test unitario con el caso real (`input_error` vs `\berror\b`).
6. **Validación del command**: Q2 quedó 5/5 verde (TC-005 sanado a mano al cierre), así que no hay rojo real — fabricar el fixture: mutar un locator en una COPIA del namespace (o un spec de sacrificio) y validar `/qa-automator:heal` de punta a punta contra él, incluyendo el protocolo post-heal completo.

**Criterio de salida**: `/qa-automator:heal` sana el fixture rojo con el protocolo completo y el knob del contract activa/desactiva el encadenado en `autonomous`; el check de regex sin anclas vive en pre-review con test; red estructural verde; regla #10 actualizada en CLAUDE.md/SPEC mencionando `healing` junto a PII/Judge/a11y-gate.

**Commit**: `feat(qa-automator): fase Q3 quality-greens — /qa-automator:heal + knob healing off-por-defecto (regla #10) + check regex sin anclas`

---

## Fase Q4 — Identidad estable (slug drift + specs stale + naming)

Origen: flags (a) y (b) del cierre de Q2, que interactúan entre sí y con las decisiones de naming ya cerradas sin implementar (memoria del proyecto: naming español sin naturaleza en el nombre + cobertura por-flujo en S4).

1. **Slug drift entre runs**: el discovery nombra el mismo flujo con slugs distintos entre runs (`pago.compra-completa` vs `pago.compra-exitosa`) → entradas duplicadas en el tc-registry con IDs distintos para el mismo caso. Diseñar la reconciliación: ¿matching semántico en el checkpoint contra los slugs ya registrados (candidato barato: mismo `feature` + naturaleza + pantalla de destino)? ¿O naming determinístico derivado del flujo del brief? Conecta con implementar las decisiones de naming pendientes.
2. **Specs stale intra-namespace**: los specs de runs anteriores con slugs viejos sobreviven en `tests/e2e/<site-id>/`, se ejecutan en el verify (ruido) y rompen tsc cuando el scaffold regenerado cambia miembros del POM (ocurrió en Q2, limpieza a mano). Fix sistémico en el stage `checkpoint`: archivado (no borrado — pueden tener ediciones del QA) de los specs del site-id fuera de la selección actual, a `tests/e2e/<site-id>/_archive/` con entrada al audit-log.
3. Revisitar el hueco ya flaggeado de limpieza inter-namespace (specs pre-namespace en la raíz de `tests/e2e/`) — misma pasada.

**Criterio de salida**: dos runs consecutivos con catálogos distintos no duplican entradas del registro ni dejan specs stale activos; tsc verde post-baseline sin limpieza manual; el archivado queda auditado.

**Commit**: `feat(qa-automator): fase Q4 quality-greens — identidad estable (reconciliación de slugs, archivado post-selección)`

---

## Fase Q4 — Shift-left del pre-review (hipótesis de robustez)

Independiente de Q2/Q3, ejecutable en cualquier orden. Origen: exploración de palancas post-token-efficiency (conversación QA 2026-07-22).

**Hipótesis**: mover el check determinístico DELANTE del juez reduce las iteraciones de ping-pong cuando el Writer produce defectos mecánicos, sin alterar verdicts en el camino normal. El valor no es el $ del run actual (con Writer Sonnet el perfil ya es approved iter 0 con 0 must-fix mecánicos y el pre-review saldría clean a la primera): es robustez del proceso. F6-B midió el modo de fallo que esto asegura: 9 must-fix mecánicos → 10 invocaciones de Reviewer (vs 4 del control), cada ronda a precio Sonnet para señalar lo que un regex detecta gratis, y 1 defecto (scan axe antes del goto) aprobado por churn que solo cazó la red 11.c al final, costando la única invocación real del rescate a11y. Seguro asimétrico: coste ~0 siempre (una llamada Bash de ~2s por writer), pago grande en días malos, sitios raros o si algún día se reabre la pregunta del writer barato.

**Cambio** (uno, de prompt): paso 3.5 en `ia4d-writer.md` — tras escribir el spec y ANTES de invocar al Reviewer, ejecutar `npx tsx src/scripts/pre-review.ts <output> --style-contract=<contract>`; si reporta must-fix, corregirlos y re-ejecutar hasta clean (máx 2 pasadas; si no llega a clean, invocar al Reviewer igual — el protocolo N≤2 no cambia). La red 11.c post-review NO se mueve (defensa en profundidad, el mismo script dos veces cuesta $0). Propagación a template vía `build:template`.

**Validación — A/B congelado doble** (discovery `frozen-fase3`, mismo método F3/F6; los brazos de control YA están medidos, solo se corren los brazos con tratamiento):

1. **Brazo paridad (guardrail)**: Writers Sonnet + shift-left vs control F6-A (dato existente: 4/4 iter 0, 0 must-fix, 8 should-fix). Criterio: verdicts idénticos, riqueza del feedback del Reviewer no empobrecida, cero cambio de comportamiento observable. Cualquier degradación aquí mata la hipótesis — un seguro que degrada el caso común no se compra.
2. **Brazo estrés (la señal discriminante)**: Writers Haiku + shift-left vs control F6-B (dato existente: 9 must-fix al Reviewer, 10 invocaciones, 1 escape a 11.c). Haiku actúa como **generador de defectos del experimento**, no como reapertura de la decisión F6 (cerrada: el Writer de producto sigue Sonnet). Criterios de éxito: must-fix mecánicos que llegan al Reviewer ≈0, invocaciones de Reviewer ≤6, escapes a la red 11.c = 0.

**Riesgo a inspeccionar en el A/B**: el Writer corrigiendo "para pasar el regex" en vez de corregir bien (p.ej. tag `// css-fallback:` sin atributo sancionado en el contract — el script ya exige ambas condiciones, pero los diffs de corrección del brazo estrés se revisan a mano).

**Decisión**: adopta si el brazo paridad sale limpio Y el brazo estrés mejora en ≥2 de las 3 métricas. Ambos desenlaces cierran la fase (patrón F3/F6: la hipótesis se mata con dato barato).

**Coste estimado del A/B**: ~$1,5-2,5 (8 writers sobre discovery congelado; controles ya pagados en F6).

**Commit**: `feat(qa-automator): fase Q4 quality-greens — shift-left pre-review en el Writer (A/B: <resultado>)` o `docs(qa-automator): fase Q4 — shift-left pre-review descartado por A/B`

---

## Fuera de plan (explícito)

- Re-abrir cualquier decisión del carril token-efficiency (Writer/main Haiku, reviewer de lote) — cerradas con dato.
- Editar los subagents nativos de Microsoft.
- Tocar reglas duras de producto (compliance, Writer+Reviewer, gates off por defecto).
- Naming/cobertura S4 pendientes de otra conversación (decisiones cerradas sin implementar — carril propio si se retoma).

## Resultados

| Fase | Fecha | Verdes 1ª | Verdes post-Healer | $/run | $/spec sanado | Approved | Notas |
|---|---|---|---|---|---|---|---|
| Referencia (F4/F6) | 2026-07-22 | 0/5 · 2/4 | sin dato (Healer nunca medido) | 11,2 | — | 5/5 · 4/4 | Clases: gap discovery cart + observación planner |
| Q1 | 2026-07-22 | 2/5 | **5/5** ✓ KPI | 12,0 (+2,2 Healer) | 0,51-0,92 (μ 0,72) | 5/5 (2 iter 0, 3 iter 1) | Las 2 clases de F4 no reaparecieron; clase nueva: locators por convención. Healer 3/3, 1 causa raíz compartida. Post-heal auditado: Reviewer 3/3 approved, pre-review clean. Ver notas Q1 |
| Q2 (prevención+estabilización) | 2026-07-22 | **4/5** ✓ | **5/5** (TC-005 sanado a mano, decisión QA) | 11,1 (4,4+6,6) | — | 5/5 (3 a la 1ª review; 2 rechazos legítimos no-race → criterio satisfecho por atribución, decisión QA) | Guarda locators viva (16/24, 1 fantasma cazado pre-Writer), ownership 100% sin race, planner con evidencia de estado (clase F4 muerta); rojo = clase nueva estrecha (regex substring), fix `\b` verificado verde. Ver notas Q2 y Cierre Q2 |
| Q3 (productización Healer + check regex) | | | | | | | |
| Q4 (identidad estable) | | | | | | | |
| Q4 (shift-left pre-review) | | n/a — métricas propias: must-fix al Reviewer, invocaciones Reviewer, escapes 11.c | | | | | Brazos de control ya medidos en F6 |

### Notas Q1 (2026-07-22, streams `.work/audit-runs/baseline-q1{,-2,-3}.jsonl` sesión `0c3111a3` + `healer-q1-tc00{2,3,4}.jsonl`)

**Fixes 1-3 (aplicados, red estructural verde: tsc, 206/206 tests, healthcheck 24/24, `build:template`):**

- **Writer — patrón axe**: línea dura en proceso + hard rules con la única API válida (`import AxeBuilder from '@axe-core/playwright'` default + `new AxeBuilder({ page }).analyze()`; `injectAxe`/`checkA11y`/`getViolations`/`axe-playwright` declarados inexistentes). En el baseline los 5 specs salieron con la API correcta (con Writer Sonnet nunca falló — la línea es el seguro para días malos que F6 identificó).
- **Reviewer — formato del feedback**: semántica explícita de sobrescritura por iteración (Write completo, UN objeto, nunca Edit/Bash-append). **Verificado en vivo**: los 5 ficheros per-spec del baseline contienen exactamente un objeto JSON, incluidos los dos specs multi-iteración que en F4 reproducían la concatenación. El consumidor tolerante queda como red.
- **Scaffolder — corrección al enunciado del plan**: el código del scaffolder NUNCA tuvo locators hardcodeados; el mecanismo real del hallazgo F2 era que `emit()` no sobrescribía ficheros existentes, así que POMs de runs viejos (scaffoldeados desde discoveries antiguos que sí tenían `Open Menu`/`title`/`logo`/`orderSummary`) sobrevivían a runs nuevos cuyo discovery ya no los respaldaba — y el Writer los usaba creyéndolos legítimos. Fix: `scaffold()` regenera (sobrescribe) siempre desde el discovery actual; la regla "el esqueleto solo declara lo que el discovery vio" queda garantizada y con test unitario (18/18 en el suite del scaffolder, 2 nuevos).

**Baseline (con fixes)**: $1,82 + $8,06 + $2,16 = **$12,0** · wall ~40 min · 3 segmentos (1 pausa checkpoint legítima 6>cap 5 → `TOP`; 2 cortes por el patrón **writers-en-background** de F2, que reapareció — el orquestador lanza los Writers en background y su turno muere antes de post-writers/verify; cada corte paga re-priming, el run limpio ajustado queda en ~$11, dentro del guardrail ~$11±ruido). 5/5 approved (TC-001/005 iter 0; TC-002/003/004 iter 1), pre-review 5/5 clean 0 must-fix, a11y 5/5.

**Verdes a la primera: 2/5.** Las dos clases de F4 (gap discovery cart `getByRole('generic')` y observación del planner clase `error`) **no reaparecieron** — atribución parcial: scaffolder sin stale + variance del discovery. La clase de los 3 rojos (TC-002/003/004) es nueva y una sola: **locators construidos por convención sin respaldo literal del discovery** — títulos de pantalla asumidos `getByRole('heading')` cuando SauceDemo los renderiza como `<span data-test="title">`, y el par simétrico `remove-{slug}`. Los propios Writers los flaggearon como judgment calls durante la escritura; ningún gate estático los caza (correctitud semántica contra el DOM real) — es exactamente la clase que Q2.1 (`verify-locators.ts`) ataca.

**Healer medido (primera vez):**

| Spec | $ sesión | Wall | Resultado |
|---|---|---|---|
| TC-002 carrito | 0,51 | 2,1 min | Fix en `cart.page.ts` (title → `getByTestId`), verde |
| TC-003 carrito-múltiples | 0,74 | 4,4 min | **Sin edición** — curado por el fix compartido de TC-002; healer verificó 6/6 pases |
| TC-004 pago | 0,92 | 3,5 min | Fix en los 3 POMs de checkout (misma causa raíz), verde; blast radius verificado por grep |

Total **$2,17 / ~10 min / 3/3 éxito**. Hallazgo de economía: los rojos comparten causa raíz en POMs compartidos → **1 fix cura N specs** (el $/spec sanado no es aditivo por rojo). El Healer solo tocó POMs, ningún `.spec.ts`, ningún `test.fixme()` (la guarda anti-fixme no llegó a activarse).

**Auditoría del output sanado (el Healer no es juez)**: suite 5/5 verde (8s), pre-review 5/5 clean 0 must-fix, verify-a11y 5/5, **Reviewer sobre los 3 specs afectados: 3/3 approved, 0 must-fix** — la sanación respeta el Style Contract (`getByTestId` es prioridad #1 del contract; MF-1 no aplica). Should-fix común de los 3 Reviewers: el discovery no enumera `title` fuera de `inventory` — el fix del Healer se apoya en verificación contra DOM vivo, no en artefacto de discovery. Insumo directo para Q2.1/Q2.3.

**Guardrails**: Quality layer intacta (solo los 2 fixes de prompt del plan); coste dentro de banda; **señal a vigilar en Q2**: approved a iteración 0 fue 2/5 (control F6-A: 4/4) — condiciones no comparables (discovery fresco vs congelado, y el trigger real fue una race de dos Writers paralelos editando el mismo POM `cart.page.ts`/`inventory.page.ts`, que produjo además **verdicts inconsistentes entre Reviewers**: el mismo locator `removeButtonBySlug` aprobado en TC-002 y rechazado como fabricado en TC-003 por revisores independientes sin contexto compartido). Ambos —la race de POM compartido entre Writers paralelos y la inconsistencia inter-Reviewer— quedan flaggeados como backlog del carril.

**Bugs menores nuevos flaggeados**: (a) el Writer de TC-004 escribió una entrada de audit-log con ruta Windows backslash → fichero basura en la raíz del repo (misma clase que la hard rule ya presente en el Reviewer; candidato: normalizar rutas en `appendAuditEntry` en vez de confiar en prompts); (b) specs stale pre-namespace en la raíz de `tests/e2e/` (ahorro-inversion, santalucia) siguen sin limpiarse — hueco ya flaggeado en el anexo del informe, no bloquea.

**Criterio de salida: CUMPLIDO** — 5/5 verdes post-Healer, guardrails intactos, coste del Healer medido y trasladado al marco €/run del informe (§7). **Decisión de productización (QA, 2026-07-22): híbrido patrón regla #10** — knob `healing` en el Style Contract (off por defecto), command aparte `/qa-automator:heal` re-ejecutable, y el orquestador de `autonomous` NO sana por defecto (reporta rojos y termina; si el contract activa healing, encadena). El QA lo lanza o lo activa cuando decide sobre los rojos. Implementación en Fase Q3.

### Notas Q2 (2026-07-22, streams `.work/audit-runs/baseline-q2{,-2}.jsonl` sesión `d445b3b5`)

**Implementación (los 6 puntos del plan; red estructural verde: tsc, 229/229 unit, healthcheck 25/25, `build:template`):**

- **Q2.1 `verify-locators.ts`**: resuelve cada locator del discovery contra el DOM real (chromium headless, `locator.count()`) con la misma prioridad que el scaffolder; anota in-place `verified: true` (resuelve único) / `false` (`not-found` | `ambiguous(n)` | `invalid-locator`) / `null` (inalcanzable). **Bootstrap de sesión contract-driven** (formulario de login detectado en el propio discovery + `synthetic_fixtures.credentials`) — sin él la guarda no vería nada tras login (SauceDemo redirige todo a `/`). Integrado en el stage `checkpoint` (cero turnos extra de orquestador) y como paso 10.b en S2/S3; el scaffolder marca los unverified en el POM. **Matiz de diseño descubierto en el smoke**: `not-found` ≠ fantasma siempre — los elementos condicionales de estado (banner de error, Remove, badge del carrito) no resuelven en el estado por defecto; la regla del Writer quedó en "unverified → TODO **o cita de evidencia de estado del plan**".
- **Q2.2 prompt del planner**: exigencia de evidencia de estado, verificada en los fragmentos del baseline — secciones explícitas "navegado y verificado" vs "NO verificado (no asumir como hecho)", y el plan de login documenta la trampa exacta de F4 con precisión (`input_error` es clase base SIEMPRE presente; la exclusiva del error es `error` añadida encima). **La clase F4 "observación imprecisa del planner" murió.**
- **Q2.3 discovery-analyzer**: `locator_confidence: weak` para role-only, prohibición de `test_id` wildcard (el smoke cazó un `add-to-cart-*` real de Q1), y `screens[]` por entrada del catálogo (insumo del ownership).
- **Q2.4 race de POMs — candidata (b), ownership mecánico**: `computePomOwnership()` en el checkpoint (cada POM al primer escenario seleccionado que pisa la pantalla; `pom_ownership` + `owned_poms` en selection.json), el command pasa `--owned-poms` al Writer, no-propios read-only con patrón `// TODO consolidacion-pom`. La candidata (a) quedó cubierta de facto por Q2.1+Q2.3 (el scaffold ya pre-rellena todo lo verificado); (c) serializar sigue PROHIBIDO y no hizo falta. El Reviewer ganó **procedencia objetiva de locators** (verified nunca es fabricado; parametrizado con instancia concreta citada es legítimo; excepción MF-8 para el TODO de consolidación) — el juicio "¿fabricado?" dejó de ser opinión.
- **Q2.5 writers foreground**: hard rule en los 3 commands, **enmendada en caliente durante el baseline** — el harness lanza subagents en background POR DEFECTO (el segmento 1 murió esperando al Writer TC-001, y hasta el Reviewer interno del Writer quedó en background); prohibir no basta, la regla exige `run_in_background: false` EXPLÍCITO en cada Task. El segmento 2 cumplió (visible en el stream: `bg:false` en los 4 Writers paralelos y en todos los Reviewers).
- **Q2.6 `appendAuditEntry`**: la ruta del log debe terminar en el segmento literal `audit-log.json`; una ruta mangled (backslashes comidos por interpolación JS/shell) cae al log default del run con la ruta inválida en metadata — el fichero basura de Q1 es irreproducible por construcción (test unitario de la clase). `target` se normaliza a forward slashes en código (la hard rule del prompt del Reviewer pasa a ser redundante).

**Baseline (protocolo enmendado, `total_cost_usd` del CLI)**: $4,45 + $6,61 = **$11,06** · wall ~43 min en 2 segmentos · orquestador 26 llamadas API. Catálogo 5 escenarios (auto-under-cap, sin pausa de selección; slugs nuevos → TC-006/007/008). Un re-planner de negativos por auto-corrección del orquestador (~$0,4). El corte de segmento fue el hallazgo Q2.5 (background-default del harness), no una pausa legítima.

**Criterios de salida:**

- **Verdes a la primera: 4/5 ✓** (objetivo ≥4/5; Q1: 2/5, F4: 0/5). La clase Q1 "locators por convención" no reaparició (0 apariciones — TC-006 la intentó y el Reviewer la rechazó por procedencia antes de llegar a rojo); la clase F4 del planner tampoco.
- **Approved iter-0: 3/5, no llega al 4/5 numérico — pero la atribución importa**: los 2 rechazos NO son la clase race que el criterio medía. TC-006 rechazado por la regla NUEVA de procedencia (locator `verified:false` usado sin evidencia → el Writer añadió la cita → approved): es la guarda funcionando como se diseñó, no ruido. TC-007 por MF-9 real (post-condición de negocio). **Síntomas de race: cero** — ownership cumplido al 100% (verificado en el stream: cada POM editado solo por su dueño — TC-001 login, TC-006 cart, TC-007 checkout×2; nadie tocó un POM ajeno), un Reviewer por spec, 5/5 ficheros de feedback con UN objeto, sin verdicts inconsistentes inter-Reviewer. La intención del criterio (matar la race) se cumplió; el número no, porque la vara de Q2 es más alta que la del control F6-A (que no tenía la regla de procedencia).
- **Carga del Healer: 1 rojo vs 3 en Q1 ✓**. No se ejecutó (decisión QA pendiente sobre el rojo, coherente con "el QA decide"; el fix es de una línea).
- **Guardrails: intactos** — coste $11,06 dentro de ~$11±ruido; Writer/Reviewer Sonnet, N≤2, pre-review 8/8 clean 0 must-fix, a11y 5/5 warning-mode; **cero ficheros basura ✓**.

**El rojo (TC-005 usuario-bloqueado)**: clase nueva y más estrecha que las anteriores — el plan documentaba el patrón de clases con precisión y el Writer lo tradujo mal: "pierde la clase error" → `not.toHaveClass(/error/)`, y el regex matchea por substring contra la clase base `input_error` (siempre presente). El Reviewer lo aprobó (iter 0). Caso de uso directo del Healer; candidato barato a check determinístico en pre-review (`toHaveClass` con regex sin anclas). La cadena de prevención acortó la distancia: F4 = el dato estaba mal; Q1 = el dato no existía; Q2 = el dato es preciso y el fallo es solo de traducción.

**Flags nuevos**: (a) **slug drift entre runs** — el discovery de Q2 nombró `pago.compra-exitosa` lo que Q1 llamó `pago.compra-completa` → entradas duplicadas en el tc-registry (TC-004 y TC-007 cubren el mismo flujo); conecta con las decisiones de naming cerradas sin implementar (carril propio); (b) **specs stale intra-namespace, escalado** — los TC-002/003/004 de Q1 quedaron en `tests/e2e/saucedemo/` con slugs distintos a los de Q2; el verify los ejecutó (el run-summary filtra por selección, KPI limpio) y además ROMPIERON tsc post-baseline: referenciaban miembros de POM (`title`, `addToCartBySlug`…) que el scaffold regenerado ya no declara. Borrados a mano tras el baseline; el fix sistémico (limpieza/archivado post-selección de specs del site-id fuera de la selección, en el checkpoint) queda como decisión de diseño pendiente — interactúa con el slug drift (a); (c) `rate_limit_event` en el segmento 1 (infra, no diseño).

**Criterio de salida: CUMPLIDO con una salvedad numérica** — verdes 1ª 4/5 ✓, race eliminada con evidencia ✓, carga Healer reducida ✓, guardrails ✓, cero basura ✓; approved iter-0 3/5 (<4/5) con los 2 rechazos atribuidos a reglas nuevas de calidad, no a la inestabilidad que el criterio vigilaba. La decisión de dar el criterio por satisfecho o exigir un re-run es del QA.

**Cierre Q2 (decisiones QA 2026-07-22, ventana de plan):** (1) **criterio approved iter-0 satisfecho por atribución** — la intención (race) se cumplió con evidencia directa; no se re-corre por un número cuya vara cambió (la regla de procedencia no existía en el control F6-A). (2) **TC-005 sanado a mano en la ventana de plan** (no vía Healer): regex anclado con `\b` en las 4 apariciones de `toHaveClass` (la clase base `input_error` ya no matchea por substring); verificado verde (7,8s). **Q2 queda 5/5 verde.** Consecuencia para Q3: la validación de `/qa-automator:heal` necesitará un rojo fabricado (mutar un locator en una copia) o esperar al primer rojo real. (3) Los flags de identidad (slug drift + specs stale intra-namespace) van a **Fase Q4 propia**. Además, la clase del rojo (regex sin anclas en `toHaveClass`) se convierte en check determinístico del pre-review — añadido al scope de Q3.
