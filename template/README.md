# ia4d-qa-automator — workspace de arranque

Genera tests E2E Playwright (POM + accesibilidad + trazabilidad) desde una URL, un Gherkin o
un documento funcional, con un Reviewer independiente que audita antes de exponer el código.

Este workspace ya trae el agente y dos ejemplos. La guía de uso completa está en
[`CLAUDE.md`](CLAUDE.md).

## Requisitos

- Node >= 20
- [Claude Code](https://claude.com/claude-code) (CLI o extensión IDE)
- El MCP `playwright-test` (se habilita solo vía `.claude/settings.json`)

## Quickstart

```bash
# 1. Instala dependencias
npm install
npx playwright install chromium

# 2. Verifica que el runtime del agente está completo
npm run qa:healthcheck

# 3. (Opcional) Copia el .env de ejemplo y ajusta toggles
cp .env.example .env

# 4. Abre el workspace en Claude Code y lanza el primer ejemplo
#    /qa-automator:autonomous --url=https://www.saucedemo.com/
```

`qa:healthcheck` debe terminar en `Healthcheck OK`. Si falla, te dice qué pieza del runtime
falta.

## Primeros pasos

1. **El "hola mundo"**: [`examples/saucedemo/`](examples/saucedemo/) — modo S4, solo URL.
2. **El alcance completo**: [`examples/parabank/`](examples/parabank/) — modos S2/S3/S4 con
   auth, estado y detección de drift.
3. **Tu propia web**: añade su URL (entorno no productivo) a `config/allowed-targets.yaml` y
   lanza `/qa-automator:autonomous --url=<tu-url>`. Detalle en [`CLAUDE.md`](CLAUDE.md).

## Estructura

```
.claude/          Subagents, commands y settings (cablea hooks + MCP)
src/              Lógica determinística (POM scaffolder, compliance, PII, parser Gherkin, judge)
hooks/            Compliance pre-flight, PII/anti-fixme post-write, audit-write
docs/references/       Contratos y reglas que los agentes leen (compliance, PII, style-contract...)
config/           allowed-targets.yaml — la allowlist de URLs (compliance, sin override)
config/style-contracts/  Convenciones por sitio (saucedemo, parabank — añade el tuyo)
examples/         Inputs listos para practicar (solo inputs; tú generas los tests)
tests/            Donde el agente escribe los tests (unit/ valida el runtime)
scripts/          healthcheck.ts
```

## Comandos npm

| Comando | Qué hace |
|---|---|
| `npm run qa:healthcheck` | Verifica integridad del runtime (no gasta tokens ni MCP). |
| `npm test` | Tests unitarios de la lógica determinística del agente. |
| `npm run e2e` | Corre los tests Playwright generados. |
| `npm run build` | `tsc --noEmit` (typecheck). |
| `npm run lint` / `npm run format` | ESLint / Prettier. |
