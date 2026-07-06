/**
 * PII detector — patrones banca-ES.
 * Documentación de reglas: docs/references/pii-patterns.md
 *
 * Cada función expone:
 *  - `detect(text)`: devuelve Array<Match> con location y tipo.
 *  - `isStructurallyValid(value)`: validación complementaria (mod 23 / mod 97 / Luhn).
 */

export type PiiRule = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';

export interface PiiMatch {
  rule: PiiRule;
  value: string;
  line: number;        // 1-indexed
  column: number;      // 1-indexed
}

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

const DNI_RE = /\b([0-9]{8})([A-HJ-NP-TV-Z])\b|\b([XYZ])([0-9]{7})([A-HJ-NP-TV-Z])\b/g;
const IBAN_RE = /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\b/g;
const CARD_RE = /\b(?:[0-9]{4}[\s-]?){3,4}[0-9]{1,4}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_ES_RE = /(?:(?:\+34|0034)[ -]?)?[6789]\d(?:[ -]?\d){7}/g;
const TEST_FIXME_RE = /test\.fixme\s*\(/g;
const FIXME_APPROVED_HEADER_RE = /^\s*\/\/\s*fixme-approved-by:/;

const ALLOWED_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'mailinator.com',
  'saucedemo.com',
]);

function isValidDniLetter(numStr: string, letter: string): boolean {
  const num = parseInt(numStr, 10);
  return DNI_LETTERS[num % 23] === letter;
}

function isValidNieLetter(prefix: string, numStr: string, letter: string): boolean {
  const prefixMap: Record<string, string> = { X: '0', Y: '1', Z: '2' };
  const num = parseInt(prefixMap[prefix] + numStr, 10);
  return DNI_LETTERS[num % 23] === letter;
}

export function isValidIbanMod97(iban: string): boolean {
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  if (clean.length < 15 || clean.length > 34) return false;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = /[A-Z]/.test(ch) ? ch.charCodeAt(0) - 55 : parseInt(ch, 10);
    if (Number.isNaN(value)) return false;
    remainder = (remainder * (value < 10 ? 10 : 100) + value) % 97;
  }
  return remainder === 1;
}

export function isValidLuhn(card: string): boolean {
  const digits = card.replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export interface ScanOptions {
  syntheticUsernames?: string[];
  syntheticTestCards?: string[];
  syntheticIbans?: string[];
}

export function scanText(text: string, options: ScanOptions = {}): PiiMatch[] {
  const matches: PiiMatch[] = [];
  const lines = text.split(/\r?\n/);
  const syntheticCards = new Set(
    (options.syntheticTestCards ?? []).map((c) => c.replace(/[\s-]/g, '')),
  );
  const syntheticIbans = new Set(
    (options.syntheticIbans ?? []).map((i) => i.replace(/\s+/g, '').toUpperCase()),
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // P1 — DNI / NIE
    let m: RegExpExecArray | null;
    DNI_RE.lastIndex = 0;
    while ((m = DNI_RE.exec(line)) !== null) {
      const isNif = !!m[1];
      const value = m[0];
      const valid = isNif
        ? isValidDniLetter(m[1], m[2])
        : isValidNieLetter(m[3], m[4], m[5]);
      if (valid) {
        matches.push({ rule: 'P1', value, line: lineNo, column: m.index + 1 });
      }
    }

    // P2 — IBAN
    IBAN_RE.lastIndex = 0;
    while ((m = IBAN_RE.exec(line)) !== null) {
      const value = m[0];
      const clean = value.replace(/\s+/g, '').toUpperCase();
      if (syntheticIbans.has(clean)) continue;
      if (isValidIbanMod97(value)) {
        matches.push({ rule: 'P2', value, line: lineNo, column: m.index + 1 });
      }
    }

    // P3 — Tarjetas
    CARD_RE.lastIndex = 0;
    while ((m = CARD_RE.exec(line)) !== null) {
      const value = m[0];
      const clean = value.replace(/[\s-]/g, '');
      if (syntheticCards.has(clean)) continue;
      if (isValidLuhn(value)) {
        matches.push({ rule: 'P3', value, line: lineNo, column: m.index + 1 });
      }
    }

    // P4 — Email dominio real
    EMAIL_RE.lastIndex = 0;
    while ((m = EMAIL_RE.exec(line)) !== null) {
      const value = m[0];
      const domain = value.split('@')[1].toLowerCase();
      if (ALLOWED_EMAIL_DOMAINS.has(domain)) continue;
      matches.push({ rule: 'P4', value, line: lineNo, column: m.index + 1 });
    }

    // P5 — Teléfono ES
    PHONE_ES_RE.lastIndex = 0;
    while ((m = PHONE_ES_RE.exec(line)) !== null) {
      matches.push({ rule: 'P5', value: m[0], line: lineNo, column: m.index + 1 });
    }
  }

  return matches;
}

export function scanForUnauthorizedTestFixme(text: string): PiiMatch[] {
  const lines = text.split(/\r?\n/);
  const headerWindow = lines.slice(0, 5).join('\n');
  const approved = FIXME_APPROVED_HEADER_RE.test(headerWindow);
  if (approved) return [];

  const matches: PiiMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    TEST_FIXME_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TEST_FIXME_RE.exec(line)) !== null) {
      matches.push({ rule: 'P6', value: m[0], line: i + 1, column: m.index + 1 });
    }
  }
  return matches;
}
