# SPEC — `ia4d-qa-automator` v0.1 (MVP)

> Documento spec del primer agente QA del catálogo `ia4d-*`. Alcance: solo `qa-automator`. Los demás agentes de la cartera (`test-explorer`, `test-healer-pro`, etc.) tienen specs propios cuando lleguen. Reset desde `ia4d-test-pilot` (descartado por pivot consensuado con visión Gemini, ver [`conversacion-gemini.txt`](conversacion-gemini.txt) y plan aprobado).

## 1. Objective

`ia4d-qa-automator` es un agente Claude Code que genera tests E2E en Playwright TypeScript con marco QA propio, aplicando convenciones declaradas por el SDET, gates de compliance, verificación de accesibilidad y un Quality layer Writer+Reviewer+Judge que materializa "QA es juez independiente".

### Argumento estructural

`ia4d-testing-core` es la herramienta del dev que escribe tests sobre su propio código (whitebox, fase 07 estricta, dev-céntrico). **`ia4d-qa-automator` es la herramienta del juez QA independiente** (greybox o black-box, multi-modo según input, transversal por disciplina QA). Misión incompatible, no perspectiva distinta. Dev no puede ser juez y parte. Las herramientas QA tienen **otra forma de operar**.

### Cuatro módulos de entrada

| Módulo | Entrada | MVP v0.1 | Subagent driver |
|---|---|---|---|
| **S1 Code-driven** | Repo frontend (React/Vue/HTML) | Stub | `ia4d-code-analyzer` |
| **S2 Req-driven** | Gherkin / OpenAPI | Stub | `ia4d-spec-parser` |
| **S3 Spec-refiner** | DF flojo / PDF / Jira | Stub | `ia4d-spec-refiner` |
| **S4 Autonomous** | Solo URL | **Funcional** | `playwright-test-planner` (nativo) + `ia4d-discovery-analyzer` |

### Marco QA propio (5 actos)

| Acto | Función |
|---|---|
| **Comprender** | Determinar modo (S1/S2/S3/S4) y validar target |
| **Mapear** | Discovery + criticidad + riesgo |
| **Estructurar** | POM determinístico, Style Contract, fixtures, datos sintéticos |
| **Materializar** | Writer genera tests; capa transversal enforce |
| **Juzgar** | Reviewer audita, Judge puntúa, SDET sign-off |

### Capa transversal (siempre activa, todos los modos)

- **Compliance pre-flight** (`PreToolUse` hook + `ia4d-compliance-checker`): valida URL contra `allowed-targets.yaml` y modo declarado. Sin override.
- **PII scanner** (`PostToolUse` hook + `ia4d-pii-scanner`): regex banca-ES (DNI/IBAN/Luhn/teléfono/email) sobre cada `.spec.ts` escrito. Sin override. Detecta también inserción no autorizada de `test.fixme()` por el Healer.
- **Style Contract enforcer** (`ia4d-style-enforcer`): post-procesa al output del Generator nativo según `style-contract.yaml`.
- **A11y injector** (`ia4d-a11y-injector`): inyecta `AxeBuilder({ page }).analyze()` al inicio de cada `test()`.
- **Audit log** (`audit-write.ts` hook): JSON line append-only por cada llamada LLM, archivo escrito, decisión Reviewer/Judge.

### Quality layer (Writer + Reviewer + Judge)

```
Writer → produce .spec.ts → Reviewer audita → feedback al Writer
  ↑                                              │
  └──────────── itera (max N=2 rondas) ─────────┘
                          │
                          ▼ (Reviewer aprueba o N agotado)
                   Judge → score numérico 0-1 + reasoning
```

El Writer y el Reviewer se invocan **directamente** vía Task tool (excepción nombrada a la regla "subagents no se invocan entre sí"). El Judge se invoca al final desde el command. Auditabilidad por `audit-log.json`.

### Target users

| Rol | Tipo | Cómo lo usa |
|---|---|---|
| SDET (consumidor primario) | Usuario directo | Invoca commands del agente, revisa output del Reviewer/Judge, refina seed si hace falta |
| QA Manager (decisor cliente) | Usuario indirecto | Ve el video del demo, valida fit con su práctica QA, decide piloto |
| I+D Inetum (decisor catálogo) | Usuario indirecto | Evalúa cumplimiento del patrón canónico para admisión a la pestaña Documentación y Calidad |

### Definition of Done del MVP

Video reproducible y bundle de ejemplos donde:

