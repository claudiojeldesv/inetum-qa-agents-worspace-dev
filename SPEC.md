# SPEC — `ia4d-test-pilot` v0.1 (MVP)

> Documento spec del primer agente de la categoría QA del catálogo `ia4d-*`. Alcance: solo `ia4d-test-pilot`. Los demás agentes propuestos (`test-explorer`, `test-healer`, etc.) tienen specs propios cuando lleguen.

## 1. Objective

`ia4d-test-pilot` es un agente Claude Code que genera tests E2E en Playwright TypeScript a partir de una app desplegada accesible vía URL, aplicando convenciones declaradas por el SDET, gates de compliance y verificación de accesibilidad, sin que el SDET haya escrito código previo.

El agente envuelve los Playwright Test Agents nativos (Planner + Generator de v1.56+) vía MCP y añade:
- enforcement de un Style Contract declarativo del proyecto cliente,
- pre-flight de compliance que bloquea targets/datos no declarados como sintéticos,
- post-procesamiento que escanea PII en el output,
- inyección automática de assertions axe-core (WCAG 2.1 AA),
- revisión por LLM-as-judge previa al SDET, con confidence scoring,
- audit log estructurado JSON append-only,
- export del catálogo de casos a JSON genérico (Test Management connector queda fuera del MVP).

### Target users

| Rol | Tipo | Cómo lo usa |
|---|---|---|
| SDET (consumidor primario) | Usuario directo | Invoca commands del agente, revisa output, refina seed si hace falta |
| QA Manager (decisor cliente) | Usuario indirecto | Ve la demo, valida fit con su práctica QA, decide piloto |
| I+D Inetum (decisor catálogo) | Usuario indirecto | Evalúa cumplimiento del patrón canónico para admisión a la pestaña Documentación y Calidad |

### Definition of Done del MVP

Demo grabada de 30 minutos donde un SDET sin contexto previo del proyecto:

1. Lanza el agente contra `https://www.saucedemo.com/`
2. El Planner descubre la app autónomamente y propone un seed candidato
3. SDET marca el seed como anchor
4. Agente genera ≥10 tests Playwright TS materializados, con axe-core baked-in, siguiendo el Style Contract declarado
5. Compliance pre-flight pasa, PII detector pasa
6. LLM-as-judge clasifica los tests por confianza
7. Audit log JSON generado
8. Catálogo de casos exportado como JSON
9. Suite Playwright corre verde en local

No incluye admisión formal al catálogo Inetum ni piloto con cliente real. Eso es post-MVP.

### Non-goals MVP

- Integración formal con `ia4d-functional-design-expert` / `ia4d-technical-design-expert` (entra FD/plan en markdown libre).
- Connectors a Xray, Zephyr, TestRail (solo JSON genérico).
- Knowledge graph SQLite con traceability persistida (deferido a v0.2).
- REST Assured Java / API tests / mobile.
- Modo whitebox (asume greybox: agente no lee código fuente del producto).
- `test-explorer` / `test-healer` Inetum (otros agentes futuros — el Healer nativo de Playwright SÍ se usa en la operación general; lo que es non-goal es nuestro agente Inetum dedicado a healing).
- Branch + PR automation en repos existentes.
- Reimplementación de exploración / generación / healing — se delega en `playwright-test-planner`, `playwright-test-generator`, `playwright-test-healer` (subagents nativos de Playwright v1.56+ instalados vía `npx playwright init-agents --loop=claude`). Nuestros subagents `ia4d-*` los rodean, no los sustituyen.

## 2. Commands

El proyecto expone seis slash commands bajo el namespace `/test-pilot:*`. Cada command es un orquestador: encadena subagents nativos de Playwright (Planner, Generator, Healer) con subagents nuestros (`ia4d-*`) vía invocaciones explícitas con la Task tool y handoffs por archivos. **Ningún subagent invoca a otro subagent directamente** — la orquestación vive exclusivamente en los commands (alineado con patrón canónico Microsoft + agent-skills).

