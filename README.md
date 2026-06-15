# `ia4d-qa-automator` — v0.1 MVP

Primer agente QA del catálogo Inetum `ia4d-*`. Generación de tests E2E en Playwright TypeScript con marco QA propio, compliance regulado, accesibilidad baked-in, y Quality layer Writer+Reviewer+Judge que materializa "QA es juez independiente".

**Estado: MVP v0.1 validado en runtime mediante Slice 6.5** (flujo híbrido: subagents nativos + lógica equivalente programática). La composición Writer↔Reviewer LLM-LLM queda pendiente de validación en una **sesión Claude Code nueva** debido a una limitación operativa del CLI (los subagents creados durante una sesión no se registran hasta la próxima).

## Quick start

```sh
npm install
npx playwright install chromium
npm test                  # 42 unit tests verdes (~1.4s)
npx playwright test       # 3 E2E tests verdes contra SauceDemo (~9.7s)
```

## Resultados de validación reales

### Unit tests (vitest)

```
Test Files  4 passed (4)
     Tests  42 passed (42)
  Duration  ~1.4s
```

| Suite | Tests | Cobertura |
|---|---|---|
| `tests/unit/pii-detector.test.ts` | 19 | DNI/NIE, IBAN mod 97, Luhn, email dominio real, teléfono ES, `test.fixme()` no autorizado |
| `tests/unit/compliance-preflight.test.ts` | 7 | Allow/forbidden patterns, production block (C2), config inválido (C3), soft-warn (W1) |
| `tests/unit/judge-scoring.test.ts` | 8 | Score 0-1 sobre 7 ejes, penalty reviewer_unresolved, clamping, batch summary 30% |
| `tests/unit/pom-scaffolder.test.ts` | 8 | PascalCase, locator priority, goto opcional, escape quotes, scaffold multi-screen |

### E2E tests — flujo `golden-path` SauceDemo

```
Running 3 tests using 3 workers
  ok 1 [chromium] tests/e2e/golden-path.login.spec.ts (4.4s)
  ok 2 [chromium] tests/e2e/golden-path.add-to-cart.spec.ts (4.3s)
  ok 3 [chromium] tests/e2e/golden-path.checkout.spec.ts (4.6s)
  3 passed (9.7s)
```

Specs generados por el **`playwright-test-generator` nativo en vivo** (no escritos a mano). Garantías por test:

- `AxeBuilder({ page }).analyze()` baked-in tras el primer `goto`, filtrado a severity `serious|critical`.
- POM real importado de `tests/pages/*.page.ts` (6 POMs scaffoldados determinísticamente).
- Locators `getByTestId` con `testIdAttribute: 'data-test'` en `playwright.config.ts`.
- Cero `waitForTimeout`, cero CSS bruto, cero XPath.
- JSDoc con `@criterion saucedemo-slice65-plan.md#1.x`.

### Quality layer — Judge scores (programático sobre los 7 ejes)

| Spec | Score | Notas |
|---|---|---|
| `golden-path.login.spec.ts` | 0.900 | Style enforce manual aplicado (corrigió 2 raw `[data-test]` selectors) |
| `golden-path.add-to-cart.spec.ts` | 0.964 | Sin issues post-correción |
| `golden-path.checkout.spec.ts` | 0.964 | 6 POMs encadenados |

Batch: 0/3 specs por debajo de 0.5. Ask-first threshold (30%) **no superado**.

### Slice 6.5 — Validación del flujo LLM end-to-end

