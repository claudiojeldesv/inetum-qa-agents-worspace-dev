# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado según el roadmap de [SPEC.md](SPEC.md) §7.

## [0.3.0] - 2026-07-12

Empaquetado como plugin instalable del marketplace de Claude Code (catálogo Inetum). El agente
deja de ser solo un repo/workspace y pasa a distribuirse e instalarse desde un marketplace.

### Added
- **Empaquetado de plugin (Modelo A: repartidor + `init`)** — `plugin-src/` con las fuentes
  hand-authored del plugin: command `/ia4d-qa-automator:init` (despliega el workspace y lo deja
  listo), `/ia4d-qa-automator:help`, `scaffold.mjs` (copia determinística, sin LLM) y `plugin.json`
  base. Los commands del plugin se namespacean por el nombre del plugin; los del workspace
  desplegado siguen siendo `/qa-automator:*` (project-scoped).
- **`src/scripts/build-plugin.mjs`** (`npm run build:plugin`) — genera `plugin/` con layout de
  marketplace (`.claude-plugin/marketplace.json` + `plugin.json`); el payload es `template/` sin
  `node_modules`/`.work`/`.git`; la `version` se inyecta desde `package.json`. Espejo idempotente
  de `build:template`. `plugin/` es artefacto generado (gitignored).
- Guía de empaquetado/simulación en `plugin-src/README.md` (montar market local, instalar, `init`).

### Changed
- `build:template` excluye ahora ambos builders (`build-template.mjs`, `build-plugin.mjs`) del
  workspace del QA.
- `package.json` 0.2.0 → 0.3.0.

### Notas
- Runtime = tsx (sin build a JS). MCP `.mcp.json` sigue Windows-only (`cmd /c`); cross-platform es
  follow-up. El plugin no expone commands globalmente: viven en el workspace desplegado (Modelo A).
- Verificado end-to-end: scaffold limpio → `npm install` → healthcheck 23/23 → unit 122/122.

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
