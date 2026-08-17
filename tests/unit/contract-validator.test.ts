import { describe, it, expect } from 'vitest';
import { validateContract, resolveConfigState } from '../../src/contract-validator.ts';

function errs(text: string) {
  return validateContract(text).issues.filter((i) => i.severity === 'error');
}
function warns(text: string) {
  return validateContract(text).issues.filter((i) => i.severity === 'warning');
}

describe('contract-validator — valid contracts', () => {
  it('accepts a well-formed contract with no issues', () => {
    const yaml = `
version: 1
project: demo
locators:
  priority: [getByTestId, getByRole]
  forbid_css_selectors: true
a11y:
  inject_axe_check: true
  fail_on_violations: false
  severity_threshold: [serious, critical]
evidence:
  level: full
  screenshots: on
`;
    const res = validateContract(yaml);
    expect(res.ok).toBe(true);
    expect(res.issues).toHaveLength(0);
  });
});

describe('contract-validator — el bloque walker (K0.42)', () => {
  it('acepta el bloque que emite la entrevista', () => {
    const res = validateContract('version: 1\nwalker:\n  enabled: true\n  rescue_budget: 0\n  assist: true\n');
    expect(res.ok).toBe(true);
    expect(res.issues).toHaveLength(0);
  });

  it('avisa del walker apagado con ayuda contratada', () => {
    // individualmente válidos, juntos no significan nada: nadie va a gastar ese
    // presupuesto ni abrir ese panel si el walker no corre
    const w = warns('version: 1\nwalker:\n  enabled: false\n  rescue_budget: 3\n  assist: true\n');
    expect(w.some((i) => i.path === 'walker.rescue_budget')).toBe(true);
    expect(w.some((i) => i.path === 'walker.assist')).toBe(true);
  });

  it('MITAD FALSABLE: con el walker encendido, esos mismos valores no avisan de nada', () => {
    // si avisara siempre, el aviso sería ruido y el QA aprendería a ignorarlo
    const w = warns('version: 1\nwalker:\n  enabled: true\n  rescue_budget: 3\n  assist: true\n');
    expect(w.filter((i) => i.path.startsWith('walker'))).toHaveLength(0);
  });

  it('el papel del walker NO es declarable: motor o verificador se deriva del modulo', () => {
    // dejar que un contract lo afirme permitiria declarar una combinacion
    // imposible (solo una URL y el walker como motor, sin guion que ejecutar)
    const w = warns('version: 1\nwalker:\n  enabled: true\n  mode: primary\n');
    expect(w.some((i) => i.path === 'walker.mode')).toBe(true);
  });
});

describe('contract-validator — enum errors', () => {
  it('rejects an invalid evidence.level', () => {
    const e = errs('version: 1\nevidence:\n  level: complete\n');
    expect(e.some((i) => i.path === 'evidence.level')).toBe(true);
  });

  it('rejects an invalid success_signal.type', () => {
    const e = errs('version: 1\nauth:\n  enabled: true\n  login_path: /login\n  success_signal:\n    type: cookie\n    value: x\n');
    expect(e.some((i) => i.path === 'auth.success_signal.type')).toBe(true);
  });
});

describe('contract-validator — typo detection (the silent hole)', () => {
  it('flags fail_on_violation (singular) as an unknown field with a suggestion', () => {
    const w = warns('version: 1\na11y:\n  fail_on_violation: true\n');
    const hit = w.find((i) => i.path === 'a11y.fail_on_violation');
    expect(hit).toBeDefined();
    expect(hit?.message).toContain('fail_on_violations');
  });

  it('flags an unknown top-level block', () => {
    const w = warns('version: 1\nlocatorss:\n  forbid_xpath: true\n');
    expect(w.some((i) => i.path === 'locatorss')).toBe(true);
  });
});

describe('contract-validator — type errors', () => {
  it('rejects a string where a boolean is expected', () => {
    const e = errs('version: 1\npom:\n  enabled: "yes"\n');
    expect(e.some((i) => i.path === 'pom.enabled')).toBe(true);
  });
});

describe('contract-validator — freeform synthetic_fixtures', () => {
  it('does not flag client-defined keys under synthetic_fixtures', () => {
    const yaml = `
version: 1
synthetic_fixtures:
  credentials:
    - { username: a, password: b }
  buyer_info:
    - { firstName: John }
  invalid_credentials:
    - { username: a, password: wrong }
`;
    expect(warns(yaml)).toHaveLength(0);
    expect(errs(yaml)).toHaveLength(0);
  });
});

