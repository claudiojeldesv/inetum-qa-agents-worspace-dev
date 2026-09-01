# Plan — CLI donde el MCP no compensa

**Sustituir el transporte MCP por `playwright-cli` en los DOS puntos donde el envoltorio domina el
coste: el respondedor de rescate y el reconocimiento de sitios vírgenes. El resto del producto no se
toca.**

**Origen**: la investigación del 2026-09-01 sobre coste de envoltorios (el cache-write de arrancar
subagentes es el 47% de la factura del run de 25 casos, y la mayor parte del envoltorio de ~44-94k del
rescate son los ~90 esquemas del MCP `playwright-test`). Playwright 1.60 trae `npx playwright cli` de
serie —dentro de `playwright-core`, expuesto como Skill— con la misma superficie de comandos que el MCP
pero snapshots A FICHERO y ~4-6 líneas de vuelta al contexto por comando.
**Branch**: `design/cli-swap` (decisión del QA: aislar el experimento; coste asumido: re-sincronizar
con `design/kernel-v2` al final). **Estado**: plan aprobado en entrevista, F0 no empezada.

**Interrumpe temporalmente** el estreno manual de los tres workspaces y la Fase 1 de
[plan-rescate-en-proceso.md](plan-rescate-en-proceso.md). **Se retoman al cerrar F3 de este plan** — la
vuelta está escrita en §8 para que no se pierda.

---

## 1. Lo confirmado con banco propio (2026-09-01, este repo, no blogs)

| afirmación | verificación |
|---|---|
| El CLI existe en la 1.60 sin instalar nada | `npx playwright cli` → `playwright-core/lib/tools/cli-client/`; su ayuda dice literalmente «run playwright mcp commands from terminal» |
| La sesión sobrevive entre invocaciones de shell separadas | daemon persistente: login completo de SauceDemo en 6 comandos Bash sueltos |
| Los refs de un snapshot viejo sirven después | `fill e11` funcionó dos invocaciones más tarde |
| `generate-locator` da calidad real | devolvió `locator('[data-test="username"]')` — eligió el testid, no un posicional |
| El snapshot va a fichero, no al contexto | login 160 tok, inventario 1365 tok, en `.playwright-cli/*.yml`; el comando devuelve la RUTA |
| Superficie de herramientas | skill completo ~2.815 tok, cargado bajo demanda — contra ~20-40k de esquemas MCP inyectados en TODO agente que los declare |
| Detalle de entorno que morderá | el default del CLI busca el canal `chrome` del sistema (esta máquina no lo tiene): hay que pasar `--browser=chromium` SIEMPRE |

Las cifras de foros (114k MCP vs 27k CLI, «benchmarks del equipo de Playwright») circulan **sin
metodología publicada**: no entran en este plan como evidencia. Entran las nuestras cuando las midamos.

## 2. Las decisiones de la entrevista (2026-09-01), congeladas

| # | Decisión | Motivo |
|---|---|---|
| **C-a** | Entran DOS puntos: **respondedor de rescate** y **reconocimiento/sondas E2E**. Planner/Generator/Healer nativos quedan FUERA. | Los dos elegidos son envoltorio puro sin lógica de Microsoft dentro. Forkar los nativos rompería «no los reimplementamos» — solo se revisita con dato propio de F1/F2. |
| **C-b** | **Wrapper fail-closed primero** (`qa:browse`): un único punto de entrada que verifica el allowlist ANTES de delegar en el CLI. El CLI crudo no es camino de producto. | El hook PreToolUse matchea `mcp__playwright-test__.*`; un `Bash(playwright-cli goto <url>)` no lo ve nadie y la regla dura #3 (compliance sin override) quedaría rota. Parsear shell arbitrario sería fail-open: inaceptable. |
| **C-c** | Baremo triple: un cambio MCP→CLI se queda si **(1)** reduce ≥50% los tokens facturables, **(2)** paridad o mejora de resultado, **(3)** no empeora el reloj. | Elección del QA (yo proponía solo 1+2). Matiz de método aceptado: el reloj se mide **frío y caliente por separado** — el daemon penaliza la primera invocación y sería injusto medirlo mezclado. |
| **C-d** | Branch nuevo `design/cli-swap`. | Elección del QA (yo proponía seguir en `kernel-v2`): aislar por si hay que descartar entero. Coste asumido y aceptado: sincronización final con kernel-v2 y con el template. |

