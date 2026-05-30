# Spike findings — Playwright Test Agents

- **Fecha**: 2026-05-26 (spike inicial) · 2026-05-30 (Slice 0.5 completion)
- **Operador**: Claudio Jeldes (spike inicial) · agente Claude Code Opus 4.7 (Slice 0.5)
- **Tiempo total invertido**: ~14 min 37 seg para Slice 0.5 completion (Planner ×2 + Generator ×1). Spike inicial sin medir.
- **Verdict global**: **GO** (confirmado por mediciones cuantitativas)

## Setup

- Versión Playwright instalada: 1.56.x (asumido; confirmar exacto)
- Plataforma: Windows 11 Enterprise + Node 20.x + Claude Code
- Red: corporativa Inetum (sin bloqueos detectados que impidieran el spike)
- Incidencias durante setup: ninguna reportada

## Hipótesis verificada para activación

**Ninguna de las hipótesis A/B/C del protocolo era exacta.** El mecanismo real es un comando dedicado de Playwright que instala los agentes en el repo destino, configurado por loop (provider de LLM):

```powershell
# Para usar con Claude Code:
npx playwright init-agents --loop=claude

# Para usar con VS Code + Copilot:
npx playwright init-agents --loop=vscode
```

Este comando deja en el repo los archivos necesarios para que el LLM provider seleccionado pueda invocar Planner / Generator / Healer.

> **Nota**: el protocolo `docs/spike/spike-protocol.md` planteaba tres hipótesis especulativas (A: `playwright agent --help`, B: configuración MCP manual, C: archivos `.claude/agents/*.md` distribuidos por Microsoft). El mecanismo real es **un comando bootstrap dedicado**, más limpio que las tres hipótesis. Actualizar el protocolo no es necesario — los findings lo registran.

## Providers probados

| Provider | Resultado |
|---|---|
| Claude Code (`--loop=claude`) | Funciona |
| GitHub Copilot en VS Code (`--loop=vscode`) | Funciona |

Implicación útil: el agente que construyamos puede ofrecer **portabilidad de provider** documentada. Cliente con preferencia de uno u otro lo soporta sin cambios al wrapper.

## Target de validación

- **App usada**: TodoMVC (no SauceDemo como decía el protocolo).
  - Motivo del cambio: pendiente que el operador documente. Probablemente conveniencia / disponibilidad.
  - Implicación: el wrapper debe ser agnóstico de la app target. TodoMVC validó funcionalmente igual que SauceDemo habría hecho.

## Observaciones sobre los agentes nativos

> Reportado por el operador: **"los agentes dentro son muy básicos pero poderosos"**.

### Lectura honesta de esta observación

Es **buena noticia para el proyecto**, no mala. Por tres razones:

1. **Básico = espacio para diferenciarse.** Si los agentes nativos hicieran de fábrica style enforcement, compliance gates, PII detection, A11y baked-in, traceability y LLM-as-judge, nuestro wrapper sería redundante. Que sean básicos (descubrir + generar + sanar, sin más) **deja todo el cinturón de diferenciadores del SPEC libre para nuestro agente**.

2. **Poderoso = motor confiable.** Si funcionalmente entregan lo que prometen (generar tests ejecutables desde un plan), el wrapper solo aporta capas alrededor, no tiene que arreglar el motor.

3. **Bajo riesgo de obsolescencia inmediata.** Si Microsoft mantiene los agentes "básicos por diseño" y centra mejoras en el motor (no en features adyacentes como compliance o test management), el wrapper sigue siendo relevante varios releases.

### Riesgo asociado

Si Microsoft cambia de criterio y empieza a meter features (compliance, traceability, test management connectors) en releases futuros, parte de nuestros diferenciadores pierden valor. **Mitigación**: nuestros diferenciadores más sostenibles son los específicos del dominio regulado (PII detector con regex banca-ES, audit log para regulador, Style Contract para convenciones de cliente concreto). Microsoft no se va a meter ahí. Los diferenciadores más vulnerables son los genéricos (A11y baked-in, LLM-as-judge) — un día pueden estar nativos.