describe('contract-validator — coherence', () => {
  it('warns when auth.enabled:true lacks login_path', () => {
    const w = warns('version: 1\nauth:\n  enabled: true\n  success_signal:\n    type: url\n    value: /home\n');
    expect(w.some((i) => i.path === 'auth.login_path')).toBe(true);
  });

  it('warns when fail_on_violations:true but severity_threshold is empty', () => {
    const w = warns('version: 1\na11y:\n  fail_on_violations: true\n  severity_threshold: []\n');
    expect(w.some((i) => i.path === 'a11y.severity_threshold')).toBe(true);
  });

  it('does not warn on version 1', () => {
    expect(warns('version: 1\nproject: x\n')).toHaveLength(0);
  });

  it('warns on an unexpected version', () => {
    expect(warns('version: 2\n').some((i) => i.path === 'version')).toBe(true);
  });
});

describe('contract-validator — bad item enums are soft warnings', () => {
  it('warns on an unknown locator strategy', () => {
    const w = warns('version: 1\nlocators:\n  priority: [getByMagic]\n');
    expect(w.some((i) => i.path === 'locators.priority')).toBe(true);
  });
});

describe('resolveConfigState — effective session state', () => {
  const contract = {
    a11y: { fail_on_violations: false },
    evidence: { level: 'full' },
    auth: { enabled: true },
    locators: { priority: ['getByTestId', 'getByRole'] },
  };

  it('reports gates off when env-vars are unset', () => {
    const { rows } = resolveConfigState(contract, {});
    const pii = rows.find((r) => r.key.includes('PII'));
    const judge = rows.find((r) => r.key.includes('Judge'));
    expect(pii?.value).toBe('off');
    expect(judge?.value).toBe('off');
  });

  it('reports gates ON with truthy env-vars', () => {
    const { rows } = resolveConfigState(contract, { QA_ENABLE_PII: '1', QA_ENABLE_JUDGE: 'true' });
    expect(rows.find((r) => r.key.includes('PII'))?.value).toBe('ON');
    expect(rows.find((r) => r.key.includes('Judge'))?.value).toBe('ON');
  });

  it('surfaces evidence.level and auth from the contract', () => {
    const { rows } = resolveConfigState(contract, {});
    expect(rows.find((r) => r.key === 'evidence.level')?.value).toBe('full');
    expect(rows.find((r) => r.key === 'auth')?.value).toContain('enabled');
  });

  it('marks defaults when the contract is empty', () => {
    const { rows } = resolveConfigState({}, {});
    expect(rows.find((r) => r.key === 'evidence.level')?.origin).toBe('default');
    // default 'steps' desde spec-template.md: test.step estructura Allure y el error
    // dice en qué paso de negocio rompió; 'minimal' queda como opt-out por contract
    expect(rows.find((r) => r.key === 'evidence.level')?.value).toBe('steps');
  });
});

describe('contract-validator — healing (regla #10, Q3)', () => {
  it('acepta el bloque healing con enabled boolean', () => {
    const res = validateContract('version: 1\nhealing:\n  enabled: true\n');
    expect(res.ok).toBe(true);
    expect(res.issues).toEqual([]);
  });

  it('rechaza enabled no-boolean y flaggea campos desconocidos del bloque', () => {
    const res = validateContract('version: 1\nhealing:\n  enabled: siempre\n  max_specs: 3\n');
    expect(res.issues.some((i) => i.path === 'healing.enabled' && i.severity === 'error')).toBe(true);
    expect(res.issues.some((i) => i.path === 'healing.max_specs' && i.severity === 'warning')).toBe(true);
  });

  it('resolveConfigState: off por defecto, ON solo con enabled:true del contract', () => {
    const off = resolveConfigState({}, {});
    const offRow = off.rows.find((r) => r.key.startsWith('healing'));
    expect(offRow?.value).toContain('off');
    expect(offRow?.origin).toBe('default');

    const on = resolveConfigState({ healing: { enabled: true } }, {});
    const onRow = on.rows.find((r) => r.key.startsWith('healing'));
    expect(onRow?.value).toContain('ON');
    expect(onRow?.origin).toBe('contract');
  });
});
