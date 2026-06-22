---
description: Módulo S4 — generación autónoma de tests E2E desde una URL. Orquesta los 5 actos del marco QA propio. Funcional en MVP v0.1.
argument-hint: "--url=<URL> [--style=<contract.yaml>] [--flows=a,b] [--coverage=flujo:happy+negative] [--entry=/path] [--ignore=x,y] [--max-scenarios=N]"
---

# /qa-automator:autonomous

Módulo **S4 Autonomous** del agente `ia4d-qa-automator`. Recibe una URL y, opcionalmente, un Style Contract. Orquesta los cinco actos del marco QA propio (Comprender → Mapear → Estructurar → Materializar → Juzgar) contra el target.

Acepta además un **brief de exploración** (`--flows/--entry/--ignore`) que acota el reconocimiento por **módulos / flujos**. Acotar es el camino recomendado y, salvo confirmación explícita del SDET, **obligatorio**: este command **no explora una web entera a ciegas** (ver paso 5.b — warning + confirmación). Es el plumbing instrumental de v0.2 (ver SPEC §7, estrategia de reconocimiento happy-path).

## Arguments

- `--url=<URL>` (obligatorio): URL del target, debe estar en `config/allowed-targets.yaml`.
- `--style=<path>` (opcional, default: `config/style-contracts/saucedemo.yaml`): YAML del Style Contract.
- `--output-dir=<path>` (opcional, default: `tests/e2e`): directorio donde se escriben los `.spec.ts`.
- `--flows=<a,b,c>` (opcional): flujos a cubrir, separados por coma (ej. `checkout,registro`). Acota qué mapea el planner.
- `--coverage=<flujo:nat+nat,...>` (opcional): **override por-run** de la cobertura por flujo del Style
  Contract. Naturalezas: `happy`, `negative`. Ej. `--coverage=inicio-sesion:happy+negative,pago:happy`.
  Las claves de flujo son los **slugs en español** (ver glosario del discovery-analyzer). Si no se pasa,
  manda `test_design.coverage` del contract. Negativos en S4 = opt-in: solo se generan donde se pidan.
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
4. Si verdict = `block` → aborta, muestra razón al SDET, termina con exit 2.
5. Si verdict = `warn` → muestra warning y pregunta al SDET si continúa (ask-first).

**5.b — Captura del brief de exploración (acotar por módulos es OBLIGATORIO salvo confirmación explícita)**:

Acotar el reconocimiento por **módulos / flujos** (ej. `login`, `checkout`, `transfer`) no es una optimización opcional. En webs medianas o grandes, explorar a ciegas satura la ventana de contexto del agente con casuística irrelevante y degrada la calidad del plan: el agente se vuelve un caballo sin riendas. Por eso este command **no explora una web entera a ciegas por defecto**.

- Si llega al menos uno de `--flows/--entry/--ignore` → **modo dirigido**: compón el brief con lo recibido. Camino recomendado.
- Si no llega ninguno → **NO explores todavía**. Muestra al SDET este WARNING y pídele los módulos:

  > ⚠️ Vas a lanzar el reconocimiento autónomo SIN acotar por módulos.
  > En webs medianas o grandes esto satura el contexto del agente y baja la
  > calidad del plan (un caballo sin riendas). Recomendado: indica los módulos
  > o flujos a cubrir, p.ej. `--flows=login,checkout`.
  >
  > Responde con los flujos a cubrir, o escribe EXACTAMENTE `EXPLORAR SIN ACOTAR`
  > para continuar en modo ciego bajo tu responsabilidad.

  - Si el SDET responde con flujos → **modo dirigido** con esos flujos.
  - Si el SDET responde **exactamente** `EXPLORAR SIN ACOTAR` → **modo ciego** (exploración exhaustiva, comportamiento v0.1), `blind_acknowledged: true`.
  - Cualquier otra respuesta, respuesta ambigua o silencio → **no explores**: repite el warning o aborta con exit 2. **Nunca** entres en modo ciego sin esa confirmación explícita.