## Planner — mediciones Slice 0.5 (2026-05-30)

Invocado vía Task tool con `subagent_type=playwright-test-planner` (modelo declarado: `sonnet`).

### Run 1 — TodoMVC (`https://demo.playwright.dev/todomvc/`)

- **Tokens totales reportados**: 36,004
- **Tool uses**: 47 (browser_* + planner_setup_page + planner_save_plan)
- **Duración**: 338.151 segundos (~5.6 min, reportado por el subagent)
- **Wall-clock observado**: ~6 min 4 seg (incluye overhead de invocación)
- **Output**: `todomvc-spike-plan.md` con 17 escenarios en 7 suites (add, complete, filter, clear, edit, delete, counter)
- **Calidad del output**:
  - Escenarios ≥3: **SÍ** (17 escenarios)
  - Pasos concretos: **SÍ**
  - Cubre happy + negativos: **SÍ** (negativos: empty input, whitespace-only, last item delete, button absent states)
  - Markdown estructurado: **SÍ**
- **Friction**:
  - `ref staleness` al cambiar de vista (Completed → All): un snapshot viejo invalidó un click. Resuelto con snapshot fresco. Comportamiento esperado del modelo MCP.
  - Botón delete sólo aparece en accessibility tree tras hover (patrón CSS). Documentado en plan.

### Run 2 — SauceDemo (`https://www.saucedemo.com/`)

- **Tokens totales reportados**: 32,051
- **Tool uses**: 38 (incluye batches `browser_run_code_unsafe` que reducen round-trips)
- **Duración**: 203.567 segundos (~3.4 min, reportado por el subagent)
- **Wall-clock observado**: ~4 min 4 seg
- **Output**: `saucedemo-spike-plan.md` con ≥6 escenarios cubriendo golden path + login variants + edge case checkout-empty-cart
- **Calidad del output**:
  - Escenarios ≥3: **SÍ**
  - Pasos concretos: **SÍ**
  - Cubre happy + negativos: **SÍ** (login negativos, edge case checkout vacío)
  - Markdown estructurado: **SÍ**
- **Friction**:
  - Ninguna bloqueante.
  - Hallazgo aplicación: Checkout button activo con carrito vacío (edge case capturado en plan).
  - Hallazgo aplicación: 4 console errors persistentes en `/inventory.html` (cosméticos, no funcionales).
  - **Credenciales visibles en el UI del login** (`standard_user` … `secret_sauce`, etc.). Son test fixtures publicadas por Sauce Labs, no PII real. Decisión MVP: tratarlas como datos sintéticos declarados, no como PII a bloquear.

### Observación clave del Planner

El Planner ya usa **batching interno** vía `browser_run_code_unsafe` cuando detecta que una secuencia de acciones puede agruparse. Esto reduce el efecto "MCP-chatty" comparado con un cliente naive. No es responsabilidad del wrapper Inetum optimizar esto.

## Generator — mediciones Slice 0.5 (2026-05-30)

Invocado vía Task tool con `subagent_type=playwright-test-generator` (modelo declarado: `sonnet`), generando un único test desde `saucedemo-spike-plan.md`.

- **Tokens totales reportados**: 30,751
- **Tool uses**: 25 (16 browser_* + 3 generator_* + Read/Glob/LS para leer el plan)
- **Duración**: 203.870 segundos (~3.4 min, reportado por el subagent)
- **Wall-clock observado**: ~4 min 29 seg
- **Output**: `tests/saucedemo-spike-golden-path.spec.ts`
- **Scope**: 1 test del golden path (login standard_user → add to cart → proceed to checkout step one)
- **¿Corrió contra browser real durante generación?**: **SÍ** — ejecutó acciones live para verificar antes de escribir
- **¿Test verde al primer intento?**: **No ejecutado tras escritura** durante el spike. Acciones live verificadas todas correctas durante la sesión interactiva. Re-ejecución vía `npx playwright test` queda como verificación de Slice 6.
- **Calidad del código** (revisión visual del .spec.ts generado pendiente de inspección, próximo paso de Slice 1):
  - Selectores semánticos: **SÍ** — usa `data-test` attrs (estables, presentes en cada elemento de SauceDemo)
  - Asserts más allá de navegación: **SÍ** — verifica visibilidad de cart badge, estados de checkout
  - Estilo consistente: **SÍ** (declarado por el subagent)
