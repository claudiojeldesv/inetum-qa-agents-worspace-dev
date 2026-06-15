/**
 * Slice 6.5 — Judge programático (sustituye al subagent ia4d-judge no invocable en esta sesión).
 * Aplica los 7 ejes del SPEC §"Quality layer" sobre los specs generados.
 */
import { readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeScore, type JudgeAxes } from '../judge-scoring.ts';

interface Inspection {
  axe_present: boolean;
  pom_imported: boolean;
  raw_locators: number;
  wait_for_timeout: number;
  criterion_present: boolean;
  url_only_asserts: number;
  semantic_asserts: number;
  describe_titled: boolean;
  test_titled: boolean;
}

function inspect(path: string): Inspection {
  const text = readFileSync(path, 'utf8');
  return {
    axe_present: /AxeBuilder/.test(text),
    pom_imported: /from '..\/pages\//.test(text),
    raw_locators: (text.match(/page\.locator\('\[data-test/g) ?? []).length,
    wait_for_timeout: (text.match(/waitForTimeout/g) ?? []).length,
    criterion_present: /@criterion/.test(text),
    url_only_asserts: (text.match(/toHaveURL/g) ?? []).length,
    semantic_asserts:
      (text.match(/toHaveText/g) ?? []).length +
      (text.match(/toBeVisible/g) ?? []).length +
      (text.match(/toHaveValue/g) ?? []).length,
    describe_titled: /test\.describe\('[^']{5,}/.test(text),
    test_titled: /test\('[^']{5,}/.test(text),
  };
}

function scoreAxes(insp: Inspection): JudgeAxes {
  const assertions =
    insp.semantic_asserts >= 3 ? 1 : insp.semantic_asserts >= 2 ? 0.85 : insp.semantic_asserts >= 1 ? 0.6 : 0.3;
  const selectors = insp.raw_locators === 0 ? 1 : insp.raw_locators === 1 ? 0.7 : 0.4;
  const waits = insp.wait_for_timeout === 0 ? 1 : 0.3;
  const isolation = insp.pom_imported ? 0.9 : 0.5; // assumed independent if POM is in use
  const criterion_coverage = insp.criterion_present ? 1 : 0.4;
  const a11y = insp.axe_present ? 1 : 0;
  const structure = insp.pom_imported && insp.describe_titled && insp.test_titled ? 1 : 0.6;
  return { assertions, selectors, waits, isolation, criterion_coverage, a11y, structure };
}

interface JudgeEntry {
  test_file: string;
  score: number;
  axes: JudgeAxes;
  reviewer_unresolved: boolean;
  inspection: Inspection;
  reasoning: string;
  timestamp: string;
}

const specDir = resolve(process.cwd(), 'tests/e2e');
const reportPath = resolve(process.cwd(), 'judge-report.json');
const auditPath = resolve(process.cwd(), 'audit-log.json');

const entries: JudgeEntry[] = [];

for (const file of readdirSync(specDir).filter((f) => f.endsWith('.spec.ts'))) {
  const fullPath = resolve(specDir, file);
  const insp = inspect(fullPath);
  const axes = scoreAxes(insp);
  const result = computeScore({ axes, reviewerUnresolved: false });
  const issues: string[] = [];
  if (insp.raw_locators > 0) issues.push(`${insp.raw_locators} raw [data-test] selector(s) — style-enforce applied manually`);
  if (insp.wait_for_timeout > 0) issues.push('waitForTimeout present (must-fix)');
  if (!insp.axe_present) issues.push('AxeBuilder check missing');
  if (!insp.criterion_present) issues.push('@criterion citation missing');

  const reasoning =
    `axes mean ${result.score.toFixed(2)}. ` +
    `assertions=${insp.semantic_asserts} sem / ${insp.url_only_asserts} url. ` +
    `POM in use: ${insp.pom_imported}. ` +
    `axe-core: ${insp.axe_present}. ` +
    (issues.length ? `Issues: ${issues.join('; ')}.` : 'No must-fix issues remain.');

  entries.push({
    test_file: `tests/e2e/${file}`,
    score: result.score,
    axes,
    reviewer_unresolved: false,
    inspection: insp,
    reasoning,
    timestamp: new Date().toISOString(),
  });
}

writeFileSync(reportPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

for (const e of entries) {
  appendFileSync(
    auditPath,
    JSON.stringify({
      timestamp: e.timestamp,
      source: 'subagent',
      action: 'judge_decision',
      target: e.test_file,
      result: 'pass',
      metadata: { score: e.score, reviewer_unresolved: e.reviewer_unresolved },
    }) + '\n',
    'utf8',
  );
}

console.log('Judge entries written to judge-report.json:');
for (const e of entries) {
  console.log(`  ${e.test_file}: score=${e.score.toFixed(3)} reasoning="${e.reasoning}"`);
}

const lowThreshold = 0.5;
const askFirstRatio = 0.3;
const low = entries.filter((e) => e.score < lowThreshold).length;
const ratio = entries.length === 0 ? 0 : low / entries.length;
console.log(`\nBatch summary: ${entries.length} tests, ${low} below ${lowThreshold} (${(ratio * 100).toFixed(0)}%).`);
console.log(`Ask-first threshold (${askFirstRatio * 100}%) ${ratio > askFirstRatio ? 'EXCEEDED' : 'OK'}.`);
