/**
 * Allure enricher — post-proceso determinístico (no LLM) que enriquece los
 * `allure-results/` generados por el reporter `allure-playwright` con la evidencia
 * propia de ia4d-qa-automator: trazabilidad RF-NNN, judge scores, verdicts del
 * Reviewer, drift y verdict de compliance.
 *
 * Por qué determinístico (hard-rule #7) y post-proceso ("sanación al final"): el
 * mapeo RF-NNN→spec ya existe en qa-automator-run-summary.json (rf + source_ref por
 * spec). No se toca el ia4d-writer; el reporte se regenera sin re-generar tests.
 *
 * Escribe sidecars Allure nativos (environment.properties, categories.json,
 * executor.json) y muta los `*-result.json` por test (labels, links tms, attachments).
 * El core (planEnrichment + builders) es puro y testeable; enrich() hace el IO.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Tipos de las fuentes (subconjunto consumido; campos extra se ignoran)
// ---------------------------------------------------------------------------

export interface RunSummaryTest {
  spec: string;
  rf?: string | null;
  source_ref?: string | null;
  writer_iterations?: number;
  reviewer_verdict?: string;
  judge_score?: number;
  run_result?: string;
  data_driven?: boolean;
  cases?: unknown[];
  notes?: string;
}

export interface RunSummaryDrift {
  rf?: string;
  flow?: string;
  source_ref?: string;
  reason?: string;
}

export interface RunSummary {
  module?: string;
  input_format?: string;
  source_spec?: string;
  target_url?: string;
  style_contract?: string;
  run_phase?: string;
  compliance_verdict?: string;
  criteria_total?: number;
  criteria_blocked_open_questions?: number;
  tests_generated?: RunSummaryTest[];
  drift?: RunSummaryDrift[];
  judge_summary?: { mean_score?: number; min_score?: number; gate_ask_first_triggered?: boolean };
  playwright_run?: { command?: string; result?: string; workers?: number };
  a11y?: { axe_injected_all_specs?: boolean; fail_on_violations?: boolean; mode?: string };
}

export interface JudgeEntry {
  test_file: string;
  score: number;
  axes?: Record<string, number>;
  reasoning?: string;
  reviewer_unresolved?: boolean;
  reviewer_verdict?: string;
  reviewer_iterations?: number;
  data_driven?: boolean;
}

export interface ReviewEntry {
  test_file: string;
  iteration?: number;
  verdict?: string;
  feedback?: Array<{
    category?: string;
    severity?: string;
    location?: { line?: number; column?: number };
    description?: string;
    suggested_fix?: string;
  }>;
  feedback_summary?: string;
}

// ---------------------------------------------------------------------------
// Tipos Allure (subconjunto del modelo allure2 que mutamos)
// ---------------------------------------------------------------------------

export interface AllureLabel {
  name: string;
  value: string;
}
export interface AllureLink {
  name?: string;
  url?: string;
  type?: string;
}
export interface AllureAttachment {
  name: string;
  source: string;
  type: string;
}
export interface AllureResult {
  uuid?: string;
  name?: string;
  fullName?: string;
  status?: string;
  labels?: AllureLabel[];
  links?: AllureLink[];
  attachments?: AllureAttachment[];
  parameters?: Array<{ name: string; value: string }>;
  [k: string]: unknown;
}

export interface AllureCategory {
  name: string;
  matchedStatuses?: string[];
  messageRegex?: string;
  traceRegex?: string;
}

// ---------------------------------------------------------------------------
// Parsing tolerante: array JSON, NDJSON de una línea, u objetos pretty-printed
// concatenados (judge-report.json usa esta última forma).
// ---------------------------------------------------------------------------

export function parseJsonObjects(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Caso 1: array JSON válido.
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      return Array.isArray(arr) ? arr : [arr];
    } catch {
      /* cae al escáner */
    }
  }

  // Caso 2: un único objeto JSON válido.
  try {
    return [JSON.parse(trimmed)];
  } catch {
    /* cae al escáner */
  }

  // Caso 3: objetos concatenados (NDJSON multi-línea o de una línea). Escaneo por
  // balance de llaves respetando strings y escapes.
  const objects: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        const chunk = trimmed.slice(start, i + 1);
        try {
          objects.push(JSON.parse(chunk));
        } catch {
          /* fragmento no parseable: se ignora */
        }
        start = -1;
      }
    }
  }
  return objects;
}

/** Lee y parsea un artefacto opcional; devuelve [] si no existe o está vacío. */
export function readJsonObjects(path: string): unknown[] {
  if (!existsSync(path)) return [];
  return parseJsonObjects(readFileSync(path, 'utf8'));
}

