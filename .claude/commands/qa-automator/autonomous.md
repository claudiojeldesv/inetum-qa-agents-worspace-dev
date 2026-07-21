---
description: Módulo S4 — generación autónoma de tests E2E desde una URL. Orquesta los 5 actos del marco QA propio. Funcional en MVP v0.1.
argument-hint: "--url=<URL> [--style=<contract.yaml>] [--flows=a,b] [--negatives=flujo1,flujo2] [--entry=/path] [--ignore=x,y] [--max-scenarios=N]"
---

# /ia4d-qa-automator:autonomous

> **Pre-check (workspace).** Si no existen `config/allowed-targets.yaml` y `playwright.config.ts` en el directorio actual, NO sigas: indica al usuario que ejecute `/ia4d-qa-automator:init <carpeta>` y detente.

Módulo **S4 Autonomous**: de una URL (+ Style Contract opcional) a specs Playwright, en 5 actos (Comprender → Mapear → Estructurar → Materializar → Juzgar). Acotar el reconocimiento (`--flows/--entry/--ignore`) es **obligatorio salvo confirmación explícita** (5.b). Detalle operativo (warning verbatim, tabla checkpoint, ejemplos shell, casuística) en `docs/references/autonomous-operations.md` — léelo solo cuando un paso te remita a él.

## Arguments

- `--url=<URL>` (obligatorio): debe estar en `config/allowed-targets.yaml`.
- `--style=<path>` (default `config/style-contracts/saucedemo.yaml`).
- `--output-dir=<path>` (default `tests/e2e/<site-id>`).
- `--flows=<a,b,c>`: flujos a cubrir; acota el planner.
- `--negatives=<f1,f2>`: override por-run de qué flujos añaden negativos (slugs español); sin él manda `test_design.coverage.negatives_by_flow` del contract. El principal se genera siempre; negativos = opt-in.
- `--entry=<ruta|url>` (default `--url`): punto de entrada de la exploración.
- `--ignore=<x,y>`: zonas a NO explorar.
- `--max-scenarios=<N>` (default 8): tope a materializar; superado → checkpoint 2.5.

## Acto 1 — Comprender

1. Módulo (determinístico): `npx tsx src/scripts/resolve-mode.ts` con los flags tal cual. Confirma `module:"S4", status:"functional"`; si no, muestra el `user_message` y detente.
2. Compliance (determinístico, **sin override**): `npx tsx src/scripts/check-compliance.ts <--url>`. Escribe `.work/compliance-verdict.json` y registra al audit-log (el hook PreToolUse sigue activo como segunda barrera). Exit 2 (`block`) → aborta con la razón, exit 2. `warn` → muestra el warning y pregunta al QA (ask-first).

**5.b — Brief de exploración.**

- Llega alguno de `--flows/--entry/--ignore` → **modo dirigido**.
- No llega ninguno → **NO explores**: muestra el WARNING de modo ciego (texto en `autonomous-operations.md` §1) y pide los módulos. Flujos → dirigido. Respuesta EXACTA `EXPLORAR SIN ACOTAR` → modo ciego (`blind_acknowledged: true`). Cualquier otra cosa o silencio → repite o aborta exit 2. **Nunca** modo ciego sin esa confirmación.
- Captura `--negatives` como lista de slugs (override del contract para este run).
- Audit-log: `{ source:'command', action:'exploration_brief', metadata:{ flows, entry, ignore, negatives_override, mode, blind_acknowledged } }`.

**5.c — Namespace por sitio + limpieza (NO negociable).**

- `<site-id>` = basename del `--style` sin extensión. `<workDir>` = `.work/<site-id>`: TODOS los artefactos efímeros del run van ahí (excepción: `compliance-verdict.json` en `.work/` plano — corre antes de este paso). `config/tc-registry/<site-id>.json` es durable, fuera de `.work`, no se toca aquí.
- Dirs de test: `tests/{e2e,pages,components}/<site-id>/`.
- Limpieza de arranque: vacía `<workDir>/`. NO borres el tc-registry.
- Exporta `QA_WORK_DIR=<workDir>` para todo el run; a los subagentes que escriben por prosa pásales rutas ya namespaciadas.

## Acto 2 — Mapear

6. **Planner POR FLUJO, secuencial, NUNCA en paralelo** (el monolítico se cuelga; comparten navegador MCP — §4).
   - **Dirigido**: por cada flujo, invoca `playwright-test-planner` via Task con:
     `Mapea contra el DOM de <url> SOLO el flujo "<flow>". Punto de entrada: <entry>. NO explores otros flujos ni <ignore>. Mapea el flujo principal (el camino esperado que cumple el propósito); no exhaustivo. Si <flow> está en <flujos-con-negativos>, recorre además una vez el camino de error/validación para capturar los locators del estado de error. Guarda con planner_save_plan en fileName="docs/test-plans/<site-id>/<flow>.plan.md".`
     Tras cada flujo, guarda 6.5 sobre su fragmento.
   - **Ciego**: un único planner completo → `docs/test-plans/<site-id>/<site-id>.plan.md`; guarda 6.5 una vez.