| Comando | Responsabilidad | Subagents implicados (en orden) | Output |
|---|---|---|---|
| `/test-pilot:discover` | Compliance gate + invoca Planner contra URL. Produce mapa de pantallas + candidatos de seed/happy path | `ia4d-compliance-checker` → `playwright-test-planner` | Plan markdown del Planner + `discovery-report.md` |
| `/test-pilot:plan` | Toma un FD en markdown libre y, opcionalmente, el plan del Planner. Produce plan enriquecido por criterio del FD | `ia4d-fd-to-plan` | `test-plan.md` estructurado por criterio |
| `/test-pilot:generate` | Invoca Generator. Post-procesa con style enforce + a11y + PII + judge | `playwright-test-generator` → `ia4d-style-enforcer` → `ia4d-a11y-injector` → `ia4d-pii-scanner` → `ia4d-judge` | N x `*.spec.ts` + `judge-report.json` |
| `/test-pilot:audit` | Compliance pre-flight + PII scan standalone sobre un directorio dado | `ia4d-compliance-checker` + `ia4d-pii-scanner` | `audit-log.json` (append) + verdict pass/fail |
| `/test-pilot:export` | Serializa el catálogo de casos a JSON genérico | `ia4d-exporter` | `test-catalog.json` |
| `/test-pilot:full-loop` | Encadena discover → plan → generate → audit → export | Todos | Todos los anteriores |

**Convención de handoff**: cada subagent escribe su output en una ruta predecible (declarada en su prompt) que el siguiente subagent lee. Cero acoplamiento por código — solo por contratos de archivo.

## 3. Project structure

Arquitectura peer: nuestros subagents `ia4d-*` viven en `.claude/agents/` al mismo nivel que los nativos de Playwright. La orquestación está en `.claude/commands/test-pilot/`. Cero acoplamiento a internals de Microsoft — todo handoff es por archivos.

```
/
├── CLAUDE.md                                # convenciones del proyecto (eager-load)
├── SPEC.md                                  # este documento
├── README.md                                # entrada humana
├── .claude/
│   ├── agents/
│   │   ├── playwright-test-planner.md       # nativo (Microsoft) — viene de init-agents
│   │   ├── playwright-test-generator.md     # nativo (Microsoft)
│   │   ├── playwright-test-healer.md        # nativo (Microsoft)
│   │   ├── ia4d-fd-to-plan.md               # nuestro: enriquece plan con criterios del FD
│   │   ├── ia4d-style-enforcer.md           # nuestro: reformatea .spec.ts al Style Contract
│   │   ├── ia4d-a11y-injector.md            # nuestro: inyecta axe-core en cada test
│   │   ├── ia4d-compliance-checker.md       # nuestro: gate URL/seed/credenciales
│   │   ├── ia4d-pii-scanner.md              # nuestro: escanea PII en .spec.ts
│   │   ├── ia4d-judge.md                    # nuestro: LLM-as-judge sobre calidad del código
│   │   └── ia4d-exporter.md                 # nuestro: produce JSON catalog
│   └── commands/
│       └── test-pilot/
│           ├── discover.md                  # orquesta compliance + planner
│           ├── plan.md                      # invoca fd-to-plan
│           ├── generate.md                  # orquesta generator + post-procesos
│           ├── audit.md                     # invoca compliance + pii-scanner
│           ├── export.md                    # invoca exporter
│           └── full-loop.md                 # encadena todos
├── hooks/
│   ├── pre-flight.ts                        # PreToolUse: compliance gate transversal
│   ├── pii-post.ts                          # PostToolUse: PII scan tras escritura
│   └── audit-write.ts                       # append-only JSON audit log
│                                            # NOTA: el registro de hooks vive en .claude/settings.json
│                                            # (Claude Code no soporta include externo). Ver anexo "Decisiones técnicas".
├── config/
│   └── allowed-targets.yaml                 # patrones URL permitidos + modo
├── style-contracts/
│   └── saucedemo.yaml                       # Style Contract para el demo
├── references/
│   ├── compliance-rules.md                  # qué bloquea pre-flight
│   ├── pii-patterns.md                      # regex + Luhn (DNI/IBAN/cards/email/teléfono ES)
│   ├── rationalizations.md                  # Common Rationalizations catalog (compartido por skills)
│   ├── style-contract-schema.md             # schema YAML del Style Contract
│   ├── audit-log-schema.md                  # schema JSON del audit log
│   └── integration-patterns.md              # cómo nuestros subagents se integran con los nativos
├── demo/
│   ├── saucedemo/
│   │   ├── fd.md                            # FD manual para el demo
│   │   ├── style-contract.yaml
│   │   ├── seed.spec.ts                     # seed inicial (o producido por Planner)
│   │   ├── HOW-TO-REPRODUCE.md
│   │   ├── script.md                        # guion del demo
│   │   └── expected-output/                 # baseline para verificar
│   └── recordings/                          # vídeos del demo
└── tests/                                   # tests del PROPIO agente (no del output)
    ├── unit/
    │   ├── pii-detector.test.ts
    │   ├── style-enforcer.test.ts
    │   └── compliance-preflight.test.ts
    └── integration/
        └── full-loop-saucedemo.test.ts
```

