---
description: Módulo S4 — generación autónoma de tests E2E desde una URL. Orquesta los 5 actos del marco QA propio. Funcional en MVP v0.1.
argument-hint: "--url=<URL> [--style=<contract.yaml>] [--flows=a,b] [--negatives=flujo1,flujo2] [--entry=/path] [--ignore=x,y] [--max-scenarios=N]"
---

# /ia4d-qa-automator:autonomous

> **Pre-check (workspace).** Este comando corre DENTRO de un workspace desplegado del agente. Antes de continuar, verifica que en el directorio actual existen `config/allowed-targets.yaml` y `playwright.config.ts`. Si falta alguno, NO sigas: indica al usuario que ejecute `/ia4d-qa-automator:init <carpeta>` (o abra su workspace ya desplegado) y detente.

Módulo **S4 Autonomous** del agente `ia4d-qa-automator`. Recibe una URL y, opcionalmente, un Style Contract. Orquesta los cinco actos del marco QA propio (Comprender → Mapear → Estructurar → Materializar → Juzgar) contra el target.

Acepta además un **brief de exploración** (`--flows/--entry/--ignore`) que acota el reconocimiento por **módulos / flujos**. Acotar es el camino recomendado y, salvo confirmación explícita del QA, **obligatorio**: este command **no explora una web entera a ciegas** (ver paso 5.b — warning + confirmación).

## Arguments

- `--url=<URL>` (obligatorio): URL del target, debe estar en `config/allowed-targets.yaml`.
- `--style=<path>` (opcional, default: `config/style-contracts/saucedemo.yaml`): YAML del Style Contract.
- `--output-dir=<path>` (opcional, default: `tests/e2e/<site-id>`): directorio donde se escriben los `.spec.ts` (namespaced por sitio).
- `--flows=<a,b,c>` (opcional): flujos a cubrir, separados por coma (ej. `checkout,registro`). Acota qué mapea el planner.
- `--negatives=<flujo1,flujo2>` (opcional): **override por-run** de qué flujos generan además negativos.
  El **flujo principal de cada flujo se genera siempre**; esto solo añade los negativos. Ej.
  `--negatives=inicio-sesion`. Las claves son los **slugs en español** del flujo. Si no se pasa, manda
  `test_design.coverage.negatives_by_flow` del contract. Negativos en S4 = opt-in: solo donde se pidan.
- `--entry=<ruta|url>` (opcional, default: `--url`): punto de entrada profundo para empezar la exploración (ej. `/catalog`, no la home).
- `--ignore=<x,y,z>` (opcional): zonas a NO explorar (ej. `blog,footer,soporte`).
- `--max-scenarios=<N>` (opcional, default 8): tope de escenarios a materializar. Si el catálogo
  descubierto lo supera, el Acto 2.5 (Checkpoint) pausa y te deja seleccionar. Acotar el blow-up de
  tokens y el ruido en sitios grandes.

## Procedure (los 5 actos)

### Acto 1 — Comprender

1. Invoca `ia4d-mode-router` via Task tool con los flags recibidos.
2. Confirma que el módulo resuelto es S4 (Autonomous).
3. Invoca `ia4d-compliance-checker` via Task tool con la URL y `config/allowed-targets.yaml`.
4. Si verdict = `block` → aborta, muestra razón al QA, termina con exit 2.
5. Si verdict = `warn` → muestra warning y pregunta al QA si continúa (ask-first).

**5.b — Captura del brief de exploración (acotar por módulos es OBLIGATORIO salvo confirmación explícita)**:

Acotar el reconocimiento por **módulos / flujos** (ej. `login`, `checkout`, `transfer`) no es una optimización opcional. En webs medianas o grandes, explorar a ciegas satura la ventana de contexto del agente con casuística irrelevante y degrada la calidad del plan: el agente se vuelve un caballo sin riendas. Por eso este command **no explora una web entera a ciegas por defecto**.

