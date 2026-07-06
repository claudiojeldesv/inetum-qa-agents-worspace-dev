import { describe, it, expect } from 'vitest';
import { parseFeature } from '../../src/gherkin-to-criteria.ts';

const URL = 'https://parabank.parasoft.com/parabank/index.htm';

describe('gherkin-to-criteria parseFeature — basic mapping', () => {
  const feature = `Feature: Banca online

  @flow:login @REQ-12
  Scenario: Inicio de sesion con credenciales validas
    Given un cliente registrado no ha iniciado sesion
    When introduce usuario y contrasena correctos
    And confirma el acceso
    Then el sistema muestra el resumen de cuentas

  @flow:logout
  Scenario: Cierre de sesion
    Given el cliente tiene una sesion activa
    When ejecuta el cierre de sesion
    Then el sistema devuelve a la pantalla de acceso
`;

  it('assigns sequential RF-NNN in order of appearance', () => {
    const { document } = parseFeature(feature, { sourceFile: 'banca.feature', targetUrl: URL });
    expect(document.criteria.map((c) => c.id)).toEqual(['RF-001', 'RF-002']);
  });

  it('maps Given/When/Then literally, folding And into the current bucket', () => {
    const { document } = parseFeature(feature, { sourceFile: 'banca.feature', targetUrl: URL });
    const login = document.criteria[0];
    expect(login.given).toBe('un cliente registrado no ha iniciado sesion');
    expect(login.when).toBe('introduce usuario y contrasena correctos; confirma el acceso');
    expect(login.then).toBe('el sistema muestra el resumen de cuentas');
  });

  it('derives flow from @flow tag', () => {
    const { document } = parseFeature(feature, { sourceFile: 'banca.feature', targetUrl: URL });
    expect(document.criteria.map((c) => c.flow)).toEqual(['login', 'logout']);
  });

  it('preserves the client req id (@REQ-12) in source_ref with file:line', () => {
    const { document } = parseFeature(feature, { sourceFile: 'banca.feature', targetUrl: URL });
    expect(document.criteria[0].source_ref).toMatch(/^banca\.feature:\d+ \(REQ-12\)$/);
  });

  it('builds brief.flows from unique flows and derives entry from the URL', () => {
    const { document } = parseFeature(feature, { sourceFile: 'banca.feature', targetUrl: URL });
    expect(document.brief.flows).toEqual(['login', 'logout']);
    expect(document.brief.entry).toBe('/parabank/index.htm');
  });

  it('clean Gherkin (every scenario has a Then) produces no open questions', () => {
    const { document, questions } = parseFeature(feature, {
      sourceFile: 'banca.feature',
      targetUrl: URL,
    });
    expect(questions).toHaveLength(0);
    expect(document.criteria.every((c) => c.open_questions.length === 0)).toBe(true);
    expect(document.criteria.every((c) => c.confidence === 'high')).toBe(true);
  });
});

describe('gherkin-to-criteria parseFeature — Scenario Outline parameterization', () => {
  const feature = `Feature: Transferencias

  @flow:transfer-funds
  Scenario Outline: Transferencia entre cuentas propias
    Given el cliente ha iniciado sesion
    When transfiere <amount> de la cuenta origen a la cuenta destino
    Then el sistema muestra la confirmacion de la transferencia

    Examples:
      | amount |
      | 1      |
      | 2      |
`;

  it('extracts the Examples table into an additive examples block', () => {
    const { document } = parseFeature(feature, { sourceFile: 't.feature', targetUrl: URL });
    const c = document.criteria[0];
    expect(c.examples).toBeDefined();
    expect(c.examples?.header).toEqual(['amount']);
    expect(c.examples?.rows).toEqual([{ amount: '1' }, { amount: '2' }]);
  });

  it('keeps a single RF for the outline (one requirement, N data sets)', () => {
    const { document } = parseFeature(feature, { sourceFile: 't.feature', targetUrl: URL });
    expect(document.criteria).toHaveLength(1);
    expect(document.criteria[0].id).toBe('RF-001');
  });
});

describe('gherkin-to-criteria parseFeature — Background and tags', () => {
  it('prepends Background steps to every scenario given', () => {
    const feature = `Feature: X
  Background:
    Given la app esta disponible

  Scenario: A
    When hago algo
    Then veo el resultado
`;
    const { document } = parseFeature(feature, { sourceFile: 'x.feature', targetUrl: URL });
    expect(document.criteria[0].given).toBe('la app esta disponible');
  });

  it('honors @drift-risk:high tag and surfaces it in brief.drift_flags', () => {
    const feature = `Feature: X

  @flow:bill-pay @drift-risk:high
  Scenario: Pago de recibo
    Given el cliente ha iniciado sesion
    When da de alta el pago de un recibo
    Then el sistema confirma el pago
`;
    const { document } = parseFeature(feature, { sourceFile: 'x.feature', targetUrl: URL });
    expect(document.criteria[0].drift_risk).toBe('high');
    expect(document.brief.drift_flags).toEqual([
      { flow: 'bill-pay', rf: 'RF-001', reason: expect.stringContaining('drift_risk=high') },
    ]);
  });

  it('honors @entry and @ignore feature-level tags', () => {
    const feature = `@entry:/parabank/index.htm @ignore:admin
Feature: X

  Scenario: A
    When hago algo
    Then veo el resultado
`;
    const { document } = parseFeature(feature, { sourceFile: 'x.feature', targetUrl: URL });
    expect(document.brief.entry).toBe('/parabank/index.htm');
    expect(document.brief.ignore).toEqual(['admin']);
  });
});

describe('gherkin-to-criteria parseFeature — S3 boundary (no Then)', () => {
  const feature = `Feature: Incompleto

  @flow:transfer-funds
  Scenario: Transferencia sin resultado declarado
    Given el cliente ha iniciado sesion
    When confirma la transferencia
`;

  it('flags a scenario with no Then as an open question, never invents the outcome', () => {
    const { document, questions } = parseFeature(feature, {
      sourceFile: 'i.feature',
      targetUrl: URL,
    });
    const c = document.criteria[0];
    expect(c.confidence).toBe('low');
    expect(c.open_questions).toEqual(['Q-001']);
    expect(c.then).toContain('[AMBIGUO');
    expect(questions).toHaveLength(1);
    expect(questions[0]).toContain('spec-refiner');
  });
});

describe('gherkin-to-criteria parseFeature — PII redaction', () => {
  it('detects PII-shaped values in Examples and reports them without using them as fixtures', () => {
    const feature = `Feature: X

  @flow:transfer-funds
  Scenario Outline: Transferencia
    Given el cliente ha iniciado sesion
    When transfiere a la cuenta <iban>
    Then el sistema confirma

    Examples:
      | iban                 |
      | ES9121000418450200051332 |
`;
    const { document } = parseFeature(feature, { sourceFile: 'x.feature', targetUrl: URL });
    expect(document.pii_redaction.literals_found).toContain('iban');
    expect(document.pii_redaction.downstream_note).toContain('synthetic_fixtures');
  });
});
