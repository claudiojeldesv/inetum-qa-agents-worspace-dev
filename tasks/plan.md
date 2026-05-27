# Plan — `ia4d-test-pilot` v0.1 (MVP)

> Plan de ejecución para entregar el MVP definido en [SPEC.md](../SPEC.md). Modo plan: este documento no implementa nada — describe slices verticales, dependencias, checkpoints y criterios de verificación.
>
> **v2** — actualizado tras el spike (Slice 0 cerrado con verdict GO) y la lectura de los subagents nativos. Arquitectura confirmada: peer en `.claude/agents/`, orquestación en `.claude/commands/test-pilot/*`. Cero invocación cruzada entre subagents.

## 1. Principios del plan

1. **Vertical slicing.** Cada slice entrega un camino completo end-to-end (input → procesamiento → output verificable), no una capa horizontal.
2. **Spike primero, código después.** Ya hecho. Verdict GO. Ver [findings](../docs/findings/spike-playwright-mcp.md).
3. **Checkpoints bloqueantes entre fases.** No avanzar sin haber demostrado el slice anterior funcionando con evidencia.
4. **Disciplina de scope.** El SPEC define qué entra al MVP. Cualquier feature no listada se desestima durante la ejecución.
5. **Sin estimaciones temporales.** Solo complejidad relativa S/M/L. El usuario gestiona el reloj.
6. **Subagents nunca se invocan entre sí.** Los commands `/test-pilot:*` orquestan vía Task tool + handoffs por archivo. Patrón canónico Microsoft + agent-skills.

## 2. Dependency graph

```
[Slice 0: Spike Playwright MCP]   ✓ verdict GO
        │
        ▼
[Slice 1: Foundation + init nativos]
        │
        ▼
[Slice 2: Compliance pre-flight] ──┐
[Slice 3: PII scan]            ────┤  (paralelizables)
[Slice 4: Audit log]           ────┘
        │
        ▼ (checkpoint: guardrails verdes)
[Slice 5: /test-pilot:discover]
        │
        ▼
[Slice 6: /test-pilot:plan]
        │
        ▼
[Slice 7: /test-pilot:generate]
        │
        ▼ (checkpoint: tests generados ejecutables)
[Slice 8: LLM-as-judge]
        │
        ▼
[Slice 9: /test-pilot:audit] ──┐
[Slice 10: /test-pilot:export] ─┤  (paralelizables)
        │                       │
        └───────────┬───────────┘
                    ▼
[Slice 11: /test-pilot:full-loop]
        │
        ▼ (checkpoint: integración end-to-end)
[Slice 12: Demo rehearsal + recording]
        │
        ▼ (Definition of Done)
```

## 3. Fases y checkpoints

### Fase 0 — Validación de motor (Spike)

**Slice 0** — único. **CERRADO. Verdict GO.** Mecanismo de activación confirmado: `npx playwright init-agents --loop=claude`. Findings en [docs/findings/spike-playwright-mcp.md](../docs/findings/spike-playwright-mcp.md). Algunos TBDs (outputs concretos del Planner/Generator, conteo de tokens) quedan pendientes de completar pero no bloquean.

### Fase 1 — Foundation y guardrails

**Slices 1, 2, 3, 4.**

Estado al final: el repo arranca con Playwright agents nativos instalados, estructura peer `.claude/agents/` lista, hooks `pre-flight`, `pii-post` y `audit-write` registrados y funcionando, tests unitarios verdes para compliance y PII.

**Checkpoint**: invocar `/test-pilot:healthcheck` devuelve OK + versión. Invocación con URL prohibida bloqueada por pre-flight con razón estructurada y entrada en audit log. `.spec.ts` con DNI español dispara fallo del PII scanner. Tests `vitest` verdes.

### Fase 2 — External integration (discovery + plan)

**Slices 5, 6.**

Estado al final: `/test-pilot:discover` orquesta compliance-checker + `playwright-test-planner` nativo contra SauceDemo y produce mapa + plan inicial. `/test-pilot:plan` toma FD en markdown libre y produce plan enriquecido.

