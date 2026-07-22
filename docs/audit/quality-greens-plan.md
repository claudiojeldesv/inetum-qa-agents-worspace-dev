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

**Criterio de salida**: `/qa-automator:heal` sana los rojos de un baseline real con el protocolo completo y el knob del contract activa/desactiva el encadenado en `autonomous`; red estructural verde; regla #10 actualizada en CLAUDE.md/SPEC mencionando `healing` junto a PII/Judge/a11y-gate.

**Commit**: `feat(qa-automator): fase Q3 quality-greens — /qa-automator:heal + knob healing off-por-defecto (regla #10)`

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
| Q2 (prevención+estabilización) | | | | | | | |
| Q3 (productización Healer) | | | | | | | |

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
