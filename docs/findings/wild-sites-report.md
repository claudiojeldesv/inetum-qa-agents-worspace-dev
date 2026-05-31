# Wild sites report — v0.2 Fase B (producción contra sitios reales)

Cataloga el caos observado **produciendo tests** (no observando) contra sitios reales, con brief happy-path acotado. Cada fallo que rompe la producción prioriza el hardening de Fase C (umbral ≥30% sobre el total de sitios).

Metodología: `/qa-automator:autonomous` en modo dirigido (brief `--flows/--entry/--ignore`), alcance recon + happy-path.

---

## Sitio 1 — `practice.expandtesting.com` (flujo: login)

**Brief**: `--flows=login --entry=/login --ignore=demos,tools,tips,api-testing,register`. Style contract: `expandtesting.yaml` (creado para este sitio).

### Efecto del brief dirigido (vs exploración ciega)

| Métrica | SauceDemo ciego | expandtesting con brief | Reducción |
|---|---|---|---|
| tool-uses (navegación) | 62 | 4 | ~15x |
| wall-clock planner | ~6 min | ~1.6 min | ~4x |
| tokens planner | 45k | 37k | ~1.2x |
| alcance | 27 casos / 4 suites | 2 tests / 1 suite | dirigido |

**Conclusión**: el brief mata la dispersión y el wall-clock (la preocupación de "más de una hora"). Los tokens bajan poco (overhead del modelo); lo que cae es la navegación y el tiempo. Plumbing validado.

### Fallos categorizados

| # | Categoría | Detalle | Impacto tiempo SDET | Dificultad fix | Componente Fase C |
|---|---|---|---|---|---|
| 1 | **A11y todo-o-nada** | El AxeBuilder check (`serious/critical`) aborta el login por contraste de un botón "Buy us a coffee" (3:1) y links del footer (4.26:1) — ruido **fuera del flujo bajo prueba**. El test ni llega a ejecutar el login. | **Alto** — bloquea el 100% del test por violaciones ajenas al flujo | Media | **A11y baseline aprobada** (predicho top, confirmado) |
| 2 | Compliance W1 en todo sitio real | El pre-flight marca `warn` (sin prefijo no-prod) en cualquier sitio público real. Pedirá ask-first en cada sitio de Fase B. | Bajo (fricción, no bloqueo) | Baja | Ajuste: si FQDN está en allowlist explícita, no warnear |
| 3 | Style contract por sitio | El default `saucedemo.yaml` no sirve (synthetic_fixtures de otro sitio). Hubo que crear `expandtesting.yaml`. | Medio (setup manual por sitio) | Baja | Plantilla/generador de style contract por sitio |
| 4 | `seed.spec.ts` resembrado | El MCP `playwright-test` resiembra `tests/e2e/seed.spec.ts` (scaffold vacío) al hacer `planner_setup_page`. Ensucia el runner. | Bajo | Baja | Limpieza post-run en el command |

### Lo que NO falló (dato positivo)

- **Locators**: con `test_id=null` (discovery NO fabricó, recordándole su hard rule) + fallback `getByRole/getByLabel` del scaffolder → locators válidos. El defecto de Fase A (fabricar test_id) **no se reprodujo**. Hipótesis: reforzar el prompt del discovery-analyzer basta para el fix (barato).
- **Writer**: se anticipó al agujero del password (`getByRole('textbox')` no matchea `type=password` → cambió a `getByLabel('Password')` por su cuenta). Judge 0.9614, reviewer approved iter 0.
- **Login funcional**: NO verificado — el axe aborta antes de ejecutar el login. Pendiente de re-correr cuando se ajuste el a11y.

### Pendiente de decisión SDET

