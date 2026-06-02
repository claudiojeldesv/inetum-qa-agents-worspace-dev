import { describe, it, expect } from 'vitest';
import {
  scanText,
  scanForUnauthorizedTestFixme,
  isValidIbanMod97,
  isValidLuhn,
} from '../../src/pii-detector.ts';

describe('pii-detector P1 — DNI/NIE', () => {
  it('detects a valid Spanish DNI', () => {
    const text = "const user = { dni: '12345678Z' };";
    const matches = scanText(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].rule).toBe('P1');
    expect(matches[0].value).toBe('12345678Z');
  });

  it('ignores a DNI with invalid letter', () => {
    const text = "const user = { dni: '12345678A' };";
    const matches = scanText(text);
    expect(matches.filter((m) => m.rule === 'P1')).toHaveLength(0);
  });

  it('detects a valid NIE (X prefix)', () => {
    const text = "const id = 'X1234567L';";
    const matches = scanText(text);
    expect(matches.some((m) => m.rule === 'P1' && m.value === 'X1234567L')).toBe(true);
  });
});

describe('pii-detector P2 — IBAN mod 97', () => {
  it('validates a known-good IBAN', () => {
    expect(isValidIbanMod97('ES9121000418450200051332')).toBe(true);
  });

  it('rejects a malformed IBAN', () => {
    expect(isValidIbanMod97('ES00000000000000000000000')).toBe(false);
  });

  it('detects IBAN in source text', () => {
    const text = "const iban = 'ES9121000418450200051332';";
    const matches = scanText(text);
    expect(matches.filter((m) => m.rule === 'P2')).toHaveLength(1);
  });

  it('allows IBAN listed in synthetic allowlist', () => {
    const text = "const iban = 'ES9121000418450200051332';";
    const matches = scanText(text, { syntheticIbans: ['ES9121000418450200051332'] });
    expect(matches.filter((m) => m.rule === 'P2')).toHaveLength(0);
  });
});

describe('pii-detector P3 — Tarjetas (Luhn)', () => {
  it('validates Visa test card via Luhn', () => {
    expect(isValidLuhn('4111111111111111')).toBe(true);
  });

  it('rejects non-Luhn card number', () => {
    expect(isValidLuhn('1234567890123456')).toBe(false);
  });

  it('detects card in source text', () => {
    const text = "const cc = '4111-1111-1111-1111';";
    const matches = scanText(text);
    expect(matches.filter((m) => m.rule === 'P3')).toHaveLength(1);
  });

  it('allows card listed in synthetic allowlist', () => {
    const text = "const cc = '4111111111111111';";
    const matches = scanText(text, { syntheticTestCards: ['4111111111111111'] });
    expect(matches.filter((m) => m.rule === 'P3')).toHaveLength(0);
  });
});

describe('pii-detector P4 — Email dominio real', () => {
  it('blocks a real-domain email', () => {
    const text = "const email = 'usuario@bbva.es';";
    const matches = scanText(text);
    expect(matches.some((m) => m.rule === 'P4')).toBe(true);
  });

  it('allows example.com emails', () => {
    const text = "const email = 'test@example.com';";
    const matches = scanText(text);
    expect(matches.filter((m) => m.rule === 'P4')).toHaveLength(0);
  });

  it('allows saucedemo.com emails', () => {
    const text = "const email = 'user@saucedemo.com';";
    const matches = scanText(text);
    expect(matches.filter((m) => m.rule === 'P4')).toHaveLength(0);
  });
});

describe('pii-detector P5 — Teléfono ES', () => {
  it('detects mobile starting with 6', () => {
    const text = "const phone = '+34 612 345 678';";
    const matches = scanText(text);
    expect(matches.some((m) => m.rule === 'P5')).toBe(true);
  });

  it('detects landline starting with 9', () => {
    const text = "const phone = '912345678';";
    const matches = scanText(text);
    expect(matches.some((m) => m.rule === 'P5')).toBe(true);
  });

  it('ignores numbers not starting with 6/7/8/9', () => {
    const text = "const id = '123456789';";
    const matches = scanText(text);
    expect(matches.filter((m) => m.rule === 'P5')).toHaveLength(0);
  });
});

describe('pii-detector P6 — test.fixme() unauthorized', () => {
  it('flags test.fixme() without approval header', () => {
    const text = `
import { test } from '@playwright/test';
test.fixme('broken test', async () => {});
`;
    const matches = scanForUnauthorizedTestFixme(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].rule).toBe('P6');
  });

  it('allows test.fixme() with approval header in first 5 lines', () => {
    const text = `// fixme-approved-by: claudio 2026-05-30
import { test } from '@playwright/test';
test.fixme('reviewed by SDET', async () => {});
`;
    const matches = scanForUnauthorizedTestFixme(text);
    expect(matches).toHaveLength(0);
  });
});
