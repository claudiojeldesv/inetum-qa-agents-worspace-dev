# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado según el roadmap de [SPEC.md](SPEC.md) §7.

## [Unreleased]

Cierre de los hallazgos `REQUEST_CHANGES` de la auditoría externa 2026-07-21 (doctor + panel-judge
sobre el plugin distribuido).

### Removed
- **`src/scripts/slice65-judge.ts`** (CRÍTICO): Judge standalone huérfano de una sesión de desarrollo;
  operaba con rutas planas (`tests/e2e`, `.work/judge-report.json`, `.work/audit-log.json`) y, ejecutado
  a mano con specs de varios sitios, mezclaba resultados cross-site y pisaba el audit-log plano.
- **`src/native-agents.ts`**: constantes sin ningún consumidor; los commands invocan a los subagents
  nativos por nombre. Riesgo de rename upstream re-documentado en SPEC anexo #2.

### Fixed
- **Staleness del POM scaffolder**: `scaffold()` ahora sobrescribe siempre los `*.page.ts`/`*.component.ts`
  para que un re-run del mismo sitio refleje el discovery-report vigente (antes conservaba el fichero
  previo con locators rancios, sin aviso). Test unitario de la sobrescritura añadido.
- **Comentario obsoleto en `playwright.global-setup.ts`**: citaba un paso "History IN" de
  `build-report.mjs` que no existe; alineado con la decisión vigente (reporte single-file, sin Trends).
- **Ejemplo de `writer-reviewer-protocol.md`** con `login.happy-path.spec.ts` (violaba la convención
  "naturaleza fuera del nombre"); ahora usa el patrón real `TC-NNN_<feature>.<condicion>.spec.ts`.

### Added
- **`ia4d-pii-scanner` cableado**: paso opcional 11.c/14.c en los 3 commands generadores cuando
  `QA_ENABLE_PII` está seteado (barrido consolidado; el enforcement por-fichero sigue en el hook
  `pii-post.ts`). El reporte del agente pasa a ruta namespaciada `<workDir>/pii-scan-report.json`.
- **Limitación de `extractUrl` documentada** en `compliance-rules.md`: el hook solo reconoce
  `url`/`target`/`base_url`; un rename del schema del MCP degrada el gate a WARN ruidoso, no bloqueo.
- **Test unitario de `audit-log.ts`** (append-only, JSONL, timestamp, campos opcionales).

## [0.3.4] - 2026-07-18

Cierre del hallazgo C1 del saneamiento previo (el namespace viejo se había corregido en los `.md`
pero seguía filtrado en material distribuido no-`.md`).

### Fixed
- **Namespace `/qa-automator:*` residual en el payload distribuido.** 6 fugas fuera de los `.md`:
  comentarios en `src/contract-validator.ts` y en `playwright.config.ts`/`playwright.global-setup.ts`,
  el YAML `examples/05-config/_TEMPLATE.annotated.yaml`, y un **string de error de runtime** en
  `src/gherkin-to-criteria.ts` que el usuario final ve por pantalla. Todas → `/ia4d-qa-automator:*`.
- **Guard de `build:plugin` ampliado.** Escaneaba solo `.md`; ahora `.md/.ts/.yaml/.yml`, para que el
  namespace viejo no pueda reaparecer en comentarios, ejemplos ni strings de runtime.

## [0.3.3] - 2026-07-17

Saneamiento de consistencia previo al hand-off a testers (auditoría interna 2026-07-16:
22 hallazgos — 3 críticos, 5 altos, 8 medios, 6 bajos; informe en `docs/audit/`).

### Fixed
- **Namespace de commands en toda la guía del workspace desplegado.** `CLAUDE.md`, `README.md` y
  los 5 labs enseñaban `/qa-automator:*`; el plugin los publica como `/ia4d-qa-automator:*`.
  39 ocurrencias corregidas + guard en `build:plugin` que falla si reaparece.
- **`healthcheck` delegado al script real.** El command describía el mundo v0.1 (13 subagents en
  `.claude/agents/`, "v0.1.0", check de `hooks/hooks.json`); ahora ejecuta `npm run qa:healthcheck`
  y presenta su salida verbatim (misma filosofía que `config`).
- **`.mcp.json` portable.** `cmd /c npx` (solo-Windows) → `node node_modules/playwright/cli.js
  run-test-mcp-server`: binario real en todas las plataformas, sin shim, pineado al Playwright local.
