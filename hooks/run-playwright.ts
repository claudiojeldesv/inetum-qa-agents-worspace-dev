/**
 * CLI — `npx tsx hooks/run-playwright.ts --dir <path> [--out <path>] [--threshold <0..1>]`
 *
 * Wrapper sobre `npx playwright test <dir> --reporter=json` que materializa
 * el resultado en un `run-report.json` estructurado y devuelve un verdict
 * threshold-based.
 *
 * Salida en stdout: una línea JSON con el shape `RunReport` (también
 * persistida en --out, default `<dir>/run-report.json`).
 *
 * Exit codes:
 *   0 → passRate ≥ threshold (default 0.8). Suite considera GO.
 *   2 → passRate < threshold. Suite considera NO-GO.
 *   1 → error de ejecución (Playwright no arrancó, JSON ilegible).
 *
 * No instala Playwright. Asume `@playwright/test` ya presente en el
 * repo destino (es el caso del MVP: la dep está pinneada en
 * package.json del propio agente). En el output deja a cada test fallido
 * con `confidence: 0` (terminología compatible con el judge de Slice 8,
 * que más adelante poblará el campo para los verdes).
 */

import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface PlaywrightJsonSpecInner {
  file?: string;
  title?: string;
  tests?: PlaywrightJsonTest[];
}

interface PlaywrightJsonSuite {
  file?: string;
  title?: string;
  specs?: PlaywrightJsonSpecInner[];
  suites?: PlaywrightJsonSuite[];
}

interface PlaywrightJsonTest {
  results?: Array<{
    status?: string;
    error?: { message?: string };
  }>;
}

interface PlaywrightJsonRoot {
  suites?: PlaywrightJsonSuite[];
  stats?: {
    expected?: number;
    unexpected?: number;
    flaky?: number;
    skipped?: number;
  };
}

interface PerTestResult {
  file: string;
  title: string;
  status: 'passed' | 'failed' | 'flaky' | 'skipped' | 'unknown';
  confidence: number;
  errorMessage?: string;
}

export interface RunReport {
  pass: boolean;
  threshold: number;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  passRate: number;
  results: PerTestResult[];
  exitCode: number;
  errorMessage?: string;
}

function parseArgs(argv: string[]): {
  dir: string | null;
  out: string | null;
  threshold: number;
} {
  let dir: string | null = null;
  let out: string | null = null;
  let threshold = 0.8;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') dir = argv[++i] ?? null;
    else if (a === '--out') out = argv[++i] ?? null;
    else if (a === '--threshold') {
      const raw = argv[++i] ?? '';
      const v = Number(raw);
      if (Number.isFinite(v) && v >= 0 && v <= 1) threshold = v;
    }
  }
  return { dir, out, threshold };
}

function flattenResults(root: PlaywrightJsonRoot): PerTestResult[] {
  const out: PerTestResult[] = [];

  function statusFor(test: PlaywrightJsonTest): PerTestResult['status'] {
    const results = test.results ?? [];
    if (results.length === 0) return 'unknown';
    const last = results[results.length - 1];
    const s = last?.status ?? '';
    if (s === 'passed' || s === 'expected') return 'passed';
    if (s === 'failed' || s === 'unexpected' || s === 'timedOut') return 'failed';
    if (s === 'flaky') return 'flaky';
    if (s === 'skipped') return 'skipped';
    return 'unknown';
  }

  function lastError(test: PlaywrightJsonTest): string | undefined {
    const results = test.results ?? [];
    const last = results[results.length - 1];
    return last?.error?.message;
  }

  function walkSpec(spec: PlaywrightJsonSpecInner, file: string): void {
    const tests = spec.tests ?? [];
    for (const t of tests) {
      const status = statusFor(t);
      out.push({
        file,
        title: spec.title ?? '<sin título>',
        status,
        confidence: status === 'passed' ? 1 : 0,
        ...(status === 'failed' || status === 'flaky'
          ? { errorMessage: lastError(t) }
          : {}),
      });
    }
  }

  function walkSuite(suite: PlaywrightJsonSuite, parentFile: string): void {
    const file = suite.file ?? parentFile;
    for (const spec of suite.specs ?? []) {
      walkSpec(spec, spec.file ?? file);
    }
    for (const inner of suite.suites ?? []) {
      walkSuite(inner, file);
    }
  }

  for (const suite of root.suites ?? []) {
    walkSuite(suite, suite.file ?? '<unknown>');
  }
  return out;
}

