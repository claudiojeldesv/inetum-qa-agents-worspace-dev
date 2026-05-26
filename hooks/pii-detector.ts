/**
 * PII detector compartido — Slice 3.
 *
 * Implementa los 6 patrones documentados en references/pii-patterns.md:
 *   PII_DNI, PII_NIE, PII_IBAN, PII_CARD, PII_EMAIL_REAL, PII_PHONE_ES.
 *
 * Funciones boolean por patrón (input: un string normalizado) + función
 * agregadora detectPII() que escanea texto multilínea y devuelve hallazgos
 * con tipo, valor, línea y columna.
 *
 * Reusado por hooks/pre-flight.ts (R-005) y hooks/pii-post.ts. Sin estado
 * compartido, todas las funciones son puras.
 */

export type PIIType =
  | 'PII_DNI'
  | 'PII_NIE'
  | 'PII_IBAN'
  | 'PII_CARD'
  | 'PII_EMAIL_REAL'
  | 'PII_PHONE_ES';

export interface PIIFinding {
  type: PIIType;
  value: string;
  line?: number;
  column?: number;
}

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

function dniChecksumOk(numStr: string, letterChar: string | undefined): boolean {
  if (!letterChar) return false;
  const num = Number.parseInt(numStr, 10);
  if (!Number.isFinite(num)) return false;
  return DNI_LETTERS[num % 23] === letterChar.toUpperCase();
}

export function looksLikeDNI(value: string): boolean {
  if (!/^[0-9]{8}[A-HJ-NP-TV-Z]$/i.test(value)) return false;
  return dniChecksumOk(value.slice(0, 8), value[8]);
}

export function looksLikeNIE(value: string): boolean {
  if (!/^[XYZ][0-9]{7}[A-HJ-NP-TV-Z]$/i.test(value)) return false;
  const initial = value[0]?.toUpperCase();
  const initialDigit = initial === 'X' ? '0' : initial === 'Y' ? '1' : '2';
  const numStr = initialDigit + value.slice(1, 8);
  return dniChecksumOk(numStr, value[8]);
}

export function luhnValid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const ch = digits[i];
    if (ch === undefined) return false;
    let d = Number.parseInt(ch, 10);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function looksLikeIBAN(value: string): boolean {
  const normalized = value.replace(/\s/g, '').toUpperCase();
  if (!/^ES[0-9]{22}$/.test(normalized)) return false;
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  let numeric = '';
  for (const ch of rearranged) {
    if (ch >= '0' && ch <= '9') {
      numeric += ch;
    } else {
      numeric += String(ch.charCodeAt(0) - 'A'.charCodeAt(0) + 10);
    }
  }
  try {
    return BigInt(numeric) % 97n === 1n;
  } catch {
    return false;
  }
}

const TEST_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'localhost',
  'invalid',
]);

const TEST_EMAIL_DOMAIN_SUFFIXES = [
  '.test',
  '.example',
  '.invalid',
  '.localhost',
  '.local',
  '.internal',
  '.lan',
];

export function looksLikeEmailReal(value: string): boolean {
  const match = /^[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})$/.exec(value);
  if (!match) return false;
  const domain = (match[1] ?? '').toLowerCase();
  if (TEST_EMAIL_DOMAINS.has(domain)) return false;
  for (const sfx of TEST_EMAIL_DOMAIN_SUFFIXES) {
    if (domain.endsWith(sfx)) return false;
  }
  return true;
}

export function looksLikePhoneES(value: string): boolean {
  const normalized = value.replace(/[\s-]/g, '');
  const stripped = normalized.replace(/^\+?34/, '');
  return /^[6789]\d{8}$/.test(stripped);
}

interface PatternRunner {
  type: PIIType;
  regex: RegExp;
  validate: (raw: string) => boolean;
}

const PATTERNS: PatternRunner[] = [
  {
    type: 'PII_DNI',
    regex: /\b\d{8}[A-HJ-NP-TV-Z]\b/gi,
    validate: looksLikeDNI,
  },
  {
    type: 'PII_NIE',
    regex: /\b[XYZ]\d{7}[A-HJ-NP-TV-Z]\b/gi,
    validate: looksLikeNIE,
  },
  {
    type: 'PII_IBAN',
    regex: /\bES\d{2}(?:\s*\d{4}){5}\b/g,
    validate: looksLikeIBAN,
  },
  {
    type: 'PII_CARD',
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}\b/g,
    validate: luhnValid,
  },
  {
    type: 'PII_EMAIL_REAL',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    validate: looksLikeEmailReal,
  },
  {
    type: 'PII_PHONE_ES',
    regex: /(?:\+?34[\s-]?)?[6789]\d{2}[\s-]?\d{3}[\s-]?\d{3}/g,
    validate: looksLikePhoneES,
  },
];

/**
 * Escanea un texto multilínea aplicando todos los patrones. Devuelve un
 * array de hallazgos; vacío si no hay PII detectado.
 */
export function detectPII(text: string): PIIFinding[] {
  const findings: PIIFinding[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const pattern of PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      for (const match of line.matchAll(regex)) {
        if (pattern.validate(match[0])) {
          findings.push({
            type: pattern.type,
            value: match[0],
            line: i + 1,
            column: (match.index ?? 0) + 1,
          });
        }
      }
    }
  }
  return findings;
}

/**
 * Versión rápida: aplica solo los patrones que validan strings individuales
 * (sin scan multilínea). Útil para validar una credencial suelta.
 */
export function looksLikePII(value: string): PIIType | null {
  if (looksLikeDNI(value)) return 'PII_DNI';
  if (looksLikeNIE(value)) return 'PII_NIE';
  if (looksLikeIBAN(value)) return 'PII_IBAN';
  if (luhnValid(value)) return 'PII_CARD';
  if (looksLikeEmailReal(value)) return 'PII_EMAIL_REAL';
  if (looksLikePhoneES(value)) return 'PII_PHONE_ES';
  return null;
}