- Si llega al menos uno de `--flows/--entry/--ignore` → **modo dirigido**: compón el brief con lo recibido. Camino recomendado.
- Si no llega ninguno → **NO explores todavía**. Muestra al QA este WARNING y pídele los módulos:

  > ⚠️ Vas a lanzar el reconocimiento autónomo SIN acotar por módulos.
  > En webs medianas o grandes esto satura el contexto del agente y baja la
  > calidad del plan (un caballo sin riendas). Recomendado: indica los módulos
  > o flujos a cubrir, p.ej. `--flows=login,checkout`.
  >
  > Responde con los flujos a cubrir, o escribe EXACTAMENTE `EXPLORAR SIN ACOTAR`
  > para continuar en modo ciego bajo tu responsabilidad.

  - Si el QA responde con flujos → **modo dirigido** con esos flujos.
  - Si el QA responde **exactamente** `EXPLORAR SIN ACOTAR` → **modo ciego** (exploración exhaustiva, comportamiento v0.1), `blind_acknowledged: true`.
  - Cualquier otra respuesta, respuesta ambigua o silencio → **no explores**: repite el warning o aborta con exit 2. **Nunca** entres en modo ciego sin esa confirmación explícita.

- **Captura los negativos pedidos**: si llegó `--negatives`, parséalo a una lista de slugs de flujo
  (ej. `inicio-sesion` → `['inicio-sesion']`). Este override pisa `test_design.coverage.negatives_by_flow`
  del contract para este run. Si no llegó, no hay override (manda el contract). El flujo principal de
  cada flujo se genera siempre, con o sin override.
- Registra el brief efectivo al audit-log: `{ source: 'command', action: 'exploration_brief', metadata: { flows, entry, ignore, negatives_override, mode, blind_acknowledged } }`.
- Nota: el intake aquí es mínimo (plumbing v0.2). El intake adaptativo —preguntas y pre-scout derivados de la recolección— es Fase C.

**5.c — Namespace por sitio + limpieza (NO negociable): cada sitio en su propio espacio.**

Runs de sitios distintos NO deben contaminarse (hallazgo: el discovery de un sitio quedó mezclado con
otro; specs de varios sitios convivían en `tests/e2e/` y hubo que filtrar a mano). Antes de mapear:

- Deriva el **`<site-id>`** del basename del `--style` sin extensión (ej. `saucedemo`).
- Define el **work dir del run**: `<workDir> = .work/<site-id>`. **TODOS** los artefactos efímeros del
  agente van bajo `<workDir>/` (discovery-report, drift-report, review-feedback, judge-report,
  run-summary, audit-log, allure-results/report). **Excepción documentada**: `compliance-verdict.json`
  vive en `.work/` plano — el compliance (Acto 1, paso 3) corre ANTES de que este paso defina el
  namespace. El registro `config/tc-registry/<site-id>.json` es durable y vive fuera de `.work`
  (no se toca aquí).
- **Define los dirs de test por-sitio**: `tests/e2e/<site-id>/`, `tests/pages/<site-id>/`,
  `tests/components/<site-id>/`.
- **Limpieza de arranque**: borra el contenido de `<workDir>/` (artefactos de un run previo del mismo
  sitio) para empezar limpio. Sustituye al hack de "detectar y sobrescribir el stale". NO borres
  `config/tc-registry/<site-id>.json`.
- **Exporta `QA_WORK_DIR=<workDir>`** para todo el run: el código determinístico (audit-log,
  playwright.config, build-report, enricher) lo lee y namespacea solo. A los subagentes que escriben por
  prosa (discovery-analyzer, reviewer, judge) **pásales las rutas ya namespaciadas** (`--output=<workDir>/...`).

### Acto 2 — Mapear