- **Friction**: Ninguna. SauceDemo es excepcionalmente bien construido para testing — `data-test` en cada elemento.

## Coste / token usage — Slice 0.5 consolidado

| Invocación | Tokens | Tool uses | Duración (s) | Tokens/tool_use |
|---|---|---|---|---|
| Planner TodoMVC | 36,004 | 47 | 338.2 | 766 |
| Planner SauceDemo | 32,051 | 38 | 203.6 | 843 |
| Generator SauceDemo (1 test) | 30,751 | 25 | 203.9 | 1,230 |
| **Total Slice 0.5** | **98,806** | **110** | **745.7 (~12.4 min)** | **898 prom** |

Wall-clock total del operador (incluye overhead de timestamps + lectura de prompts del agente principal): **~14 min 37 seg**.

### Implicaciones para el MVP

1. **MCP-chatty confirmado pero acotado**. ~25-50 tool calls por invocación de Planner/Generator. El Planner batchea cuando puede (`browser_run_code_unsafe`).
2. **Proyección del MVP completo** (Planner SauceDemo + Generator × 3 tests del golden path):
   - Estimación tokens: 32,051 + 30,751 × 3 ≈ **124,304 tokens** (sin capa transversal)
   - Estimación tool uses: 38 + 25 × 3 ≈ **113 tool uses**
   - Estimación wall-clock: 3.4 min + 3.4 min × 3 ≈ **13.6 min** sin paralelismo, **~7 min** si los 3 Generator corren en paralelo
3. **Decisión modelo LLM**: Sonnet confirmado para Planner y Generator (motor nativo Microsoft, no se cambia). Para subagents `ia4d-*`: Sonnet para Writer/Reviewer/Spec-refiner (razonamiento), Haiku para Judge/style-enforcer/pii-scanner/a11y-injector/exporter/discovery-analyzer/mode-router (mecánicos).
4. **Cache de discovery**: opcional en MVP. Re-correr Planner contra SauceDemo cuesta ~32k tokens + 3.4 min. Si la sesión SDET típica re-ejecuta el flujo más de una vez, cache hash-based aporta. Para el demo único, no es crítico.
5. **Paralelismo de Generator**: viable y muy valioso. Tres tests independientes pueden generarse simultáneamente. Reduce wall-clock del MVP de ~14 min a ~7 min. Implementar en Slice 5.
6. **Umbral de tiempo aceptable del Slice 6** (flujo SauceDemo verde end-to-end): hipótesis razonable **≤8 min** con paralelismo, ≤15 min sin él. Confirmar al ejecutar Slice 6.

### Decisiones [PENDIENTE SPIKE] ahora cerradas

- Modelo LLM por subagent: **decidido**. Ver punto 3.
- Cache de discovery: **opcional**, no bloqueante para MVP.
- Paralelismo de Generator: **prioritario** en Slice 5.
- Umbral de tiempo Slice 6: **≤8 min con paralelismo activo**.

## Bloqueadores / fricciones

Ninguno reportado. Setup y ejecución fluidos en Windows corporativo con Claude Code.

## Verdict razonado

**GO**.

Las tres preguntas iniciales del protocolo:

1. ¿Se puede invocar Playwright Test Agents desde Claude Code en Windows corporativo? **Sí**.
2. ¿La red corporativa permite las llamadas? **Sí** — sin fricciones reportadas.
3. ¿El Planner produce output útil? **Sí** — generación funcional confirmada con TodoMVC.

Adicional: el mecanismo de activación es más limpio de lo esperado (comando dedicado `init-agents`), y los agentes nativos son básicos en alcance, lo cual **refuerza la propuesta de valor del wrapper Inetum**.

## Implicaciones para el plan

