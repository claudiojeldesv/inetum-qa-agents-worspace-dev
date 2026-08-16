/**
 * walk-to-spec — el emisor determinístico de specs desde un walk verificado.
 *
 * El par falsable que decide si esto es producto o fábrica de verdes falsos:
 * (1) el output del emisor pasa el pre-review REAL (el mismo que audita al
 *     Writer, sin excepción para el emisor) con 0 findings, forma incluida;
 * (2) un flujo con paso bloqueado, aserción after_blocked o acción sin locator
 *     NO emite — va a la cola del Writer con el motivo.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { preReviewSpec, type PreReviewContract } from '../../src/scripts/pre-review.ts';
import { chainToCode, emitFromWalk, flowEligibility, gotoTarget, loadEmitContract, type EmitContract } from '../src/walk-to-spec.ts';
import type { DomMap, StepReport, WalkScript } from '../src/walk-types.ts';

const CONTRACT: EmitContract = {
  class_suffix: 'Page',
  inject_axe: true,
  fail_on_violations: false,
  evidence_level: 'steps',
  synthetic_fixtures: { credentials: [{ username: 'demo_user', password: 'demo_pass' }] },
};

const PRE_REVIEW: PreReviewContract = {
  forbid_css_selectors: true,
  forbid_xpath: true,
  css_fallback_attributes: [],
  banned_apis: ['page.waitForTimeout', 'assert.equal', 'xpath'],
  pom_enabled: true,
  require_business_postcondition: true,
  min_functional_asserts: 1,
  evidence_level: 'steps',
};

function script(): WalkScript {
  return {
    version: 1,
    site_id: 'banco-demo',
    entry: '/login',
    flows: [
      {
        flow: 'inicio-sesion',
        criteria: ['RF-001'],
        steps: [
          { id: 's1', action: 'fill', hint: { label: 'Usuario' }, value: '$fixtures.credentials.0.username' },
          { id: 's2', action: 'fill', hint: { label: 'Contraseña' }, value: '$fixtures.credentials.0.password', secret: true },
          { id: 's3', action: 'click', hint: { role: 'button', name: 'Acceder' }, screen: 'resumen', expect_transition: true },
          { id: 's4', action: 'expect_text', value: 'Posición global' },
          { id: 's5', action: 'expect_state', hint: { role: 'button', name: 'Salir' }, value: 'visible' },
        ],
      },
    ],
  };
}

function report(step: string, extra: Partial<StepReport> = {}): StepReport {
  return {
    flow: 'inicio-sesion',
    step,
    action: 'fill',
    outcome: 'ok',
    action_ms: 100,
    retried: false,
    ...extra,
  };
}

function domMap(reports: StepReport[]): DomMap {
  return {
    version: 1,
    site_id: 'banco-demo',
    generated_by: 'dom-walker',
    generated_at: '2026-08-16T00:00:00Z',
    target_url: 'https://banco.example',
    contract: 'banco-demo',
    testid_attribute: 'data-test',
    stats: {
      flows: 1, steps_total: 5, steps_executed: 5, steps_blocked: 0, rescues_used: 0,
      rescue_budget: 5, screens: 2, flaky_timing: 0, settle_timeouts: 0, postcondition_unmet: 0,
    },
    screens: [
      { name: 'login', url_pattern: '/login', flow: 'inicio-sesion', elements: [], forms: [], landmarks: [] },
      { name: 'resumen', url_pattern: '/resumen', flow: 'inicio-sesion', elements: [], forms: [], landmarks: [] },
    ],
    transitions: [],
    open_questions: [],
    rescues: [],
    step_reports: reports,
  };
}

const GREEN_REPORTS: StepReport[] = [
  report('s1', { screen: 'login', resolved_via: "getByLabel('Usuario')" }),
  report('s2', { screen: 'login', resolved_via: "getByLabel('Contraseña')" }),
  report('s3', { action: 'click', screen: 'resumen', resolved_via: "getByRole('button', { name: 'Acceder' })" }),
  report('s4', { action: 'expect_text', screen: 'resumen' }),
  report('s5', { action: 'expect_state', screen: 'resumen', resolved_via: "getByRole('button', { name: 'Salir' })" }),
];

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'walk-to-spec-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('emitFromWalk — camino verde', () => {
  const result = emitFromWalk(script(), domMap(GREEN_REPORTS), CONTRACT);

  it('emite el flujo verde completo, cola vacía', () => {
    expect(result.emitted).toHaveLength(1);
    expect(result.queued).toEqual([]);
  });

  it('el spec emitido pasa el pre-review REAL con 0 findings (forma incluida)', () => {
    const p = join(dir, 'inicio-sesion.spec.ts');
    writeFileSync(p, result.emitted[0].content, 'utf8');
    const r = preReviewSpec(p, PRE_REVIEW);
    expect(r.findings).toEqual([]);
    expect(r.clean).toBe(true);
  });

  it('la forma es el golden: JSDoc, steps Dado/Cuando/Entonces, a11y fijo, describe sin prefijo', () => {
    const spec = result.emitted[0].content;
    expect(spec).toContain('@criterion RF-001 (walk-script: banco-demo)');
    expect(spec).toContain('@generated-by walk-to-spec v1');
    expect(spec).toContain("test.step('Dado:");
    expect(spec).toContain("test.step('Evidencia a11y (WCAG 2.1 AA)'");
    expect(spec).toContain("test.step('Cuando:");
    expect(spec).toContain("test.step('Entonces:");
    expect(spec).toContain("test.describe('Inicio sesion'");
    expect(spec).not.toContain('Feature:');
  });

  it('los locators del POM son los resolved_via de la escalera, no convenciones', () => {
    const login = result.pages.find((p) => p.className === 'LoginPage');
    expect(login).toBeDefined();
    expect(login!.content).toContain("page.getByLabel('Usuario')");
    expect(login!.content).toContain('async goto()');
  });

  it('el clic de transición pertenece a la pantalla de ORIGEN, no a la de destino (campo OrangeHRM)', () => {
    const login = result.pages.find((p) => p.className === 'LoginPage');
    const resumen = result.pages.find((p) => p.className === 'ResumenPage');
    expect(login!.content).toContain("getByRole('button', { name: 'Acceder' })");
    expect(resumen?.content ?? '').not.toContain('Acceder');
    // y el destino conserva lo que sí es suyo (la aserción de estado post-login)
    expect(resumen!.content).toContain("getByRole('button', { name: 'Salir' })");
  });

  it('las variables del spec conservan camelCase de la clase', () => {
    expect(result.emitted[0].content).toContain('const loginPage = new LoginPage(page);');
  });

  it('el secreto jamás toca el spec: sale como env var', () => {
    const spec = result.emitted[0].content;
    expect(spec).not.toContain('demo_pass');
    expect(spec).toContain('process.env.QA_BANCO_DEMO_CONTRASE');
    // el no-secreto sí se resuelve del fixture
    expect(spec).toContain("'demo_user'");
    expect(spec).not.toContain('$fixtures');
  });

  it('es determinista: dos emisiones son byte a byte idénticas', () => {
    const again = emitFromWalk(script(), domMap(GREEN_REPORTS), CONTRACT);
    expect(again.emitted[0].content).toBe(result.emitted[0].content);
    expect(again.pages.map((p) => p.content)).toEqual(result.pages.map((p) => p.content));
  });
});

describe('emitFromWalk — la mitad falsable: lo que NO se emite', () => {
  it('paso bloqueado (action_failed) → flujo a la cola con el motivo', () => {
    const reports = GREEN_REPORTS.map((r) => (r.step === 's3' ? { ...r, outcome: 'action_failed' as const } : r));
    const result = emitFromWalk(script(), domMap(reports), CONTRACT);
    expect(result.emitted).toEqual([]);
    expect(result.queued).toHaveLength(1);
    expect(result.queued[0].reasons.join(' ')).toContain('action_failed');
  });

  it('aserción que pasó con after_blocked → cola (K0.39: el verde sospechoso no se industrializa)', () => {
    const reports = GREEN_REPORTS.map((r) => (r.step === 's4' ? { ...r, after_blocked: 's3' } : r));
    const result = emitFromWalk(script(), domMap(reports), CONTRACT);
    expect(result.emitted).toEqual([]);
    expect(result.queued[0].reasons.join(' ')).toContain('verde falso');
  });

  it('acción sin locator autoritativo → cola', () => {
    const reports = GREEN_REPORTS.map((r) => (r.step === 's1' ? { ...r, resolved_via: undefined } : r));
    const result = emitFromWalk(script(), domMap(reports), CONTRACT);
    expect(result.emitted).toEqual([]);
    expect(result.queued[0].reasons.join(' ')).toContain('sin locator autoritativo');
  });

  it('expect_text con scope → cola (no se reintroduce el verde falso de K0.30)', () => {
    const s = script();
    s.flows[0].steps[3] = { ...s.flows[0].steps[3], scope: { role: 'region', name: 'Cuentas' } };
    const result = emitFromWalk(s, domMap(GREEN_REPORTS), CONTRACT);
    expect(result.emitted).toEqual([]);
    expect(result.queued[0].reasons.join(' ')).toContain('K0.30');
  });

  it('paso optional bloqueado se salta con warning; el flujo SÍ emite', () => {
    const s = script();
    s.flows[0].steps.splice(3, 0, { id: 's3b', action: 'click', hint: { text: 'Banner' }, optional: true });
    const result = emitFromWalk(s, domMap(GREEN_REPORTS), CONTRACT);
    expect(result.emitted).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('s3b');
  });

  it('matched_text parcial viaja como comentario de evidencia (clase 3 del régimen)', () => {
    const reports = GREEN_REPORTS.map((r) =>
      r.step === 's4' ? { ...r, matched_text: '(0) No Posición global', value_searched: 'Posición global' } : r,
    );
    const result = emitFromWalk(script(), domMap(reports), CONTRACT);
    expect(result.emitted[0].content).toContain('texto completo observado: "(0) No Posición global"');
  });
});

describe('chainToCode — gramática de la escalera a código', () => {
  it('segmento simple pasa tal cual', () => {
    expect(chainToCode("getByTestId('login')")).toBe("getByTestId('login')");
  });
  it('cadena con scope y nth se anida', () => {
    expect(chainToCode("getByRole('dialog') >> getByRole('button').nth(2)")).toBe(
      "getByRole('dialog').getByRole('button').nth(2)",
    );
  });
  it('css= se traduce a locator()', () => {
    expect(chainToCode('css=#username')).toBe("locator('#username')");
  });
});

describe('gotoTarget — el entorno lo gobierna baseURL, no el código', () => {
  it('ruta relativa pasa tal cual, sin warning', () => {
    const warns: string[] = [];
    expect(gotoTarget('/login', 'https://app.example', (m) => warns.push(m), 'x')).toBe('/login');
    expect(warns).toEqual([]);
  });

  it('absoluta con host de base_url → se emite la RUTA (portable entre entornos)', () => {
    const warns: string[] = [];
    expect(
      gotoTarget('https://staging.example/web/login?next=home', 'https://staging.example', (m) => warns.push(m), 'x'),
    ).toBe('/web/login?next=home');
    expect(warns).toEqual([]);
  });

  it('absoluta cross-host → se conserva Y se avisa (recortar el origen sería adivinar)', () => {
    const warns: string[] = [];
    expect(gotoTarget('https://sso.otro.com/auth', 'https://app.example', (m) => warns.push(m), 'f/s1')).toBe(
      'https://sso.otro.com/auth',
    );
    expect(warns.join(' ')).toContain('atado a ese entorno');
  });

  it('absoluta sin base_url declarada → se conserva y se avisa', () => {
    const warns: string[] = [];
    gotoTarget('https://app.example/login', undefined, (m) => warns.push(m), 'x');
    expect(warns.join(' ')).toContain('sin base_url');
  });
});

describe('loadEmitContract', () => {
  it('defaults sin contract: steps, axe on, gate off', () => {
    const c = loadEmitContract(undefined);
    expect(c.evidence_level).toBe('steps');
    expect(c.inject_axe).toBe(true);
    expect(c.fail_on_violations).toBe(false);
  });
});

describe('flowEligibility — expuesta para el consumidor', () => {
  it('un flujo íntegro devuelve todos sus pasos con chain', () => {
    const reports = new Map(GREEN_REPORTS.map((r) => [`inicio-sesion/${r.step}`, r]));
    const { steps, reasons } = flowEligibility(script().flows[0], reports, []);
    expect(reasons).toEqual([]);
    expect(steps).toHaveLength(5);
    expect(steps[0].chain).toBe("getByLabel('Usuario')");
  });
});
