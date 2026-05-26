# PII patterns — catálogo del detector

Patrones que `hooks/pii-detector.ts` aplica sobre strings (credenciales en pre-flight, contenido de `.spec.ts` en pii-post, directorios completos en `ia4d-pii-scanner`). Catálogo enfocado en banca/seguros España. Falsos positivos preferibles a falsos negativos — el SDET puede declarar excepciones, pero un PII real que se filtra a un repo es irreversible.

Cada patrón se identifica con un código `PII_<TIPO>`. Es lo que aparece como `reason` en el verdict del hook y como tipo de finding en el report del scanner.

## PII_DNI · DNI español

Documento de identidad nacional. 8 dígitos seguidos de una letra control calculada como `letras[num % 23]` con `letras = "TRWAGMYFPDXBNJZSQVHLCKE"`.

**Forma**: `^[0-9]{8}[A-HJ-NP-TV-Z]$` (case-insensitive). Letras `I`, `Ñ`, `O`, `U` están excluidas por convención del MINHAP.

**Validación adicional**: la letra debe coincidir con el módulo 23. Esto reduce falsos positivos a 1/23.

**Casos positivos** — match real:
- `12345678Z` (12345678 % 23 = 14 → Z)
- `00000000T` (0 % 23 = 0 → T)
- `99999999R` (99999999 % 23 = 1 → R)

**Casos negativos** — no match:
- `12345678A` (letra incorrecta, sería Z)
- `1234567Z` (solo 7 dígitos)
- `12345678ÑO` (letras excluidas)
- `12345678` (sin letra)
- `standard_user` (no es DNI)

## PII_NIE · NIE español

Número de identidad de extranjero. Letra inicial `X`, `Y` o `Z` + 7 dígitos + letra control. Para el checksum, se sustituye la inicial por dígito: `X→0`, `Y→1`, `Z→2`, se concatena con los 7 dígitos, y se calcula la letra control igual que en DNI.

**Forma**: `^[XYZ][0-9]{7}[A-HJ-NP-TV-Z]$` (case-insensitive).

**Casos positivos**:
- `X1234567L` (sustituido a 01234567, 01234567 % 23 = 11 → L)
- `Y0000000Z` (10000000 % 23 = 14 → Z)
- `Z9999999H` (29999999 % 23 = 18 → H)

**Casos negativos**:
- `X1234567A` (letra incorrecta)
- `W1234567L` (inicial no XYZ)
- `X12345678L` (8 dígitos en lugar de 7)

## PII_IBAN · IBAN España

Cuenta bancaria internacional. Formato España: `ES` + 2 dígitos control + 20 dígitos de cuenta = 24 caracteres totales.

**Validación adicional**: checksum mod 97. Algoritmo: mover los 4 primeros chars al final, convertir letras a números (`A=10, B=11, ..., Z=35`), evaluar como entero, dividir mod 97 = 1.

**Forma**: `^ES[0-9]{22}$` (sin espacios, mayúsculas). En el detector aceptamos también la versión espaciada (`ES12 3456 7890 ...`) tras normalización.

**Casos positivos** (IBANs de prueba documentados, públicos):
- `ES9121000418450200051332`
- `ES7921000813610123456789`

**Casos negativos**:
- `ES1234567890123456789012` (mod 97 falla)
- `FR9121000418450200051332` (no es ES)
- `ES912100041845020005133` (23 chars, falta uno)

## PII_CARD · Número de tarjeta

Visa/Mastercard/Amex/Maestro/etc. Validación por algoritmo de Luhn. Longitud típica 13-19 dígitos, aceptamos 12-19 para no perder casos antiguos.

**Forma**: dígitos sin espacios. El detector normaliza removiendo espacios y guiones antes de validar.

**Casos positivos** (números de prueba públicos):
- `4532015112830366` (Visa de prueba)
- `5425233430109903` (Mastercard de prueba)
- `374245455400126` (American Express, 15 dígitos)

**Casos negativos**:
- `4532015112830367` (Luhn falla)
- `1234567890123456` (Luhn falla)
- `1234` (demasiado corto)

## PII_EMAIL_REAL · Email con dominio aparentemente real

Detectamos email + filtramos por dominio. La heurística es **lista negativa**: si el dominio matchea uno de los conocidos como "test/dev/local", no es PII. Cualquier otro dominio se considera real.

**Forma del regex base**: `^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$`.

**Dominios excluidos** (no se considera PII):
- `example.com`, `example.org`, `example.net` (RFC 2606)
- `test`, `localhost`, `invalid` y subdominios
- `*.local`, `*.internal`, `*.lan`
- `noreply.*` con dominio test
- Cualquier dominio que termine en `.test`, `.example`, `.invalid`, `.localhost`

**Casos positivos** (match — sospecha PII):
- `juan.perez@gmail.com`
- `cliente@bbva.es`
- `usuario@protonmail.com`

**Casos negativos** (no match — uso legítimo):
- `tester@example.com`
- `qa@test.local`
- `noreply@noreply.invalid`
- `admin@localhost`

## PII_PHONE_ES · Teléfono España

Móviles (`6XX XXX XXX`, `7XX XXX XXX`) y fijos (`9XX XXX XXX`, `8XX XXX XXX`). Prefijo internacional opcional `+34`.

**Forma**: `^(\+?34[\s-]?)?[6789]\d{8}$` tras quitar espacios y guiones.

**Casos positivos**:
- `666123456`
- `+34 666 12 34 56`
- `+34-911-234-567`

**Casos negativos**:
- `12345678Z` (DNI, no teléfono)
- `5551234567` (no prefijo válido)
- `+1 555 123 4567` (no España)

## Algoritmo `detectPII(text)`

El detector aplica todos los patrones en orden contra el `text`. Para `text` corto (credencial individual, una línea), devuelve `PIIFinding[]` con uno o más matches. Para texto largo (contenido de archivo), tokeniza por whitespace y aplica cada patrón a cada token, devolviendo finding con `tipo`, `valor`, `línea` y `columna` aproximada.

### `PIIFinding`

```ts
interface PIIFinding {
  type: 'PII_DNI' | 'PII_NIE' | 'PII_IBAN' | 'PII_CARD' | 'PII_EMAIL_REAL' | 'PII_PHONE_ES';
  value: string;
  line?: number;
  column?: number;
}
```

## Lo que el catálogo **NO** cubre (MVP)

- NIF empresarial (CIF) — no es PII personal, no añade riesgo legal directo.
- Pasaportes de otros países — fuera del scope banca España MVP.
- Direcciones postales — formato muy variable, alta tasa de falsos positivos.
- Datos médicos / SS — fuera del scope financiero.
- Detección de PII en strings encriptados / hashed — no es factible por regex.

Si surge necesidad para piloto cliente, ampliar este catálogo bumping un campo `version` (futuro, no implementado en MVP).

## Cross-reference

- Usado por `hooks/pre-flight.ts` (R-005, S2): valida credenciales individuales.
- Usado por `hooks/pii-post.ts` (S3): escanea `.spec.ts` recién escritos.
- Usado por subagent `ia4d-pii-scanner` (S3-T3): escanea directorios completos.
- `SPEC §6 — Never do`: "Usar PII real como dato de prueba. Si el PII detector encuentra coincidencia en seed o test, abort con error".
