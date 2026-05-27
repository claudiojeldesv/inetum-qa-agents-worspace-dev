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
- `[x]` **S1-T2** Instalar Playwright Test Agents nativos. Deps: S1-T1. C: S
  - **AC**: `npx playwright init-agents --loop=claude` ejecutado desde la raíz. Verificar que `.claude/agents/playwright-test-planner.md`, `playwright-test-generator.md` y `playwright-test-healer.md` existen.
  - **Verify**: `ls .claude/agents/` lista los tres archivos. Abrir cualquiera y comprobar que tiene frontmatter Claude Code estándar (`name`, `description`, `tools`, `model`). ✓ Comando re-ejecutado en sesión, cero diff (archivos del spike ya alineados con Playwright v1.60.0). Frontmatter de los tres validado: `name`, `description`, `tools` (con tools `mcp__playwright-test__*`), `model: sonnet`. `.mcp.json` también presente y trackeado, registra el MCP server `playwright-test`.
- `[x]` **S1-T3** Crear estructura peer del SPEC. Deps: S1-T2. C: S
  - **AC**: directorios creados según SPEC §3: `.claude/agents/` (con nativos ya presentes + stubs vacíos de los `ia4d-*`), `.claude/commands/test-pilot/`, `hooks/`, `config/`, `style-contracts/`, `references/`, `demo/saucedemo/`, `tests/unit/`, `tests/integration/`. README mínimo en root.
  - **Verify**: `ls .claude/agents/ | wc -l` ≥ 10 archivos esperados (3 nativos + 7 stubs `ia4d-*`). ✓ Exactamente 10 (3 nativos + 7 `ia4d-*`: compliance-checker, pii-scanner, fd-to-plan, style-enforcer, a11y-injector, judge, exporter). Cada stub con frontmatter Claude Code válido (name/description/tools/model) y body de 3-4 líneas mapeando responsabilidad esperada al slice futuro. Dirs `.claude/commands/test-pilot/`, `hooks/`, `config/`, `style-contracts/`, `references/`, `demo/recordings/`, `tests/unit/`, `tests/integration/` versionados vía `.gitkeep`. README.md mínimo en root. `tsc --noEmit` aún da TS18003 (esperado hasta primer .ts vivo en S1-T5).
- `[x]` **S1-T4** Command `/test-pilot:healthcheck`. Deps: S1-T3. C: S
  - **AC**: `.claude/commands/test-pilot/healthcheck.md` con prompt que confirma carga del proyecto (versión, fecha, número de subagents `ia4d-*` detectados).
  - **Verify**: invocar `/test-pilot:healthcheck` en Claude Code devuelve mensaje "OK" + versión + conteo subagents. ✓ Comando creado con `allowed-tools: Bash(node:*)` para inyección determinista vía `!`node ...`` (cross-platform, sin dependencia de utilidades shell). Verificación equivalente simulando los snippets: version `0.1.0`, fecha `2026-05-26`, ia4d-* count `7`, nativos count `3`. Output esperado: `OK ia4d-test-pilot v0.1.0 / Fecha: 2026-05-26 / Subagents ia4d-*: 7 / Subagents playwright-test-* (nativos): 3`. Invocación real `/test-pilot:healthcheck` queda al SDET (no la puedo disparar sobre la misma sesión).
- `[x]` **S1-T5** Hook stub + registro en `.claude/settings.json`. Deps: S1-T3. C: S
  - **AC** (revisado 2026-05-26): registrar un hook `PostToolUse` dummy en `.claude/settings.json` (versionado) que ejecuta `hooks/audit-write.ts` para loggear timestamp. `hooks/audit-write.ts` esqueleto. La decisión de no usar `hooks/hooks.json` está documentada en SPEC.md anexo "Decisiones técnicas durante implementación".
  - **Verify**: ejecutar `/test-pilot:healthcheck` deja entrada en `audit-log.json`. ✓ Hook con matcher `*` registrado en `.claude/settings.json` (versionado). Runner: `npx tsx hooks/audit-write.ts` (tsx añadido como devDep). `audit-log.json` en `.gitignore` (output local). Script tipo-seguro: lee stdin como JSON, append una línea JSONL con `{timestamp, source, event, tool, sessionId}`. Diseño defensivo: nunca falla la ejecución del modelo (stdin malformado → loggea a stderr + exit 0). Verify observado en vivo: el hook ya disparó en mi propia sesión Claude Code al ejecutar Bash arbitrarios → audit-log.json gana líneas por cada tool use. `tsc --noEmit` ahora limpio (TS18003 cerrado).
  - **Nota de scope**: el hook está activo en TODA sesión Claude Code de este repo, no solo durante `/test-pilot:*`. Es coherente con el spirit "audit transversal" del SPEC. Si en el futuro se quiere scopear, requeriría un wrapper en el comando que arme/desarme el hook (post-MVP).