function summarize(results: PerTestResult[], threshold: number, exitCode: number, errorMessage?: string): RunReport {
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const flaky = results.filter((r) => r.status === 'flaky').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const total = passed + failed + flaky + skipped;
  // pass-rate sobre tests que ejecutaron (no contamos skipped)
  const executed = passed + failed + flaky;
  const passRate = executed === 0 ? 0 : passed / executed;
  return {
    pass: passRate >= threshold && executed > 0,
    threshold,
    total,
    passed,
    failed,
    flaky,
    skipped,
    passRate,
    results,
    exitCode,
    ...(errorMessage ? { errorMessage } : {}),
  };
}

async function runPlaywright(dir: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    // shell:true es necesario en Windows con Node 18.20+/20.18+ para invocar
    // .cmd shims (npx, playwright). Node tightened spawn() en esas versiones
    // por CVE-2024-27980 y exige shell para resolverlos. En Linux/Mac no
    // cambia el comportamiento.
    //
    // `dir` se pasa vía env var `TEST_PILOT_TESTDIR` y se consume desde
    // `playwright.config.ts`. NO se pasa como positional arg: Playwright
    // interpreta los positionals como regex de filtro sobre paths
    // relativos a testDir (no como override de testDir), por lo que un
    // positional `output/generate` jamás matchearía contra
    // `login.standard-user.spec.ts`. El config lee el env var y lo usa
    // como `testDir` (default './output/generate' si no viene seteado).
    const child = spawn(
      'npx',
      ['playwright', 'test', '--reporter=json'],
      {
        env: { ...process.env, FORCE_COLOR: '0', TEST_PILOT_TESTDIR: dir },
        shell: true,
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
    child.on('error', (err) => {
      resolve({ exitCode: 1, stdout, stderr: stderr + '\n' + err.message });
    });
  });
}

function tryParseJsonReport(stdout: string): PlaywrightJsonRoot | null {
  // El reporter JSON de Playwright emite un único objeto JSON a stdout.
  // Si Playwright también imprime warnings antes, recortamos hasta la
  // primera `{` que pueda parsearse como JSON válido.
  const candidates: string[] = [];
  candidates.push(stdout.trim());
  const firstBrace = stdout.indexOf('{');
  if (firstBrace > 0) candidates.push(stdout.slice(firstBrace));
  for (const raw of candidates) {
    try {
      return JSON.parse(raw) as PlaywrightJsonRoot;
    } catch {
      continue;
    }
  }
  return null;
}

async function main(): Promise<void> {
  const { dir, out, threshold } = parseArgs(process.argv.slice(2));
  if (!dir) {
    process.stderr.write('[run-playwright] uso: --dir <path> [--out <path>] [--threshold <0..1>]\n');
    process.exit(1);
  }

  const result = await runPlaywright(dir);

  // Intentamos parsear JSON aunque exit !=0; Playwright devuelve exit
  // code distinto de 0 cuando algún test falla, pero el JSON sigue siendo válido.
  const root = tryParseJsonReport(result.stdout);
  if (!root) {
    const report: RunReport = summarize(
      [],
      threshold,
      result.exitCode,
      `Playwright no produjo JSON parseable. stderr:\n${result.stderr.slice(0, 2000)}`,
    );
    const outPath = out ?? join(dir, 'run-report.json');
    try {
      await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
    } catch {
      // si no podemos escribir, igual emitimos por stdout
    }
    process.stdout.write(JSON.stringify(report) + '\n');
    process.exit(1);
  }

  const results = flattenResults(root);
  const report = summarize(results, threshold, result.exitCode);

  const outPath = out ?? join(dir, 'run-report.json');
  try {
    await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
  } catch (err) {
    process.stderr.write(`[run-playwright] no se pudo escribir ${outPath}: ${(err as Error).message}\n`);
  }

  process.stdout.write(JSON.stringify(report) + '\n');
  process.exit(report.pass ? 0 : 2);
}

// Permite tests unitarios que importan funciones puras sin disparar main()
const isDirectRun =
  process.argv[1] !== undefined && process.argv[1].endsWith('run-playwright.ts');
if (isDirectRun) {
  void main();
}

export { flattenResults, summarize, tryParseJsonReport };