**Checkpoint**: `/test-pilot:discover` contra `https://www.saucedemo.com/` produce plan del Planner con ≥3 escenarios. `/test-pilot:plan --fd=demo/saucedemo/fd.md` produce `test-plan.md` con ≥10 criterios mapeados.

### Fase 3 — Generación con guardrails de calidad

**Slice 7.**

Estado al final: `/test-pilot:generate` orquesta `playwright-test-generator` nativo, post-procesa con `ia4d-style-enforcer` + `ia4d-a11y-injector`, valida con `ia4d-pii-scanner`. Los `.spec.ts` resultantes corren verdes localmente.

**Checkpoint**: `/test-pilot:generate --plan=test-plan.md --style=style-contracts/saucedemo.yaml` produce ≥10 archivos `.spec.ts` que (a) cumplen el Style Contract (verificable por AST/regex), (b) incluyen `axe-core` check, (c) corren verdes con `npx playwright test`.

### Fase 4 — Quality layer

**Slice 8.**

Estado al final: cada test generado pasa por `ia4d-judge`, recibe score 0-1 + razonamiento, queda registrado en `judge-report.json`. Tests con score <0.5 marcados para revisión SDET.

**Checkpoint**: `judge-report.json` contiene una entrada por test con score numérico y razonamiento. Threshold del 30% dispara ask-first.

### Fase 5 — Composición y export

**Slices 9, 10, 11.**

Estado al final: los seis commands del SPEC funcionan individualmente. `/test-pilot:full-loop` los encadena. Integration test mockeado pasa.

**Checkpoint**: `/test-pilot:full-loop --url=saucedemo.com --fd=demo/saucedemo/fd.md --style=style-contracts/saucedemo.yaml` produce todos los artefactos en un único directorio output. Integration test verde con LLM mockeado.

### Fase 6 — Demo

**Slice 12.**

Estado al final: video de 30 minutos grabado, reproducible, que cumple el Definition of Done del SPEC. Documento de reproducción listo.

**Checkpoint**: video producido, suite generada commit-eada en `demo/output/`, audit log y test-catalog.json adjuntos. Reproducción manual del guion en segunda sesión termina sin intervención no documentada.

## 4. Slices, contenido y verificación

| ID | Slice | Contenido principal | Complejidad |
|---|---|---|---|
| 0 | Spike Playwright MCP | (CERRADO) Findings doc con verdict GO | S |
| 1 | Foundation + init nativos | Repo Node 20, TS strict, vitest, ESLint+Prettier, Playwright v1.56+. `npx playwright init-agents --loop=claude` ejecutado. Estructura `.claude/agents/` + `.claude/commands/test-pilot/`. `hooks/hooks.json`. Command `/test-pilot:healthcheck` | M |
| 2 | Compliance pre-flight | `references/compliance-rules.md`. `hooks/pre-flight.ts`. `config/allowed-targets.yaml` schema. Subagent `ia4d-compliance-checker.md`. Unit tests matrix | M |
| 3 | PII scan | `references/pii-patterns.md`. `hooks/pii-post.ts`. Subagent `ia4d-pii-scanner.md`. Unit tests con DNI/IBAN/Luhn | M |
| 4 | Audit log | Schema JSON. `references/audit-log-schema.md`. `hooks/audit-write.ts`. Cableado a todos los hooks | S |
| 5 | `/test-pilot:discover` | Command `discover.md` que orquesta compliance-checker → `playwright-test-planner` nativo vía Task tool. Verifica integración funcional | L |
| 6 | `/test-pilot:plan` | Subagent `ia4d-fd-to-plan.md`. Command `plan.md`. `demo/saucedemo/fd.md` redactado | M |
| 7 | `/test-pilot:generate` | Subagent `ia4d-style-enforcer.md`. Subagent `ia4d-a11y-injector.md`. `style-contracts/saucedemo.yaml`. Command `generate.md` orquesta `playwright-test-generator` nativo → enforcer → injector → pii-scanner. Verificación AST + ejecución verde | L |
| 8 | LLM-as-judge | Subagent `ia4d-judge.md`. Prompt template. Schema `judge-report.json`. Threshold 30%/0.5 | M |
| 9 | `/test-pilot:audit` | Command `audit.md` que orquesta compliance-checker + pii-scanner standalone sobre directorio | S |
| 10 | `/test-pilot:export` | Subagent `ia4d-exporter.md`. Schema `test-catalog.json`. Command `export.md` | S |
| 11 | `/test-pilot:full-loop` | Command `full-loop.md` que encadena discover → plan → generate → audit → export. Integration test mockeado | M |
| 12 | Demo | Guion, ensayos, grabación. `demo/saucedemo/expected-output/` como baseline | M |