6. El `<site-id>` y `<workDir>` ya están definidos (paso 5.c).

   **Mapeo PLANNER POR FLUJO (secuencial, no monolítico).** El planner nativo se cuelga si se le pide
   mapear muchos flujos de una vez (hallazgo: ~1h colgado con 6 flujos). Por eso se invoca **un flujo
   por vez**, secuencial — **nunca en paralelo** (los planners comparten el navegador del MCP vía
   `planner_setup_page`; concurrentes colisionan). No hay timeout programático sobre un subagente Task:
   **acotar a un flujo es la mitigación** (navegación corta → retorna en minutos, no se cuelga).

   - **Modo dirigido** (hay `--flows`): para **cada flujo** del brief, invoca `playwright-test-planner`
     (nativo) via Task tool con un prompt acotado a ESE flujo, que guarda un **fragmento de plan** en
     `docs/test-plans/<site-id>/<flow>.plan.md` (el tool crea el dir). Prompt por flujo:
     `Mapea contra el DOM de <url> SOLO el flujo "<flow>". Punto de entrada: <entry>. NO explores otros flujos ni <ignore>. Mapea el flujo principal (el camino esperado que cumple el propósito); no exhaustivo. Si <flow> está en <flujos-con-negativos>, recorre además una vez el camino de error/validación para capturar los locators del estado de error. Guarda con planner_save_plan en fileName="docs/test-plans/<site-id>/<flow>.plan.md".`
     - Tras cada flujo, ejecuta la **guarda 6.5 por-flujo** (abajo) sobre su fragmento.
   - **Modo ciego** (`EXPLORAR SIN ACOTAR`): un único planner de exploración completa (comportamiento
     v0.1) que guarda `docs/test-plans/<site-id>/<site-id>.plan.md`; la guarda 6.5 se aplica una vez al
     plan completo.
   - Output: el conjunto de fragmentos `docs/test-plans/<site-id>/*.plan.md` (modo dirigido) o el plan
     único (modo ciego). Es documentación auditable, vive en `docs/`, no en `tests/`.

**6.5 — Guarda anti-fabricación POR FLUJO (NO negociable): verifica que el planner navegó de verdad.**

El motor S4 vive del MCP `playwright-test`. Si ese MCP no está conectado, el planner se queda **sin
tools de navegador** (`mcp__playwright-test__browser_*`) y, en vez de fallar, puede **fabricar** un plan
adivinado, o **colgarse** sin retornar. Tras el planner de **cada flujo**, comprueba estas señales de
discovery real sobre su fragmento `docs/test-plans/<site-id>/<flow>.plan.md`:

- El fragmento **existe** (el planner llamó a `planner_save_plan`). Si no → no guardó nada real.
- El resumen del planner indica **uso de tools de navegador** (`browser_navigate`, `browser_snapshot`,
  etc.), no solo `Read/Grep/Glob`.
- El fragmento trae **locators/URLs concretos del sitio real**, no genéricos adivinados.

**Reintento + protocolo de cuelgue (decisión del QA, no automática):**
- Si la guarda falla para un flujo (o el planner se interrumpe / cuelga y el QA lo corta) →
  **reintenta UNA vez** ese flujo solo.
- Si tras el reintento sigue fallando → **PAUSA y pregunta al QA** (ask-first), ofreciendo:
  1. **Marcar el flujo como no-mapeado** → va a `unmapped_flows` del drift; el run continúa con el resto.
  2. **Rescate con MCP directo**: el orquestador mapea ese flujo él mismo con llamadas MCP
     (`browser_*`) pantalla por pantalla (navegación real, locators reales — cumple el espíritu de la
     guarda). **Aviso**: consume la ventana de contexto del orquestador; no recomendado en runs grandes.
  3. **Abortar el run** (exit 2).
  Registra la elección al audit-log `{ source: 'command', action: 'warn'|'block', rule: 'planner-flow-recovery', metadata: { flow: '<flow>', choice } }`.
- Un flujo que falle **no contamina a los demás**: los flujos ya mapeados con éxito siguen su curso.
- **Nunca** pases al discovery-analyzer un fragmento que no pasó la guarda. Sin discovery real, no hay
  generación de ese flujo.

