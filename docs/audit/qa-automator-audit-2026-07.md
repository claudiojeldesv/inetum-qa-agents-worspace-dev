# Auditoría interna — `ia4d-qa-automator`

> Documento de trabajo interno. Auditoría de escritorio (read-only) sobre la fuente viva del repo en `develop` (v0.3.2). No es material de venta ni está dirigido a I+D: es la foto honesta del agente para que decidas qué presentas y cómo lo defiendes. Cada afirmación de peso lleva su ancla `archivo:línea` para que se pueda verificar abriendo la fuente. Fecha: 2026-07-16.

---

## 1. Resumen ejecutivo

**¿Trabaja sesgado?** Sí, en un punto concreto y estructural, con atenuantes reales. El agente vende que "el dev no puede ser juez y parte" (`SPEC.md:11`) y sin embargo **es juez y parte de sus propios tests**: quien escribe (Writer) y quien audita (Reviewer) son el mismo motor —`sonnet` los dos (`.claude/agents/ia4d-writer.md:5`, `.claude/agents/ia4d-reviewer.md:5`)—, el escritor invoca al auditor y controla el bucle (`ia4d-writer.md:11,73-77`), la auto-consistencia entre iteraciones está mandada por prompt (`ia4d-reviewer.md:95`), el rechazo no bloquea la entrega (`ia4d-writer.md:77`), y la única segunda opinión con modelo distinto —el Judge, `haiku`— está **apagada por defecto** (`ia4d-judge.md:9,11`). El sesgo se concentra en el centro de decisión; los bordes deterministas (parser Gherkin, PII con mod-97/Luhn, contract-validator) no tienen sesgo. Atenuante genuino: el juez vinculante real no es el LLM sino el QA humano en los *ask-first* (`SPEC.md:210-218`) y `npx playwright test` (verde/rojo).

**Madurez.** v0.3.2. S2 (Gherkin), S3 (Spec-refiner) y S4 (Autonomous) funcionales y validados contra sitios reales (ParaBank 3/3, 5/5; producción regulada Mapfre). S1 (code-driven) y OpenAPI de S2 son stubs. Núcleo determinista con 126 tests unitarios verdes. El único límite duro observado en producción no es de capacidad del agente: es anti-bot de terceros (Mapfre).

**Los cinco riesgos de mayor prioridad** (detalle en §4 y §8):

1. **Sesgo juez-y-parte** en el Quality layer (mismo modelo Writer/Reviewer, juez invocado por el juzgado, rechazo no vinculante, Judge off). Es el corazón de la tesis del producto y es donde más expuesto está.
2. **Bypass silencioso del único gate duro**: si la URL no viaja en `tool_input.url/target/base_url`, el pre-flight hace `return 0` y pasa sin validar (`hooks/pre-flight.ts:24-53`).
3. **Drift documental**: el SPEC se contradice a sí mismo y desmiente al código en varios puntos (§4.3). Barato de arreglar, alto impacto en credibilidad ante un revisor que abra los archivos.
4. **"Determinístico" que en realidad es un LLM**: criticidad, dominio, tags y veredicto del Reviewer se venden como reglas deterministas y las ejecuta un modelo (§3.3).
5. **Solapamiento aparente con `ia4d-testing-core`** en "E2E Playwright", más el hecho de que AISD ya adjudica la fase 07 a testing-core (§5).

**Línea de defensa en una frase.** Es el primer agente QA del catálogo y es legítimamente distinto: multi-modo, con MCP real y hooks cableados a semántica de negocio, orquestación en pipeline con estado (no fan-out simple), y una misión —juez independiente, compliance regulado, trazabilidad auditable— que testing-core estructuralmente no puede cumplir porque opera desde la perspectiva del dev. La complejidad responde a la misión, y los gates conservadores (off por defecto) reducen el riesgo de sobre-ingeniería percibido.

---

## 2. Qué es y cómo está construido