**Nota sobre `.claude/agents/`**: el directorio mezcla deliberadamente subagents nativos de Microsoft con los nuestros. No los aislamos en subcarpetas porque el formato Claude Code los descubre todos planos. La convención `ia4d-*` los distingue visualmente.

## 4. Code style

### Para el código del agente

- **TypeScript** estricto (`tsconfig.json` con `strict: true`).
- **Node** 20 LTS mínimo.
- **Formatter**: Prettier con config por defecto. Sin discusiones.
- **Linter**: ESLint con `@typescript-eslint/recommended` + `eslint-plugin-import` para orden.
- **Naming**:
  - Archivos: `kebab-case.ts`
  - Símbolos: `camelCase` para variables/funciones, `PascalCase` para clases/types/interfaces.
  - Skills/agents/commands: `kebab-case` consistente con agent-skills.
- **Comentarios**: solo cuando el *por qué* no es obvio (convención global del proyecto, no de este SPEC).
- **Imports**: orden estándar — node builtins, deps externas, internas relativas, separados por línea en blanco.

### Para los tests generados por el agente (output al SDET)

Definido por el `style-contract.yaml` del cliente. El MVP incluye `style-contracts/saucedemo.yaml` con estos defaults:

- POM en `tests/pages/<feature>.page.ts` con clase `*Page`.
- Locators con prioridad: `getByRole` > `getByTestId` > `getByLabel` > `getByText`. Nunca CSS bruto sin justificación.
- Fixtures Playwright en `tests/fixtures/`.
- Naming de specs: `<feature>.<scenario>.spec.ts`.
- Asserts: usar `expect(locator).toX()` semánticos, nunca `assert.equal(text)`.
- axe-core injection: cada `test()` incluye `expect(await new AxeBuilder({ page }).analyze()).toHaveNoViolations()` antes del flujo.
- Sin `page.waitForTimeout()`. Solo waits semánticos.

## 5. Testing strategy

### Tests del propio agente (cómo verificamos que funciona)

**Unit tests** (Vitest):
- `pii-detector`: regex DNI español, IBAN (mod 97), tarjetas (Luhn), emails de dominios reales. Casos positivos y negativos.
- `style-enforcer`: input `.spec.ts` violando reglas → output corregido. Reglas: locator strategy, naming, banned APIs.
- `compliance-preflight`: matriz de combinaciones (URL prod / staging / test, credenciales sintéticas / reales, modo declarado) → verdict bloqueo / pass.
- `llm-judge`: prompt template + mocks de respuesta LLM → score normalizado 0-1.

**Integration tests**:
- `full-loop-saucedemo`: levanta el agente con `demo/saucedemo/`, ejecuta `/full-loop`, verifica que produce ≥10 tests + audit log + JSON catalog. No requiere LLM real (mockeado).

**E2E (gate del Definition of Done)**:
- Reproducción del demo de 30 minutos contra `saucedemo.com`. Suite Playwright generada corre verde. Audit log y JSON catalog presentes.
- Sin coverage threshold formal en MVP — gate es "demo reproducible".

