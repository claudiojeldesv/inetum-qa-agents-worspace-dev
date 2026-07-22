---
description: Módulo S4 — generación autónoma de tests E2E desde una URL. Orquesta los 5 actos del marco QA propio. Funcional en MVP v0.1.
argument-hint: "--url=<URL> [--style=<contract.yaml>] [--flows=a,b] [--negatives=flujo1,flujo2] [--entry=/path] [--ignore=x,y] [--max-scenarios=N]"
---

# /ia4d-qa-automator:autonomous

> **Pre-check (workspace).** Si no existen `config/allowed-targets.yaml` y `playwright.config.ts` en el directorio actual, NO sigas: indica al usuario que ejecute `/ia4d-qa-automator:init <carpeta>` y detente.

Módulo **S4 Autonomous**: de una URL (+ Style Contract opcional) a specs Playwright, en 5 actos (Comprender → Mapear → Estructurar → Materializar → Juzgar). Lo mecánico lo encadena `src/scripts/run-s4-mecanico.ts` (determinístico, Fase 4 token-efficiency) en 5 stages; tú conservas el juicio: brief, pausas ask-first, invocación de subagents, decisión del checkpoint y el reporte final. **Convención de los stages**: exit 0 = continúa con el `next` del JSON · exit 2 = aborta · exit 3 = el JSON trae `pending` → PAUSA ask-first y re-invoca el mismo stage con la respuesta del QA. Detalle operativo (warning verbatim, casuística planner) en `docs/references/autonomous-operations.md` — léelo solo cuando un paso te remita a él.

## Arguments

- `--url=<URL>` (obligatorio): debe estar en `config/allowed-targets.yaml`.
- `--style=<path>` (default `config/style-contracts/saucedemo.yaml`).
- `--output-dir=<path>` (default `tests/e2e/<site-id>`).
- `--flows=<a,b,c>`: flujos a cubrir; acota el planner.
- `--negatives=<f1,f2>`: override por-run de qué flujos añaden negativos (slugs español); sin él manda `test_design.coverage.negatives_by_flow` del contract. El principal se genera siempre; negativos = opt-in.
- `--entry=<ruta|url>` (default `--url`): punto de entrada de la exploración.
- `--ignore=<x,y>`: zonas a NO explorar.
- `--max-scenarios=<N>` (default 8): tope a materializar; superado → checkpoint 2.5.

## Acto 1 — Comprender (setup)

1. `npx tsx src/scripts/run-s4-mecanico.ts setup <flags del run tal cual>` — en UNA llamada: módulo (S4), compliance determinístico **sin override** (verdict a `.work/compliance-verdict.json`; el hook PreToolUse sigue activo de segunda barrera), brief 5.b y namespace+limpieza 5.c (efímero a `<workDir>=.work/<site-id>`, tc-registry intacto).
   - Exit 2 → aborta con la razón del verdict, exit 2.
   - `pending:"compliance-warn"` → muestra el warning al QA; si acepta, re-invoca con `--warn-acknowledged`.
   - `pending:"exploration-brief"` → muestra el WARNING de modo ciego (§1) y pide los módulos. Flujos → re-invoca con `--flows=…`. Respuesta EXACTA `EXPLORAR SIN ACOTAR` → `--blind-acknowledged`. Otra cosa o silencio → repite o aborta exit 2. **Nunca** modo ciego sin esa confirmación.
   - Exit 0 → el JSON trae `site_id`, `work_dir` y `dirs`: usa ESAS rutas namespaciadas en todos los prompts a subagents.

## Acto 2 — Mapear

2. **Planner POR FLUJO, secuencial, NUNCA en paralelo** (comparten navegador MCP — §4).
   - **Dirigido**: por cada flujo, invoca `playwright-test-planner` via Task con:
     `Mapea contra el DOM de <url> SOLO el flujo "<flow>". Punto de entrada: <entry>. NO explores otros flujos ni <ignore>. Mapea el flujo principal (el camino esperado que cumple el propósito); no exhaustivo. Si <flow> está en <flujos-con-negativos>, recorre además una vez el camino de error/validación para capturar los locators del estado de error. Guarda con planner_save_plan en fileName="docs/test-plans/<site-id>/<flow>.plan.md".`
     Tras cada planner, juzga su RESPUESTA (¿reporta tools de navegador — `browser_navigate`, `browser_snapshot`…— y locators/URLs concretos del sitio real?) sin releer el fragmento.
   - **Ciego**: un único planner completo → `docs/test-plans/<site-id>/<site-id>.plan.md`.

