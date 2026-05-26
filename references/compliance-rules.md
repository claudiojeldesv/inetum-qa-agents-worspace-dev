# Compliance rules — pre-flight gate

Reglas que `hooks/pre-flight.ts` aplica antes de permitir cualquier llamada a Playwright MCP. Operacionalizan los puntos "Never do" del [SPEC §6](../SPEC.md#6-boundaries). El gate **no tiene flag de override**. Si una regla bloquea, el hook devuelve exit code 2 y la llamada al tool se aborta.

Las reglas son evaluadas en orden. La primera que bloquee gana — el resto no se evalúa. Cualquier excepción se loggea con razón estructurada en `audit-log.json`.

## R-001 · URL declarada en allowlist

**Bloquea cuando** la URL extraída de `tool_input.url` (u otro campo equivalente del MCP de Playwright) no matchea ningún patrón en `config/allowed-targets.yaml#allowedPatterns`.

**Por qué** SPEC §6 — "URLs que coincidan con patrones declarados como production en config". La declaración explícita es la única fuente de verdad — sin declaración, asumimos prod por defecto seguro.

**Razón de bloqueo** `URL_NOT_ALLOWLISTED`.

## R-002 · URL no está en blocklist

**Bloquea cuando** la URL matchea cualquier patrón en `config/allowed-targets.yaml#blockedPatterns`.

**Por qué** defensa por listas explícitas además de la allowlist. Permite declarar "este dominio está prohibido aunque alguien lo añada por accidente a allowedPatterns". Útil en banca donde un alias `staging-internal.bank.com` puede confundirse con `prod-internal.bank.com`.

**Razón de bloqueo** `URL_BLOCKLISTED`.

## R-003 · Mode declarado en config

**Bloquea cuando** `config/allowed-targets.yaml#mode` falta, es `null`, o tiene un valor distinto a `greybox` o `whitebox`.

**Por qué** SPEC Non-goals MVP: "modo whitebox (asume greybox: agente no lee código fuente del producto)". MVP solo soporta `greybox`. Detectar un valor inválido es prevención contra configs sin revisar.

**Razón de bloqueo** `MODE_INVALID_OR_MISSING`. Nota: en MVP, si `mode: whitebox` se declara, también bloquea — non-goal.

## R-004 · Credencial pertenece a syntheticCredentials

**Bloquea cuando** alguna credencial detectable en `tool_input` (username, password, email, otros campos típicos) **no** pertenece al set declarado en `config/allowed-targets.yaml#syntheticCredentials`.

**Por qué** SPEC §6 — "Usar PII real como dato de prueba". La forma operativa es: declara explícitamente qué credenciales son sintéticas. Cualquier otra se asume real.

**Razón de bloqueo** `CREDENTIAL_NOT_SYNTHETIC_DECLARED`.

## R-005 · Credencial no parece PII

**Bloquea cuando** alguna credencial detectada en `tool_input` matchea un patrón PII (mínimo en MVP: DNI español, número de tarjeta con check de Luhn).

**Por qué** defense in depth contra R-004. Si alguien declara como sintético un username que es claramente un DNI real (formato `12345678X` válido), R-005 lo coge aunque R-004 lo deje pasar. El catálogo completo de patrones PII (IBAN, teléfonos, emails de dominio real) vive en `references/pii-patterns.md` (S3-T1) y se reusa aquí cuando exista.

**Razón de bloqueo** `CREDENTIAL_LOOKS_LIKE_PII`.

## Defaults seguros

- Si `config/allowed-targets.yaml` no existe o no se puede parsear → bloquear con razón `CONFIG_MISSING_OR_INVALID`.
- Si la URL no se puede extraer del `tool_input` → permitir con warning loggeado (`URL_NOT_FOUND_IN_INPUT`). Algunos tools MCP de Playwright no toman URL como input directo (ej. `browser_snapshot`); bloquearlos rompería el flujo legítimo.
- Si `tool_input` no contiene campos credencial-like → R-004/R-005 no aplican (no hay nada que validar).

## Tabla de verdict (casos de prueba mínimos del AC)

| # | Caso | URL | Cred username | Verdict | Razón |
|---|---|---|---|---|---|
| 1 | URL prod sin declarar | `https://www.banco.com/login` | `standard_user` | BLOCK | `URL_NOT_ALLOWLISTED` |
| 2 | URL SauceDemo declarada + cred sintética | `https://www.saucedemo.com/` | `standard_user` | PASS | — |
| 3 | URL no en config | `https://random.dev/` | `standard_user` | BLOCK | `URL_NOT_ALLOWLISTED` |
| 4 | URL declarada + DNI real como user | `https://www.saucedemo.com/` | `12345678Z` | BLOCK | `CREDENTIAL_LOOKS_LIKE_PII` |
| 5 | Mode missing | `https://www.saucedemo.com/` | `standard_user` | BLOCK | `MODE_INVALID_OR_MISSING` |

Estos cinco casos son la matriz mínima del verify de S2-T3.

## Cross-reference

| Regla | SPEC §6 — Never do |
|---|---|
| R-001, R-002, R-003 | "Ejecutar el agente contra URLs que coincidan con patrones declarados como production en config" |
| R-004, R-005 | "Usar PII real como dato de prueba. Si el PII detector encuentra coincidencia en seed o test, abort con error" |
| Defaults seguros | "Saltarse el compliance pre-flight gate por cualquier motivo. No hay flag de override" |

## Lo que pre-flight **NO** hace

- No escanea `.spec.ts` ya generados (eso es `pii-post.ts`, S3).
- No valida que el subagent invocador sea legítimo (no hay autenticación en MVP).
- No persiste estado entre invocaciones (cada llamada es independiente).
- No re-valida URL tras redirects del browser (solo gatea el input declarado).
