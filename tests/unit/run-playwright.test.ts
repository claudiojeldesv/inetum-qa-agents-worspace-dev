import { describe, expect, it } from 'vitest';

import {
  flattenResults,
  summarize,
  tryParseJsonReport,
} from '../../hooks/run-playwright.js';

describe('tryParseJsonReport', () => {
  it('parsea JSON limpio', () => {
    const json = JSON.stringify({ suites: [], stats: { expected: 0 } });
    const root = tryParseJsonReport(json);
    expect(root).not.toBeNull();
    expect(root?.suites).toEqual([]);
  });

  it('parsea cuando hay prefijo no-JSON antes del primer {', () => {
    const garbage = 'Listing tests:\n';
    const json = JSON.stringify({ suites: [{ file: 'a.spec.ts' }] });
    const root = tryParseJsonReport(garbage + json);
    expect(root?.suites?.[0]?.file).toBe('a.spec.ts');
  });

  it('devuelve null si no hay JSON parseable', () => {
    expect(tryParseJsonReport('no json here {{{')).toBeNull();
  });
});

describe('flattenResults', () => {
  it('extrae tests de suites anidadas con file en spec o suite', () => {
    const root = {
      suites: [
        {
          file: 'login.spec.ts',
          specs: [
            {
              title: 'login válido',
              tests: [{ results: [{ status: 'passed' }] }],
            },
            {
              title: 'login bloqueado',
              tests: [{ results: [{ status: 'failed', error: { message: 'boom' } }] }],
            },
          ],
        },
        {
          suites: [
            {
              file: 'cart.spec.ts',
              specs: [
                {
                  title: 'add item',
                  tests: [{ results: [{ status: 'skipped' }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const out = flattenResults(root);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({
      file: 'login.spec.ts',
      title: 'login válido',
      status: 'passed',
      confidence: 1,
    });
    expect(out[1]).toMatchObject({
      file: 'login.spec.ts',
      status: 'failed',
      confidence: 0,
      errorMessage: 'boom',
    });
    expect(out[2]).toMatchObject({
      file: 'cart.spec.ts',
      status: 'skipped',
      confidence: 0,
    });
  });

  it('mapea timedOut y unexpected → failed; expected → passed', () => {
    const root = {
      suites: [
        {
          file: 'x.spec.ts',
          specs: [
            { title: 'a', tests: [{ results: [{ status: 'timedOut' }] }] },
            { title: 'b', tests: [{ results: [{ status: 'unexpected' }] }] },
            { title: 'c', tests: [{ results: [{ status: 'expected' }] }] },
          ],
        },
      ],
    };
    const out = flattenResults(root);
    expect(out.map((r: { status: string }) => r.status)).toEqual(['failed', 'failed', 'passed']);
  });
});

describe('summarize', () => {
  it('passRate sobre executed (skipped no cuenta), pass true si ≥ threshold', () => {
    const results: ReturnType<typeof flattenResults> = [
      { file: 'a', title: '1', status: 'passed', confidence: 1 },
      { file: 'a', title: '2', status: 'passed', confidence: 1 },
      { file: 'a', title: '3', status: 'passed', confidence: 1 },
      { file: 'a', title: '4', status: 'passed', confidence: 1 },
      { file: 'a', title: '5', status: 'failed', confidence: 0 },
      { file: 'a', title: '6', status: 'skipped', confidence: 0 },
    ];
    const r = summarize(results, 0.8, 0);
    expect(r.passed).toBe(4);
    expect(r.failed).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.passRate).toBeCloseTo(0.8, 5);
    expect(r.pass).toBe(true);
  });

  it('pass:false si passRate < threshold', () => {
    const results: ReturnType<typeof flattenResults> = [
      { file: 'a', title: '1', status: 'passed', confidence: 1 },
      { file: 'a', title: '2', status: 'failed', confidence: 0 },
    ];
    const r = summarize(results, 0.8, 1);
    expect(r.passRate).toBe(0.5);
    expect(r.pass).toBe(false);
  });

  it('pass:false si executed=0 incluso con threshold=0', () => {
    const r = summarize([], 0, 0);
    expect(r.pass).toBe(false);
    expect(r.total).toBe(0);
  });

  it('incluye errorMessage cuando el run no produjo JSON', () => {
    const r = summarize([], 0.8, 1, 'Playwright explotó');
    expect(r.errorMessage).toBe('Playwright explotó');
    expect(r.pass).toBe(false);
  });
});
