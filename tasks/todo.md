# TODO — `ia4d-test-pilot` v0.1 (MVP)

> Lista ejecutable de tareas derivada de [plan.md](plan.md). Marca cada tarea como `[x]` cuando esté completada con evidencia (output, log, test verde). No marcar antes.
>
> **v2** — actualizado tras spike + lectura de subagents nativos. Arquitectura: peer `.claude/agents/` + commands `/test-pilot:*`. Sin invocación cruzada entre subagents.

## Convenciones

- **ID**: `S<slice>-T<task>` (ej. `S2-T3` = Slice 2, tarea 3).
- **Deps**: tareas bloqueantes.
- **AC**: acceptance criteria — qué tiene que ser cierto al terminar.
- **Verify**: comando/acción concreta que prueba el AC.
- **C**: complejidad relativa (S/M/L).
- **Status**: `[ ]` pendiente · `[~]` en curso · `[x]` hecho con evidencia · `[!]` bloqueado.

---

## Fase 0 — Spike Playwright MCP (CERRADO)

### S0 — Validar Playwright Test Agents en Windows

- `[x]` **S0-T1** Spike manual. Deps: ninguna. C: S
  - **AC**: documentado experimento donde Playwright Planner v1.56+ se invoca contra app web desde Claude Code en Windows y produce output útil.
  - **Verify**: archivo `docs/findings/spike-playwright-mcp.md` con verdict GO, mecanismo de activación documentado (`npx playwright init-agents --loop=claude`).
  - **Notas**: verdict GO confirmado. Algunos TBDs (outputs concretos Planner/Generator, conteo de tokens) pendientes de completar pero no bloquean Fase 1.

> ✓ **Checkpoint Fase 0 superado**. Arrancar Fase 1.

---

## Fase 1 — Foundation y guardrails

### S1 — Foundation skeleton + init nativos

- `[x]` **S1-T1** Inicializar repo Node + TS strict + tooling. Deps: S0-T1. C: S
  - **AC**: `package.json` con scripts `build`, `lint`, `format`, `test`. `tsconfig.json` con `strict: true`. ESLint + Prettier config. Vitest configurado. `@playwright/test@^1.56.0` pinneado.
  - **Verify**: `npm install && npm test` corre sin errores aunque no haya tests. ✓ Vitest exit 0 con `--passWithNoTests`. Eslint flat config v9 sin errores. ESM + Node>=20. Decisión registrada: pinning `^1.56.0` (no estricto `~1.56.0`) por elección del usuario, divergente del risk #2 del SPEC. `tsc` da TS18003 hasta S1-T3 (esperado, no bloqueante). Movido `seed.spec.ts` → `demo/saucedemo/seed.spec.ts` para alinear con SPEC §3.
- `[ ]` **S1-T2** Instalar Playwright Test Agents nativos. Deps: S1-T1. C: S
  - **AC**: `npx playwright init-agents --loop=claude` ejecutado desde la raíz. Verificar que `.claude/agents/playwright-test-planner.md`, `playwright-test-generator.md` y `playwright-test-healer.md` existen.
  - **Verify**: `ls .claude/agents/` lista los tres archivos. Abrir cualquiera y comprobar que tiene frontmatter Claude Code estándar (`name`, `description`, `tools`, `model`).
- `[ ]` **S1-T3** Crear estructura peer del SPEC. Deps: S1-T2. C: S
  - **AC**: directorios creados según SPEC §3: `.claude/agents/` (con nativos ya presentes + stubs vacíos de los `ia4d-*`), `.claude/commands/test-pilot/`, `hooks/`, `config/`, `style-contracts/`, `references/`, `demo/saucedemo/`, `tests/unit/`, `tests/integration/`. README mínimo en root.
  - **Verify**: `ls .claude/agents/ | wc -l` ≥ 10 archivos esperados (3 nativos + 7 stubs `ia4d-*`).