1. Se ejecuta `/qa-automator:autonomous --url=https://www.saucedemo.com/ --style=style-contracts/saucedemo.yaml`.
2. El sistema orquesta los 5 actos contra SauceDemo.
3. Se generan ≥3 archivos `.spec.ts` cubriendo el flujo golden path (login + add to cart + checkout).
4. Cada test incluye `AxeBuilder` check, POM aplicado, Style Contract enforce, citación del criterio.
5. `npx playwright test` corre los tres verdes.
6. Compliance pre-flight pasa, PII scanner pasa.
7. Writer↔Reviewer protocol ejecutado (1-2 iteraciones por test), `review-feedback.json` poblado.
8. Judge produce `judge-report.json` con score por test.
9. Audit log JSON estructurado.
10. Wall-clock total **≤8 minutos con paralelismo** (gate informado por Slice 0.5 mediciones).
11. Ficha catálogo Inetum redactada en formato canónico ①-⑦.

No incluye admisión formal al catálogo Inetum ni piloto con cliente real. Eso es post-MVP.

### Non-goals MVP v0.1

- Módulos S1/S2/S3 funcionales (stubs documentados, roadmap explícito).
- Integración formal con `ia4d-functional-design-expert` / `ia4d-technical-design-expert` (entra FD/plan en markdown libre o solo URL).
- Connectors a Xray, Zephyr, TestRail, Jira (deferido a v0.2).
- Knowledge graph SQLite con traceability persistida (deferido a v0.2).
- REST Assured Java / API tests / mobile.
- Modo whitebox total (S1 implementado entra en v0.3).
- Enterprise Context Injector con datos vivos del Stage del cliente (v0.4 con asterisco "no genérico").
- Branch + PR automation en repos existentes (v0.2).
- Reimplementación de exploración / generación / healing — se delega en `playwright-test-{planner,generator,healer}` nativos.

## 2. Commands

El proyecto expone cinco slash commands bajo el namespace `/qa-automator:*`.

| Comando | Estado MVP | Responsabilidad | Output |
|---|---|---|---|
| `/qa-automator:healthcheck` | Funcional | Smoke test: versión, subagents detectados, MCP server status | Mensaje de estado |
| `/qa-automator:autonomous` | Funcional | Módulo S4. Toma `--url=` + `--style=`. Orquesta los 5 actos | discovery-report.json + plan.md + N `.spec.ts` + judge-report.json + review-feedback.json + audit-log.json |
| `/qa-automator:code-driven` | Stub v0.1 | Módulo S1 (v0.3) | Mensaje "stub v0.1, planificado v0.3" |
| `/qa-automator:req-driven` | Stub v0.1 | Módulo S2 (v0.3) | Mensaje "stub v0.1, planificado v0.3" |
| `/qa-automator:spec-refiner` | Stub v0.1 | Módulo S3 (v0.2) | Mensaje "stub v0.1, planificado v0.2" |

**Convención de orquestación**: cada command es orquestador. Encadena subagents nativos de Playwright (Planner, Generator, Healer) con subagents nuestros (`ia4d-*`) vía invocaciones explícitas con la Task tool y handoffs por archivos. La regla "ningún subagent invoca a otro" está activa por defecto; la **excepción nombrada y documentada** es el par Writer↔Reviewer (composición explícita del Quality layer).

## 3. Project structure

```
/
├── CLAUDE.md
├── SPEC.md
├── README.md
├── package.json  tsconfig.json  playwright.config.ts  vitest.config.ts
├── .eslintrc.json  .prettierrc.json
├── .claude/
│   ├── agents/
│   │   ├── playwright-test-{planner,generator,healer}.md              (nativos Microsoft)
│   │   ├── ia4d-{compliance-checker,pii-scanner,style-enforcer,
│   │   │        a11y-injector}.md                                      (capa transversal)
│   │   ├── ia4d-{writer,reviewer,judge}.md                             (Quality layer)
│   │   ├── ia4d-{discovery-analyzer,mode-router}.md                    (S4 + dispatcher)
│   │   └── ia4d-{code-analyzer,spec-parser,spec-refiner}.md            (stubs S1/S2/S3)
│   ├── commands/qa-automator/
│   │   ├── healthcheck.md  autonomous.md
│   │   └── code-driven.md  req-driven.md  spec-refiner.md              (stubs)
│   └── settings.local.json
├── src/
│   ├── pom-scaffolder.ts                       (POM esqueleto determinístico)
│   ├── native-agents.ts                        (constantes con nombres de los nativos)
│   └── audit-log.ts                            (helper writer del audit log)
├── hooks/
│   ├── pre-flight.ts  pii-post.ts  audit-write.ts
│   └── hooks.json
├── config/
│   └── allowed-targets.yaml
├── style-contracts/
│   └── saucedemo.yaml
├── references/
│   ├── compliance-rules.md  pii-patterns.md  audit-log-schema.md
│   ├── style-contract-schema.md  composition-rules.md
│   └── writer-reviewer-protocol.md
├── demo/
│   └── saucedemo/
│       ├── HOW-TO-REPRODUCE.md  script.md
│       └── expected-output/
├── tests/
│   ├── unit/                                   (vitest)
│   ├── integration/
│   ├── e2e/                                    (Playwright, generados por el agente)
│   └── pages/                                  (POM)
├── docs/
│   ├── findings/spike-playwright-mcp.md        (mediciones Slice 0.5)
│   ├── spike/spike-protocol.md
│   ├── spike/artifacts/                        (outputs del Slice 0.5)
│   └── Inetum/Catalogo/
│       ├── ia4d-qa-automator.md                (ficha canónica del catálogo)
│       └── ...                                  (otras fichas existentes)
└── tasks/
    ├── plan.md  todo.md                        (referencias al plan aprobado)
```

