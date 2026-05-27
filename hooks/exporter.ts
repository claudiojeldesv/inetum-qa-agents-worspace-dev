/**
 * CLI — `npx tsx hooks/exporter.ts --specs-dir <path> [--plan <path>] [--judge-report <path>] [--run-report <path>] [--audit-report <path>] [--audit-log <path>] [--out <path>]`
 *
 * Consolida los artefactos del agente en un único test-catalog.json
 * según references/test-catalog-schema.md. specs-dir es la única fuente
 * obligatoria — sin specs no hay entries. Las demás fuentes son
 * opcionales: si faltan, los campos derivados quedan en null.
 *
 * Determinista. Lectura + transform + write. Sin LLM, sin red.
 *
 * Exit codes:
 *   0 → catalog escrito.
 *   1 → error de lectura del specs-dir o write fallido.
 */

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

export interface CatalogEntry {
  caseId: string;
  file: string;
  testName: string;
  criterion: string;
  criterionText: string | null;
  judgeScore: number | null;
  judgeVerdict: 'PASS' | 'WEAK' | null;
  judgeAxes: {
    meaningfulAssert: number;
    stableSelectors: number;
    noFragileWaits: number;
    noContamination: number;
    coversCriterion: number;
  } | null;
  runStatus: 'passed' | 'failed' | 'flaky' | 'skipped' | 'unknown' | null;
  runErrorMessage: string | null;
  auditFindings: Array<{ type: string; line: number; value?: string }>;
  a11ySnippetMode: 'block' | 'warn' | 'skip' | null;
}

export interface CatalogSummary {
  total: number;
  withJudge: number;
  withRun: number;
  withAudit: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  avgJudgeScore: number | null;
  weakTests: number;
  a11yPolicy: { mode: string; reason: string; declaredIn: string } | null;
}

export interface TestCatalog {
  schemaVersion: 1;
  generated: string;
  sources: {
    plan: string | null;
    specsDir: string;
    judgeReport: string | null;
    runReport: string | null;
    auditReport: string | null;
  };
  summary: CatalogSummary;
  entries: CatalogEntry[];
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function walkSpecFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function recurse(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let info;
      try {
        info = await stat(full);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        await recurse(full);
      } else if (full.endsWith('.spec.ts')) {
        out.push(full);
      }
    }
  }
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat) return out;
  if (rootStat.isDirectory()) await recurse(root);
  else if (root.endsWith('.spec.ts')) out.push(root);
  return out;
}

interface ParsedTest {
  file: string;
  testName: string;
  criterion: string;
  a11ySnippetMode: 'block' | 'warn' | 'skip' | null;
}

