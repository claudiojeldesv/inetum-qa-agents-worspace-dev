# PII patterns (banca-ES) — pii-post hook + ia4d-pii-scanner

Regex y algoritmos que el hook `hooks/pii-post.ts` y el subagent `ia4d-pii-scanner` aplican sobre cada `.spec.ts` recién escrito. **Sin override**.

## P1 — DNI / NIE español

Regex: `\b[0-9]{8}[A-HJ-NP-TV-Z]\b|\b[XYZ][0-9]{7}[A-HJ-NP-TV-Z]\b`

Validación complementaria: la letra debe ser correcta según `TRWAGMYFPDXBNJZSQVHLCKE[NIF_NUM % 23]`.

**Positivos**: `12345678Z` (válido), `X1234567L`, `Y0123456A`.
**Negativos**: `12345678A` (letra incorrecta, **no marca** — el detector solo bloquea coincidencias estructuralmente válidas), `1234567` (faltan dígitos).

**Excepción**: el detector permite el dato sintético `12345678X` etiquetado en `style-contract.yaml` como `synthetic_fixtures`.

## P2 — IBAN (mod 97)

Regex: `\b[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\b`

Validación: algoritmo IBAN mod 97 = 1.

**Positivos**: `ES9121000418450200051332` (cualquier IBAN real válido).
**Negativos**: `ES00000000000000000000000` (estructuralmente válido pero falla mod 97).

## P3 — Tarjeta de crédito (Luhn)

Regex: `\b(?:[0-9]{4}[\s-]?){3,4}[0-9]{1,4}\b`

Validación: algoritmo de Luhn.

**Positivos**: `4111111111111111` (Visa test), `5500000000000004` (Mastercard test). **Estos pasan Luhn pero son tarjetas test conocidas** — el detector las acepta como sintéticas si están listadas en `synthetic_fixtures` del Style Contract.
**Negativos**: `1234567890123456` (falla Luhn).

## P4 — Email de dominio real

Regex: `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b`

Validación: si el dominio coincide con TLD popular (`.com`, `.es`, `.org`, `.net`, `.gov`, `.edu`) y NO está en allowlist de dominios test (`example.com`, `test.com`, `mailinator.com`, `saucedemo.com`), bloquea.

**Positivos** (bloquean): `juan.perez@bbva.es`, `usuario@gmail.com`.
**Negativos** (allow): `test@example.com`, `user@saucedemo.com`.

## P5 — Teléfono español

Regex: `\b(?:\+34|0034)?[ -]?[6789][0-9]{8}\b`

**Positivos**: `+34 612 345 678`, `672345678`, `912345678`.
**Negativos**: `123456789` (no empieza por 6,7,8,9).

## P6 — `test.fixme()` no aprobado (excepción del scanner)

Esta es una regla **adicional** que el hook `pii-post.ts` aplica para detectar manipulaciones del Healer nativo que silencien tests.

Regex: `test\.fixme\s*\(`

**Excepción**: permitido si el archivo declara header `// fixme-approved-by: <nombre> <ISO-date>` en las primeras 5 líneas.

## Cómo el scanner reporta una violación

```json
{
  "timestamp": "2026-05-30T01:36:15.032Z",
  "source": "pii-post",
  "action": "block",
  "rule": "P2",
  "target": "tests/e2e/checkout.spec.ts:42",
  "match": "ES91...332",
  "reason": "Valid IBAN detected, not in synthetic_fixtures allowlist",
  "result": "exit_2"
}
```