7. Invoca `ia4d-discovery-analyzer` pasándole `--planner-saved-plan=docs/test-plans/<site-id>/` (el **directorio de fragmentos** por-flujo) y `--output=<workDir>/discovery-report.json`. **Pásale los negativos efectivos**: el
   `negatives_override` del brief si existe, si no `test_design.coverage.negatives_by_flow` del contract.
   El analyzer genera siempre el flujo principal de cada flujo y añade `negative` solo en los pedidos.
   El analyzer **infiere el dominio del sitio** y marca la criticidad por propósito (no hay keywords).
   - Output: `<workDir>/discovery-report.json`, que ahora incluye
     `inferred_domain` y `scenarios_catalog[]` con `scenario_slug` (`<feature>.<condicion>` español, sin
     naturaleza en el nombre), `feature`, `condicion`, `nature` (`principal`|`negative`), `suite_tags`,
     `criticality`, `rank`. **El analyzer NO asigna el ID del archivo** — eso lo resuelve el Acto 2.5.

### Acto 2.5 — Checkpoint (cap + selección + tags)

Lee `scenarios_catalog` del discovery-report y aplica el tope `--max-scenarios` (default 8). En la tabla
muestra, por cada escenario, su **ID actual en el registro** si ya existe (columna `ID`), o `nuevo` si
aún no está. Lee el registro `tc_registry.path` (default `config/tc-registry/<site-id>.json`; si no
existe, trátalo como `{}`) y busca cada `scenario_slug`.

- **Si `count(scenarios_catalog) ≤ max`** → no pauses. Continúa con TODOS los escenarios.
  Registra `{ source: 'command', action: 'scenario_selection', result: 'pass', metadata: { total: <count>, cap: <max>, selected: <count>, mode: 'auto-under-cap' } }`.

- **Si `count(scenarios_catalog) > max`** → **PAUSA** (ask-first). Imprime la tabla ordenada por `rank`:

  ```
  El descubrimiento devolvió <total> escenarios; el cap es <max>. Selecciona cuáles materializar.

  #     ID            Escenario (slug)                Naturaleza  Tags                  Rank  Crit.
  1     MAPFRE-T1234  inicio-sesion.usuario-valido    principal   @smoke @critical      1     critical
  2     nuevo         inicio-sesion.usuario-bloqueado negativo    @regression @negative 2     critical
  3     nuevo         pago.compra-completa            principal   @smoke @critical      3     critical
  ...
  ```

  > Selecciona los escenarios a materializar por su `#` (ej. `1,2,3`), o escribe `TOP` para los <max> de
  > mayor rank, o `TODOS` para ignorar el cap bajo tu responsabilidad. Puedes editar tags con `3:@regression,@negative`.

  - Respuesta con lista de `#` → materializa solo esos (respetando ediciones de tags).
  - `TOP` → los `max` primeros por `rank`.
  - `TODOS` → todo el catálogo (cap ignorado, `mode: 'all-acknowledged'`).
  - Respuesta ambigua o silencio → **no generes**: repite la tabla o aborta con exit 2.
  - Registra `{ source: 'command', action: 'scenario_selection', result: 'pass', metadata: { total, cap, selected: <n>, mode: 'checkpoint' } }`.

**Resolución de IDs estables (registro `tc_registry`)** — solo para los escenarios **seleccionados**:

1. Por cada seleccionado, busca su `scenario_slug` en el registro:
   - **Existe** → usa su `id` (sea key de gestor `source:'xray'` o `TC-NNN` `source:'agent'`).
   - **No existe** → asigna el siguiente `TC-NNN` libre (`id_prefix` del contract, default `TC`;
     correlativo = max de los `TC-NNN` ya presentes + 1, 3 dígitos), `source:'agent'`, y **añádelo** al
     registro. Nunca inventes un key de gestor: el QA lo rellena después editando el registro.
