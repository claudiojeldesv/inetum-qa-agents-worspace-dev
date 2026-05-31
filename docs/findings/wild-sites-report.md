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

## Sitio 3 — `parabank.parasoft.com` (banca demo JSP, flujos: login + transferencia)

Sitio elegido para cazar la categoría **auth-handler** (login persistente / storageState), única apuesta top de Fase C aún no observada. Banca demo Parasoft, JSP legacy server-side. Brief: `--flows=login,transfer-funds --entry=/parabank/index.htm --ignore=bill-pay,request-loan,...`. Style contract: `parabank.yaml` (locators `getByLabel/getByRole` primero, `fail_on_violations: false`). Credenciales públicas `john/demo`.

**Recon previo del SDET** (antes del pipeline): verificación empírica de viabilidad — `john/demo` loguea, transfer-funds ejecutable, Register disponible. No se asumió que las credenciales demo siguieran vivas; se comprobó. Dato: el estado cambió entre recon (john con 1 cuenta) y run del planner (2 cuentas, 13344+15564).

### Resultado

**3/3 verde** (login + transfer happy-path + auth-guard) tras pipeline + Healer. Judge: login 0.96, transfer 0.93. Reviewer aprobó ambos en iteración 0. El a11y NO abortó (configurado warning) → permitió alcanzar el objetivo.

**Auth-handler CAZADO**: el patrón storageState funcionó end-to-end. login.spec.ts guarda `playwright/.auth/john.json`; transfer happy-path lo reutiliza vía `test.use({ storageState })` y navega a transfer.htm **sin re-login** (sesión persistió entre specs). El guard test valida el acceso no autenticado.

### Fallos / hallazgos

| # | Categoría | Detalle | Impacto | Dificultad | Componente Fase C |
|---|---|---|---|---|---|
| 9 | **`forbid_css_selectors` inviable en legacy** | ParaBank no tiene labels asociados, ni aria-*, ni placeholder, ni data-test. `getByLabel` falla; `getByRole('textbox')` ambiguo (text+password ambos role textbox → strict-mode). El Healer **rompió forzadamente** `forbid_css_selectors`: `input[name=...]` en login, `#id` en transfer. Documentado como excepción. **No observado en sitios 1-2** (tenían id/label o data-test). | **Alto** — bloquea todo locator del sitio si el contract es estricto | Media | **Contract: excepción CSS por-locator en sitios legacy** (o locator-hardener con fallback a name/id attribute) |
| 10 | **auth-handler: patrón OK, plumbing ausente** | storageState reutilizado funciona, pero NO hay setup project con `dependencies` en `playwright.config.ts`. Frágil ante `fullyParallel` (race: transfer lee el `.json` antes de que login lo escriba). Única garantía actual: `--workers=1` + orden alfabético login→transfer. Ambos Writers flaguearon el gap de forma independiente. | **Alto** — auth-handler no es robusto sin esto | Media | **Command: setea setup project + dependencies; schema del style-contract con campo `auth:`** |
| 11 | Guard de sesión legacy = error-page inline, NO redirect | Acceso no autenticado a transfer.htm: la URL **no cambia**, ParaBank sirve transfer.htm (200) con heading "Error!" + form de login, sin el form de transferencia. El planner asumió redirect (modelo SPA/MVC moderno). Aserción re-modelada al comportamiento real (no se falseó un redirect inexistente). | Medio | Baja | Nota para planner/Writer: "auth guard = redirect" no aplica a apps server-side legacy |
| 12 | Inconsistencia de atributos por pantalla (mismo sitio) | login usa `name` (sin id); transfer usa `id` (con `name="input"` genérico inútil). El locator robusto **varía por pantalla** dentro del mismo sitio legacy. Refuerza #9. | Bajo | — | Estrategia de locator por-pantalla, no por-sitio |
| 13 | Writer optimista vs Healer realista | El Writer siguió la prioridad `getByLabel` del contract asumiendo linkage for/id inexistente. Generación optimista; el Healer corrige contra DOM real. Coherente con el principio SDET (sanación al final, no acoplada a generación). | Bajo (es el flujo esperado) | — | Confirma el rol del Healer; opcional: pre-scout de DOM antes del Writer (Fase C+) |
| 14 | `npx tsx -e` del scaffolder falla silencioso (win32/bash) | El comando inline del Acto 3 (`autonomous.md` paso 8) no escribió POMs sin error visible. Hubo que ejecutarlo vía archivo `.mjs` dentro del workspace (import relativo). | Bajo | Baja | Plumbing: scaffolder como script invocable, no `-e` inline |