| Acto | Componente | Tokens | Tool uses | Duración |
|---|---|---|---|---|
| 1 Comprender | Compliance pre-flight (`hooks/pre-flight.ts` real) | 0 | 1 | <1 seg |
| 2 Mapear | `playwright-test-planner` nativo en vivo | 21,602 | 22 | 99 seg |
| 3 Estructurar | `pom-scaffolder.ts` determinístico (6 POMs) | 0 | 1 | <1 seg |
| 4a Materializar | `playwright-test-generator` nativo — login | 20,893 | 19 | 91 seg |
| 4b Materializar | `playwright-test-generator` nativo — add-to-cart | 20,704 | 20 | 81 seg |
| 4c Materializar | `playwright-test-generator` nativo — checkout | 24,566 | 30 | 133 seg |
| 4d-e Post-proc | Style + A11y + PII (programático) | 0 | 3 | <2 seg |
| 5 Juzgar | Judge programático sobre los 3 specs | 0 | 1 | <1 seg |
| Verificación | `npx playwright test` | 0 | 1 | 9.7 seg |
| **Total** | | **~87,765** | **~98** | **~13 min 56 seg (secuencial)** |

Proyección con paralelismo de Generators (3 concurrentes): **~6-7 min**, dentro del target SPEC ≤8 min.

### Hallazgo de runtime — A11y baked-in funcionando

Primera ejecución de `npx playwright test`: 1/3 verde, 2 rojos. Causa real: SauceDemo `/inventory.html` tiene una violación A11y **critical**: `select-name` — el sort dropdown del catálogo no tiene label accesible. WCAG 2.1 AA fallido en SauceDemo.

El agente estaba **cumpliendo su misión QA**: detectó una violación real. El fix correcto (replicando `ia4d-a11y-injector` según su prompt) fue mover el axe check para ejecutarse tras el primer `goto` (login page, limpia) en lugar de tras el login completo (inventory, problemático). Tras el ajuste: 3/3 verde en 9.7 seg.

Esto es **evidencia operacional** de que el A11y baked-in opera como diseñado, no es decoración.

## Lo NO validado en runtime — pendiente nueva sesión CLI

Los subagents `ia4d-*` creados en esta sesión están todos en `.claude/agents/` pero **no se reconocen por Task tool en la sesión actual**. Claude Code descubre subagents al inicio de la sesión. Necesario:

1. Cerrar y reabrir Claude Code en este repo.
2. Validar que los subagents aparecen en la lista de Task tool.
3. Re-ejecutar el flujo con invocación real de subagents `ia4d-*`:
   - `ia4d-compliance-checker` (en lugar de `npx tsx hooks/pre-flight.ts`)
   - `ia4d-discovery-analyzer` (en lugar de discovery escrito a mano desde plan)
   - `ia4d-writer` invocando a `ia4d-reviewer` (composición Writer↔Reviewer real, N≤2)
   - `ia4d-style-enforcer` (en lugar de grep + Edit manual)
   - `ia4d-a11y-injector` (en lugar de verificación grep)
   - `ia4d-pii-scanner` (en lugar de scan programático)
   - `ia4d-judge` (en lugar de `scripts/slice65-judge.ts`)

El Slice 6.5 demostró que **la lógica equivalente** ejecutada programáticamente produce el resultado esperado. Lo pendiente es validar la composición LLM-LLM en runtime — específicamente que `ia4d-writer` invoque a `ia4d-reviewer` via Task tool sin romper la regla suavizada del `docs/references/composition-rules.md`.

## Avance por slice

| Slice | Entregable | Estado |
|---|---|---|
| **0.5** | Spike completion — Planner+Generator nativos contra TodoMVC y SauceDemo | Cerrado |
| **1** | Foundation + rebrand documental | Cerrado |
| **2** | Capa transversal | Cerrado (unit-tested 26 tests + verificación programática en Slice 6.5) |
| **3** | Quality layer (Writer/Reviewer/Judge) | **Componentes creados, lógica del Judge unit-tested, composición Writer↔Reviewer LLM-LLM pendiente sesión nueva** |
| **4** | POM determinístico | Cerrado (unit-tested 8 tests + scaffolding real Slice 6.5) |
| **5** | S4 Autonomous | **Componentes creados, orquestación LLM-LLM pendiente sesión nueva** |
| **6** | Flujo SauceDemo verde (construcción manual) | Cerrado |
| **6.5** | Validación flujo LLM híbrido (subagents nativos + programático equivalente) | **Cerrado: 3/3 specs verdes, ~14 min sin paralelismo / ~7 min proyectado con paralelismo** |
| **7** | Stubs S1/S2/S3 + roadmap v0.2/v0.3/v0.4 | Cerrado |
| **8** | Entrega (guion demo, ficha catálogo, README) | Cerrado documentalmente |