2. Escribe el registro actualizado de vuelta a `tc_registry.path` (Write). Es versionado y auditable.
3. Registra `{ source: 'command', action: 'write_file', target: '<tc_registry.path>', rule: 'tc-registry', reason: 'persist stable ids' }`.

El conjunto seleccionado (con su `id` estable resuelto, `feature`, `condicion`, `nature` y `suite_tags`
efectivos) es lo que alimenta el Acto 4. Los escenarios NO seleccionados no se materializan ni se
registran (no es un fallo: es la rienda).

### Acto 3 — Estructurar

8. Ejecuta el POM scaffolder programáticamente (`src/scripts/scaffold-poms.ts` lee `screens` y
   `components` del discovery-report):
   ```sh
   npx tsx src/scripts/scaffold-poms.ts <workDir>/discovery-report.json tests/pages/<site-id> tests/components/<site-id>
   ```
   Produce `tests/pages/<site-id>/base.page.ts` (BasePage común), `tests/pages/<site-id>/*.page.ts` (uno por screen,
   `extends BasePage`) y, si el discovery declaró `components[]`, `tests/components/<site-id>/*.component.ts`
   (objetos compartidos nav/header que las pages exponen como campo). Los toggles `pom.base_page` /
   `pom.components` del Style Contract (default ambos `true`) deciden si se emiten.

### Acto 4 — Materializar

**8.b — Auth setup** (solo si el contract tiene `auth.enabled: true`):
- Invoca `ia4d-writer` para generar `tests/e2e/<site-id>/auth.setup.ts`: un bloque `setup('authenticate', ...)` que navega a `auth.login_path`, rellena las credenciales de `synthetic_fixtures.credentials[auth.credentials_ref]`, verifica `auth.success_signal` (assert por `url` o `locator`), y guarda el estado con `await page.context().storageState({ path: <auth.storage_state> })`. Importa `setup` como `import { test as setup } from '@playwright/test'`. **NO** lleva AxeBuilder (es setup, no test del flujo). Los locators del login salen de discovery; si no hay semántica, aplica la excepción `css_fallback_attributes` (Componente CSS legacy).
- El setup project + `dependencies` + `storageState` los activa `playwright.config.ts` vía `QA_STORAGE_STATE` (ver Verification step). Los specs del resto de flujos NO re-loguean: heredan el estado por el dependency.
- Registra al audit-log: `{ source: 'command', action: 'write_file', target: 'tests/e2e/<site-id>/auth.setup.ts', rule: 'auth-handler', reason: 'setup project for persistent session' }`.

9. Para cada escenario **seleccionado en el Acto 2.5** (paralelizable):
   - **Construye el `--output`** con el patrón `naming.spec_pattern` (default `{id}_{feature}.{condicion}.spec.ts`)
     bajo el dir de test del sitio: `tests/e2e/<site-id>/<id>_<feature>.<condicion>.spec.ts`, donde `<id>`
     es el ID estable resuelto del registro (ej. `tests/e2e/saucedemo/TC-002_inicio-sesion.usuario-bloqueado.spec.ts`).
     El `<feature>` y `<condicion>` vienen del catálogo (español, sin tildes/ñ). Si `tc_registry.enabled:false`,
     omite el prefijo `<id>_`.
   - Invoca `ia4d-writer` via Task tool con `--plan-entry`, `--style-contract`, `--pom-skeleton-dir=tests/pages/<site-id>`, `--output` (el que acabas de construir, bajo `tests/e2e/<site-id>/`), `--discovery-report=<workDir>/discovery-report.json`, y además `--tc-id=<id estable>` y `--tags=<@a,@b,@c>` tomados de su entrada en `scenarios_catalog` (con las ediciones de tags del checkpoint, si las hubo).
   - El Writer escribe el `.spec.ts` con los tags nativos e invoca internamente al Reviewer (ping-pong N≤2).
   - Cada `.spec.ts` pasa por el hook PostToolUse `pii-post.ts` automáticamente.
