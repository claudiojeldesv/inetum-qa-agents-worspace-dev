# Spike Protocol — Playwright Test Agents en Windows corporativo

> Guía operativa del Slice 0. Timebox: **4 horas máximo**. Si a las 4 horas no hay verdict claro, parar y documentar lo que hay.

## Objetivo

Validar tres cosas, en orden:

1. **¿Se puede invocar Playwright Test Agents (Planner / Generator / Healer) desde Claude Code en el Windows corporativo del SDET?** Sí/no/parcial.
2. **¿La red corporativa / proxy / política de empresa permite las llamadas LLM + MCP necesarias?** Sí/no/con-fricción.
3. **¿El Planner produce output útil contra saucedemo.com?** Sí/no/inconsistente.

Si las tres dan verde, el MVP arranca Fase 1. Si cualquiera da rojo, el plan se replanifica antes de tocar código.

## Lo que NO es objetivo del spike

- No construir nada del agente `ia4d-test-pilot`.
- No optimizar prompts.
- No medir coste LLM ni latencia.
- No probar Healer en profundidad (Healer requiere tests que romper, ese caso no aplica al spike).
- No producir output reusable más allá del documento de findings.

## Prerrequisitos

Verifica antes de empezar:

- [ ] **Node 20 LTS** instalado. `node --version` debería devolver `v20.x.x`.
- [ ] **Claude Code CLI** instalado y autenticado con tu cuenta corporativa Inetum. `claude --version` debería devolver algo.
- [ ] **Acceso a internet** sin restricción a `saucedemo.com`, `registry.npmjs.org`, `api.anthropic.com`. Confirma con un `curl` rápido si dudas.
- [ ] **Sin VPN especial activa** que pueda interferir, salvo que sea la corporativa estándar.
- [ ] **Carpeta limpia** para el spike: `C:\Users\claudio.jeldes\Desktop\spike-playwright`. NO usar el repo principal del proyecto para no contaminarlo.

Si algún prerrequisito falla, documéntalo y para. Eso ya es un finding.

## Protocolo paso a paso

### Fase 1 — Setup (30 min)

```powershell
mkdir C:\Users\claudio.jeldes\Desktop\spike-playwright
cd C:\Users\claudio.jeldes\Desktop\spike-playwright
npm init -y
npm install -D @playwright/test@^1.56.0
npx playwright install chromium
```

Verifica versión instalada:

```powershell
npx playwright --version
```

Debe devolver `Version 1.56.x` o superior. Si devuelve menor, abort — Test Agents no existen en versiones anteriores.

Crea un test trivial para verificar que Playwright funciona en el setup:

```powershell
npx playwright codegen https://www.saucedemo.com/
```

Esto abre el codegen UI. Si abre sin error, el binding básico funciona. Cierra sin guardar.

**Findings a capturar en Fase 1:**
- Versión exacta de Playwright instalada.
- Cualquier warning durante `npm install` (proxy, certificados corporativos).
- Cualquier error durante `playwright install`.

### Fase 2 — Discovery del mecanismo de invocación (30 min)

Aquí es donde más incertidumbre hay. Los Playwright Test Agents se invocan vía MCP, pero la **forma exacta de activarlos desde Claude Code** es lo que tenemos que descubrir.

Hipótesis a probar, **en este orden**:

#### Hipótesis A — Hay un comando de Playwright que lo bootstrappea

```powershell
npx playwright agent --help
```

Si existe, leer el help y seguir desde ahí. Si devuelve "command not found", pasar a B.

#### Hipótesis B — Hay configuración MCP específica que cargar en Claude Code

Buscar en la doc oficial de Playwright v1.56 release notes y en el blog de Microsoft cómo se configuran los agents. Frase de búsqueda sugerida: `"Playwright Test Agents" v1.56 Claude Code setup`.

Probable: hay un archivo de configuración MCP que va en `~/.claude/mcp-servers.json` o equivalente, o un slash command que se instala.