`ia4d-qa-automator` genera tests E2E en Playwright/TypeScript siguiendo un marco QA propio de **5 actos** —Comprender, Mapear, Estructurar, Materializar, Juzgar (`SPEC.md:22-30`)— sobre **4 módulos de entrada**: S1 code-driven (stub), S2 req-driven Gherkin (funcional), S3 spec-refiner FD+URL (funcional), S4 autonomous solo-URL (funcional) (`SPEC.md:15-20`).

Arquitectura interna: **peer subagents** en `.claude/agents/` orquestados por **commands** en `.claude/commands/qa-automator/`, con *handoff por archivos JSON* en rutas predecibles. Hacia el catálogo Inetum se presenta con el patrón canónico Orquestador → Sub-agentes → Comandos → Hooks → MCPs. Coexisten 3 subagents nativos de Microsoft (Planner/Generator/Healer, no editables) y 12 subagents `ia4d-*` propios que los rodean.

Lo importante para esta auditoría es separar dos mundos:

- **Núcleo determinista (TypeScript ejecutable, sin LLM):** `src/gherkin-to-criteria.ts` (parser `@cucumber/gherkin`), `src/pii-detector.ts` (DNI mod-23, IBAN mod-97, Luhn), `src/contract-validator.ts` (schema + Levenshtein para typos), `src/pom-scaffolder.ts` (esqueletos POM), `src/judge-scoring.ts` (media aritmética), `src/compliance-preflight.ts` (matching de URL). Aquí no hay sesgo: entra input, sale output reproducible, y hay 126 tests unitarios cubriéndolo.
- **Centro de decisión (LLM):** discovery-analyzer (`haiku`), mode-router (`haiku`), Writer/Reviewer/Spec-refiner (`sonnet`), Judge (`haiku`), y el propio orquestador (los commands) ramificando según lo que lee. Aquí vive el sesgo.

El pegamento (los JSON de handoff) es determinista en su *transporte*, pero su *contenido* lo producen LLMs. Esa distinción es la que se difumina en la documentación y es la raíz de varios hallazgos de §3.

---

## 3. Análisis de sesgo (núcleo del informe)

### 3.1 La tesis del producto vs. la realidad del código

El objetivo del SPEC lo dice literal: el agente aplica "un Quality layer Writer+Reviewer+Judge que **materializa 'QA es juez independiente'**" (`SPEC.md:7`), y el argumento estructural es "`ia4d-qa-automator` es la herramienta del **juez QA independiente**... **Dev no puede ser juez y parte**" (`SPEC.md:11`).

Esa es la promesa. El código la cumple a nivel de *rol* (hay un agente llamado Reviewer que audita) pero **no a nivel de independencia real del juicio**. Lo desarrollo en 3.2. El matiz importa porque es exactamente el flanco por el que un revisor técnico de I+D atacará: "me vendéis independencia de juicio, pero vuestro juez es el mismo modelo que el autor, invocado por el autor, y vuestra segunda opinión está apagada".

### 3.2 La independencia Writer/Reviewer, desmontada

Cinco hechos, todos verificados en la fuente:

1. **Mismo modelo base.** Writer `model: sonnet` (`ia4d-writer.md:5`), Reviewer `model: sonnet` (`ia4d-reviewer.md:5`), confirmado también en la tabla de decisiones del SPEC (`SPEC.md:393`). Dos instancias del mismo motor no son independientes: sus errores están correlacionados. Lo que un `sonnet` considera "buen locator" o "assert suficiente", otro `sonnet` tiende a bendecirlo. No hay diversidad de modelo, ni de proveedor, ni un prompt-base construido para discrepar. La "independencia" es *role-play dentro del mismo motor*.

2. **El juzgado invoca al juez.** El Writer es "el único subagent que puede invocar a otro subagent" y ese otro es el Reviewer (`ia4d-writer.md:11`). El Writer lee el veredicto y **decide** si itera (`ia4d-writer.md:73-77`). El juez es una subrutina que arranca el ejecutado y cuyo output consume el ejecutado. La dirección de control es exactamente la contraria a la de una auditoría independiente.

