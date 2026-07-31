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


// K0.3/K0.4: business_text llega al discovery (para verify-locators y el Writer)
// y frame_path sobrevive el adapter (para que el scaffolder emita frameLocator).
import { domMapToDiscovery } from '../src/dom-map-to-discovery.ts';
import type { DomMap } from '../src/walk-types.ts';

describe('domMapToDiscovery — business_text y frame_path (K0)', () => {
  const map = (): DomMap => ({
    version: 1,
    site_id: 'saucedemo',
    generated_by: 'dom-walker',
    generated_at: '2026-07-31T00:00:00.000Z',
    target_url: 'https://www.saucedemo.com',
    contract: 'config/style-contracts/saucedemo.yaml',
    testid_attribute: 'data-test',
    stats: { flows: 1, steps_total: 1, steps_executed: 1, steps_blocked: 0, rescues_used: 0, rescue_budget: 3, screens: 1 },
    screens: [
      {
        name: 'checkout-completado',
        url_pattern: 'https://www.saucedemo.com/checkout-complete.html',
        flow: 'compra',
        elements: [
          { role: 'button', name: 'Back Home', test_id: 'back-to-products', locator_candidates: [] },
          { role: 'textbox', name: 'Card', frame_path: ['iframe[name="pago"]'], locator_candidates: [] },
        ],
        forms: [],
        landmarks: [],
        business_text: [
          { role: 'heading', name: 'Thank you for your order!', locator_candidates: [] },
        ],
      },
    ],
    transitions: [],
    open_questions: [],
    rescues: [],
  });

  it('business_text entra en interactive_elements (la postcondicion llega al Writer)', () => {
    const screen = domMapToDiscovery(map()).screens[0];
    const thanks = screen.interactive_elements.find((e) => e.name === 'Thank you for your order!');
    expect(thanks).toBeDefined();
    expect(thanks!.role).toBe('heading');
  });

  it('frame_path sobrevive el adapter', () => {
    const screen = domMapToDiscovery(map()).screens[0];
    const card = screen.interactive_elements.find((e) => e.name === 'Card');
    expect(card!.frame_path).toEqual(['iframe[name="pago"]']);
  });

  it('los campos de formulario siguen ordenados antes que botones (findLoginForm)', () => {
    const screen = domMapToDiscovery(map()).screens[0];
    const roles = screen.interactive_elements.map((e) => e.role);
    expect(roles.indexOf('textbox')).toBeLessThan(roles.indexOf('button'));
  });
});
