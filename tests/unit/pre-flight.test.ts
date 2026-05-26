import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { evaluate, looksLikeDNI, luhnValid } from '../../hooks/pre-flight.js';

const FIXTURES = resolve(__dirname, 'fixtures');
const VALID = resolve(FIXTURES, 'allowed-targets-valid.yaml');
const MODE_MISSING = resolve(FIXTURES, 'allowed-targets-mode-missing.yaml');
const NOT_EXISTS = resolve(FIXTURES, 'does-not-exist.yaml');

describe('pre-flight.evaluate', () => {
  it('R-001: URL prod sin declarar → BLOCK URL_NOT_ALLOWLISTED', async () => {
    const verdict = await evaluate(
      { tool_input: { url: 'https://www.banco-real.com/login' } },
      VALID,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toBe('URL_NOT_ALLOWLISTED');
  });

  it('happy path: URL SauceDemo + credencial sintética → PASS', async () => {
    const verdict = await evaluate(
      {
        tool_input: {
          url: 'https://www.saucedemo.com/inventory.html',
          username: 'standard_user',
          password: 'secret_sauce',
        },
      },
      VALID,
    );
    expect(verdict.pass).toBe(true);
    expect(verdict.reason).toBeUndefined();
  });

  it('R-001 bis: URL no declarada (otro dominio) → BLOCK URL_NOT_ALLOWLISTED', async () => {
    const verdict = await evaluate(
      { tool_input: { url: 'https://random.dev/' } },
      VALID,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toBe('URL_NOT_ALLOWLISTED');
  });

  it('R-005: URL declarada + DNI real como username → BLOCK CREDENTIAL_LOOKS_LIKE_PII', async () => {
    const verdict = await evaluate(
      {
        tool_input: {
          url: 'https://www.saucedemo.com/',
          username: '12345678Z', // DNI válido (checksum correcto)
        },
      },
      VALID,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toBe('CREDENTIAL_LOOKS_LIKE_PII');
  });

  it('R-003: mode missing en config → BLOCK MODE_INVALID_OR_MISSING', async () => {
    const verdict = await evaluate(
      { tool_input: { url: 'https://www.saucedemo.com/' } },
      MODE_MISSING,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toBe('MODE_INVALID_OR_MISSING');
  });

  it('R-002: URL en blocklist gana sobre allowlist → BLOCK URL_BLOCKLISTED', async () => {
    // "https://prod-anything/..." matchea blockedPatterns aunque no esté en allowedPatterns
    const verdict = await evaluate(
      { tool_input: { url: 'https://prod-saucedemo.com/login' } },
      VALID,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toBe('URL_BLOCKLISTED');
  });

  it('R-004: credencial no declarada como sintética → BLOCK CREDENTIAL_NOT_SYNTHETIC_DECLARED', async () => {
    const verdict = await evaluate(
      {
        tool_input: {
          url: 'https://www.saucedemo.com/',
          username: 'usuario_real_no_declarado',
        },
      },
      VALID,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toBe('CREDENTIAL_NOT_SYNTHETIC_DECLARED');
  });

  it('config inexistente → BLOCK CONFIG_MISSING_OR_INVALID', async () => {
    const verdict = await evaluate(
      { tool_input: { url: 'https://www.saucedemo.com/' } },
      NOT_EXISTS,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toBe('CONFIG_MISSING_OR_INVALID');
  });

  it('tool_input sin URL (ej. browser_snapshot) → PASS (no aplica el gate URL)', async () => {
    const verdict = await evaluate({ tool_input: {} }, VALID);
    expect(verdict.pass).toBe(true);
  });
});

describe('looksLikeDNI', () => {
  it('acepta DNI válido con letra correcta', () => {
    expect(looksLikeDNI('12345678Z')).toBe(true);
    expect(looksLikeDNI('00000000T')).toBe(true);
  });

  it('rechaza DNI con letra incorrecta', () => {
    expect(looksLikeDNI('12345678A')).toBe(false);
  });

  it('rechaza formatos no DNI', () => {
    expect(looksLikeDNI('standard_user')).toBe(false);
    expect(looksLikeDNI('1234')).toBe(false);
  });
});

describe('luhnValid', () => {
  it('acepta número de tarjeta válido', () => {
    // Visa de prueba pública
    expect(luhnValid('4532015112830366')).toBe(true);
  });

  it('rechaza Luhn inválido', () => {
    expect(luhnValid('4532015112830367')).toBe(false);
  });

  it('rechaza strings cortos', () => {
    expect(luhnValid('1234')).toBe(false);
  });
});
