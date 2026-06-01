# v0.2 Fase E — S2 (Req-driven, Gherkin): validación end-to-end contra ParaBank

**Resultado: 5/5 verde** (setup + login RF-001 + transfer RF-002 ×2 data-driven + logout RF-003), 3 workers, sin `--workers=1`. Drift detectado para `close-account` (RF-004), no fabricado. Judge media 0.94.

## Qué se construyó

S2 entra por un `.feature` Gherkin maduro + URL y **reusa el motor S3/S4 validado**. Lo único nuevo:

1. **`src/gherkin-to-criteria.ts`** — parser determinístico (`@cucumber/gherkin` 39.1.0, no LLM). Mapea `Feature/Scenario/Scenario Outline + Given/When/Then/Examples` al **mismo `criteria.json`** que produce el refiner de S3. 13 tests unitarios. Campo aditivo `examples` para parameterización.
2. **`ia4d-spec-parser`** — de stub a funcional (Gherkin). Orquesta el parser, valida, audit-log. Haiku. OpenAPI diferido v0.4.
3. **`/qa-automator:req-driven`** — de stub a command real. Acto 1 invoca el parser; Actos 2-5 idénticos a S3.
4. **`ia4d-writer`** — retoque aditivo: materializa el bloque `examples` como test data-driven (un caso por fila, mismo RF). No afecta a S4/S3-FD (nunca traen `examples`).
5. **`ia4d-mode-router`** + **SPEC.md** — `--gherkin`+`--url` → S2 funcional. (Inconsistencia detectada y corregida: el router leía SPEC §1, que aún marcaba S2 stub.)

## Lo que demuestra la prueba

- **Paridad con S3 por otra puerta**: mismos flujos (login/transfer/logout) verdes, entrando por Gherkin en vez de FD.
- **Trazabilidad real**: cada spec cita `@criterion RF-NNN (parabank.feature:línea (REQ-ID))`. El tag `@REQ-LOGIN` del `.feature` se preserva en `source_ref`.
- **Parameterización** (lo que S3 no tenía): el `Scenario Outline` con `Examples` (amounts 1, 2) → 1 spec data-driven con 2 tests, ambos citando RF-002. Filas tomadas exclusivamente de `examples.rows`, ninguna inventada.
- **Drift bidireccional sin fabricar**: `close-account` (RF-004, `@drift-risk:high`) declarado en el `.feature` pero ParaBank no lo expone → el planner lo marca NO MAPEADO, el diff lo reporta en `drift-report.json`, no se genera test.
- **Frontera S2/S3**: el parser no refina. Un Scenario sin `Then` se marca `[AMBIGUO]` + open_question y se enruta a S3. El `.feature` de parabank es maduro → 0 bloqueados.
- **Determinismo**: mismo `.feature` → mismos RF-NNN, mismo orden.

## Hallazgos (sanación post-proceso, principio del SDET)

La generación fue limpia (Reviewer aprobó los 3; transfer en 2 iteraciones por MF-1 CSS descendant). Los fallos surgieron en el **run**, sanados como post-proceso:

1. **`waitUntil: 'load'` → `'domcontentloaded'`** en los `goto()` del POM. ParaBank no dispara el evento `load` completo en 30s (subrecursos lentos del demo); el HTML llega en ~1s. `domcontentloaded` basta para interactuar.
2. **login debe partir sin sesión.** El chromium project inyecta el `storageState` de john (auth-handler Fase C) para los specs post-login. login.spec.ts heredaba esa sesión → ParaBank redirige a overview y el form de login no renderiza. Fix: `test.use({ storageState: { cookies: [], origins: [] } })`.
3. **Sesión compartida + logout = envenenamiento concurrente (hallazgo de valor).** `auth.setup` loguea una vez y guarda **un** JSESSIONID reusado por los specs autenticados. `logout.spec.ts` corriendo en paralelo cerraba **esa** sesión server-side → los tests de transfer concurrentes caían a la página de error de ParaBank ("An internal error has occurred"). Verificado leyendo el snapshot del error-context, no asumido. Fix: logout opta por sesión propia (opt-out + login fresco); su Log Out solo mata la suya. **Lección para el auth-handler**: un solo `storageState` compartido es insuficiente cuando un test cierra sesión — el test de logout necesita aislamiento de sesión.
4. **Transfer data-driven serializado** (`mode: 'serial'`): los 2 casos mutan la misma cuenta de john; en paralelo race sobre saldo/confirmación.
5. **Latencia de ParaBank**: ventana de latencia mala durante la sesión (setup/click de 35s vs 3-8s habituales). Timeout elevado a 60s (flag CLI, no código) para el run verde. transfer amount-1 tardó 24s, logout 28s. **No es defecto del pipeline S2** — es el demo público.

## No-regresión

- 55/55 tests unitarios verdes, `tsc --noEmit` limpio tras todos los cambios.
- El campo `examples` es aditivo: S4 y S3-FD no lo emiten, su comportamiento no cambia.

## Pendiente / no bloqueante

- **OpenAPI (S2)**: diferido a v0.4 — genera tests de API, no E2E browser; necesita `ia4d-api-test-writer` que no existe.
- **`ia4d-mode-router` sin `Write`**: sigue sin persistir `mode-routing.json` (bug heredado de S3, mismo síntoma). El orquestador usa su respuesta de texto. Fix pendiente, no bloquea.
- **auth-handler multi-sesión**: el hallazgo #3 sugiere que el contract podría declarar qué specs necesitan sesión aislada. Mejora futura, no bloquea.
- **Compliance W1** sobre parabank: aceptado (sandbox público allowlisted), sin override.

## Artefactos

`docs/findings/faseE-s2/`:
- `criteria.json`, `refinement-questions.md` (ingestión del `.feature`, 0 open questions)
- `parabank-s2-plan.md` (plan del planner map-mode)
- `compliance-verdict.json`
- `artifacts/discovery-report.json` (con `criteria_mapping`), `artifacts/drift-report.json`, `artifacts/judge-report.json`, `artifacts/qa-automator-run-summary.json`
- `artifacts/e2e/*.spec.ts` + `artifacts/pages/*.page.ts` (copias de los generados/sanados)
- `_pre-s2-backup/` (specs S3 que ocupaban `tests/e2e` antes del run)

Input: `demo/parabank/parabank.feature`.
