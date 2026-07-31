#!/usr/bin/env node
/**
 * lean-run — orquestación determinística (0 tokens) del flavor lean S3, prueba
 * `copilot-efficient-tokens`. Encadena SOLO los pasos sin juicio; los dos
 * touchpoints LLM (refiner + writer batch) corren FUERA de este script, medidos
 * con `claude -p` (Fase A) o `.agent.md` (Fase B).
 *
 * Recorte vs run-s4-mecanico (catálogo): SIN scenarios_catalog, SIN checkpoint,
 * SIN tc-registry, SIN a11y, SIN consolidación de reviews. Lo que queda es lo que
 * hace que el test quede bien construido y cuesta ~0 (Cubo B del plan).
 *
 *   gate     — compliance pre-flight aislado (sin override), ANTES de gastar LLM
 *   prepare  — compliance (repetido, $0) + walker + adapter + verify-locators + scaffold POM
 *   verify   — pre-review (con MF-postcondition) + `npx playwright test` + run-summary
 *
 * Orden del run (K0.8): gate → refiner LLM (cases.json + walk-script.json) →
 * prepare (el walker ejecuta EL GUION DEL FD) → writer lean batch → verify.
 * El guion sale del FD; el fixture del sitio queda como semilla/regresión.
 *
 * Exit: 0 ok · 2 block (compliance) · 1 error.
 */
import { execSync, type ExecSyncOptions } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { appendAuditEntry } from '../../src/audit-log.ts';
import { runPreflight } from '../../src/compliance-preflight.ts';
import { scaffold, type DiscoveryScreen, type DiscoveryComponent } from '../../src/pom-scaffolder.ts';

interface LeanCtx {
  site: string;
  contract: string;
  url: string;
  workDir: string;
  specsDir: string;
  pagesDir: string;
  componentsDir: string;
}

function ctxFrom(values: Record<string, string | undefined>): LeanCtx {
  const site = values.site ?? 'saucedemo';
  return {
    site,
    contract: values.contract ?? `config/style-contracts/${site}.yaml`,
    url: values.url ?? '',
    workDir: values['work-dir'] ?? `.work/lean-${site}`,
    specsDir: values['specs-dir'] ?? `tests/e2e/${site}`,
    pagesDir: `tests/pages/${site}`,
    componentsDir: `tests/components/${site}`,
  };
}

function sh(command: string, env: Record<string, string> = {}): { status: number; stdout: string } {
  const opts: ExecSyncOptions = {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, ...env },
    maxBuffer: 32 * 1024 * 1024,
  };
  try {
    return { status: 0, stdout: execSync(command, opts) as unknown as string };
  } catch (err: any) {
    return { status: typeof err?.status === 'number' ? err.status : 1, stdout: String(err?.stdout ?? '') };
  }
}