// ---------------------------------------------------------------------------
// Builders de sidecars (puros)
// ---------------------------------------------------------------------------

function escapeProp(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

export function buildEnvironmentProperties(summary: RunSummary): string {
  const drift = summary.drift ?? [];
  const driftFlows = drift
    .map((d) => `${d.flow ?? '?'}${d.rf ? `(${d.rf})` : ''}`)
    .join(', ');

  const pairs: Array<[string, unknown]> = [
    ['agent', 'ia4d-qa-automator'],
    ['module', summary.module],
    ['input_format', summary.input_format],
    ['run_phase', summary.run_phase],
    ['target_url', summary.target_url],
    ['source_spec', summary.source_spec],
    ['style_contract', summary.style_contract],
    ['compliance_verdict', summary.compliance_verdict],
    ['criteria_total', summary.criteria_total],
    ['criteria_blocked_open_questions', summary.criteria_blocked_open_questions],
    ['judge_mean_score', summary.judge_summary?.mean_score],
    ['judge_min_score', summary.judge_summary?.min_score],
    ['a11y_mode', summary.a11y?.mode],
    ['a11y_fail_on_violations', summary.a11y?.fail_on_violations],
    ['playwright_workers', summary.playwright_run?.workers],
    ['playwright_result', summary.playwright_run?.result],
    ['drift_count', drift.length],
    ['drift_flows', driftFlows],
  ];

  return (
    pairs
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${escapeProp(v)}`)
      .join('\n') + '\n'
  );
}

export function buildCategories(): AllureCategory[] {
  // Allure casa categorías contra resultados de test (status/mensaje). Cubrimos
  // triaje de fallos; la evidencia de drift/judge/reviewer se surface vía
  // environment.properties y attachments per-test (que sí renderizan).
  return [
    {
      name: 'Producto: fallo funcional',
      matchedStatuses: ['failed'],
    },
    {
      name: 'Test: roto (broken)',
      matchedStatuses: ['broken'],
    },
    {
      name: 'Accesibilidad (axe-core)',
      matchedStatuses: ['failed', 'broken'],
      messageRegex: '.*(axe|accessibilit|wcag).*',
    },
  ];
}

export function buildExecutor(summary: RunSummary): Record<string, unknown> {
  return {
    name: 'ia4d-qa-automator',
    type: 'qa-automator',
    buildName: [summary.module, summary.run_phase].filter(Boolean).join(' · ') || 'qa-automator run',
    reportName: `QA evidence — ${summary.target_url ?? 'target'}`,
  };
}

// ---------------------------------------------------------------------------
// Indexado de evidencia por archivo de spec
// ---------------------------------------------------------------------------

export function indexJudgeByFile(entries: unknown[]): Map<string, JudgeEntry> {
  const map = new Map<string, JudgeEntry>();
  for (const e of entries) {
    const j = e as JudgeEntry;
    // Solo entradas con axes (las entradas judge_decision de auditoría no las tienen).
    if (j && typeof j.test_file === 'string' && j.axes) {
      map.set(basename(j.test_file), j);
    }
  }
  return map;
}

export function indexReviewByFile(entries: unknown[]): Map<string, ReviewEntry[]> {
  const map = new Map<string, ReviewEntry[]>();
  for (const e of entries) {
    const r = e as ReviewEntry;
    if (r && typeof r.test_file === 'string' && (r.verdict || r.feedback)) {
      const key = basename(r.test_file);
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Matching spec ↔ resultado Allure
// ---------------------------------------------------------------------------

/** ¿Este resultado Allure corresponde a este spec? Join por basename del spec. */
export function matchResultToSpec(result: AllureResult, specPath: string): boolean {
  const specFile = basename(specPath);
  if (result.fullName && result.fullName.includes(specFile)) return true;
  for (const label of result.labels ?? []) {
    // allure-playwright emite labels package/suite con el path "punteado".
    if (typeof label.value === 'string') {
      if (label.value.includes(specFile)) return true;
      const dotted = label.value.replace(/\./g, '/');
      if (dotted.includes(specFile)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Plan de enriquecimiento (puro): qué escribir y qué mutar, sin tocar disco
// ---------------------------------------------------------------------------

export interface PlanInputs {
  summary: RunSummary;
  results: Array<{ file: string; json: AllureResult }>;
  judgeByFile: Map<string, JudgeEntry>;
  reviewByFile: Map<string, ReviewEntry[]>;
}

export interface AttachmentFile {
  source: string; // nombre de archivo dentro de results-dir
  content: string;
}

export interface EnrichmentPlan {
  sidecars: { file: string; content: string }[];
  resultMutations: Array<{ file: string; json: AllureResult }>;
  attachmentFiles: AttachmentFile[];
  matchedSpecs: string[];
  unmatchedSpecs: string[];
}

function upsertLabel(result: AllureResult, name: string, value: string): void {
  result.labels = result.labels ?? [];
  if (!result.labels.some((l) => l.name === name && l.value === value)) {
    result.labels.push({ name, value });
  }
}

function renderJudgeAttachment(judge: JudgeEntry): string {
  return JSON.stringify(
    {
      score: judge.score,
      axes: judge.axes,
      reviewer_verdict: judge.reviewer_verdict,
      reviewer_iterations: judge.reviewer_iterations,
      reviewer_unresolved: judge.reviewer_unresolved,
      data_driven: judge.data_driven,
      reasoning: judge.reasoning,
    },
    null,
    2,
  );
}

function renderReviewAttachment(test: RunSummaryTest, reviews: ReviewEntry[]): string {
  const lines: string[] = [`# Writer/Reviewer — ${basename(test.spec)}`, ''];
  if (test.rf) lines.push(`- Criterion: ${test.rf}${test.source_ref ? ` (${test.source_ref})` : ''}`);
  if (test.writer_iterations !== undefined) lines.push(`- Writer iterations: ${test.writer_iterations}`);
  if (test.reviewer_verdict) lines.push(`- Reviewer verdict: ${test.reviewer_verdict}`);
  lines.push('');
  for (const r of reviews) {
    lines.push(`## Iteration ${r.iteration ?? '?'} — ${r.verdict ?? 'n/a'}`);
    if (r.feedback_summary) lines.push(r.feedback_summary);
    for (const f of r.feedback ?? []) {
      const loc = f.location?.line ? ` (line ${f.location.line})` : '';
      lines.push(`- [${f.severity ?? '?'}] ${f.category ?? ''}${loc}: ${f.description ?? ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function planEnrichment(inputs: PlanInputs): EnrichmentPlan {
  const { summary, results, judgeByFile, reviewByFile } = inputs;

  const sidecars: EnrichmentPlan['sidecars'] = [
    { file: 'environment.properties', content: buildEnvironmentProperties(summary) },
    { file: 'categories.json', content: JSON.stringify(buildCategories(), null, 2) },
    { file: 'executor.json', content: JSON.stringify(buildExecutor(summary), null, 2) },
  ];

  const attachmentFiles: AttachmentFile[] = [];
  const matchedSpecs: string[] = [];
  const unmatchedSpecs: string[] = [];

  for (const test of summary.tests_generated ?? []) {
    const matches = results.filter((r) => matchResultToSpec(r.json, test.spec));
    if (matches.length === 0) {
      unmatchedSpecs.push(test.spec);
      continue;
    }
    matchedSpecs.push(test.spec);

    const specFile = basename(test.spec);
    const judge = judgeByFile.get(specFile);
    const reviews = reviewByFile.get(specFile);

    for (const { json } of matches) {
      // Labels de trazabilidad.
      if (test.rf) {
        upsertLabel(json, 'feature', test.rf);
        upsertLabel(json, 'tag', test.rf);
      }
      if (summary.module) upsertLabel(json, 'epic', `Module ${summary.module}`);

      // Link TMS RF-NNN → source_ref.
      if (test.rf && test.source_ref) {
        json.links = json.links ?? [];
        if (!json.links.some((l) => l.type === 'tms' && l.name === test.rf)) {
          json.links.push({ name: test.rf, url: test.source_ref, type: 'tms' });
        }
      }

      json.attachments = json.attachments ?? [];

      // Attachment judge (solo si hay judge-report — puede estar off).
      if (judge) {
        const source = `${json.uuid ?? specFile}-judge-attachment.json`;
        attachmentFiles.push({ source, content: renderJudgeAttachment(judge) });
        json.attachments.push({ name: `Judge score ${judge.score}`, source, type: 'application/json' });
      }

      // Attachment Writer/Reviewer (siempre que haya verdict o feedback).
      if (reviews && reviews.length > 0) {
        const source = `${json.uuid ?? specFile}-review-attachment.md`;
        attachmentFiles.push({ source, content: renderReviewAttachment(test, reviews) });
        json.attachments.push({ name: 'Writer/Reviewer protocol', source, type: 'text/markdown' });
      }
    }
  }

  // Mutaciones a persistir: cada resultado matcheado por algún spec (dedupe por archivo).
  const mutated = (summary.tests_generated ?? []).flatMap((test) =>
    results.filter((r) => matchResultToSpec(r.json, test.spec)).map((m) => ({ file: m.file, json: m.json })),
  );

  return {
    sidecars,
    resultMutations: dedupeByFile(mutated),
    attachmentFiles,
    matchedSpecs,
    unmatchedSpecs,
  };
}

function dedupeByFile(items: Array<{ file: string; json: AllureResult }>): Array<{ file: string; json: AllureResult }> {
  const seen = new Map<string, { file: string; json: AllureResult }>();
  for (const it of items) seen.set(it.file, it);
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Capa IO: lee artefactos, ejecuta el plan, escribe a disco
// ---------------------------------------------------------------------------

export interface EnrichOptions {
  resultsDir: string;
  summaryPath: string;
  judgePath?: string;
  reviewPath?: string;
  writeToDisk?: boolean;
}

export interface EnrichOutcome {
  plan: EnrichmentPlan;
  warnings: string[];
}

function loadResultFiles(resultsDir: string): Array<{ file: string; json: AllureResult }> {
  const out: Array<{ file: string; json: AllureResult }> = [];
  for (const name of readdirSync(resultsDir)) {
    if (!name.endsWith('-result.json')) continue;
    const file = resolve(resultsDir, name);
    try {
      out.push({ file, json: JSON.parse(readFileSync(file, 'utf8')) as AllureResult });
    } catch {
      /* resultado no parseable: se ignora */
    }
  }
  return out;
}

export function enrich(options: EnrichOptions): EnrichOutcome {
  const { resultsDir, summaryPath } = options;
  const writeToDisk = options.writeToDisk ?? true;
  const warnings: string[] = [];

  if (!existsSync(summaryPath)) {
    throw new Error(`run-summary no encontrado: ${summaryPath}`);
  }
  if (!existsSync(resultsDir)) {
    throw new Error(`allure-results no encontrado: ${resultsDir} (¿corriste los tests con el reporter allure-playwright?)`);
  }

  const summaryObjs = parseJsonObjects(readFileSync(summaryPath, 'utf8'));
  const summary = (summaryObjs[0] ?? {}) as RunSummary;

  const judgePath = options.judgePath ?? resolve(resultsDir, '..', 'judge-report.json');
  const reviewPath = options.reviewPath ?? resolve(resultsDir, '..', 'review-feedback.json');

  const judgeByFile = indexJudgeByFile(readJsonObjects(judgePath));
  const reviewByFile = indexReviewByFile(readJsonObjects(reviewPath));
  if (judgeByFile.size === 0) warnings.push('judge-report.json ausente o vacío (Judge off) — sin attachments de judge.');

  const results = loadResultFiles(resultsDir);
  if (results.length === 0) warnings.push(`Sin *-result.json en ${resultsDir} — solo se escriben sidecars globales.`);

  const plan = planEnrichment({ summary, results, judgeByFile, reviewByFile });

  for (const spec of plan.unmatchedSpecs) {
    warnings.push(`Spec sin resultado Allure matcheado: ${spec} — enriquecido solo a nivel global.`);
  }

  if (writeToDisk) {
    for (const s of plan.sidecars) writeFileSync(resolve(resultsDir, s.file), s.content, 'utf8');
    for (const a of plan.attachmentFiles) writeFileSync(resolve(resultsDir, a.source), a.content, 'utf8');
    for (const m of plan.resultMutations) writeFileSync(m.file, JSON.stringify(m.json), 'utf8');
  }

  return { plan, warnings };
}

// ---------------------------------------------------------------------------
// CLI: npx tsx src/allure-enricher.ts --results-dir=allure-results --summary=qa-automator-run-summary.json
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function isMain(): boolean {
  const entry = process.argv[1] ?? '';
  return entry.endsWith('allure-enricher.ts') || entry.endsWith('allure-enricher.js');
}

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const resultsDir = resolve(process.cwd(), args['results-dir'] ?? 'allure-results');
  const summaryPath = resolve(process.cwd(), args['summary'] ?? 'qa-automator-run-summary.json');

  try {
    const { plan, warnings } = enrich({
      resultsDir,
      summaryPath,
      judgePath: args['judge'] ? resolve(process.cwd(), args['judge']) : undefined,
      reviewPath: args['review'] ? resolve(process.cwd(), args['review']) : undefined,
    });
    console.log(
      `[allure-enricher] sidecars: ${plan.sidecars.length}, specs matcheados: ${plan.matchedSpecs.length}, ` +
        `attachments: ${plan.attachmentFiles.length}, mutaciones: ${plan.resultMutations.length}`,
    );
    for (const w of warnings) console.warn(`[allure-enricher] WARN: ${w}`);
  } catch (err) {
    console.error(`[allure-enricher] ERROR: ${(err as Error).message}`);
    process.exit(1);
  }
}
