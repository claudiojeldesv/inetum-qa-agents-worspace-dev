# SPEC — `ia4d-qa-automator`

> Estado real por versión: ver [`CHANGELOG.md`](CHANGELOG.md) (actual: v0.3.x). Documento spec del primer agente QA del catálogo `ia4d-*`. Alcance: solo `qa-automator`. Los demás agentes de la cartera (`test-explorer`, `test-healer-pro`, etc.) tienen specs propios cuando lleguen. Reset desde `ia4d-test-pilot` (descartado por pivot consensuado con visión Gemini y plan aprobado).

## 1. Objective

`ia4d-qa-automator` es un agente Claude Code que genera tests E2E en Playwright TypeScript con marco QA propio, aplicando convenciones declaradas por el QA, gates de compliance, verificación de accesibilidad y un Quality layer Writer+Reviewer+Judge que materializa "QA es juez independiente".

**Lead de venta**: *"Tu Ingeniero QA pasa de un flujo funcional (o solo URL) a tests Playwright estructurados con POM, A11y baked-in y trazabilidad auditable, en minutos, con un Reviewer independiente que audita al Writer antes de exponer el código"*. Velocidad + estructura como impacto demostrable.

### Argumento estructural

`ia4d-testing-core` es la herramienta del dev que escribe tests sobre su propio código (whitebox, fase 07 estricta, dev-céntrico). **`ia4d-qa-automator` es la herramienta del juez QA independiente** (greybox o black-box, multi-modo según input, transversal por disciplina QA). Misión incompatible, no perspectiva distinta. Dev no puede ser juez y parte. Las herramientas QA tienen **otra forma de operar**.

### Cuatro módulos de entrada

| Módulo | Entrada | Estado actual | Subagent driver |
|---|---|---|---|
| **S1 Code-driven** | Repo frontend (React/Vue/HTML) | Stub (roadmap, sin versión comprometida) | `ia4d-code-analyzer` |
| **S2 Req-driven** | Gherkin (+ URL) / OpenAPI | **Funcional (Gherkin, v0.2 Fase E)** · OpenAPI diferido v0.4 | `ia4d-spec-parser` |
| **S3 Spec-refiner** | FD markdown + URL (Forma B) | **Funcional (v0.2 Fase D)** | `ia4d-spec-refiner` |
| **S4 Autonomous** | Solo URL | **Funcional** | `playwright-test-planner` (nativo) + `ia4d-discovery-analyzer` |

### Marco QA propio (5 actos)

| Acto | Función |
|---|---|
| **Comprender** | Determinar modo (S1/S2/S3/S4) y validar target |
| **Mapear** | Discovery + criticidad + riesgo |
| **Estructurar** | POM determinístico, Style Contract, fixtures, datos sintéticos |
| **Materializar** | Writer genera tests; capa transversal enforce |
| **Juzgar** | Reviewer audita, Judge puntúa, QA sign-off |

### Capa transversal (siempre activa, todos los modos)