### Tests generados por el agente (output al SDET)

- Cada `.spec.ts` incluye axe-core check obligatorio.
- Cada test cubre exactamente un criterio del FD (cita el criterio en JSDoc).
- Tests independientes (cero estado compartido entre `test()` blocks).
- Cleanup en `afterEach` cuando crean estado.
- Selectores semánticos (ver Code style).

## 6. Boundaries

Tres listas claras: lo que el agente hace siempre, lo que pregunta antes de hacer, lo que no hace jamás.

### Always do

- Ejecutar el hook PreToolUse `pre-flight.ts` antes de cualquier invocación a Playwright Planner o Generator.
- Ejecutar el hook PostToolUse `pii-post.ts` sobre cada `.spec.ts` generado.
- Escribir entrada al audit log JSON por cada: llamada LLM, archivo modificado, decisión del judge, ejecución de hook.
- Aplicar el Style Contract declarado en `style-contract.yaml`. Si no hay contrato, usar el default explícito del agente y dejarlo loggeado.
- Inyectar `axe-core` check en cada test generado. No opcional.
- Verificar que cada test generado corre verde localmente antes de marcarlo "materializado".
- Citar el criterio fuente del FD (RF-ID o texto) en el JSDoc de cada test.
- Generar `judge-report.json` con score y razonamiento por cada test antes de exponerlo al SDET.
- Operar en modo greybox: nunca leer archivos fuera del repo del SDET ni del directorio del agente.

### Ask first

- Modificar tests existentes en el repo destino (caso clean-slate de MVP esto debería ser raro, pero el guardrail aplica).
- Targetear una URL que no esté en la lista declarada `allowed-targets` del config.
- Generar tests sin FD/plan estructurado (apoyándose solo en la exploración del Planner).
- Sobreescribir cualquier archivo en `tests/` del repo destino.
- Continuar cuando el LLM-as-judge clasifica >30% de los tests con score <0.5 (señal de bajo quality batch).
- Continuar cuando el compliance pre-flight devuelve warnings (pasa pero alerta).
- Exportar el catálogo si algún test no ha corrido verde localmente.

### Never do

- Ejecutar el agente contra URLs que coincidan con patrones declarados como `production` en config. Lista mínima inicial: cualquier URL sin prefijo `qa.`, `test.`, `int.`, `staging.`, `dev.`, `localhost`, o `*.saucedemo.com` durante el demo.
- Usar PII real como dato de prueba. Si el PII detector encuentra coincidencia en seed o test, abort con error.
- Saltarse el compliance pre-flight gate por cualquier motivo. No hay flag de override.
- Saltarse el PII detector. No hay flag de override.
- Commit auto-generado a `main` o branches protegidas. El agente no tiene credenciales de git push en MVP.
- Desactivar inyección de `axe-core` en builds del demo.
- Procesar artefactos (FD, seed, datos) de entornos declarados como `prod` o `pre-prod` en config.
- **Invocación cruzada entre subagents**. Ningún subagent (nativo o `ia4d-*`) llama a otro directamente. La orquestación vive exclusivamente en los commands `/test-pilot:*`. Si un subagent necesita output de otro, lo lee del archivo de handoff documentado en su prompt.
- Generar tests sin entrada explícita del SDET a un `/test-pilot:discover` previo. El agente nunca arranca generación autónoma.
- **Permitir que `playwright-test-healer` marque tests con `test.fixme()` sin aprobación humana explícita**. En banca regulada el silenciamiento de un test es decisión documentada y firmada, no automática. El hook `pii-post.ts` (o equivalente) debe interceptar Edits del Healer que introduzcan `test.fixme()` y bloquear con error pidiendo intervención SDET.

---

## Anexo: Decisiones cerradas en entrevista