10. (Opcional) Invoca `ia4d-style-enforcer` por cada `.spec.ts` para enforce final del Style Contract.
11. (Obligatorio) Invoca `ia4d-a11y-injector` por cada `.spec.ts` **pasándole `--style-contract`** para asegurar el `AxeBuilder` scan y aplicar el gate del contract:
    - El scan se inyecta siempre (no opcional — regla dura del producto).
    - El gate lo decide `a11y.fail_on_violations` del contract. **Default `false`** (modo warning: annotation auditable, no aborta) — gate apagado por defecto, reactivable por-sitio con `fail_on_violations: true` (entonces `expect(...).toEqual([])` aborta). Severidades filtradas por `a11y.severity_threshold`.
    - Lee el `gate_mode` del output del injector y registra al audit-log: `{ source: 'command', action: 'warn'|'allow', target: <spec>, rule: 'a11y-gate', reason: 'fail_on_violations:<bool> → <mode> mode' }`.

**11.b — Consolidar feedback (determinístico, no LLM):** el Reviewer escribió un fichero por spec en
`<workDir>/review-feedback/<spec>.json` (sin contención entre writers paralelos). Únelos en el
`<workDir>/review-feedback.json` plano: `QA_WORK_DIR=<workDir> npx tsx src/scripts/consolidate-reviews.ts`.
El Judge y el reporte leen el consolidado. (Evita la race de *append* concurrente que corrompía el fichero.)

### Acto 5 — Juzgar

12. **Judge opcional, off por defecto.** Comprueba la env-var `QA_ENABLE_JUDGE` (PowerShell: `$env:QA_ENABLE_JUDGE`; bash: `$QA_ENABLE_JUDGE`). Solo si está seteado (`1`/`true`/`on`) invoca `ia4d-judge` por cada `.spec.ts` con el `<workDir>/review-feedback.json` consolidado. Si no está seteado, **omite el Judge** y registra al audit-log `{ source: 'command', action: 'skip', rule: 'judge', reason: 'judge off (QA_ENABLE_JUDGE unset)' }`; el run-summary marca `judge: skipped`.
13. (Solo si el Judge corrió) Lee todos los scores. Si >30% < 0.5 → pausa con ask-first.
14. Genera summary `<workDir>/qa-automator-run-summary.json` con: lista de tests, scores (o `judge: skipped`), verdicts del Reviewer, axe results. **Cada entrada de `tests_generated[]` incluye `tc_id` y `tags[]`** (del catálogo/checkpoint); el top-level añade `scenarios_total` y `scenarios_selected`. El enricher de `/ia4d-qa-automator:report` los lleva a Allure como labels.

## Outputs (consolidados)

- `docs/test-plans/<site-id>/*.plan.md` (fragmentos del planner, uno por flujo — documentación auditable, versionada)
- `<workDir>/discovery-report.json` (`<workDir>` = `.work/<site-id>`)
- `tests/pages/<site-id>/*.page.ts` + `tests/components/<site-id>/*.component.ts` (POM esqueletos + locators rellenos por Writer)
- `tests/e2e/<site-id>/<id>_<feature>.<condicion>.spec.ts` (specs con prefijo de ID estable; naturaleza solo en tags)
- `config/tc-registry/<site-id>.json` (registro de IDs estables, versionado, durable — fuera de `.work`)
- `<workDir>/review-feedback.json` (todas las reviews)
- `<workDir>/judge-report.json` (scores)
- `<workDir>/audit-log.json` (traza completa)
- `<workDir>/qa-automator-run-summary.json`

## Verification step (ejecuta `npx playwright test`)