**Nota sobre `.claude/agents/`**: el directorio mezcla deliberadamente subagents nativos de Microsoft con los nuestros. No los aislamos en subcarpetas porque el formato Claude Code los descubre todos planos. La convención `ia4d-*` los distingue visualmente.

## 4. Code style

### Para el código del agente

- **TypeScript** estricto (`tsconfig.json` con `strict: true`).
- **Node** 20 LTS mínimo (probado con 24.16).
- **Formatter**: Prettier. Sin discusiones.
- **Linter**: ESLint con `@typescript-eslint/recommended`.
- **Naming**: kebab-case archivos, camelCase variables/funciones, PascalCase clases/types/interfaces.
- **Comentarios**: solo cuando el *por qué* no es obvio.
- **Imports**: node builtins, deps externas, internas relativas, separados por línea en blanco.

### Para los tests generados por el agente (output al SDET)

Definido por el `style-contract.yaml` del cliente. El MVP incluye `style-contracts/saucedemo.yaml` con estos defaults:

- POM en `tests/pages/<feature>.page.ts` con clase `*Page`.
- Locators con prioridad: `getByTestId` (SauceDemo tiene `data-test` en todo) > `getByRole` > `getByLabel` > `getByText`. Nunca CSS bruto sin justificación.
- Fixtures Playwright en `tests/fixtures/`.
- Naming de specs: `<feature>.<scenario>.spec.ts`.
- Asserts: `expect(locator).toX()` semánticos, nunca `assert.equal(text)`.
- axe-core injection: cada `test()` incluye `expect(await new AxeBuilder({ page }).analyze()).toHaveNoViolations()` antes del flujo.
- Sin `page.waitForTimeout()`. Solo waits semánticos.
- Cita del criterio (RF-ID o texto del plan) en JSDoc del `test()`.

## 5. Testing strategy

### Tests del propio agente

**Unit tests** (vitest):
- `pii-detector`: regex DNI español, IBAN (mod 97), tarjetas (Luhn), emails de dominios reales. Positivos y negativos.
- `style-enforcer`: input `.spec.ts` violando reglas → output corregido.
- `compliance-preflight`: matriz URL prod/staging/test × credenciales sintéticas/reales × modo declarado → verdict.
- `judge-scoring`: prompt template + mocks → score 0-1 estructurado.
- `pom-scaffolder`: discovery JSON sintético → archivos `*.page.ts` válidos TypeScript.

**Integration tests**:
- `full-loop-saucedemo`: orquestación completa con LLM mockeado. Verifica los artefactos.

**E2E** (gate del DoD):
- Demo SauceDemo end-to-end. Suite Playwright generada corre verde. Wall-clock ≤8 min con paralelismo.

## 6. Boundaries

### Always do

- Ejecutar el hook PreToolUse `pre-flight.ts` antes de cualquier invocación a Playwright Planner o Generator.
- Ejecutar el hook PostToolUse `pii-post.ts` sobre cada `.spec.ts` generado.
- Escribir entrada al `audit-log.json` por cada: llamada LLM, archivo modificado, decisión Reviewer/Judge, ejecución de hook.
- Aplicar el Style Contract declarado. Si no hay, default del agente + log explicito.
- Inyectar `AxeBuilder` check en cada test generado. No opcional.
- Generar POM esqueleto por código determinístico (`src/pom-scaffolder.ts`) antes de invocar Writer.
- Citar el criterio fuente del plan (o `discovery-report.json` en S4) en el JSDoc de cada test.
- Generar `judge-report.json` y `review-feedback.json` antes de exponer el código al SDET.
- Verificar que cada test generado corre verde localmente antes de marcarlo "materializado".
- Operar en greybox por defecto: nunca leer archivos fuera del repo destino ni del directorio del agente.

### Ask first

- Modificar tests existentes en el repo destino.
- Targetear una URL no declarada en `allowed-targets.yaml`.
- Sobreescribir archivos en `tests/` del repo destino.
- Continuar cuando el Judge clasifica >30% de tests con score <0.5.
- Continuar cuando el Reviewer agotó N=2 rondas sin aprobar.
- Continuar cuando compliance pre-flight devuelve warnings.
- Exportar el catálogo si algún test no ha corrido verde.