| Pregunta | Respuesta |
|---|---|
| Scope SPEC | Solo `ia4d-test-pilot` |
| Target app demo | SauceDemo (saucedemo.com) |
| DoD MVP | Demo grabada 30 min funcionando end-to-end |
| Integración FDS/TD | FD manual en markdown libre. No dependencia con `ia4d-functional-design-expert` en MVP |
| Estrategia anchor | Playwright Planner descubre seed automáticamente |
| Bundles de features MUST-HAVE | Compliance core (pre-flight + PII + audit log) · Style enforce (Style Contract + LLM-as-judge) · A11y baked-in con axe-core |
| Bundles NO MVP | Traceability + Xray export (knowledge graph + connector) |
| Output target | Repo de tests nuevo (clean slate) |
| Test Management connector | Ninguno — export JSON genérico |

## Anexo: Riesgos conocidos del MVP

1. **Playwright Planner contra SauceDemo en demo en vivo**. Si el Planner falla durante la grabación, embarazoso. Mitigación: ensayar el flujo varias veces antes de grabar; tener seed manual como fallback no documentado.
2. **Dependencia versión Playwright** v1.56+. Pinear en `package.json`. Si Microsoft cambia los nombres/contratos de los subagents (`playwright-test-planner` → otro), los commands `/test-pilot:*` se rompen. Mitigación: encapsular los nombres de subagents nativos en una capa de constantes/config.
3. **Coste LLM** sin budget cap en MVP. Aceptable para demo, no para piloto. Pendiente medir tokens reales durante el spike (sección "Coste / token usage" del findings).
4. **Sin knowledge graph**, la traceability vive en el `audit-log.json` y en JSDoc de cada test. Limitado para queries complejas. Aceptable para MVP.
5. **Sin Xray connector**, JSON catalog es genérico — el SDET debe hacer import manual. Aceptable para demo, blocker para piloto cliente.
6. **`ia4d-functional-design-expert` no es input formal**. Si el catálogo Inetum evoluciona y exige integración estricta, hay que adaptar el `/test-pilot:plan` para consumir output estructurado.
7. **Healer nativo puede silenciar tests con `test.fixme()`**. Detectado en el análisis del subagent `playwright-test-healer`. En banca regulada esto es inaceptable sin sign-off. Mitigación: hook PostToolUse que escanea Edits del Healer y bloquea si detecta inserción de `test.fixme()` no aprobada. Ver Boundaries — Never do.
8. **Generator nativo no tiene memoria entre runs**. Si el SDET corre `/test-pilot:generate` dos veces sobre el mismo plan, no detecta solapamientos ni duplicados. Mitigación: el `ia4d-exporter` puede deduplicar por hash del contenido + nombre de test antes de escribir `test-catalog.json`. Si surge problema mayor, agente `ia4d-catalog-checker` futuro.
9. **Generator nativo asume estado fresco entre tests**. Tests del MVP en SauceDemo o TodoMVC no tienen problema. En clientes banca con datos persistentes compartidos, este supuesto se rompe. Mitigación: documentado como limitación MVP; `ia4d-test-data-architect` futuro lo aborda.

## Anexo: Decisiones técnicas durante implementación

Decisiones tomadas mientras se implementa el MVP, posteriores al SPEC inicial. Documentadas aquí en lugar de re-escribir el cuerpo del SPEC para preservar trazabilidad.

| Fecha | Decisión | Razón | Impacto |
|---|---|---|---|
| 2026-05-26 | `@playwright/test` con pinning flexible `^1.56.0` (no estricto `~1.56.0`) | Elección del usuario al arrancar S1-T1. Diverge del Anexo Riesgos #2 que recomendaba pinear estricto. | Si Microsoft cambia contratos de los subagents nativos en 1.x.y > 1.56, los commands `/test-pilot:*` pueden romper. Mitigado por capa de constantes con nombres de subagents nativos (a crear cuando sea relevante). |
| 2026-05-26 | Eliminar `hooks/hooks.json` del SPEC §3. Los hooks se registran exclusivamente en `.claude/settings.json` (versionado) | Claude Code lee hooks solo desde `settings.json` / `settings.local.json`. No hay mecanismo de include externo. Mantener un `hooks/hooks.json` duplicado generaba drift y no aportaba función. | Los scripts ejecutables (`pre-flight.ts`, `pii-post.ts`, `audit-write.ts`) siguen viviendo en `hooks/`. Solo cambia la ubicación del registro/matcher. |