## 5. Riesgos y mitigaciones operativas

| Riesgo | Mitigación operativa |
|---|---|
| Playwright Planner no determinístico en demo en vivo | Ensayar 5+ veces antes de grabar. Tener seed manual como fallback no documentado |
| Cambio de nombres de subagents nativos en releases futuros | Pinear Playwright v1.56.x. Encapsular nombres (`playwright-test-planner`, etc.) en un módulo de constantes para que un breaking change toque un solo archivo |
| LLM-as-judge introduce coste no acotado | En MVP usar modelo barato (Haiku) para judge. Budget cap entra en v0.2 |
| axe-core falla en SauceDemo (la app puede tener violaciones reales) | Documentar violaciones encontradas como findings reales — es punto a favor del demo |
| Style Contract enforce rompe tests válidos del Generator | Iterar el contract en Slice 7 hasta convergencia. Documentar reglas desactivadas |
| Healer nativo introduce `test.fixme()` no autorizado | Hook post-Edit detecta inserciones de `test.fixme()` y bloquea (ver SPEC Boundaries — Never do) |
| JSON catalog no satisface cliente que esperaba Xray | Es non-goal MVP explícito. Si surge, derivar a roadmap v0.2 |

## 6. Cómo avanzar

1. ✓ Slice 0 cerrado con verdict GO.
2. **Arrancar Fase 1** (Slice 1 — Foundation + init nativos).
3. Por cada slice: implementar, mostrar verificación, marcar completo en `tasks/todo.md`.
4. Por cada checkpoint: revisión humana antes de pasar a la fase siguiente. Sin atajos.
5. No tocar slices posteriores hasta haber pasado el checkpoint del actual.

## 6.5. Concesiones registradas durante ejecución

Decisiones pragmáticas tomadas durante la ejecución de un slice que no son default del SPEC. Se listan aquí para no perderlas de vista y revisarlas en v0.2.

| Fecha | Slice | Concesión | Razón | Deuda v0.2 |
|---|---|---|---|---|
| 2026-05-27 | 7 | ~~`rawCss` retirado de `locators.banned`~~ **RESUELTO** mismo día. | El Generator nativo emite `[data-test="..."]` literales y la regla `RAW_CSS_LOCATOR` no era auto-fixable. | Resuelto añadiendo `convertCssLocators()` al `--fix` del style-enforcer: transforma `locator('[data-test*=X]')` → `getByTestId('X')` automáticamente, y se añadió instrucción preventiva al prompt del Generator. `rawCss` vuelve a `banned` en el contract. Mecanismo de severidad por regla (`block`/`warn`/`off`) sigue siendo deuda v0.2 pero ya no es bloqueante. |

## 7. Lo que este plan deliberadamente no hace

- No define fechas. El usuario gestiona el calendario.
- No asigna responsables. Probablemente el SDET solo en MVP.
- No incluye admisión al catálogo Inetum. Es post-MVP.
- No incluye `test-explorer`, `test-healer` Inetum, ni otros agentes de la cartera.
- No prepara infraestructura de despliegue. El agente vive en local en MVP.
- No reimplementa exploración / generación / healing — los nativos se usan tal cual.

## 8. Próximo paso

**Slice 1 — Foundation + init nativos.** Tareas en `tasks/todo.md` bajo la sección S1. Empieza por S1-T1 (inicializar repo + tooling).
