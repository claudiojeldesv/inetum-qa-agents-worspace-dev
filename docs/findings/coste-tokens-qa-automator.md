# Coste real de `ia4d-qa-automator` en tokens y por plan de Claude Code

Análisis de consumo del agente medido sobre un run real, con precios oficiales de Anthropic
(verificados julio 2026) y datos de límites tomados del propio `/usage` de una cuenta **Claude
Team**. Sirve para responder: *"¿cuánto gasta realmente una persona con cada plan?"*

Herramienta de medición: [`src/scripts/token-usage.mjs`](../../src/scripts/token-usage.mjs)
(`npm run qa:tokens -- <sessionId>`), que lee los transcript JSONL de Claude Code y desglosa por
modelo y por subagente. Fuente de límites: comando `/usage` en Claude Code (before/after del run).

---

## Run de referencia

- **Módulo**: S3 Spec-refiner, FD de SauceDemo de **25 casos**.
- **Sesión**: `852466cb` · duración 5h13m · **56 subagentes** (25 writers, 26 reviewers, 3 planners,
  1 healer, 1 discovery) + orquestador.
- **Modelos**: orquestador **Opus 4.8**; fleet de subagentes **Sonnet 5** (55) + **Haiku 4.5** (1).

---

## 1. Tokens gastados en los 25 casos (medido)

| Modelo | Rol | input | output | cache-write | cache-read | Tokens facturables | Coste API |
|---|---|--:|--:|--:|--:|--:|--:|
| Sonnet 5 | 55 subagentes | 4.836.010 | 393.055 | 16.411.770 | 100.089.152 | 121.729.987 | $74,65 |
| Opus 4.8 | orquestador | 267.445 | 333.924 | 1.085.153 | 21.624.500 | 23.311.022 | $27,28 |
| Haiku 4.5 | 1 discovery | 37.481 | 10.632 | 163.403 | 285.424 | 496.940 | $0,32 |
| **TOTAL** | | **5.140.936** | **737.611** | **17.660.326** | **121.999.076** | **145.537.949** | **$102,25** |

- **Por caso (÷25): ~5,82M tokens facturables · ~$4,09 API.**
- **Solo el 4% (5,9M) es trabajo real** (input+output). El **96% es caché** (17,7M escritura + 122M
  relectura): contexto releído por los 56 subagentes, no información nueva.
- **El fleet Sonnet es el 73% del coste**; el orquestador Opus, 27%; Haiku, 0,3%.

### Precios oficiales aplicados (anthropic.com/pricing, julio 2026, por millón de tokens)

| Modelo | input | output | cache-write 5m | cache-read |
|---|--:|--:|--:|--:|
| Opus 4.8 | $5 | $25 | $6,25 | $0,50 |
| Sonnet 5 *(intro, hasta 31-ago-2026)* | $2 | $10 | $2,50 | $0,20 |
| Haiku 4.5 | $1 | $5 | $1,25 | $0,10 |

> Tras el 31-ago-2026, Sonnet 5 sube a $3/$15 → el ~$4/caso pasaría a ~$6/caso en Enterprise/API.

---

## 2. % de límite consumido por el run de 25 casos, por plan

Medido en cuenta **Team Premium** vía `/usage` (before 8%/1% → after 26%/6%). El resto es
**estimación** por los multiplicadores oficiales (Max 5x = 5× Pro; Max 20x = 20× Pro; Team Standard
≈ Pro; Team Premium ≈ Max 5x).

| Plan | Precio/mes | Semanal por run | Runs 25-casos / semana | Casos / semana | ¿Token = $? |
|---|---|--:|--:|--:|---|
| Pro | $17-20 | ~25% *(est)* | ~4 | ~100 | No (flat) |
| Team Standard | $20-25/asiento | ~25% *(est)* | ~4 | ~100 | No (flat) |
| **Team Premium (plan medido)** | **$100-125/asiento** | **5% (medido)** | **~20** | **~500** | **No (flat)** |
| Max 5x | $100 | ~5% *(est)* | ~20 | ~500 | No (flat) |
| Max 20x | $200 | ~1,25% *(est)* | ~80 | ~2.000 | No (flat) |
| Enterprise usage-based / API | ~$20/asiento + API | sin límite | ∞ | ∞ | **Sí** |