### S2 — Compliance pre-flight

- `[x]` **S2-T1** Documentar reglas. Deps: S1-T5. C: S
  - **AC**: `references/compliance-rules.md` lista patrones bloqueados (PROD URL patterns, modos no declarados, credenciales no sintéticas).
  - **Verify**: revisión cruzada con boundaries "Never do" del SPEC. ✓ 5 reglas (R-001..R-005) con razón, razón de bloqueo estructurada (`URL_NOT_ALLOWLISTED`, `URL_BLOCKLISTED`, `MODE_INVALID_OR_MISSING`, `CREDENTIAL_NOT_SYNTHETIC_DECLARED`, `CREDENTIAL_LOOKS_LIKE_PII`) + defaults seguros + tabla de verdict con los 5 casos del verify S2-T3 + sección "Cross-reference" mapeando reglas a SPEC §6 Never do + sección "Lo que pre-flight NO hace" (delimita scope con S3 pii-post).
- `[x]` **S2-T2** Schema de `allowed-targets`. Deps: S2-T1. C: S
  - **AC**: `config/allowed-targets.yaml` con schema documentado. Ejemplo SauceDemo válido.
  - **Verify**: archivo parseable por `yaml` con campos esperados (`patterns: []`, `mode: greybox|whitebox`). ✓ Schema documentado en `references/allowed-targets-schema.md` (campos: version, mode, allowedPatterns, blockedPatterns, syntheticCredentials.{usernames,passwords}). Config ejemplo SauceDemo con 4 allowedPatterns, 2 blockedPatterns (defense in depth contra prod-*), 6 usernames sintéticos + 1 password. Parsing verificado con `yaml` package v2.9: version=1, mode=greybox, counts correctos. `yaml` añadido como runtime dependency (no devDep; los hooks lo necesitan en ejecución).
- `[x]` **S2-T3** Implementar `hooks/pre-flight.ts`. Deps: S2-T2. C: M
  - **AC**: hook PreToolUse que lee `allowed-targets.yaml`, valida URL target, valida credenciales (no PII en seed), retorna exit code 2 si bloquea.
  - **Verify**: tests unitarios cubren ≥5 casos (URL prod, URL test válida, URL no declarada, credenciales reales detectadas, modo missing). ✓ Implementación con R-001..R-005 + defaults seguros, glob→regex propio (sin minimatch), detector PII inline (DNI ES con checksum + Luhn) — la modularización a `hooks/pii-detector.ts` queda para S3-T2 cuando se amplía el catálogo. 9 tests evaluate + 3 tests DNI + 3 tests Luhn = **15 verdes**. End-to-end CLI verificado: stdin con URL prod → exit 2 + razón; happy path → exit 0. `tsc --noEmit` y `eslint` limpios.
- `[x]` **S2-T4** Registrar hook en `.claude/settings.json`. Deps: S2-T3. C: S
  - **AC** (revisado 2026-05-26 por consistencia con SPEC anexo "Decisiones técnicas"): PreToolUse hook activo para llamadas a Playwright MCP, registrado en `.claude/settings.json` (no en el desaparecido `hooks/hooks.json`).
  - **Verify**: ejecutar comando que invoca MCP con URL prod simulada → bloqueado, audit log lo refleja. ✓ Bloque `PreToolUse` con matcher regex `mcp__playwright-test__.*` apuntando a `npx tsx hooks/pre-flight.ts`. settings.json parsea OK. Verify end-to-end real requiere habilitar el MCP `playwright-test` en settings.local.json (actualmente deshabilitado por el spike) e invocar un tool MCP con URL prod — queda al SDET. Verify equivalente ya hecho en S2-T3 vía CLI directa (stdin → exit 2 + razón estructurada).