- **Captura la cobertura por flujo**: si llegó `--coverage`, parséalo a un mapa `{ <slug-flujo>: [naturalezas] }`
  (ej. `inicio-sesion:happy+negative` → `{ 'inicio-sesion': ['happy','negative'] }`). Este override pisa
  `test_design.coverage` del contract para este run. Si no llegó, no hay override (manda el contract).
- Registra el brief efectivo al audit-log: `{ source: 'command', action: 'exploration_brief', metadata: { flows, entry, ignore, coverage_override, mode, blind_acknowledged } }`.
- Nota: el intake aquí es mínimo (plumbing v0.2). El intake adaptativo —preguntas y pre-scout derivados de la recolección— es Fase C.

### Acto 2 — Mapear

6. Deriva el `<site-id>` del basename del `--style` sin extensión (ej. `config/style-contracts/saucedemo.yaml` → `saucedemo`; con el default del command → `saucedemo`). Invoca `playwright-test-planner` (nativo) via Task tool. Compón el prompt con la URL **y el brief del paso 5.b**, e **indícale la ruta de guardado**: el planner debe llamar a `planner_save_plan` con `fileName="docs/test-plans/<site-id>/<site-id>.plan.md"` (ruta relativa a la raíz del workspace; el tool crea el directorio si no existe). El plan es documentación auditable y vive en `docs/`, no en `tests/`.
   - **Modo dirigido**: `Crea un test plan para <url>. SCOPE — cubre solo estos flujos: <flows>. Punto de entrada: <entry>. NO explores: <ignore>. Mapea el happy-path de cada flujo listado; no exhaustivo. Para los flujos cuya cobertura pida negativos (<flujos-con-negative>), recorre además una vez el camino de error/validación (ej. login con credenciales inválidas) para capturar los locators del estado de error (mensaje de error, banner), que el negativo necesitará para su assert. Guarda el plan con planner_save_plan en fileName="docs/test-plans/<site-id>/<site-id>.plan.md".`
   - **Modo ciego**: prompt de exploración completa (comportamiento v0.1), con la misma instrucción de `fileName`.
   - Esperar el output: `docs/test-plans/<site-id>/<site-id>.plan.md` con escenarios + `planner_save_plan` ejecutado.
7. Invoca `ia4d-discovery-analyzer` con el plan saved como input. **Pásale la cobertura efectiva**: el
   `coverage_override` del brief si existe, si no `test_design.coverage` del contract. El analyzer la usa
   para proponer escenarios `negative` solo en los flujos que la pidan (default: solo `happy`).
   - Output: `.work/discovery-report.json` (dir de trabajo efímero del agente), que ahora incluye
     `scenarios_catalog[]` con `scenario_slug` (`<feature>.<condicion>` español, sin naturaleza en el
     nombre), `feature`, `condicion`, `nature` (`happy`|`negative`), `suite_tags`, `criticality`, `rank`.
     **El analyzer NO asigna el ID del archivo** — eso lo resuelve el Acto 2.5 contra el registro.

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

  #     ID            Escenario (slug)                Naturaleza  Tags                          Rank  Crit.
  1     MAPFRE-T1234  inicio-sesion.usuario-valido    happy       @smoke @happy-path @critical  1     critical
  2     nuevo         inicio-sesion.usuario-bloqueado negative    @regression @negative         2     critical
  3     nuevo         pago.compra-completa            happy       @smoke @happy-path @critical  3     critical
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
     registro. Nunca inventes un key de gestor: el SDET lo rellena después editando el registro.
2. Escribe el registro actualizado de vuelta a `tc_registry.path` (Write). Es versionado y auditable.
3. Registra `{ source: 'command', action: 'write_file', target: '<tc_registry.path>', rule: 'tc-registry', reason: 'persist stable ids' }`.

El conjunto seleccionado (con su `id` estable resuelto, `feature`, `condicion`, `nature` y `suite_tags`
efectivos) es lo que alimenta el Acto 4. Los escenarios NO seleccionados no se materializan ni se
registran (no es un fallo: es la rienda).