function extractTestsFromSpec(file: string, content: string): ParsedTest[] {
  const tests: ParsedTest[] = [];
  // matches test('name', ...) y test.only/skip
  const re = /\btest(?:\.only|\.skip)?\s*\(\s*['"`]([^'"`]+)['"`]/g;
  // detección rápida del modo del snippet inyectado:
  let a11ySnippetMode: ParsedTest['a11ySnippetMode'] = null;
  if (content.includes('console.warn(\'[a11y][warn]')) {
    a11ySnippetMode = 'warn';
  } else if (content.includes('expect(_axe.violations).toEqual([])')) {
    a11ySnippetMode = 'block';
  } else if (content.includes('new AxeBuilder(')) {
    // tiene axe pero no encaja con block ni warn — interpretamos como block por defecto
    a11ySnippetMode = 'block';
  } else {
    a11ySnippetMode = 'skip';
  }

  for (const m of content.matchAll(re)) {
    const testName = m[1] ?? '';
    // criterio: buscamos hacia atrás el JSDoc inmediatamente anterior
    const beforeText = content.slice(0, m.index ?? 0);
    const criterionMatch = beforeText.match(/(RF|FREE|GAP)-\d+(?=[^@]*$)/);
    const criterion = criterionMatch ? criterionMatch[0] : 'UNKNOWN';
    tests.push({ file, testName, criterion, a11ySnippetMode });
  }
  return tests;
}

interface JudgeEntry {
  file: string;
  testName: string;
  criterion: string;
  axes: {
    meaningfulAssert: { score: number; reason: string };
    stableSelectors: { score: number; reason: string };
    noFragileWaits: { score: number; reason: string };
    noContamination: { score: number; reason: string };
    coversCriterion: { score: number; reason: string };
  };
  score: number;
  verdict: 'PASS' | 'WEAK';
}

interface JudgeReport {
  schemaVersion?: number;
  summary?: { threshold?: number };
  results?: JudgeEntry[];
}

interface RunResult {
  file?: string;
  title?: string;
  status?: 'passed' | 'failed' | 'flaky' | 'skipped' | 'unknown';
  errorMessage?: string;
}

interface RunReport {
  results?: RunResult[];
}

interface AuditFinding {
  file: string;
  line: number;
  type: string;
  value?: string;
}

interface AuditReport {
  findings?: AuditFinding[];
}

async function tryReadJson<T>(path: string | null): Promise<T | null> {
  if (!path) return null;
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function tryReadText(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

function extractCriterionTextFromPlan(planMd: string, criterion: string): string | null {
  if (criterion === 'UNKNOWN') return null;
  // sección `### RF-NNN · <título>` seguida de bullets; capturamos el bloque hasta la próxima ### o EOF.
  const re = new RegExp(`### ${criterion}\\b[^\\n]*\\n([\\s\\S]*?)(?=\\n###|$)`);
  const m = planMd.match(re);
  if (!m) return null;
  // dentro del bloque, buscamos "**Texto FD**:" o el primer bullet legible
  const block = m[1] ?? '';
  const textFd = block.match(/\*\*Texto FD\*\*[:\s]*([^\n]+)/);
  if (textFd) return textFd[1]?.trim() ?? null;
  const firstBullet = block.match(/-\s+([^\n]+)/);
  return firstBullet ? (firstBullet[1]?.trim() ?? null) : null;
}

interface AuditLogEntry {
  action: string;
  target: string;
  metadata?: { policy?: string; mode?: string; reason?: string; declaredIn?: string };
}

async function extractLatestA11yPolicy(
  auditLogPath: string | null,
): Promise<CatalogSummary['a11yPolicy']> {
  const raw = await tryReadText(auditLogPath);
  if (!raw) return null;
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  let latest: CatalogSummary['a11yPolicy'] = null;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as AuditLogEntry;
      if (
        entry.action === 'policy_skip' &&
        entry.target === 'a11y' &&
        entry.metadata?.mode &&
        entry.metadata?.reason &&
        entry.metadata?.declaredIn
      ) {
        latest = {
          mode: entry.metadata.mode,
          reason: entry.metadata.reason,
          declaredIn: entry.metadata.declaredIn,
        };
      }
    } catch {
      // ignora líneas no parseables
    }
  }
  return latest;
}

export interface ExporterInputs {
  specsDir: string;
  plan?: string | null;
  judgeReport?: string | null;
  runReport?: string | null;
  auditReport?: string | null;
  auditLog?: string | null;
}

