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

# Naming (estándar v0.2 design/gates-off-by-default — español, naturaleza fuera del nombre)
naming:
  language: string                  # default 'es'. Idioma de los identificadores legibles
                                    #   (feature, condición, título). 'es' → traduce anglicismos
                                    #   técnicos vía glosario (ver ia4d-discovery-analyzer).
  spec_pattern: string              # default '{id}_{feature}.{condicion}.spec.ts'
                                    #   - {id}: ID ESTABLE del caso (key del gestor de pruebas o
                                    #     TC-NNN persistido — ver tc_registry abajo). Prefijo + '_'.
                                    #   - {feature}: flujo en kebab-case español sin tildes/ñ (ej. 'pago').
                                    #   - {condicion}: condición que se prueba, NO la naturaleza
                                    #     (ej. 'tarjeta-valida', 'usuario-bloqueado'). NUNCA 'happy-path'
                                    #     en el nombre — la naturaleza vive en el tag.
                                    #   Ej.: 'MAPFRE-T1234_pago.tarjeta-valida.spec.ts'.
  test_title_pattern: string        # default '{condicion} → {resultado}'. Título legible en español
                                    #   que se lee en Allure. Ej. 'compra con tarjeta válida → muestra
                                    #   confirmación de pedido'. La naturaleza NO va en el título.

# Registro de IDs estables de caso (v0.2). Resuelve el prefijo {id} del nombre de archivo.
# Un ID efímero por-run (rank) NO sirve en un nombre permanente: renombraría archivos entre
# runs. Por eso el ID se persiste en un registro versionado, por sitio.
tc_registry:
  enabled: boolean                  # default true. false → sin prefijo de ID (archivo = feature.condicion).
  path: string                      # default 'config/tc-registry/<site-id>.json'. Mapea el slug estable
                                    #   '<feature>.<condicion>' → { id, source, nature, screens, aliases }.
                                    #   Versionado, auditable. El formato plano legacy (slug → "TC-NNN")
                                    #   se tolera al leer y migra al primer write.
  id_prefix: string                 # default 'TC'. Prefijo del ID que ASIGNA el agente cuando no hay key
                                    #   de gestor (TC-001, TC-002…). Secuencial estable, NO por rank.
  # Entrada del registro (v2, quality-greens Q4):
  #   id      → key del gestor de pruebas o TC-NNN del agente.
  #   source  → 'xray' (key del gestor, lo rellena el QA; el agente NUNCA lo inventa) |
  #             'agent' (TC-NNN asignado y persistido por el agente).
  #   nature / screens → metadata del último run que seleccionó el caso; alimenta la reconciliación.
  #   aliases → slugs históricos del MISMO caso (el drift de naming oscila entre runs).
  # Resolución por escenario en cada run (checkpoint):
  #   1. slug ya en el registro (key o alias) → reusa su id.
  #   2. slug nuevo → RECONCILIACIÓN conservadora contra los slugs registrados ausentes del catálogo
  #      actual: mismo feature + misma naturaleza + misma pantalla de destino (los campos que una
  #      entrada legacy no tiene no filtran). EXACTAMENTE UN candidato → mismo caso renombrado por
  #      drift del discovery: reusa el id, re-keyea la entrada al slug actual y el viejo pasa a
  #      aliases. 0 o >1 candidatos → id nuevo (el empate se reporta, nunca se adivina).
  #   3. resto → siguiente TC-NNN libre, source:'agent'.

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

# Sanación (Healer nativo) como post-proceso — patrón regla #10: off por defecto, reactivable
# (v0.3 quality-greens Q3). El Healer NO es juez: su output se audita con el protocolo post-heal
# (suite re-ejecutada + pre-review + Reviewer sobre los specs afectados + verify-a11y), validado
# en Q1 (3/3 sanados, μ $0,72/spec, 1 fix en POM compartido cura N specs).
healing:
  enabled: boolean                  # default false → el run de `autonomous` reporta los rojos y
                                    #   termina (el QA decide: /ia4d-qa-automator:heal o ajuste manual).
                                    #   true → `autonomous` encadena la sanación tras el Verification
                                    #   step sobre los rojos, con el mismo protocolo post-heal.
                                    #   El command /ia4d-qa-automator:heal es independiente del knob:
                                    #   se puede lanzar siempre, re-ejecutable, sobre el último run.

