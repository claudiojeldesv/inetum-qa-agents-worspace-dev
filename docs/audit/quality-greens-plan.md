# Plan carril calidad — suites verdes sin degradar la Quality layer

**Origen**: puntos de revisión abiertos al cierre del carril token-efficiency (§7.1 y §8.1 de [token-efficiency-audit-2026-07.md](token-efficiency-audit-2026-07.md)). **Branch**: `design/quality-greens`, creado DESDE `design/token-efficiency` (hereda F1-F7; ese branch no se mergea a main todavía). **Ejecución**: una sesión nueva por fase, este documento como contrato; la ventana de plan no ejecuta.

**KPI principal (decisión QA 2026-07-22): verdes post-Healer 5/5** — la promesa de producto es que la suite entregada corre verde. Secundario: verdes a la primera (eficiencia de generación; hoy 0-3/5 según run).

**Guardrails — "conservar la calidad sin degradarla" (no negociables en este carril)**:
- La Quality layer no se toca: Writer/Reviewer en Sonnet, ping-pong N≤2, pre-review determinístico, Judge off. Cualquier cambio de prompt pasa A/B congelado si puede alterar verdicts.
- approved-rate del Reviewer y must-fix no empeoran vs el brazo de control (F6 brazo A: 4/4 iter 0, 0 must-fix).
- Coste/run dentro de ~$11 ± ruido (el carril calidad no re-infla lo que token-efficiency bajó). Medición con el protocolo enmendado del plan anterior (`parse-usage.mjs`, `total_cost_usd` del CLI).
- Los subagents nativos de Microsoft no se editan. Las mitigaciones de planner viven en el prompt por-flujo que construye el command, el post-proceso del discovery-analyzer o guardas determinísticas nuestras.

---

## Fase Q1 — Fixes ciertos + Healer medido

**Estrategia (decisión QA)**: Healer primero, prevención después — coherente con el principio "sanación al final" (Fase A) y cierra el gap de dato: el workspace actual nunca ha ejecutado ni medido el Healer.

1. **Prompt del Writer — patrón axe explícito**: añadir la línea dura con la ÚNICA API válida (`import AxeBuilder from '@axe-core/playwright'` + `new AxeBuilder({ page }).analyze()`; no existen `injectAxe`/`getViolations`/paquete `axe-playwright`). Clase sistemática identificada en F6 (3/4 specs); barata, previene también con Sonnet en días malos. Se propaga a template.
2. **Prompt del Reviewer — formato de escritura del feedback**: el fichero per-spec se escribe con UN objeto JSON (Write completo, no append; en iteración 2 sobreescribe con el estado final). Mata el origen de la familia "objetos concatenados" (F4); el consumidor tolerante se queda como red.
3. **pom-scaffolder — locators hardcodeados fuera**: eliminar los locators que el scaffolder inyecta sin respaldo del discovery (`menuButton`/`title`/`logo`/`orderSummary`, hallazgo F2). El esqueleto solo declara lo que el discovery vio; lo demás es del Writer con evidencia. Test unitario de la regla.
4. **Healer medido (la pieza nueva)**: run baseline S4 SauceDemo → sobre los rojos reales, invocar `playwright-test-healer` (nativo) por spec rojo, instrumentado: tokens/$ por spec sanado, tasa de éxito, wall-clock, y si la sanación respeta el Style Contract (pasar el spec sanado por pre-review + Reviewer — el Healer NO es juez, su output se audita igual). Con el dato, decidir la productización (¿paso opcional del command? ¿command aparte `/qa-automator:heal`?) — decisión QA al cierre de la fase, no antes.

**Criterio de salida**: KPI principal demostrado — **5/5 verdes post-Healer** en el baseline, con guardrails intactos y el coste del Healer medido y documentado (entra al marco €/run del informe §7 como línea real, no estimación).

**Commit**: `feat(qa-automator): fase Q1 quality-greens — fixes writer/reviewer/scaffolder + healer medido`

---

## Fase Q2 — Prevención (causas raíz de los rojos)

Objetivo: reducir la carga del Healer atacando las dos clases verificadas contra el sitio real (F4).

1. **Guarda determinística de locators del discovery** (la clase cart): script `src/scripts/verify-locators.ts` que, tras el discovery, resuelve cada locator del `discovery-report.json` contra el DOM real (playwright headless, `locator.count()`): los que no resuelven se marcan `unverified` y el Writer tiene prohibido usarlos sin TODO. Caza `getByRole('generic')` sin accessible name y cualquier locator fantasma, antes de generar. Coste: una pasada de navegador sin LLM.
2. **Prompt por-flujo del planner (lo nuestro, no el agente nativo)**: exigir evidencia de estado para observaciones condicionales — "documenta atributos/clases de estados de error SOLO si navegaste ese estado; si no, márcalo como no-verificado". Ataca la clase "clase `error` siempre presente" (F4). Validar con A/B congelado si cambia el contenido del plan.
3. **discovery-analyzer — degradar lo no verificable**: los elementos sin locator semántico verificable bajan de prioridad o se marcan, en vez de entrar silenciosamente al catálogo de selectores del Writer.

**Criterio de salida**: verdes a la primera ≥4/5 en baseline (secundario convertido en objetivo de la fase), carga del Healer reducida vs Q1, guardrails intactos.

**Commit**: `feat(qa-automator): fase Q2 quality-greens — verify-locators + evidencia de estado en planner/discovery`

---

## Fuera de plan (explícito)

- Re-abrir cualquier decisión del carril token-efficiency (Writer/main Haiku, reviewer de lote) — cerradas con dato.
- Editar los subagents nativos de Microsoft.
- Tocar reglas duras de producto (compliance, Writer+Reviewer, gates off por defecto).
- Naming/cobertura S4 pendientes de otra conversación (decisiones cerradas sin implementar — carril propio si se retoma).

## Resultados

| Fase | Fecha | Verdes 1ª | Verdes post-Healer | $/run | $/spec sanado | Approved | Notas |
|---|---|---|---|---|---|---|---|
| Referencia (F4/F6) | 2026-07-22 | 0/5 · 2/4 | sin dato (Healer nunca medido) | 11,2 | — | 5/5 · 4/4 | Clases: gap discovery cart + observación planner |
| Q1 | | | | | | | |
| Q2 | | | | | | | |