**2.5 — Guarda anti-fabricación (NO negociable).** Tras el último flujo: `npx tsx src/scripts/run-s4-mecanico.ts check-fragments --style=<--style> --flows=<a,b,c>` (ciego: `--plan=<file>`) verifica existencia/estructura/evidencia concreta de TODOS los fragmentos y lo registra al audit-log. El juicio "¿navegó de verdad?" sigue siendo tuyo sobre la respuesta del planner; el script aporta la parte mecánica.

- `failed_flows` (o tu juicio dice fabricado, o cuelgue cortado por el QA) → reintenta UNA vez ese flujo y re-verifica con `--flows=<flow>`.
- Sigue fallando → **PAUSA** (ask-first): 1) marcar no-mapeado (→ `unmapped_flows` del drift; el run sigue), 2) rescate MCP directo por el orquestador (§4), 3) abortar (exit 2). Registra la elección (`rule:'planner-flow-recovery'`).
- Un flujo fallido no contamina a los demás. **Nunca** pases al discovery-analyzer un fragmento que no pasó la guarda.

3. Invoca `ia4d-discovery-analyzer` con `--planner-saved-plan=docs/test-plans/<site-id>/` (directorio de fragmentos), `--output=<workDir>/discovery-report.json` y los **negativos efectivos** (override del brief o contract). Output: `inferred_domain` + `scenarios_catalog[]`. El analyzer NO asigna IDs.

## Actos 2.5 + 3 — Checkpoint + Estructurar (una llamada)

4. `npx tsx src/scripts/run-s4-mecanico.ts checkpoint --style=<--style> --max-scenarios=<N>` — aplica el cap, resuelve IDs estables contra el tc-registry (reusa por slug; nuevo → `TC-NNN` correlativo; **nunca** keys de gestor inventados), reescribe el registro, persiste `<workDir>/selection.json` (con `tc_id`, `suite_tags`, `spec_path` por escenario, drop auditado) y scaffoldea el POM determinístico (BasePage + `*.page.ts` + components, toggles del contract).
   - `pending:"checkpoint-selection"` (count > max) → **PAUSA**: muestra la `table` del JSON tal cual y pide lista de `#` (tags editables `3:@regression,@negative`), `TOP` o `TODOS`. Re-invoca con `--select=<respuesta literal>`. Ambiguo o silencio → no generes.
   - Exit 0 → continúa con los seleccionados de `selection.json`. Los NO seleccionados no se materializan ni registran (es la rienda, no un fallo).

## Acto 4 — Materializar

**4.b — Auth setup** (solo si `auth.enabled: true` en el contract): invoca `ia4d-writer` para `tests/e2e/<site-id>/auth.setup.ts` — `setup('authenticate', ...)` (`import { test as setup } from '@playwright/test'`) que navega a `auth.login_path`, usa `synthetic_fixtures.credentials[auth.credentials_ref]`, verifica `auth.success_signal` y persiste `storageState({ path: <auth.storage_state> })`. **Sin** AxeBuilder (es setup). Registra al audit-log (`rule:'auth-handler'`).

5. Por cada entrada de `selection.json` (**Writers escalonados, warm-cache**: lanza el PRIMERO solo y espera a que complete; los restantes en paralelo. Si 4.b corrió, la caché ya está caliente: todos en paralelo): invoca `ia4d-writer` via Task con `--plan-entry`, `--style-contract`, `--pom-skeleton-dir=tests/pages/<site-id>`, `--output=<spec_path>`, `--discovery-report=<workDir>/discovery-report.json`, `--tc-id=<tc_id>`, `--tags=<suite_tags>`. **El prompt lleva RUTAS, nunca contenido inline.** El Writer invoca internamente al Reviewer (N≤2). El hook PostToolUse `pii-post.ts` corre solo.
6. (Opcional) `ia4d-style-enforcer` por spec.
7. `npx tsx src/scripts/run-s4-mecanico.ts post-writers --style=<--style>` — en UNA llamada: a11y determinística (paso 11: scan AxeBuilder tras el goto en cada `test()`, modo según `a11y.fail_on_violations`; el scan es no-opcional), consolidación anti-race del feedback (11.b) y pre-review determinístico (11.c, red objetiva post-review — informa, no bloquea).
   - Exit 1 → invoca `ia4d-a11y-injector` (rescate) SOLO por spec de `failed_specs` y re-invoca post-writers.
   - `pre_review.must_fix > 0` → algo se le escapó al Reviewer: repórtalo al QA en el summary (no es gate, no abortes).