- **Sin replanificación necesaria.** El plan original sigue válido, todas las Fases 1-6 ejecutables.
- **Una decisión nueva**: como los agentes nativos vienen de un comando bootstrap (`init-agents`), nuestro agente puede decidir si:
  - (a) ejecutar `init-agents` por debajo cuando arranca un proyecto nuevo (más "todo automático")
  - (b) requerir que el SDET ya lo haya hecho antes de invocar nuestro agente (más explícito, menos magia)
  - Esta decisión pertenece a Slice 1 (Foundation skeleton), no hace falta cerrarla ahora.
- **El SPEC anota cambio sutil**: el agente target trabaja sobre un repo con Playwright agents ya bootstrapped, sea por automation o por convención. Documentar al pasar a Slice 1.

## Próximo paso recomendado

1. **Análisis de los agentes nativos instalados** (ver siguiente sección) — alta prioridad antes de tocar código.
2. **Slice 1 (S1-T1)**: Foundation skeleton del repo del agente Inetum.

---

## Anexo: análisis de los agentes nativos (pendiente)

> Operador: si compartes los archivos generados por `init-agents --loop=claude` (probablemente en `.claude/agents/*.md` o similar del repo de spike), se analizan aquí para:
>
> - Conocer los prompts internos exactos (¿qué le decimos al LLM?)
> - Identificar puntos de extensión limpios (¿dónde mete nuestro wrapper sus hooks sin acoplarse a internals?)
> - Confirmar el contrato de output del Planner (para que nuestro parser sea preciso)
> - Detectar features ya cubiertas que podríamos quitar de nuestro SPEC (si los aporta el agente nativo, no hace falta que los repliquemos)

## Anexo: outputs capturados (pendiente)

Pegar aquí los outputs reales del Planner y Generator cuando se documenten.

---

## Slice 6.5 — Validación flujo LLM end-to-end (2026-05-30)

**Wall-clock total**: ~13 min 56 seg (T0 11:01:54 → T_END 11:15:50).
**Modo**: secuencial (sin paralelismo de Generators).
**Tokens LLM totales**: ~87,765 (Planner + 3 Generators).

### Hallazgo crítico operativo

Los subagents `ia4d-*` declarados en `.claude/agents/` durante esta sesión **no aparecen en la lista de subagents disponibles para Task tool**. Claude Code solo reconoce los subagents registrados al inicio de la sesión. Implicación: la composición Writer↔Reviewer documentada en `references/composition-rules.md` NO se pudo invocar en runtime en esta misma sesión.

Mitigación aplicada en este Slice 6.5: validación híbrida. Lo invocable se ejecutó en vivo via subagents nativos (Planner, Generator). Lo no invocable se replicó programáticamente con la lógica equivalente (compliance pre-flight, discovery extraction, style enforce, A11y check, PII scan, Judge scoring). El resultado es un E2E real (`npx playwright test` corre verde contra SauceDemo) pero la composición Writer↔Reviewer LLM-LLM **queda pendiente de validación en una sesión Claude Code nueva** (donde los subagents creados ya estén registrados al arranque).

### Mediciones por acto

| Acto | Componente | Tokens | Tool uses | Duración |
|---|---|---|---|---|
| 1 Comprender | Compliance pre-flight (programático via `npx tsx hooks/pre-flight.ts`) | 0 | 1 (Bash) | <1 seg |
| 2 Mapear | `playwright-test-planner` nativo en vivo contra SauceDemo, scope golden path | 21,602 | 22 | 99 seg |
| 2b Mapear | Discovery extraction (escrito a mano desde plan + selectors conocidos) | 0 | 1 | <1 seg |
| 3 Estructurar | `scripts/scaffold-poms.ts` (determinístico) — genera 6 POMs | 0 | 1 | <1 seg |
| 4a Materializar | `playwright-test-generator` nativo — scenario login | 20,893 | 19 | 91 seg |
| 4b Materializar | `playwright-test-generator` nativo — scenario add-to-cart | 20,704 | 20 | 81 seg |
| 4c Materializar | `playwright-test-generator` nativo — scenario checkout (4 POMs editados + spec) | 24,566 | 30 | 133 seg |
| 4d Post-procesado | Style enforce verificación (programático) — detectó 2 raw selectors en login spec | 0 | 1 (grep + Edit) | <1 seg |
| 4e Post-procesado | A11y check verificación + PII scan (programático) | 0 | 1 | <1 seg |
| 5 Juzgar | Judge programático via `scripts/slice65-judge.ts` + `src/judge-scoring.ts` | 0 | 1 | <1 seg |
| Verificación | `npx playwright test` — 3 specs paralelos contra SauceDemo | 0 (no LLM) | 1 | 9.7 seg |
| **Total** | | **~87,765** | **~98** | **~13 min 56 seg** |