- `[ ]` **S1-T4** Command `/test-pilot:healthcheck`. Deps: S1-T3. C: S
  - **AC**: `.claude/commands/test-pilot/healthcheck.md` con prompt que confirma carga del proyecto (versión, fecha, número de subagents `ia4d-*` detectados).
  - **Verify**: invocar `/test-pilot:healthcheck` en Claude Code devuelve mensaje "OK" + versión + conteo subagents.
- `[ ]` **S1-T5** Hook stub + `hooks.json`. Deps: S1-T3. C: S
  - **AC**: `hooks/hooks.json` registra un hook PostToolUse dummy que solo loggea timestamp. `hooks/audit-write.ts` esqueleto.
  - **Verify**: ejecutar `/test-pilot:healthcheck` deja entrada en `audit-log.json`.

### S2 — Compliance pre-flight

- `[ ]` **S2-T1** Documentar reglas. Deps: S1-T5. C: S
  - **AC**: `references/compliance-rules.md` lista patrones bloqueados (PROD URL patterns, modos no declarados, credenciales no sintéticas).
  - **Verify**: revisión cruzada con boundaries "Never do" del SPEC.
- `[ ]` **S2-T2** Schema de `allowed-targets`. Deps: S2-T1. C: S
  - **AC**: `config/allowed-targets.yaml` con schema documentado. Ejemplo SauceDemo válido.
  - **Verify**: archivo parseable por `yaml` con campos esperados (`patterns: []`, `mode: greybox|whitebox`).
- `[ ]` **S2-T3** Implementar `hooks/pre-flight.ts`. Deps: S2-T2. C: M
  - **AC**: hook PreToolUse que lee `allowed-targets.yaml`, valida URL target, valida credenciales (no PII en seed), retorna exit code 2 si bloquea.
  - **Verify**: tests unitarios cubren ≥5 casos (URL prod, URL test válida, URL no declarada, credenciales reales detectadas, modo missing).
- `[ ]` **S2-T4** Registrar hook en `hooks.json`. Deps: S2-T3. C: S
  - **AC**: PreToolUse hook activo para llamadas a Playwright MCP.
  - **Verify**: ejecutar comando que invoca MCP con URL prod simulada → bloqueado, audit log lo refleja.
- `[ ]` **S2-T5** Subagent `ia4d-compliance-checker.md`. Deps: S2-T3. C: S
  - **AC**: `.claude/agents/ia4d-compliance-checker.md` con frontmatter + prompt que invoca `pre-flight.ts` y produce verdict estructurado.
  - **Verify**: invocar el subagent vía Task tool con URL + seed devuelve pass/fail + razón.

### S3 — PII scan

- `[ ]` **S3-T1** Catálogo de patrones PII. Deps: S1-T5. C: S
  - **AC**: `references/pii-patterns.md` con regex DNI español, IBAN (mod 97), tarjetas (Luhn), emails de dominio real, teléfonos ES. Casos positivos y negativos.
  - **Verify**: doc lista casos por cada patrón.
- `[ ]` **S3-T2** Implementar `hooks/pii-post.ts`. Deps: S3-T1. C: M
  - **AC**: hook PostToolUse que escanea `.spec.ts` recién escrito, falla con error si encuentra match, escribe audit log. **Adicionalmente**: detecta inserción de `test.fixme()` y bloquea con error específico (ver SPEC Boundaries — Never do).
  - **Verify**: unit tests con ≥8 casos PII + 1 caso `test.fixme()` introducido por Edit.
- `[ ]` **S3-T3** Subagent `ia4d-pii-scanner.md`. Deps: S3-T2. C: S
  - **AC**: `.claude/agents/ia4d-pii-scanner.md` que escanea directorio completo (no solo el archivo recién escrito). Reusable desde `/test-pilot:audit`.
  - **Verify**: invocar subagent contra carpeta con un test contaminado → reporta archivo y línea.

### S4 — Audit log