#### Hipótesis C — Los agents son archivos `.md` en `.claude/agents/` que se llaman como subagents

Si las hipótesis A y B no resuelven, mirar si Microsoft publicó plantillas `.claude/agents/planner.md`, `.claude/agents/generator.md`, `.claude/agents/healer.md` que el usuario copia a su repo.

**Findings a capturar en Fase 2:**
- Mecanismo exacto de activación (con comando o pasos).
- Si requiere configuración adicional, cuál.
- Si la doc oficial es ambigua o desactualizada, documentarlo.

### Fase 3 — Run del Planner contra SauceDemo (1.5 horas)

Una vez resuelta la activación, crear el seed test mínimo:

```typescript
// tests/seed.spec.ts
import { test, expect } from '@playwright/test';

test('seed - app accessible', async ({ page }) => {
  await page.goto('https://www.saucedemo.com/');
  await expect(page).toHaveTitle(/Swag Labs/);
});
```

Ejecutar el Planner. Comando exacto depende de Fase 2. Ejemplo plausible (a ajustar):

```
@planner explore https://www.saucedemo.com/ using tests/seed.spec.ts
```

o

```powershell
npx playwright agent plan --seed tests/seed.spec.ts --url https://www.saucedemo.com/
```

Capturar **todo**:

1. **El comando exacto que funcionó.**
2. **El output completo del Planner** — copia y pega el markdown que produjo.
3. **Tiempo de ejecución** (cronómetro de móvil vale).
4. **Si hubo errores intermedios y cómo se recuperaron.**
5. **Si Claude Code mostró mensajes de "tool use" / "MCP server connection" / similares.**

**Checks de calidad sobre el output del Planner:**

- [ ] ¿Produjo ≥3 escenarios de test plausibles? (login válido, login inválido, añadir al carrito, checkout, etc.)
- [ ] ¿Los escenarios tienen pasos concretos (no solo títulos)?
- [ ] ¿Los escenarios cubren happy path + algún negativo?
- [ ] ¿El output está en markdown estructurado y parseable?

Si ≥3 de 4 son sí, el Planner es viable. Si <3, hay que profundizar (¿es problema del seed?, ¿del prompt subyacente?, ¿del modelo configurado?).

**Findings a capturar en Fase 3:**
- Comando exacto y output completo.
- Calidad del output según los 4 checks.
- Cualquier comportamiento sorprendente (Planner se atasca, ignora el seed, alucina escenarios fuera de la app, etc.).

### Fase 4 — Run del Generator (1 hora)

Tomar uno o dos escenarios del output del Planner y pasarlos por el Generator.

Comando exacto a descubrir. Plausible:

```
@generator materialize using docs/plan-output.md
```

Capturar:

1. **El comando exacto.**
2. **El `.spec.ts` resultante** — copia y pega completo.
3. **¿Corrió contra el browser durante la generación?** Esto es clave — el Generator nativo valida cada paso contra el DOM real.
4. **¿El test resultante pasa cuando se ejecuta con `npx playwright test`?**

**Checks de calidad sobre el output del Generator:**

- [ ] ¿El test usa selectores semánticos (`getByRole`, `getByLabel`, `getByText`) y no CSS bruto?
- [ ] ¿El test tiene asserts más allá de navegación (verifica algún estado)?
- [ ] ¿El test corre verde al primer intento?
- [ ] ¿El estilo del código es consistente (no mezcla async/await con .then(), no usa `waitForTimeout`)?

Si ≥3 de 4 son sí, el Generator es viable. Si menos, anotar dónde flojea — eso informa qué tan agresivo debe ser nuestro `style-enforce` (Slice 7).

**Findings a capturar en Fase 4:**
- Comando exacto, output completo, verde/rojo en ejecución.
- Calidad del código según los 4 checks.
- Cualquier inconsistencia entre runs (variabilidad del LLM).

### Fase 5 — Findings + verdict (30 min)

Consolidar todo en `docs/findings/spike-playwright-mcp.md`. Template abajo.