- **Prompts distribuidos sin referencias a material de construcción.** 8 agentes + 4 commands citaban
  `SPEC.md`/`METODOLOGIA AISD.md`/findings internos que no viajan en el plugin; guard en `build:plugin`.
- **Contradicción sobre Allure Trends resuelta** (single-file no acumula history): `autonomous.md` y
  la guía del template alineados con `report.md`.
- **Stubs S1 sin promesa de versión vencida** ("funcional en v0.3" con v0.3.x ya publicada → "roadmap,
  sin versión comprometida"); el stub redirige a las 3 puertas funcionales S2/S3/S4.
- **SPEC sin drift**: título remite a CHANGELOG, `@happy-path` fuera del listado de tags, Judge "off por
  defecto" en el anexo, riesgo #9 con la dirección real Writer→Reviewer, DoD ≤8 min acotado a su
  contexto histórico (MVP SauceDemo).
- **`hooks/hooks.json` eliminado** (duplicado muerto; el wiring único vive en `.claude/settings.json`).
- **`report.md` deriva `<workDir>`** (`--work-dir` > `QA_WORK_DIR` > único candidato > preguntar);
  defaults namespaceados — antes apuntaban al `.work/` plano y no encontraban los artefactos del run.
- **Higiene**: fichero fantasma de ruta Windows eliminado del repo, `log.log` fuera del index, regla
  forward-slash en los agentes que escriben vía Bash, `.gitattributes` (LF), pre-flight avisa por
  stderr si una tool de navegación llega sin URL extraíble, descripciones de agentes recortadas.

## [0.3.2] - 2026-07-15

Arreglos surgidos de la prueba end-to-end S3 contra SauceDemo (5/5 verde). Dos bugs latentes
pre-existentes (no de la migración) + dos fricciones del flujo `init`.

### Fixed
- **Pérdida silenciosa de feedback del Reviewer.** `consolidate-reviews` descartaba en silencio un
  fichero de feedback con JSON inválido (un `catch` vacío). Ahora registra un placeholder auditable
  (`{ spec, verdict: "unknown", error }`) y avisa ruidoso por stderr — nunca se pierde callado.
- **`ia4d-reviewer` emitía JSON inválido.** Al incluir un regex literal (`/x\.y/`) en el texto del
  feedback, el backslash sin escapar rompía `JSON.parse`. Hard rule nueva: escapar `\`→`\\` y `"`→`\"`.
- **`init` no avisaba de reconectar el MCP.** El MCP `playwright-test` arranca antes de que `init`
  instale Playwright y queda obsoleto (`_currentSuite === null` en el planner). `init` ahora incluye
  un paso explícito: recargar la ventana o `/mcp` reconectar antes de generar.
- **`scaffold` exigía `--force` de más.** Contaba el `.claude/settings.local.json` que crea el propio
  Claude Code al abrir la carpeta. Ahora ignora un `.claude/` solitario en el chequeo de "vacío", así
  `init .` funciona en una carpeta recién abierta sin `--force`.

## [0.3.1] - 2026-07-13

Migración a distribución **híbrida refinada**: el plugin deja de ser un repartidor "vacío" y publica
los agentes y comandos (visibles en el catálogo, namespace único `/ia4d-qa-automator:*`), manteniendo
runtime, hooks, MCP y config en el workspace desplegado.

### Changed
- **Los 12 agentes `ia4d-*` y los 9 comandos ahora los publica el plugin** (declarados en
  `plugin.json`, disponibles globalmente). Antes vivían en el `.claude/` del workspace (project-scoped,
  plugin vacío en el catálogo). Fin de los dos namespaces: todo es `/ia4d-qa-automator:*`.
- Los 3 agentes nativos de Playwright, el runtime `src/`, los hooks, el MCP y `config/` se quedan en
  el workspace (pineados / relativos al cwd) — sin `${CLAUDE_PLUGIN_ROOT}` ni split de dependencias.
- `build-template` deja de copiar agentes ia4d y comandos al workspace; `build-plugin` los inyecta
  desde el repo `.claude/` y genera el inventario `agents[]`/`commands[]` del `plugin.json`.
- Guard de workspace en los comandos de runtime: avisan si se lanzan fuera de un workspace desplegado.
- `qa:healthcheck` adaptado al layout nuevo (workspace = 3 agentes nativos, sin comandos).

### Notas
- Sigue habiendo `init` + workspace: el proyecto Playwright + config por cliente no pueden vivir en el
  plugin (es el entregable, reproducible y auditable por cliente).

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
