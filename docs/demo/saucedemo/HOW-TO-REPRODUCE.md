# How to reproduce the SauceDemo MVP demo

Pasos exactos para reproducir el flujo end-to-end del MVP v0.1 de `ia4d-qa-automator` contra SauceDemo. Sin intervención manual no documentada.

## Prerequisitos

- Node ≥ 20 (probado con 24.16)
- Acceso a Internet (saucedemo.com es público)
- Claude Code CLI con el plugin de Playwright Test MCP cargado

## Paso 0 — Clonar y instalar

```sh
git clone <repo>
cd inetum-qa-agents-workspace-ai4dev
npm install
npx playwright install chromium
```

## Paso 1 — Verificar entorno

```sh
node --version          # >= 20
npx playwright --version  # >= 1.56
```

En Claude Code:

```
/qa-automator:healthcheck
```

Resultado esperado: `Status: OK` con 13 subagents detectados.

## Paso 2 — Ejecutar unit tests

```sh
npm test
```

Resultado esperado: **42 tests passed** en cuatro archivos (pii-detector, compliance-preflight, judge-scoring, pom-scaffolder).

## Paso 3 — Ejecutar el flujo autónomo (S4)

Forma A (manual, reproducible):

```sh
# 1. Use the discovery report baseline as input (or run /qa-automator:autonomous in Claude Code for a fresh discovery)
cp demo/saucedemo/expected-output/discovery-report.json discovery-report.json

# 2. Scaffold POMs
npx tsx src/scripts/scaffold-poms.ts discovery-report.json tests/pages

# 3. Run the generated E2E suite
npx playwright test --reporter=list
```

Forma B (orquestación completa en Claude Code):

```
/qa-automator:autonomous --url=https://www.saucedemo.com/ --style=config/style-contracts/saucedemo.yaml
```

Esto invoca los 5 actos del marco QA propio (Comprender → Mapear → Estructurar → Materializar → Juzgar).

## Resultado esperado

```
Running 3 tests using 3 workers

  ok 1 [chromium] › tests\e2e\login.standard-user-happy-path.spec.ts:12:3 › Feature: Authentication › Standard user can log in and reach the inventory (3.5s)
  ok 3 [chromium] › tests\e2e\cart.add-and-view-item.spec.ts:14:3 › Feature: Shopping cart › User can add backpack to cart and view it in the cart page (3.5s)
  ok 2 [chromium] › tests\e2e\checkout.complete-flow.spec.ts:17:3 › Feature: Checkout › Standard user completes the full purchase flow (3.7s)

  3 passed (7.2s)
```

## Tiempo wall-clock observado en el MVP

| Fase | Tiempo |
|---|---|
| `npm install` | ~30 seg (primera vez) |
| `npx playwright install chromium` | ~60 seg (primera vez) |
| `npm test` (unit) | ~1.5 seg |
| `npx playwright test` (E2E, 3 specs paralelos) | ~7.2 seg |
| **Total ejecución del MVP (excluyendo install)** | **<10 seg** |

Esto está muy por debajo del umbral de 8 minutos definido en SPEC §1 DoD #10. **DoD wall-clock cumplido con holgura**.

Si se ejecuta el flujo completo `/qa-automator:autonomous` (incluyendo Planner + Writer + Reviewer + Judge en vivo), el wall-clock proyectado por el spike Slice 0.5 es ≤8 min para los 3 escenarios, con paralelismo en Slice 5.

## Artefactos producidos

Tras el flujo completo se encuentran en workspace root:

- `discovery-report.json`
- `audit-log.json` (poblado por hooks y subagents)
- `review-feedback.json` (en runs con Writer+Reviewer)
- `judge-report.json` (en runs con Judge)
- `tests/pages/*.page.ts` (6 POMs)
- `tests/e2e/*.spec.ts` (3 specs golden path)
- `playwright-report/index.html` (HTML report)

## Resolución de problemas

| Síntoma | Causa probable | Acción |
|---|---|---|
| `getByTestId(...)` timeout | `testIdAttribute: 'data-test'` no configurado en playwright.config.ts | Verificar `use.testIdAttribute` |
| Compliance pre-flight bloquea SauceDemo | `config/allowed-targets.yaml` no declara `saucedemo.com` | Verificar lista `patterns` |
| PII scanner falla sobre tests con `standard_user` | `config/style-contracts/saucedemo.yaml` no declara credenciales en `synthetic_fixtures` | Verificar la sección |
| `npx tsx` no encuentra el script | Falta `npm install` | Reinstalar |
