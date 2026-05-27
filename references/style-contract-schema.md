# `style-contract.yaml` — schema

Declarativo. El SDET (o quien onboard al cliente) escribe el contract una vez. `/test-pilot:generate` lo lee, `ia4d-style-enforcer` lo aplica al `.spec.ts` recién escrito por el Generator nativo. Si no hay contract, el comando aborta — no hay default implícito (preferimos fallar ruidoso a meter convenciones que el cliente no firmó).

Convive con `references/compliance-rules.md` y `references/pii-patterns.md` — el style contract regula **forma** del código, no compliance ni PII (esos siguen rutas propias y no son negociables).

## Campos

```yaml
version: 1
client: <string identificador del cliente, libre>
framework: playwright              # único valor soportado en MVP
language: typescript               # único valor soportado en MVP

pom:
  enabled: true | false
  dir: tests/pages                 # path relativo al repo de tests
  namePattern: "*.page.ts"         # solo informativo en MVP; enforcer no genera POMs, solo valida que existen los referenciados
  classSuffix: "Page"              # informativo

naming:
  specFilePattern: "<feature>.<scenario>.spec.ts"     # informativo
  testTitlePattern: free                              # free | gherkin (solo "free" en MVP)

locators:
  priority:
    - getByRole
    - getByTestId
    - getByLabel
    - getByText
  banned:
    - rawCss                       # any page.locator('css=...') o page.locator('.foo .bar')
    - xpath                        # any page.locator('//...') o page.locator('xpath=...')

bannedApis:
  - page.waitForTimeout            # waits no semánticos
  - page.pause                     # debug residual

a11y:
  enabled: true                    # axe-core baked-in (SPEC §6, no opcional para MVP)
  wcagLevel: "wcag21aa"
  injectorImport: "@axe-core/playwright"

requiredImports:
  - module: "@axe-core/playwright"
    named: ["AxeBuilder"]

jsdoc:
  citeCriterion: true              # cada test debe citar RF-NNN/FREE-NNN/GAP-NNN en JSDoc
```

## Reglas duras (cómo se evalúan)

| Regla | Severidad | Cómo se detecta |
|---|---|---|
| `bannedApis` presente en código | **block** | regex sobre el texto del spec |
| `locators.banned.rawCss` (selectores `'.foo'`, `'#bar'`, `'css=...'` dentro de `page.locator(...)` o `locator(...)`) | **block** | regex sobre llamadas a `locator(` |
| `locators.banned.xpath` (`'//...'`, `'xpath=...'`) | **block** | regex sobre llamadas a `locator(` |
| `a11y.enabled: true` pero no hay `AxeBuilder` en el spec | **block** (queda para `ia4d-a11y-injector`, no para enforcer) | parse AST (ts-morph): busca import `AxeBuilder` |
| `requiredImports[].named` no presente como import en el spec | **block** | parse AST (ts-morph): inspecciona ImportDeclarations |
| `jsdoc.citeCriterion: true` y un `test(...)` sin JSDoc citando `RF-NNN`/`FREE-NNN`/`GAP-NNN` | **warn** | regex sobre los bloques previos a `test(` |
| `pom.enabled: true` y el spec instancia `new ... Page(page)` pero el archivo `tests/pages/...page.ts` no existe | **warn** (no block) | filesystem check tras AST extract |

**Severidad block** → exit 2 del CLI (`hooks/style-enforce.ts`), el subagent expone VERDICT: BLOCK y el command aborta.
**Severidad warn** → exit 0, el subagent expone VERDICT: PASS WITH WARNINGS y enumera los warnings.

## Modo `--fix`

`hooks/style-enforce.ts --fix` aplica transformaciones automáticas cuando son seguras:

- Insertar imports requeridos faltantes.
- Eliminar líneas `page.waitForTimeout(...)` (las reemplaza por comentario `// [enforcer] waitForTimeout eliminado — usa wait semántico`).
- Eliminar `page.pause()`.

NO arregla automáticamente:
- Locators raw CSS / XPath (requiere semantic intent del SDET).
- Falta de JSDoc citando criterio.
- POM ausente.

Lo no-fixable queda como block del verify final.

## Output JSON del CLI

```json
{
  "pass": true | false,
  "specFile": "<path>",
  "contractFile": "<path>",
  "violations": [
    {
      "rule": "BANNED_API" | "RAW_CSS_LOCATOR" | "XPATH_LOCATOR" | "MISSING_IMPORT" | "MISSING_JSDOC_CRITERION" | "POM_REFERENCED_NOT_FOUND",
      "severity": "block" | "warn",
      "line": <int>,
      "column": <int>,
      "detail": "<texto breve>"
    }
  ],
  "fixesApplied": [
    {
      "rule": "BANNED_API" | "MISSING_IMPORT",
      "line": <int>,
      "detail": "<qué se hizo>"
    }
  ]
}
```

- `pass: true` si tras los `--fix` no quedan violations de severidad `block`. Warnings son compatibles con `pass: true`.
- `fixesApplied` vacío si no se invocó `--fix`.

## Ejemplo mínimo

```yaml
version: 1
client: saucedemo-demo
framework: playwright
language: typescript

pom:
  enabled: true
  dir: tests/pages
  namePattern: "*.page.ts"
  classSuffix: "Page"

naming:
  specFilePattern: "<feature>.<scenario>.spec.ts"
  testTitlePattern: free

locators:
  priority: [getByRole, getByTestId, getByLabel, getByText]
  banned: [rawCss, xpath]

bannedApis:
  - page.waitForTimeout
  - page.pause

a11y:
  enabled: true
  wcagLevel: wcag21aa
  injectorImport: "@axe-core/playwright"

requiredImports:
  - module: "@axe-core/playwright"
    named: ["AxeBuilder"]

jsdoc:
  citeCriterion: true
```

## Lo que el schema NO cubre

- Generación de POMs nuevos (responsabilidad del SDET, no del enforcer).
- Reglas de Gherkin / BDD (el agente no produce features `.feature`).
- Coverage thresholds (no son del style contract).
- Reglas de naming en TS general (eslint/prettier ya cubren).
- Configuración Playwright (`playwright.config.ts` no se toca desde aquí).

## Cross-reference

- SPEC §4 "Code style — para los tests generados" — defaults declarados aquí.
- SPEC §6 "Always do — axe-core obligatorio" — `a11y.enabled: true` no negociable.
- `references/pii-patterns.md` — escaneo PII vive aparte, no es parte del style contract.
- `hooks/style-enforce.ts` — implementación CLI.
- `.claude/agents/ia4d-style-enforcer.md` — subagent que invoca el CLI.