### Lo que NO falló / contrastes positivos

- **storageState reutilizado entre specs**: el objetivo del sitio. La sesión persistió; transfer.htm cargó autenticado sin re-login.
- **Hard rule test_id honrada (3/3)**: discovery puso `test_id: null` en todos (ParaBank no tiene data-test). El defecto de Fase A (fabricar test_id) sigue sin reproducirse.
- **a11y como warning permitió el objetivo**: 5/8/7 violaciones critical/serious capturadas sin abortar. Contraste con sitio 1 (abortó con `fail_on_violations: true`). Confirma que la decisión de severidad debe ser configurable por sitio.
- **Reviewer aprobó iter 0 en ambos**; el Healer resolvió lo que era runtime puro (locators contra DOM real + comportamiento del guard), no defectos de redacción.

---

## Frecuencias (3 sitios — Fase B cerrada)

| Categoría | Frecuencia | Nota |
|---|---|---|
| Compliance W1 (sitio real sin prefijo) | 3/3 (100%) | Ajustar: FQDN en allowlist no debería warnear |
| Style contract por sitio (setup manual) | 3/3 (100%) | Plantilla/generador de contract |
| `seed.spec` resembrado por MCP | 3/3 (100%) | Limpieza post-run |
| Hard rule `test_id` honrada (no fabrica) | 3/3 (100%) | Defecto Fase A no reproducido — fix barato confirmado |
| Problema de locator (naturaleza varía) | 2/3 | toolshop: id dinámico; parabank: sin semántica (forbid_css inviable). expandtesting OK |
| A11y con violaciones serias presente | 2/3 | expandtesting + parabank; toolshop limpio (Angular Material) |
| A11y **aborta** el flujo | 1/3 (33%) | Solo sitio 1 (`fail_on_violations: true`). Configurable → no es destino forzoso |
| auth-handler (storageState + guard) | 1/3 | Solo parabank tiene auth. Apuesta top **confirmada y cazada** |
| `forbid_css_selectors` inviable (legacy) | 1/3 | Solo parabank (JSP legacy sin semántica). NUEVO |
| baseURL no parametrizado | estructural | FIXED (`QA_BASE_URL`) |

## Consolidación Fase B — priorización de componentes Fase C

Tres sitios producidos y catalogados (pequeño con id/label, grande con data-test, legacy sin semántica + auth). Priorización por impacto × frecuencia:

1. **A11y baseline configurable** (impacto alto cuando golpea, 1/3 aborta pero 2/3 con violaciones serias). El umbral de severidad y `fail_on_violations` deben ser por-sitio, no global. Ya validado manualmente en parabank (warning permitió el objetivo).
2. **auth-handler como componente de primera clase** (1/3 pero alto valor, categoría diferenciadora): setup project + `dependencies` en config generados por el command; campo `auth:` en el schema del style-contract (login flow + ruta storageState). El patrón ya lo genera el planner/Writer; falta el plumbing que lo haga robusto sin `--workers=1` manual.
3. **locator-hardener / excepción CSS en legacy** (2/3 problemas de locator, naturaleza dispar): fallback a `name`/`id` attribute cuando no hay semántica; excepción documentada a `forbid_css_selectors` por-locator. ParaBank demostró que la regla estricta es inviable en JSP legacy.
4. **Style contract por sitio** (3/3): plantilla/generador que arranque del DOM real (pre-scout) en vez de setup 100% manual.
5. **Ajustes de fricción** (baja dificultad, alta frecuencia): W1 no-warn para FQDN en allowlist (3/3), limpieza de `seed.spec` post-run (3/3), scaffolder como script invocable no `-e` inline.

