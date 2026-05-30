# Style Contract — schema YAML

Documento declarativo del cliente que define convenciones del código de tests generado. El subagent `ia4d-style-enforcer` lo lee y post-procesa al output del Generator nativo.

## Schema

```yaml
version: 1
project: string                     # nombre identificativo del proyecto/cliente

# Estructura POM
pom:
  enabled: boolean                  # default true
  location: string                  # default 'tests/pages'
  class_suffix: string              # default 'Page'

# Estrategia de locators (orden de prioridad)
locators:
  priority:                         # array, primero gana
    - getByTestId
    - getByRole
    - getByLabel
    - getByText
  forbid_css_selectors: boolean     # default true
  forbid_xpath: boolean             # default true

# Naming
naming:
  spec_pattern: string              # default '{feature}.{scenario}.spec.ts'
  test_title_pattern: string        # default '{scenario_human_name}'

# Asserts
asserts:
  semantic_only: boolean            # default true
  forbid_text_equality: boolean     # default true (no assert.equal(text))

# Waits
waits:
  forbid_wait_for_timeout: boolean  # default true
  prefer_locators_assert: boolean   # default true

# Fixtures
fixtures:
  location: string                  # default 'tests/fixtures'
  synthetic_data_only: boolean      # default true

# axe-core obligatorio
a11y:
  inject_axe_check: boolean         # default true (NO opcional en MVP)
  fail_on_violations: boolean       # default true
  severity_threshold:               # default 'serious'
    - minor
    - moderate
    - serious
    - critical

# PII allowlist (datos test publicados por el target, no son PII real)
synthetic_fixtures:
  credentials:
    - { username: string, password: string }
  test_cards:
    - string                        # Visa/Mastercard test cards
  test_iban:
    - string

# Banned APIs (ESLint rules custom)
banned_apis:
  - page.waitForTimeout
  - assert.equal
  - xpath
```

## Ejemplo: `style-contracts/saucedemo.yaml`

(creado en Slice 6)

## Cómo el enforcer aplica

1. Lee el `.spec.ts` recién escrito por el Generator nativo.
2. Parsea AST con TypeScript Compiler API cuando es posible. Regex como fallback.
3. Para cada regla, audita:
   - Reglas con `boolean: true` y violación → reescribe el archivo corregido.
   - Reglas con `boolean: false` → ignora.
4. Si no puede aplicar una regla automáticamente, registra `audit-log` con `result: 'warn'` y deja el archivo como está. El Reviewer lo verá en su pasada.