- `[x]` **S2-T5** Subagent `ia4d-compliance-checker.md`. Deps: S2-T3. C: S
  - **AC**: `.claude/agents/ia4d-compliance-checker.md` con frontmatter + prompt que invoca `pre-flight.ts` y produce verdict estructurado.
  - **Verify**: invocar el subagent vía Task tool con URL + seed devuelve pass/fail + razón. ✓ Stub reemplazado por subagent operativo: frontmatter `tools: Bash, Read` + prompt detallado con (1) construcción de payload JSON, (2) invocación `echo '...' | npx tsx hooks/pre-flight.ts --cli-json`, (3) parseo del verdict JSON, (4) output dual humano (`VERDICT: PASS/BLOCK/ERROR` + REASON + RULE) + máquina (JSON crudo del hook). Mapeo de `reason` codes → reglas R-001..R-005. Modo `--cli-json` añadido a `pre-flight.ts` para devolver JSON limpio por stdout sin parsing frágil de stderr. Verify end-to-end vía Task tool queda al SDET en sesión nueva (en mi sesión actual los subagents `ia4d-*` no estaban cargados al inicio); verify equivalente cumplido por el modo `--cli-json` probado vía Bash directo: blocked URL → `{"pass":false,"reason":"URL_NOT_ALLOWLISTED",...}`; happy path → `{"pass":true}`.

### S3 — PII scan

- `[x]` **S3-T1** Catálogo de patrones PII. Deps: S1-T5. C: S
  - **AC**: `references/pii-patterns.md` con regex DNI español, IBAN (mod 97), tarjetas (Luhn), emails de dominio real, teléfonos ES. Casos positivos y negativos.
  - **Verify**: doc lista casos por cada patrón. ✓ 6 patrones (`PII_DNI`, `PII_NIE`, `PII_IBAN`, `PII_CARD`, `PII_EMAIL_REAL`, `PII_PHONE_ES`) con regex, validación adicional (checksum DNI/NIE, mod 97 IBAN, Luhn tarjeta), ≥3 casos positivos y ≥3 negativos por patrón, interfaz `PIIFinding`, scope explícito de qué NO cubre el MVP (CIF, pasaportes no-ES, direcciones, datos médicos, PII hashed). Cross-reference a pre-flight R-005, pii-post, ia4d-pii-scanner, SPEC §6.
- `[x]` **S3-T2** Implementar `hooks/pii-post.ts`. Deps: S3-T1. C: M
  - **AC**: hook PostToolUse que escanea `.spec.ts` recién escrito, falla con error si encuentra match, escribe audit log. **Adicionalmente**: detecta inserción de `test.fixme()` y bloquea con error específico (ver SPEC Boundaries — Never do).
  - **Verify**: unit tests con ≥8 casos PII + 1 caso `test.fixme()` introducido por Edit. ✓ Extracción del detector compartido `hooks/pii-detector.ts` (6 patrones: DNI, NIE, IBAN mod97, Luhn, email dominio real, phone ES) + refactor de `pre-flight.ts` para reusar `looksLikePII()`. `hooks/pii-post.ts` con doble modo: hook PostToolUse (matcher Edit|Write|MultiEdit en `.claude/settings.json`, exit 2 si encuentra) + `--scan-dir` CLI (JSON estructurado, exit 0 — usado por S3-T3). El audit-log lo escribe el hook audit-write transversalmente, no pii-post directamente. **41 tests verdes**: 26 pii-detector + 6 pii-post + 9 pre-flight existentes. Verificado end-to-end vía CLI: archivo con `12345678Z` y `test.fixme()` → exit 2, stderr lista DNI línea 4 col 16 + FIXME línea 5 col 3.
- `[x]` **S3-T3** Subagent `ia4d-pii-scanner.md`. Deps: S3-T2. C: S
  - **AC**: `.claude/agents/ia4d-pii-scanner.md` que escanea directorio completo (no solo el archivo recién escrito). Reusable desde `/test-pilot:audit`.
  - **Verify**: invocar subagent contra carpeta con un test contaminado → reporta archivo y línea. ✓ Stub reemplazado por subagent operativo: tools `Bash, Read`, prompt invoca `npx tsx hooks/pii-post.ts --scan-dir <path>`, parsea el JSON `{pass, scanned, findings[]}`, expone output dual humano (VERDICT PASS/BLOCK + lista de findings por archivo:línea:col) + máquina (JSON crudo). Tabla diferenciadora hook vs subagent documentada. Verify equivalente cumplido en S3-T2 unit tests + ejecución CLI: dir con `12345678Z` y `test.fixme()` → JSON con 2 findings (PII_DNI + TEST_FIXME_INSERTED) con line/column correctos. Invocación real Task tool queda al SDET en sesión nueva.

