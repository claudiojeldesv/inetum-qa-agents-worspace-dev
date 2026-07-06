import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { consolidateReviews } from '../../src/scripts/consolidate-reviews.ts';
import { loadShowcaseData } from '../../src/scripts/build-showcase.ts';

const dirs: string[] = [];
const tmp = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('consolidate-reviews — fix de append concurrente', () => {
  it('une ficheros per-spec en review-feedback.json (JSON-lines, ordenado por nombre)', () => {
    const work = tmp('qa-cons-');
    const dir = resolve(work, 'review-feedback');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'TC-002.spec.ts.json'), JSON.stringify({ test_file: 'b', verdict: 'approved' }));
    writeFileSync(resolve(dir, 'TC-001.spec.ts.json'), JSON.stringify({ test_file: 'a', verdict: 'approved' }));

    const { count, files } = consolidateReviews(work);
    expect(files).toBe(2);
    expect(count).toBe(2);
    const out = readFileSync(resolve(work, 'review-feedback.json'), 'utf8').trim().split('\n');
    expect(out).toHaveLength(2);
    expect(JSON.parse(out[0]).test_file).toBe('a'); // TC-001 antes que TC-002
    expect(JSON.parse(out[1]).test_file).toBe('b');
  });

  it('omite ficheros corruptos sin perder los válidos', () => {
    const work = tmp('qa-cons-corrupt-');
    const dir = resolve(work, 'review-feedback');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'ok.json'), JSON.stringify({ test_file: 'a' }));
    writeFileSync(resolve(dir, 'bad.json'), '{ esto no es json');
    const { count } = consolidateReviews(work);
    expect(count).toBe(1);
  });

  it('no-op si no existe el directorio per-spec', () => {
    const work = tmp('qa-cons-empty-');
    const { files, count } = consolidateReviews(work);
    expect(files).toBe(0);
    expect(count).toBe(0);
  });
});

describe('build-showcase — lee el feedback del directorio per-spec', () => {
  it('toma el review per-spec del directorio (fuente preferida)', () => {
    const work = tmp('qa-sc-');
    const spec = 'tests/e2e/x/TC-001_login.spec.ts';
    writeFileSync(
      resolve(work, 'qa-automator-run-summary.json'),
      JSON.stringify({ module: 'S4', tests_generated: [{ tc_id: 'TC-001', spec, run_result: 'passed', must_fix: 0 }] }),
    );
    mkdirSync(resolve(work, 'review-feedback'), { recursive: true });
    writeFileSync(
      resolve(work, 'review-feedback', 'TC-001_login.spec.ts.json'),
      JSON.stringify({ test_file: spec, iteration: 0, verdict: 'approved', feedback: [{ category: 'pom-violation', severity: 'should-fix', description: 'usa POM' }] }),
    );

    const data = loadShowcaseData(work);
    const entries = data.reviewsByFile['TC-001_login.spec.ts'];
    expect(entries).toBeTruthy();
    expect(entries[0].feedback?.[0].category).toBe('pom-violation');
  });
});