- `[ ]` **S4-T1** Schema audit log JSON. Deps: S1-T5. C: S
  - **AC**: documentado en `references/audit-log-schema.md`. Campos: timestamp, source (hook/command/subagent), action, target, result, metadata.
  - **Verify**: ejemplo de entrada parseable contra el schema.
- `[ ]` **S4-T2** Implementación `audit-write.ts` real. Deps: S4-T1. C: S
  - **AC**: helper TS que append JSON line a `audit-log.json` con schema validado.
  - **Verify**: unit test escribe N entradas, las re-lee, todas válidas.
- `[ ]` **S4-T3** Cablear todos los hooks al audit. Deps: S2-T3, S3-T2, S4-T2. C: S
  - **AC**: cada hook produce entrada audit log.
  - **Verify**: ejecutar una secuencia y verificar trazabilidad en `audit-log.json`.

> **Checkpoint Fase 1**: `npm test` verde. `/test-pilot:healthcheck` responde. Invocación con URL prohibida bloqueada. Invocación con PII detectada bloqueada. Audit log con entradas estructuradas. Sin esto, no avanzar.

---

## Fase 2 — External integration (discovery + plan)

### S5 — `/test-pilot:discover`

- `[ ]` **S5-T1** Command `.claude/commands/test-pilot/discover.md`. Deps: Fase 1 completa. C: L
  - **AC**: command toma `--url=` + opcional `--style=`. Orquesta vía Task tool: (1) `ia4d-compliance-checker` para validar target → (2) `playwright-test-planner` nativo para explorar y producir plan. Cero invocación cruzada subagent-a-subagent.
  - **Verify**: `/test-pilot:discover --url=https://www.saucedemo.com/` produce plan markdown del Planner + opcionalmente `discovery-report.md` con candidatos priorizados.
- `[ ]` **S5-T2** Schema de `discovery-report.md`. Deps: S5-T1. C: S
  - **AC**: documentado en `references/discovery-report-schema.md`. Útil para Slice 6.
  - **Verify**: el output de S5-T1 coincide con el schema.

### S6 — `/test-pilot:plan`

- `[ ]` **S6-T1** Subagent `ia4d-fd-to-plan.md`. Deps: S5-T2. C: M
  - **AC**: `.claude/agents/ia4d-fd-to-plan.md` que parsea FD markdown libre, extrae criterios, los mapea a casos. Si recibe plan del Planner como contexto adicional, lo enriquece en vez de reemplazar.
  - **Verify**: prompt cubre cómo manejar FDs ambiguos (delega al SDET, no inventa). Common Rationalizations table presente.
- `[ ]` **S6-T2** Redactar `demo/saucedemo/fd.md`. Deps: ninguna técnica. C: S
  - **AC**: FD plausible para SauceDemo con ≥10 criterios (login, catálogo, carrito, checkout, errores).
  - **Verify**: peer review honesto.
- `[ ]` **S6-T3** Command `.claude/commands/test-pilot/plan.md`. Deps: S6-T1, S6-T2. C: M
  - **AC**: command toma `--fd=` + opcional `--planner-output=`, invoca `ia4d-fd-to-plan`, produce `test-plan.md` estructurado por criterio.
  - **Verify**: `/test-pilot:plan --fd=demo/saucedemo/fd.md` produce plan con ≥10 entradas, cada una citando criterio del FD.

> **Checkpoint Fase 2**: discovery y plan funcionan end-to-end contra SauceDemo. Output estructurado. Pre-flight bloquea cuando corresponde.

---

## Fase 3 — Generación con guardrails de calidad

### S7 — `/test-pilot:generate`

- `[ ]` **S7-T1** Schema Style Contract YAML. Deps: Fase 2 completa. C: M
  - **AC**: `references/style-contract-schema.md` documenta campos: POM strategy, naming, locator priority, fixtures, banned APIs, axe-core switch.
  - **Verify**: schema cubre reglas listadas en SPEC §4.
