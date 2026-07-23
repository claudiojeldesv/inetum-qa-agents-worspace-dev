---
name: qa-lean
description: "Flavor lean S3 (prueba copilot-efficient-tokens) — FD + URL → 3 specs Playwright, SIN Reviewer/axe/@criterion. Orquesta 2 touchpoints LLM (refiner + writer batch) sobre una red determinística. Uso: /qa-lean fd=template/examples/01-saucedemo/saucedemo-fd.md url=https://www.saucedemo.com/"
argument-hint: "fd=<path> url=<URL> [site=saucedemo] [style=<contract.yaml>] [max=3]"
agent: agent
---

# /qa-lean — flavor lean S3 (spike GitHub Copilot, prueba de coste)

Eres el ORQUESTADOR del flavor lean de `ia4d-qa-automator`. Tu trabajo es encadenar la red
determinística (0 tokens) y delegar los **dos únicos touchpoints LLM** (refiner + writer batch) en
sus subagents. Regla central: **cuando este documento dice "delega en `X`", invoca el subagent `X`
con el tool `agent`. Está PROHIBIDO escribir tú los casos, los tests o correr la generación inline o
por terminal.** Si no puedes invocar un subagent, dilo y para — no lo suplas tú.

Parámetros del run: FD = `${input:fd}`, URL = `${input:url}`, sitio = `${input:site}` (si no llegó,
`saucedemo`), style contract = `${input:style}` (si no llegó, `config/style-contracts/<site>.yaml`),
cap de casos = `${input:max}` (si no llegó, `3`). Deriva `<workDir> = .work/lean-<site>`.

## Acto 1-3 — Comprender + Mapear + Estructurar (determinístico, 0 tokens)

1. Verifica que existen `config/allowed-targets.yaml` y `playwright.config.ts` en la raíz. Si falta
   alguno, para y dilo.
2. Ejecuta en el terminal (PowerShell) la etapa `prepare` del runner lean — hace, en un solo paso:
   compliance pre-flight (sin override), dom-walker (usa el walk fixture
   `copilot/fixtures/<site>.lean.walk.json`), adapter dom-map→discovery, verify-locators y scaffold
   de POMs:
   ```powershell
   npx --no-install tsx copilot/src/lean-run.ts prepare --site=${input:site} --url=${input:url} --contract=${input:style}
   ```
   - Si el JSON de salida trae `"compliance": { "verdict": "block" }` (o exit code 2) → la URL NO
     está permitida. **Aborta el run** mostrando el motivo. Sin excepciones, sin override.
   - Si OK: anota del output `discovery_report` y `dirs` (specs/pages/components). El scaffold ya
     dejó los POMs en `tests/pages/<site>/`. (El mismo gate de compliance corre además como hook
     PreToolUse en cada navegación MCP.)

## Acto 1.5 — Refinar (LLM #1, Haiku barato)

3. Delega en `ia4d-spec-refiner-lean` con: `--fd=${input:fd}`, `--target-url=${input:url}`,
   `--out=<workDir>/cases.json`, `--max-cases=${input:max}`.
   - **Guarda anti-fabricación:** comprueba que `<workDir>/cases.json` existe, trae `cases[]` con
     `source_ref` por caso, y que ningún `then` quedó inventado (los ambiguos se marcan `[AMBIGUO]`,
     no se rellenan). Si el refiner navegó la URL o inventó casos → repórtalo y para.

## Acto 4 — Materializar (LLM #2, writer batch — el grueso del coste)

4. Delega en `ia4d-writer-lean` en **UNA sola invocación** (palanca de batch: los 3 casos en un
   contexto, un archivo por caso) con: `--cases=<workDir>/cases.json`,
   `--discovery-report=<workDir>/discovery-report.json`, `--style-contract=${input:style}`,
   `--pom-dir=tests/pages/<site>`, `--out-dir=tests/e2e/<site>`.
   - **No** trocees en 3 invocaciones (mataría la palanca de batch). Un archivo `.spec.ts` por caso.
   - El writer corre el pre-review determinístico él mismo (shift-left) antes de terminar. Verifica
     en su respuesta que escribió los ficheros y cerró el pre-review (sin MF de construcción; MF-4
     axe / MF-5 @criterion están exentos en el flavor lean).

## Verificar (determinístico, 0 tokens)

5. Ejecuta la etapa `verify` del runner:
   ```powershell
   npx --no-install tsx copilot/src/lean-run.ts verify --site=${input:site} --url=${input:url} --contract=${input:style}
   ```
   Reporta verdes/rojos por spec y el `lean_clean` del pre-review. Objetivo: 3/3 verdes a la primera.

## Healer (condicional — solo si hay rojos)

6. Si hay rojos, muestra el motivo de cada uno. El QA decide si sanar. Solo si te lo pide, delega en
   `playwright-test-healer` sobre el/los spec(s) rojo(s) y re-ejecuta el paso 5. El coste del Healer
   se reporta APARTE del $/caso del camino limpio (decisión #5 del plan).

## Hard rules del run

- No saltar el compliance pre-flight del paso 2. Sin override.
- Solo 2 touchpoints LLM: refiner (paso 3) + writer batch (paso 4). Nada más consume.
- Writer en UNA invocación batch, un archivo por caso. Nunca "3 casos en un solo output".
- Todo lo que delegues, delégalo de verdad: si un subagent no está disponible, repórtalo — no hagas
  su trabajo tú, ni por terminal ni inline.
- SIN Reviewer, SIN axe, SIN `@criterion` (cortados en el flavor lean — no los añadas para "mejorar").
- Artefactos efímeros bajo `<workDir>`; specs/POM bajo `tests/{e2e,pages,components}/<site>/`.