### Acto 3 — Estructurar

8. Ejecuta el POM scaffolder programáticamente (`src/scripts/scaffold-poms.ts` lee `screens` y
   `components` del discovery-report):
   ```sh
   npx tsx src/scripts/scaffold-poms.ts .work/discovery-report.json tests/pages
   ```
   Produce `tests/pages/base.page.ts` (BasePage común), `tests/pages/*.page.ts` (uno por screen,
   `extends BasePage`) y, si el discovery declaró `components[]`, `tests/components/*.component.ts`
   (objetos compartidos nav/header que las pages exponen como campo). Los toggles `pom.base_page` /
   `pom.components` del Style Contract (default ambos `true`) deciden si se emiten.

### Acto 4 — Materializar

**8.b — Auth setup** (solo si el contract tiene `auth.enabled: true`):
- Invoca `ia4d-writer` para generar `tests/e2e/auth.setup.ts`: un bloque `setup('authenticate', ...)` que navega a `auth.login_path`, rellena las credenciales de `synthetic_fixtures.credentials[auth.credentials_ref]`, verifica `auth.success_signal` (assert por `url` o `locator`), y guarda el estado con `await page.context().storageState({ path: <auth.storage_state> })`. Importa `setup` como `import { test as setup } from '@playwright/test'`. **NO** lleva AxeBuilder (es setup, no test del flujo). Los locators del login salen de discovery; si no hay semántica, aplica la excepción `css_fallback_attributes` (Componente CSS legacy).
- El setup project + `dependencies` + `storageState` los activa `playwright.config.ts` vía `QA_STORAGE_STATE` (ver Verification step). Los specs del resto de flujos NO re-loguean: heredan el estado por el dependency.
- Registra al audit-log: `{ source: 'command', action: 'write_file', target: 'tests/e2e/auth.setup.ts', rule: 'auth-handler', reason: 'setup project for persistent session' }`.

9. Para cada escenario **seleccionado en el Acto 2.5** (paralelizable):
   - **Construye el `--output`** con el patrón `naming.spec_pattern` (default `{id}_{feature}.{condicion}.spec.ts`):
     `<output-dir>/<id>_<feature>.<condicion>.spec.ts`, donde `<id>` es el ID estable resuelto del
     registro (ej. `MAPFRE-T1234_inicio-sesion.usuario-valido.spec.ts` o `TC-002_inicio-sesion.usuario-bloqueado.spec.ts`).
     El `<feature>` y `<condicion>` vienen del catálogo (español, sin tildes/ñ). Si `tc_registry.enabled:false`,
     omite el prefijo `<id>_`.
   - Invoca `ia4d-writer` via Task tool con `--plan-entry`, `--style-contract`, `--pom-skeleton-dir`, `--output` (el que acabas de construir), `--discovery-report`, y además `--tc-id=<id estable>` y `--tags=<@a,@b,@c>` tomados de su entrada en `scenarios_catalog` (con las ediciones de tags del checkpoint, si las hubo).
   - El Writer escribe el `.spec.ts` con los tags nativos e invoca internamente al Reviewer (ping-pong N≤2).
   - Cada `.spec.ts` pasa por el hook PostToolUse `pii-post.ts` automáticamente.
10. (Opcional) Invoca `ia4d-style-enforcer` por cada `.spec.ts` para enforce final del Style Contract.
11. (Obligatorio) Invoca `ia4d-a11y-injector` por cada `.spec.ts` **pasándole `--style-contract`** para asegurar el `AxeBuilder` scan y aplicar el gate del contract:
    - El scan se inyecta siempre (no opcional, SPEC §6).
    - El gate lo decide `a11y.fail_on_violations` del contract. **Default `false`** (modo warning: annotation auditable, no aborta) — gate apagado por defecto, reactivable por-sitio con `fail_on_violations: true` (entonces `expect(...).toEqual([])` aborta). Severidades filtradas por `a11y.severity_threshold`.
    - Lee el `gate_mode` del output del injector y registra al audit-log: `{ source: 'command', action: 'warn'|'allow', target: <spec>, rule: 'a11y-gate', reason: 'fail_on_violations:<bool> → <mode> mode' }`.

