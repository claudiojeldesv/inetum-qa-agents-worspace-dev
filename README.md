# `ia4d-qa-automator` — repo de construcción (v0.3)

Agente QA del catálogo Inetum `ia4d-*`. Genera tests E2E Playwright TypeScript con marco QA propio
(5 actos), compliance regulado, accesibilidad baked-in y Quality layer Writer+Reviewer+Judge que
materializa "QA es juez independiente".

> **Este es el repo de construcción del agente**, no el workspace que usa el QA. El QA recibe un
> workspace autocontenido (`template/`) o instala el plugin desde el marketplace y corre
> `/ia4d-qa-automator:init`. La guía de uso final vive en [`template/CLAUDE.md`](template/CLAUDE.md).

## Estado

- **S2 (Gherkin), S3 (Spec-refiner) y S4 (Autónomo) funcionales.** S1 (Code-driven) es stub → v0.3.
  OpenAPI (S2) diferido a v0.4.
- **Gates opcionales, off por defecto** (`design/gates-off-by-default`): PII scanner
  (`QA_ENABLE_PII`), Judge (`QA_ENABLE_JUDGE`) y gate de a11y (`fail_on_violations` por sitio). El
  scan de a11y, el compliance pre-flight y la guarda anti-`test.fixme()` siguen siempre activos.
- **Empaquetado como plugin de marketplace** (Modelo A: repartidor + `init`). Ver
  [`plugin-src/README.md`](plugin-src/README.md).

## Estructura de distribución

Dos artefactos **generados** desde el núcleo del repo (no se editan a mano):

| Artefacto | Builder | Qué es |
|---|---|---|
| `template/` | `npm run build:template` | Workspace de arranque autocontenido para el QA (Modelo A). |
| `plugin/` | `npm run build:plugin` | Paquete instalable de marketplace; el payload es `template/`. Gitignored. |

Regla de oro: **el núcleo se edita en el repo (`.claude/`, `src/`, `hooks/`, `config/`,
`docs/references/`) y se propaga con los builders.** No editar los artefactos a mano.

## Desarrollo (sobre este repo)

```sh
npm install
npx playwright install chromium
npm run build              # tsc --noEmit (typecheck)
npm test                   # unit (vitest)
npm run qa:healthcheck     # integridad del runtime (no gasta tokens ni MCP)
```

## Simular la instalación desde el marketplace

```sh
npm run build:plugin
# en Claude Code:
#   /plugin marketplace add <ruta-abs>/plugin
#   /plugin install ia4d-qa-automator
#   /ia4d-qa-automator:init  mi-workspace-qa   (command del plugin; el prefijo es el nombre del plugin)
```

Todos los commands (incluido `init`) los aporta el plugin con el prefijo `/ia4d-qa-automator:*` y
están disponibles globalmente; el workspace desplegado solo aporta el runtime, config y los agentes
nativos de Playwright.

Detalle en [`plugin-src/README.md`](plugin-src/README.md).

## Arquitectura

- **Marco QA propio (5 actos)**: Comprender → Mapear → Estructurar → Materializar → Juzgar.
- **Capa transversal**: compliance pre-flight, PII scanner ES, style-enforcer, a11y injector,
  audit-log.
- **Quality layer**: Writer ⟷ Reviewer (N≤2) → Judge (opcional). Writer↔Reviewer es la única
  excepción documentada a "los subagents no se invocan entre sí"
  ([`docs/references/composition-rules.md`](docs/references/composition-rules.md)).
- **15 subagents** (12 `ia4d-*` en el plugin + 3 nativos Playwright en el workspace), **9 commands**
  `/ia4d-qa-automator:*` (en el plugin), **3 hooks** cableados en el `.claude/settings.json` del workspace.

`ia4d-testing-core` es la herramienta del dev sobre su propio código. `ia4d-qa-automator` es la del
juez QA independiente: misión incompatible, no perspectiva distinta.

## Documentación clave

- [`SPEC.md`](SPEC.md) — definición completa, boundaries, roadmap por versiones.
- [`CLAUDE.md`](CLAUDE.md) — convenciones del proyecto, estado por fase, vocabulario.
- [`CHANGELOG.md`](CHANGELOG.md) — historial de versiones.
- [`template/CLAUDE.md`](template/CLAUDE.md) — guía de uso para el Ingeniero QA (el producto final).
- [`docs/Inetum/Catalogo/ia4d-qa-automator.md`](docs/Inetum/Catalogo/ia4d-qa-automator.md) — ficha
  canónica del catálogo Inetum.
- [`docs/findings/`](docs/findings/) — evidencia de validación por fase (A–F, wild sites, coste).