## 3. Lo que NO cambia (fronteras duras de este plan)

- **El walker no toca el CLI jamás.** Es un `Page` en memoria a 0 tokens; meterle un subproceso por
  acción sería estrictamente peor. Sigue siendo el piso 0 y el cortafuegos de contexto.
- **Planner/Generator/Healer nativos siguen en MCP.** Fuera de alcance por C-a.
- **Reglas duras intactas**: #3 (el wrapper EXISTE para preservarla), #5 (el walker sigue prompt-free;
  quien usa el CLI es el orquestador o un subagente, nunca el kernel).
- **La Fase 1 del plan del rescate (instrumentación + D74) no la sustituye esto.** Son ortogonales: esto
  abarata el respondedor; aquello mide cuándo y por qué se pregunta.

## 4. F0 — la puerta: `qa:browse` fail-closed (prerequisito, nada de CLI en producto sin esto)

`src/scripts/qa-browse.ts` + `npm run qa:browse`. Mismo patrón que `check-compliance.ts`:

1. Extrae el objetivo de la operación (`open`/`goto`/`tab-new <url>`) y lo verifica contra
   `config/allowed-targets.yaml` **antes** de delegar. URL no permitida → exit 2 y NADA se ejecuta.
   Comandos sin URL (click, fill, snapshot…) pasan, pero **solo si hay sesión abierta por el propio
   wrapper** (marcador en `.work/`): el wrapper nunca opera sobre una sesión que él no abrió.
2. Normaliza el entorno: `--browser=chromium` siempre; artefactos (`.playwright-cli/`) redirigidos a
   `.work/browse/<sesión>/` y entrada en `.gitignore`; `-s=<site>` por sitio para no cruzar sesiones.
3. Registra en el audit-log (`phase: browse`) cada invocación con su veredicto — la trazabilidad es la
   misma que la del gate de compliance.
4. **Tests de la puerta** (los primeros del plan): URL fuera del allowlist bloqueada en `open`, en
   `goto` y en `tab-new`; comando de acción sin sesión del wrapper → rechazado; `--browser` forzado;
   artefactos fuera del repo versionado.

**HECHA (2026-09-01)**: [`src/scripts/qa-browse.ts`](../../src/scripts/qa-browse.ts) + `npm run
qa:browse`, 13 tests de la puerta + smoke vivo de 7 pasos. Confirmado en vivo: URL fuera del allowlist
→ exit 2 sin ejecutar; **sesión abierta NO compra la URL** (goto prohibido sobre sesión viva → bloqueo);
acción sin sesión del wrapper → bloqueo; artefactos contenidos en `.work/browse/<sesión>/.playwright-cli/`
con la raíz limpia (HC1 confirmada: el CLI escribe relativo al cwd del CLIENTE, no del daemon); marcador
retirado en `close`; todo en el audit-log con `phase: browse`. Prohibidos verificados: `attach`,
`run-code`, `--cdp`, `--extension`, `--profile`, `--persistent`; engine forzado a chromium. Residual
documentado en el propio script: `eval` puede navegar vía `location.href` — paridad exacta con
`browser_evaluate` del camino MCP, no regresión; cerrarlo es trabajo del hook para AMBOS transportes.

## 5. F1 — pruebas aisladas (banco, sin producto por medio)

Dos A/B, cada uno con su baseline ya medida:

**A/B-1 · el rescate.** La misma petición real (tenemos `rescue-request.json` de EspoCRM preservado y
los 18 del audit-log de los tres ciclos), respondida por los dos caminos:
- **Brazo MCP (hoy)**: subagente general con `tools: *` — el envoltorio medido de ~44-94k.
- **Brazo CLI**: subagente estrecho (`Read, Write, Bash(qa:browse)`) que reproduce la pantalla del
  bloqueo en el sitio vivo (los tres son demos públicas del allowlist), `snapshot --depth`,
  `generate-locator`, y escribe `rescue-response.json`.
