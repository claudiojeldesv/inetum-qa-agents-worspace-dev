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
  # Excepción acotada para sitios legacy sin semántica (v0.2 Fase C, hallazgo parabank #9).
  # Cuando forbid_css_selectors:true pero NINGÚN locator de `priority` resuelve un
  # elemento (JSP viejo sin label/aria/data-test), se permite caer a un selector de
  # ATRIBUTO limitado a esta whitelist — p.ej. page.locator('[name="username"]') o '#id'.
  # NUNCA CSS arbitrario: sin clases (.foo), sin descendientes (div > span), sin tag+class.
  # Cada uso se taggea en el spec (// css-fallback: no semantic locator) y se registra
  # al audit-log. Es declarativa y determinística: el contract autoriza, el enforcer
  # aplica solo si no hay alternativa semántica. No es criterio del LLM.
  css_fallback_attributes:          # default [] (sin excepción — forbid estricto)
    - name
    - id

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
  inject_axe_check: boolean         # default true (NO opcional en MVP — el scan SIEMPRE corre)
  fail_on_violations: boolean       # default true. Gate configurable por-sitio (v0.2 Fase C).
                                    #   true  → las violaciones (filtradas por severity) ABORTAN el test.
                                    #   false → modo WARNING: el scan corre igual, las violaciones se
                                    #           registran como test annotations (evidencia auditable),
                                    #           pero NO tumban el test. No es silencio: el dato se captura.
  severity_threshold:               # default ['serious','critical']. Solo estas severidades cuentan
    - serious                       #   (tanto para fallar con fail_on_violations:true como para anotar
    - critical                      #    con fail_on_violations:false).

# Autenticación con sesión persistente (v0.2 Fase C, hallazgo parabank #10).
# Cuando enabled:true, el command genera un setup project que loguea UNA vez, guarda
# storageState, y los specs lo reutilizan vía `dependencies` — robusto bajo fullyParallel
# (sustituye al frágil --workers=1 + orden alfabético del run manual de parabank).
# ACOTADO a login form-based (usuario/contraseña). SAML / OAuth / MFA / TOTP NO soportados
# en esta versión: no observados en Fase B (n=1). Entran cuando la evidencia lo justifique.
auth:
  enabled: boolean                  # default false → sin auth, sin setup project (comportamiento actual)
  login_path: string                # ruta del form de login (ej. '/parabank/index.htm')
  storage_state: string             # default 'playwright/.auth/<project>.json'
  credentials_ref: integer          # índice en synthetic_fixtures.credentials (default 0). NO credenciales inline.
  success_signal:                   # cómo el setup verifica que el login funcionó antes de guardar estado
    type: string                    #   'url' (patrón de URL post-login) | 'locator' (elemento solo visible autenticado)
    value: string                   #   ej. '**/overview.htm'  o  "getByRole('link', { name: 'Log Out' })"

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
