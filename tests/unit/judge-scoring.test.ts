import { describe, it, expect } from 'vitest';
import { computeScore, summarizeBatch } from '../../src/judge-scoring.ts';

const perfectAxes = {
  assertions: 1,
  selectors: 1,
  waits: 1,
  isolation: 1,
  criterion_coverage: 1,
  a11y: 1,
  structure: 1,
};

describe('judge-scoring computeScore', () => {
  it('returns 1.0 for perfect axes without reviewer issues', () => {
    const r = computeScore({ axes: perfectAxes, reviewerUnresolved: false });
    expect(r.score).toBe(1);
    expect(r.reviewer_unresolved).toBe(false);
  });

  it('applies a 0.1 penalty for reviewer_unresolved', () => {
    const r = computeScore({ axes: perfectAxes, reviewerUnresolved: true });
    expect(r.score).toBeCloseTo(0.9, 4);
    expect(r.reviewer_unresolved).toBe(true);
  });

  it('clamps the penalty so score >= 0', () => {
    const allZero = {
      assertions: 0,
      selectors: 0,
      waits: 0,
      isolation: 0,
      criterion_coverage: 0,
      a11y: 0,
      structure: 0,
    };
    const r = computeScore({ axes: allZero, reviewerUnresolved: true });
    expect(r.score).toBe(0);
  });

  it('throws on invalid axis value', () => {
    const bad = { ...perfectAxes, selectors: 1.5 };
    expect(() => computeScore({ axes: bad, reviewerUnresolved: false })).toThrow();
  });

  it('computes the arithmetic mean across all 7 axes', () => {
    const mixed = {
      assertions: 1,
      selectors: 1,
      waits: 1,
      isolation: 1,
      criterion_coverage: 0.5,
      a11y: 1,
      structure: 0.5,
    };
    const r = computeScore({ axes: mixed, reviewerUnresolved: false });
    expect(r.score).toBeCloseTo(6 / 7, 3);
  });
});

describe('judge-scoring summarizeBatch', () => {
  it('flags ask-first when >30% scores are below threshold', () => {
    const s = summarizeBatch([0.9, 0.85, 0.3, 0.2, 0.4]);
    expect(s.low_score_count).toBe(3);
    expect(s.low_score_ratio).toBeCloseTo(0.6, 3);
    expect(s.ask_first_required).toBe(true);
  });

  it('does not flag when all scores are healthy', () => {
    const s = summarizeBatch([0.9, 0.85, 0.92]);
    expect(s.low_score_count).toBe(0);
    expect(s.ask_first_required).toBe(false);
  });

  it('handles empty batch without crashing', () => {
    const s = summarizeBatch([]);
    expect(s.total).toBe(0);
    expect(s.ask_first_required).toBe(false);
  });
});