export async function buildCatalog(inputs: ExporterInputs): Promise<TestCatalog> {
  const specsDir = inputs.specsDir;
  const files = await walkSpecFiles(specsDir);

  const planMd = await tryReadText(inputs.plan ?? null);
  const judge = await tryReadJson<JudgeReport>(inputs.judgeReport ?? null);
  const run = await tryReadJson<RunReport>(inputs.runReport ?? null);
  const audit = await tryReadJson<AuditReport>(inputs.auditReport ?? null);
  const a11yPolicy = await extractLatestA11yPolicy(inputs.auditLog ?? null);

  const judgeByKey = new Map<string, JudgeEntry>();
  for (const r of judge?.results ?? []) {
    const key = `${basename(r.file)}::${slug(r.testName)}`;
    judgeByKey.set(key, r);
  }
  const runByKey = new Map<string, RunResult>();
  for (const r of run?.results ?? []) {
    if (!r.file || !r.title) continue;
    const key = `${basename(r.file)}::${slug(r.title)}`;
    runByKey.set(key, r);
  }
  const auditByFile = new Map<string, AuditFinding[]>();
  for (const f of audit?.findings ?? []) {
    const arr = auditByFile.get(basename(f.file)) ?? [];
    arr.push(f);
    auditByFile.set(basename(f.file), arr);
  }

  const entries: CatalogEntry[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const parsed = extractTestsFromSpec(file, content);
    for (const p of parsed) {
      const caseId = `${basename(p.file)}::${slug(p.testName)}`;
      if (seen.has(caseId)) {
        process.stderr.write(`[exporter] dedup: ignorando duplicado ${caseId}\n`);
        continue;
      }
      seen.add(caseId);

      const j = judgeByKey.get(caseId);
      const r = runByKey.get(caseId);
      const auditFindings = (auditByFile.get(basename(p.file)) ?? []).map((af) => ({
        type: af.type,
        line: af.line,
        ...(af.value ? { value: af.value } : {}),
      }));

      const criterionText = planMd ? extractCriterionTextFromPlan(planMd, p.criterion) : null;

      entries.push({
        caseId,
        file: p.file,
        testName: p.testName,
        criterion: p.criterion,
        criterionText,
        judgeScore: j ? Math.round(j.score * 1000) / 1000 : null,
        judgeVerdict: j ? j.verdict : null,
        judgeAxes: j
          ? {
              meaningfulAssert: j.axes.meaningfulAssert.score,
              stableSelectors: j.axes.stableSelectors.score,
              noFragileWaits: j.axes.noFragileWaits.score,
              noContamination: j.axes.noContamination.score,
              coversCriterion: j.axes.coversCriterion.score,
            }
          : null,
        runStatus: r?.status ?? null,
        runErrorMessage: r?.errorMessage
          ? r.errorMessage.split('\n')[0] ?? null
          : null,
        auditFindings,
        a11ySnippetMode: p.a11ySnippetMode,
      });
    }
  }

  // Summary
  const total = entries.length;
  const withJudge = entries.filter((e) => e.judgeScore !== null).length;
  const withRun = entries.filter((e) => e.runStatus !== null).length;
  const withAudit = inputs.auditReport ? entries.length : 0;
  const passed = entries.filter((e) => e.runStatus === 'passed').length;
  const failed = entries.filter((e) => e.runStatus === 'failed').length;
  const flaky = entries.filter((e) => e.runStatus === 'flaky').length;
  const skipped = entries.filter((e) => e.runStatus === 'skipped').length;
  const judgeScores = entries.map((e) => e.judgeScore).filter((s): s is number => s !== null);
  const avgJudgeScore = judgeScores.length === 0
    ? null
    : Math.round((judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length) * 1000) / 1000;
  const weakTests = entries.filter((e) => e.judgeScore !== null && e.judgeScore < 0.5).length;

  return {
    schemaVersion: 1,
    generated: new Date().toISOString(),
    sources: {
      plan: inputs.plan ?? null,
      specsDir,
      judgeReport: inputs.judgeReport ?? null,
      runReport: inputs.runReport ?? null,
      auditReport: inputs.auditReport ?? null,
    },
    summary: {
      total,
      withJudge,
      withRun,
      withAudit,
      passed,
      failed,
      flaky,
      skipped,
      avgJudgeScore,
      weakTests,
      a11yPolicy,
    },
    entries,
  };
}

function parseArgs(argv: string[]): {
  specsDir: string | null;
  plan: string | null;
  judgeReport: string | null;
  runReport: string | null;
  auditReport: string | null;
  auditLog: string | null;
  out: string | null;
} {
  let specsDir: string | null = null;
  let plan: string | null = null;
  let judgeReport: string | null = null;
  let runReport: string | null = null;
  let auditReport: string | null = null;
  let auditLog: string | null = null;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--specs-dir') specsDir = argv[++i] ?? null;
    else if (a === '--plan') plan = argv[++i] ?? null;
    else if (a === '--judge-report') judgeReport = argv[++i] ?? null;
    else if (a === '--run-report') runReport = argv[++i] ?? null;
    else if (a === '--audit-report') auditReport = argv[++i] ?? null;
    else if (a === '--audit-log') auditLog = argv[++i] ?? null;
    else if (a === '--out') out = argv[++i] ?? null;
  }
  return { specsDir, plan, judgeReport, runReport, auditReport, auditLog, out };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.specsDir) {
    process.stderr.write('[exporter] --specs-dir <path> requerido\n');
    process.exit(1);
  }

  const catalog = await buildCatalog({
    specsDir: args.specsDir,
    plan: args.plan,
    judgeReport: args.judgeReport,
    runReport: args.runReport,
    auditReport: args.auditReport,
    auditLog: args.auditLog ?? resolve(process.cwd(), 'audit-log.json'),
  });

  const outPath = args.out ?? resolve(process.cwd(), 'output/export/test-catalog.json');
  try {
    await writeFile(outPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`[exporter] no se pudo escribir ${outPath}: ${(err as Error).message}\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({ ok: true, out: outPath, total: catalog.summary.total }) + '\n');
  process.exit(0);
}

const isDirectInvocation = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  void main();
}
