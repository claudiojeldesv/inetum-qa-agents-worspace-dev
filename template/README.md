# ia4d-qa-automator — workspace de arranque

Genera tests E2E Playwright (POM + accesibilidad + trazabilidad) desde una URL, un Gherkin o
un documento funcional, con un Reviewer independiente que audita antes de exponer el código.

Este workspace trae el runtime del agente y cinco labs reproducibles. Los agentes `ia4d-*` y los
commands `/ia4d-qa-automator:*` los aporta el **plugin** instalado desde el marketplace; este
workspace aporta el sustrato de ejecución (proyecto Playwright + hooks + config por cliente).
La guía de uso completa está en [`CLAUDE.md`](CLAUDE.md).

## Requisitos

- Node >= 20
- [Claude Code](https://claude.com/claude-code) (CLI o extensión IDE) con el plugin `ia4d-qa-automator` instalado
- El MCP `playwright-test` (declarado en `.mcp.json`; los hooks se cablean en `.claude/settings.json`)

## Quickstart

```bash
# 1. Instala dependencias
npm install
npx playwright install chromium

# 2. Verifica que el runtime del agente está completo
npm run qa:healthcheck

# 3. (Opcional) Copia el .env de ejemplo y ajusta toggles
cp .env.example .env

# 4. Abre el workspace en Claude Code y lanza el primer lab
#    /ia4d-qa-automator:autonomous --url=https://www.saucedemo.com/ --flows=login,checkout
```

`qa:healthcheck` debe terminar en `Healthcheck OK`. Si falla, te dice qué pieza del runtime
falta.

## Primeros pasos — los labs

Cinco labs reproducibles en [`examples/`](examples/), ordenados por dificultad. Hazlos en orden:

1. [`01-saucedemo`](examples/01-saucedemo/) — las tres puertas (S2/S3/S4), e-commerce limpio.
2. [`02-parabank`](examples/02-parabank/) — auth persistente, drift y ambigüedad.
3. [`03-orangehrm`](examples/03-orangehrm/) — autónomo acotado por módulos sobre una SPA con sesión.
4. [`04-todomvc`](examples/04-todomvc/) — reto: lo resuelves tú.
5. [`05-config`](examples/05-config/) — transversal: env-vars, Style Contract y el command `config`.

Luego, **tu propia web**: añade su URL (entorno no productivo) a `config/allowed-targets.yaml` y
lanza `/ia4d-qa-automator:autonomous --url=<tu-url> --flows=<tus-módulos>`. Detalle en [`CLAUDE.md`](CLAUDE.md).

## Estructura

```
.claude/          Agentes nativos de Playwright + settings.json (cablea los hooks).
                  Los agentes ia4d-* y los commands vienen del PLUGIN, no de aquí.
.mcp.json         Declara el server MCP playwright-test
src/              Lógica determinística (POM scaffolder, compliance, PII, parser Gherkin, judge)
src/scripts/      healthcheck, showcase, consolidador de reviews
hooks/            Compliance pre-flight, PII/anti-fixme post-write, audit-write
docs/references/  Contratos y reglas que los agentes leen (compliance, PII, style-contract...)
config/           allowed-targets.yaml — la allowlist de URLs (compliance, sin override)
config/style-contracts/  Convenciones por sitio (saucedemo, parabank, orangehrm — añade el tuyo)
examples/         Cinco labs reproducibles (solo inputs; tú generas los tests)
tests/            Donde el agente escribe los tests (unit/ valida el runtime)
```

## Comandos npm

| Comando | Qué hace |
|---|---|
| `npm run qa:healthcheck` | Verifica integridad del runtime (no gasta tokens ni MCP). |
| `npm test` | Tests unitarios de la lógica determinística del agente. |
| `npm run e2e` | Corre los tests Playwright generados. |
| `npm run build` | `tsc --noEmit` (typecheck). |
| `npm run lint` / `npm run format` | ESLint / Prettier. |