3. **Auto-consistencia institucionalizada.** El Reviewer tiene por regla dura: "Be consistent across iterations: if you approved a pattern in iteration 0 of one test, do not reject the same pattern in iteration 0 of another" (`ia4d-reviewer.md:95`). Esto prioriza que el juez se ratifique sobre que corrija: un patrón subóptimo aprobado una vez queda blindado.

4. **El rechazo no es vinculante.** A las N=2 iteraciones sin aprobar, el test **se entrega igual**, guardado tal cual con `result: 'iteration_2_exhausted'` (`ia4d-writer.md:77`; protocolo en `docs/references/writer-reviewer-protocol.md`). El Reviewer puede "rechazar", pero el pipeline no se detiene por ello; solo se escala al QA humano vía *ask-first* (`SPEC.md:216`). El juez opina; no tiene poder de veto.

5. **La segunda opinión está apagada.** El Judge es el único componente con modelo distinto (`haiku`, `ia4d-judge.md:5`) y por tanto la única fuente de des-correlación de errores dentro del agente. Está **off por defecto** (`ia4d-judge.md:11`, `SPEC.md:231`) y, aun encendido, es explícitamente "scoring, not gating — a low score does not prevent delivery" (`ia4d-judge.md:9`). La pieza que más se acercaría a independencia real es opcional y no vinculante.

**Conclusión.** El agente que predica que el dev no puede ser juez y parte es, a nivel de modelo, juez y parte de sus propios tests: genera con `sonnet`, se auto-audita con `sonnet` (invocado por el generador), y opcionalmente se auto-puntúa con `haiku` (apagado). Es la ironía que sospechabas, y está en el código, no en la interpretación.

### 3.3 "Determinístico" que en realidad es LLM

