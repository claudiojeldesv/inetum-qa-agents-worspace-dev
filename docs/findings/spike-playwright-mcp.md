# Spike findings — Playwright Test Agents

- **Fecha**: 2026-05-26
- **Operador**: Claudio Jeldes
- **Tiempo total invertido**: TBD — completar
- **Verdict global**: **GO**

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

## Planner — datos a completar

> Operador: rellena tras el spike.

- Comando exacto utilizado: TBD
- Tiempo de ejecución contra TodoMVC: TBD
- Calidad del output (4 checks):
  - Escenarios ≥3: SÍ / NO — TBD
  - Pasos concretos: SÍ / NO — TBD
  - Cubre happy + negativos: SÍ / NO — TBD
  - Markdown estructurado: SÍ / NO — TBD
- Output capturado: pegar markdown en sección anexa cuando esté disponible

## Generator — datos a completar

> Operador: rellena tras el spike.

- Comando exacto utilizado: TBD
- ¿Corrió contra browser real durante generación?: SÍ — confirmado funcionalmente
- ¿Test verde al primer intento?: SÍ — confirmado funcionalmente ("genera perfectamente y funciona todo")
- Calidad del código (4 checks):
  - Selectores semánticos: TBD
  - Asserts más allá navegación: TBD
  - Verde primer intento: SÍ
  - Estilo consistente: TBD
- Output capturado: pegar `.spec.ts` resultante en sección anexa cuando esté disponible

## Coste / token usage

- Round-trips observados durante Planner: TBD
- Tiempo total Planner + Generator: TBD
- Token count si Claude Code lo expuso: TBD

**Pendiente** confirmar el matiz MCP-chatty vs CLI-batch que discutimos previamente. La existencia del comando `npx playwright init-agents` sugiere que el flujo va por MCP (los agentes instalados se comunican con Claude Code vía MCP, no por CLI batch), pero hay que medir con tokens reales.

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