- Se mide por brazo: tokens facturables (in/out/cache-write/cache-read vía `qa:cost`), veredicto del
  locator contra el DOM vivo (paridad), reloj frío y caliente.

**A/B-2 · el reconocimiento.** Repetir el recon de UN sitio ya fotografiado (EspoCRM, que tiene el
recon.ts más reciente) usando solo el wrapper: capturas, literales exactos, sondas de entrada. Baseline:
los `recon.ts`/`probe-*.ts` escritos a mano en los tres ciclos (coste: mi tiempo de escribirlos + sus
errores documentados, p. ej. el `label[for="gendermale"]` inexistente). Criterio: cobertura igual
(mismos literales y hallazgos) con menos pasos de orquestador.

Salida de F1: tabla con el baremo C-c aplicado a los dos A/B, en un finding
(`docs/findings/cli-vs-mcp.md`). **Kill criteria**: si el brazo CLI no cumple el baremo en A/B-1, el
respondedor CLI muere aquí y solo sobrevive (si cumplió) el recon.

## 6. F2 — pruebas reales (el producto en un run vivo)

Solo con F1 en verde:

1. **Rescate real**: un run walker+IA sobre uno de los tres sitios con el respondedor CLI contestando
   las peticiones reales del run (las 2-3 que el triaje deje pasar). Comparación directa contra las
   cifras del ciclo E2E de ese sitio.
2. **Recon real**: el próximo terreno virgen (cuando toque) se reconoce con el wrapper desde el minuto
   cero — nada de scripts a mano. Si no hay sitio nuevo a tiempo, se repite Tricentis como ensayo
   general y se compara contra su dossier.
3. Todo run de F2 emite sus números por `qa:cost` y alimenta el finding.

## 7. F3 — el estreno del QA

Tú pruebas el camino entero en uno de los workspaces de campo (propongo `crm`, que tiene el
`rescue-request.json` pendiente de verdad): lanzas el run, el rescate se responde por CLI, y evalúas
tres cosas que ninguna métrica mía contesta — si el locator propuesto te merece confianza, si el
audit-log te deja reconstruir qué miró la IA, y si el reloj se siente mejor o peor que antes.

## 8. La vuelta al plan anterior (para que no se olvide — petición explícita del QA)

Al cerrar F3, **en este orden**:

1. Merge o descarte de `design/cli-swap` según el baremo (decisión del QA con el finding delante).
2. **Estreno manual de los tres workspaces** (`qa\rbp`, `qa\tri`, `qa\crm`) — pendiente desde el tercer
   ciclo; los comandos de arranque están al final de la conversación del 2026-08-31 y los workspaces
   sellados en `28e596f`.
3. **Fase 1 del plan del rescate** (instrumentación + D74), que este plan no sustituye.
4. Fase 2 (pausa en proceso) — que ahora tendría el respondedor barato que le faltaba, si F1/F2 lo
   confirman.

## 9. Pares falsables

| # | Hipótesis | Qué la mata |
|---|---|---|
| **HC1** | La puerta fail-closed es construible: URL verificada antes de ejecutar, sesiones aisladas, artefactos contenidos | el CLI no permite redirigir artefactos o aislar sesiones → STOP en F0 |
| **HC2** | El respondedor CLI cumple el baremo triple contra el subagente MCP en las mismas peticiones | <50% de ahorro, o peor paridad, o peor reloj caliente → muere el respondedor CLI |
| **HC3** | El recon por wrapper iguala la cobertura de los scripts a mano con menos turnos | literales o hallazgos que el recon manual sí sacó y el CLI no |
| **HC4** | El reloj caliente del daemon es competitivo con el MCP vivo | la latencia por comando (subproceso+daemon) supera de forma consistente a la llamada MCP equivalente |
| **HC5** | El daemon no introduce estado fantasma entre A/B (sesiones cruzadas, cookies heredadas) | un brazo B contaminado por el brazo A → hay que matar el daemon entre brazos y re-medir |
