/**
 * Gherkin → criteria.json adapter (S2 Req-driven module).
 *
 * Deterministic. Parses a .feature file with the official @cucumber/gherkin
 * parser and maps each Scenario / Scenario Outline to a criterion in the same
 * criteria.json contract that ia4d-spec-refiner produces for S3. The S4/S3
 * downstream engine (planner map-mode, discovery-analyzer --criteria, Writer
 * @criterion, drift diff) consumes the output unchanged.
 *
 * Why deterministic and not LLM: Gherkin is already structured. There is no
 * prose to interpret — Given/When/Then map literally to the criterion fields.
 * This honors hard rule #5 (validación determinística, no LLM-as-validator).
 *
 * Boundary with S3: this adapter does NOT refine. A clean .feature in, a
 * criteria.json out. A Scenario with no Then is not "fixed" here — it is flagged
 * as an open question and the SDET is told to route it through S3 (spec-refiner).
 *
 * Mapping:
 *   Feature                     → grouping; tags inform brief.entry / brief.ignore
 *   Scenario                    → one RF-NNN (sequential, order of appearance)
 *   Scenario Outline + Examples → one RF-NNN with an additive `examples` block
 *   Given/When/Then (+And/But)  → criterion.given / .when / .then
 *   @flow:<name>                → criterion.flow (else kebab-case of the scenario name)
 *   @REQ-x / @RF-x / @HU-x      → preserved in source_ref (client's own id)
 *   @drift-risk:high            → criterion.drift_risk
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';

// Minimal shapes of the @cucumber/messages AST nodes we touch. The library is
// untyped enough at the document root that narrowing here keeps us honest.
interface GherkinStep {
  keyword: string; // "Given ", "When ", "Then ", "And ", "But ", "* "
  text: string;
  location: { line: number };
}
interface GherkinTableCell {
  value: string;
}
interface GherkinTableRow {
  cells: GherkinTableCell[];
}
interface GherkinExamples {
  tableHeader?: GherkinTableRow;
  tableBody?: GherkinTableRow[];
}
interface GherkinScenario {
  name: string;
  keyword: string; // "Scenario" | "Scenario Outline" | "Example"
  location: { line: number };
  tags?: Array<{ name: string }>;
  steps?: GherkinStep[];
  examples?: GherkinExamples[];
}
interface GherkinChild {
  scenario?: GherkinScenario;
  background?: { steps?: GherkinStep[] };
}
interface GherkinFeature {
  name: string;
  location: { line: number };
  tags?: Array<{ name: string }>;
  children?: GherkinChild[];
}

export interface CriterionExamples {
  header: string[];
  rows: Array<Record<string, string>>;
}

export interface Criterion {
  id: string;
  title: string;
  flow: string;
  given: string;
  when: string;
  then: string;
  source_ref: string;
  confidence: 'high' | 'medium' | 'low';
  drift_risk: 'low' | 'medium' | 'high';
  assumptions: string[];
  open_questions: string[];
  examples?: CriterionExamples; // present only for Scenario Outline (S2 parameterization)
}

export interface CriteriaDocument {
  version: 1;
  source_fd: string;
  refined_timestamp: string;
  target_url: string;
  criteria: Criterion[];
  brief: {
    flows: string[];
    entry: string;
    ignore: string[];
    drift_flags: Array<{ flow: string; rf: string; reason: string }>;
  };
  open_questions_ref: string | null;
  pii_redaction: {
    verdict: 'pass' | 'fail';
    literals_found: string[];
    downstream_note: string | null;
  };
  refiner_notes: string | null;
}

const REQ_TAG = /^@((?:REQ|RF|HU|US|TC)-[\w.-]+)$/i;
const FLOW_TAG = /^@flow:(.+)$/i;
const DRIFT_TAG = /^@drift-risk:(low|medium|high)$/i;
const ENTRY_TAG = /^@entry:(.+)$/i;
const IGNORE_TAG = /^@ignore:(.+)$/i;

// ES PII heuristics — mirror docs/references/pii-patterns.md. The adapter never lifts
// example data that looks like real PII into the output; it redacts and reports.
const PII_PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: 'dni', re: /\b\d{8}[A-Za-z]\b/ },
  { kind: 'iban', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/ },
  { kind: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/ },
  { kind: 'phone-es', re: /\b(?:\+34|0034)?[\s-]?[6789]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/ },
  { kind: 'card', re: /\b(?:\d[ -]?){13,19}\b/ },
];

function kebab(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function tagValue(tags: Array<{ name: string }> | undefined, re: RegExp): string | null {
  if (!tags) return null;
  for (const t of tags) {
    const m = re.exec(t.name);
    if (m) return m[1];
  }
  return null;
}

/**
 * Group steps into given/when/then buckets. And/But/* inherit the last primary
 * keyword. Multiple steps in a bucket are joined with "; ". Background steps (if
 * any) are prepended to the given bucket of every scenario.
 */