**6.5 — Guarda anti-fabricación POR FLUJO (NO negociable).** Sin MCP el planner puede fabricar o colgarse. Verifica en cada fragmento: (a) existe (hubo `planner_save_plan`); (b) el resumen indica tools de navegador (`browser_navigate`, `browser_snapshot`…), no solo Read/Grep; (c) locators/URLs concretos del sitio real, no genéricos.

- Falla (o cuelgue cortado por el QA) → reintenta UNA vez ese flujo.
- Sigue fallando → **PAUSA** (ask-first): 1) marcar no-mapeado (→ `unmapped_flows` del drift; el run sigue), 2) rescate MCP directo por el orquestador (consume su contexto; no recomendado en runs grandes — §4), 3) abortar (exit 2). Registra la elección (`rule:'planner-flow-recovery'`).
- Un flujo fallido no contamina a los demás. **Nunca** pases al discovery-analyzer un fragmento que no pasó la guarda.

7. Invoca `ia4d-discovery-analyzer` con `--planner-saved-plan=docs/test-plans/<site-id>/` (directorio de fragmentos), `--output=<workDir>/discovery-report.json` y los **negativos efectivos** (override del brief o contract). Output: `inferred_domain` + `scenarios_catalog[]` (slug español `<feature>.<condicion>`, `nature`, `suite_tags`, `criticality`, `rank`). El analyzer NO asigna IDs.

## Acto 2.5 — Checkpoint (cap + selección + IDs estables)

Lee `scenarios_catalog`, aplica `--max-scenarios`. Lee `tc_registry.path` (default `config/tc-registry/<site-id>.json`; inexistente → `{}`) y busca cada `scenario_slug`.

- `count ≤ max` → continúa con TODOS sin pausar. Audit-log `{ action:'scenario_selection', result:'pass', metadata:{ total, cap, selected, mode:'auto-under-cap' } }`.
- `count > max` → **PAUSA** (ask-first). Tabla ordenada por `rank` — columnas `# / ID (del registro, o "nuevo") / slug / naturaleza / tags / rank / crit.` (ejemplo en §2) — y pide: lista de `#` (tags editables `3:@regression,@negative`), `TOP` (los max por rank) o `TODOS` (cap ignorado, `mode:'all-acknowledged'`). Ambiguo o silencio → no generes. Registra la selección (`mode:'checkpoint'`).

**IDs estables** (solo seleccionados): slug en registro → usa su `id`; nuevo → siguiente `TC-NNN` libre (`id_prefix` del contract, default `TC`, correlativo max+1, 3 dígitos), `source:'agent'`, añádelo. **Nunca inventes un key de gestor** (eso lo rellena el QA). Reescribe el registro (Write, versionado) y registra al audit-log (`rule:'tc-registry'`). Los NO seleccionados no se materializan ni registran (es la rienda, no un fallo).

## Acto 3 — Estructurar

8. `npx tsx src/scripts/scaffold-poms.ts <workDir>/discovery-report.json tests/pages/<site-id> tests/components/<site-id>` — BasePage + un `*.page.ts` por screen + `*.component.ts` si hay `components[]`. Toggles `pom.base_page`/`pom.components` del contract (default `true`).

## Acto 4 — Materializar

**8.b — Auth setup** (solo si `auth.enabled: true`): invoca `ia4d-writer` para `tests/e2e/<site-id>/auth.setup.ts` — `setup('authenticate', ...)` (`import { test as setup } from '@playwright/test'`) que navega a `auth.login_path`, usa `synthetic_fixtures.credentials[auth.credentials_ref]`, verifica `auth.success_signal` y persiste `storageState({ path: <auth.storage_state> })`. **Sin** AxeBuilder (es setup). Registra al audit-log (`rule:'auth-handler'`). El setup project lo activa `QA_STORAGE_STATE` (Verification); los specs heredan la sesión.

9. Por cada escenario seleccionado (**paraleliza los Writers**):
   - `--output` = `tests/e2e/<site-id>/<id>_<feature>.<condicion>.spec.ts` (patrón `naming.spec_pattern`; sin prefijo si `tc_registry.enabled:false`).
   - Invoca `ia4d-writer` via Task con `--plan-entry`, `--style-contract`, `--pom-skeleton-dir=tests/pages/<site-id>`, `--output`, `--discovery-report=<workDir>/discovery-report.json`, `--tc-id=<id>`, `--tags=<@a,@b>` (con ediciones del checkpoint). **El prompt lleva RUTAS, nunca contenido inline** — el Writer lee sus ficheros.
   - El Writer invoca internamente al Reviewer (N≤2). El hook PostToolUse `pii-post.ts` corre solo.
