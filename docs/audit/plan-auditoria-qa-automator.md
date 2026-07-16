# Plan: Auditoría interna de `ia4d-qa-automator`

## Context

Quieres un informe de auditoría del agente `ia4d-qa-automator` **para ti** — para leerlo y entender el estado real del agente antes de decidir qué y cómo lo pasas al área de I+D de Inetum (que lo revisará y lo probará). No es un documento de venta dirigido a I+D; es tu documento de preparación, honesto, que además anticipa lo que I+D objetará.

Tu prioridad declarada, por orden: (1) **¿el agente trabaja sesgado?** — puntos débiles; (2) **comparación con el catálogo actual** y anticipación a I+D; (3) **defensa de la construcción** siendo el primer agente QA del catálogo (legítimamente distinto); (4) **cómo extenderlo hacia mantención** de casos de prueba respetando la arquitectura actual (nuevo agente vs. mismo agente ampliado).

Decisiones cerradas contigo: método **desk read-only** (sin re-ejecución; I+D hará sus pruebas), sesgo tratado con **transparencia total** (el doc es para ti), mantención como **sección de roadmap direccional** (sin SPEC completo), entregable **markdown versionado en el repo**.

**Hallazgo central ya confirmado en el código** (por explorar la fuente viva): la ironía que sospechabas es real. El agente que vende "el dev no puede ser juez y parte" es, a nivel de modelo, **juez y parte de sus propios tests**. Con atenuantes reales, pero el hallazgo es sólido. El informe lo desarrolla con evidencia y plan de mitigación.

## Deliverable

Un único informe markdown: **`docs/audit/qa-automator-audit-2026-07.md`** (carpeta `docs/audit/` nueva). Fuente de verdad versionable; convertible a Word/PDF con las convert skills si más adelante decides una entrega formal. Auditoría de escritorio: se sustenta en el código de la fuente viva (`.claude/`, `src/`, `hooks/`), los reports de `docs/findings/`, los unit tests y las fichas de `docs/Inetum/Catalogo/`. Cero re-ejecución.

La mayor parte del trabajo de auditoría **ya está hecha** (exploración de arquitectura, catálogo y findings). La fase de implementación es redactar el informe consolidando esos hallazgos con sus anclas de evidencia (`file_path:line`), en prosa directa de ingeniero senior, español, sin bullets decorativos.

## Estructura del informe

**1. Resumen ejecutivo (1 página, para ti).** Veredicto en tres frases: ¿trabaja sesgado? (sí, matizado — dónde sí y dónde no); estado de madurez (v0.3.2, S2/S3/S4 validados contra sitios reales, S1/OpenAPI stub); los 5 riesgos top; y la línea de defensa frente a I+D. Todo lo demás es respaldo.

**2. Qué es y cómo está construido.** Mapa arquitectónico condensado para fijar el objeto auditado: 5 actos, 4 modos, capa transversal, Quality layer, 12 subagents propios + 3 nativos, orquestación por commands con handoff por archivos JSON. Distinguir claramente **núcleo determinista** (`src/`: `gherkin-to-criteria.ts`, `pii-detector.ts`, `contract-validator.ts`, `pom-scaffolder.ts`, `judge-scoring.ts`, `compliance-preflight.ts`) de **decisión LLM**.

**3. Análisis de sesgo (núcleo del informe).**
- 3.1 La tesis del producto (`SPEC.md:7,11` "QA es juez independiente / dev no puede ser juez y parte") frente a la realidad del código.
- 3.2 **Independencia Writer/Reviewer, desmontada**: mismo modelo base `sonnet` (`ia4d-writer.md:6`, `ia4d-reviewer.md:6`) → errores correlacionados; el juzgado invoca al juez (`ia4d-writer.md:11`, `composition-rules.md:18`); auto-consistencia mandada por prompt (`ia4d-reviewer.md:95`); el rechazo no es vinculante — a N=2 se entrega igual con `iteration_2_exhausted` (`writer-reviewer-protocol.md:102-107`); el Judge (única segunda opinión con modelo distinto, `haiku`) está **off por defecto** y aun encendido es "scoring, not gating" (`ia4d-judge.md:9,11`).
- 3.3 **"Determinístico" que es LLM**: criticidad/dominio/tags/ranking del discovery (`ia4d-discovery-analyzer.md:178-245`, "reglas determinísticas" ejecutadas por un haiku); veredicto del Reviewer MF-1..MF-9 (`ia4d-reviewer.md:28-38`, criterios grep-ables juzgados por LLM); guarda anti-fabricación del planner (orquestador LLM leyendo prosa, `autonomous.md:106-130`); mode-router (`ia4d-mode-router.md:59`); ejes del Judge (`ia4d-judge.md:20-30`).
- 3.4 **Atenuantes reales** (jueces externos genuinos): el QA humano en los ask-first (`SPEC.md:216`), `npx playwright test` (verde/rojo real), y los verificadores deterministas de los bordes (parser Gherkin, PII mod-97/Luhn, contract-validator). El sesgo se concentra en el centro de decisión, no en los bordes.
- 3.5 **Veredicto + mitigación**: diversidad de modelo Writer/Reviewer (p.ej. Reviewer en modelo/proveedor distinto), Judge on por defecto o convertir must-fix objetivos a linter/AST real, revisar la regla de auto-consistencia. Cada mitigación con su coste.

