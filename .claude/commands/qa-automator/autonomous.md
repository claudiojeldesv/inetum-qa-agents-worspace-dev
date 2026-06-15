---
description: Módulo S4 — generación autónoma de tests E2E desde una URL. Orquesta los 5 actos del marco QA propio. Funcional en MVP v0.1.
argument-hint: "--url=<URL> [--style=<contract.yaml>] [--flows=a,b] [--entry=/path] [--ignore=x,y]"
---

# /qa-automator:autonomous

Módulo **S4 Autonomous** del agente `ia4d-qa-automator`. Recibe una URL y, opcionalmente, un Style Contract. Orquesta los cinco actos del marco QA propio (Comprender → Mapear → Estructurar → Materializar → Juzgar) contra el target.

Acepta además un **brief de exploración** opcional (`--flows/--entry/--ignore`) que acota el reconocimiento al happy-path. Sin brief, el command pregunta antes de explorar (no explora a ciegas por defecto). Es el plumbing instrumental de v0.2 (ver SPEC §7, estrategia de reconocimiento happy-path).

## Arguments

- `--url=<URL>` (obligatorio): URL del target, debe estar en `config/allowed-targets.yaml`.
- `--style=<path>` (opcional, default: `style-contracts/saucedemo.yaml`): YAML del Style Contract.
- `--output-dir=<path>` (opcional, default: `tests/e2e`): directorio donde se escriben los `.spec.ts`.
- `--flows=<a,b,c>` (opcional): flujos / happy-paths a cubrir, separados por coma (ej. `checkout,registro`). Acota qué mapea el planner.
- `--entry=<ruta|url>` (opcional, default: `--url`): punto de entrada profundo para empezar la exploración (ej. `/catalog`, no la home).
- `--ignore=<x,y,z>` (opcional): zonas a NO explorar (ej. `blog,footer,soporte`).

## Procedure (los 5 actos)

### Acto 1 — Comprender

1. Invoca `ia4d-mode-router` via Task tool con los flags recibidos.
2. Confirma que el módulo resuelto es S4 (Autonomous).
3. Invoca `ia4d-compliance-checker` via Task tool con la URL y `config/allowed-targets.yaml`.
4. Si verdict = `block` → aborta, muestra razón al SDET, termina con exit 2.
5. Si verdict = `warn` → muestra warning y pregunta al SDET si continúa (ask-first).

**5.b — Captura del brief de exploración** (acota el Acto Mapear al happy-path):
- Si llega al menos uno de `--flows/--entry/--ignore` → **modo dirigido**: compón el brief con lo recibido.
- Si no llega ninguno → **intake mínimo** (ask-first): pregunta al SDET los flujos críticos, el punto de entrada y qué ignorar. Si el SDET no aporta nada → **modo ciego** (exploración exhaustiva, comportamiento v0.1) y déjalo registrado. Default ante ausencia de brief: preguntar, NO explorar a ciegas.
- Registra el brief efectivo al audit-log: `{ source: 'command', action: 'exploration_brief', metadata: { flows, entry, ignore, mode } }`.
- Nota: el intake aquí es mínimo (plumbing v0.2). El intake adaptativo —preguntas y pre-scout derivados de la recolección— es Fase C.

### Acto 2 — Mapear

6. Invoca `playwright-test-planner` (nativo) via Task tool. Compón el prompt con la URL **y el brief del paso 5.b**:
   - **Modo dirigido**: `Crea un test plan para <url>. SCOPE — cubre solo estos flujos: <flows>. Punto de entrada: <entry>. NO explores: <ignore>. Mapea el happy-path de cada flujo listado; no exhaustivo.`
   - **Modo ciego**: prompt de exploración completa (comportamiento v0.1).
   - Esperar el output: `<saved-plan>.md` con escenarios + `planner_save_plan` ejecutado.
7. Invoca `ia4d-discovery-analyzer` con el plan saved como input.
   - Output: `discovery-report.json` en workspace root.

### Acto 3 — Estructurar