### Never do

- Ejecutar contra URLs declaradas `production` en config (sin prefijo `qa.`, `test.`, `int.`, `staging.`, `dev.`, `localhost`, ni dominios SauceDemo declarados).
- Usar PII real como dato de prueba. Abort con error si PII detector encuentra match.
- Saltarse el compliance pre-flight gate. No hay flag de override.
- Saltarse el PII detector. No hay flag de override.
- Commit auto-generado a `main` o branches protegidas.
- Desactivar inyección de `AxeBuilder` en builds del demo.
- Procesar artefactos de entornos `prod` o `pre-prod`.
- **Invocación cruzada entre subagents** salvo la excepción nombrada Writer↔Reviewer (documentada en `references/composition-rules.md`).
- Generar tests sin entrada explícita del SDET (URL o FD/plan).
- **Permitir que `playwright-test-healer` marque tests con `test.fixme()` sin aprobación humana explícita**. Hook `pii-post.ts` intercepta Edits del Healer y bloquea.
- Saltarse el Quality layer Writer+Reviewer+Judge en MVP. Los tres están activos por design.

## 7. Roadmap por versiones

| Versión | Foco | Módulos activos | Highlights |
|---|---|---|---|
| **v0.1 (MVP)** | Foundation + S4 + capa transversal + Quality layer | S4 | Demo SauceDemo verde, video, bundle, ficha catálogo |
| **v0.2** | S3 (Spec-refiner) + TMS connectors | S3 + S4 | Jira/Xray sync, FD flojo de input, knowledge graph SQLite |
| **v0.3** | S1 (Code-driven) + S2 (Req-driven) | Todos los módulos | Cobertura completa de entradas SDET, AST analyzers React/Vue |
| **v0.4** | Context Injector* + PR automation | Todo + Injector opcional | Endgame visión Gemini. Asterisco: el Injector **rompe genericidad** y requiere adaptadores por cliente. No es feature del catálogo, es engagement aparte. |

---

## Anexo: Decisiones cerradas

| Pregunta | Respuesta |
|---|---|
| Scope SPEC | Solo `ia4d-qa-automator` |
| Target app demo | SauceDemo (`saucedemo.com`) |
| Flujo MVP | login + add to cart + checkout (golden path) |
| DoD MVP | Video reproducible + bundle de ejemplos + ≤8 min wall-clock con paralelismo |
| Integración FD/TD | FD markdown libre o solo URL. No dependencia con `ia4d-functional-design-expert` en MVP |
| Estrategia anchor S4 | Playwright Planner descubre seed automáticamente |
| Quality layer | Writer + Reviewer + Judge los tres activos |
| Regla subagents | Suavizada — excepción nombrada Writer↔Reviewer |
| Modelo LLM Planner/Generator | `sonnet` (nativo Microsoft, sin cambio) |
| Modelo LLM Writer/Reviewer/Spec-refiner | `sonnet` |
| Modelo LLM Judge / mecánicos | `haiku` |
| Cache de discovery | Opcional MVP. Se evalúa post-demo |
| Paralelismo Generator | Prioritario en Slice 5 |
| Datos productivos | Fuera del contexto MVP. Context Injector solo en v0.4* |
| Output target | Repo de tests nuevo (clean slate) |

## Anexo: Riesgos conocidos del MVP

1. **Playwright Planner contra SauceDemo en demo en vivo**: mitigado por entrega via video, no demo en vivo.
2. **Dependencia versión Playwright** v1.56+. Pinear en `package.json` (`^1.56.0`). Nombres de subagents nativos encapsulados en `src/native-agents.ts` para protegernos de renames upstream.
3. **Coste LLM** sin budget cap en MVP. Aceptable según mediciones (≤100k tokens por MVP completo, según Slice 0.5). Budget cap entra en v0.2.
4. **Sin knowledge graph**, traceability vive en `audit-log.json` + JSDoc. Limitado para queries complejas. Aceptable MVP.
5. **Sin TMS connector**, JSON catalog genérico. Blocker para piloto cliente. Aceptable demo.
6. **Healer nativo puede silenciar tests con `test.fixme()`**. Hook `pii-post.ts` intercepta y bloquea.
7. **Generator nativo sin memoria entre runs**. Mitigado por `discovery-report.json` cacheado opcional.
8. **Quality layer (Writer+Reviewer+Judge) añade coste vs ejecutar solo Generator nativo**. Esperado ~2x tokens por test. Compensa por confianza estructural ("QA es juez").
9. **El "Reviewer puede invocar Writer" rompe la regla de no invocación cruzada**. Documentado como excepción nombrada en `references/composition-rules.md`. Defendible ante I+D.
