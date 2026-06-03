import { describe, it, expect } from 'vitest';
import {
  parseJsonObjects,
  buildEnvironmentProperties,
  buildCategories,
  buildExecutor,
  indexJudgeByFile,
  indexReviewByFile,
  matchResultToSpec,
  planEnrichment,
  type RunSummary,
  type AllureResult,
} from '../../src/allure-enricher.ts';

const SUMMARY: RunSummary = {
  module: 'S2',
  input_format: 'gherkin',
  target_url: 'https://parabank.parasoft.com/parabank/index.htm',
  compliance_verdict: 'warn (W1)',
  run_phase: 'v0.2 Fase E',
  tests_generated: [
    {
      spec: 'tests/e2e/login.spec.ts',
      rf: 'RF-001',
      source_ref: 'parabank.feature:8 (REQ-LOGIN)',
      writer_iterations: 1,
      reviewer_verdict: 'pass',
      judge_score: 0.93,
      run_result: 'passed',
    },
  ],
  drift: [{ rf: 'RF-004', flow: 'close-account', source_ref: 'parabank.feature:33', reason: 'no expuesto' }],
  judge_summary: { mean_score: 0.94, min_score: 0.93, gate_ask_first_triggered: false },
  playwright_run: { workers: 3, result: '5 passed' },
  a11y: { axe_injected_all_specs: true, fail_on_violations: false, mode: 'warning' },
};

const JUDGE_REPORT = `{
  "test_file": "tests/e2e/login.spec.ts",
  "score": 0.93,
  "axes": { "assertions": 0.95, "selectors": 0.95 },
  "reasoning": "strong",
  "reviewer_verdict": "pass",
  "reviewer_iterations": 1
}
{
  "source": "subagent",
  "action": "judge_decision",
  "target": "tests/e2e/login.spec.ts",
  "metadata": { "score": 0.93 },
  "result": "pass"
}`;

function loginResult(): AllureResult {
  return {
    uuid: 'abc-123',
    name: 'login success',
    fullName: 'tests/e2e/login.spec.ts:Feature login',
    status: 'passed',
    labels: [{ name: 'suite', value: 'login.spec.ts' }],
  };
}

describe('parseJsonObjects — formas tolerantes', () => {
  it('parsea un array JSON', () => {
    expect(parseJsonObjects('[{"a":1},{"a":2}]')).toHaveLength(2);
  });

  it('parsea un único objeto', () => {
    expect(parseJsonObjects('{"a":1}')).toEqual([{ a: 1 }]);
  });

  it('parsea objetos pretty-printed concatenados (forma del judge-report)', () => {
    const objs = parseJsonObjects(JUDGE_REPORT) as Array<Record<string, unknown>>;
    expect(objs).toHaveLength(2);
    expect(objs[0].test_file).toBe('tests/e2e/login.spec.ts');
    expect(objs[1].action).toBe('judge_decision');
  });

  it('devuelve [] para texto vacío', () => {
    expect(parseJsonObjects('   ')).toEqual([]);
  });

  it('no confunde llaves dentro de strings', () => {
    const objs = parseJsonObjects('{"k":"a{b}c"}') as Array<Record<string, unknown>>;
    expect(objs[0].k).toBe('a{b}c');
  });
});

describe('buildEnvironmentProperties', () => {
  it('incluye target, compliance, judge mean y drift derivado del summary', () => {
    const props = buildEnvironmentProperties(SUMMARY);
    expect(props).toContain('agent=ia4d-qa-automator');
    expect(props).toContain('target_url=https://parabank.parasoft.com/parabank/index.htm');
    expect(props).toContain('compliance_verdict=warn (W1)');
    expect(props).toContain('judge_mean_score=0.94');
    expect(props).toContain('drift_count=1');
    expect(props).toContain('close-account(RF-004)');
  });

  it('omite claves vacías/ausentes', () => {
    const props = buildEnvironmentProperties({ target_url: 'https://x' });
    expect(props).not.toContain('module=');
    expect(props).toContain('target_url=https://x');
  });
});

describe('buildCategories / buildExecutor', () => {
  it('categories es JSON Allure válido con triaje de fallos y a11y', () => {
    const cats = buildCategories();
    const names = cats.map((c) => c.name);
    expect(names).toContain('Producto: fallo funcional');
    expect(names).toContain('Accesibilidad (axe-core)');
    expect(cats.every((c) => Array.isArray(c.matchedStatuses))).toBe(true);
  });

  it('executor lleva el nombre del agente', () => {
    expect(buildExecutor(SUMMARY).name).toBe('ia4d-qa-automator');
  });
});

