# Operativa del módulo S4 Autonomous — detalle de referencia

Material operativo desplazado de `.claude/commands/qa-automator/autonomous.md` (Fase 2 token-efficiency,
2026-07). El command conserva las reglas y los pasos; aquí vive el detalle que solo se necesita en
situaciones concretas (warning de modo ciego, tabla del checkpoint, ejemplos shell del verification,
casuística de recovery). **Carga lazy**: el orquestador lee este doc solo cuando el paso lo remite aquí.

## §1 — WARNING de modo ciego (paso 5.b), texto de referencia

Cuando el run llega sin `--flows/--entry/--ignore`, el command NO explora y muestra:

> ⚠️ Vas a lanzar el reconocimiento autónomo SIN acotar por módulos.
> En webs medianas o grandes esto satura el contexto del agente y baja la
> calidad del plan (un caballo sin riendas). Recomendado: indica los módulos
> o flujos a cubrir, p.ej. `--flows=login,checkout`.
>
> Responde con los flujos a cubrir, o escribe EXACTAMENTE `EXPLORAR SIN ACOTAR`
> para continuar en modo ciego bajo tu responsabilidad.

Por qué: en webs medianas/grandes la exploración ciega satura la ventana de contexto del planner con
casuística irrelevante y degrada la calidad del plan. Acotar por módulos no es una optimización
opcional — es la rienda. Fase B midió 10 tool-uses (dirigido) vs 62 (ciego) en Toolshop.

## §2 — Tabla del checkpoint 2.5 (formato de ejemplo)

```
El descubrimiento devolvió <total> escenarios; el cap es <max>. Selecciona cuáles materializar.

#     ID            Escenario (slug)                Naturaleza  Tags                  Rank  Crit.
1     MAPFRE-T1234  inicio-sesion.usuario-valido    principal   @smoke @critical      1     critical
2     nuevo         inicio-sesion.usuario-bloqueado negativo    @regression @negative 2     critical
3     nuevo         pago.compra-completa            principal   @smoke @critical      3     critical
...
```

> Selecciona los escenarios a materializar por su `#` (ej. `1,2,3`), o escribe `TOP` para los <max> de
> mayor rank, o `TODOS` para ignorar el cap bajo tu responsabilidad. Puedes editar tags con `3:@regression,@negative`.

La columna `ID` muestra el ID actual del registro `tc_registry` si el slug ya existe, o `nuevo`. Un
`*` tras el ID (ej. `TC-004*`) marca una **reconciliación de drift** (Q4): el slug es nuevo pero el
caso ya estaba registrado con otro nombre (mismo feature + naturaleza + pantalla de destino, candidato
único) — el ID se reusa y el slug viejo pasa a `aliases`; la leyenda bajo la tabla lo detalla. Un slug
nuevo con VARIOS candidatos registrados no se reconcilia (ID nuevo) y el empate sale en el bloque
`ambiguous` del output para que el QA lo revise.

## §3 — Verification step: ejemplos shell y detalle

**`seed.spec.ts`**: es el scaffold que el MCP `playwright-test` resiembra en cada `setup_page`
(Planner/Generator); solo sirve durante la generación. Si queda en `testDir`, corre como un test vacío
siempre-verde y contamina el output y el reporte Allure. Decisión QA: eliminarlo, no ignorarlo.

**`allure-results` se limpia solo**: el `globalSetup` de `playwright.config.ts`
(`playwright.global-setup.ts`) vacía `<workDir>/allure-results` al inicio de cada `npx playwright test`.
El reporte refleja SOLO esta corrida — sin `rm` manual, sin acumular runs viejos (duplicados /
`skipped` rancios). El reporte final es single-file y no acumula Trends entre runs (trade-off asumido —
ver `/ia4d-qa-automator:report`).

**Evidencia visual (`evidence.level`)**: el Writer ya estructuró el `.spec.ts` según el level; el run
solo mapea a env-vars:
- `minimal` → `QA_SCREENSHOT` = `evidence.screenshots` si difiere del default `only-on-failure`.
- `steps` → igual que minimal (los pasos viven en el código, no en config).
- `full` → `QA_SCREENSHOT=on` **y** `QA_TRACE=on`: estado final + trace navegable que Allure embebe,
  además de los screenshots por paso que el propio test adjunta.

Es política de run-time: el reporte solo muestra lo que el run capturó.

**Ejemplos shell** (siempre: `QA_WORK_DIR='.work/<site-id>'` + filtrar por `tests/e2e/<site-id>/`):