**Gates opcionales (off por defecto, v0.2 `design/gates-off-by-default`)**: para reactivarlos en el run,
setea `QA_ENABLE_PII=1` (PII scanner del hook) y/o `QA_ENABLE_JUDGE=1` (Acto 5). El gate de a11y se
reactiva por-sitio con `fail_on_violations: true` en el Style Contract, no por env-var. Sin estas vars,
el run corre sin PII scan, sin Judge y con a11y en modo warning.

**Antes de ejecutar, borra `tests/e2e/<site-id>/seed.spec.ts` si existe.** Es el scaffold que el MCP `playwright-test` resiembra en cada `setup_page` (Planner/Generator); solo sirve durante la generación. Si queda en `testDir`, corre como un test vacío siempre-verde y contamina el output y el reporte Allure (decisión QA: eliminarlo, no ignorarlo).

**`allure-results` se limpia solo.** El `globalSetup` de `playwright.config.ts` (`playwright.global-setup.ts`) vacía `<workDir>/allure-results` (= `QA_WORK_DIR/allure-results`) al inicio de cada `npx playwright test`. Así el reporte refleja SOLO esta corrida — no hace falta `rm` manual y no se acumulan runs viejos (duplicados / `skipped` rancios). El reporte final es **single-file y no acumula Trends entre runs** (trade-off asumido del formato — ver `/ia4d-qa-automator:report`).

Tras los 5 actos, ejecuta el test **seteando `QA_WORK_DIR=<workDir>` (= `.work/<site-id>`)** para que los artefactos del run (allure-results, test-results, report) caigan en el espacio del sitio, **`QA_BASE_URL` con el `--url` del run** (los POM usan `goto('/')` relativo; sin esto el `baseURL` del config cae a SauceDemo — hallazgo Fase B sitio 2), y **filtrando por el dir del sitio**: `npx playwright test tests/e2e/<site-id>/` (corre solo los specs de este sitio, sin arrastrar otros — sustituye al filtrado a mano por features).

