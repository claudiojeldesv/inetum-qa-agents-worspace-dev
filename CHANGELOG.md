# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado según el roadmap de [SPEC.md](SPEC.md) §7.

## [Unreleased]

Modos de ciclo de vida sobre el motor validado, y rama de entrega a cliente.

### Added
- **`/qa-automator:incremental`** — modo delta sobre una suite ya generada: diff determinístico
  de criterios (`src/criteria-diff.ts`, library+CLI, 11 unit tests; matching por pases id+hash
  que absorbe renumeraciones RF sin falsos modified), Writer **update-mode** (cirugía sobre el
  spec existente, mismo `@tc-id`), baseline durable `config/criteria-baseline/<site-id>.json`
  (lo escriben S2/S3/incremental/migrate al cerrar en verde). Nunca borra specs: `removed` y
  `orphan_specs` son decisión del QA.
- **`/qa-automator:migrate`** + **`ia4d-legacy-analyzer`** — migración de suites legacy
  Selenium (Java/Python/JS) o UFT/QTP a Playwright: extrae la *intención* (no transpila),
  emite el mismo `criteria.json` + `migration-map.json` (contrato de paridad: cada caso legacy
  termina covered/drift/blocked/pending, la suma cuadra) + catálogo de anti-patterns
  (sleeps, XPath frágil, no-POM, asserts débiles, datos hardcoded) como mejoras aplicadas.
- Labs **06-migracion-selenium** (suite Java legacy sembrada de anti-patterns) y
  **07-incremental** (FD v2 de SauceDemo) en el template.
- Rama **`entrega/workspace-cliente`**: orphan branch con el template promocionado a raíz —
  workspace autocontenido para entregar a cliente, sin histórico ni material interno.

### Changed
- Los archivos propagados al template (`.claude/agents`, `.claude/commands`, `docs/references`)
  ya no referencian `SPEC.md`/`METODOLOGIA AISD.md` (docs internas que no se distribuyen).
- `build-template.mjs` limpia la entrada `template/` del `.eslintignore` generado.
- Template: README/CLAUDE/labs corregidos para el onboarding de cliente (conteo de labs,
  nota multiplataforma del MCP, `.env.example` completo, wording "carpeta template/").

## [0.2.0] - 2026-06-02

Cierre de v0.2: el agente sale del sandbox, suma tres puertas de entrada (S2/S3/S4) y
endurece el diseño con gates opcionales. Se publica además un workspace `template/` listo
para que un SDET use el agente sin tocar el repo de construcción.

### Added
- **`template/`** — workspace de arranque autocontenido para SDETs: runtime del agente
  (`.claude/`, `src/`, `hooks/`, `references/`, `style-contracts/`, `config/`),
  `.claude/settings.json` que cablea los hooks, `CLAUDE.md` guía de uso, `README.md`
  quickstart, `.env.example` y ejemplos solo-inputs (SauceDemo S4, ParaBank S2/S3/S4).
- **S2 Req-driven (Gherkin)** — `.feature` maduro + URL como entrada al motor. Parser
  determinístico `src/gherkin-to-criteria.ts` (`@cucumber/gherkin`, no LLM). Materializa
  `Scenario Outline` + `Examples` como tests data-driven. Validado ParaBank 5/5.
- **S3 Spec-refiner** — FD/spec floja + URL. Extrae criterios RF-NNN, marca huecos en
  `refinement-questions.md`, detecta drift spec↔implementación. Validado ParaBank 3/3.
- **a11y gate configurable** (`fail_on_violations` por sitio), **auth-handler** acotado
  (campo `auth:` + setup project, mata la race del storageState sin `--workers=1`),
  **excepción CSS legacy** (`locators.css_fallback_attributes`).
- `scripts/healthcheck.ts` — healthcheck estructural del runtime (determinístico, no MCP).

### Changed
- **Gates opcionales, off por defecto** (`design/gates-off-by-default`): `ia4d-pii-scanner`,
  `ia4d-judge` y el gate de `ia4d-a11y-injector` pasan a off-por-defecto y reactivables
  (no eliminados). Toggles: `QA_ENABLE_PII`, `QA_ENABLE_JUDGE`, `fail_on_violations: true`.
  El scan de a11y y la guarda anti-`test.fixme()` siguen siempre activos.
- `package.json` 0.1.0 → 0.2.0 (estaba congelado pese a todo el trabajo de v0.2).

### Fixed
- `qa:healthcheck` apuntaba a `scripts/healthcheck.ts` inexistente; ahora el script existe
  y verifica integridad del runtime.

### Notas
- Validación de fases A–E documentada en `docs/findings/` (no se reproduce aquí).
- S1 (Code-driven) sigue stub → v0.3. OpenAPI (S2) diferido a v0.4.