El SPEC apoya su credibilidad en "validación determinística, no LLM-as-validator" (regla dura #5, CLAUDE.md). Es cierto en los bordes (§2) pero se vende de más en el centro:

- **Criticidad, dominio, ranking y taxonomía de tags** del discovery: la sección se titula "Reglas **determinísticas** (aplícalas)" (`ia4d-discovery-analyzer.md:232`) pero el ejecutor es un `haiku` razonando sobre prosa. "Determinístico" aquí significa "reglas claras que le pedimos al modelo que siga", no ejecución reproducible. La criticidad de un flujo bancario la infiere un modelo, sin traza determinista.
- **Veredicto del Reviewer.** Los must-fix MF-1..MF-9 (`ia4d-reviewer.md:28-38`) son en varios casos grep-ables (`waitForTimeout` presente, XPath, falta de `AxeBuilder`). Un linter/AST los verificaría de forma binaria. En cambio los evalúa un `sonnet`. Se presenta como "auditoría objetiva contra criterios"; es juicio LLM sobre criterios.
- **Guarda anti-fabricación del planner.** El command verifica "que el planner navegó de verdad" leyendo el resumen en prosa del planner (`.claude/commands/qa-automator/autonomous.md`, Acto 6.5). Es un LLM certificando que otro LLM no alucinó.
- **mode-router.** Dice "Be deterministic. Same input always → same module" pero es un `haiku` haciendo lo que serían cinco `if` en TypeScript.
- **Score del Judge.** La media aritmética sí es determinista (`src/judge-scoring.ts`), pero los siete ejes que promedia los inventa el LLM (`ia4d-judge.md:19-30`). El número tiene apariencia de métrica objetiva y origen subjetivo.

Ninguno de estos es un defecto fatal —usar un LLM para inferir criticidad es razonable—, pero **llamarlo "determinístico" es un claim que el código no respalda** y que un revisor detectará.

### 3.4 Los atenuantes son reales

No todo es sesgo. Hay tres jueces genuinamente externos al LLM generador, y conviene tenerlos claros porque son la defensa honesta:

1. **El QA humano.** El pipeline se detiene y pregunta en los puntos que importan: Reviewer agotó N=2, Judge marca >30% de tests con score <0.5, compliance devuelve warnings, targetear URL no declarada (`SPEC.md:210-218`). El veredicto vinculante final es humano.
2. **`npx playwright test`.** Verde/rojo contra el DOM real es un juez que no comparte los sesgos del generador. Toda la evidencia de `docs/findings/` se ancla aquí, no en el score del Judge.
3. **Los verificadores deterministas de los bordes.** El parser Gherkin marca `[AMBIGUO]` si falta el `Then` y el Writer tiene prohibido inventarlo (`ia4d-writer.md:88-91`); el PII detector es matemático; el contract-validator es schema. Estos sí son independientes del juicio del modelo.

El encuadre honesto: **el agente no delega el juicio final a un LLM sesgado; lo delega al QA humano y a la ejecución real.** El Quality layer LLM es un filtro de primera pasada, no el juez independiente que el marketing sugiere.

### 3.5 Veredicto y plan de mitigación

Veredicto: el agente trabaja con un sesgo estructural acotado al Quality layer LLM, mitigado —no eliminado— por jueces externos humanos y de ejecución. La afirmación "QA es juez independiente" es defendible solo si se reformula: *el juez independiente es el QA humano y la ejecución; el Quality layer es asistencia de calidad, no el juez.*

Mitigaciones, por relación impacto/esfuerzo:

- **(Alto impacto, medio esfuerzo) Diversidad de modelo Writer↔Reviewer.** Que el Reviewer corra en un modelo distinto al Writer (p.ej. Writer `sonnet`, Reviewer otro tier/familia). Rompe la correlación de errores sin tocar la arquitectura. Es el fix que más acerca el código a la tesis.
- **(Alto impacto, bajo esfuerzo) Convertir los must-fix objetivos a verificación determinista.** MF-2 (`waitForTimeout`), MF-4 (`AxeBuilder` ausente), MF-1 (XPath/CSS bruto) son grep/AST. Moverlos a un chequeo TS convierte parte del veredicto en algo realmente objetivo y deja al LLM solo lo que requiere juicio (MF-3, MF-9). Alinea el discurso "validación determinística" con el código.
- **(Medio impacto, bajo esfuerzo) Judge on por defecto** (o al menos on en modo regulado). Recupera la segunda opinión con modelo distinto. Coste: ~tokens de un `haiku` por test.
- **(Medio impacto, bajo esfuerzo) Revisar la regla de auto-consistencia** (`ia4d-reviewer.md:95`) para que ceda ante corrección: consistente salvo que el patrón sea un must-fix.
- **(Discurso) Reetiquetar "determinístico".** Donde es LLM, decir "reglas heurísticas aplicadas por el modelo"; reservar "determinístico" para `src/`. Cuesta cero y elimina el flanco de §3.3.

---

## 4. Puntos débiles y riesgos

### 4.1 Puntos únicos de fallo

- **Bypass silencioso del único gate duro.** `pre-flight.ts` extrae la URL solo de `tool_input.url ?? target ?? base_url` (`hooks/pre-flight.ts:24-32`); si no hay URL en esos campos, `return 0` → pasa (`:50-53`). El gate "sin override" (`SPEC.md:224`) tiene una puerta trasera no intencionada: si el nombre de la tool MCP cambia, si la navegación llega por otro canal, o si la URL viaja en otro campo, el compliance no se aplica y nadie se entera. Además, `warn` tampoco bloquea en el hook (`:78-83`): el *ask-first* ante URL sospechosa vive en el command (LLM), no en el gate. **Recomendación**: fail-closed cuando el matcher dispara pero no se puede extraer URL, o registrar un warning visible.
- **`QA_WORK_DIR`.** Todo el aislamiento por sitio depende de exportar esa env var; si el orquestador la olvida, los sitios colapsan a `.work/` y se contaminan entre sí (síntoma ya sufrido, ver `docs/findings/`).
- **MCP `playwright-test`.** Toda la generación S4 cuelga del MCP nativo; si está caído, el planner "puede fabricar un plan adivinado o colgarse" (`autonomous.md`, Acto 6.5). Dependencia externa dura.
- **Reviewer escribe JSON a mano vía Bash.** El Reviewer no tiene tool `Write`; construye el feedback con `echo`/heredoc y escapado manual de comillas y backslashes (`ia4d-reviewer.md:75,96`). Un escapado mal hecho corrompe el JSON y el feedback se pierde en la consolidación. La v0.3.2 ya parchea el caso del consolidador tragando JSON inválido, pero la fragilidad de origen sigue.
- **Allure requiere Java.** Sin JRE no hay reporte Allure (`report.md`), mitigado porque el showcase determinista se genera primero y sin Java.

### 4.2 Límites conocidos vigentes (de `docs/findings/`)

- **discovery-analyzer fabricando `test_id`** (Fase A): derivaba el identificador de la prosa del plan (`user-name` en vez del `data-test` real `username`), rompiendo 0/3 specs; sanado a 4/4 por el Healer. Latente: no se reprodujo tras reforzar el prompt (3/3 honraron `test_id: null` en Fase B), pero es evidencia de que la disciplina "no fabricar" es honor-system del prompt y falla bajo presión.
- **mode-router sin `Write`.** Declara `tools: Read, Glob`; no puede persistir `mode-routing.json` aunque su spec y los commands lo pidan. Funciona porque el orquestador lee su respuesta de texto; es cosmético, pero es un contrato de handoff incumplido. Fix trivial: añadir `Write`.
- **auth multi-sesión / storageState envenenado** (Fase E): un solo `storageState` compartido + un test que cierra sesión invalida el JSESSIONID de los tests concurrentes. Mitigado caso a caso con sesión aislada; no hay solución general declarativa en el contract.
- **A11y todo-o-nada** (Fase B): el `AxeBuilder` abortaba un login por un contraste fuera del flujo. Mitigado con el gate configurable `fail_on_violations` (off por defecto → modo warning).
- **`forbid_css_selectors` inviable en legacy** (ParaBank JSP sin labels/aria/data-test). Mitigado con `locators.css_fallback_attributes` (whitelist `name`/`id`).
- **Anti-bot de producción de terceros** (Mapfre): el único límite duro real observado. No es capacidad del agente; el test era estructuralmente correcto y terminó en `test.fixme` aprobado por el Healer por bloqueo server-side. Lección: contra prod de terceros el límite operativo es el anti-bot, no el motor.

### 4.3 Drift documental

Esto es barato de arreglar y caro de dejar: un revisor de I+D que abra los archivos verá al SPEC contradecirse. Hallazgos concretos:

- **El SPEC se contradice sobre el Judge.** `SPEC.md:390` (Anexo de decisiones) dice "Quality layer | Writer + Reviewer + Judge **los tres activos**". `SPEC.md:231` dice "el **Judge es opcional, off por defecto**". El código confirma 231 (`ia4d-judge.md:11`). El Anexo quedó desactualizado.
- **Título del SPEC.** Se titula "v0.1 (MVP)" (`SPEC.md:1`) pero el cuerpo documenta hasta v0.2 Fase E y v0.3. `package.json` va por 0.3.2. El título subvende el estado real.
- **Tag `@happy-path` fantasma.** `SPEC.md:204` lista `@happy-path` como tag válido, pero `ia4d-writer.md:27` y `ia4d-discovery-analyzer.md:232` dicen que quedó eliminado ("happy path NO es un valor"). Contradicción SPEC↔agentes.
- **Dirección de invocación contradictoria.** `SPEC.md:410` (riesgo #9) habla de "el 'Reviewer puede invocar Writer' rompe la regla", pero la arquitectura real es Writer→Reviewer, controlada por el Writer (`composition-rules.md`, `ia4d-writer.md:11`). El texto del riesgo describe una dirección que no existe.
- **DoD MVP desalineado.** `SPEC.md:387` fija "≤8 min wall-clock" como Definition of Done, pero los findings documentan runs de 30-45 min en apps reales. Y `SPEC.md` cita al Judge produciendo `judge-report.json` como criterio de Done, cuando el Judge ya no corre por defecto.
- **Protocolo Writer-Reviewer desactualizado.** `docs/references/writer-reviewer-protocol.md` describe "un archivo por sesión" mientras los agentes ya usan fichero-por-spec (`ia4d-reviewer.md:73-80`) precisamente para evitar corrupción por append concurrente.

---

## 5. Comparación con el catálogo y anticipación a I+D

El catálogo `ia4d-*` tiene fichas en formato canónico ①-⑦ (Agente Principal, Uso, Casos de Uso, Sub-Agentes, Flujo + Arquitectura, Entradas/Salidas, Comandos). qa-automator es, con diferencia, el más complejo del catálogo: 12 subagents propios + 3 nativos (el resto van de 1 a ~8), único con MCP real y pineado (`playwright-test`), único con hooks cableados a semántica de negocio, y única orquestación en pipeline con estado frente al fan-out simple ("clasifica input → delega a 1 de N → merge") del resto. Es más joven (v0.3.x) que un catálogo con varios agentes en v5.x.

Tabla objeción probable → respuesta preparada:

| Lo que dirá I+D | Respuesta preparada |
|---|---|
| "Ya tenemos `ia4d-testing-core` para E2E Playwright. Esto solapa." | Solapan en la herramienta (Playwright/POM), no en la misión. testing-core es whitebox del dev sobre su propio código; qa-automator es greybox/blackbox del juez QA independiente, multi-modo, con compliance regulado, a11y baked-in y trazabilidad RF-NNN. "Dev no puede ser juez y parte" (`SPEC.md:11`). **Ojo**: esta defensa es de misión/gobernanza, no de capacidad técnica exclusiva; prepárate para "¿por qué no añadir estas features a testing-core?" → porque la independencia del juez exige otra herramienta y otra forma de operar, no un modo más del dev. |
| "AISD asigna la fase 07 (E2E Playwright) a testing-core." | Cierto y está escrito en la metodología. qa-automator opera transversal por disciplina QA (toca fases 01, 04, 07, 08), no como fase. **Debilidad honesta**: esa transversalidad no está escrita en AISD todavía; es argumento conceptual. Vale la pena proponer a I+D añadirlo a la metodología. |
| "La ficha se sale del molde ①-⑦ (añade diferenciación, métricas, roadmap)." | Fácil de corregir: mover diferenciación/métricas/roadmap a un anexo y dejar la ficha en el molde estricto. Es cosmético. |
| "15 subagents en una v0.3 es sobre-ingeniería." | La complejidad responde a requisitos que testing-core no cubre (compliance regulado, a11y obligatorio, trazabilidad auditable, juez independiente). Los gates opcionales están off por defecto (diseño conservador). Hay evidencia de validación por fase en `docs/findings/`. |
| "Es v0.3, el catálogo es maduro (v5.x)." | Es el primer agente QA del catálogo; no hay precedente con el que compararlo. La madurez se demuestra con la evidencia real de runs verdes contra sitios reales, no con el número de versión. |

No hay en el repo una rúbrica formal de admisión al catálogo; lo único documentado es "cumplir el patrón canónico + formato de ficha" (`SPEC.md`, CLAUDE.md), y la admisión formal es explícitamente post-MVP. Es decir: no hay un checklist objetivo contra el que te vayan a puntuar; será juicio de I+D. Eso hace que el drift documental (§4.3) pese más de lo que parece, porque la impresión de rigor es parte de la evaluación.

---

## 6. Defensa de la construcción

Siendo el primer agente QA del catálogo, ser distinto no es un defecto a excusar sino la razón de existir. Los argumentos que sostienen la construcción, con evidencia:

- **Es cualitativamente más capaz que un orquestador de fan-out.** El resto del catálogo reparte a especialistas independientes y fusiona. qa-automator mantiene estado entre actos, compone Writer→Reviewer con un bucle acotado, y ramifica por gates. Es una arquitectura más sofisticada, no más grande porque sí.
- **Cumple requisitos que testing-core no puede cumplir por diseño**, no por falta de features: independencia del juez (aunque imperfecta, §3), compliance pre-flight regulado, PII banca-ES, a11y baked-in, trazabilidad `@criterion RF-NNN` + drift-report + audit-log. Un dev testeando su propio código no produce esa evidencia auditable con la misma credibilidad.
- **La evidencia es real y reproducible**: S3 3/3 y S2 5/5 contra ParaBank con paralelismo real (sin `--workers=1`), S3 contra producción regulada (Mapfre) demostrando la tesis de valor —detección de drift FD↔app sin fabricar tests—, 126 unit tests verdes sobre el núcleo determinista.
- **El diseño es conservador donde importa**: gates opcionales off por defecto, sanación como post-proceso desacoplado (no acoplada a la generación), guarda anti-`test.fixme()` siempre activa. No es un agente que "hace magia"; es uno que se detiene y pregunta.

La honestidad de esta sección: la defensa más fuerte es la evidencia de runs y la misión incompatible con testing-core. La defensa más débil es el discurso de "juez independiente" y "determinístico", que el código matiza (§3). Si arreglas §3.5 y §4.3 antes de ir a I+D, la construcción se defiende sola.

---

## 7. Roadmap direccional hacia mantención de casos de prueba

Los cuatro modos actuales son *bootstrap-only*: generan una suite desde cero. Pero el QA pasa el ~80% de su vida en régimen permanente —mantener y extender suites que ya existen— no en el momento cero. Hoy el agente re-descubriría el sitio y probablemente duplicaría POMs y solaparía cobertura. Cubrir mantención es el siguiente salto de valor, y el terreno ya está esbozado en el **Modo Incremental S5** (`SPEC.md`, sección de roadmap) con cuatro decisiones abiertas.

Dos vías:

**Vía A — nuevo agente `test-healer-pro` (o `test-maintainer`).** Un agente separado en la cartera, con su propio SPEC. Pro: separación de misiones limpia (generar vs. mantener), cada uno evoluciona por su cuenta, encaja con la narrativa de cartera. Contra: duplica motor (discovery, POM, Writer/Reviewer/Judge) o crea dependencia entre agentes; más superficie que mantener; el catálogo ve otro agente v0.1.

**Vía B — extender `qa-automator` con el Modo Incremental S5.** Un quinto modo dentro del agente actual. Pro: reusa ~70% del motor (S5 no es un motor nuevo, es S2/S3 precedidos de un "Acto 0" de comprensión de lo existente); una sola herramienta que cubre todo el ciclo de vida de la suite; coherente con "editar sobre crear". Contra: engorda un agente ya complejo; mezcla bootstrap y mantención en la misma superficie.

**Recomendación: Vía B para la capacidad de mantención básica (no-regresión + reconciliación), reservando un agente separado solo si la mantención crece hasta justificar misión propia.** Razón: la mantención comparte casi todo con la generación (mismo motor, mismo Quality layer, mismo principio de sanación al final); un agente nuevo duplicaría sin aportar misión distinta —al contrario que qa-automator vs testing-core, donde la misión sí es incompatible. La regla del catálogo "un agente = una misión" se cumple mejor viendo "calidad de la suite E2E de QA" como una sola misión con un modo de arranque y un modo de mantenimiento.

Lo que la mantención necesita, respetando la arquitectura actual:

- **Acto 0 de ingest**: leer la suite viva, inferir el Style Contract implícito, mapear cobertura existente, evitar duplicar POMs.
- **No-regresión como entregable**: correr los N tests existentes tras el delta y garantizar que siguen verdes (conecta con el hallazgo de storageState envenenado de Fase E: la mantención expone races que el bootstrap no).
- **Distinguir "test roto por cambio legítimo de la app" de "bug real detectado".** El Healer nativo sana ciegamente hacia verde; en un dominio regulado eso es peligroso porque puede enmascarar un defecto. Aquí el Quality layer y, sobre todo, el QA humano (ask-first) son la salvaguarda. Es, además, otra oportunidad de reforzar la independencia del juicio (§3).
- **Segundo eje de drift**: además de FD↔app, requisito-nuevo↔suite-existente.
- **Respetar el principio validado**: sanación como post-proceso desacoplado (no acoplada a generación) y guarda anti-`test.fixme()` siempre activa.

Las cuatro decisiones abiertas del S5 (extender POMs vs añadir-only; quién manda el estilo cuando lo existente es malo; no-regresión como entregable; segundo eje de drift) son las que habría que cerrar en el SPEC de esa capacidad. Ninguna requiere motor nuevo.

---

## 8. Recomendaciones priorizadas (antes de ir a I+D)

| # | Acción | Impacto | Esfuerzo | Por qué |
|---|---|---|---|---|
| 1 | Arreglar el drift documental de §4.3 (SPEC vs código: Judge, título, `@happy-path`, dirección de invocación, DoD, protocolo) | Alto | Bajo | Es lo primero que ve un revisor que abre los archivos; barato y elimina la impresión de descuido justo donde no hay rúbrica objetiva. |
| 2 | Reetiquetar "determinístico" donde es LLM (§3.3) | Alto | Bajo | Cierra el flanco "me vendéis determinismo y es un modelo". Cero código. |
| 3 | Cerrar el bypass del gate de compliance (fail-closed o warning visible cuando no hay URL) (§4.1) | Alto | Bajo/Medio | El gate "sin override" tiene puerta trasera; es el argumento de compliance regulado, tiene que ser sólido. |
| 4 | Diversidad de modelo Writer↔Reviewer (§3.5) | Alto | Medio | Es el fix estructural del sesgo; convierte la tesis "juez independiente" en algo que el código respalda. |
| 5 | Mover MF-1/MF-2/MF-4 a verificación determinista (linter/AST) (§3.5) | Medio | Medio | Alinea discurso y código, y hace el veredicto parcialmente objetivo de verdad. |
| 6 | Añadir `Write` al mode-router (§4.2) | Bajo | Trivial | Cierra un contrato de handoff incumplido; es gratis. |
| 7 | Judge on por defecto en modo regulado (§3.5) | Medio | Bajo | Recupera la segunda opinión con modelo distinto. |
| 8 | Ficha del catálogo al molde ①-⑦ estricto (§5) | Medio | Bajo | Anticipa la objeción de formato; mover métricas/roadmap a anexo. |

Los cuatro primeros son los que yo cerraría sí o sí antes de que I+D lo pruebe. 1 y 2 son casi gratis y quitan munición; 3 y 4 son los que sostienen las dos promesas centrales del producto (compliance sin override, juez independiente).

---

## 9. Anexo — índice de evidencia

Anclas citadas, para verificar contra la fuente:

- **Tesis / sesgo**: `SPEC.md:7`, `SPEC.md:11`, `.claude/agents/ia4d-writer.md:5,11,73-77,88-91`, `.claude/agents/ia4d-reviewer.md:5,28-38,95,75,96`, `.claude/agents/ia4d-judge.md:5,9,11,19-30`, `SPEC.md:393`.
- **"Determinístico" que es LLM**: `.claude/agents/ia4d-discovery-analyzer.md:225-245`, `.claude/agents/ia4d-reviewer.md:28-38`, `.claude/commands/qa-automator/autonomous.md` (Acto 6.5), `src/judge-scoring.ts`.
- **Atenuantes**: `SPEC.md:210-218`, `.claude/agents/ia4d-writer.md:88-91`.
- **Puntos únicos de fallo**: `hooks/pre-flight.ts:24-53,78-83`, `.claude/agents/ia4d-reviewer.md:75,96`.
- **Drift documental**: `SPEC.md:1,204,231,390,410,387`, `ia4d-writer.md:27`, `ia4d-discovery-analyzer.md:232`, `docs/references/writer-reviewer-protocol.md`.
- **Límites de findings**: `docs/findings/` (faseA-closure, wild-sites-report, faseD-s3, faseE-s2, faseF-mapfre).
- **Catálogo**: `docs/Inetum/Catalogo/ia4d-qa-automator.md`, `docs/Inetum/Catalogo/ia4d-testing-core.md`, `METODOLOGIA AISD.md`.
- **Roadmap mantención**: `SPEC.md` (sección roadmap / Modo Incremental S5).
- **Núcleo determinista**: `src/gherkin-to-criteria.ts`, `src/pii-detector.ts`, `src/contract-validator.ts`, `src/pom-scaffolder.ts`, `src/compliance-preflight.ts`; 126 tests en `tests/unit/`.