### Acto 5 — Juzgar

12. **Judge opcional, off por defecto.** Comprueba el entorno (`echo $env:QA_ENABLE_JUDGE` en PowerShell). Solo si está seteado (`1`/`true`/`on`) invoca `ia4d-judge` por cada `.spec.ts` con el `.work/review-feedback.json` consolidado. Si no está seteado, **omite el Judge** y registra al audit-log `{ source: 'command', action: 'skip', rule: 'judge', reason: 'judge off (QA_ENABLE_JUDGE unset)' }`; el run-summary marca `judge: skipped`.
13. (Solo si el Judge corrió) Lee todos los scores. Si >30% < 0.5 → pausa con ask-first.
14. Genera summary `.work/qa-automator-run-summary.json` con: lista de tests, scores (o `judge: skipped`), verdicts del Reviewer, axe results. **Cada entrada de `tests_generated[]` incluye `tc_id` y `tags[]`** (del catálogo/checkpoint); el top-level añade `scenarios_total` y `scenarios_selected`. El enricher de `/qa-automator:report` los lleva a Allure como labels.

## Outputs (consolidados)

- `docs/test-plans/<site-id>/<site-id>.plan.md` (test plan del planner — documentación auditable, versionada)
- `.work/discovery-report.json`
- `tests/pages/*.page.ts` (POM esqueletos + locators rellenos por Writer)
- `tests/e2e/<id>_<feature>.<condicion>.spec.ts` (specs con prefijo de ID estable; naturaleza solo en tags)
- `config/tc-registry/<site-id>.json` (registro de IDs estables, versionado — creado/actualizado en Acto 2.5)
- `.work/review-feedback.json` (todas las reviews)
- `.work/judge-report.json` (scores)
- `.work/audit-log.json` (traza completa)
- `.work/qa-automator-run-summary.json`

## Verification step (ejecuta `npx playwright test`)

**Gates opcionales (off por defecto, v0.2 `design/gates-off-by-default`)**: para reactivarlos en el run,
setea `QA_ENABLE_PII=1` (PII scanner del hook) y/o `QA_ENABLE_JUDGE=1` (Acto 5). El gate de a11y se
reactiva por-sitio con `fail_on_violations: true` en el Style Contract, no por env-var. Sin estas vars,
el run corre sin PII scan, sin Judge y con a11y en modo warning.

**Antes de ejecutar, borra `tests/e2e/seed.spec.ts` si existe.** Es el scaffold que el MCP `playwright-test` resiembra en cada `setup_page` (Planner/Generator); solo sirve durante la generación. Si queda en `testDir`, corre como un test vacío siempre-verde y contamina el output y el reporte Allure (decisión SDET: eliminarlo, no ignorarlo).

**`allure-results` se limpia solo.** El `globalSetup` de `playwright.config.ts` (`playwright.global-setup.ts`) vacía `.work/allure-results` al inicio de cada `npx playwright test`. Así el reporte refleja SOLO esta corrida — no hace falta `rm` manual y no se acumulan runs viejos (duplicados / `skipped` rancios). Los Trends se preservan (`.allure-history/` queda intacto; el report lo re-inyecta).

Tras los 5 actos, ejecuta el test **seteando `QA_BASE_URL` con el `--url` del run** (los POM usan `goto('/')` relativo; sin esto el `baseURL` del config cae a SauceDemo y el spec corre contra el sitio equivocado — hallazgo Fase B sitio 2).