---

## Validación Fase C — los 3 componentes construidos y verificados en vivo (parabank, 5/5)

Construidos los 3 top **sin subagents nuevos** (schema + lógica en agentes existentes; decisión: evidencia n=1/n=2 + editar-sobre-crear). Commit `8aae203`. Validados end-to-end contra parabank real reusando el `discovery-report.json` de Fase B (el planner no toca ninguno de los 3; re-correrlo no validaba nada). **5/5 verde, 4 workers, sin `--workers=1`.**

### Qué se construyó

| Componente | Realizado como | Archivos |
|---|---|---|
| **C1 — a11y gate configurable** | Gate `a11y.fail_on_violations` por-sitio separado del scan (que siempre se inyecta). `ia4d-a11y-injector` honra el gate: `true`→`expect` aborta, `false`→annotation `test.info().annotations` (evidencia, no aborta). | `references/style-contract-schema.md`, `.claude/agents/ia4d-a11y-injector.md`, `autonomous.md` |
| **C2 — auth-handler acotado** | Campo `auth:` en schema (form-based) + setup project + `dependencies` + storageState **condicionales por `QA_STORAGE_STATE`** en el config. El command genera `auth.setup.ts`. SAML/OAuth/MFA diferidos. | `references/style-contract-schema.md`, `playwright.config.ts`, `autonomous.md` |
| **C3 — excepción CSS legacy** | Campo `locators.css_fallback_attributes` (whitelist `name`/`id`). `ia4d-style-enforcer` aplica el fallback acotado cuando no hay semántica (taggeado + audit-log); `ia4d-reviewer` MF-1 lo honra. Nunca CSS arbitrario. | `references/style-contract-schema.md`, `ia4d-style-enforcer.md`, `ia4d-reviewer.md`, `writer-reviewer-protocol.md` |

### Evidencia del run

- **C2**: `ok 1 [setup] authenticate (2.5s)` corrió primero como dependency y escribió `john.json` (borrado antes de cada run para probarlo). El transfer happy-path heredó la sesión y llegó a "Transfer Complete!" bajo `fullyParallel`. **La race que en Fase B exigía `--workers=1` está muerta.**
- **C1**: el injector produjo el modo warning canónico en los 3 tests. parabank tiene violaciones serias conocidas (5/8/7 en Fase B) y el run **no abortó** — en modo `fail` habría reventado como expandtesting (sitio 1).
- **C3**: los locators `#amount`, `#fromAccountId`, `#toAccountId`, `input[name="username"]` resolvieron contra el DOM legacy vivo. Runtime idéntico a Fase B; el cambio es de gobernanza (sancionado declarativamente vs roto a la fuerza por el Healer).

### Lo aprendido (transversal, no por componente)

