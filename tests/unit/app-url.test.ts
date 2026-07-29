import { describe, it, expect } from 'vitest';

import { resolveAppUrl, appPathname } from '../../src/app-url.ts';
import { pathnameOf } from '../../src/scripts/verify-locators.ts';

// Regresión onesait 2026-07: app Java bajo context path. `new URL('/login.do', base)`
// descartaba /npa-escritorio y el pipeline verificaba contra el origen — falso
// reachable + 6/6 not-found. La semántica canónica es ANEXAR a la base.
const CTX_BASE = 'https://spv.pre.mapfre.net/npa-escritorio';
const ROOT_BASE = 'https://www.saucedemo.com/';

describe('resolveAppUrl (semántica única: anexar a la base, espejo del walker)', () => {
  it('conserva el context path de la base (el caso onesait)', () => {
    expect(resolveAppUrl(CTX_BASE, '/login.do')).toBe('https://spv.pre.mapfre.net/npa-escritorio/login.do');
  });

  it('base con barra final no duplica separador', () => {
    expect(resolveAppUrl(`${CTX_BASE}/`, '/login.do')).toBe(
      'https://spv.pre.mapfre.net/npa-escritorio/login.do',
    );
  });

  it('pattern sin barra inicial se anexa igual', () => {
    expect(resolveAppUrl(CTX_BASE, 'login.do')).toBe('https://spv.pre.mapfre.net/npa-escritorio/login.do');
  });

  it('app en la raíz del origen: comportamiento idéntico al histórico', () => {
    expect(resolveAppUrl(ROOT_BASE, '/inventory.html')).toBe('https://www.saucedemo.com/inventory.html');
  });

  it('URL absoluta pasa tal cual (redirect SSO / otro host)', () => {
    expect(resolveAppUrl(CTX_BASE, 'https://sso.mapfre.net/auth')).toBe('https://sso.mapfre.net/auth');
  });
});

describe('appPathname / pathnameOf (comparaciones de reachability)', () => {
  it('expected path incluye el context path', () => {
    expect(appPathname(CTX_BASE, '/login.do')).toBe('/npa-escritorio/login.do');
    expect(pathnameOf('/login.do', CTX_BASE)).toBe('/npa-escritorio/login.do');
  });

  it('base en raíz mantiene los resultados históricos', () => {
    expect(pathnameOf('/inventory.html', ROOT_BASE)).toBe('/inventory.html');
    expect(pathnameOf('/', ROOT_BASE)).toBe('/');
  });

  it('URL absoluta: pathname real, normalizado sin barra final', () => {
    expect(pathnameOf(`${CTX_BASE}/login.do`, CTX_BASE)).toBe('/npa-escritorio/login.do');
    expect(pathnameOf('https://www.saucedemo.com/checkout/', ROOT_BASE)).toBe('/checkout');
  });
});

