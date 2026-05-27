# HOW-TO-REPRODUCE — `/test-pilot:full-loop` contra SauceDemo login

Manual de prueba end-to-end del MVP de `ia4d-test-pilot`. Cubre el demo del SPEC §1 Definition of Done usando el subset acotado `fd-login-only.md` (4 criterios RF-001..RF-004). Reproducible en cualquier máquina con el repo sano, MCP `playwright-test` activo y Chromium instalado.

Cubre **S12-T4** del SPEC (Documentar reproducción).

## Por qué este manual

El integration test (`tests/integration/full-loop-saucedemo.test.ts`) cubre convergencia de artefactos con fixtures mockeadas. Lo que **no** cubre y necesita prueba humana real:

- Cadena Claude Code orquesta `SlashCommand` correctamente entre los 5 commands subordinados.
- MCP Playwright real responde a invocaciones (Planner, Generator, runner).
- Judge (Haiku real) produce scores razonables sobre specs reales.
- Artefactos se concatenan correctamente en `test-catalog.json`.

Este e2e valida los puntos 4, 5, 6, 7, 8 y 9 del DoD MVP del SPEC §1.

## Prerequisitos

1. **Repo limpio**: estás en una versión que incluye al menos el commit `fad50b5` (S11). Verifica con `git log --oneline -1`.
2. **Sesión Claude Code nueva**. Las sesiones cachean settings y commands al arranque; necesitas que cargue la versión actual.
3. **MCP `playwright-test` activo**. En la sesión, teclea `/mcp` y verifica que aparece `connected`. Si está `disabled`, edita `.claude/settings.local.json` y quita `"playwright-test"` de `disabledMcpjsonServers`.
4. **Chromium instalado** (una vez por máquina): `npx playwright install chromium`. Si el Generator falla con MCP error, reinstala y reabre la sesión.
5. **Outputs previos limpios** (opcional pero recomendado para reproducibilidad):

   ```bash
   rm -rf output/ audit-log.json .playwright-mcp/
   ```

## Paso 0 — Healthcheck

```
/test-pilot:healthcheck
```

**Esperado**:

```
OK ia4d-test-pilot v0.1.0
Fecha: <fecha actual>
Subagents ia4d-*: 8
Subagents playwright-test-* (nativos): 3
```

Si los 8 `ia4d-*` no aparecen, la sesión es antigua. Reábrela.

## Paso 1 — Full-loop completo con a11y=warn

Para el demo de SauceDemo, el camino más predecible es:

- **Saltar discover** (`--no-discover`): el FD ya describe los 4 criterios; el Planner no aporta y ahorras ~20 min de Chromium explorando.
- **a11y=warn** con razón declarada: SauceDemo tiene violaciones WCAG conocidas (document-title, region, contraste); con `warn` los specs corren verdes y el agente deja audit trail del downgrade.
- Sin tocar threshold del run (default 0.8 es razonable).

Teclea exactamente:

```
/test-pilot:full-loop --no-discover --fd=demo/saucedemo/fd-login-only.md --style=style-contracts/saucedemo.yaml --a11y=warn --a11y-reason="SauceDemo demo público sin SLA WCAG"
```

## Timeline aproximada

| Fase | Tiempo | Qué ves |
|---|---|---|
| Paso 0 (parseo args) | <5s | El command imprime que va a saltarse discover. |
| Paso 1 (discover saltado) | — | Mensaje "saltado por --no-discover". |
| Paso 2 (plan) | ~30s | `ia4d-fd-to-plan` produce `output/plan/test-plan.md` con 4 entradas RF-001..RF-004. |
| Paso 3 (generate) | **5-10 min** | Genera 4 specs, los enforce con style + axe-warn + PII scan, ejecuta Playwright (4 should pass), corre judge (Haiku). |
| Paso 4 (audit) | ~30s | Escanea `output/generate/` por compliance + PII. `audit-report.json` queda en `output/audit/`. |
| Paso 5 (export) | <10s | Consolida en `output/export/test-catalog.json`. |
| Paso 6 (resumen) | — | Imprime checklist DoD. |

**Total esperado: 6-12 minutos**.

## Validación al final

### 1. Resumen del Paso 6

Debería incluir:

