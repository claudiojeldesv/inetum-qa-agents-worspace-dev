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

9. Para cada `scenario` en `discovery-report.scenarios_recommended` (paralelizable):
   - Invoca `ia4d-writer` via Task tool con `--plan-entry`, `--style-contract`, `--pom-skeleton-dir`, `--output`, `--discovery-report`.
   - El Writer escribe el `.spec.ts` e invoca internamente al Reviewer (ping-pong N≤2).
   - Cada `.spec.ts` pasa por el hook PostToolUse `pii-post.ts` automáticamente.
10. (Opcional) Invoca `ia4d-style-enforcer` por cada `.spec.ts` para enforce final del Style Contract.
11. (Obligatorio) Invoca `ia4d-a11y-injector` por cada `.spec.ts` para asegurar `AxeBuilder` check.

### Acto 5 — Juzgar

12. Invoca `ia4d-judge` por cada `.spec.ts` con el `review-feedback.json` consolidado.
13. Lee todos los scores. Si >30% < 0.5 → pausa con ask-first.
14. Genera summary `qa-automator-run-summary.json` con: lista de tests, scores, verdicts del Reviewer, axe results.

## Outputs (consolidados)

- `discovery-report.json`
- `tests/pages/*.page.ts` (POM esqueletos + locators rellenos por Writer)
- `tests/e2e/*.spec.ts` (≥3 archivos del flujo golden path)
- `review-feedback.json` (todas las reviews)
- `judge-report.json` (scores)
- `audit-log.json` (traza completa)
- `qa-automator-run-summary.json`

## Verification step (ejecuta `npx playwright test`)

Tras los 5 actos, ejecuta:

```sh
npx playwright test --reporter=list
```

- Si todos verdes → run exitoso.
- Si algún rojo → reporta cuáles y por qué. El SDET decide si lanza al Healer o ajusta manualmente.

## Hard rules

- Cada invocación de subagent registra al audit-log.
- No saltar Acto 1 (compliance pre-flight). Sin override.
- No saltar Acto 5 (Quality layer). Los tres (Writer/Reviewer/Judge) están activos.
- Paralelismo del Acto 4 es prioritario: invocar los Writers de los N escenarios concurrentemente cuando sea posible.

## Reference

- [`SPEC.md`](../../../SPEC.md) §1 (DoD MVP), §2 (Commands), §6 (Boundaries)
- [`references/composition-rules.md`](../../../references/composition-rules.md)
- [`docs/findings/spike-playwright-mcp.md`](../../../docs/findings/spike-playwright-mcp.md)