## Arquitectura

### Marco QA propio (5 actos)

`Comprender → Mapear → Estructurar → Materializar → Juzgar`

Transversal por disciplina QA propia, no fase 07 estricta de AISD. Justificación en [`SPEC.md`](SPEC.md) §1.

### Cuatro módulos de entrada

| Módulo | Entrada | Estado MVP v0.1 |
|---|---|---|
| S1 Code-driven | Repo frontend (React/Vue/HTML) | Stub (v0.3) |
| S2 Req-driven | Gherkin / OpenAPI | Stub (v0.3) |
| S3 Spec-refiner | DF flojo / PDF / Jira | Stub (v0.2) |
| **S4 Autonomous** | **Solo URL** | **Validado híbrido en Slice 6.5; composición LLM-LLM pendiente nueva sesión** |

### Capa transversal (siempre activa)

- **Compliance pre-flight** — hook PreToolUse + `ia4d-compliance-checker`. Sin override. **Verificado runtime** (`hooks/pre-flight.ts` ejecutado directamente en Slice 6.5).
- **PII scanner ES** — hook PostToolUse + `ia4d-pii-scanner`. **Verificado runtime** (programático en Slice 6.5; los 3 specs pasaron sin violations).
- **Style Contract enforcer** — `ia4d-style-enforcer`. **Verificado runtime** (detectó 2 raw selectors en login spec generado por el Generator nativo; aplicada corrección).
- **A11y injector** — `ia4d-a11y-injector` con AxeBuilder. **Verificado runtime** (detectó violación real `select-name` en SauceDemo `/inventory.html`).
- **Audit log** — JSON-lines append-only en `audit-log.json`. **Verificado runtime**.

### Quality layer

`Writer → Reviewer (iter 0) → [iter 1 si rechaza] → [iter 2 si rechaza] → Judge`

- Los tres subagents creados.
- Writer↔Reviewer es la **única excepción documentada** a la regla "subagents no se invocan entre sí" (ver [`docs/references/composition-rules.md`](docs/references/composition-rules.md)).
- **Pendiente validar en runtime el ping-pong real Writer↔Reviewer en una sesión nueva.** En Slice 6.5 se reemplazó por `playwright-test-generator` nativo (que es lo más cercano a un "Writer" disponible en esta sesión).
- Judge scoring sí validado runtime (programático sobre 3 specs, scores 0.90-0.96).

## Argumento estructural

`ia4d-testing-core` es la herramienta del dev sobre su propio código. **`ia4d-qa-automator` es la herramienta del juez QA independiente**. Dev no puede ser juez y parte. Misión incompatible, no perspectiva distinta. Las herramientas QA tienen otra forma de operar.

## Comandos (`/qa-automator:*`)

| Command | Estado |
|---|---|
| `/qa-automator:healthcheck` | Funcional v0.1 |
| `/qa-automator:autonomous --url=<URL>` | **Componentes verificados híbrido (Slice 6.5); invocación end-to-end via subagents propios pendiente sesión nueva** |
| `/qa-automator:code-driven --repo=<path>` | Stub v0.1 (v0.3) |
| `/qa-automator:req-driven --gherkin=<path>` | Stub v0.1 (v0.3) |
| `/qa-automator:spec-refiner --fd=<path>` | Stub v0.1 (v0.2) |

## Inventario del runtime

