# Proyecto: `ia4d-qa-automator` — categoría Documentación y Calidad del catálogo `ia4d-*`

Construir el primer agente QA del catálogo Inetum: **`ia4d-qa-automator`**. Multiplicador de productividad para SDETs e ingenieros QA, multi-modo según la información disponible, con marco QA propio (no fase 07 estricta de AISD), Quality layer Writer+Reviewer+Judge que materializa "QA es juez independiente", y capa transversal de compliance regulado, accesibilidad y trazabilidad auditable.

Es el primer entregable de una cartera más amplia (`test-explorer`, `test-healer-pro`, `test-data-architect`, `test-quality-analyst`, `ai-feature-quality`, etc.). Cada uno tendrá su propio SPEC cuando llegue su turno. **Foco actual: solo `qa-automator`**.

## Sobre nosotros

Ingeniero QA / SDET con experiencia en banca y seguros regulados. Foco profesional: experto en agentes Claude Code aplicados a QA — intersección rara entre conocimiento QA en dominios regulados y capacidad agéntica.

## Posicionamiento del producto

- **Lead de venta**: *"Tu SDET pasa de un flujo funcional (o solo URL) a tests Playwright estructurados con POM, A11y baked-in y trazabilidad auditable, en minutos, con un Reviewer independiente que audita al Writer antes de exponer el código"*. Velocidad + estructura como impacto demostrable.
- **Argumento estructural** (no de venta, de naturaleza): **dev no puede ser juez y parte**. `ia4d-testing-core` es la herramienta del dev que escribe tests sobre su propio código. `ia4d-qa-automator` es la herramienta del juez QA independiente. Misión distinta, no perspectiva distinta. Las herramientas QA tienen **otra forma de operar**.
- **Backup (regulated safety)**: compliance pre-flight sin override, PII detector ES (DNI/IBAN/Luhn/teléfono/email), A11y baked-in (axe-core, WCAG 2.1 AA / EAA 2025), audit log JSON append-only para evidencia regulatoria.
- **Público primario**: SDET (usuario directo) + QA Manager (decisor cliente) + I+D Inetum (decisor catálogo).
- **Anti-positioning**: NO sustituye a `ia4d-testing-core`. Coexisten con misiones incompatibles — testing-core opera desde la perspectiva dev (whitebox total sobre código propio), qa-automator desde la perspectiva juez QA (greybox o black-box, cuatro modos según input).

## Marco QA propio (no AISD fase 07 estricta)

`ia4d-qa-automator` opera **transversal por disciplina QA propia**, no por imitar a `ia4d-quality-engineer-expert`. Justificación: QA es disciplina, no fase del proceso dev. Automatizar un sitio tiene estrategias distintas a desarrollar código.

Cinco actos:

1. **Comprender** — Determinar modo de entrada (S1/S2/S3/S4) y validar target.
2. **Mapear** — Discovery del target. Identificar pantallas, flujos, criticidad, riesgo.
3. **Estructurar** — POM determinístico, Style Contract aplicado, fixtures, datos sintéticos.
4. **Materializar** — Writer genera tests; capa transversal (compliance/PII/A11y/style) los enforce.
5. **Juzgar** — Reviewer audita al Writer (ping-pong con N≤2 iteraciones), Judge puntúa, SDET sign-off.

## Cuatro módulos de entrada

| Módulo | Entrada | Estado MVP v0.1 |
|---|---|---|
| **S1 Code-driven** | Repo frontend (React/Vue/HTML) | Stub documentado |
| **S2 Req-driven** | Gherkin / OpenAPI / specs maduras | Stub documentado |
| **S3 Spec-refiner** | DF flojo / PDF / Jira mal redactado | Stub documentado |
| **S4 Autonomous (MCP)** | Solo URL | **Funcional** |

En MVP v0.1 solo S4 es funcional. S1/S2/S3 están documentados con prompts iniciales y un command que devuelve `not implemented v0.1`. Roadmap en [SPEC.md](SPEC.md).

## Contexto Inetum