describe('indexado de evidencia', () => {
  it('indexJudgeByFile solo toma entradas con axes (ignora judge_decision de auditoría)', () => {
    const map = indexJudgeByFile(parseJsonObjects(JUDGE_REPORT));
    expect(map.size).toBe(1);
    expect(map.get('login.spec.ts')?.score).toBe(0.93);
  });

  it('indexReviewByFile agrupa por basename', () => {
    const map = indexReviewByFile([
      { test_file: 'tests/e2e/login.spec.ts', iteration: 0, verdict: 'approved', feedback: [] },
    ]);
    expect(map.get('login.spec.ts')).toHaveLength(1);
  });
});

describe('matchResultToSpec', () => {
  it('matchea por fullName', () => {
    expect(matchResultToSpec(loginResult(), 'tests/e2e/login.spec.ts')).toBe(true);
  });

  it('matchea por label punteado', () => {
    const r: AllureResult = { labels: [{ name: 'package', value: 'tests.e2e.login.spec.ts' }] };
    expect(matchResultToSpec(r, 'tests/e2e/login.spec.ts')).toBe(true);
  });

  it('no matchea spec distinto', () => {
    expect(matchResultToSpec(loginResult(), 'tests/e2e/logout.spec.ts')).toBe(false);
  });
});

describe('planEnrichment — enriquecido', () => {
  it('inyecta labels RF, link tms, attachments judge+review en el resultado matcheado', () => {
    const judgeByFile = indexJudgeByFile(parseJsonObjects(JUDGE_REPORT));
    const reviewByFile = indexReviewByFile([
      { test_file: 'tests/e2e/login.spec.ts', iteration: 0, verdict: 'approved', feedback_summary: '0 must-fix' },
    ]);
    const results = [{ file: '/r/abc-123-result.json', json: loginResult() }];

    const plan = planEnrichment({ summary: SUMMARY, results, judgeByFile, reviewByFile });

    expect(plan.matchedSpecs).toEqual(['tests/e2e/login.spec.ts']);
    expect(plan.unmatchedSpecs).toEqual([]);

    const mutated = plan.resultMutations[0].json;
    expect(mutated.labels).toContainEqual({ name: 'feature', value: 'RF-001' });
    expect(mutated.labels).toContainEqual({ name: 'tag', value: 'RF-001' });
    expect(mutated.links).toContainEqual({ name: 'RF-001', url: 'parabank.feature:8 (REQ-LOGIN)', type: 'tms' });
    expect(mutated.attachments?.some((a) => a.type === 'application/json')).toBe(true);
    expect(mutated.attachments?.some((a) => a.type === 'text/markdown')).toBe(true);

    expect(plan.attachmentFiles.some((a) => a.source === 'abc-123-judge-attachment.json')).toBe(true);
    expect(plan.attachmentFiles.some((a) => a.source === 'abc-123-review-attachment.md')).toBe(true);
    expect(plan.sidecars.map((s) => s.file)).toEqual(['environment.properties', 'categories.json', 'executor.json']);
  });

  it('camino judge-off: sin judge-report no añade attachment de judge ni rompe', () => {
    const reviewByFile = indexReviewByFile([
      { test_file: 'tests/e2e/login.spec.ts', iteration: 0, verdict: 'approved' },
    ]);
    const results = [{ file: '/r/abc-123-result.json', json: loginResult() }];

    const plan = planEnrichment({ summary: SUMMARY, results, judgeByFile: new Map(), reviewByFile });

    const mutated = plan.resultMutations[0].json;
    // Sigue habiendo labels y attachment de review, pero ninguno de judge.
    expect(mutated.labels).toContainEqual({ name: 'feature', value: 'RF-001' });
    expect(plan.attachmentFiles.some((a) => a.source.endsWith('-judge-attachment.json'))).toBe(false);
    expect(plan.attachmentFiles.some((a) => a.source.endsWith('-review-attachment.md'))).toBe(true);
  });

  it('spec sin resultado Allure matcheado → unmatched, sin excepción, sidecars igual', () => {
    const plan = planEnrichment({
      summary: SUMMARY,
      results: [{ file: '/r/other-result.json', json: { fullName: 'tests/e2e/other.spec.ts:x' } }],
      judgeByFile: new Map(),
      reviewByFile: new Map(),
    });
    expect(plan.unmatchedSpecs).toEqual(['tests/e2e/login.spec.ts']);
    expect(plan.matchedSpecs).toEqual([]);
    expect(plan.resultMutations).toEqual([]);
    expect(plan.sidecars).toHaveLength(3);
  });
});
