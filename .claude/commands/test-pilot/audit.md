---
description: Audita un directorio de .spec.ts. Orquesta ia4d-compliance-checker (modo audit-dir) + ia4d-pii-scanner standalone. Produce verdict global pass/fail con detalle por archivo.
argument-hint: --dir=<path>
allowed-tools: Task, Read, Bash(npx tsx:*)
---

# /test-pilot:audit

Eres el orquestador de `/test-pilot:audit`. Tu trabajo es ejecutar **dos** auditorías estáticas sobre un directorio de tests ya producidos (típicamente `output/generate/`) y componer un verdict global:

1. `ia4d-compliance-checker` modo audit-dir → URLs y credenciales en los .spec.ts contra `config/allowed-targets.yaml`.
2. `ia4d-pii-scanner` → patrones PII reales + `test.fixme()` en el contenido de los .spec.ts.

Los dos subagents son **independientes**; los invocas en serie (no en paralelo dentro de esta vuelta del MVP), agregas los findings, y reportas un veredicto único.

Argumentos crudos: `$ARGUMENTS`

## Paso 0 — Parsear argumentos

Extrae de `$ARGUMENTS`:

- `--dir=<path>` — obligatorio. Si falta o el path no existe (verifícalo con Read sobre algún listing o asumiendo error), aborta con:

  ```
  ERROR: --dir no provisto o no encontrado.
  Uso: /test-pilot:audit --dir=<path>
  ```

## Paso 1 — Compliance audit del directorio

Invoca el subagent `ia4d-compliance-checker` vía Task tool con un prompt como:

> Audita el directorio `<dir>` en modo audit-dir. Devuelve el JSON crudo del hook tal cual.

Espera la respuesta. Captura del Bloque 2 (JSON crudo):

```json
{
  "pass": <bool>,
  "scanned": [<file>...],
  "findings": [
    { "file": "...", "line": <int>, "type": "<URL_NOT_ALLOWLISTED|URL_BLOCKLISTED|CREDENTIAL_NOT_SYNTHETIC_DECLARED|CREDENTIAL_LOOKS_LIKE_PII>", "value": "..." },
    ...
  ]
}
```

Si reporta `ERROR`, expón el error tal cual y termina con `VERDICT: ERROR`.

## Paso 2 — PII scan del directorio

Invoca el subagent `ia4d-pii-scanner` vía Task tool con un prompt como:

> Escanea el directorio `<dir>` buscando PII y test.fixme(). Devuelve el JSON crudo del CLI tal cual.

Espera la respuesta. Captura del Bloque 2 (JSON crudo):

```json
{
  "pass": <bool>,
  "scanned": [<file>...],
  "findings": [
    { "file": "...", "type": "<PII_DNI|PII_NIE|PII_IBAN|PII_CARD|PII_EMAIL_REAL|PII_PHONE_ES|TEST_FIXME_INSERTED>", "line": <int>, "column": <int>, "value": "..." },
    ...
  ]
}
```

Si reporta `ERROR`, expón el error tal cual y termina con `VERDICT: ERROR`.

## Paso 3 — Verdict global y output al SDET

Computa:

```
globalPass = compliance.pass && pii.pass
totalFindings = compliance.findings.length + pii.findings.length
```

### Caso pass

```
/test-pilot:audit terminado.

Dir:        <dir>
Verdict:    PASS

Compliance check (URLs + credenciales en código):
  scanned:  <N>
  findings: 0

PII scan (DNI/NIE/IBAN/tarjeta/email/teléfono ES + test.fixme):
  scanned:  <N>
  findings: 0
```

### Caso block

```
/test-pilot:audit terminado.

Dir:        <dir>
Verdict:    BLOCK
Findings:   <total>

Compliance check:
  scanned:  <N>
  findings: <K1>
    - <type> @ <file>:<line>  value=<value>
    - ...

PII scan:
  scanned:  <N>
  findings: <K2>
    - <type> @ <file>:<line>:<col>  value=<value or omitido si TEST_FIXME_INSERTED>
    - ...

Acción sugerida: revisar los archivos listados, corregir, re-correr /test-pilot:audit. No exportes (Slice 10) hasta verdict PASS.
```

Si los findings de PII son del tipo `TEST_FIXME_INSERTED`, no muestres `value` (no aplica). Para el resto, sí.

## Reglas duras

- **No corregir los findings tú.** Solo reportas. La corrección es responsabilidad del SDET (o del próximo `/test-pilot:generate` con plan/style ajustado).
- **No invoques subagents en paralelo.** Compliance primero, PII después. Si el orden es relevante en algún futuro (no en MVP), lo cambias aquí.
- **No tomes la decisión de cuánto es "demasiado".** Si hay 1 finding, verdict BLOCK. Si hay 50, verdict BLOCK. No introduces threshold artificial — el SPEC §6 dice "Si el PII detector encuentra coincidencia... abort con error", y aplica el mismo principio aquí.
- **No invoques `playwright-test-*` nativos.** Este command opera sobre artefactos locales, no contra Playwright runtime.
- **No invoques `ia4d-judge`** — calidad del código vive en `/test-pilot:generate`, no aquí.
- **No escribes en `audit-log.json`** directamente — los hooks transversales registran tus tool calls.

## Lo que NO haces

- No generas tests (Slice 7).
- No mapeas criterios FD (Slice 6).
- No exportas el catálogo (Slice 10).
- No corres Playwright (`hooks/run-playwright.ts`).
- No tomas acciones correctivas sobre los archivos.