- Portal corporativo GenAI con dos secciones: Plugins (~70, dev-céntrico) y Agentes (curado por I+D). Nuestro destino: **pestaña Documentación y Calidad** del catálogo de Agentes.
- **Patrón canónico Inetum**: Orquestador → Sub-agentes → Comandos → Hooks → MCPs. Lo respetamos en la presentación al catálogo. La ficha del catálogo (`docs/Inetum/Catalogo/ia4d-qa-automator.md`) sigue el formato canónico ①-⑦.
- **Metodología AISD** (10 fases de DF a MVP, ver [`METODOLOGIA AISD.md`](METODOLOGIA AISD.md)): nuestra suite opera **across the SDLC por disciplina QA propia**, conectándose a fase 01 (cuando S3 refina DF), fase 04 (cuando S2 consume OpenAPI), fase 07 (modo Testing principal) y fase 08 (evidencia para Validación).

## Arquitectura del proyecto

Peer subagents en `.claude/agents/`, orquestados por commands en `.claude/commands/qa-automator/`. Co-existen subagents nativos de Playwright (Microsoft, motor) y subagents `ia4d-*` propios (envuelven y enforce).

```
.claude/agents/
├── playwright-test-{planner,generator,healer}.md       (nativos Microsoft, vía init-agents, no editar)
├── ia4d-{compliance-checker,pii-scanner,style-enforcer,
│        a11y-injector}.md                              (capa transversal)
├── ia4d-{writer,reviewer,judge}.md                     (Quality layer)
├── ia4d-{discovery-analyzer,mode-router}.md            (S4 Autonomous + dispatcher)
└── ia4d-{code-analyzer,spec-parser,spec-refiner}.md    (stubs S1/S2/S3, v0.2+)

.claude/commands/qa-automator/
├── healthcheck.md
├── autonomous.md                                       (S4 funcional)
├── code-driven.md  req-driven.md  spec-refiner.md      (stubs)
```

**Regla arquitectónica suavizada**: por defecto, los subagents `ia4d-*` no se invocan entre sí — la orquestación vive en los commands con handoff por archivos. **Excepción documentada y nombrada**: el par Writer↔Reviewer se invoca directamente vía Task tool dentro del Writer (composición explícita del patrón Writer+Reviewer, no acoplamiento ad-hoc). Auditabilidad se preserva por `audit-log.json`, no por estructura. Ver [`docs/references/composition-rules.md`](docs/references/composition-rules.md).

Detalle completo en [`SPEC.md`](SPEC.md).

## Wrapper sobre Playwright Test Agents nativos

Playwright v1.56+ trae tres subagents nativos (Planner, Generator, Healer) instalados con `npx playwright init-agents --loop=claude`. **No los reimplementamos** — los rodeamos con capas que aportan lo que Microsoft no construirá: compliance regulado, convenciones de cliente, trazabilidad auditable, A11y obligatorio, PII detection ES, Quality layer Writer+Reviewer+Judge.

Datos consolidados del Slice 0.5 (ver [`docs/findings/spike-playwright-mcp.md`](docs/findings/spike-playwright-mcp.md)):

| Invocación | Tokens | Tool uses | Duración |
|---|---|---|---|
| Planner SauceDemo | 32,051 | 38 | 3.4 min |
| Generator (1 test) | 30,751 | 25 | 3.4 min |

Modelo confirmado para Planner/Generator nativos: `sonnet`. Para subagents `ia4d-*`: Sonnet para Writer/Reviewer/Spec-refiner (razonamiento), Haiku para Judge y mecánicos (style-enforcer/pii-scanner/a11y-injector/discovery-analyzer/mode-router).

## Reglas duras

