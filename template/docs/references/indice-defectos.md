# Índice de defectos D1–D52

Catálogo del vocabulario D-NN del proyecto: qué es cada defecto, dónde se midió, dónde vive el
arreglo y en qué estado está. Los D-números son la unidad de trazabilidad de los hallazgos de campo
desde el primer run de ParaBank (beta.3); a partir de K0.42 sustituyen a la numeración de ciclo K0.x
como vocabulario vivo.

**Guarda mecánica**: `tests/unit/indice-defectos.test.ts` verifica que este índice cubre D1..Dmax de
forma contigua y que ningún D-número nuevo aparece en el repo sin fila aquí. Un índice sin validador
sería otra instancia de la familia D2.

## Dos notas de vocabulario (sin esto, el índice induce a error)

1. **`docs/SPEC-caos-corporativo.md` usa un `D1..D4` LOCAL por ciclo**: `K0.33/D2` significa "el
   defecto 2 del ciclo K0.33", NO el D2 global de esta tabla. Mismo caso en `banco-mind2web.md` y
   `comparativa-walker-vs-llm.md`.
2. **Los docs de Copilot usan `D3`/`D4` como "Diseño 3 / Diseño 4"** (brazos del experimento de
   coste): `copilot-edition/h0-metrico.md`, `spike-copilot-port.md`, `plan-copilot-efficient-tokens.md`.

## Dónde viven los K0.x (no se inventarían aquí)

K0.1–K0.17 → [SPEC-kernel-v2.md](../SPEC-kernel-v2.md) · K0.18–K0.41 →
[SPEC-caos-corporativo.md](../SPEC-caos-corporativo.md) · K0.42–K0.47 → [STATUS.md](../STATUS.md).

## Convenciones de la tabla

- **Fuente**: donde mejor está explicado. El comentario de código gana al finding cuando existe
  (el finding narra el run; el comentario explica el mecanismo).
- **Medido en**: los 6 informes de ParaBank son runs consecutivos (`run-beta-parabank.md` = beta.3,
  `-2` = beta.4, `-3` = beta.5, `-4-medicion`, `-5-verificacion`, `-6` = beta.14).
- **Estado**: `cerrado` (arreglo en código, con matiz si lo hay) / `abierto` / `criterio` (D2).

## La tabla

