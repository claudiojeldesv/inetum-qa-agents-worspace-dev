import { describe, it, expect } from 'vitest';
import { buildShowcaseHtml, type ShowcaseData } from '../../src/scripts/build-showcase.ts';

// ---- fixture base S3 (judge on, drift presente, RF) ----
function s3Data(overrides: Partial<ShowcaseData> = {}): ShowcaseData {
  const spec = 'tests/e2e/saucedemo/TC-001_inicio-sesion.usuario-valido.spec.ts';
  return {
    summary: {
      module: 'S3',
      mode: 'Spec-refiner (Forma B)',
      target_url: 'https://www.saucedemo.com/',
      source_fd: 'saucedemo-fd-3casos.md',
      style_contract: 'config/style-contracts/saucedemo.yaml',
      compliance_verdict: 'pass',
      criteria_total: 3,
      criteria_blocked_open_questions: 0,
      gates: { pii: 'off' },
      a11y: { axe_injected_all_specs: true, fail_on_violations: false, mode: 'warning', specs: 1 },
      playwright_run: { result: '1 passed', workers: 3 },
      verification: { workers: 3 },
      judge_summary: { status: 'enabled', mean_score: 0.967, min_score: 0.96, max_score: 0.97, below_threshold: 0 },
      tests_generated: [
        {
          rf: 'RF-001',
          tc_id: 'TC-001',
          title: 'Acceso con usuario válido',
          flow: 'login-valid-user',
          scenario: 'inicio-sesion.usuario-valido',
          spec,
          tags: ['@smoke', '@critical'],
          writer_iterations: 1,
          reviewer_verdict: 'approved',
          must_fix: 0,
          judge_score: 0.97,
          run_result: 'passed',
        },
      ],
    },
    reviewsByFile: {
      [spec.split('/').pop()!]: [{ test_file: spec, iteration: 0, verdict: 'approved', feedback: [], feedback_summary: 'clean' }],
    },
    judgeByFile: {
      [spec.split('/').pop()!]: {
        test_file: spec,
        axes: { assertions: 0.95, selectors: 1.0, waits: 1.0, isolation: 0.95, criterion_coverage: 0.95, a11y: 1.0, structure: 1.0 },
      },
    },
    criteriaById: { 'RF-001': { id: 'RF-001', source_ref: 'saucedemo-fd-3casos.md:24-25' } },
    drift: { drift: [], covered: [{ rf: 'RF-001' }], summary: 'Drift estructural: NINGUNO.' },
    pomCount: 2,
    runDate: '2026-06-25',
    runId: 'RUN-TEST',
    ...overrides,
  };
}

describe('build-showcase — render S3 (judge on, drift, RF)', () => {
  const html = buildShowcaseHtml(s3Data());

  it('cita el criterio RF-NNN con su source_ref', () => {
    expect(html).toContain('@criterion');
    expect(html).toContain('RF-001');
    expect(html).toContain('saucedemo-fd-3casos.md:24-25');
  });

  it('renderiza el callout de drift cuando existe drift-report', () => {
    expect(html).toContain('Drift FD ↔ implementación');
  });

  it('muestra el Judge con la media real y gauges de ejes', () => {
    expect(html).toContain('Judge · media 0.967');
    expect(html).toContain('Trazabilidad RF');
    expect(html).toContain('Assertions');
  });

  it('marca el run en verde cuando todos pasan', () => {
    expect(html).toContain('is-pass');
    expect(html).not.toContain('is-block nums');
  });
});

describe('build-showcase — render S4 (judge off, sin drift ni RF)', () => {
  const html = buildShowcaseHtml(
    s3Data({
      summary: {
        module: 'S4',
        target_url: 'https://www.saucedemo.com/',
        style_contract: 'saucedemo.yaml',
        compliance_verdict: 'pass',
        gates: { pii: 'off' },
        a11y: { specs: 1, mode: 'warning', fail_on_violations: false },
        playwright_run: { result: '1 passed', workers: 4 },
        judge_summary: { status: 'skipped' },
        tests_generated: [
          { tc_id: 'TC-01', title: 'login', scenario: 'login.happy', spec: 'tests/e2e/login.happy.spec.ts', tags: ['@smoke'], writer_iterations: 1, reviewer_verdict: 'approved', must_fix: 0, run_result: 'passed' },
        ],
      },
      reviewsByFile: {},
      judgeByFile: {},
      criteriaById: {},
      drift: null,
    }),
  );

  it('omite el callout de drift si no hay drift-report', () => {
    expect(html).not.toContain('Drift FD ↔ implementación');
  });

  it('muestra el Judge como OFF y el KPI de iteraciones (no RF)', () => {
    expect(html).toContain('No ejecutado en este run');
    expect(html).toContain('Iteraciones W↔R');
    expect(html).not.toContain('Trazabilidad RF');
  });
});

describe('build-showcase — correctitud y seguridad', () => {
  it('marca el run en rojo (is-block) cuando hay fallos', () => {
    const d = s3Data();
    d.summary.tests_generated = [
      { ...d.summary.tests_generated![0], run_result: 'failed' },
      { rf: 'RF-002', tc_id: 'TC-002', title: 'x', scenario: 'inicio-sesion.bloqueado', spec: 'tests/e2e/x.spec.ts', run_result: 'passed', must_fix: 0 },
    ];
    const html = buildShowcaseHtml(d);
    expect(html).toContain('is-block nums');
  });

  it('suma el must-fix real (no lo hardcodea a 0)', () => {
    const d = s3Data();
    d.summary.tests_generated = [{ ...d.summary.tests_generated![0], must_fix: 2 }];
    const html = buildShowcaseHtml(d);
    expect(html).toContain('2 must-fix');
  });

  it('escapa el HTML de los datos dinámicos del artefacto', () => {
    const d = s3Data();
    d.summary.tests_generated![0].title = '<script>alert(1)</script>';
    const html = buildShowcaseHtml(d);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