```
/test-pilot:full-loop terminado.

Cadena:
  ✓ plan        output/plan/test-plan.md
  ✓ generate    output/generate/  (4 specs)
  ✓ audit       output/audit/audit-report.json
  ✓ export      output/export/test-catalog.json

Quality summary:
  passRate Playwright:   1.0
  avgScore judge:        ~0.9
  weak tests:            0
  audit findings:        0
  a11y policy:           warn (SauceDemo demo público sin SLA WCAG)
```

### 2. Artefactos en disco

```bash
ls output/
```

Esperado:

- `output/plan/test-plan.md` — 4 criterios extraídos del FD.
- `output/generate/` — 4 archivos `.spec.ts` + `run-report.json`.
- `output/judge/judge-report.json` — scoring de los 4 tests.
- `output/audit/audit-report.json` — compliance + PII consolidados.
- `output/export/test-catalog.json` — catalog final.

### 3. Catalog coherente

```bash
node -e "const c=require('./output/export/test-catalog.json'); console.log({total:c.summary.total, passed:c.summary.passed, avgJudge:c.summary.avgJudgeScore, a11y:c.summary.a11yPolicy})"
```

Esperado:

```js
{
  total: 4,
  passed: 4,
  avgJudge: ~0.9,
  a11y: { mode: 'warn', reason: 'SauceDemo demo público sin SLA WCAG', declaredIn: 'cli' }
}
```

### 4. Audit log con policy_skip

```bash
grep policy_skip audit-log.json
```

Esperado: una línea JSONL con `"action":"policy_skip"`, `"target":"a11y"`, `"metadata.mode":"warn"`.

### 5. Un spec inspeccionado a ojo

Abre `output/generate/login.standard-user.spec.ts` (o el nombre que el Generator le dio). Verifica:

- JSDoc cita `RF-001`.
- Imports incluyen `test, expect` de `@playwright/test` y `AxeBuilder` de `@axe-core/playwright`.
- Snippet axe-core al inicio del bloque `test()` usa `console.warn` (no `expect().toEqual([])` porque va en modo warn).
- Locators son `getByTestId(...)`, `getByRole(...)`, `getByLabel(...)` o `getByText(...)`. Sin `page.locator('[data-test=...]')`.
- Cero `page.waitForTimeout()` ni `page.pause()`.

## Variantes

### Modo strict (perfil banca/regulado)

Para validar que en modo banca el agente **sí** enforce a11y como bloqueante, quita los flags de a11y:

```
/test-pilot:full-loop --no-discover --fd=demo/saucedemo/fd-login-only.md --style=style-contracts/saucedemo.yaml
```

Los 4 tests fallarán por violaciones axe de SauceDemo. Comportamiento esperado: el agente expone problemas reales del producto. El `audit-report.json` quedará PASS pero el `run-report.json` mostrará `passRate: 0`. El full-loop pausará con ask-first en el Paso 3 (Playwright bajo threshold). Es la prueba de que en modo regulado el agente cumple SPEC §6 Always do.

### Dry run sin Playwright ni judge

Más rápido (~3 min) para validar solo la cadena Generator → enforcer → injector → audit → export:

```
/test-pilot:full-loop --no-discover --no-run --no-judge --fd=demo/saucedemo/fd-login-only.md --style=style-contracts/saucedemo.yaml --a11y=warn --a11y-reason="dry run"
```

`test-catalog.json` tendrá `runStatus: null` y `judgeScore: null` en todas las entries. Es válido, no es bug — refleja que esos pasos se saltaron.

### Incluir discover (camino completo)

Quita `--no-discover` y añade `--url=`:

```
/test-pilot:full-loop --url=https://www.saucedemo.com/ --fd=demo/saucedemo/fd-login-only.md --style=style-contracts/saucedemo.yaml --a11y=warn --a11y-reason="SauceDemo demo público sin SLA WCAG"
```

Suma ~15-20 min al tiempo total (el Planner explora SauceDemo). El `discovery-report.md` quedará en `output/discover/`. El plan en Paso 2 lo recibirá como `--planner-output` y puede añadir `GAP-NNN` con observaciones del Planner no cubiertas por el FD.

## Troubleshooting

### Si el full-loop pausa con ask-first