1. **El gap de auth-handler era estructural, no de patrón.** El storageState ya lo generaba el Writer en Fase B; lo que faltaba era el setup project + `dependencies`. Confirmado: con eso, `fullyParallel` ordena setup→tests sin `--workers=1`. El gate condicional por env var (no patchear el config por run) preserva los sitios sin auth intactos — verificado con `--list` en ambos modos antes de tocar nada.
2. **`auth.setup.ts` debe verificar el `success_signal` ANTES de guardar estado.** Si no, un login que falla en silencio persiste una sesión no autenticada y todos los specs dependientes fallan con causa difusa. El Writer lo hizo bien (assert `Log Out` visible → luego `storageState`).
3. **El `ia4d-a11y-injector` es aditivo-idempotente, no reformateador.** Si el spec ya tiene un scan axe (aunque sea en forma vieja `console.warn`), el injector lo respeta y no reescribe a la forma canónica. Para obtener el modo warning canónico hay que inyectar sobre un spec sin scan previo. Implicación: el injector está bien para generación fresca; para migrar specs viejos hace falta strip + re-inject (o un modo reformateo, no construido).
4. **C3 a nivel enforcer apunta a specs, pero en POM bien estructurado los locators viven en la page class.** Por eso los honor-ers reales de la excepción CSS en este codebase son el Writer (rellena el POM) y el Reviewer (MF-1), no el style-enforcer (que opera sobre el spec). El campo del contract es la fuente de verdad declarativa; quién lo aplica depende de dónde viva el locator.
5. **Test-data stale en entornos demo compartidos.** El primer run dio 4/5: el transfer reventó en `selectOption('15564')` porque las cuentas de john cambian entre runs (el `shared_environment_warning` del discovery, ya catalogado). No es regresión de componente — el locator resolvió, el valor no existía. Fix: leer las `<option>` disponibles en runtime, nunca hardcodear IDs de cuenta. **Lección transversal** (candidata a hint del Writer o futuro `test-data-architect`), no específica de Fase C.

---

## Estado de continuidad (para el próximo chat)

**Hecho (Fase B completa, 3 sitios):**
- Cierre Fase A (commit `ef5611e`): pipeline LLM-LLM validado, evidencia en `docs/findings/faseA-closure/`.
- Plumbing del brief (commit `6deabdc`): `autonomous.md` acepta `--flows/--entry/--ignore`.
- Reframe Fase B en SPEC + CLAUDE (commit `0a601d6`).
- Fase B sitios 1 (expandtesting), 2 (Toolshop) y 3 (parabank) ejecutados y catalogados.
- Fix `baseURL` (`QA_BASE_URL`) aplicado y validado en sitio 3.
- Evidencia de sitios 1 y 2 archivada en `docs/findings/faseB-evidence/{sitio1-expandtesting,sitio2-toolshop}/`.

**Hecho (Fase C, 3 componentes top construidos y validados):**
- C1 a11y gate configurable, C2 auth-handler acotado, C3 excepción CSS legacy. Sin subagents nuevos (schema + agentes existentes). Commit `8aae203`.
- Validación live parabank **5/5 verde, 4 workers, sin `--workers=1`**. Specs regenerados por el pipeline nuevo. Detalle en la sección "Validación Fase C" arriba.
- SPEC §7: subsección "Estado Fase C — construido" con las 3 divergencias (flag-no-baseline, sin subagents, auth form-based).

**Estado actual del workspace:**
- `tests/e2e/`: `auth.setup.ts` (setup project, NUEVO), `login.spec.ts` (fresco + a11y annotation), `transfer-funds.spec.ts` (hereda storageState del project + dynamic accounts + a11y annotation), `seed.spec.ts` (resembrado MCP).
- `tests/pages/`: login/overview/transfer/logout POMs de parabank (locators `name`/`id` ahora sancionados por `css_fallback_attributes`, no "forzados").
- `style-contracts/parabank.yaml`: con `fail_on_violations:false` + `css_fallback_attributes:[name,id]` + bloque `auth:`.
- `playwright/.auth/john.json`: gitignored, lo escribe el setup project en cada run.

**Cómo re-correr parabank (config nuevo, sin `--workers=1`):**
`$env:QA_BASE_URL='https://parabank.parasoft.com/'; $env:QA_STORAGE_STATE='playwright/.auth/john.json'; npx playwright test --reporter=list`
El setup project (`auth.setup.ts`) corre primero por `dependencies`; los specs heredan la sesión. El orden lo garantiza el config, no el run manual.

**Siguiente:** Fase D (Quality layer: Writer↔Reviewer N=3, judge axes por contract) o Fase E (telemetría + budget cap), o S3 spec-refiner. Componentes Fase C restantes (`pre-flight-cleaner`, `test-data-architect`, `frame-handler`) entran solo si la evidencia los prioriza. Candidata transversal del run: hint de test-data dinámico al Writer (lección #5).