- `[ ]` **S7-T2** Redactar `style-contracts/saucedemo.yaml`. Deps: S7-T1. C: S
  - **AC**: contract concreto cumpliendo schema.
  - **Verify**: YAML válido + reglas razonables.
- `[ ]` **S7-T3** Subagent `ia4d-style-enforcer.md`. Deps: S7-T1. C: L
  - **AC**: `.claude/agents/ia4d-style-enforcer.md` que toma `.spec.ts` recién escrito por el Generator nativo + style-contract.yaml, lo post-procesa para cumplir reglas. AST cuando posible, regex como fallback.
  - **Verify**: prompt lista reglas que enforce (POM, naming, locators, banned APIs) vs reglas que solo advierte.
- `[ ]` **S7-T4** Subagent `ia4d-a11y-injector.md`. Deps: S7-T1. C: M
  - **AC**: `.claude/agents/ia4d-a11y-injector.md` que inyecta `AxeBuilder` check al inicio de cada `test()`. Usa `@axe-core/playwright`.
  - **Verify**: prompt incluye snippet exacto del código inyectado.
- `[ ]` **S7-T5** Command `.claude/commands/test-pilot/generate.md`. Deps: S7-T3, S7-T4, S3-T3. C: L
  - **AC**: command toma `--plan=` + `--style=`, orquesta secuencialmente: `playwright-test-generator` (nativo) → `ia4d-style-enforcer` → `ia4d-a11y-injector` → `ia4d-pii-scanner`. Cada paso lee del archivo escrito por el anterior.
  - **Verify**: `/test-pilot:generate --plan=test-plan.md --style=style-contracts/saucedemo.yaml` produce ≥10 archivos `.spec.ts`.
- `[ ]` **S7-T6** Verificación automática de ejecución. Deps: S7-T5. C: M
  - **AC**: tras la cadena de subagents, el command ejecuta `npx playwright test` en el repo destino y verifica que ≥80% corren verdes. Los que fallan se marcan con confidence 0.
  - **Verify**: contra SauceDemo, ≥10 tests verdes. Los rojos quedan listados con razón.

> **Checkpoint Fase 3**: tests generados ejecutables y verdes contra SauceDemo. Style Contract aplicado. axe-core presente. Sin esto, no avanzar.

---

## Fase 4 — Quality layer

### S8 — LLM-as-judge

- `[ ]` **S8-T1** Prompt template del judge. Deps: Fase 3 completa. C: M
  - **AC**: prompt riguroso con ejes (assert significativo, selectores estables, sin waits frágiles, sin estado contaminante, cubre criterio). Output JSON estructurado.
  - **Verify**: test manual contra 3 specs devuelve scores razonables.
- `[ ]` **S8-T2** Subagent `ia4d-judge.md` + integración en `/test-pilot:generate`. Deps: S8-T1. C: M
  - **AC**: `.claude/agents/ia4d-judge.md` invokable. Produce `judge-report.json` con entrada por test. Se cablea al final de la cadena de S7-T5.
  - **Verify**: `judge-report.json` cumple schema. Cada test del Slice 7 tiene su entrada.
- `[ ]` **S8-T3** Threshold logic. Deps: S8-T2. C: S
  - **AC**: si >30% de tests tienen score <0.5, el command pausa y pide confirmación al SDET (ask-first).
  - **Verify**: dataset con muchos bajos → command pausa con mensaje claro.

> **Checkpoint Fase 4**: judge corre, produce scores, threshold se respeta. Sin esto, no avanzar.

---

## Fase 5 — Composición y export

### S9 — `/test-pilot:audit`

- `[ ]` **S9-T1** Command `.claude/commands/test-pilot/audit.md`. Deps: Fase 4 completa. C: S
  - **AC**: command toma `--dir=`, orquesta `ia4d-compliance-checker` + `ia4d-pii-scanner` standalone (no como hooks). Produce verdict pass/fail con detalle.
  - **Verify**: `/test-pilot:audit --dir=demo/output/` contra directorio limpio → pass. Contra uno contaminado → fail con razón.