8. Ejecuta el POM scaffolder programáticamente:
   ```sh
   npx tsx -e "
   import { readFileSync } from 'node:fs';
   import { scaffold } from './src/pom-scaffolder.ts';
   const dr = JSON.parse(readFileSync('discovery-report.json', 'utf8'));
   scaffold(dr.screens, { outputDir: 'tests/pages' });
   "
   ```
   Esto produce `tests/pages/*.page.ts` esqueletos.

### Acto 4 — Materializar

**8.b — Auth setup** (solo si el contract tiene `auth.enabled: true`):
- Invoca `ia4d-writer` para generar `tests/e2e/auth.setup.ts`: un bloque `setup('authenticate', ...)` que navega a `auth.login_path`, rellena las credenciales de `synthetic_fixtures.credentials[auth.credentials_ref]`, verifica `auth.success_signal` (assert por `url` o `locator`), y guarda el estado con `await page.context().storageState({ path: <auth.storage_state> })`. Importa `setup` como `import { test as setup } from '@playwright/test'`. **NO** lleva AxeBuilder (es setup, no test del flujo). Los locators del login salen de discovery; si no hay semántica, aplica la excepción `css_fallback_attributes` (Componente CSS legacy).
- El setup project + `dependencies` + `storageState` los activa `playwright.config.ts` vía `QA_STORAGE_STATE` (ver Verification step). Los specs del resto de flujos NO re-loguean: heredan el estado por el dependency.
- Registra al audit-log: `{ source: 'command', action: 'write_file', target: 'tests/e2e/auth.setup.ts', rule: 'auth-handler', reason: 'setup project for persistent session' }`.

9. Para cada `scenario` en `discovery-report.scenarios_recommended` (paralelizable):
   - Invoca `ia4d-writer` via Task tool con `--plan-entry`, `--style-contract`, `--pom-skeleton-dir`, `--output`, `--discovery-report`.
   - El Writer escribe el `.spec.ts` e invoca internamente al Reviewer (ping-pong N≤2).
   - Cada `.spec.ts` pasa por el hook PostToolUse `pii-post.ts` automáticamente.
10. (Opcional) Invoca `ia4d-style-enforcer` por cada `.spec.ts` para enforce final del Style Contract.
11. (Obligatorio) Invoca `ia4d-a11y-injector` por cada `.spec.ts` **pasándole `--style-contract`** para asegurar el `AxeBuilder` scan y aplicar el gate del contract:
    - El scan se inyecta siempre (no opcional, SPEC §6).
    - El gate lo decide `a11y.fail_on_violations` del contract. **Default `false`** (modo warning: annotation auditable, no aborta) — gate apagado por defecto, reactivable por-sitio con `fail_on_violations: true` (entonces `expect(...).toEqual([])` aborta). Severidades filtradas por `a11y.severity_threshold`.
    - Lee el `gate_mode` del output del injector y registra al audit-log: `{ source: 'command', action: 'warn'|'allow', target: <spec>, rule: 'a11y-gate', reason: 'fail_on_violations:<bool> → <mode> mode' }`.

### Acto 5 — Juzgar

12. **Judge opcional, off por defecto.** Comprueba el entorno (`echo $env:QA_ENABLE_JUDGE` en PowerShell). Solo si está seteado (`1`/`true`/`on`) invoca `ia4d-judge` por cada `.spec.ts` con el `review-feedback.json` consolidado. Si no está seteado, **omite el Judge** y registra al audit-log `{ source: 'command', action: 'skip', rule: 'judge', reason: 'judge off (QA_ENABLE_JUDGE unset)' }`; el run-summary marca `judge: skipped`.
13. (Solo si el Judge corrió) Lee todos los scores. Si >30% < 0.5 → pausa con ask-first.
14. Genera summary `qa-automator-run-summary.json` con: lista de tests, scores (o `judge: skipped`), verdicts del Reviewer, axe results.

## Outputs (consolidados)

- `discovery-report.json`
- `tests/pages/*.page.ts` (POM esqueletos + locators rellenos por Writer)
- `tests/e2e/*.spec.ts` (≥3 archivos del flujo golden path)
- `review-feedback.json` (todas las reviews)
- `judge-report.json` (scores)
- `audit-log.json` (traza completa)
- `qa-automator-run-summary.json`

