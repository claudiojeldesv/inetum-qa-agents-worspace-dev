import { describe, expect, it } from 'vitest';

import {
  detectPII,
  looksLikeDNI,
  looksLikeEmailReal,
  looksLikeIBAN,
  looksLikeNIE,
  looksLikePhoneES,
  looksLikePII,
  luhnValid,
} from '../../hooks/pii-detector.js';

describe('looksLikeDNI', () => {
  it('acepta DNIs válidos con letra correcta', () => {
    expect(looksLikeDNI('12345678Z')).toBe(true);
    expect(looksLikeDNI('00000000T')).toBe(true);
    expect(looksLikeDNI('99999999R')).toBe(true);
  });

  it('rechaza letra incorrecta', () => {
    expect(looksLikeDNI('12345678A')).toBe(false);
  });

  it('rechaza letras prohibidas (I, Ñ, O, U)', () => {
    expect(looksLikeDNI('12345678I')).toBe(false);
    expect(looksLikeDNI('12345678O')).toBe(false);
  });

  it('rechaza formatos no DNI', () => {
    expect(looksLikeDNI('standard_user')).toBe(false);
    expect(looksLikeDNI('1234')).toBe(false);
    expect(looksLikeDNI('1234567Z')).toBe(false);
  });
});

describe('looksLikeNIE', () => {
  it('acepta NIEs válidos', () => {
    expect(looksLikeNIE('X1234567L')).toBe(true);
    expect(looksLikeNIE('Y0000000Z')).toBe(true);
    expect(looksLikeNIE('Z9999999H')).toBe(true);
  });

  it('rechaza letra control incorrecta', () => {
    expect(looksLikeNIE('X1234567A')).toBe(false);
  });

  it('rechaza inicial no XYZ', () => {
    expect(looksLikeNIE('W1234567L')).toBe(false);
  });

  it('rechaza longitudes incorrectas', () => {
    expect(looksLikeNIE('X12345678L')).toBe(false);
    expect(looksLikeNIE('X123456L')).toBe(false);
  });
});

describe('luhnValid', () => {
  it('acepta tarjetas Luhn válidas', () => {
    expect(luhnValid('4532015112830366')).toBe(true);
    expect(luhnValid('5425233430109903')).toBe(true);
    expect(luhnValid('374245455400126')).toBe(true);
  });

  it('rechaza Luhn inválido', () => {
    expect(luhnValid('4532015112830367')).toBe(false);
    expect(luhnValid('1234567890123456')).toBe(false);
  });

  it('rechaza strings muy cortos', () => {
    expect(luhnValid('1234')).toBe(false);
  });
});

describe('looksLikeIBAN', () => {
  it('acepta IBANs ES válidos (mod 97)', () => {
    expect(looksLikeIBAN('ES9121000418450200051332')).toBe(true);
    expect(looksLikeIBAN('ES7921000813610123456789')).toBe(true);
  });

  it('acepta IBAN con espacios normalizables', () => {
    expect(looksLikeIBAN('ES91 2100 0418 4502 0005 1332')).toBe(true);
  });

  it('rechaza IBAN con checksum incorrecto', () => {
    expect(looksLikeIBAN('ES1234567890123456789012')).toBe(false);
  });

  it('rechaza países distintos a ES', () => {
    expect(looksLikeIBAN('FR9121000418450200051332')).toBe(false);
  });

  it('rechaza longitudes incorrectas', () => {
    expect(looksLikeIBAN('ES912100041845020005133')).toBe(false);
  });
});

describe('looksLikeEmailReal', () => {
  it('acepta dominios aparentemente reales', () => {
    expect(looksLikeEmailReal('juan.perez@gmail.com')).toBe(true);
    expect(looksLikeEmailReal('cliente@bbva.es')).toBe(true);
    expect(looksLikeEmailReal('usuario@protonmail.com')).toBe(true);
  });

  it('rechaza dominios test/example/invalid', () => {
    expect(looksLikeEmailReal('tester@example.com')).toBe(false);
    expect(looksLikeEmailReal('qa@test.local')).toBe(false);
    expect(looksLikeEmailReal('noreply@noreply.invalid')).toBe(false);
    expect(looksLikeEmailReal('admin@localhost')).toBe(false);
  });

  it('rechaza no-emails', () => {
    expect(looksLikeEmailReal('standard_user')).toBe(false);
    expect(looksLikeEmailReal('@nodomain')).toBe(false);
  });
});

describe('looksLikePhoneES', () => {
  it('acepta móviles y fijos ES', () => {
    expect(looksLikePhoneES('666123456')).toBe(true);
    expect(looksLikePhoneES('+34 666 12 34 56')).toBe(true);
    expect(looksLikePhoneES('+34-911-234-567')).toBe(true);
    expect(looksLikePhoneES('911234567')).toBe(true);
  });

  it('rechaza prefijos no españoles', () => {
    expect(looksLikePhoneES('+1 555 123 4567')).toBe(false);
  });

  it('rechaza formatos cortos o incorrectos', () => {
    expect(looksLikePhoneES('1234')).toBe(false);
    expect(looksLikePhoneES('12345678Z')).toBe(false);
  });
});

describe('looksLikePII (agregador)', () => {
  it('clasifica correctamente cada tipo', () => {
    expect(looksLikePII('12345678Z')).toBe('PII_DNI');
    expect(looksLikePII('X1234567L')).toBe('PII_NIE');
    expect(looksLikePII('ES9121000418450200051332')).toBe('PII_IBAN');
    expect(looksLikePII('4532015112830366')).toBe('PII_CARD');
    expect(looksLikePII('juan@gmail.com')).toBe('PII_EMAIL_REAL');
    expect(looksLikePII('666123456')).toBe('PII_PHONE_ES');
  });

  it('devuelve null para strings limpios', () => {
    expect(looksLikePII('standard_user')).toBe(null);
    expect(looksLikePII('secret_sauce')).toBe(null);
  });
});

describe('detectPII (multilínea con posición)', () => {
  it('encuentra múltiples patrones con line/column', () => {
    const text = [
      'const dni = "12345678Z";',
      'const email = "real@gmail.com";',
      'const card = "4532015112830366";',
    ].join('\n');
    const findings = detectPII(text);
    expect(findings).toHaveLength(3);
    expect(findings.map((f) => f.type)).toContain('PII_DNI');
    expect(findings.map((f) => f.type)).toContain('PII_EMAIL_REAL');
    expect(findings.map((f) => f.type)).toContain('PII_CARD');
    // Las posiciones son 1-based
    expect(findings[0]?.line).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.column).toBeGreaterThanOrEqual(1);
  });

  it('no detecta nada en texto limpio (credenciales sintéticas SauceDemo)', () => {
    const text = [
      "const user = 'standard_user';",
      "const pass = 'secret_sauce';",
      "await page.fill('#user', user);",
    ].join('\n');
    expect(detectPII(text)).toHaveLength(0);
  });
});