```sh
# Sin auth (PowerShell):  $env:QA_WORK_DIR='.work/<site-id>'; $env:QA_BASE_URL='<--url>'; npx playwright test tests/e2e/<site-id>/ --reporter=list
# Sin auth (bash):        QA_WORK_DIR='.work/<site-id>' QA_BASE_URL='<--url>' npx playwright test tests/e2e/<site-id>/ --reporter=list

# Con auth (PowerShell):
#   $env:QA_WORK_DIR='.work/<site-id>'; $env:QA_BASE_URL='<--url>'; $env:QA_STORAGE_STATE='playwright/.auth/<project>.json'; npx playwright test tests/e2e/<site-id>/ --reporter=list
# Con auth (bash):
#   QA_WORK_DIR='.work/<site-id>' QA_BASE_URL='<--url>' QA_STORAGE_STATE='playwright/.auth/<project>.json' npx playwright test tests/e2e/<site-id>/ --reporter=list

# Con evidencia visual para Allure (contract: evidence.level: full).
# OJO: SIN --reporter=list — el flag CLI sobrescribe los reporters del config y suprime
# allure-results/, dejando a /ia4d-qa-automator:report sin nada que enriquecer.
#   (PowerShell)  $env:QA_WORK_DIR='.work/<site-id>'; $env:QA_BASE_URL='<--url>'; $env:QA_SCREENSHOT='on'; $env:QA_TRACE='on'; npx playwright test tests/e2e/<site-id>/
#   (bash)        QA_WORK_DIR='.work/<site-id>' QA_BASE_URL='<--url>' QA_SCREENSHOT='on' QA_TRACE='on' npx playwright test tests/e2e/<site-id>/
```

`QA_BASE_URL` es obligatoria: los POM usan `goto('/')` relativo; sin ella el `baseURL` del config cae
al default SauceDemo (hallazgo Fase B sitio 2). Con auth, `QA_STORAGE_STATE` activa el setup project +
`dependencies` en `playwright.config.ts` — el `auth.setup.ts` corre primero y los specs heredan el
estado; ya no hace falta `--workers=1` (el dependency garantiza el orden bajo `fullyParallel`).

## §4 — Casuística del planner por-flujo (paso 6 / guarda 6.5)

**Por qué por-flujo y secuencial**: el planner nativo se cuelga si se le pide mapear muchos flujos de
una vez (hallazgo: ~1h colgado con 6 flujos). No hay timeout programático sobre un subagente Task —
acotar a un flujo ES la mitigación (navegación corta → retorna en minutos). Nunca en paralelo: los
planners comparten el navegador del MCP vía `planner_setup_page`; concurrentes colisionan.

**Por qué la guarda anti-fabricación**: si el MCP `playwright-test` no está conectado, el planner se
queda sin tools de navegador (`mcp__playwright-test__browser_*`) y, en vez de fallar, puede fabricar
un plan adivinado o colgarse sin retornar. Las tres señales de discovery real (fragmento guardado con
`planner_save_plan`, uso de tools de navegador en el resumen, locators/URLs concretos del sitio) son
la evidencia mínima de que navegó de verdad.

**Rescate con MCP directo** (opción 2 del recovery): el orquestador mapea el flujo él mismo con
llamadas MCP (`browser_*`) pantalla por pantalla — navegación real, locators reales, cumple el
espíritu de la guarda. Aviso: consume la ventana de contexto del orquestador; no recomendado en runs
grandes.

## §5 — Namespace por sitio (paso 5.c): origen

Hallazgo que motivó la regla: el discovery de un sitio quedó mezclado con otro; specs de varios sitios
convivían en `tests/e2e/` y hubo que filtrar a mano. La excepción de `compliance-verdict.json` (vive en
`.work/` plano) existe porque el compliance corre ANTES de que el paso 5.c defina el namespace. La
limpieza de arranque de `<workDir>` sustituye al hack de "detectar y sobrescribir el stale".

## §6 — Rationale del discovery-analyzer (naming, criticidad, cobertura)

Justificación de las reglas que el prompt de `ia4d-discovery-analyzer` enuncia escuetas:

- **"Happy path" no se nombra**: la naturaleza positiva es el default implícito de todo flujo; nombrarla
  contamina slugs/títulos y rompe la estabilidad del `scenario_slug` como clave del `tc_registry`. Solo
  el negativo se marca, y únicamente en el tag `@negative`.
- **Sin glosario de sector hardcodeado**: los términos QA españoles se derivan de una semilla
  transversal (login→`inicio-sesion`, search→`busqueda`…) + inferencia del dominio del sitio
  (e-commerce: checkout→`pago`; banca: transfer→`transferencia`; seguros: quote→`tarificacion`).
  Hardcodear keywords de sector fabrica criticidad; inferir del propósito la ancla a la realidad.
- **Negativos derivados, no inventados**: un negativo sale de un fixture negativo declarado
  (`invalid_credentials`, credencial `locked_out`) o de validación evidente sobre la MISMA pantalla
  descubierta. Son caminos alternativos de pantallas descubiertas — no violan
  `no_assume_undiscovered_flows`. Si no hay material, se omite y se dice en el `rationale`.
- **El analyzer no asigna IDs ni trunca**: separación de poderes — el analyzer propone (slug, rank,
  tags, criticidad), el command dispone (cap, checkpoint, resolución de IDs contra el registro).
