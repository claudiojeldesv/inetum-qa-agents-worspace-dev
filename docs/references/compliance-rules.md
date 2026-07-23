# Compliance pre-flight rules

Reglas que el hook `hooks/pre-flight.ts` y el script `src/scripts/check-compliance.ts` (invocado por los commands; sustituye al subagent `ia4d-compliance-checker`, deprecated) aplican antes de cualquier invocación al Planner/Generator nativos. **Sin override**.

## Reglas duras (bloqueo)

| ID | Regla | Acción |
|---|---|---|
| C1 | URL target debe estar en `config/allowed-targets.yaml` | Bloqueo + exit code 2 |
| C2 | URL no debe matchear patrones declarados `production` | Bloqueo |
| C3 | Modo del proyecto (`greybox`/`whitebox`) debe estar declarado en `allowed-targets.yaml` | Bloqueo |
| C4 | Credenciales no deben coincidir con patrones PII real (DNI/IBAN/email dominio real) | Bloqueo, ver `pii-patterns.md` |
| C5 | Output target dir no debe ser `main` ni branch protegida | Bloqueo |
| C6 | El Healer no puede introducir `test.fixme()` sin aprobación humana explícita | Bloqueo del Edit |

## Reglas blandas (warning)

| ID | Regla | Acción |
|---|---|---|
| W1 | URL en allowed pero sin prefijo `qa.`, `test.`, `int.`, `staging.`, `dev.`, `localhost` | Warning, ask-first |
| W2 | Style Contract no presente en `config/style-contracts/` | Warning, usa default explícito |
| W3 | `discovery-report.json` cacheado >24h | Warning, sugiere re-ejecutar Planner |

## Patrones URL prohibidos (regex aplicada en C2)

```
^https?://[^/]*\.(prod|production)\.
^https?://[^/]*\.(banca|seguro|api)\.[^/]+/(?!qa|test|staging|dev)
^https?://[^/]*/?($|/(prod|production))
```

## Patrones URL allow-listados por defecto (config/allowed-targets.yaml)

- `https://www.saucedemo.com/*`
- `https://demo.playwright.dev/*`
- `https://*.qa.*`, `https://*.test.*`, `https://*.int.*`, `https://*.staging.*`, `https://*.dev.*`
- `http://localhost:*`, `http://127.0.0.1:*`

## Cómo el agente reporta una violación

JSON estructurado al audit-log + mensaje en stderr:

```json
{
  "timestamp": "2026-05-30T01:36:15.032Z",
  "source": "pre-flight",
  "action": "block",
  "rule": "C1",
  "target": "https://prod.bank.example.com/login",
  "reason": "URL not declared in allowed-targets.yaml",
  "result": "exit_2"
}
```