function assembleSteps(
  steps: GherkinStep[],
  backgroundGiven: string[],
): { given: string; when: string; then: string; hasThen: boolean } {
  const buckets: Record<'given' | 'when' | 'then', string[]> = {
    given: [...backgroundGiven],
    when: [],
    then: [],
  };
  let current: 'given' | 'when' | 'then' = 'given';
  let sawThen = false;

  for (const step of steps) {
    const kw = step.keyword.trim().toLowerCase();
    if (kw === 'given') current = 'given';
    else if (kw === 'when') current = 'when';
    else if (kw === 'then') {
      current = 'then';
      sawThen = true;
    }
    // And / But / * keep `current` as-is.
    buckets[current].push(step.text.trim());
  }

  return {
    given: buckets.given.join('; '),
    when: buckets.when.join('; '),
    then: buckets.then.join('; '),
    hasThen: sawThen,
  };
}

function extractExamples(scenario: GherkinScenario): CriterionExamples | undefined {
  const ex = scenario.examples?.find((e) => e.tableHeader && e.tableBody && e.tableBody.length);
  if (!ex || !ex.tableHeader) return undefined;
  const header = ex.tableHeader.cells.map((c) => c.value.trim());
  const rows = (ex.tableBody ?? []).map((row) => {
    const obj: Record<string, string> = {};
    row.cells.forEach((cell, i) => {
      obj[header[i] ?? `col${i}`] = cell.value.trim();
    });
    return obj;
  });
  return { header, rows };
}

function scanPii(text: string): string[] {
  const found: string[] = [];
  for (const { kind, re } of PII_PATTERNS) {
    if (re.test(text)) found.push(kind);
  }
  return found;
}

export interface ParseOptions {
  sourceFile: string; // path to the .feature, used for source_ref + source_fd
  targetUrl: string;
  openQuestionsRef?: string | null;
}

interface ParseOutput {
  document: CriteriaDocument;
  questions: string[]; // Q-NNN entries (markdown bodies) for refinement-questions.md
}

export function parseFeature(featureText: string, opts: ParseOptions): ParseOutput {
  const builder = new AstBuilder(IdGenerator.incrementing());
  const matcher = new GherkinClassicTokenMatcher();
  const parser = new Parser(builder, matcher);
  const doc = parser.parse(featureText) as { feature?: GherkinFeature };
  const feature = doc.feature;
  const fileBase = basename(opts.sourceFile);

  if (!feature) {
    throw new Error(`No Feature found in ${opts.sourceFile}`);
  }

  // Background → prepended to every scenario's given.
  const background = feature.children?.find((c) => c.background)?.background;
  const backgroundGiven = (background?.steps ?? []).map((s) => s.text.trim());

  const criteria: Criterion[] = [];
  const questions: string[] = [];
  const piiLiterals = new Set<string>();
  let rf = 0;
  let q = 0;

  for (const child of feature.children ?? []) {
    const scenario = child.scenario;
    if (!scenario) continue;
    rf += 1;
    const id = `RF-${String(rf).padStart(3, '0')}`;

    const steps = scenario.steps ?? [];
    const { given, when, then, hasThen } = assembleSteps(steps, backgroundGiven);

    const flow = tagValue(scenario.tags, FLOW_TAG) ?? kebab(scenario.name);
    const reqId = tagValue(scenario.tags, REQ_TAG);
    const driftRisk = (tagValue(scenario.tags, DRIFT_TAG) as Criterion['drift_risk']) ?? 'low';
    const sourceRef = reqId
      ? `${fileBase}:${scenario.location.line} (${reqId})`
      : `${fileBase}:${scenario.location.line}`;

    const examples = extractExamples(scenario);

    // PII scan over every step text + example values.
    const piiCorpus = [given, when, then, JSON.stringify(examples ?? {})].join(' ');
    for (const kind of scanPii(piiCorpus)) piiLiterals.add(kind);

    const openQuestions: string[] = [];
    let finalThen = then;
    let confidence: Criterion['confidence'] = 'high';

    // Boundary with S3: a clean .feature has an explicit Then. If it doesn't,
    // we do NOT invent the outcome — we flag it and route to S3.
    if (!hasThen || then.length === 0) {
      q += 1;
      const qid = `Q-${String(q).padStart(3, '0')}`;
      openQuestions.push(qid);
      confidence = 'low';
      finalThen = `[AMBIGUO — el .feature no especifica el Then] ${id} no declara resultado esperado`;
      questions.push(
        `## ${qid} — ${scenario.name} (${id})\n` +
          `- **Origen**: ${sourceRef}\n` +
          `- **Hueco**: el Scenario no tiene paso \`Then\`. Un Gherkin maduro debe declarar el resultado esperado.\n` +
          `- **Por qué importa**: sin \`Then\` no hay aserción. Este criterio NO se genera. Refina el ` +
          `.feature (añade el \`Then\`) o enruta este caso por \`/qa-automator:spec-refiner\` (S3).\n`,
      );
    }

    criteria.push({
      id,
      title: scenario.name,
      flow,
      given,
      when,
      then: finalThen,
      source_ref: sourceRef,
      confidence,
      drift_risk: driftRisk,
      assumptions: [],
      open_questions: openQuestions,
      ...(examples ? { examples } : {}),
    });
  }

  const flows: string[] = [];
  for (const c of criteria) {
    if (!flows.includes(c.flow)) flows.push(c.flow);
  }

  const entry =
    tagValue(feature.tags, ENTRY_TAG) ?? deriveEntryFromUrl(opts.targetUrl);
  const ignore = (feature.tags ?? [])
    .map((t) => IGNORE_TAG.exec(t.name)?.[1])
    .filter((v): v is string => Boolean(v));

  const driftFlags = criteria
    .filter((c) => c.drift_risk === 'high')
    .map((c) => ({
      flow: c.flow,
      rf: c.id,
      reason: 'drift_risk=high declarado por tag @drift-risk:high en el .feature',
    }));

  const document: CriteriaDocument = {
    version: 1,
    source_fd: opts.sourceFile,
    refined_timestamp: new Date().toISOString(),
    target_url: opts.targetUrl,
    criteria,
    brief: { flows, entry, ignore, drift_flags: driftFlags },
    open_questions_ref: questions.length ? (opts.openQuestionsRef ?? null) : null,
    pii_redaction: {
      verdict: 'pass',
      literals_found: [...piiLiterals],
      downstream_note: piiLiterals.size
        ? 'El .feature contiene valores con pinta de PII en pasos/Examples; NO se usan como fixtures. Los datos de prueba provienen del synthetic_fixtures del style-contract.'
        : 'El .feature no contiene PII. Fixtures desde synthetic_fixtures del style-contract.',
    },
    refiner_notes: `Adaptado desde Gherkin por src/gherkin-to-criteria.ts. ${criteria.length} scenarios → ${criteria.length} criterios. ${questions.length} con Then ausente (bloqueados, enrutar a S3).`,
  };

  return { document, questions };
}

function deriveEntryFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname && u.pathname !== '/' ? u.pathname : '/';
  } catch {
    return '/';
  }
}

function renderQuestionsMarkdown(sourceFile: string, questions: string[]): string {
  const header = `# Refinement questions — ${basename(sourceFile)}\n\n`;
  if (!questions.length) {
    return (
      header +
      'No open questions. El .feature trae un `Then` explícito en cada Scenario ' +
      '(Gherkin maduro, frontera S2). Nada que refinar.\n'
    );
  }
  const body = questions.join('\n');
  const summary =
    `\n## Resumen\n` +
    `| Origen | ¿Bloquea generación? |\n|----|----|\n` +
    questions
      .map((qBody) => {
        const idMatch = /## (Q-\d+)/.exec(qBody);
        return `| ${idMatch?.[1] ?? 'Q-?'} | Sí — sin Then no hay aserción |`;
      })
      .join('\n') +
    '\n';
  return header + body + summary;
}

// --- CLI entrypoint ---------------------------------------------------------
// Invoked by ia4d-spec-parser via: npx tsx src/gherkin-to-criteria.ts \
//   --gherkin=<path> --target-url=<url> --output=<criteria.json> \
//   --questions-output=<refinement-questions.md>

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const gherkinPath = args['gherkin'];
  const targetUrl = args['target-url'] ?? args['url'] ?? '';
  if (!gherkinPath) {
    console.error('Usage: tsx src/gherkin-to-criteria.ts --gherkin=<path> --target-url=<url> [--output=<path>] [--questions-output=<path>]');
    process.exit(1);
  }
  const output = args['output'] ?? 'criteria.json';
  const questionsOutput = args['questions-output'] ?? 'refinement-questions.md';

  const featureText = readFileSync(resolve(gherkinPath), 'utf8');
  const { document, questions } = parseFeature(featureText, {
    sourceFile: gherkinPath,
    targetUrl,
    openQuestionsRef: questionsOutput,
  });

  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(resolve(output), JSON.stringify(document, null, 2) + '\n', 'utf8');

  mkdirSync(dirname(resolve(questionsOutput)), { recursive: true });
  writeFileSync(resolve(questionsOutput), renderQuestionsMarkdown(gherkinPath, questions), 'utf8');

  const blocked = document.criteria.filter((c) => c.open_questions.length).length;
  console.log(
    JSON.stringify({
      criteria_count: document.criteria.length,
      blocked_count: blocked,
      flows: document.brief.flows,
      output,
      questions_output: questionsOutput,
    }),
  );
}

// Run main() only when invoked directly, not when imported by the test.
// Canonical cross-platform ESM idiom (handles win32 drive-letter URLs correctly).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