function out(payload: Record<string, unknown>): void {
  console.log(JSON.stringify(payload, null, 2));
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// prepare
// ---------------------------------------------------------------------------

/**
 * gate — compliance pre-flight AISLADO (K0.8). Corre ANTES del refiner: un target
 * bloqueado no debe costar ni un token de LLM. `prepare` lo repite (defensa en
 * profundidad, $0), y el hook PreToolUse es la tercera barrera. Sin override.
 */
function stageGate(values: Record<string, string | undefined>): number {
  const ctx = ctxFrom(values);
  if (!ctx.url) {
    console.error('[lean-run] gate: falta --url');
    return 1;
  }
  const v = runPreflight(ctx.url, values.config);
  const verdict = { verdict: v.verdict, rule: v.rule ?? null, url: v.url, reason: v.reason ?? null };
  mkdirSync(resolve(process.cwd(), '.work'), { recursive: true });
  writeFileSync(
    resolve(process.cwd(), '.work/compliance-verdict.json'),
    JSON.stringify(verdict, null, 2) + '\n',
    'utf8',
  );
  if (verdict.verdict === 'block') {
    out({ stage: 'gate', compliance: verdict, next: 'abortar: target bloqueado por compliance (sin override)' });
    return 2;
  }
  out({
    stage: 'gate',
    compliance: verdict,
    site_id: ctx.site,
    work_dir: ctx.workDir,
    walk_script_expected: `${ctx.workDir}/walk-script.json`,
    next: 'delegar en ia4d-spec-refiner-lean (cases.json + walk-script.json), luego lean-run prepare',
  });
  return 0;
}

/**
 * Guion del walk: prioridad --walk explícito > walk-script.json del refiner
 * (K0.8, el camino normal: el guion se deriva del FD) > fixture del sitio
 * (semilla/regresión). La procedencia se reporta en `walk_source`.
 */
function resolveWalkScript(
  values: Record<string, string | undefined>,
  ctx: ReturnType<typeof ctxFrom>,
): { walk: string; source: 'flag' | 'refiner' | 'fixture' } {
  if (values.walk) return { walk: values.walk, source: 'flag' };
  const fromRefiner = `${ctx.workDir}/walk-script.json`;
  if (existsSync(resolve(process.cwd(), fromRefiner))) return { walk: fromRefiner, source: 'refiner' };
  return { walk: `copilot/fixtures/${ctx.site}.lean.walk.json`, source: 'fixture' };
}

function stagePrepare(values: Record<string, string | undefined>): number {
  const ctx = ctxFrom(values);
  const { walk, source: walkSource } = resolveWalkScript(values, ctx);
  const logPath = resolve(process.cwd(), ctx.workDir, 'audit-log.json');
  if (!ctx.url) {
    console.error('[lean-run] prepare: falta --url');
    return 1;
  }

  // 1. Compliance pre-flight — SIN override (regla dura #3)
  const v = runPreflight(ctx.url, values.config);
  const verdict = { verdict: v.verdict, rule: v.rule ?? null, url: v.url, reason: v.reason ?? null };
  mkdirSync(resolve(process.cwd(), '.work'), { recursive: true });
  writeFileSync(resolve(process.cwd(), '.work/compliance-verdict.json'), JSON.stringify(verdict, null, 2) + '\n', 'utf8');
  if (verdict.verdict === 'block') {
    out({ stage: 'prepare', compliance: verdict, next: 'abortar: target bloqueado por compliance (sin override)' });
    return 2;
  }

  // Limpieza del namespace (specs/pages/components) antes de regenerar
  for (const dir of [ctx.specsDir, ctx.pagesDir, ctx.componentsDir]) {
    const abs = resolve(process.cwd(), dir);
    if (existsSync(abs)) rmSync(abs, { recursive: true, force: true });
    mkdirSync(abs, { recursive: true });
  }
  mkdirSync(resolve(process.cwd(), ctx.workDir), { recursive: true });

  // 2. Walker → dom-map (0 tokens, determinista)
  const w = sh(
    `npx --no-install tsx copilot/src/dom-walker.ts --script=${walk} --contract=${ctx.contract} --base-url=${ctx.url} --work-dir=${ctx.workDir}`,
  );
  if (w.status !== 0) {
    console.error('[lean-run] prepare: dom-walker falló');
    return 1;
  }
  const domMapPath = `${ctx.workDir}/dom-map.json`;
  const domMap = JSON.parse(readFileSync(resolve(process.cwd(), domMapPath), 'utf8')) as {
    testid_attribute?: string;
  };

  // 3. Adapter dom-map → discovery-report (0 tokens)
  const a = sh(`npx --no-install tsx copilot/src/dom-map-to-discovery.ts --dom-map=${domMapPath}`);
  if (a.status !== 0) {
    console.error('[lean-run] prepare: adapter dom-map→discovery falló');
    return 1;
  }
  const discoveryPath = `${ctx.workDir}/discovery-report.json`;

  // 4. verify-locators → anota `verified` in-place (0 tokens, una pasada de navegador)
  const testidAttr = domMap.testid_attribute ?? 'data-testid';
  const vl = sh(
    `npx --no-install tsx src/scripts/verify-locators.ts --report=${discoveryPath} --url=${ctx.url} --style-contract=${ctx.contract} --test-id-attribute=${testidAttr}`,
  );
  if (vl.status !== 0) {
    console.error('[lean-run] prepare: verify-locators falló — continúo sin anotaciones (estado legacy)');
  }
  let locatorVerify: { session_bootstrap?: string; totals?: Record<string, number> } = {};
  try {
    locatorVerify = JSON.parse(vl.stdout);
  } catch {
    /* summary por stdout no parseable — no bloquea */
  }

  // 5. Scaffold POM determinístico
  const discovery = JSON.parse(readFileSync(resolve(process.cwd(), discoveryPath), 'utf8')) as {
    screens: DiscoveryScreen[];
    components?: DiscoveryComponent[];
  };
  const scaffoldResult = scaffold(discovery.screens, {
    outputDir: resolve(process.cwd(), ctx.pagesDir),
    componentsDir: resolve(process.cwd(), ctx.componentsDir),
    components: discovery.components,
  });

  appendAuditEntry(
    {
      source: 'command',
      action: 'allow',
      rule: 'lean-prepare',
      reason: 'flavor lean S3: compliance ok + walker + adapter + verify-locators + scaffold',
      result: 'pass',
      metadata: { site: ctx.site, screens: discovery.screens.length, poms: scaffoldResult.files.length },
    },
    logPath,
  );

  // Drift FD↔aplicación: los expect_* del guion que el walker no observó (K0.2).
  // No son fallos del walker — son hallazgos QA sobre el FD.
  const domMapFull = JSON.parse(readFileSync(resolve(process.cwd(), domMapPath), 'utf8')) as {
    open_questions?: Array<{ flow: string; step: string; action: string; reason: string }>;
    screens?: Array<{ name: string; business_text?: Array<{ name?: string }> }>;
  };
  const drift = (domMapFull.open_questions ?? []).filter((q) => q.action?.startsWith('expect'));
  const businessText = (domMapFull.screens ?? []).flatMap((s) =>
    (s.business_text ?? []).map((b) => ({ screen: s.name, text: b.name })),
  );

  out({
    stage: 'prepare',
    compliance: verdict,
    site_id: ctx.site,
    work_dir: ctx.workDir,
    walk_script: toPosix(walk),
    walk_source: walkSource,
    dom_map: toPosix(domMapPath),
    discovery_report: toPosix(discoveryPath),
    locator_verification: { session_bootstrap: locatorVerify.session_bootstrap, totals: locatorVerify.totals },
    business_text: businessText,
    fd_drift: drift,
    scaffold: scaffoldResult.files.map((f) => ({ className: f.className, path: toPosix(f.path) })),
    dirs: { specs: ctx.specsDir, pages: ctx.pagesDir, components: ctx.componentsDir },
    next:
      drift.length > 0
        ? `DRIFT FD↔app: ${drift.length} postcondición(es) del FD no observadas — repórtalo al QA antes de generar specs`
        : 'touchpoint LLM #2 (writer lean batch → specs); luego verify.',
  });
  return 0;
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

interface TestOutcome {
  file: string;
  title: string;
  status: string;
  message: string | null;
}

function parsePlaywrightResults(root: any): TestOutcome[] {
  const outcomes: TestOutcome[] = [];
  const walk = (suite: any): void => {
    for (const child of suite.suites ?? []) walk(child);
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = (t.results ?? []).at(-1) ?? {};
        const message: string | null = last.error?.message
          ? String(last.error.message).replace(/\[[0-9;]*m/g, '').split('\n')[0]
          : null;
        outcomes.push({
          file: toPosix(String(spec.file ?? suite.file ?? '')),
          title: String(spec.title ?? ''),
          status: String(last.status ?? (spec.ok ? 'passed' : 'failed')),
          message,
        });
      }
    }
  };
  for (const s of root?.suites ?? []) walk(s);
  return outcomes;
}

function stageVerify(values: Record<string, string | undefined>): number {
  const ctx = ctxFrom(values);
  if (!ctx.url) {
    console.error('[lean-run] verify: falta --url (los POM usan goto relativo)');
    return 1;
  }

  // pre-review determinístico (informativo; el writer lean ya lo corrió shift-left).
  // --discovery-report activa MF-postcondition (K0.7): exige assert sobre el texto
  // de resultado que el walker observó, no solo N asserts funcionales.
  const pre = sh(
    `npx --no-install tsx src/scripts/pre-review.ts ${ctx.specsDir} --style-contract=${ctx.contract} ` +
      `--discovery-report=${ctx.workDir}/discovery-report.json --out-dir=${ctx.workDir}/pre-review`,
  );
  let preJson: any = null;
  try {
    preJson = JSON.parse(pre.stdout);
  } catch {
    console.error('[lean-run] verify: pre-review no devolvió JSON parseable');
  }

  // npx playwright test (evidence minimal → list,json)
  const resultsPath = `${ctx.workDir}/playwright-results.json`;
  const run = sh(`npx --no-install playwright test ${toPosix(ctx.specsDir)}/ --reporter=list,json`, {
    QA_BASE_URL: ctx.url,
    PLAYWRIGHT_JSON_OUTPUT_NAME: resultsPath,
  });

  const resultsAbs = resolve(process.cwd(), resultsPath);
  if (!existsSync(resultsAbs)) {
    console.error(`[lean-run] verify: sin ${resultsPath} — Playwright no reportó (exit ${run.status})`);
    console.error(run.stdout.slice(-2000));
    return 1;
  }
  const outcomes = parsePlaywrightResults(JSON.parse(readFileSync(resultsAbs, 'utf8'))).filter(
    (o) => !/seed\.spec\.ts$/.test(o.file),
  );

  const specFiles = existsSync(resolve(process.cwd(), ctx.specsDir))
    ? readdirSync(resolve(process.cwd(), ctx.specsDir)).filter((f) => f.endsWith('.spec.ts'))
    : [];
  const perSpec = specFiles.map((f) => {
    const specOutcomes = outcomes.filter((o) => basename(o.file) === f);
    const failed = specOutcomes.filter((o) => o.status !== 'passed');
    return {
      spec: f,
      tests: specOutcomes.length,
      run_result: specOutcomes.length === 0 ? 'not-run' : failed.length === 0 ? 'passed' : 'failed',
      ...(failed.length > 0 ? { failure: failed.map((x) => `${x.title}: ${x.message ?? 'sin mensaje'}`).join(' | ') } : {}),
    };
  });

  // El flavor lean CORTA axe (MF-4) y @criterion (MF-5): el pre-review de catálogo los reporta
  // como must-fix, pero aquí NO son defectos — son el diseño. El net lean solo mira los checks de
  // construcción (MF-1/1b locators, MF-2 waits, MF-regex-anchor, MF-banned-api, MF-8 POM, MF-9
  // asserts). Se filtran MF-4/MF-5 y se reporta must-fix crudo vs lean.
  const LEAN_EXEMPT = new Set(['MF-4', 'MF-5']);
  const dirty: Array<{ file: string; criteria: string[] }> = Array.isArray(preJson?.dirty_specs)
    ? preJson.dirty_specs
    : [];
  const leanDirty = dirty
    .map((d) => ({ spec: basename(String(d.file)), criteria: (d.criteria ?? []).filter((c) => !LEAN_EXEMPT.has(c)) }))
    .filter((d) => d.criteria.length > 0);
  const runSummary = {
    flavor: 'lean-s3',
    run: values['run-label'] ?? `lean ${new Date().toISOString()}`,
    target_url: ctx.url,
    specs: perSpec,
    pre_review: {
      specs_total: preJson?.specs_total ?? null,
      must_fix_raw: preJson?.must_fix_total ?? null,
      exempt_note: 'MF-4 (axe) y MF-5 (@criterion) cortados en el flavor lean — no cuentan',
      lean_dirty_specs: leanDirty,
      lean_clean: leanDirty.length === 0,
    },
  };
  writeFileSync(
    resolve(process.cwd(), ctx.workDir, 'lean-run-summary.json'),
    JSON.stringify(runSummary, null, 2) + '\n',
    'utf8',
  );

  const passed = perSpec.filter((s) => s.run_result === 'passed').length;
  out({
    stage: 'verify',
    playwright_exit: run.status,
    passed,
    total: perSpec.length,
    failed: perSpec.filter((s) => s.run_result !== 'passed'),
    pre_review: runSummary.pre_review,
    summary_path: toPosix(`${ctx.workDir}/lean-run-summary.json`),
    next: passed === perSpec.length ? 'Gate A: 3/3 verdes + inspección de calidad.' : 'rojos → decide el QA (Healer o ajuste).',
  });
  return 0;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(): void {
  const stage = process.argv[2];
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      site: { type: 'string' },
      contract: { type: 'string' },
      url: { type: 'string' },
      walk: { type: 'string' },
      config: { type: 'string' },
      'work-dir': { type: 'string' },
      'specs-dir': { type: 'string' },
      'run-label': { type: 'string' },
    },
    allowPositionals: false,
  });
  switch (stage) {
    case 'gate':
      process.exit(stageGate(values));
      break;
    case 'prepare':
      process.exit(stagePrepare(values));
      break;
    case 'verify':
      process.exit(stageVerify(values));
      break;
    default:
      console.error('[lean-run] uso: tsx copilot/src/lean-run.ts <gate|prepare|verify> [--site --contract --url --walk --work-dir --specs-dir]');
      process.exit(1);
  }
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('lean-run.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
