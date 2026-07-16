---
description: Valida un Style Contract (campos, enums, typos, coherencia) y muestra la configuración EFECTIVA de la sesión — qué gates están on/off, evidencia, auth, locators. Validación determinística (hard rule #5), no LLM.
---

# /ia4d-qa-automator:config

> **Pre-check (workspace).** Este comando corre DENTRO de un workspace desplegado del agente. Antes de continuar, verifica que en el directorio actual existen `config/allowed-targets.yaml` y `playwright.config.ts`. Si falta alguno, NO sigas: indica al usuario que ejecute `/ia4d-qa-automator:init <carpeta>` (o abra su workspace ya desplegado) y detente.

Ayuda de configuración para el Ingeniero QA. Dos trabajos, ambos deterministas (los hace
`src/contract-validator.ts`, no el LLM — hard rule #5):

1. **Valida** el Style Contract: campos desconocidos (typo con sugerencia), enums inválidos, tipos
   erróneos e incoherencias (p.ej. `auth.enabled:true` sin `login_path`; `fail_on_violations:true`
   con `severity_threshold` vacío). Tapa el agujero silencioso: hoy `fail_on_violation` (singular) o
   `evidence.level: complete` pasan sin aviso y el gate nunca se activa.
2. **Explica el estado efectivo** de la sesión: qué gates están on/off AHORA (`QA_ENABLE_PII`,
   `QA_ENABLE_JUDGE`, gate a11y por-contract), evidence level, auth, estrategia de locators, y qué
   valores vienen de env-var, del contract o del default.

No invoca subagents ni toca el navegador. Solo lee filesystem + entorno.

## Uso

```
/ia4d-qa-automator:config                       # valida TODOS los contracts de config/style-contracts/
/ia4d-qa-automator:config --style=<archivo>     # valida uno + muestra su estado efectivo
```

`--style` acepta una ruta o el nombre de archivo dentro de `config/style-contracts/`
(ej. `--style=saucedemo.yaml`).

## Procedure

1. Resuelve el contract:
   - Si el usuario pasó `--style=<x>`, úsalo.
   - Si no, y el turno menciona un sitio o hay un run activo, sugiere su contract.
   - Si no hay pista, ejecuta sin argumento (valida todos) y dilo.
2. Ejecuta el validador determinístico y muestra su salida **verbatim** (no la reinterpretes ni la
   "mejores" — es la fuente de verdad):
   ```sh
   # PowerShell
   npx tsx src/contract-validator.ts <archivo-o-nada>
   # bash
   npx tsx src/contract-validator.ts <archivo-o-nada>
   ```
3. Exit code: `0` = sin errores (los avisos no fallan), `1` = hay errores. Útil también en CI.
4. Tras la salida, si hay ERRORES o avisos, resume en una línea qué tocar y en qué archivo. Si todo
   está OK, dilo y no añadas ruido.

## Cuándo usarlo

- Antes de un run, para confirmar que el contract del sitio está bien formado.
- Cuando un gate "no hace nada" pese a estar declarado (el típico typo silencioso).
- Para ver de un vistazo qué tienes activo ahora mismo (gates, evidencia, auth).
- En el lab [`examples/05-config`](../../../examples/05-config/): tras cada cambio de flag, para ver
  el estado efectivo moverse.

## Expected output (contract limpio)

```
═══ Contract: saucedemo.yaml — OK ═══
  ✓ sin problemas: campos, enums, tipos y coherencia correctos

─── Estado efectivo de la sesión ───
  [env]       gate: PII scanner: off  — QA_ENABLE_PII
  [env]       gate: Judge: off  — QA_ENABLE_JUDGE
  [contract]  gate: a11y (fail_on_violations): off (warning)  — el scan axe-core se inyecta SIEMPRE
  [contract]  evidence.level: full  — fuerza QA_SCREENSHOT=on + QA_TRACE=on
  [default]   auth: off
  [contract]  locators (primera prioridad): getByTestId
```

## Expected output (contract con problemas)

```
═══ Contract: broken.yaml — ERRORES ═══
  ✗ ERROR  evidence.level: valor 'complete' no válido. Permitidos: minimal | steps | full
  ! aviso  a11y.fail_on_violation: campo desconocido — ¿quisiste decir 'fail_on_violations'?
  ! aviso  auth.login_path: auth.enabled:true pero no hay login_path — el setup no sabrá dónde loguear
```

## Notas

- La validación es **determinística** (schema declarativo en `src/contract-validator.ts`), no
  LLM-as-validator. El command orquesta y presenta; no juzga la validez.
- El schema legible por humanos vive en
  [`docs/references/style-contract-schema.md`](../../../docs/references/style-contract-schema.md);
  el validador lo refleja para la máquina.
