import { describe, it, expect } from 'vitest';

import { relativePattern } from '../src/dom-map-to-discovery.ts';
import { resolveAppUrl } from '../../src/app-url.ts';

// Regresión onesait 2026-07 (lado productor): el pattern del discovery es
// relativo A LA BASE DE LA APP; fuera de la base se conserva absoluto.
const CTX_BASE = 'https://spv.pre.mapfre.net/npa-escritorio';

describe('relativePattern del adapter (productor del contrato base-relativo)', () => {
  it('recorta contra la base de la app, no contra el origen', () => {
    expect(relativePattern(`${CTX_BASE}/login.do`, CTX_BASE)).toBe('/login.do');
  });

  it('la propia base es "/"', () => {
    expect(relativePattern(CTX_BASE, CTX_BASE)).toBe('/');
    expect(relativePattern(`${CTX_BASE}/`, CTX_BASE)).toBe('/');
  });

  it('solo corta en límite de segmento (base /npa no es prefijo de /npa-escritorio)', () => {
    expect(relativePattern('https://host/npa-escritorio/x', 'https://host/npa')).toBe(
      'https://host/npa-escritorio/x',
    );
  });

  it('fuera de la base conserva la URL absoluta (no la recorta al pathname)', () => {
    expect(relativePattern('https://sso.mapfre.net/auth', CTX_BASE)).toBe('https://sso.mapfre.net/auth');
  });

  it('round-trip: relativePattern + resolveAppUrl devuelven la URL del walker', () => {
    for (const abs of [`${CTX_BASE}/login.do`, `${CTX_BASE}/menu.do?tab=2`, 'https://sso.mapfre.net/auth']) {
      expect(resolveAppUrl(CTX_BASE, relativePattern(abs, CTX_BASE))).toBe(abs);
    }
  });
});