### S10 — `/test-pilot:export`

- `[ ]` **S10-T1** Schema `test-catalog.json`. Deps: Fase 4 completa. C: S
  - **AC**: documentado en `references/test-catalog-schema.md`. Campos: caseId, criterio, test file, judge score, audit verdict, axe violations.
  - **Verify**: schema cubre lo necesario para futuro Xray connector.
- `[ ]` **S10-T2** Subagent `ia4d-exporter.md`. Deps: S10-T1. C: S
  - **AC**: `.claude/agents/ia4d-exporter.md` consolida outputs de slices anteriores en JSON catalog. Deduplica por hash + nombre.
  - **Verify**: ejemplo generado válido contra schema.
- `[ ]` **S10-T3** Command `.claude/commands/test-pilot/export.md`. Deps: S10-T2. C: S
  - **AC**: command invoca exporter, produce `test-catalog.json`.
  - **Verify**: invocar tras `/test-pilot:full-loop` produce JSON parseable.

### S11 — `/test-pilot:full-loop`

- `[ ]` **S11-T1** Command `.claude/commands/test-pilot/full-loop.md`. Deps: S9-T1, S10-T3. C: M
  - **AC**: command encadena discover → plan → generate → audit → export. Maneja errores intermedios sin perder estado.
  - **Verify**: invocación única produce todos los artefactos esperados.
- `[ ]` **S11-T2** Integration test mockeado. Deps: S11-T1. C: M
  - **AC**: `tests/integration/full-loop-saucedemo.test.ts` mockea subagents nativos + judge. Verifica que el flujo produce todos los artefactos.
  - **Verify**: `npm test -- integration` verde.

> **Checkpoint Fase 5**: `/test-pilot:full-loop` funciona end-to-end contra SauceDemo real + integration test verde. Sin esto, no grabar demo.

---

## Fase 6 — Demo

### S12 — Rehearsal + grabación

- `[ ]` **S12-T1** Redactar guion de demo. Deps: Fase 5 completa. C: S
  - **AC**: `demo/saucedemo/script.md` con timing T+0 a T+30, frases clave, qué se ve en pantalla.
  - **Verify**: peer review de inteligibilidad.
- `[ ]` **S12-T2** Ensayar ≥5 veces. Deps: S12-T1. C: M
  - **AC**: cada ensayo deja entrada en `demo/recordings/rehearsals.md`.
  - **Verify**: último ensayo dentro de 30 min ± 2 min, sin intervención no documentada.
- `[ ]` **S12-T3** Grabar demo final. Deps: S12-T2. C: M
  - **AC**: video reproducible (mp4 H.264 o similar). Output del agente commit-eado en `demo/output/`.
  - **Verify**: visionar el video confirma cumplimiento del Definition of Done del SPEC.
- `[ ]` **S12-T4** Documentar reproducción. Deps: S12-T3. C: S
  - **AC**: `demo/saucedemo/HOW-TO-REPRODUCE.md` con pasos exactos.
  - **Verify**: tercer involucrado reproduce con el doc y reporta dónde se atasca.

> **Checkpoint Fase 6 = Definition of Done del MVP**: demo grabada + reproducible + artefactos commit-eados.

---

## Resumen de complejidad

| Fase | Slices | Complejidad agregada |
|---|---|---|
| 0 | 1 | S (CERRADO) |
| 1 | 4 | S+S+S+S+S+M+M+S+S+S+S+S = mix de S/M |
| 2 | 2 | L+S+M+S+M = mix |
| 3 | 1 | M+S+L+M+L+M |
| 4 | 1 | M+M+S |
| 5 | 3 | S+S+S+S+M+M |
| 6 | 1 | S+M+M+S |

Slice 5 (`/test-pilot:discover`) y Slice 7 (`/test-pilot:generate`) siguen siendo los más pesados — donde más probable que aparezcan problemas no anticipados de integración con los subagents nativos.