**Si el contract tiene `auth.enabled: true`**, setea además `QA_STORAGE_STATE` con `auth.storage_state`. Eso activa el setup project + `dependencies` en `playwright.config.ts`: el `auth.setup.ts` corre primero y escribe el estado, luego los specs lo heredan. **Ya no hace falta `--workers=1`** — el dependency garantiza el orden bajo `fullyParallel` (mata la race del hallazgo #10).

**Evidencia visual (`evidence.level`, default `minimal`)**: el `ia4d-writer` ya estructuró el `.spec.ts` según `level` (comentarios, `test.step`, o `test.step`+screenshot por paso). En el run mapea `level` a env-vars antes de `npx playwright test`:
- `minimal` → `QA_SCREENSHOT` = `evidence.screenshots` si difiere del default `only-on-failure`.
- `steps` → igual que minimal (los pasos viven en el código, no en config).
- `full` → fuerza `QA_SCREENSHOT=on` **y** `QA_TRACE=on`: captura el estado final + el trace navegable que Allure embebe, además de los screenshots por paso que el propio test adjunta.

Es política de run-time: el reporte solo muestra lo que el run capturó.

```sh
# Siempre: setea QA_WORK_DIR='.work/<site-id>' (aísla artefactos del sitio) y filtra por tests/e2e/<site-id>/.

# Sin auth (PowerShell):  $env:QA_WORK_DIR='.work/<site-id>'; $env:QA_BASE_URL='<--url>'; npx playwright test tests/e2e/<site-id>/ --reporter=list
# Sin auth (bash):        QA_WORK_DIR='.work/<site-id>' QA_BASE_URL='<--url>' npx playwright test tests/e2e/<site-id>/ --reporter=list

# Con auth (PowerShell):
#   $env:QA_WORK_DIR='.work/<site-id>'; $env:QA_BASE_URL='<--url>'; $env:QA_STORAGE_STATE='playwright/.auth/<project>.json'; npx playwright test tests/e2e/<site-id>/ --reporter=list
# Con auth (bash):
#   QA_WORK_DIR='.work/<site-id>' QA_BASE_URL='<--url>' QA_STORAGE_STATE='playwright/.auth/<project>.json' npx playwright test tests/e2e/<site-id>/ --reporter=list

# Con evidencia visual para el reporte Allure (contract: evidence.level: full).
# OJO: SIN --reporter=list — el flag CLI sobrescribe los reporters del config y suprime
# allure-results/, dejando a /ia4d-qa-automator:report sin nada que enriquecer.
#   (PowerShell)  $env:QA_WORK_DIR='.work/<site-id>'; $env:QA_BASE_URL='<--url>'; $env:QA_SCREENSHOT='on'; $env:QA_TRACE='on'; npx playwright test tests/e2e/<site-id>/
#   (bash)        QA_WORK_DIR='.work/<site-id>' QA_BASE_URL='<--url>' QA_SCREENSHOT='on' QA_TRACE='on' npx playwright test tests/e2e/<site-id>/
```

- Si todos verdes → run exitoso.
- Si algún rojo → reporta cuáles y por qué. El QA decide si lanza al Healer o ajusta manualmente.

## Hard rules

- Cada invocación de subagent registra al audit-log.
- No saltar Acto 1 (compliance pre-flight). Sin override.
- **Namespace por sitio (paso 5.c)**: artefactos efímeros bajo `<workDir>=.work/<site-id>`; specs/POM bajo `tests/{e2e,pages,components}/<site-id>/`; `QA_WORK_DIR=<workDir>` exportado en el run; `npx playwright test tests/e2e/<site-id>/`. Limpieza de `<workDir>` al arrancar (no toca `config/tc-registry/<site-id>.json`). Runs de sitios distintos NO se contaminan ni se filtran a mano.
- **Planner por-flujo (paso 6) + guarda anti-fabricación por-flujo (paso 6.5)**: el planner se invoca un flujo por vez, secuencial (nunca en paralelo). Cada fragmento pasa la guarda; si un flujo falla tras un reintento, el command PAUSA y el QA decide (no-mapeado / rescate MCP directo / abortar). Un flujo fallido no contamina a los demás. Nunca pases al discovery-analyzer un fragmento que no navegó de verdad. Sin discovery real, no hay generación.
- No entrar en **modo ciego** (reconocimiento sin acotar por módulos) sin la confirmación explícita del QA (`EXPLORAR SIN ACOTAR`, paso 5.b). Acotar por módulos es el camino recomendado; el warning no se silencia.
- El **cap `--max-scenarios`** (Acto 2.5) no se salta en silencio: si el catálogo lo supera, pausa y pide selección. Ignorar el cap requiere `TODOS` explícito del QA. Truncar sin avisar rompe el principio "no silent caps".
- Writer+Reviewer (ping-pong N≤2 del Acto 4) **obligatorios**. El **Judge es opcional, off por defecto** (`QA_ENABLE_JUDGE`); su omisión se registra al audit-log, no se silencia.
- **Registro de IDs (`tc_registry`)**: el ID del archivo es **estable**, nunca el rank efímero. Reusa el ID si el `scenario_slug` ya está en el registro; asigna `TC-NNN` y persístelo si es nuevo. **Nunca inventes un key de gestor de pruebas** (`source:'xray'`) — eso lo rellena el QA. La naturaleza no se nombra: solo el negativo se marca, y únicamente en el tag `@negative` (jamás en el nombre del archivo ni en el título; el flujo principal no lleva tag de naturaleza).
- **Negativos opt-in (S4)**: el flujo principal de cada flujo se genera siempre; los negativos solo en flujos que `test_design.coverage.negatives_by_flow` (o `--negatives`) pida. La criticidad la **infiere** el discovery-analyzer por el propósito del sitio, no por keywords.
- Paralelismo del Acto 4 es prioritario: invocar los Writers de los N escenarios concurrentemente cuando sea posible.

## Reference

- `docs/references/composition-rules.md`
