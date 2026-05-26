# `config/allowed-targets.yaml` — schema

Schema declarativo del compliance gate. `hooks/pre-flight.ts` lo lee en cada PreToolUse de Playwright MCP. Cambios al schema requieren bump de `version`.

## Versión actual

`version: 1`

## Estructura

```yaml
version: 1
mode: greybox            # required. Valores válidos en MVP: solo "greybox".
allowedPatterns:         # required, mínimo 1 entry.
  - "<glob URL>"
blockedPatterns:         # optional, default [].
  - "<glob URL>"
syntheticCredentials:    # required cuando allowedPatterns implica login.
  usernames:             # array de strings exactos (no glob).
    - "<username>"
  passwords:             # array de strings exactos (no glob).
    - "<password>"
```

## Campos

### `version` (number, required)

Versión del schema. Solo `1` válido. Si el hook lee un `version` distinto a los soportados, bloquea con `CONFIG_VERSION_UNSUPPORTED`.

### `mode` (string, required)

Modo operacional declarado. Valores válidos en MVP:

- `greybox` — el agente trabaja contra la app desplegada vía URL, no lee código fuente. **Único valor permitido en MVP.**
- `whitebox` — declarado en schema por extensibilidad, **bloquea en MVP** (Non-goal explícito del SPEC).

Cualquier otro valor → `MODE_INVALID_OR_MISSING`.

### `allowedPatterns` (string[], required, min 1)

Lista de patrones glob que la URL del `tool_input` debe matchear para que la llamada se permita. Sintaxis glob:

- `*` — cualquier secuencia de caracteres salvo `/`.
- `**` — cualquier secuencia incluyendo `/`.
- `?` — un carácter.

Ejemplos:

- `"https://www.saucedemo.com/*"` — exactamente el dominio público de SauceDemo, cualquier path.
- `"https://*.qa.bank.local/**"` — cualquier subdominio bajo qa.bank.local.
- `"http://localhost:*"` — localhost en cualquier puerto.

Si la URL del tool no matchea ningún pattern → `URL_NOT_ALLOWLISTED`.

### `blockedPatterns` (string[], optional, default `[]`)

Lista de patrones glob que **siempre** bloquean, aunque también estén en `allowedPatterns`. Misma sintaxis que `allowedPatterns`. La prioridad es: `blockedPatterns` > `allowedPatterns`.

Caso típico: declarar `"https://prod-*.bank.local/**"` como defense in depth aunque la allowlist tenga `"https://*.bank.local/**"` por error.

Si la URL matchea alguno → `URL_BLOCKLISTED`.

### `syntheticCredentials` (object, required cuando hay login flow)

Declaración explícita de qué credenciales son sintéticas. Pre-flight valida que las credenciales del `tool_input` están en este set; si no, bloquea con `CREDENTIAL_NOT_SYNTHETIC_DECLARED`.

#### `syntheticCredentials.usernames` (string[], min 1 si presente)

Lista exacta (case-sensitive). No admite globs. Caso típico: los usuarios de prueba documentados por la app (ej. `standard_user` en SauceDemo).

#### `syntheticCredentials.passwords` (string[], min 1 si presente)

Lista exacta. Mismo criterio que usernames.

### Defaults seguros

- Si el archivo no existe → `CONFIG_MISSING_OR_INVALID`. El hook bloquea por defecto.
- Si el YAML no parsea → `CONFIG_MISSING_OR_INVALID`.
- Si `version` no soportado → `CONFIG_VERSION_UNSUPPORTED`.

## Ejemplo válido (para SauceDemo demo)

Ver [`config/allowed-targets.yaml`](../config/allowed-targets.yaml).

## Lo que el schema **NO** captura (todavía)

- Permisos por subagent (todos los subagents leen el mismo config).
- TTL del config (no expira, hay que re-versionar manualmente).
- Restricciones por método HTTP (todo o nada por URL).
- Lista detallada de PII regex (vive en `references/pii-patterns.md`, S3-T1).

Si surge necesidad operativa, bump a `version: 2` con migración manual.