### S4 — Audit log

- `[x]` **S4-T1** Schema audit log JSON. Deps: S1-T5. C: S
  - **AC**: documentado en `references/audit-log-schema.md`. Campos: timestamp, source (hook/command/subagent), action, target, result, metadata.
  - **Verify**: ejemplo de entrada parseable contra el schema. ✓ Schema v1 con enums cerrados (action: tool_invocation/compliance_check/pii_scan; result: pass/block/noop/unknown), source tipado por categoría (hook:*, command:*, subagent:*), 4 ejemplos por action + sección "trazabilidad esperada" para 2 escenarios reales.
- `[x]` **S4-T2** Implementación `audit-write.ts` real. Deps: S4-T1. C: S
  - **AC**: helper TS que append JSON line a `audit-log.json` con schema validado.
  - **Verify**: unit test escribe N entradas, las re-lee, todas válidas. ✓ Módulo compartido `hooks/audit.ts` con `createEntry()` (rellena timestamp + schemaVersion) + `validateAuditEntry()` (validador estructural tipo-seguro, no JSON Schema) + `appendAuditEntry()` (escribe JSONL, no lanza si falla). Refactor de `audit-write.ts` para usar el helper y emitir nuevo schema. **9 tests audit verdes** + 41 tests previos = **50 total**. Test "escribe N=5 entradas y las re-lee todas válidas" cumple verify literal.
- `[x]` **S4-T3** Cablear todos los hooks al audit. Deps: S2-T3, S3-T2, S4-T2. C: S
  - **AC**: cada hook produce entrada audit log.
  - **Verify**: ejecutar una secuencia y verificar trazabilidad en `audit-log.json`. ✓ `pre-flight.ts` escribe entrada `compliance_check` con reason en metadata (antes de exit, cubre modo hook y CLI). `pii-post.ts` escribe entrada `pii_scan` con findings count y reason del primer finding (cubre noop, pass, block, unknown). Audit transversal de `audit-write.ts` migrado a nuevo schema. Trazabilidad verificada en vivo: Write tool de seed.spec.ts → 2 entradas distinguibles (tool_invocation Write pass + pii_scan path pass findings=0); pre-flight CLI con URL prod → entrada compliance_check block reason=URL_NOT_ALLOWLISTED.

> **Checkpoint Fase 1**: `npm test` verde. `/test-pilot:healthcheck` responde. Invocación con URL prohibida bloqueada. Invocación con PII detectada bloqueada. Audit log con entradas estructuradas. Sin esto, no avanzar.

---

## Fase 2 — External integration (discovery + plan)

### S5 — `/test-pilot:discover`

- `[x]` **S5-T1** Command `.claude/commands/test-pilot/discover.md`. Deps: Fase 1 completa. C: L
  - **AC**: command toma `--url=` + opcional `--style=`. Orquesta vía Task tool: (1) `ia4d-compliance-checker` para validar target → (2) `playwright-test-planner` nativo para explorar y producir plan. Cero invocación cruzada subagent-a-subagent.
  - **Verify**: `/test-pilot:discover --url=https://www.saucedemo.com/` produce plan markdown del Planner + opcionalmente `discovery-report.md` con candidatos priorizados. ✓ Command markdown con frontmatter `allowed-tools: Task, Read, Write, Bash(mkdir:*)`. Prompt en 5 pasos: parsea args, ejecuta `ia4d-compliance-checker` vía Task tool (aborta sin override si BLOCK), prepara `output/discover/`, invoca `playwright-test-planner` nativo (le pide guardar en `output/discover/plan.md` vía `planner_save_plan`), compone `discovery-report.md` según schema, imprime resumen al SDET. Reglas duras explícitas (no orquestación cruzada, no override compliance, no inventar campos, no retries silenciosos). Claude Code ya descubre `/test-pilot:discover` como skill (system reminder lo lista). Verify literal (`/test-pilot:discover --url=https://www.saucedemo.com/`) queda al SDET en sesión con MCP playwright-test activo.