# Sincronización del dom-walker (kernel v2 K0.13). Home del CLIENT PACK para las señales
# de "ocupado" de la familia de stack: aquí es donde se declara que el spinner de estas
# aplicaciones es `.blockUI` o `div[id$=":status"]`, y qué subárboles repintan por polling.
# Bloque OPCIONAL: sin él manda el default del kernel (400 ms de quietud, heurísticas).
#
# Por qué una VENTANA y no "el spinner ya no está": en una SPA que abre el spinner 2 o 3
# veces por carga, el hueco entre ciclos es una calma FALSA, y actuar dentro de él es el
# fallo intermitente clásico (el clic ocurre y no sirve de nada). Se exige quietud
# CONTINUADA. Agotar el tope NO es un fallo: se anota y sigue — el veredicto lo da la
# postcondición del paso (`expect_after` en el walk-script), no el reloj.
settle:
  quiet_ms: number                  # default 400 — ms consecutivos de quietud exigidos. Puentea
                                    #   huecos entre ciclos MÁS CORTOS que este valor; los más
                                    #   largos los caza la postcondición, no esta capa.
  timeout_ms: number                # default 10000 — tope de espera. Se RECALIBRA por paso con el
                                    #   p95 observado en runs anteriores (config/timing-profiles/
                                    #   <site_id>.json), salvo que el paso declare el suyo.
  max_mutations: number             # default 2 — mutaciones toleradas DENTRO de la ventana. Es un
                                    #   umbral de TASA: un ciclo de spinner produce decenas, un reloj
                                    #   de polling una. Por eso una app que repinta un contador no
                                    #   cuelga el walk para siempre.
  busy_selectors: string[]          # señales del sitio, ACUMULADAS sobre las heurísticas del kernel
                                    #   ([aria-busy=true], [role=progressbar], .spinner, .loading,
                                    #   .blockUI, [class*=cargando]...). No las sustituye: perder una
                                    #   por descuido cuesta flakiness.
  ignore_selectors: string[]        # subárboles cuyas mutaciones no cuentan (relojes de sesión,
                                    #   contadores de notificaciones, chats embebidos).

# Política de evidencia visual para el reporte Allure. NO es un gate — no aborta nada.
# Es evidencia de RUN-TIME: /ia4d-qa-automator:report solo muestra lo que el run capturó.
# El command lee `level` en el Verification step y exporta QA_SCREENSHOT / QA_TRACE
# antes de `npx playwright test`; playwright.config.ts los consume. El nivel `level`
# además guía al ia4d-writer sobre cómo estructurar el .spec.ts (test.step + attachments).
evidence:
  level: string                     # 'minimal' | 'steps' | 'full' — default 'steps' (spec-template.md:
                                    #   el step estructura Allure y el error dice en qué paso de NEGOCIO rompió)
                                    #   minimal → opt-out austero: comentarios `// Paso N:` + screenshot final
                                    #   steps   → cada acción lógica en `await test.step('Dado/Cuando/Entonces: ...')`
                                    #   full    → steps + screenshot por paso (test.info().attach) + trace 'on'
                                    #   Es también un KNOB DE COSTE: 'full' genera specs más largos
                                    #   (test.step + attach por paso) y el output del Writer se paga
                                    #   por spec. 'full' = vitrina/demo; para contracts de cliente,
                                    #   'steps' (default) o 'minimal'.
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
  coverage:                                 # cobertura por flujo (v0.2). El FLUJO PRINCIPAL de cada flujo
                                            #   descubierto se genera SIEMPRE (implícito, no se declara).
                                            #   Aquí solo se declara qué flujos generan ADEMÁS negativos.
    negatives_by_flow:                      #   mapa <slug-flujo>: bool. default {} → ningún flujo genera
      # inicio-sesion: true                 #   negativos en S4 (opt-in). El command acepta override
      # pago: false                         #   --negatives=<flujo1,flujo2>. En S2/S3 la naturaleza la dan
                                            #   los criterios RF; este bloque no fuerza nada extra.
  no_assume_undiscovered_flows: boolean     # default true. No materializar flujos/elementos que no
                                            #   estén en discovery (refuerza la hard rule del Writer).

# NOTA — criticidad y naming de dominio (v0.2, inferido puro): NO hay bloque de keywords ni glosario
# de sector en el contract. En S4 el `ia4d-discovery-analyzer` INFIERE el dominio del sitio (banca,
# seguros, e-commerce, sede electrónica, salud…) y marca como críticos los flujos centrales a ese
# propósito; la autenticación es siempre crítica (transversal). El naming español también se infiere
# (semilla transversal auth + inferencia por dominio). En S2/S3 la criticidad la dan los criterios RF.

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
