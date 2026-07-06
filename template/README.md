# ia4d-qa-automator — workspace de arranque

Genera tests E2E Playwright (POM + accesibilidad + trazabilidad) desde una URL, un Gherkin o
un documento funcional, con un Reviewer independiente que audita antes de exponer el código.

Este workspace ya trae el agente y siete labs reproducibles. La guía de uso completa está en
[`CLAUDE.md`](CLAUDE.md).

## Requisitos

- Node >= 20
- [Claude Code](https://claude.com/claude-code) (CLI o extensión IDE)
- El MCP `playwright-test` (se habilita solo vía `.claude/settings.json`)

> **macOS/Linux**: [`.mcp.json`](.mcp.json) lanza el MCP vía `cmd /c npx` (Windows). En macOS/Linux
> cámbialo a `"command": "npx"` con `"args": ["--no-install", "playwright", "run-test-mcp-server"]`.

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
#    /qa-automator:autonomous --url=https://www.saucedemo.com/ --flows=login,checkout
```

`qa:healthcheck` debe terminar en `Healthcheck OK`. Si falla, te dice qué pieza del runtime
falta.

## Primeros pasos — los labs

Siete labs reproducibles en [`examples/`](examples/), ordenados por dificultad. Hazlos en orden:

1. [`01-saucedemo`](examples/01-saucedemo/) — las tres puertas (S2/S3/S4), e-commerce limpio.
2. [`02-parabank`](examples/02-parabank/) — auth persistente, drift y ambigüedad.
3. [`03-orangehrm`](examples/03-orangehrm/) — autónomo acotado por módulos sobre una SPA con sesión.
4. [`04-todomvc`](examples/04-todomvc/) — reto: lo resuelves tú.
5. [`05-config`](examples/05-config/) — env-vars, Style Contract y el command `config`.
6. [`06-migracion-selenium`](examples/06-migracion-selenium/) — migra una suite Selenium legacy a Playwright con paridad.
7. [`07-incremental`](examples/07-incremental/) — el FD evoluciona; el agente actualiza solo el delta.

Luego, **tu propia web**: añade su URL (entorno no productivo) a `config/allowed-targets.yaml` y
lanza `/qa-automator:autonomous --url=<tu-url> --flows=<tus-módulos>`. ¿Ya tienes una suite Selenium
o UFT? `/qa-automator:migrate` la convierte en una suite Playwright nueva con paridad de cobertura
auditable. ¿Tu spec cambió tras generar? `/qa-automator:incremental` toca solo lo impactado.
Detalle en [`CLAUDE.md`](CLAUDE.md).

## Estructura

```
.claude/          Subagents, commands y settings (cablea hooks + MCP)
src/              Lógica determinística (POM scaffolder, compliance, PII, parser Gherkin, judge)
hooks/            Compliance pre-flight, PII/anti-fixme post-write, audit-write
docs/references/       Contratos y reglas que los agentes leen (compliance, PII, style-contract...)
config/           allowed-targets.yaml — la allowlist de URLs (compliance, sin override)
config/style-contracts/  Convenciones por sitio (saucedemo, parabank, orangehrm — añade el tuyo)
config/criteria-baseline/  Snapshot de criterios por sitio (lo escribe el agente; alimenta el modo incremental)
examples/         Siete labs reproducibles (solo inputs; tú generas los tests)
tests/            Donde el agente escribe los tests (unit/ valida el runtime)
specs/, criteria/ Sitio para tus propios .feature / FD y criterios de referencia
```

## Comandos npm

| Comando | Qué hace |
|---|---|
| `npm run qa:healthcheck` | Verifica integridad del runtime (no gasta tokens ni MCP). |
| `npm test` | Tests unitarios de la lógica determinística del agente. |
| `npm run e2e` | Corre los tests Playwright generados. |
| `npm run build` | `tsc --noEmit` (typecheck). |
| `npm run lint` / `npm run format` | ESLint / Prettier. |