- **Compliance pre-flight** (`PreToolUse` hook + `src/scripts/check-compliance.ts` en los commands): valida URL contra `allowed-targets.yaml` y modo declarado. Sin override. (El subagent `ia4d-compliance-checker` quedó deprecated en Fase 1 token-efficiency — misma lógica, cero tokens.)
- **PII scanner** (`PostToolUse` hook + `ia4d-pii-scanner`): regex banca-ES (DNI/IBAN/Luhn/teléfono/email) sobre cada `.spec.ts` escrito. **Off por defecto** (v0.2 `design/gates-off-by-default`), reactivable con `QA_ENABLE_PII=1` — funcionalidad apagada, no eliminada. La detección de `test.fixme()` no autorizado del Healer en el mismo hook **sigue activa siempre** (no es PII).
- **Style Contract enforcer** (`ia4d-style-enforcer`): post-procesa al output del Generator nativo según `style-contract.yaml`.
- **A11y garantizado** (`src/scripts/verify-a11y.ts` + `ia4d-a11y-injector` como rescate): el Writer inyecta el scan `AxeBuilder`; el verificador determinístico lo comprueba en cada `test()` y solo escala al injector el spec que falle. El scan siempre presente; el **gate** (`fail_on_violations`) está **off por defecto** (modo warning), reactivable por-sitio con `true`.
- **Audit log** (`audit-write.ts` hook): JSON line append-only por cada llamada LLM, archivo escrito, decisión Reviewer/Judge.
- **Sanación (Healer) como post-proceso** (`/ia4d-qa-automator:heal` + `src/scripts/run-heal-mecanico.ts`, v0.3 quality-greens Q3): **off por defecto** (regla #10), reactivable con `healing.enabled: true` en el Style Contract (autonomous encadena la sanación sobre los rojos) o lanzando el command desacoplado. El Healer nativo **no es juez**: cada sanación pasa el protocolo post-heal (suite re-ejecutada + pre-review + Reviewer + verify-a11y), queda en `healed[]` del run-summary y en el audit-log (spec, ficheros tocados, causa raíz, verdicts). Economía medida en Q1: μ $0,72/spec, 1 fix en POM compartido cura N specs.

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
| QA (consumidor primario) | Usuario directo | Invoca commands del agente, revisa output del Reviewer/Judge, refina seed si hace falta |
| QA Manager (decisor cliente) | Usuario indirecto | Ve el video del demo, valida fit con su práctica QA, decide piloto |
| I+D Inetum (decisor catálogo) | Usuario indirecto | Evalúa cumplimiento del patrón canónico para admisión a la pestaña Documentación y Calidad |

### Definition of Done del MVP

Video reproducible y bundle de ejemplos donde:

1. Se ejecuta `/ia4d-qa-automator:autonomous --url=https://www.saucedemo.com/ --style=config/style-contracts/saucedemo.yaml`.
2. El sistema orquesta los 5 actos contra SauceDemo.
3. Se generan ≥3 archivos `.spec.ts` cubriendo el flujo golden path (login + add to cart + checkout).
4. Cada test incluye `AxeBuilder` check, POM aplicado, Style Contract enforce, citación del criterio.
5. `npx playwright test` corre los tres verdes.
6. Compliance pre-flight pasa, PII scanner pasa.
7. Writer↔Reviewer protocol ejecutado (1-2 iteraciones por test), `review-feedback.json` poblado.
8. Judge produce `judge-report.json` con score por test.
9. Audit log JSON estructurado.
10. Wall-clock: **≤8 min con paralelismo fue el gate del MVP sobre SauceDemo**; contra sitios reales los runs medidos van de 30-45 min (ver `docs/findings/`). No es una promesa general.
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

El proyecto expone los slash commands bajo el namespace `/ia4d-qa-automator:*`.

| Comando | Estado MVP | Responsabilidad | Output |
|---|---|---|---|
| `/ia4d-qa-automator:healthcheck` | Funcional | Smoke test: versión, subagents detectados, MCP server status | Mensaje de estado |
| `/ia4d-qa-automator:autonomous` | Funcional | Módulo S4. Toma `--url=` + `--style=` + `--flows/--entry/--ignore` + `--max-scenarios=N` (default 8). Orquesta los 5 actos + un **Acto 2.5 (Checkpoint)** que aplica el cap y, si se supera, pausa para seleccionar TC y confirmar tags | discovery-report.json (con `scenarios_catalog`: TC-NN, suite_tags, rank) + plan.md + N `.spec.ts` (con tags nativos `{ tag: [...] }` y `@tc-id`) + judge-report.json + review-feedback.json + audit-log.json |
| `/ia4d-qa-automator:code-driven` | Stub | Módulo S1 (roadmap, sin versión comprometida) | Mensaje de stub + redirección a las puertas funcionales S2/S3/S4 |
| `/ia4d-qa-automator:req-driven` | **Funcional (Gherkin, v0.2 Fase E)** | Módulo S2. Toma `--gherkin=` + `--url=` + `--style=`. Ingiere el `.feature` (determinístico) y reusa el motor S3/S4 | criteria.json + drift-report.json + discovery-report.json + N `.spec.ts` (con `@criterion RF-NNN`) + judge-report.json + audit-log.json |
| `/ia4d-qa-automator:spec-refiner` | **Funcional (v0.2 Fase D)** | Módulo S3 Forma B. Toma `--fd=` + `--url=` | criteria.json + drift-report.json + N `.spec.ts` + judge-report.json + audit-log.json |
| `/ia4d-qa-automator:heal` | **Funcional (v0.3 quality-greens Q3)** | Post-proceso desacoplado (patrón `report`): sana los rojos del último run con `playwright-test-healer` + protocolo de auditoría post-heal (suite + pre-review + Reviewer + verify-a11y). Off por defecto en `autonomous` (knob `healing.enabled`, regla #10); el command siempre disponible, re-ejecutable | `healed[]` en qa-automator-run-summary.json (causa raíz, ficheros tocados, $/spec, verdicts post-heal) + heal-notes.json + audit-log |

**Convención de orquestación**: cada command es orquestador. Encadena subagents nativos de Playwright (Planner, Generator, Healer) con subagents nuestros (`ia4d-*`) vía invocaciones explícitas con la Task tool y handoffs por archivos. La regla "ningún subagent invoca a otro" está activa por defecto; la **excepción nombrada y documentada** es el par Writer↔Reviewer (composición explícita del Quality layer).

## 3. Project structure

```
/
├── CLAUDE.md  SPEC.md  README.md  CHANGELOG.md  METODOLOGIA AISD.md
├── package.json  tsconfig.json  playwright.config.ts  vitest.config.ts
├── .eslintrc.json  .prettierrc.json  .mcp.json
├── .claude/
│   ├── agents/
│   │   ├── playwright-test-{planner,generator,healer}.md              (nativos Microsoft)
│   │   ├── ia4d-{compliance-checker,pii-scanner,style-enforcer,
│   │   │        a11y-injector}.md                                      (capa transversal)
│   │   ├── ia4d-{writer,reviewer,judge}.md                             (Quality layer)
│   │   ├── ia4d-{discovery-analyzer,mode-router}.md                    (S4 + dispatcher)
│   │   └── ia4d-{code-analyzer,spec-parser,spec-refiner}.md            (S1 stub / S2-S3 funcionales)
│   ├── commands/qa-automator/
│   │   ├── healthcheck.md  autonomous.md  report.md
│   │   ├── req-driven.md  spec-refiner.md                             (S2/S3 funcionales)
│   │   └── code-driven.md                                             (S1 stub)
│   └── settings.json  settings.local.json
├── src/                                           (lógica determinística TS)
│   ├── pom-scaffolder.ts  gherkin-to-criteria.ts  judge-scoring.ts
│   ├── compliance-preflight.ts  pii-detector.ts  audit-log.ts
│   ├── allure-enricher.ts  native-agents.ts
│   └── scripts/                                   (CLI auxiliares: healthcheck, scaffold-poms, slice65-judge)
├── hooks/
│   └── pre-flight.ts  pii-post.ts  audit-write.ts               (wiring en .claude/settings.json)
├── config/
│   ├── allowed-targets.yaml                       (compliance pre-flight)
│   └── style-contracts/                           (contratos de estilo por sitio)
├── tests/
│   ├── unit/  integration/                        (vitest)
│   └── e2e/  pages/                               (Playwright + POM)
├── docs/
│   ├── references/                                (reglas/schemas: compliance, pii, style-contract, audit-log, ...)
│   ├── demo/                                      (casos demo: saucedemo, ...)
│   ├── tasks/                                     (plan.md, todo.md)
│   ├── findings/                                  (evidencia por fase: spike, faseA-F, ...)
│   ├── spike/                                     (protocolo + artefactos del Slice 0.5)
│   └── Inetum/Catalogo/                           (ficha canónica del catálogo + otras)
├── template/                                      (workspace de arranque autocontenido para el QA)
└── .work/                                         (efímero, gitignored: reports Playwright/Allure + JSON del agente; borrable sin impacto)
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

### Para los tests generados por el agente (output al QA)

Definido por el `style-contract.yaml` del cliente. El MVP incluye `config/style-contracts/saucedemo.yaml` con estos defaults:

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
- Demo SauceDemo end-to-end. Suite Playwright generada corre verde. Wall-clock ≤8 min con paralelismo (gate histórico del MVP sobre SauceDemo; sitios reales: 30-45 min).

## 6. Boundaries

### Always do

- Ejecutar el hook PreToolUse `pre-flight.ts` antes de cualquier invocación a Playwright Planner o Generator.
- Ejecutar el hook PostToolUse `pii-post.ts` sobre cada `.spec.ts` generado (la guarda anti-`test.fixme()` corre siempre; el scan PII dentro del hook está off por defecto, reactivable con `QA_ENABLE_PII`).
- Escribir entrada al `audit-log.json` por cada: llamada LLM, archivo modificado, decisión Reviewer/Judge, ejecución de hook.
- Aplicar el Style Contract declarado. Si no hay, default del agente + log explicito.
- Inyectar `AxeBuilder` check en cada test generado. No opcional.
- Generar POM esqueleto por código determinístico (`src/pom-scaffolder.ts`) antes de invocar Writer: `BasePage` común + una clase por screen (`extends BasePage`) + component objects compartidos cuando el discovery declara `components[]` (toggles `pom.base_page`/`pom.components`, default true).
- Citar el criterio fuente del plan (o `discovery-report.json` en S4) en el JSDoc de cada test.
- En S4, aplicar el cap `--max-scenarios` en el Acto 2.5: si el `scenarios_catalog` lo supera, pausar y pedir selección (no truncar en silencio). Etiquetar cada test con los tags nativos del catálogo (`@smoke/@regression/@critical/@negative` — la naturaleza positiva no se etiqueta; "happy path" no es un valor) y su `@tc-id`.
- Cuando el Style Contract declara `test_design.require_business_postcondition: true`, exigir que cada test afirme la post-condición de negocio del flujo (Reviewer MF-9), no solo navegación.
- Generar `review-feedback.json` antes de exponer el código al QA. (`judge-report.json` solo cuando el Judge está activo — `QA_ENABLE_JUDGE`; off por defecto.)
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
- Usar PII real como dato de prueba. Con el PII detector activo (`QA_ENABLE_PII`), abort con error si encuentra match.
- Saltarse el compliance pre-flight gate. No hay flag de override.
- Commit auto-generado a `main` o branches protegidas.
- Desactivar inyección de `AxeBuilder` en builds del demo.
- Procesar artefactos de entornos `prod` o `pre-prod`.
- **Invocación cruzada entre subagents** salvo la excepción nombrada Writer↔Reviewer (documentada en `docs/references/composition-rules.md`).
- Generar tests sin entrada explícita del QA (URL o FD/plan).
- **Permitir que `playwright-test-healer` marque tests con `test.fixme()` sin aprobación humana explícita**. Hook `pii-post.ts` intercepta Edits del Healer y bloquea.
- Saltarse Writer+Reviewer (el núcleo del Quality layer): obligatorios. El **Judge es opcional, off por defecto** (`QA_ENABLE_JUDGE`) desde v0.2 `design/gates-off-by-default`; su omisión se audita, no se silencia.

## 7. Roadmap por versiones

| Versión | Foco | Módulos activos | Highlights |
|---|---|---|---|
| **v0.1 (MVP)** | Foundation + S4 + capa transversal + Quality layer | S4 | Demo SauceDemo verde, validación híbrida (Slice 6.5), ficha catálogo |
| **v0.2** | **Salir del sandbox: enfrentar el caos web real** + S3 (Spec-refiner, Fase D) + S2 Gherkin (Fase E) + hardening por categoría de fallo | S2 (Gherkin) + S3 + S4 | Ver detalle abajo |
| **v0.2.x (continuación)** | TMS connectors (Jira/Xray) + knowledge graph SQLite + budget cap LLM persistente | Mismos | Solo cuando v0.2 cierre con evidencia de uso real |
| **v0.3 (publicada como v0.3.x)** | Distribución híbrida: plugin de marketplace (agentes + commands) + workspace desplegable (`init`) | S2 (Gherkin) + S3 + S4 | El S1 previsto aquí se reubica: candidato sin versión asignada, pendiente de priorización vs S5 |
| **v0.4** | S2 OpenAPI (API tests, `ia4d-api-test-writer`) + Context Injector* + PR automation | Todos | OpenAPI no comparte el motor DOM (necesita writer de API propio). Endgame visión Gemini. Asterisco: el Injector **rompe genericidad** y requiere adaptadores por cliente. No es feature del catálogo, es engagement aparte. |
| **S5 Incremental (candidato, sin versión asignada)** | **Extender una suite existente** en vez de generar desde cero | Reusa S2/S3 | El salto de "demo greenfield" a "herramienta de diario vivir". Detalle abajo. Pendiente de priorización vs S1. |

### v0.2 detallado — "Interactuar con el caos"

**Premisa**: SauceDemo es un sandbox didáctico (`data-test` en todo, sin auth real, sin estado persistente, sin iframes, sin MFA, sin GDPR popup). El v0.1 validó el motor pero no probó el caos. v0.2 ataca el gap por evidencia, no por hipótesis.

**Orden estricto de v0.2** (cada fase informa la siguiente, no se salta):

**v0.2 Fase A — Cierre operativo del MVP v0.1** ✅ COMPLETADA:
1. Validación end-to-end LLM-LLM en sesión nueva: los 13 subagents responden como invocables, los 5 actos orquestan end-to-end. Bloqueador Slice 6.5 cerrado.
2. Verificación runtime inicial: 0/3 specs generados verdes. Causa: `ia4d-discovery-analyzer` fabrica `test_id` desde prosa del plan (`user-name` vs `data-test` real `username`) — viola su propia hard rule "do not invent". Defecto registrado.
3. Sanación (post-proceso, principio del QA): `playwright-test-healer` reconcilió 20 test_ids contra DOM vivo, sin `test.fixme`. Verificado: 4/4 verde.
4. Evidencia archivada en `docs/findings/faseA-closure/` (commit `ef5611e`), no en `tests/` vivo. Residuales v0.1 relocados a `tmp/v01-residuals/` (archivo, no borrado).
5. Decisión de fondo derivada: `discovery` DOM-aware vs lean-on-Healer → ver estrategia de reconocimiento en Fase C.

**v0.2 Fase B — Producción contra sitios reales con catalogación incidental** (2-3 sitios):

**No es observación pura.** Se intenta **producir tests** contra sitios reales —reconocimiento happy-path acotado a mano vía plumbing (`--flows/--entry/--ignore`)— y cada fallo que rompe la producción ES el dato que prioriza el hardening de Fase C. Se cataloga produciendo, no mirando. Como solo se producen happy-paths, solo se cataloga el caos que vive dentro de ellos (el de zonas que nunca se tocan no interesa). Esto mata la "Fase B de observación pura": menos coste, evidencia más relevante.

Orden de menor a mayor riesgo de demora (estrenar el plumbing sin que el primer run se eternice):

| Orden | Target | Qué aísla |
|---|---|---|
| 1 | `https://practice.expandtesting.com/` | Caos de runtime concentrado (waits, dynamic loading, modales) en sitio pequeño. Bajo riesgo de demora. |
| 2 | `https://demo.opencart.com/` | E-commerce grande: aquí se prueba de verdad la acotación happy-path (scope/demora). Selectors mixtos. |
| 3 | `https://parabank.parasoft.com/` | Banca demo: auth + estado persistente (`storageState`). |

Iframes: si aparecen, se anotan como casuística aparte (`ia4d-frame-handler`), no se fuerzan en el happy-path.

Output: `docs/findings/wild-sites-report.md` — fallos de **producción** categorizados por (1) frecuencia, (2) impacto en tiempo QA, (3) dificultad de solución. Doble uso: prioriza componentes de Fase C (umbral ≥30%) y aporta las preguntas reales del futuro intake. El portal corporativo Inetum entra cuando aplique, no es bloqueante.

**v0.2 Fase C — Hardening por categoría de fallo observada** (no por componente teórico):

**Estrategia de reconocimiento — happy-path acotado (rediseño del Acto Mapear de S4)**:

Hoy el planner nativo explora con mandato de exhaustividad ("explore all"), sin tope: contra sitios grandes diverge en tiempo y no es reproducible. Cambio: la primera etapa de S4 es un **reconocimiento acotado al happy path**, no exhaustivo. Fija los límites de inmediato; las etapas posteriores (edge cases, negativos, más flujos) cuelgan de esa columna vertebral ya mapeada.

- **Orden: brief → exploración.** El brief declara cuál(es) happy path(s); la exploración los mapea y verifica. La exploración NO define el happy path por sí sola (eso reintroduce divergencia).
- **Captura del brief — dos puertas, sin que el QA deba "saber" nada.** Flags presentes (`--flows/--entry/--ignore`) → modo dirigido. Solo URL → el agente NO explora a ciegas: entra en intake y pregunta los datos mínimos. El default ante ausencia de brief es entrevistar, no explorar.
- **Ancla generalista del happy path: login + home + navegación primaria.** La navegación primaria (header/sidebar) da los *candidatos*; el brief elige cuáles. Distinguir de footer legal, menú de usuario y megamenús de marketing (NO son happy path). La nav es el punto de entrada, no el flujo completo: el happy path continúa en acciones (carrito, formulario, confirmación).
- Acota **scope** (la demora), NO elude el **caos de runtime** (banner/auth viven dentro del happy path; los maneja `pre-flight-cleaner`/`auth-handler`).
- **Plumbing instrumental** (flags → prompt del planner, sin IA): se monta antes de la recolección para acotar runs a mano. La capa conversacional (intake adaptativo) se construye encima, con preguntas/targets/topes derivados de la recolección — no se cablean a priori.

Componentes nuevos previstos. **Cada uno entra solo si la recolección muestra que su categoría aparece con frecuencia ≥30%**:

| Componente | Categoría que ataca | Prioridad esperada |
|---|---|---|
| `ia4d-locator-hardener` | Selectors inestables (`_emotion-css-xxx`, ids con timestamps, sin `data-test`). Combina `role + accessibleName + nearbyText`, marca selectors fragile en judge-report. | Alta (apuesta: top 1) |
| `ia4d-pre-flight-cleaner` | Cookies banner GDPR, modales emergentes, ads. Cierra dialogs antes de exploración. | Alta (apuesta: top 2) |
| `ia4d-auth-handler` | SAML / OAuth / MFA. `globalSetup` captura `storageState` reutilizable; soporta TOTP via `authenticator` lib. | Media-Alta |
| `ia4d-test-data-architect` | Lifecycle setup/teardown. Fixtures contra OpenAPI/DB schema, factories con faker.js seed-reproducible. | Media |
| **A11y baseline aprobada** | Threshold actual `serious\|critical` aborta el 80% de tests contra portales reales. Mecanismo de baseline aprobada por QA, no todo-o-nada. Es extensión del `ia4d-a11y-injector` existente. | Media-Alta |
| `ia4d-frame-handler` (casuística especial) | Iframes y flujos cross-frame / pantalla-a-pantalla. Tratado **aparte** del reconocimiento general; Playwright maneja frames con API propia. Entra solo si aparece con frecuencia. | Baja-Media (caso aparte) |

#### Estado Fase C — construido (3 sitios de evidencia, decisión QA)

Tras catalogar 3 sitios (wild-sites-report.md), se construyeron los 3 top **sin crear subagents nuevos**: se realizan como campos del style-contract + lógica en los agentes existentes. Decisión deliberada (evidencia n=1/n=2 + regla "editar sobre crear"). Diverge de la columna "Componente nuevo previsto" de arriba:

| Componente top | Realizado como | Divergencia vs plan original |
|---|---|---|
| **A11y baseline configurable** | Gate `a11y.fail_on_violations` por-sitio en el schema; `ia4d-a11y-injector` lo honra (true → `expect` aborta; false → modo warning a `test.info().annotations`, evidencia sin abortar). El scan SIEMPRE se inyecta. | Es el **flag configurable**, NO el "baseline aprobada" (diff contra snapshot de violaciones conocidas). Baseline-diff diferido a v0.2.x. |
| **auth-handler** | Campo `auth:` en el schema (form-based) + setup project condicional en `playwright.config.ts` (gate `QA_STORAGE_STATE`) + `dependencies` que mata la race bajo `fullyParallel`. El command genera `auth.setup.ts`. | Acotado a login **form-based**. SAML / OAuth / MFA / TOTP **diferidos** (no observados, n=1). No es subagent `ia4d-auth-handler`; es schema + config + command. |
| **locator-hardener / excepción CSS legacy** | Campo `locators.css_fallback_attributes` (whitelist `name`/`id`); `ia4d-style-enforcer` aplica el fallback acotado cuando no hay semántica (taggeado + audit-log); `ia4d-reviewer` MF-1 honra la excepción declarada. | Excepción **declarativa y determinística** (el contract autoriza, el enforcer aplica), no un subagent `ia4d-locator-hardener` con heurística `role+accessibleName+nearbyText`. Nunca CSS arbitrario. |

`ia4d-pre-flight-cleaner`, `ia4d-test-data-architect` y `ia4d-frame-handler` siguen pendientes (no alcanzaron el top de la priorización por impacto×frecuencia en los 3 sitios).

**v0.2 Fase D — Ajustes al Quality layer derivados de observación**:

| Ajuste | Razón observable |
|---|---|
| Writer↔Reviewer N=3 (o fallback `@status pending-sdet-review`) | En SauceDemo el Generator nativo produjo código casi perfecto a la primera. En apps reales el Reviewer iterará más. Hard cap N=2 puede ser insuficiente. |
| `ia4d-judge` con scoring axes ajustables por Style Contract | Ejes hoy hardcoded en `src/judge-scoring.ts`. Cliente banca puede priorizar `criterion_coverage` sobre `a11y`. |
| `ia4d-spec-refiner` (S3) **funcional** | Realista en banca: el input típico es un FD flojo o Jira mal redactado, no una URL pelada. Promovido del v0.2 original. **Diseño decidido: Forma B (ver abajo).** |

#### S3 — diseño decidido: Forma B (FD + URL, inyección de criterios sobre S4)

Decisión QA: S3 se construye como **inyección de criterios sobre el motor S4 ya validado** (Fases A-C), NO como generación doc-only.

- **Forma B (elegida)** — entrada = FD (markdown) **+ URL de staging**. El FD da el *qué* (criterios RF-NNN, flujos); la URL da el *cómo* (DOM, locators, run verde). El ingester del FD (`ia4d-spec-refiner`) emite (a) los criterios estructurados y (b) el brief (`--flows/--entry`) que hoy se escribe a mano. El planner pasa de **descubrir** flujos a **mapearlos contra el DOM**. Todo el back-end (discovery, POM scaffolder, Writer↔Reviewer↔Judge, los 3 componentes de Fase C) se reutiliza sin cambios.
- **Forma A (descartada)** — FD sin target. Sin DOM no hay locators reales, ni POM rellenable, ni run verde, ni axe sobre DOM real: rompe la propuesta de valor validada. Si se necesita, queda como modo degradado documentado (doc → esqueletos/Gherkin), no como objetivo.
- **Valor que desbloquea Forma B**: (1) **trazabilidad real** — el `@criterion` del JSDoc cita un RF-NNN del FD, no prosa del discovery; (2) **detección de drift FD↔implementación** — si el FD declara un flujo que el staging no tiene, el agente **reporta el gap, no fabrica el test** (extensión de la hard rule no-fabricar del discovery).
- **Decisiones abiertas antes de construir**: formato del FD de entrada (markdown libre vs estructura mínima RF-NNN) y cuánto "refina" el refiner un FD flojo (instinto: extrae + marca huecos, no inventa criterios — peligroso en banca).
- **S2 (Gherkin/OpenAPI) y Jira/tickets diferidos al final.** No bloquean S3.

**S3 CERRADO — validado end-to-end (S3.2)**. Contra ParaBank: **3/3 specs verde** (RF-001/RF-003/RF-006) con `@criterion` citando `RF-NNN (source_ref)`, 3 workers sin `--workers=1`; `discovery-report.json` con `criteria_mapping`; gate de open_questions bloquea RF-002/RF-004/RF-005 (no se generan, quedan pendientes de respuesta QA). Drift: el FD declaraba bill-pay como flujo no expuesto, pero ParaBank **sí lo expone** → el agente lo reportó como no-drift (mapeado-pero-bloqueado), no fabricó el gap. Hallazgo de drift conductual real en auth-guard (el FD asume redirect, la app da error server-side). No-regresión S4 verificada en vivo (discovery sin `criteria_mapping`, writer con `@criterion` de prosa de plan). Refinamiento del FD = extrae + marca huecos, no inventa: confirmado. Markdown libre como formato de entrada: confirmado.

**v0.2 Fase E — Telemetría y budget cap**:

| Componente | Función |
|---|---|
| Budget cap LLM persistente | Hoy no hay límite. Contra apps reales los Planners necesitan ~2-3x tokens. Cap configurable por proyecto. |
| Telemetría heurística del agente | Logs estructurados de qué heurísticas funcionan en qué tipo de app. Sin esto no se aprende. |

**v0.2 NO incluye** (queda en v0.2.x o v0.3):
- TMS connectors (Jira/Xray) — esperar a tener datos reales que se traceen.
- Knowledge graph SQLite — depende de TMS y telemetría.
- AST parsers React/Vue (esos son v0.3).
- Visual regression formal (Percy/Chromatic) — v0.3+.

**Riesgos data-dependent de v0.2** (a revisar tras Fase B):
- Tokens proyectados de Planner contra app real: 2-3x lo medido en SauceDemo (~32k → 65-100k).
- Wall-clock proyectado: 2-3x lo de Slice 6.5 (~14 min secuencial → 30-45 min). Paralelismo crítico.
- A11y violations en portales reales: decenas serious/critical. Threshold actual inviable sin baseline.

### Mejora candidata — Modo Incremental (S5): extender suites, no solo crearlas

**Punto de mejora anotado 2026-06-15. No comprometido en versión; pendiente de priorización vs S1.**

**Problema.** Los cuatro modos actuales (S1/S2/S3/S4) son **bootstrap-only**: parten de un input externo y generan la suite desde cero. El QA pasa el ~80% de su vida en **régimen permanente** — mantener y extender suites existentes — no en el momento cero. Caso canónico: "tengo 10 casos de regresión, añade 5 de una feature nueva, coherentes con lo que ya hay, sin duplicar ni romper". Hoy el agente re-descubriría el sitio y probablemente duplicaría POMs y solaparía cobertura.

**Tesis de diseño.** No es un motor nuevo: es S2/S3 **precedidos de un Acto 0 de comprensión de lo existente**. Sigue siendo "de un requisito a tests con juicio"; cambia el punto de partida.

**Mapeo a los 5 actos** (reinterpretados, sin cambiar el marco):
- **Comprender** — además de validar target, **ingiere la suite**: POMs y sus locators, specs y su cobertura (qué RF/flujos), style-contract vigente (explícito en YAML o inferido de los tests).
- **Mapear** — mapea solo la superficie del requisito nuevo y la cruza con el inventario: ¿esta pantalla ya tiene POM? ¿reutilizo / extiendo / creo?
- **Estructurar** — reutiliza POMs/fixtures, respeta el contract vigente (no impone el default del agente).
- **Materializar** — el Writer genera **solo el delta**, citando qué reutilizó.
- **Juzgar** — el Reviewer audita una dimensión nueva: **coherencia con lo existente** (no duplica, no contradice, respeta naming), además de la calidad intrínseca.

**Reusa (~70% del motor):** Writer, Reviewer, Judge, POM scaffolder, style-enforcer, a11y-injector, compliance pre-flight.

**Capability nueva (lo caro):**
1. **Ingest de suite ajena** — leer tests que el agente no escribió (legacy del cliente, otro estilo) y producir un inventario: POMs, cobertura, contract implícito.
2. **Inferencia de contract implícito** — lo normal es que el cliente no tenga style-contract YAML; deducir convenciones de los tests existentes y proponer un contract derivado que el QA valida.
3. **Reconciliación / dedup** — cruzar requisito nuevo con cobertura existente (solapa / contradice / comparte pantalla).

**Decisiones de diseño ABIERTAS (las define el QA antes de construir):**
- **(a) Alcance v1 — ¿extender POMs existentes, o añadir-only?** Extender es DRY pero arriesga romper los tests vigentes que dependen del POM compartido; añadir-only es seguro pero duplica. **Esta decisión define el tamaño del v1.**
- **(b) ¿Quién manda el estilo cuando lo existente es malo?** Respetar estructura, no propagar anti-patrones nuevos, **no refactorizar lo viejo** (scope discipline). Marcar deuda, no arreglarla sin pedirlo.
- **(c) No-regresión como entregable** — correr los N existentes tras generar el delta y garantizar que siguen verdes (conecta con el hallazgo de Fase E: storageState compartido envenenado). Buena parte del valor vendible.
- **(d) Drift gana un segundo eje** — además de FD↔app, aparece requisito-nuevo↔suite-existente. Reusa la detección de drift apuntando a otro objetivo.

**Nomenclatura.** Inclinación: **modo propio (S5) que internamente despacha a S2 o S3** según el formato del requisito nuevo. El QA piensa distinto cuando extiende que cuando crea; merece command propio.

**Riesgo que puede matar la idea.** El ingest de suites arbitrarias (Cypress/WebdriverIO/Playwright-sin-POM) es un pozo sin fondo. **Acotar v1 duro**: solo suites Playwright + POM con estructura reconocible (idealmente las que el propio agente generaría). Validar contra un caso real (la suite 10+5 del QA), no inventado.

---

## Anexo: Decisiones cerradas

| Pregunta | Respuesta |
|---|---|
| Scope SPEC | Solo `ia4d-qa-automator` |
| Target app demo | SauceDemo (`saucedemo.com`) |
| Flujo MVP | login + add to cart + checkout (golden path) |
| DoD MVP | Video reproducible + bundle de ejemplos + ≤8 min wall-clock (gate histórico, solo SauceDemo MVP) |
| Integración FD/TD | FD markdown libre o solo URL. No dependencia con `ia4d-functional-design-expert` en MVP |
| Estrategia anchor S4 | Playwright Planner descubre seed automáticamente |
| Quality layer | Writer + Reviewer activos; Judge opcional, off por defecto (`QA_ENABLE_JUDGE`, regla #10) |
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
9. **El "Writer invoca al Reviewer" rompe la regla de no invocación cruzada**. Documentado como excepción nombrada (composición Writer→Reviewer, controlada por el Writer, N≤2) en `docs/references/composition-rules.md`. Defendible ante I+D.