## Acto 5 — Juzgar + Verificación

8. **Judge off por defecto**: solo con `QA_ENABLE_JUDGE` seteado (`1`/`true`/`on`) invoca `ia4d-judge` por spec con el feedback consolidado y persiste los scores en `<workDir>/judge-report.json` ANTES del paso 9. Si no está seteado, el stage `verify` registra el skip solo.
9. `npx tsx src/scripts/run-s4-mecanico.ts verify --style=<--style> --url=<--url>` — borra `seed.spec.ts` si existe, ejecuta `npx playwright test tests/e2e/<site-id>/` con las env-vars correctas (baseURL, evidence del contract, storageState si hay auth — las setea el script, no las prefijes tú), parsea el veredicto por-test y ensambla `<workDir>/qa-automator-run-summary.json`.
10. (Solo si el Judge corrió) >30% de scores < 0.5 → pausa ask-first.
11. **Reporta al QA**: verdes/rojos con su causa, must-fix del pre-review si los hay, ruta del summary. Rojos → decide el QA: Healer (post-proceso) o ajuste manual.

## Outputs

`docs/test-plans/<site-id>/*.plan.md` (versionados) · `<workDir>/{discovery-report,selection,review-feedback,a11y-verify,judge-report,audit-log,qa-automator-run-summary}.json` · `tests/pages/<site-id>/*.page.ts` + `tests/components/<site-id>/*.component.ts` · `tests/e2e/<site-id>/<id>_<feature>.<condicion>.spec.ts` · `config/tc-registry/<site-id>.json` (durable).

## Hard rules

- Cada invocación de subagent registra al audit-log; los stages del script registran lo suyo solos.
- Acto 1 (compliance) no se salta. Sin override.
- Namespace por sitio: efímero bajo `<workDir>`, specs/POM per-site, test filtrado por dir. Limpieza al arrancar sin tocar el tc-registry (lo hace `setup`).
- Planner por-flujo secuencial + guarda 2.5 (juicio tuyo + `check-fragments` mecánico); fallo tras reintento → PAUSA, decide el QA. Sin discovery real no hay generación.
- Modo ciego solo con `EXPLORAR SIN ACOTAR` exacto. El warning no se silencia.
- El cap no se salta en silencio; ignorarlo requiere `TODOS` explícito ("no silent caps").
- Writer+Reviewer (N≤2) obligatorios. Judge opcional off por defecto; su omisión se registra.
- IDs estables: reusa por slug, `TC-NNN` si es nuevo, nunca keys de gestor inventados. Naturaleza solo en el tag `@negative`, jamás en nombre/título.
- Negativos opt-in; criticidad inferida por el discovery-analyzer según propósito.
- **Task prompts a subagents llevan rutas, nunca payload inline.**
- Writers en Acto 4: primero UNO (escribe la caché del prefijo compartido), el resto en paralelo.
- Gobernanza de modelo: el run se lanza con `--model sonnet`. **Nunca** `CLAUDE_CODE_SUBAGENT_MODEL` — pisa el frontmatter de TODOS los subagents y anula el tiering Sonnet/Haiku.
- Los stages con `pending` son pausas ask-first REALES: nunca inventes la respuesta del QA ni re-invoques con una selección/confirmación que no te dieron.

## Reference

- `docs/references/autonomous-operations.md` — §1 warning 5.b, §3 evidencia/shell (equivalentes manuales de `verify`), §4 casuística planner.
- `docs/references/composition-rules.md`
- `src/scripts/run-s4-mecanico.ts` — cabecera del script: contrato de stages y exit codes.
