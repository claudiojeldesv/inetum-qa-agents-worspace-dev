# `audit-log.json` — schema

Audit log append-only en formato **JSONL** (un objeto JSON por línea). Cada hook, command y subagent que produce verdict relevante escribe una línea. El archivo vive en la raíz del proyecto, está en `.gitignore` (output local del SDET, no fuente), y no se rota en MVP.

Versión actual: `1`. El schema se versionará por bump en `metadata.schemaVersion` si rompe compatibilidad.

## Estructura de entrada

```json
{
  "timestamp": "2026-05-26T18:30:00.000Z",
  "source": "hook:pre-flight",
  "action": "compliance_check",
  "target": "https://www.banco-falso.com/login",
  "result": "block",
  "metadata": {
    "reason": "URL_NOT_ALLOWLISTED",
    "sessionId": "abc-123"
  }
}
```

## Campos

### `timestamp` (string, required)

ISO 8601 UTC con milisegundos. Generado por `new Date().toISOString()` en el momento de escritura, no de la decisión upstream.

### `source` (string, required)

Quién origina la entrada. Formato `<categoría>:<nombre>`. Categorías válidas en MVP:

- `hook:audit-write` — el audit transversal (PostToolUse `*`).
- `hook:pre-flight` — el compliance gate (S2).
- `hook:pii-post` — el scanner PII (S3).
- `command:<name>` — futuro, slash command que escribe directamente.
- `subagent:<name>` — futuro, subagent que escribe directamente.

### `action` (string, required)

Qué evento ha ocurrido. Enum cerrado:

- `tool_invocation` — un tool de Claude Code se invocó (audit transversal).
- `compliance_check` — pre-flight evaluó una invocación contra `allowed-targets.yaml`.
- `pii_scan` — pii-post escaneó contenido por PII o `test.fixme()`.
- `policy_skip` — el SDET declaró un downgrade de una política bloqueante (ej. a11y de block a warn o skip). Lleva razón obligatoria en metadata.

Si añades una action nueva, bump del schema (`metadata.schemaVersion`).

### `target` (string, required)

El objeto sobre el que actúa la action. Forma libre, pero consistente por action:

- `tool_invocation`: el nombre del tool (`Bash`, `Edit`, `mcp__playwright-test__browser_navigate`).
- `compliance_check`: la URL evaluada (si la había) o `<no-url>`.
- `pii_scan`: el path del archivo escaneado.

### `result` (string, required)

Outcome de la action. Enum cerrado:

- `pass` — la action procedió sin bloqueo.
- `block` — la action fue bloqueada (exit 2 del hook).
- `noop` — la action no aplicaba (ej. pii-post sobre archivo no-`.spec.ts`).
- `unknown` — no se pudo determinar (típicamente porque stdin del hook era inválido).

### `metadata` (object, required, puede ser `{}`)

Campos auxiliares por action. Algunos típicos:

- `sessionId` — `session_id` del payload Claude Code.
- `reason` — código de bloqueo (R-001..R-005 para compliance, `PII_<TIPO>` o `TEST_FIXME_INSERTED` para pii).
- `findings` — `number` de findings (solo pii_scan).
- `event` — nombre del evento Claude Code (`PreToolUse`, `PostToolUse`).
- `schemaVersion` — siempre `1` en MVP. Reservado para futuros bumps.

`metadata` no debe contener PII real (es paradójico que el log de PII contenga PII). Los `value` detallados quedan en stderr del hook, no en audit log.

## Validación

`hooks/audit.ts` exporta `validateAuditEntry(entry: unknown): AuditEntry | null`. Devuelve `null` si la entrada no cumple el schema. El validador es estructural (chequea campos requeridos y enums), no JSON Schema.

## Ejemplos

### tool_invocation (audit transversal, happy path)

```json
{"timestamp":"2026-05-26T18:30:00.000Z","source":"hook:audit-write","action":"tool_invocation","target":"Bash","result":"pass","metadata":{"event":"PostToolUse","sessionId":"abc-123","schemaVersion":1}}
```

### compliance_check (pre-flight bloqueando URL prod)

```json
{"timestamp":"2026-05-26T18:30:05.123Z","source":"hook:pre-flight","action":"compliance_check","target":"https://www.banco-prod.com/login","result":"block","metadata":{"reason":"URL_NOT_ALLOWLISTED","sessionId":"abc-123","event":"PreToolUse","schemaVersion":1}}
```

### pii_scan (pii-post bloqueando archivo contaminado)

```json
{"timestamp":"2026-05-26T18:30:10.456Z","source":"hook:pii-post","action":"pii_scan","target":"demo/saucedemo/contaminated.spec.ts","result":"block","metadata":{"reason":"PII_DNI","findings":2,"sessionId":"abc-123","event":"PostToolUse","schemaVersion":1}}
```

### noop (pii-post sobre archivo que no es .spec.ts)

```json
{"timestamp":"2026-05-26T18:30:15.789Z","source":"hook:pii-post","action":"pii_scan","target":"README.md","result":"noop","metadata":{"sessionId":"abc-123","schemaVersion":1}}
```

### policy_skip (a11y degradado a warn por el SDET vía flag CLI)

```json
{"timestamp":"2026-05-27T16:30:00.000Z","source":"command:/test-pilot:generate","action":"policy_skip","target":"a11y","result":"pass","metadata":{"policy":"a11y","mode":"warn","reason":"SauceDemo demo público sin SLA WCAG","declaredIn":"cli","schemaVersion":1}}
```

Campos extra esperados en `metadata` para `policy_skip`:

- `policy` (string): nombre de la política. En MVP solo `"a11y"`.
- `mode` (string): nuevo modo. Valores válidos: `"warn"`, `"skip"`. No se emite entry cuando el modo es `block` (default).
- `reason` (string, **obligatorio**, no vacío): justificación del SDET. El comando rechaza la invocación si `mode != block` y `reason` falta.
- `declaredIn` (string): `"cli"` si vino por flag, `"contract"` si vino del Style Contract.

## Trazabilidad esperada

Para una invocación Playwright MCP con URL prohibida, el audit log debería contener al menos dos líneas:

1. `compliance_check` con `result: block` del hook `pre-flight`.
2. `tool_invocation` con `target: mcp__playwright-test__*` del hook `audit-write` transversal (Claude Code aún registra el intento aunque el PreToolUse lo aborte).

Para una Edit que introduce `test.fixme()`:

1. `tool_invocation` con `target: Edit` del audit transversal.
2. `pii_scan` con `result: block` y `metadata.reason: TEST_FIXME_INSERTED` del hook `pii-post`.

## Lo que el schema **NO** captura (MVP)

- Identidad del usuario humano (Claude Code no la pasa al hook).
- Diff exacto de archivos modificados (solo path, no contenido).
- Encadenamiento entre entradas (no hay `parentId` o `traceId`). Si surge necesidad de queries complejas, vendrá con knowledge graph SQLite en v0.2 (SPEC riesgo #4).
- Rotación o expiración del log. El archivo crece indefinidamente — el SDET lo limpia manualmente cuando moleste.

## Cross-reference

- Producido por `hooks/audit-write.ts` (transversal), `hooks/pre-flight.ts` (Slice 2), `hooks/pii-post.ts` (Slice 3).
- Consumido por `/test-pilot:audit` (Slice 9), `/test-pilot:export` (Slice 10).
- SPEC §6 — Always do: "Escribir entrada al audit log JSON por cada: llamada LLM, archivo modificado, decisión del judge, ejecución de hook".