**4. Puntos débiles y riesgos.**
- Puntos únicos de fallo: bypass silencioso del único gate duro si la URL no viaja en `tool_input.url/target/base_url` (`pre-flight.ts:24-53`); `warn` no bloquea en el hook (`pre-flight.ts:78-83`); dependencia de `QA_WORK_DIR` para el aislamiento por sitio; MCP `playwright-test` como dependencia externa dura; Reviewer escribe JSON a mano vía Bash (`ia4d-reviewer.md:75,96`); Allure requiere Java (mitigado por showcase determinista).
- Límites conocidos vigentes (de `docs/findings/`): discovery fabricando `test_id` (latente, no reproducido tras refuerzo de prompt — Fase A); mode-router sin Write (cosmético, funciona por texto); auth multi-sesión / storageState envenenado (Fase E); a11y todo-o-nada (mitigado con gate configurable); `forbid_css_selectors` inviable en legacy (mitigado con `css_fallback_attributes`); anti-bot de producción de terceros (Mapfre) como único límite duro real observado.
- Drift documental: título SPEC "v0.1" vs cuerpo v0.2+; Anexo `SPEC.md:390` "Writer+Reviewer+Judge los tres activos" contradice `SPEC.md:231` (Judge off); `writer-reviewer-protocol.md:111` file-por-sesión vs arquitectura real file-por-spec; dirección de invocación contradictoria (`composition-rules.md:36` vs `SPEC.md:410`).

**5. Comparación con el catálogo y anticipación a I+D.** Tabla "objeción probable → respuesta preparada" cubriendo: la ficha se sale del molde canónico ①-⑦ (añade diferenciación/métricas/roadmap que ninguna otra tiene); AISD adjudica la fase 07 (E2E Playwright) a `testing-core` (`METODOLOGIA AISD.md:151-153`) — defensa por transversalidad de disciplina, aún no escrita en la metodología; complejidad/madurez (15 subagents en v0.3 vs. catálogo v5.x maduro con 1-3 subagents); solapamiento superficial con `testing-core` en "E2E Playwright" — defensa por misión/independencia (`SPEC.md:11`, tabla `ia4d-qa-automator.md:271-285`). Munición: métricas verificadas, gates off por defecto (diseño conservador), justificación regulatoria.

**6. Defensa de la construcción.** Por qué la diferencia es legítima siendo el primer agente QA: es el único multi-modo, único con MCP real y hooks cableados a semántica de negocio, única orquestación en pipeline con estado (vs. fan-out simple del resto del catálogo). La complejidad responde a requisitos que `testing-core` estructuralmente no cubre (compliance regulado, a11y baked-in, trazabilidad RF-NNN, juez independiente).

**7. Roadmap hacia mantención (direccional).** Dos vías con tradeoffs: **A) nuevo agente `test-healer-pro`** vs. **B) extender `qa-automator` con el Modo Incremental S5** ya esbozado (`SPEC.md:346-376`). Encaje arquitectónico: reuso del motor Writer/Reviewer/Judge + componentes Fase C, Acto 0 de ingest de suite viva, no-regresión como entregable, distinguir "test roto por cambio legítimo" de "bug real detectado" (crítico en regulado), segundo eje de drift. Respetar el principio validado "sanación como post-proceso desacoplado, no acoplada a la generación" y la guarda anti-`test.fixme()`. Recomendación con su razón.

**8. Recomendaciones priorizadas.** Tabla impacto × esfuerzo de qué tocar antes de ir a I+D (arreglar drift documental es barato y alto impacto; diversidad de modelo del Reviewer es el fix estructural del sesgo; cerrar bypass del gate; fix mode-router Write).

**9. Anexo: evidencia.** Índice de anclas `file_path:line` citadas, para que I+D (o tú) verifique cada afirmación contra la fuente.

## Verificación

Como el informe es un documento y no código ejecutable, la verificación es de **fidelidad de la evidencia**: antes de dar por cerrado, re-leer cada `file_path:line` citado y confirmar que respalda la afirmación (muestreo del 100% de las citas de las secciones 3 y 4, que son las de mayor carga de juicio). Confirmar que ningún claim del informe excede lo que el código/findings sostienen. El informe debe poder defenderse línea por línea frente a un revisor de I+D que abra los mismos archivos.