**Si el contract tiene `auth.enabled: true`**, setea además `QA_STORAGE_STATE` con `auth.storage_state`. Eso activa el setup project + `dependencies` en `playwright.config.ts`: el `auth.setup.ts` corre primero y escribe el estado, luego los specs lo heredan. **Ya no hace falta `--workers=1`** — el dependency garantiza el orden bajo `fullyParallel` (mata la race del hallazgo #10).

**Evidencia visual (`evidence.level`, default `minimal`)**: el `ia4d-writer` ya estructuró el `.spec.ts` según `level` (comentarios, `test.step`, o `test.step`+screenshot por paso). En el run mapea `level` a env-vars antes de `npx playwright test`:
- `minimal` → `QA_SCREENSHOT` = `evidence.screenshots` si difiere del default `only-on-failure`.
- `steps` → igual que minimal (los pasos viven en el código, no en config).
- `full` → fuerza `QA_SCREENSHOT=on` **y** `QA_TRACE=on`: captura el estado final + el trace navegable que Allure embebe, además de los screenshots por paso que el propio test adjunta.

Es política de run-time: el reporte solo muestra lo que el run capturó.

```sh
# Sin auth (PowerShell):  $env:QA_BASE_URL='<--url>'; npx playwright test --reporter=list
# Sin auth (bash):        QA_BASE_URL='<--url>' npx playwright test --reporter=list

# Con auth (PowerShell):
#   $env:QA_BASE_URL='<--url>'; $env:QA_STORAGE_STATE='playwright/.auth/<project>.json'; npx playwright test --reporter=list
# Con auth (bash):
#   QA_BASE_URL='<--url>' QA_STORAGE_STATE='playwright/.auth/<project>.json' npx playwright test --reporter=list

# Con evidencia visual para el reporte Allure (contract: evidence.level: full).
# OJO: SIN --reporter=list — el flag CLI sobrescribe los reporters del config y suprime
# allure-results/, dejando a /qa-automator:report sin nada que enriquecer.
#   (PowerShell)  $env:QA_BASE_URL='<--url>'; $env:QA_SCREENSHOT='on'; $env:QA_TRACE='on'; npx playwright test
#   (bash)        QA_BASE_URL='<--url>' QA_SCREENSHOT='on' QA_TRACE='on' npx playwright test
```

- Si todos verdes → run exitoso.
- Si algún rojo → reporta cuáles y por qué. El SDET decide si lanza al Healer o ajusta manualmente.

## Hard rules

- Cada invocación de subagent registra al audit-log.
- No saltar Acto 1 (compliance pre-flight). Sin override.
- No entrar en **modo ciego** (reconocimiento sin acotar por módulos) sin la confirmación explícita del SDET (`EXPLORAR SIN ACOTAR`, paso 5.b). Acotar por módulos es el camino recomendado; el warning no se silencia.
- El **cap `--max-scenarios`** (Acto 2.5) no se salta en silencio: si el catálogo lo supera, pausa y pide selección. Ignorar el cap requiere `TODOS` explícito del SDET. Truncar sin avisar rompe el principio "no silent caps".
- Writer+Reviewer (ping-pong N≤2 del Acto 4) **obligatorios**. El **Judge es opcional, off por defecto** (`QA_ENABLE_JUDGE`); su omisión se registra al audit-log, no se silencia.
- **Registro de IDs (`tc_registry`)**: el ID del archivo es **estable**, nunca el rank efímero. Reusa el ID si el `scenario_slug` ya está en el registro; asigna `TC-NNN` y persístelo si es nuevo. **Nunca inventes un key de gestor de pruebas** (`source:'xray'`) — eso lo rellena el SDET. La naturaleza (`@happy-path`/`@negative`) va solo en el tag, jamás en el nombre del archivo ni en el título.
- **Negativos opt-in (S4)**: solo se materializan los negativos de flujos que la cobertura (`test_design.coverage` o `--coverage`) pida. Sin esa declaración, solo happy path.
- Paralelismo del Acto 4 es prioritario: invocar los Writers de los N escenarios concurrentemente cuando sea posible.

## Reference

- [`SPEC.md`](../../../SPEC.md) §1 (DoD MVP), §2 (Commands), §6 (Boundaries)
- [`docs/references/composition-rules.md`](../../../docs/references/composition-rules.md)
- [`docs/findings/spike-playwright-mcp.md`](../../../docs/findings/spike-playwright-mcp.md)