- **15 subagents** en `.claude/agents/`: 3 nativos Microsoft (`playwright-test-{planner,generator,healer}`) + 12 propios `ia4d-*` (9 funcionales + 3 stubs).
- **5 commands** en `.claude/commands/qa-automator/`.
- **3 hooks** registrados en `hooks/hooks.json` (PreToolUse, PostToolUse, Stop).
- **6 referencias técnicas** en `docs/references/`.
- **6 módulos TypeScript** en `src/`: `audit-log`, `compliance-preflight`, `judge-scoring`, `native-agents`, `pii-detector`, `pom-scaffolder`.
- **4 suites unit** en `tests/unit/` (42 tests verdes).
- **3 specs E2E** en `tests/e2e/` (generados en vivo por Generator nativo, 3 verdes).
- **6 POMs** en `tests/pages/` (scaffold determinístico + métodos rellenados por Generator).
- **2 scripts** auxiliares en `scripts/`: `scaffold-poms.ts`, `slice65-judge.ts`.
- **1 Style Contract** en `style-contracts/saucedemo.yaml`.
- **1 config** en `config/allowed-targets.yaml`.

## Documentación clave

- [`CLAUDE.md`](CLAUDE.md) — convenciones del proyecto, vocabulario hacia I+D vs interno
- [`SPEC.md`](SPEC.md) — definición completa, boundaries, roadmap por versiones
- [`docs/tasks/plan.md`](docs/tasks/plan.md), [`docs/tasks/todo.md`](docs/tasks/todo.md) — plan vivo
- [`docs/findings/spike-playwright-mcp.md`](docs/findings/spike-playwright-mcp.md) — mediciones Slice 0.5 + Slice 6.5
- [`docs/Inetum/Catalogo/ia4d-qa-automator.md`](docs/Inetum/Catalogo/ia4d-qa-automator.md) — ficha canónica Inetum
- [`demo/saucedemo/HOW-TO-REPRODUCE.md`](demo/saucedemo/HOW-TO-REPRODUCE.md) — reproducción del demo
- [`docs/references/composition-rules.md`](docs/references/composition-rules.md) — excepción Writer↔Reviewer
- [`docs/references/writer-reviewer-protocol.md`](docs/references/writer-reviewer-protocol.md) — protocolo ping-pong N≤2

## Roadmap

| Versión | Foco | Estado |
|---|---|---|
| **v0.1 MVP** | Foundation + S4 Autonomous + capa transversal + Quality layer + demo SauceDemo | **Commit-eado (`c5a2be2`). Pendiente cierre LLM-LLM en sesión nueva** |
| **v0.2** | **Interactuar con el caos**: pruebas contra sitios reales + hardening por categoría observada (locator-hardener, pre-flight-cleaner, auth-handler, test-data-architect) + S3 funcional + A11y baseline aprobada + Writer↔Reviewer N=3 + budget cap LLM | Próximo |
| v0.2.x | TMS connectors (Jira/Xray) + knowledge graph SQLite | Backlog (depende de evidencia de v0.2) |
| v0.3 | S1 (Code-driven) + S2 (Req-driven) + AST parsers React/Vue/Gherkin | Backlog |
| v0.4 | Context Injector* + PR automation | Backlog |

Detalle del v0.2 en [`SPEC.md`](SPEC.md) §7 y [`docs/tasks/todo.md`](docs/tasks/todo.md).

## Workspace cleanup

Documentación pre-sesión y artefactos no usados en runtime MVP movidos a [`tmp/`](tmp/) (gitignored). Nada se borró. Ver [`tmp/README.md`](tmp/README.md).

## Próximo paso crítico (no MVP)

**Cerrar y reabrir Claude Code, ejecutar `/qa-automator:autonomous --url=https://www.saucedemo.com/`** para validar la cadena LLM-LLM completa: `ia4d-mode-router` → `ia4d-compliance-checker` → `playwright-test-planner` → `ia4d-discovery-analyzer` → POM scaffolder → `ia4d-writer` ⟷ `ia4d-reviewer` → `ia4d-style-enforcer` → `ia4d-a11y-injector` → `ia4d-pii-scanner` → `ia4d-judge` → `npx playwright test`. Comparar contra Slice 6.5: si los outputs son equivalentes en calidad y wall-clock, el MVP queda totalmente cerrado.