1. **Patrón Inetum cumplido externamente** (Orquestador → Sub-agentes → Comandos → Hooks → MCPs visibles para I+D, en la ficha del catálogo y en la documentación pública), arquitectura peer internamente. No hay contradicción.
2. **Subagents no se invocan entre sí salvo excepción documentada**. Por defecto, commands orquestan vía Task tool. Handoff por archivos. Excepción nombrada: Writer↔Reviewer.
3. **Compliance pre-flight no tiene flag de override**. Cualquier salto rompe el SPEC. (El **PII detector** pasó a ser **off por defecto, reactivable** con `QA_ENABLE_PII` desde v0.2 `design/gates-off-by-default` — ver regla #10. La guarda anti-`test.fixme()` del mismo hook sigue siempre activa.)
4. **Style Contract L0** declara convenciones del cliente (POM, naming, locators, fixtures). El agente lo lee y enforce el output del Generator nativo. Si no hay contract, default del agente + log.
5. **Validación determinística**, no LLM-as-validator. AST + JSON Schema + regex. LLM-as-judge sí existe — pero es scoring de calidad, no validador binario de compliance.
6. **Datos productivos fuera del contexto**. El agente trabaja con artefactos de definición (FD/TD/OpenAPI) y datos sintéticos declarados. Nunca con dumps reales. Context Injector (v0.4 con asterisco "no genérico") es la única excepción contemplada y queda fuera de MVP/v0.2/v0.3.
7. **POM esqueleto generado por código determinístico** (`src/pom-scaffolder.ts`), no por LLM. El LLM solo rellena locators y acciones específicas. Justificación: velocidad + estructura consistente.
8. **Writer + Reviewer obligatorios**: el núcleo del Quality layer. El Reviewer puede pedir hasta dos iteraciones al Writer antes de aprobar. El **Judge es opcional, off por defecto** (`QA_ENABLE_JUDGE`) desde v0.2 `design/gates-off-by-default` — ver regla #10. Cuando se activa, da score numérico final.
9. **Behavioral non-negotiables siempre activos**: surface assumptions, push back con dato, scope discipline, verify-don't-assume, no rationalize shortcuts. Si una tarea está fuera del SPEC, decirlo, no estirar.
10. **Gates opcionales, off por defecto (v0.2 `design/gates-off-by-default`)**: `ia4d-pii-scanner`, `ia4d-judge` y el **gate** de `ia4d-a11y-injector` están **apagados por defecto y reactivables**, NO eliminados — funcionalidades del producto que se encienden cuando el cliente las necesita. Las piezas siguen completas en el repo (hook, agente Judge, lógica del gate). Reactivación: `QA_ENABLE_PII=1` (PII), `QA_ENABLE_JUDGE=1` (Judge), `fail_on_violations: true` en el Style Contract (gate a11y por-sitio). El **scan** de a11y se sigue inyectando siempre; lo apagado es solo el gate que aborta. Esta regla matiza las reglas #3 y #8.

## Estado actual

- **Release `v0.2.0`** (tag git sobre `design/gates-off-by-default`; `package.json` 0.1.0→0.2.0; `CHANGELOG.md` creado). Cierre de v0.2: S2/S3/S4 + gates-off + hardening Fase C. Se publica el workspace **`template/`** autocontenido para SDETs (runtime + ejemplos solo-inputs SauceDemo/ParaBank + `CLAUDE.md` guía de uso + README quickstart), separado del material de construcción que se queda en este repo. Validación estructural del template verde: healthcheck 18/18, unit 55/55, build limpio, hook de compliance allow/block correcto. **Hallazgo del release, corregido**: los hooks (`hooks/hooks.json`) nunca estuvieron cableados vía settings en este repo — Claude Code carga hooks desde `.claude/settings.json`, no desde un `hooks.json` suelto. Se añadió `.claude/settings.json` versionado (raíz y template) que cablea los 3 hooks. A partir de ahora compliance pre-flight / PII (off) / audit-write se disparan también en sesiones de construcción; gates siguen off por env-var.
- **Cambio de diseño `design/gates-off-by-default`** (branch nuevo): pii-scanner, judge y gate de a11y pasan a **off por defecto, reactivables** (no eliminados). Ver regla dura #10. Toggle: `QA_ENABLE_PII` / `QA_ENABLE_JUDGE` (env-var) y `fail_on_violations: true` (contract, por-sitio). Motivo: simplificar el diseño + velocidad. Compliance pre-flight, Writer+Reviewer, scan de a11y y guarda anti-fixme intactos.
- **v0.1 commit-eado** (`c5a2be2`). El Slice 6.5 dio 3/3 verdes, pero era validación **híbrida** (locators correctos a mano), no el camino puro LLM-LLM.
- **v0.2 Fase A — cierre v0.1 COMPLETADA** (commit `ef5611e`): validación end-to-end LLM-LLM en sesión nueva. Los 13 subagents invocables, 5 actos orquestados. Runtime inicial **0/3** — el `ia4d-discovery-analyzer` fabrica `test_id` desde la prosa del plan (viola su propia hard rule); sanado a **4/4** vía `playwright-test-healer`. Evidencia en `docs/findings/faseA-closure/`.
- **v0.2 Fase B — CERRADA** (3 sitios: expandtesting, Toolshop, parabank; commit `16c95da`; detalle en [`docs/findings/wild-sites-report.md`](docs/findings/wild-sites-report.md)): producción contra sitios reales con catalogación incidental, brief happy-path acotado (`--flows/--entry/--ignore`). Dato estrella: el brief **escala a sitios grandes** (Toolshop → 10 tool-uses vs 62 del ciego). Frecuencias y priorización por impacto×frecuencia cerradas en el report.
- **v0.2 Fase C — CONSTRUIDA y VALIDADA** (commits `8aae203` build + `2d90e3d` validación live). Los 3 componentes top **como campos del style-contract + lógica en agentes existentes, sin subagents nuevos** (decisión: evidencia n=1/n=2 + editar-sobre-crear):
  1. **a11y gate configurable** — `fail_on_violations` por-sitio; el scan siempre se inyecta, `false` → modo warning a `test.info().annotations` (evidencia, no aborta). Es el flag, NO el baseline-diff (diferido a v0.2.x).
  2. **auth-handler acotado** — campo `auth:` en schema + setup project + `dependencies` condicionales por `QA_STORAGE_STATE` en el config. Mata la race del storageState sin `--workers=1`. Form-based; SAML/OAuth/MFA/TOTP diferidos.
  3. **excepción CSS legacy** — `locators.css_fallback_attributes` (whitelist `name`/`id`), honrada por enforcer + reviewer (MF-1). Declarativa y determinística, nunca CSS arbitrario.
  Validación parabank **5/5 verde, 4 workers, sin `--workers=1`**. Detalle + lecciones en el report, sección "Validación Fase C". El plumbing del brief (Reconocimiento happy-path) ya está en `autonomous.md`.
- **v0.2 Fase D / S3 (Spec-refiner) — CERRADA, FORMA B** (S3.1 build `816a2ed`/`caba464`; S3.2 validación end-to-end; detalle en [`docs/findings/faseD-s3/s3.2-validation-report.md`](docs/findings/faseD-s3/s3.2-validation-report.md)): FD + URL = inyección de criterios sobre el motor S4 validado (reusa discovery/POM/Writer/Reviewer/Judge + los 3 componentes de C). El FD (`ia4d-spec-refiner`) emite `criteria.json` (RF-NNN) + brief; el planner pasa de descubrir a **mapear-contra-DOM**; `discovery-analyzer` con `--criteria` añade `criteria_mapping`; el Writer cita `@criterion RF-NNN (source_ref)`; diff determinístico en el command → `drift-report.json`. **Validado contra ParaBank: 3/3 verde** (RF-001/RF-003/RF-006), 3 workers sin `--workers=1`. Gate de open_questions bloquea RF-002/RF-004/RF-005 (no fabrica el `then` ambiguo). **Drift demostrado en ambos sentidos**: bill-pay (FD lo declaraba no-expuesto, pero ParaBank sí lo expone → no-drift, no se fabricó gap) y auth-guard (drift conductual real: FD asume redirect, app da error server-side). No-regresión S4 verificada en vivo. Refinamiento = extrae + marca huecos, no inventa: confirmado. Markdown libre como input: confirmado. Forma A (FD-only) descartada. **S2 (Gherkin/OpenAPI) y Jira/tickets diferidos al final.** Tuning restante (Writer↔Reviewer N=3, judge axes por contract) no bloquea. Hallazgo abierto: `ia4d-mode-router` tiene `tools: Read, Glob` sin Write → no persiste `mode-routing.json` (funciona por la respuesta de texto que lee el orquestador); fix pendiente.
- **v0.2 Fase E / S2 (Req-driven, Gherkin) — CERRADA** (detalle en [`docs/findings/faseE-s2/s2-validation-report.md`](docs/findings/faseE-s2/s2-validation-report.md)): Gherkin `.feature` + URL = otra puerta de entrada al mismo motor S3/S4. Única pieza nueva: `src/gherkin-to-criteria.ts` (parser determinístico con `@cucumber/gherkin`, no LLM, 13 tests unitarios) que emite el **mismo `criteria.json`** que el refiner de S3. `ia4d-spec-parser`/`req-driven`/`ia4d-mode-router` de stub a funcional; el command es copia de S3 con el Acto 1 cambiado. Retoque aditivo al `ia4d-writer`: materializa `Scenario Outline`+`Examples` como test data-driven (campo `examples` opcional; S4/S3-FD no lo emiten → sin regresión). **Validado contra ParaBank: 5/5 verde** (setup + RF-001 login + RF-002 transfer ×2 data-driven + RF-003 logout), 3 workers sin `--workers=1`, judge media 0.94. **Drift sin fabricar**: `close-account` (RF-004) declarado en el `.feature` pero ParaBank no lo expone → reportado, no generado. Parameterización (lo que S3 no tenía): `Examples` amounts 1/2 → 2 tests citando RF-002, filas solo de la tabla. Frontera S2/S3: Scenario sin `Then` → no se refina, se enruta a S3. **Hallazgo de valor (en el report)**: un solo `storageState` compartido + un test que cierra sesión envenena los tests autenticados concurrentes (logout mata el JSESSIONID server-side); fix = logout con sesión propia aislada. Lección para el auth-handler de Fase C. **OpenAPI (S2) sigue diferido a v0.4** (tests de API, motor distinto). Inconsistencia corregida de paso: SPEC §1/§7 marcaban S2/S3 como stub y el mode-router los leía; actualizado a estado real. `ia4d-mode-router` sin `Write` sigue pendiente (mismo síntoma que S3).
- **v0.2 Fase F / S3 contra sitio real regulado (Mapfre Hogar) — CERRADA, valor = drift** (commit `a2d00ae`; detalle en [`docs/findings/faseF-mapfre/`](docs/findings/faseF-mapfre/)): primer run del agente contra **producción real de un cliente del dominio seguros** — el tarificador de seguro de hogar de Mapfre (wizard multi-paso, SPA). FD libre + URL, 10 criterios RF, 16 POM pages, los 5 actos completos. **Tesis del producto demostrada: detección de drift sin fabricar tests.** Tres formas de drift: (1) RF-003 (`ARENAL 24`) declarado en el FD pero la app no lo expone con los datos de prueba (backend devuelve `next='piso'` directo) → no generado; (2) RF-004 discrepancia de control (FD dice dropdown, app usa radio-buttons) → cubierto con discrepancia anotada; (3) **7 pantallas de tránsito** que la app exige y el FD no describe → atravesadas con datos sintéticos declarados, sin inventar RF (pendiente ampliación FD, decisión SDET). El test termina en **`test.fixme` aprobado por el healer por un anti-bot server-side de PRODUCCIÓN de Mapfre** (E0006 acceso-restringido, fingerprint Walmeric acumulado tras múltiples runs en esta máquina), **no por defecto del test** — el código es estructuralmente correcto; verde requiere IP/fingerprint limpio. Gates: judge off, PII off (DNI sintético allowlisted), a11y scan inyectado modo warning. Writer 1 iteración, Reviewer pass. **Lección**: contra prod real de tercero, el anti-bot es el límite operativo, no la capacidad del agente; el valor entregable (drift report auditable) es independiente del verde.
- **Demo OrangeHRM / S4 (login + dashboard SPA con auth persistente) — committeada** (commit `23b3498`): reconvierte el runtime `tests/` de ParaBank a OrangeHRM (HR portal demo). Login (happy-path, invalid-credentials, required-fields) + dashboard (landing, quick-launch, sidenav, user-dropdown, widgets) sobre sesión autenticada persistente vía setup project + `storageState` (auth-handler Fase C). Locators 100% semánticos `getByRole`, sin CSS (`forbid_css_selectors`). Material de demostración del agente; sin report de fase formal (no es un hito de capacidad nueva, es cobertura de un segundo patrón SPA+auth). El workspace `template/` se completó en paralelo con el ejemplo SauceDemo multi-puerta (commit `f189e15`), eliminando ParaBank también del template.
- **Reorganización de estructura (híbrido moderado) — CERRADA**: reduce la raíz de 12 a **7 carpetas de contenido** (`.claude, src, tests, hooks, config, docs, template`) y agrupa todo lo efímero en `.work/` (gitignored, borrable sin impacto). Movimientos: `references/`+`tasks/`+`demo/` → `docs/`; `style-contracts/` → `config/style-contracts/`; `scripts/` → `src/scripts/`; reports Playwright/Allure + 8 JSON del agente → `.work/`. **`hooks/` NO se movió** (evita tocar el cableado de `settings.json`; solo se ajustaron 2 rutas de output internas). Ejecutado en 6 fases con commit + red de seguridad (`healthcheck 18/18` + `build` + `test 72/72`) tras cada una. Hallazgo corregido en vivo: al desproteger los artefactos legacy del `.gitignore`, un `git add -A` capturó 106 archivos runtime; revertido (reset --soft) y `.gitignore` restaurado con entradas legacy + `/.work/`. **Lint arreglado** con `.eslintignore` (excluye `template/`, raíz del conflicto de plugins preexistente); expuso y se corrigieron 2 errores reales (prefer-const, require lazy). Red de seguridad completa y verde (lint incluido). Smoke en runtime real: Playwright/Allure y los JSON del agente caen en `.work/`, root limpio.
- **`template/` sincronizado vía generación (medida A) — CERRADA**: el drift repo↔template queda resuelto. `npm run build:template` (`src/scripts/build-template.mjs`) reconstruye el template desde el repo: copia el núcleo (`.claude`, `src`, `hooks`, `docs/references`, `tests/unit`, configs), transforma `package.json` (deps del repo + identity starter) y **preserva** lo propio del template (`config/` con allowed-targets + style-contracts didácticos, `examples/`, `tests/{e2e,pages}` SauceDemo, `specs/`, `criteria/`, `README.md`, `CLAUDE.md` de uso, `.env.example`). El template adopta la estructura nueva (el SDET recibe el workspace limpio). Idempotente. Validado dentro del template: healthcheck 18/18, build, test 72/72. Regla operativa nueva: **el núcleo del agente se edita en el repo y se propaga con `build:template`; no se edita el template a mano.**
- **Principio del SDET**: la sanación/reparación de calidad va al final como post-proceso (Healer), no acoplada a la generación. Validado en Fase A.
- **Sin plazo de calendario comprometido**. Plan en fases con checkpoints.

## Documentación viva

Carga **eager** (siempre presente vía referencia mental al cargar este CLAUDE.md): nada por ahora. El SPEC.md se lee bajo demanda.

Carga **lazy** (Claude lee cuando la tarea lo pide):

| Doc | Cuándo abrirlo |
|---|---|
| [`SPEC.md`](SPEC.md) | Definición del agente: objective, modos, commands, structure, code style, boundaries, roadmap |
| [`docs/findings/spike-playwright-mcp.md`](docs/findings/spike-playwright-mcp.md) | Mediciones reales del Planner+Generator, decisiones data-dependent cerradas |
| [`docs/references/compliance-rules.md`](docs/references/compliance-rules.md) | Qué bloquea el pre-flight, sin override |
| [`docs/references/pii-patterns.md`](docs/references/pii-patterns.md) | Regex DNI/IBAN/Luhn/teléfono/email ES |
| [`docs/references/composition-rules.md`](docs/references/composition-rules.md) | Excepción Writer↔Reviewer documentada |
| [`docs/references/writer-reviewer-protocol.md`](docs/references/writer-reviewer-protocol.md) | Ping-pong, criterios de salida, N=2 rondas máximo |
| [`docs/references/style-contract-schema.md`](docs/references/style-contract-schema.md) | Schema YAML del Style Contract |
| [`docs/references/audit-log-schema.md`](docs/references/audit-log-schema.md) | Schema JSON del audit log |
| [`METODOLOGIA AISD.md`](METODOLOGIA%20AISD.md) | Manual operativo del catálogo Inetum — 10 fases DF→MVP |
| [`docs/Inetum/Catalogo/`](docs/Inetum/Catalogo/) | Fichas de agentes ya admitidos en el catálogo Inetum |
| [`.claude/agents/playwright-test-*.md`](.claude/agents/) | Subagents nativos Microsoft (referencia técnica, no editar) |
| [`conversacion-gemini.txt`](conversacion-gemini.txt) | Referencia estratégica del pivot desde test-pilot |

## Vocabulario del proyecto

Distinguir según audiencia:

- **Hacia I+D Inetum y docs formales**: Orquestador, Sub-agentes, Comandos, Hooks, MCPs. AISD (DF, DT, RF, criterios, fases). Marco QA propio (5 actos).
- **Internamente / arquitectura**: subagent, command, hook, MCP. Cuatro módulos S1/S2/S3/S4. Capa transversal. Quality layer. Regla suavizada.
- **No mezclar dentro del mismo documento.** Crea esquizofrenia.

## Preferencias de trabajo con Claude

Las preferencias transversales (sin sycophancy, prosa directa, sin emojis, push back con dato, surface assumptions) viven en `~/.claude/CLAUDE.md` global. Resumen aplicable aquí: **no asumir; ante duda relevante, preguntar antes de actuar o escribir**. Trivialidades de formato sí se asumen; intención no.