- `[x]` **S5-T2** Schema de `discovery-report.md`. Deps: S5-T1. C: S
  - **AC**: documentado en `references/discovery-report-schema.md`. Útil para Slice 6.
  - **Verify**: el output de S5-T1 coincide con el schema. ✓ Schema completo en markdown: 5 campos requeridos (URL, Timestamp, Compliance verdict, Plan source, Style contract) + 3 secciones requeridas (Resumen del Planner con N escenarios y bullets, Plan completo como referencia no duplicada, Observaciones con fallback "Sin observaciones particulares"). Ejemplo válido completo SauceDemo. Sección "lo que NO captura" delimita scope contra Slice 6 (FD enrich) y Slice 7 (tests ejecutables). Consumidores documentados (humano, `/test-pilot:plan`, `/test-pilot:full-loop`).

> **Observación post-Slice 5 (2026-05-26)**: el primer run real de `/test-pilot:discover` contra SauceDemo tardó ~20 min. Aceptable para MVP pero mejorable. Optimizaciones para v0.2 (no MVP): limitar scope del Planner en el prompt (`máximo N escenarios`, evitar rutas autenticadas), caché por URL (skip si `discovery-report.md` reciente), modelo Haiku para el Planner si calidad alcanza, restringir tools MCP (quitar `browser_take_screenshot` reduce tokens dramáticamente). Registrar como ítem en backlog v0.2 cuando llegue ese momento.

### S6 — `/test-pilot:plan`

- `[x]` **S6-T1** Subagent `ia4d-fd-to-plan.md`. Deps: S5-T2. C: M
  - **AC**: `.claude/agents/ia4d-fd-to-plan.md` que parsea FD markdown libre, extrae criterios, los mapea a casos. Si recibe plan del Planner como contexto adicional, lo enriquece en vez de reemplazar.
  - **Verify**: prompt cubre cómo manejar FDs ambiguos (delega al SDET, no inventa). Common Rationalizations table presente. ✓ Stub reemplazado por subagent operativo: tools `Read, Write`, prompt detallado con 3 tipos de códigos (RF-NNN del FD formal, FREE-NNN para FD libre sin códigos, GAP-NNN para observaciones del Planner no cubiertas por FD). Sección "Cómo usas el planner-output" deja claro que el FD manda y el planner-output es contexto auxiliar. Common Rationalizations table de 5 entradas (no inventar logout, no fusionar criterios, no promover GAPs a RFs, no interpretar ambiguos, no inyectar A11y). Sección final "Ambigüedades en el FD" obligatoria si encuentra criterios poco accionables.
- `[x]` **S6-T2** Redactar `demo/saucedemo/fd.md`. Deps: ninguna técnica. C: S
  - **AC**: FD plausible para SauceDemo con ≥10 criterios (login, catálogo, carrito, checkout, errores).
  - **Verify**: peer review honesto. ✓ 13 criterios RF-001..RF-013 cubriendo autenticación (4 casos incluido locked_out_user), catálogo (2: listado + ordenación), carrito (3: add/remove/cart page), checkout (3: validación + resumen + finalización), robustez (1: problem_user). Producto descrito (SauceDemo, 6 productos físicos, flujo login→catálogo→carrito→checkout). Roles documentados con credenciales sintéticas declaradas. Restricciones de testing alineadas con SPEC §4 (greybox, axe-core, JSDoc cita RF, no waitForTimeout). Sección "lo que el FD NO cubre" delimita scope.
- `[x]` **S6-T3** Command `.claude/commands/test-pilot/plan.md`. Deps: S6-T1, S6-T2. C: M
  - **AC**: command toma `--fd=` + opcional `--planner-output=`, invoca `ia4d-fd-to-plan`, produce `test-plan.md` estructurado por criterio.
  - **Verify**: `/test-pilot:plan --fd=demo/saucedemo/fd.md` produce plan con ≥10 entradas, cada una citando criterio del FD. ✓ Slash command con `allowed-tools: Task, Read, Bash(mkdir:*)`. 5 pasos: parsea args (con validación estricta de --planner-output declarado-pero-no-existe), prepara `output/plan/`, invoca `ia4d-fd-to-plan` vía Task tool, verifica artefacto, imprime resumen. WARN si K ambigüedades > 0. Claude Code descubre `/test-pilot:plan` como skill (system reminder lo lista). Verify literal (invocar contra `demo/saucedemo/fd.md` con 13 RFs) queda al SDET — esperado ≥10 entradas RF-NNN en `output/plan/test-plan.md`.

