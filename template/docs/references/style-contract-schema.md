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
  base_page: boolean                # default true. Emite tests/pages/base.page.ts (BasePage con
                                    #   page + goto/waitForReady) y las pages la extienden. false →
                                    #   clases standalone (comportamiento previo).
  components: boolean               # default true. Si el discovery declara components[] (elementos
                                    #   repetidos en ≥2 screens), genera component objects compartidos
                                    #   en tests/components/. false → no se generan.

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
  fail_on_violations: boolean       # default false (gate OFF por defecto, v0.2 design/gates-off-by-default).
                                    #   Gate configurable por-sitio (introducido en Fase C).
                                    #   false → (DEFAULT) modo WARNING: el scan corre igual, las violaciones
                                    #           se registran como test annotations (evidencia auditable),
                                    #           pero NO tumban el test. No es silencio: el dato se captura.
                                    #   true  → reactiva el gate: las violaciones (filtradas por severity)
                                    #           ABORTAN el test.
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

# Política de evidencia visual para el reporte Allure. NO es un gate — no aborta nada.
# Es evidencia de RUN-TIME: /qa-automator:report solo muestra lo que el run capturó.
# El command lee `level` en el Verification step y exporta QA_SCREENSHOT / QA_TRACE
# antes de `npx playwright test`; playwright.config.ts los consume. El nivel `level`
# además guía al ia4d-writer sobre cómo estructurar el .spec.ts (test.step + attachments).
evidence:
  level: string                     # 'minimal' | 'steps' | 'full' — default 'minimal' (sin regresión)
                                    #   minimal → comentarios `// Step N` + screenshot final (según screenshots)
                                    #   steps   → cada acción lógica en `await test.step('desc')` → timeline en Allure
                                    #   full    → steps + screenshot por paso (test.info().attach) + trace 'on'
  screenshots: string               # 'on' | 'only-on-failure' | 'off' — default 'only-on-failure'.
                                    #   Solo aplica a level 'minimal' (captura final). En 'full' el command
                                    #   fuerza screenshots=on + trace=on automáticamente.

# Política de diseño de test ("validar con cabeza"). Semántica, no sintáctica:
# la enforce el ia4d-reviewer (regla MF-9), no el style-enforcer. Bloque OPCIONAL —
# si falta, no se enforce nada nuevo (sin regresión vs specs históricos).
test_design:
  require_business_postcondition: boolean   # default false. true → cada test debe afirmar la
                                            #   post-condición de negocio del flujo (resultado), no
                                            #   solo navegación/URL/visibilidad de chrome. Reviewer MF-9.
  min_functional_asserts: integer           # default 1. Mínimo de asserts funcionales (no-navegación) por test.
  forbid_navigation_only_test: boolean      # default true cuando el bloque existe. Un test cuyo único
                                            #   assert es toHaveURL / nav visible → rechazado por MF-9.
  coverage:                                 # guía de cobertura por naturaleza de escenario
    happy_path: string                      #   'always' (default) — el happy path siempre se cubre
    negative: string                        #   'regression_only' (default) — negativos solo en suite regression
  no_assume_undiscovered_flows: boolean     # default true. No materializar flujos/elementos que no
                                            #   estén en discovery (refuerza la hard rule del Writer).

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

## Ejemplo: `config/style-contracts/saucedemo.yaml`

(creado en Slice 6)

## Cómo el enforcer aplica

1. Lee el `.spec.ts` recién escrito por el Generator nativo.
2. Parsea AST con TypeScript Compiler API cuando es posible. Regex como fallback.
3. Para cada regla, audita:
   - Reglas con `boolean: true` y violación → reescribe el archivo corregido.
   - Reglas con `boolean: false` → ignora.
4. Si no puede aplicar una regla automáticamente, registra `audit-log` con `result: 'warn'` y deja el archivo como está. El Reviewer lo verá en su pasada.