## Verification step (ejecuta `npx playwright test`)

**Gates opcionales (off por defecto, v0.2 `design/gates-off-by-default`)**: para reactivarlos en el run,
setea `QA_ENABLE_PII=1` (PII scanner del hook) y/o `QA_ENABLE_JUDGE=1` (Acto 5). El gate de a11y se
reactiva por-sitio con `fail_on_violations: true` en el Style Contract, no por env-var. Sin estas vars,
el run corre sin PII scan, sin Judge y con a11y en modo warning.

**Antes de ejecutar, borra `tests/e2e/seed.spec.ts` si existe.** Es el scaffold que el MCP `playwright-test` resiembra en cada `setup_page` (Planner/Generator); solo sirve durante la generación. Si queda en `testDir`, corre como un test vacío siempre-verde y contamina el output y el reporte Allure (decisión SDET: eliminarlo, no ignorarlo).

Tras los 5 actos, ejecuta el test **seteando `QA_BASE_URL` con el `--url` del run** (los POM usan `goto('/')` relativo; sin esto el `baseURL` del config cae a SauceDemo y el spec corre contra el sitio equivocado — hallazgo Fase B sitio 2).

**Si el contract tiene `auth.enabled: true`**, setea además `QA_STORAGE_STATE` con `auth.storage_state`. Eso activa el setup project + `dependencies` en `playwright.config.ts`: el `auth.setup.ts` corre primero y escribe el estado, luego los specs lo heredan. **Ya no hace falta `--workers=1`** — el dependency garantiza el orden bajo `fullyParallel` (mata la race del hallazgo #10).

**Si el contract tiene `evidence.screenshots`** (distinto del default `only-on-failure`), setea `QA_SCREENSHOT` con ese valor. Con `on`, Playwright captura el estado final de cada test (pase o falle) y `allure-playwright` lo adjunta al resultado — evidencia visual para `/qa-automator:report`. Es política de run-time: el reporte solo muestra lo que el run capturó.

```sh
# Sin auth (PowerShell):  $env:QA_BASE_URL='<--url>'; npx playwright test --reporter=list
# Sin auth (bash):        QA_BASE_URL='<--url>' npx playwright test --reporter=list

# Con auth (PowerShell):
#   $env:QA_BASE_URL='<--url>'; $env:QA_STORAGE_STATE='playwright/.auth/<project>.json'; npx playwright test --reporter=list
# Con auth (bash):
#   QA_BASE_URL='<--url>' QA_STORAGE_STATE='playwright/.auth/<project>.json' npx playwright test --reporter=list

# Con evidencia visual para el reporte Allure (contract: evidence.screenshots: on).
# OJO: SIN --reporter=list — el flag CLI sobrescribe los reporters del config y suprime
# allure-results/, dejando a /qa-automator:report sin nada que enriquecer.
#   (PowerShell)  $env:QA_BASE_URL='<--url>'; $env:QA_SCREENSHOT='on'; npx playwright test
#   (bash)        QA_BASE_URL='<--url>' QA_SCREENSHOT='on' npx playwright test
```

- Si todos verdes → run exitoso.
- Si algún rojo → reporta cuáles y por qué. El SDET decide si lanza al Healer o ajusta manualmente.

## Hard rules

- Cada invocación de subagent registra al audit-log.
- No saltar Acto 1 (compliance pre-flight). Sin override.
- Writer+Reviewer (ping-pong N≤2 del Acto 4) **obligatorios**. El **Judge es opcional, off por defecto** (`QA_ENABLE_JUDGE`); su omisión se registra al audit-log, no se silencia.
- Paralelismo del Acto 4 es prioritario: invocar los Writers de los N escenarios concurrentemente cuando sea posible.

## Reference

- [`SPEC.md`](../../../SPEC.md) §1 (DoD MVP), §2 (Commands), §6 (Boundaries)
- [`docs/references/composition-rules.md`](../../../docs/references/composition-rules.md)
- [`docs/findings/spike-playwright-mcp.md`](../../../docs/findings/spike-playwright-mcp.md)