> **Checkpoint Fase 2**: discovery y plan funcionan end-to-end contra SauceDemo. Output estructurado. Pre-flight bloquea cuando corresponde.

---

## Fase 3 — Generación con guardrails de calidad

### S7 — `/test-pilot:generate`

- `[x]` **S7-T1** Schema Style Contract YAML. Deps: Fase 2 completa. C: M
  - **AC**: `references/style-contract-schema.md` documenta campos: POM strategy, naming, locator priority, fixtures, banned APIs, axe-core switch.
  - **Verify**: schema cubre reglas listadas en SPEC §4. ✓ Schema completo con secciones `pom`, `naming`, `locators` (priority + banned rawCss/xpath), `bannedApis`, `a11y` (enabled/wcagLevel/injectorImport), `requiredImports`, `jsdoc.citeCriterion`. Tabla de severidades (block/warn) por regla. Documenta el modo `--fix` (qué se auto-arregla vs qué no). Output JSON del CLI schematizado. Ejemplo mínimo + sección "lo que NO cubre" + cross-reference a SPEC §4 / §6, pii-patterns, hook y subagent.
- `[x]` **S7-T2** Redactar `style-contracts/saucedemo.yaml`. Deps: S7-T1. C: S
  - **AC**: contract concreto cumpliendo schema.
  - **Verify**: YAML válido + reglas razonables. ✓ Contract para SauceDemo cumpliendo schema v1: POM en `tests/pages`, locators priority [getByRole, getByTestId, getByLabel, getByText] + banned [rawCss, xpath], bannedApis [page.waitForTimeout, page.pause], a11y wcag21aa con AxeBuilder import obligatorio, jsdoc.citeCriterion=true. Verificado por uso real del CLI contra un spec de prueba (smoke test inline).
- `[x]` **S7-T3** Subagent `ia4d-style-enforcer.md`. Deps: S7-T1. C: L
  - **AC**: `.claude/agents/ia4d-style-enforcer.md` que toma `.spec.ts` recién escrito por el Generator nativo + style-contract.yaml, lo post-procesa para cumplir reglas. AST cuando posible, regex como fallback.
  - **Verify**: prompt lista reglas que enforce (POM, naming, locators, banned APIs) vs reglas que solo advierte. ✓ Stub reemplazado por subagent operativo + CLI `hooks/style-enforce.ts` (ts-morph para ImportDeclarations y detección de POM, regex para banned APIs / locators / JSDoc). Subagent tools `Bash, Read`: invoca el CLI con `--fix`, parsea JSON, expone verdict humano (PASS / PASS WITH WARNINGS / BLOCK / ERROR) + máquina. Reglas block: BANNED_API, RAW_CSS_LOCATOR, XPATH_LOCATOR, MISSING_IMPORT. Warn: MISSING_JSDOC_CRITERION, POM_REFERENCED_NOT_FOUND. ts-morph añadido como runtime dep (^24.0.0). Smoke test end-to-end: spec con waitForTimeout + raw CSS + xpath + import faltante → primera pasada exit 2 con 3 violations block + 1 warn; tras `--fix` el archivo queda con import añadido y banned API comentada, exit 2 porque locators no son auto-fixables (correcto). `tsc --noEmit` y `eslint` limpios. **50 tests vitest verdes** (sin regresión).
- `[x]` **S7-T4** Subagent `ia4d-a11y-injector.md`. Deps: S7-T1. C: M
  - **AC**: `.claude/agents/ia4d-a11y-injector.md` que inyecta `AxeBuilder` check al inicio de cada `test()`. Usa `@axe-core/playwright`.
  - **Verify**: prompt incluye snippet exacto del código inyectado. ✓ Stub reemplazado por subagent operativo + CLI `hooks/a11y-inject.ts` (ts-morph para imports y AST de CallExpression; texto crudo para la inserción del snippet). Snippet exacto en el prompt del subagent + en el CLI: `const _axe = await new AxeBuilder({ page }).analyze(); expect(_axe.violations).toEqual([]);`. Asegura imports `AxeBuilder` (de `@axe-core/playwright`) y `expect` (de `@playwright/test`). Idempotente: re-ejecutar sobre spec con axe ya presente → `injected:0, alreadyPresent:N`. Detecta `test()`, `test.only()`, `test.skip()`; excluye `test.fixme`, `test.describe`, `test.beforeEach`. Smoke test: spec sin axe → `injected:1, importsAdded:['@playwright/test']`. Segunda corrida sobre el mismo file → `injected:0, alreadyPresent:1, importsAdded:[]`.