> **Ventana de 5h**: la medición dio 18% (8%→26%), pero el run duró **5h13m y cruzó el reset** de la
> ventana, así que ese 18% está **subestimado**. Para un run tan largo el cuello de botella real no
> es la cuota sino el **reloj**: físicamente se hace ~1 run de este tamaño por tarde. La cuota
> semanal (5%) es el dato limpio.

---

## 3. ¿Cuánto gasta REALMENTE una persona con cada plan?

| Plan | Paga la persona/mes | Coste marginal de un run de 25 casos | Capacidad práctica |
|---|---|--:|---|
| Pro | **$17-20 fijos** | **$0** (hasta el tope) | ~100 casos/sem — corto para uso intensivo |
| Team Premium | **$100-125 fijos/asiento** | **$0** (hasta el tope) | ~500 casos/sem — holgado para un QA full-time |
| Max 20x | **$200 fijos** | **$0** (hasta el tope) | ~2.000 casos/sem — sobra |
| Enterprise usage-based | ~$20/asiento + uso | **~$102/run (~$4/caso)** | ilimitado, facturado |
| API directa | solo uso | **~$102/run (~$4/caso)** | ilimitado, facturado |

**Respuesta corta:** en suscripción (Pro/Max/**Team**) la persona **no paga por token** — paga su
cuota fija y el agente consume límite, no dinero. Un run de 25 casos cuesta **$0 de bolsillo**
mientras no reviente el tope; en Team Premium fue **solo el 5% de la semana**. Solo en **Enterprise
usage-based o API directa** el token es dinero: ~**$102/run (~$4/caso)** a precio de lista.

---

## 4. Insights

- **Escala casi lineal con el nº de casos**: ~$4/caso, ~0,2% del semanal (Team Premium) por caso.
  25 casos = 5% semanal; 100 casos ≈ 20% semanal.
- **El lever de ahorro** es bajar writers/reviewers (73% del coste) a un modelo más barato, con
  tradeoff de calidad de razonamiento en el par Writer↔Reviewer — hay que medirlo, no asumirlo.
- **Higiene de contexto sin coste de calidad**: `/clear` entre runs y `/compact` tras el planner
  (suelta el MCP en contexto) recortan el consumo de cache-read.

---

## 5. Cómo reproducir la medición

1. **Tokens**: `npm run qa:tokens` (lista sesiones) → `npm run qa:tokens -- <sessionId>` (desglose).
   Precios editables al inicio de `src/scripts/token-usage.mjs`.
2. **% de límite**: en Claude Code, `/usage` (o el diálogo *Account & usage* de la extensión VS
   Code) antes y después del run; la diferencia de las barras Session/Weekly es el consumo real del
   run en TU plan.

## Caveats

- Team Premium = **medido**; Pro/Max/Standard = **estimado** por multiplicadores (los límites de
  suscripción no se publican en tokens).
- El % de ventana de 5h del run está subestimado (cruzó el reset); el semanal (5%) es limpio.
- $ a precio de lista API, Sonnet 5 en precio introductorio; con suscripción no se pagan.
- Los mínimos de asiento y detalles de límites de Enterprise conviene confirmarlos con ventas de
  Anthropic.

## Fuentes

- [claude.com/pricing](https://claude.com/pricing) — precios de planes
- [platform.claude.com/docs pricing](https://platform.claude.com/docs/en/about-claude/pricing) — precios de token
- [code.claude.com/docs costs](https://code.claude.com/docs/en/costs) — `/usage`, gestión de costes
- [support.claude.com — Claude Code en Team/Enterprise](https://support.claude.com/en/articles/11845131-use-claude-code-with-your-team-or-enterprise-plan)