## Template del documento de findings

Crea el archivo `docs/findings/spike-playwright-mcp.md` y rellénalo así:

```markdown
# Spike findings — Playwright Test Agents

- **Fecha**: 2026-05-26
- **Operador**: Claudio Jeldes
- **Tiempo total invertido**: X horas
- **Verdict global**: GO / NO-GO / GO-CON-FRICCIÓN

## Setup

- Versión Playwright instalada: `1.56.x`
- Plataforma: Windows 11 Enterprise, Node 20.x, Claude Code vX.X
- Red: corporativa Inetum con [VPN sí/no / proxy sí/no]
- Incidencias durante setup: [ninguna / describir]

## Hipótesis verificada para activación

[Cuál de A, B, C resultó correcta, o si fue otra cosa]

**Mecanismo exacto**:
[Comandos / archivos de configuración / pasos]

## Planner

- Comando que funcionó: `<comando>`
- Tiempo de ejecución: X segundos / minutos
- Calidad (4 checks):
  - Escenarios ≥3: SÍ / NO
  - Pasos concretos: SÍ / NO
  - Cubre happy + negativos: SÍ / NO
  - Markdown estructurado: SÍ / NO
- Output (pegar markdown):

\`\`\`markdown
[paste]
\`\`\`

- Observaciones: [lo que sorprendió]

## Generator

- Comando que funcionó: `<comando>`
- ¿Corrió contra browser real?: SÍ / NO
- ¿Test verde al primer intento?: SÍ / NO
- Calidad (4 checks):
  - Selectores semánticos: SÍ / NO
  - Asserts más allá navegación: SÍ / NO
  - Verde primer intento: SÍ / NO
  - Estilo consistente: SÍ / NO
- Output (pegar .spec.ts):

\`\`\`typescript
[paste]
\`\`\`

- Observaciones: [lo que sorprendió]

## Bloqueadores / fricciones

[Cualquier cosa que requiera intervención: política de empresa, proxy, certificados, errores recurrentes, etc.]

## Verdict razonado

GO si: las tres preguntas iniciales son SÍ y los checks de calidad son ≥3/4 en Planner y Generator.

NO-GO si: alguna de las tres preguntas iniciales es NO.

GO-CON-FRICCIÓN si: funciona pero con caveats (ej. requiere config corporativa especial, calidad del Planner inconsistente, etc.). Documentar el caveat.

**Mi verdict**: [...]

## Implicaciones para el plan

[Qué hay que ajustar en plan.md / SPEC.md según los findings. Si verdict es GO, probablemente nada. Si es GO-CON-FRICCIÓN, listar ajustes.]

## Próximo paso recomendado

[En base al verdict, qué hacer ahora]
```

## Cuándo parar antes de las 4 horas

- Si Fase 2 (discovery) no resuelve en 90 minutos, parar. Es señal de que la doc oficial está inmadura o de que tu setup tiene fricción inesperada. **Documentar lo encontrado, verdict NO-GO o GO-CON-FRICCIÓN según el motivo.**
- Si en Fase 3 el Planner consistentemente falla o aluciana, parar después del 3er intento. **No insistas más de 30 min en hacer "funcionar" algo que claramente no está listo.**
- Si descubres que tu cuenta Claude Code corporativa tiene políticas que bloquean el flujo, parar y escalar — eso es un finding crítico que afecta toda la planificación.

## Lo que NO documentar como finding (ruido)

- Tipos puntuales o autocorrecciones del LLM en una invocación.
- Resultados de "una vez funcionó, otra no" sin reproducir 3 veces.
- Sensaciones subjetivas ("se nota lento") sin medición.

## Después del spike

1. Pega `docs/findings/spike-playwright-mcp.md` aquí en la conversación.
2. Revisamos juntos.
3. Si GO → arrancamos Fase 1 (S1-T1).
4. Si NO-GO o GO-CON-FRICCIÓN → ajustamos plan/SPEC antes de tocar código.