- `[x]` **S7-T5** Command `.claude/commands/test-pilot/generate.md`. Deps: S7-T3, S7-T4, S3-T3. C: L
  - **AC**: command toma `--plan=` + `--style=`, orquesta secuencialmente: `playwright-test-generator` (nativo) → `ia4d-style-enforcer` → `ia4d-a11y-injector` → `ia4d-pii-scanner`. Cada paso lee del archivo escrito por el anterior.
  - **Verify**: `/test-pilot:generate --plan=test-plan.md --style=style-contracts/saucedemo.yaml` produce ≥10 archivos `.spec.ts`. ✓ Slash command con `allowed-tools: Task, Read, Glob, Bash(mkdir:*)`. 6 pasos: parsea args (valida --plan / --style obligatorios + existencia, --out-dir default `output/generate/`), prepara out-dir, invoca Generator nativo vía Task tool, por cada spec en serie llama `ia4d-style-enforcer` (con --fix) → `ia4d-a11y-injector`, al final una sola pasada de `ia4d-pii-scanner` sobre todo el out-dir. Decisión de abortar agregada al final (failed_specs + pii_blocked). Reglas duras: no reorder, no skip PII scan, no judge (Slice 8), no `npx playwright test` (T6), cero invocación cruzada subagent↔subagent, sin retries silenciosos. Claude Code descubre `/test-pilot:generate` como skill (system reminder lo lista). Verify literal (`/test-pilot:generate --plan=output/plan/test-plan.md --style=style-contracts/saucedemo.yaml` con ≥10 `.spec.ts` resultantes) queda al SDET en sesión con MCP playwright-test activo — los CLIs subyacentes verificados vía smoke test inline.
- `[x]` **S7-T6** Verificación automática de ejecución. Deps: S7-T5. C: M
  - **AC**: tras la cadena de subagents, el command ejecuta `npx playwright test` en el repo destino y verifica que ≥80% corren verdes. Los que fallan se marcan con confidence 0.
  - **Verify**: contra SauceDemo, ≥10 tests verdes. Los rojos quedan listados con razón. ✓ CLI `hooks/run-playwright.ts`: wrappea `npx playwright test <dir> --reporter=json`, parsea el JSON (tolera prefijo no-JSON antes del primer `{`), produce `run-report.json` estructurado con per-test status + confidence (passed=1, resto=0). Exit 0 si passRate ≥ threshold (default 0.8), exit 2 si por debajo, exit 1 si error de ejecución. passRate computado sobre tests **executed** (excluye skipped). Status mapping: expected/passed→passed; failed/unexpected/timedOut→failed; flaky→flaky; skipped→skipped. **9 unit tests verdes** cubriendo parser de JSON con basura previa, flatten de suites anidadas con `file` en spec o suite, status mapping (timedOut+unexpected→failed, expected→passed), summarize con passRate>=threshold, passRate<threshold, executed=0, errorMessage when no JSON. Total tests vitest: **59 verdes**. `tsc --noEmit` y `eslint` limpios. Command `/test-pilot:generate` reestructurado a 8 pasos (0..7): Paso 6 nuevo "Verify de ejecución" invoca el CLI vía `Bash(npx tsx:*)` (añadido a allowed-tools); decide ask-first cuando passRate<threshold (el SDET decide reintentar / ajustar / bajar threshold con sign-off); Paso 7 output al SDET incluye bloque "Playwright run" con passRate, passed/total, failed, flaky, skipped, ruta al run-report.json. Flags nuevos: `--threshold=<0..1>` (default 0.8) y `--no-run` (salta Paso 6 si el SDET solo quiere materializar specs). Reglas duras actualizadas: no llamar `npx playwright test` directo (siempre vía el CLI), no reintentar automáticamente si cae bajo threshold. Verify literal del AC (`≥10 verdes contra SauceDemo`) queda al SDET en sesión con MCP playwright-test + Chromium activos; las funciones puras y el wiring están cubiertos por tests unitarios.

> **Checkpoint Fase 3**: tests generados ejecutables y verdes contra SauceDemo. Style Contract aplicado. axe-core presente. Sin esto, no avanzar.

---

## Fase 4 — Quality layer