10. (Opcional) `ia4d-style-enforcer` por spec.
11. (Obligatorio) A11y determinística: `npx tsx src/scripts/verify-a11y.ts tests/e2e/<site-id>/ --style-contract=<--style>` — scan AxeBuilder tras el goto en cada `test()` + modo según `a11y.fail_on_violations` (default `false` → warning). Exit 1 → invoca `ia4d-a11y-injector` (rescate) SOLO por spec de `failed_specs` y re-ejecuta. El scan es no-opcional.

**11.b — Consolidar feedback**: `QA_WORK_DIR=<workDir> npx tsx src/scripts/consolidate-reviews.ts` (une `<workDir>/review-feedback/<spec>.json` → plano; evita la race de append).

**11.c — Pre-review determinístico (obligatorio)**: `npx tsx src/scripts/pre-review.ts tests/e2e/<site-id>/ --style-contract=<--style> --out-dir=<workDir>/pre-review` — red objetiva post-review (MF-1/2/4/5, banned APIs, MF-9 mecánico). Must-fix aquí = algo se le escapó al Reviewer: repórtalo al QA en el summary (no es gate, no abortes).

## Acto 5 — Juzgar

12. **Judge off por defecto**: solo con `QA_ENABLE_JUDGE` seteado (`1`/`true`/`on`) invoca `ia4d-judge` por spec con el feedback consolidado. Si no: omite y registra `{ action:'skip', rule:'judge', reason:'judge off (QA_ENABLE_JUDGE unset)' }`; summary `judge: skipped`.
13. (Solo si corrió) >30% de scores < 0.5 → pausa ask-first.
14. Genera `<workDir>/qa-automator-run-summary.json`: `tests_generated[]` (con `tc_id` y `tags[]`), verdicts, axe results, scores (o `judge: skipped`), `scenarios_total`/`scenarios_selected`.

## Verification step (`npx playwright test`)

Gates off por defecto (v0.2): `QA_ENABLE_PII=1` / `QA_ENABLE_JUDGE=1` reactivan; gate a11y por-sitio con `fail_on_violations: true`.

1. **Borra `tests/e2e/<site-id>/seed.spec.ts` si existe** (scaffold del MCP; si queda corre como test vacío siempre-verde — §3). `allure-results` se limpia solo (globalSetup).
2. Ejecuta con `QA_WORK_DIR=<workDir>` y `QA_BASE_URL=<--url>` (obligatoria: los POM usan `goto('/')` relativo), filtrando: `npx playwright test tests/e2e/<site-id>/ --reporter=list`. Con auth añade `QA_STORAGE_STATE=<auth.storage_state>` (activa el setup project; sin `--workers=1`).
3. `evidence.level`: `minimal`/`steps` → nada extra; `full` → `QA_SCREENSHOT=on QA_TRACE=on` y **SIN `--reporter=list`** (el flag suprime allure-results). Ejemplos shell en §3.
4. Verdes → run exitoso. Rojos → reporta cuáles y por qué; el QA decide Healer o ajuste manual.

## Outputs

`docs/test-plans/<site-id>/*.plan.md` (versionados) · `<workDir>/{discovery-report,review-feedback,judge-report,audit-log,qa-automator-run-summary}.json` · `tests/pages/<site-id>/*.page.ts` + `tests/components/<site-id>/*.component.ts` · `tests/e2e/<site-id>/<id>_<feature>.<condicion>.spec.ts` · `config/tc-registry/<site-id>.json` (durable).

## Hard rules

- Cada invocación de subagent registra al audit-log.
- Acto 1 (compliance) no se salta. Sin override.
- Namespace por sitio (5.c): efímero bajo `<workDir>`, specs/POM per-site, `QA_WORK_DIR` exportado, test filtrado por dir. Limpieza al arrancar sin tocar el tc-registry.
- Planner por-flujo secuencial + guarda 6.5 por fragmento; fallo tras reintento → PAUSA, decide el QA. Sin discovery real no hay generación.
- Modo ciego solo con `EXPLORAR SIN ACOTAR` exacto (5.b). El warning no se silencia.
- El cap no se salta en silencio; ignorarlo requiere `TODOS` explícito ("no silent caps").
- Writer+Reviewer (N≤2) obligatorios. Judge opcional off por defecto; su omisión se registra.
- IDs estables: reusa por slug, `TC-NNN` si es nuevo, nunca keys de gestor inventados. Naturaleza solo en el tag `@negative`, jamás en nombre/título.
- Negativos opt-in; criticidad inferida por el discovery-analyzer según propósito.
- **Task prompts a subagents llevan rutas, nunca payload inline.**
- Paralelismo de Writers en Acto 4 prioritario.

## Reference

- `docs/references/autonomous-operations.md` — §1 warning 5.b, §2 tabla checkpoint, §3 shell/evidencia, §4 casuística planner.
- `docs/references/composition-rules.md`