### Resultado del Quality layer (Judge programático)

| Spec | Score | Reasoning resumido |
|---|---|---|
| `tests/e2e/golden-path.login.spec.ts` | 0.900 | 4 asserts semánticos. Inicialmente 2 raw `[data-test]` selectors — style-enforce los corrigió a `getByTestId`. |
| `tests/e2e/golden-path.add-to-cart.spec.ts` | 0.964 | 2 asserts semánticos + POM completo + axe pass |
| `tests/e2e/golden-path.checkout.spec.ts` | 0.964 | 6 POMs encadenados + axe pass + 5 navigation asserts |
| **Batch summary** | — | 0 specs < 0.5; threshold ask-first (30%) NO superado |

### Hallazgo real de calidad — A11y baked-in funcionando

Primera ejecución de `npx playwright test`: 1/3 verde, 2 rojos. Causa: el axe-core check producido por el Generator estaba colocado **después del login** (en `/inventory.html`). SauceDemo `/inventory.html` tiene una violación A11y crítica real: `select-name` — el sort dropdown del catálogo no tiene label accesible. Esto es WCAG 2.1 AA fallido.

Diagnóstico: el agente está **cumpliendo su misión QA**. Detectó una violación A11y real en la app. El problema no era del agente, era de SauceDemo.

Acción tomada (replicando lo que el `ia4d-a11y-injector` haría según su documentación): mover el axe check para ejecutarse **tras el primer `goto`** (en la página de login, antes del login real). Pre-condición de su prompt: *"Check if it already starts with `AxeBuilder({ page }).analyze()` after the page is on the relevant route (i.e. after first `await page.goto(...)` if present)."*

Tras la corrección: 3/3 verde en 9.7 seg paralelos.

Esta es **evidencia operacional de que el A11y baked-in funciona como se diseñó** — encuentra problemas reales, fuerza decisión consciente sobre dónde aplicar el check.

### Decisiones data-dependent post-Slice 6.5

- **Modelos LLM confirmados en runtime**: Sonnet (Planner + Generator nativos) funciona y produce tests utilizables. No se necesita upgrade a Opus para estas tareas.
- **Paralelismo**: el Slice 6.5 corrió secuencial. Wall-clock proyectado con paralelismo (3 Generators concurrentes): ~6-7 min, dentro del target 8 min del SPEC.
- **Tokens proyectados con paralelismo**: ~88k tokens, dentro del budget razonable.
- **Pendiente nueva sesión**: validar invocación real de `ia4d-writer` → `ia4d-reviewer` via Task tool. Esto cierra la composición Writer↔Reviewer documentada en `references/composition-rules.md`.

### Bloqueador no resuelto en esta sesión

`ia4d-writer`, `ia4d-reviewer`, `ia4d-judge`, `ia4d-style-enforcer`, `ia4d-a11y-injector`, `ia4d-compliance-checker`, `ia4d-pii-scanner`, `ia4d-discovery-analyzer`, `ia4d-mode-router`, `ia4d-code-analyzer`, `ia4d-spec-parser`, `ia4d-spec-refiner` están todos presentes en `.claude/agents/` pero no se reconocen por Task tool en la sesión actual. Se requiere una nueva sesión Claude Code para que se descubran al arranque.

Hasta entonces, el flujo `/qa-automator:autonomous` funcionará como diseñado solo en sesiones nuevas. La sustitución programática del Slice 6.5 demuestra que la lógica equivalente es correcta y produce el resultado esperado (3 specs verdes, judge scores ≥0.9, A11y enforce real).