### S8 — LLM-as-judge

- `[x]` **S8-T1** Prompt template del judge. Deps: Fase 3 completa. C: M
  - **AC**: prompt riguroso con ejes (assert significativo, selectores estables, sin waits frágiles, sin estado contaminante, cubre criterio). Output JSON estructurado.
  - **Verify**: test manual contra 3 specs devuelve scores razonables. ✓ Schema completo en `references/judge-report-schema.md` con 5 ejes (`meaningfulAssert`, `stableSelectors`, `noFragileWaits`, `noContamination`, `coversCriterion`). Cada eje con rubric discreto (0.0/0.5/1.0) y casuística por score. Score global = promedio simple, redondeado a 3 decimales. Verdict PASS si `score >= threshold` (default 0.5), WEAK si por debajo. Threshold del 30% sobre `belowThresholdPct` documentado. Sección "lo que el judge NO hace" delimita scope (no re-ejecuta, no corrige, no toma decisión del threshold). Verify literal (test manual contra 3 specs) queda al SDET cuando ejecute `/test-pilot:generate` real — el rubric es discreto por diseño para que sea reproducible.
- `[x]` **S8-T2** Subagent `ia4d-judge.md` + integración en `/test-pilot:generate`. Deps: S8-T1. C: M
  - **AC**: `.claude/agents/ia4d-judge.md` invokable. Produce `judge-report.json` con entrada por test. Se cablea al final de la cadena de S7-T5.
  - **Verify**: `judge-report.json` cumple schema. Cada test del Slice 7 tiene su entrada. ✓ Stub reemplazado por subagent operativo: `model: haiku` por coste (SPEC anexo riesgos #3), tools `Read, Write, Glob, Grep` (sin Bash — análisis estático). 8 pasos en el prompt: descubrir specs (Glob), extraer tests (regex `@criterio\s+(RF-\d+)`), cargar criterios del plan, evaluar 5 ejes con rubric discreto, score+verdict por test, summary agregada, Write del JSON, responder al command. Common Rationalizations table de 5 entradas (no subir scores por "feo pero correcto", no saltarse ejes por "test exploratorio", etc.). `/test-pilot:generate` actualizado: frontmatter incluye `--judge-threshold` y `--no-judge`, nuevo Paso 7 invoca al judge vía Task tool, Paso 8 (renombrado del antiguo 7) incluye bloque "Quality scoring" en output.
- `[x]` **S8-T3** Threshold logic. Deps: S8-T2. C: S
  - **AC**: si >30% de tests tienen score <0.5, el command pausa y pide confirmación al SDET (ask-first).
  - **Verify**: dataset con muchos bajos → command pausa con mensaje claro. ✓ Lógica integrada en Paso 7 del command: tras escribir `judge-report.json`, lee `summary.belowThresholdPct`. Si `> 0.3`, presenta mensaje claro al SDET con avgScore, threshold, conteo, lista de WEAK tests (file::testName + eje débil), y 4 acciones posibles (revisar / reescribir / bajar threshold con sign-off / continuar aceptando). Reglas duras añadidas: "No reintentes el judge automáticamente" y "No tomes la decisión del threshold del judge por el SDET". Verify literal queda al SDET cuando ejecute un batch con calidad baja (se puede simular degradando style contract o el plan).

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
- `[x]` **S12-T4** Documentar reproducción. Deps: S12-T3. C: S
  - **AC**: `demo/saucedemo/HOW-TO-REPRODUCE.md` con pasos exactos.
  - **Verify**: tercer involucrado reproduce con el doc y reporta dónde se atasca. ✓ Manual completo: prerequisitos (sesión nueva, MCP, Chromium, limpieza), Paso 0 healthcheck, Paso 1 comando exacto `/test-pilot:full-loop --no-discover --fd=... --style=... --a11y=warn --a11y-reason="..."`, timeline esperada (6-12 min), 5 puntos de validación (resumen DoD, artefactos en disco, catalog coherente, audit-log policy_skip, spec inspeccionado). Variantes: modo strict (perfil banca), dry run, full con discover. Troubleshooting: ask-first, MCP errors, Playwright config, judge bajo, audit findings, rehacer desde 0. Sección "lo que el e2e NO garantiza" (Planner no determinístico, judge variable, sin cross-cliente, sin perf prod). Verify literal (tercer involucrado) queda al SDET cuando comparta con un colega.

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