Es comportamiento correcto del agente. El command paró esperando tu decisión. Léelo, evalúa, y en el siguiente mensaje dile "continuar" o "abortar". Si dices continuar, el flujo sigue desde donde quedó; si abortas, los artefactos generados quedan en disco y puedes inspeccionarlos.

### Si el Generator falla con MCP error

Síntoma: `/test-pilot:generate` reporta `MCP playwright-test no responde` o `Cannot find package '@axe-core/playwright'`.

Causas típicas:

- Chromium no instalado: `npx playwright install chromium`.
- `node_modules` desactualizado: `npm install`.
- MCP deshabilitado en `.claude/settings.local.json`.

Tras corregir, reabre la sesión Claude Code (el MCP suele requerir restart tras install).

### Si Playwright cae con `Cannot find module 'playwright.config.ts'`

El config vive en root (`playwright.config.ts`). Verifica que existe con `ls playwright.config.ts`. Si falta, alguien lo borró — restaura con `git checkout playwright.config.ts`.

### Si el spec falla con "No tests found"

Causa típica: el `testDir` del config no apunta al directorio correcto. El wrapper `hooks/run-playwright.ts` pasa el dir vía env var `TEST_PILOT_TESTDIR` que el config consume. Si modificaste el config a mano, asegúrate de que conserva el fallback:

```ts
testDir: process.env.TEST_PILOT_TESTDIR ?? './output/generate',
```

### Si el judge produce avgScore bajo (<0.6)

Inspecciona `output/judge/judge-report.json` y mira qué eje cayó:

- `meaningfulAssert: 0.0` → el Generator escribió tests sin `expect()` real. Revisa el plan: si los criterios son muy vagos, el Generator no sabe qué assertar.
- `stableSelectors: 0.5` → algún spec cayó en `page.locator('.foo')`. El style-enforcer no auto-fixea esos (solo data-*). Revisa a mano o ajusta el plan.
- `coversCriterion: 0.5/0.0` → el Generator interpretó mal el criterio. El plan necesita más precisión en "Texto FD" o "Resultado esperado".

El ask-first del judge sólo se activa si más del 30% de los tests están por debajo del threshold (0.5 por defecto). Si te dispara, el command pausa y te lista los WEAK.

### Si el audit reporta findings

Caso típico: el SDET dejó URLs absolutas o credenciales hardcoded en los specs que no están en `config/allowed-targets.yaml`. Opciones:

- Añadir la URL o credencial al config si es legítima.
- Regenerar los specs con un FD más estricto que no introduzca esos valores.
- Reportar el finding al QA Manager como hallazgo del agente (eso es exactamente el valor).

### Si quieres rehacer desde 0

```bash
rm -rf output/ audit-log.json .playwright-mcp/
```

Y vuelves al Paso 0 (Healthcheck). El repo queda como recién clonado en términos de artefactos locales.

## Lo que el e2e **no** garantiza

- No prueba que el agente funciona contra una app que no sea SauceDemo. Cada cliente requiere su FD, su Style Contract y su `allowed-targets.yaml`.
- No prueba que el Planner sea determinístico. Si re-corres con `--url=`, los escenarios producidos pueden variar entre runs.
- No prueba que el judge sea perfectamente consistente entre runs (Haiku tiene variabilidad). El rubric discreto (0.0/0.5/1.0) la reduce, pero no la elimina.
- No prueba performance en producción (multi-test, paralelismo, CI). El MVP es secuencial y local.

## Próximo paso tras éxito del e2e

- **S12-T1** (guion del demo grabado de 30 min) — no incluido en MVP código, pero el SPEC lo pide.
- **S12-T2 y T3** (ensayos + grabación del video) — responsabilidad del SDET, no del agente.
- **Validación con piloto cliente** — fuera de scope MVP. Requiere ajustar `allowed-targets.yaml`, redactar Style Contract específico, posiblemente acotar PII patterns por geografía.

## Cross-reference

- SPEC §1 — Definition of Done del MVP.
- SPEC §6 — Boundaries (las reglas duras que el agente respeta).
- `tasks/plan.md` — plan general por slices.
- `tasks/todo.md` — checklist de tareas por slice con AC y verify.
- `references/` — schemas (audit-log, judge-report, test-catalog, allowed-targets, pii-patterns, compliance-rules, discovery-report, style-contract).
