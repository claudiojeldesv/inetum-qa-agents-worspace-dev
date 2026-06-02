/**
 * Judge scoring helper — computes the final 0-1 score from per-axis values.
 * Used by ia4d-judge subagent and by unit tests.
 */

export interface JudgeAxes {
  assertions: number;
  selectors: number;
  waits: number;
  isolation: number;
  criterion_coverage: number;
  a11y: number;
  structure: number;
}

export interface JudgeInput {
  axes: JudgeAxes;
  reviewerUnresolved: boolean;
}

export interface JudgeResult {
  score: number;
  reviewer_unresolved: boolean;
}

const AXIS_KEYS: Array<keyof JudgeAxes> = [
  'assertions',
  'selectors',
  'waits',
  'isolation',
  'criterion_coverage',
  'a11y',
  'structure',
];

export function computeScore(input: JudgeInput): JudgeResult {
  for (const key of AXIS_KEYS) {
    const v = input.axes[key];
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 1) {
      throw new Error(`Invalid axis value for ${key}: ${v}`);
    }
  }
  const mean =
    AXIS_KEYS.reduce((sum, k) => sum + input.axes[k], 0) / AXIS_KEYS.length;
  let score = mean;
  if (input.reviewerUnresolved) score -= 0.1;
  score = Math.max(0, Math.min(1, score));
  return { score: Number(score.toFixed(4)), reviewer_unresolved: input.reviewerUnresolved };
}

export interface BatchSummary {
  total: number;
  low_score_count: number;
  low_score_ratio: number;
  ask_first_required: boolean;
}

export function summarizeBatch(
  scores: number[],
  lowThreshold = 0.5,
  askFirstRatio = 0.3,
): BatchSummary {
  const total = scores.length;
  const low = scores.filter((s) => s < lowThreshold).length;
  const ratio = total === 0 ? 0 : low / total;
  return {
    total,
    low_score_count: low,
    low_score_ratio: Number(ratio.toFixed(4)),
    ask_first_required: ratio > askFirstRatio,
  };
}