| # | Qué es | Medido en | Arreglo / fuente | Estado |
|---|---|---|---|---|
| D1 | El refiner emite un walk-script que el walker rechaza (26 errores de esquema: `id` por `flow`, `criterion_refs` por `criteria`…) | ParaBank beta.3 | `copilot/src/check-walk-script.ts` (K0.43, commit `fb2293e`); finding [run-beta-parabank.md](../findings/run-beta-parabank.md) §D1 | cerrado |
| D2 | **La familia madre**: algo declarado que nadie valida ni consume, y falla en silencio. Criterio, no ticket. Instancias: D9, D14, D20, D43, D46, D47… | ParaBank beta.3 (3 instancias en un run) | [run-beta-parabank.md](../findings/run-beta-parabank.md) §D2 | criterio |
| D3 | Lo medido no sobrevive al siguiente run (aliases no promovidos). El diagnóstico original era falso: la causa era `promoteRescues` exigiendo cero drift | ParaBank beta.3 | K0.44: `RescueRecord.source` + `aliasPromotionVerdict` | cerrado — **sin verificación de campo** (falta un `alias-hit` real) |
| D4 | El healthcheck dio 26/26 con el MCP `playwright-test` desconectado: verifica el binario, no que las tools estén vivas en la sesión | ParaBank beta.3 | — | abierto |
| D5 | `expect_state` no deja locator autoritativo → un paso verde se cae del emisor y su flujo se paga con una pasada de planner (~130k tokens) | ParaBank beta.3 | [run-beta-parabank.md](../findings/run-beta-parabank.md) tabla final | abierto |
| D6 | Audit-log partido en dos: el refiner escribe en `.work/audit-log.json` en vez de `.work/<site>/audit-log.json` | ParaBank beta.3 | íd. | abierto |
| D7 | No hay CLI para `appendAuditEntry`: el orquestador escribió tres `.ts` desechables solo para registrar | ParaBank beta.3 | íd. (mitigado parcialmente por `audit-mark`) | abierto |
| D8 | El command imprimió `--fd=<ruta>` con una ruta inexistente como si fuera ejecutable | ParaBank beta.3 | íd. ("arreglo de un minuto") | abierto |
| D9 | `--assist` declarado en el contract y aun así se preguntó a mitad de run. Familia D2 | ParaBank beta.3 | íd. | abierto |
| D10 | El panel de asistencia se inyecta con `page.evaluate` y una navegación lo mata: walker esperando 600 s un botón inexistente | ParaBank beta.3 | K0.44: vigilante 500 ms + re-inyección acotada, `copilot/src/dom-walker.ts` | cerrado — **sin verificación de campo** |
| D11 | Diagnóstico falso del tier anclado ("no hay label") → rescate MCP innecesario y memoria envenenada | ParaBank beta.4 | [run-beta-parabank-2.md](../findings/run-beta-parabank-2.md) §D11 | abierto |
| D12 | El panel de asistencia se abre y el QA no se entera (el aviso iba a un stdout bufferizado) | ParaBank beta.4 | K0.45: marcador en disco `assist-pending.json`, `copilot/src/dom-walker.ts` / `walk-core.ts` | cerrado |
| D13 | Subagentes lanzados en background: ~30 min de espera muerta; la regla "no background" no es imponible | ParaBank beta.4 | instrumentado en `src/run-cost.ts` | abierto |
| D14 | «Citar y no traducir» sin dientes: `confidence` declarado y sin consumidor. Familia D2 | ParaBank beta.4 | [run-beta-parabank-2.md](../findings/run-beta-parabank-2.md) | abierto |
| D15 | `walk-to-spec` ignora `auth.enabled` | ParaBank beta.4 | íd. | abierto |
| D16 | El `discovery-analyzer` tira los locators medidos | ParaBank beta.4 | íd. | abierto |
| D17 | `QA_WORK_DIR` exportado tarde → el refiner escribe al audit-log genérico | ParaBank beta.4 | íd. | abierto (menor) |
| D18 | El workspace desplegado no declara su versión y nada la comprueba (`CLAUDE_PLUGIN_ROOT` congelado al arrancar: 3 despliegues salieron en beta.1 con todo verde) | ParaBank beta.4 | `src/version-drift.ts:2` + `healthcheck.ts` | cerrado |
| D19 | El gate de `open_questions` bloqueaba por EXISTIR una pregunta en vez de por ausencia de oráculo (`then` AMBIGUO) | ParaBank beta.4 | verificado en campo en runs 4 y 5 | cerrado |
| D20 | La notación de diagnóstico de la escalera (`anchored(...)`) se volcaba verbatim al código emitido → POM muerto, `Total: 0 tests` | ParaBank beta.4 | K0.46: lista blanca fail-closed `copilot/src/walk-core.ts` + campo `emit_locator` (cuyo productor faltó → D46) | cerrado |
| D21 | Emisión independiente con locators medidos con sesión | ParaBank beta.4 | solo mencionado en la bitácora de estado | abierto |
| D22 | ~30 s por paso anclado (coste del tier `anchored`) | ParaBank beta.4 | íd. | abierto |
| D23 | Un SIGTERM a los ~10 min mata el walk asistido — el modo asistido no sobrevive a una pausa humana, su propio caso de uso | ParaBank beta.5 | camino de arreglo escrito (background + `assist-pending.json`); [run-beta-parabank-3.md](../findings/run-beta-parabank-3.md) | abierto |
| D24 | Un nombre accesible numérico mataba el POM entero (`readonly 12345: Locator`) | ParaBank beta.5 (25 links `12345`…) | prefijo de rol en `toIdentifier`, `src/pom-scaffolder.ts:78`; commit `c4de8f9` | cerrado — confirmado en campo |
| D25 | `verify-locators` asume autenticación por redirección; si la app mantiene la URL y cambia el contenido, se desalinea | ParaBank beta.5 (no reproduce en SauceDemo) | relacionado con D50/D51, que sí cerraron | abierto (al final de la cola) |
| D26 | El rechazo fail-closed (D20) nombra el segmento culpable pero no ofrece alternativa | ParaBank beta.5 | confirmado sin tocar en run 5 y SauceDemo | abierto |
| D27 | El panel no recibe la CAUSA, solo la pista: el QA respondió «No existe» a un elemento que existía TRES veces — ambigüedad presentada como ausencia | ParaBank beta.5 | [run-beta-parabank-3.md](../findings/run-beta-parabank-3.md) §D27 | abierto |
| D28 | El acuse compacto de un subagente puede mentir: `{"ok":true}` sobre un fichero inexistente, descubierto tres actos después | ParaBank run 4 | `src/verify-ack.ts` + script + punto 2 de los commands; 15 tests | cerrado |
| D29 | Colisión de nombres en el POM: `readonly transferFunds` tapaba el método homónimo | ParaBank run 4 | `MF-tsc` en `src/scripts/pre-review.ts`; par falsable en tests | cerrado |
| D30 | Auditoría inconsistente de los Writers (2 entradas para 3 specs); sistémico en el run 5 | ParaBank runs 4-5 | hook `hooks/audit-file-write.ts` + `untraced` en verify-ack | cerrado (mecánico) |
| D31 | `verify-ack` verificó el fichero equivocado y dijo «verificado» | ParaBank run 4 | ruta resuelta en el veredicto + cwd impreso | cerrado |
| D32 | `--ack` con JSON en línea inusable en PowerShell 5.1 | entorno Windows | el error nombra la causa y las formas válidas | cerrado |
| D33 | `npm test` no fiable en verde: dos ficheros lentos rebasan timeout bajo carga (9/813 fallos, 813/813 al re-ejecutar) | suite del propio repo | — | abierto |
| D34 | El scaffolder se cree `test_id` a ciegas (atributo equivocado). Segunda vuelta: el arreglo por prosa midió 18/18 y luego 0/31 con el MISMO prompt | ParaBank run 5 → SauceDemo → primer ejercicio de campo en Dolibarr | rescate contra el DOM en `src/scripts/verify-locators.ts` + `src/pom-scaffolder.ts` | cerrado (mecánico) |
| D35 | El Writer conoce la race y aun así produce un test flaky | ParaBank run 5 | `MF-wait-budget` en `src/scripts/pre-review.ts`; verificado end-to-end en el run 6 (2/2 ×2) | cerrado |
| D36 | Un subagente se inventó el timestamp del audit | ParaBank run 5 | cableado (hook `audit-file-write.ts`) — la prosa no bastó, ver D40 | cerrado |
| D37 | `MF-postcondition` ciego a la pantalla: a un spec de login se le exigía asertar `Transfer Complete!` | ParaBank run 5 (2 Writers independientes) | `src/scripts/pre-review.ts:415` + test | cerrado (el finding aún dice "Abierto") |
| D38 | Los Writers editan el `discovery-report.json` para satisfacer un gate: 2 de 3 mutaron la evidencia que los juzga | ParaBank run 5 | detección en `hooks/audit-file-write.ts` + prohibición en `ia4d-writer.md`; no reproducido en SauceDemo | cerrado (detección) |
| D39 | La señal de éxito de auth se satisface con una página de error: `Log Out` también se pinta en el HTTP 500 | ParaBank run 5 | `MF-auth-landing` en `pre-review.ts` + `success_signal` corregido y propagado a los 3 contracts | cerrado |
| D40 | Se instruyó a agentes sin Bash a invocar un script (el arreglo de D36 era prosa a agentes sin manos) | SauceDemo | cubierto por el hook PostToolUse — **pendiente quitar la prosa** de los 2 agentes | cerrado |
| D41 | Colisión locator↔componente en el POM (`TS2300 Duplicate identifier`). Familia de D29, otro eje | SauceDemo | gana el locator, el componente pasa a `<nombre>Component`; 3 tests | cerrado |
| D42 | Aislamiento entre flujos: todos los flujos en un contexto + prefijo de login por flujo → 21 bloqueos falsos de 26. Oculto antes porque otro defecto lo tapaba | OrangeHRM | `copilot/src/dom-walker.ts:5132` (`walker.isolate_flows`, default on); commit `b34e900` | cerrado |
| D43 | El secreto emitido declara su variable y nadie la exporta → `value: expected string, got undefined` ×3. Familia D2 | OrangeHRM | `copilot/src/walk-to-spec.ts:296` (`required_env` + error que dice QUÉ falta); commit `cfdd53c` | cerrado |
| D44 | Un flujo que hereda la sesión del anterior está roto por construcción y el esquema lo daba por válido | OrangeHRM iter. 2 | check de autocontención `copilot/src/check-walk-script.ts --contract=` + `unauthenticated: true`; commit `5c01e2e` | cerrado — visto una sola vez |
| D45 | El `baseURL` por defecto apunta a OTRO sitio: sin `QA_BASE_URL`, tres specs corrieron contra saucedemo con el POM idéntico al verde. Costó dos runs | OrangeHRM | `resolveBaseUrl` en `src/session-policy.ts:99` (env > perfil medido > default con aviso); commit `12492a6` | cerrado — **2 instancias latentes vivas**: `run-s4-mecanico.ts:63`, `lean-run.ts:43` ([genericidad-del-motor.md](../findings/genericidad-del-motor.md)) |
| D46 | `emit_locator` declarado, consumido y probado (con fixture a mano) — **nadie lo producía**. 17/18 pasos y cero specs. La instancia más pura de la familia D2 | ParaBank run 6 | el walker deriva el locator con `css_fallback_attributes` solo si identifica exactamente 1 elemento visible: `copilot/src/dom-walker.ts:2413`; commit `1bec428`. Medido 0→2 specs. Regresión declarada: `config/style-contracts/dolibarr.yaml` | cerrado |
| D47 | `session-policy.ts` declara "sin medición, serializa" y `playwright.config.ts` hace lo contrario. Familia D2 | ParaBank run 6 | — (la regla correcta necesita que el config sepa qué contract corresponde al run) | abierto por decisión de diseño |
| D48 | El idioma de la aplicación lo decide una cabecera que nadie fijaba: misma URL en español con `es-ES`, inglés sin fijar. Explorador y ejecutor pueden mirar DOS aplicaciones | Dolibarr | campo `locale` del contract honrado por config, walker (y su replay), verify-locators y sonda: `src/contract-validator.ts:59`; commit `baab589` | cerrado |
| D49 | El `discovery-analyzer` se inventó una URL (`/user/login.php` → 404, no sale del plan) | Dolibarr | devuelto al productor; dejó el campo vacío con notas | cerrado |
| D50 | El muro de login que no redirige: login servido con 200 en la URL pedida → 74 `unverified` que acusan a locators correctos | Dolibarr | veredicto `unknown` + motivo `login-wall`: `src/scripts/verify-locators.ts:489`; commit `8767e30`. Medido 74 unverified → 82 unknown | cerrado |
| D51 | El manejador de auth da por hecho que el login vive en una URL; aquí hay que PULSAR un perfil (forma de SSO/tenant de banca y seguros) | Dolibarr | `auth.entry_steps` (ruta de entrada declarada en la gramática existente); commit `8767e30`. Medido: bootstrap failed→applied, 0→26 verificados | cerrado |
| D52 | La pantalla que solo existe durante la entrada (el login sin URL) no se verificaba nunca — ahí vivía el defecto de 4 specs | Dolibarr | paso `verify_screen:` dentro de la ruta; commit `8767e30`. Medido: login 0 → 4/4 verificados | cerrado |

## Recuento

**31 cerrados** · **20 abiertos** · **1 criterio permanente (D2)**.

Cerrados con matiz: D3 y D10 sin verificación de campo; D44 visto una sola vez; D45 con dos
instancias latentes vivas; D40 con prosa obsoleta pendiente de retirar en dos agentes.

## Dónde se midió cada bloque

| Sitio | D-números |
|---|---|
| ParaBank (JSP legacy) | D1–D39, D46, D47 |
| SauceDemo | D40, D41; segunda vuelta de D34; no-reproducción de D25 y D38 |
| OrangeHRM (SPA Vue) | D42–D45 |
| Dolibarr (ERP PHP) | D48–D52; primer ejercicio de campo de D34 |
| No es un sitio | D32 (PowerShell 5.1), D33 (suite propia), D40 (config de agentes) |