Cómo tratar el a11y (hallazgo #1) antes de continuar a sitio 2.

---

## Sitio 2 — `practicesoftwaretesting.com` (Toolshop, flujo: add-to-cart)

Reemplazo de opencart (caído). Ecommerce Angular SPA, catálogo grande. Brief: `--flows=add-to-cart --entry=/ --ignore=sign-in,checkout,contact`. Style contract: `practicesoftwaretesting.yaml` (getByTestId prioridad real).

### Efecto del brief en sitio GRANDE (el dato estrella)

| Run | Sitio | tool-uses | wall-clock |
|---|---|---|---|
| SauceDemo ciego | pequeño | 62 | ~6 min |
| expandtesting + brief | pequeño | 4 | ~1.6 min |
| **Toolshop + brief** | **GRANDE** | **10** | **~1.3 min** |

**El brief escala**: en un catálogo grande (el caso que temíamos = "más de una hora" en ciego), el brief mantuvo el planner en 10 tool-uses. Eligió el primer producto y siguió, sin enumerar el catálogo. Confirma que la acotación happy-path resuelve el Problema 1 (scope/demora) incluso en sitios grandes.

### Fallos / hallazgos

| # | Categoría | Detalle | Impacto | Dificultad | Componente Fase C |
|---|---|---|---|---|---|
| 5 | **baseURL hardcoded** | `playwright.config.ts` fija `baseURL: saucedemo`. El POM `goto('/')` relativo hizo que el spec de Toolshop corriera **contra SauceDemo**. El flujo Toolshop NO se verificó. | **Alto** — multi-sitio roto sin esto | Baja (parametrizar baseURL por `--url`) | Plumbing: command setea baseURL del run |
| 6 | Locator con id dinámico | `data-test="product-<uuid>"` (UUID dataset-dependent). Frágil ante reseed. El Writer lo endureció solo (con hint) a `getByTestId(/^product-/).first()`. | Medio | Baja-Media | `locator-hardener` (apuesta #1 confirmada) |
| 7 | Inconsistencia Writer (goto) | Writer expandtesting hardcodeó URL absoluta en spec; Writer Toolshop usó `goto('/')` relativo. Sin convención fija de cómo navegar. | Medio | Baja | Convención de goto + baseURL en command |
| 8 | DOM dinámico SPA | `nav-cart` ausente del DOM hasta el primer add. No assertar ausencia por visibility. El planner lo detectó y avisó. | Bajo (manejado) | Baja | Nota para Writer (ya lo maneja) |

### Lo que NO falló / contrastes positivos

- **A11y PASÓ** en Toolshop (axe no abortó) — contraste fuerte con expandtesting (#1, abortó por contraste). Frecuencia a11y-abort: **1/2 sitios**. Toolshop (Angular Material) tiene mejor a11y base. Matiza la urgencia del baseline: no es universal, pero cuando golpea, bloquea entero.
- **data-test rico**: discovery capturó los `data-test` fielmente (no fabricó), getByTestId volvió a ser prioridad real. Judge 0.9786 (el más alto: selectors 1.0).
- **Writer endurece locators con hint**: el `locator-hardener` podría ser parcialmente un refuerzo de prompt del Writer, no solo un subagent nuevo.

---

## Frecuencias provisionales (2 sitios)

| Categoría | Frecuencia | Nota |
|---|---|---|
| Compliance W1 (sitio real sin prefijo) | 2/2 (100%) | Ajustar: FQDN en allowlist no debería warnear |
| Style contract por sitio (setup manual) | 2/2 (100%) | Plantilla/generador de contract |
| A11y todo-o-nada aborta | 1/2 (50%) | Baseline aprobada sigue siendo prioridad (cuando golpea, bloquea entero) |
| Locator frágil (id dinámico / sin data-test) | 1/2 | locator-hardener |
| baseURL no parametrizado | 1/2 (pero estructural, afecta a todos) | Plumbing baseURL |
| `seed.spec` resembrado por MCP | 2/2 | Limpieza post-run |

Pendiente sitio 3: `parabank.parasoft.com` (auth + estado). opencart descartado (caído).

## Consolidación (tras sitio 3)

Recalcular frecuencias y cerrar priorización de componentes Fase C.

---

## Estado de continuidad (para el próximo chat)

**Hecho esta sesión:**
- Cierre Fase A (commit `ef5611e`): pipeline LLM-LLM validado, evidencia en `docs/findings/faseA-closure/`.
- Plumbing del brief (commit `6deabdc`): `autonomous.md` acepta `--flows/--entry/--ignore`.
- Reframe Fase B en SPEC + CLAUDE (commit `0a601d6`).
- Fase B sitios 1 (expandtesting) y 2 (Toolshop) ejecutados y catalogados aquí.
- **Fix `baseURL`** aplicado (no commiteado aún): `playwright.config.ts` ahora lee `process.env.QA_BASE_URL` (default saucedemo); `autonomous.md` verification step documenta setearlo con el `--url` del run. Resuelve el hallazgo #5.

**Cómo correr el sitio 3 (parabank) en el próximo chat:**
1. Añadir `https://parabank.parasoft.com/*` a `config/allowed-targets.yaml` + sus credenciales test.
2. Crear `style-contracts/parabank.yaml` (parabank usa ids/forms clásicos, sin data-test → priority getByLabel/getByRole; declarar credenciales en synthetic_fixtures porque el flujo de banca requiere login → categoría **auth-handler**).
3. `/qa-automator:autonomous --url=https://parabank.parasoft.com/ --style=style-contracts/parabank.yaml --flows=<login|transferencia> --entry=/ --ignore=<...>`.
4. Verificación: setear `QA_BASE_URL=https://parabank.parasoft.com/` (fix ya aplicado).

**Limpieza pendiente** (decidir al empezar): `tests/e2e/` tiene `login.spec.ts` (expandtesting) + `add-to-cart.spec.ts` (Toolshop) + `seed.spec.ts` (resembrado por MCP). Archivar como evidencia o limpiar antes del sitio 3.

**Objetivo del sitio 3:** cazar la categoría **auth-handler** (storageState, login persistente) — única apuesta top de Fase C aún no observada. Tras sitio 3, recalcular frecuencias y cerrar la priorización de componentes Fase C.
