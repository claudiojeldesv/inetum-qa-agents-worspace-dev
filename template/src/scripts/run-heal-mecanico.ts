#!/usr/bin/env node
/**
 * run-heal-mecanico — orquestación determinística de los pasos SIN juicio del command
 * /ia4d-qa-automator:heal (Fase Q3 quality-greens, patrón regla #10: healing off por defecto).
 *
 * El Healer nativo (playwright-test-healer) NO es juez: su output se audita con el protocolo
 * post-heal validado en Q1 — suite re-ejecutada + pre-review + Reviewer sobre los specs
 * afectados + verify-a11y. Este script encadena la parte mecánica de ese protocolo; el LLM
 * conserva el juicio: invocar al Healer por spec rojo (secuencial, comparte navegador MCP),
 * anotar causa raíz/ficheros tocados, invocar al Reviewer y reportar al QA.
 *
 * Stages (el command los invoca en orden; cada uno es UNA llamada Bash del orquestador):
 *   setup  — deriva <workDir> (patrón report), re-verifica compliance del target (sin override)
 *            y lista los rojos del run-summary. Sin rojos → nada que sanar, termina.
 *   verify — re-ejecuta la suite del namespace (blast radius: 1 fix en POM cura N), pre-review
 *            + verify-a11y sobre los specs, consolida el feedback post-heal del Reviewer
 *            (<workDir>/healing/review-feedback/), actualiza el run-summary con healed[] y
 *            registra cada sanación al audit-log (spec, ficheros tocados, causa raíz, verdicts).
 *
 * Los artefactos post-heal viven en <workDir>/healing/ para NO pisar los del run generador
 * (los verdicts de generación se preservan; los post-heal van en healed[].post_heal).
 *
 * Exit codes: 0 = ok · 2 = block (compliance) · 3 = decisión del QA pendiente · 1 = error
 * (en verify, exit 1 también significa rojos remanentes tras la sanación).
 *
 * Re-ejecutable: healed[] se reemplaza por spec (no se duplica); sin rojos, setup lo dice y para.
 */
import { execSync, type ExecSyncOptions } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

import { appendAuditEntry } from '../audit-log.ts';
import { runPreflight } from '../compliance-preflight.ts';
import { consolidateReviews } from './consolidate-reviews.ts';
import { parseFlags } from './resolve-mode.ts';
import { parsePlaywrightResults, summarizeReviews } from './run-s4-mecanico.ts';

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

export interface HealContext {
  workDir: string;
  siteId: string;
  summaryPath: string;
  logPath: string;
  stylePath: string | null;
}

interface RunSummary {
  module?: string;
  target_url?: string;
  tests_generated?: Array<Record<string, unknown> & { spec: string; run_result?: string; tc_id?: string | null }>;
  healed?: HealedEntry[];
  [k: string]: unknown;
}

export interface HealNote {
  spec: string;
  files_touched?: string[];
  root_cause?: string;
  cost_usd?: number | null;
}

export interface HealedEntry {
  tc_id: string | null;
  spec: string;
  files_touched: string[] | null;
  root_cause: string | null;
  cost_usd: number | null;
  healed_at: string;
  post_heal: {
    run_result: string;
    pre_review_clean: boolean | null;
    a11y_ok: boolean | null;
    reviewer_verdict: string;
    reviewer_must_fix: number | null;
  };
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function out(payload: Record<string, unknown>): void {
  console.log(JSON.stringify(payload, null, 2));
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Deriva el <workDir> con las mismas reglas que /ia4d-qa-automator:report:
 * --work-dir > QA_WORK_DIR > único .work/<site-id>/ con run-summary > legacy .work plano.
 * Varios candidatos → pending (el QA elige, nunca en silencio).
 */
export function resolveWorkDir(
  flags: Record<string, string | undefined>,
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): { workDir: string } | { candidates: string[] } | { error: string } {
  const explicit = flags['work-dir'] || env.QA_WORK_DIR;
  if (explicit) {
    if (!existsSync(resolve(cwd, explicit, 'qa-automator-run-summary.json'))) {
      return { error: `sin qa-automator-run-summary.json en ${explicit} — corre primero una generación` };
    }
    return { workDir: toPosix(explicit) };
  }
  const workRoot = resolve(cwd, '.work');
  const candidates: string[] = [];
  if (existsSync(workRoot)) {
    for (const entry of readdirSync(workRoot)) {
      if (existsSync(join(workRoot, entry, 'qa-automator-run-summary.json'))) {
        candidates.push(toPosix(`.work/${entry}`));
      }
    }
  }
  if (candidates.length === 1) return { workDir: candidates[0] };
  if (candidates.length > 1) return { candidates };
  if (existsSync(join(workRoot, 'qa-automator-run-summary.json'))) return { workDir: '.work' };
  return { error: 'ningún run-summary encontrado bajo .work/ — corre primero una generación' };
}

export function contextFrom(flags: Record<string, string | undefined>, workDir: string): HealContext {
  const siteId = basename(workDir);
  const defaultStyle = `config/style-contracts/${siteId}.yaml`;
  const stylePath =
    flags['style'] ?? (existsSync(resolve(process.cwd(), defaultStyle)) ? defaultStyle : null);
  return {
    workDir,
    siteId,
    summaryPath: toPosix(join(workDir, 'qa-automator-run-summary.json')),
    logPath: resolve(process.cwd(), workDir, 'audit-log.json'),
    stylePath,
  };
}

/** Rojos del run-summary: todo test generado cuyo último run_result no fue 'passed'. */
export function redsFromSummary(summary: RunSummary): Array<{ tc_id: string | null; spec: string; failure: string | null }> {
  return (summary.tests_generated ?? [])
    .filter((t) => t.run_result !== 'passed')
    .map((t) => ({
      tc_id: (t.tc_id as string | null) ?? null,
      spec: toPosix(String(t.spec)),
      failure: typeof t.failure === 'string' ? t.failure : null,
    }));
}

/** Directorio común de los specs del summary (namespace a re-ejecutar entero — blast radius). */
export function specsDirFromSummary(summary: RunSummary): string | null {
  const dirs = new Set(
    (summary.tests_generated ?? []).map((t) => toPosix(dirname(String(t.spec)))),
  );
  if (dirs.size === 0) return null;
  return [...dirs].sort()[0];
}

function loadContract(stylePath: string | null): Record<string, any> {
  if (!stylePath) return {};
  const abs = resolve(process.cwd(), stylePath);
  if (!existsSync(abs)) return {};
  return (parseYaml(readFileSync(abs, 'utf8')) as Record<string, any>) ?? {};
}

function runChild(
  command: string,
  ctx: HealContext,
  extraEnv: Record<string, string> = {},
): { status: number; stdout: string } {
  const opts: ExecSyncOptions = {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, QA_WORK_DIR: ctx.workDir, ...extraEnv },
    maxBuffer: 32 * 1024 * 1024,
  };
  try {
    return { status: 0, stdout: execSync(command, opts) as unknown as string };
  } catch (err: any) {
    return { status: typeof err?.status === 'number' ? err.status : 1, stdout: String(err?.stdout ?? '') };
  }
}

// ---------------------------------------------------------------------------
// Stage: setup
// ---------------------------------------------------------------------------

function stageSetup(flags: Record<string, string | undefined>): number {
  const resolved = resolveWorkDir(flags);
  if ('error' in resolved) {
    console.error(`[run-heal-mecanico] setup: ${resolved.error}`);
    return 1;
  }
  if ('candidates' in resolved) {
    out({
      stage: 'setup',
      pending: 'work-dir-selection',
      candidates: resolved.candidates,
      next: 'ask-first: varios runs candidatos — pregunta al QA cuál sanar y re-invoca setup con --work-dir=<elegido>',
    });
    return 3;
  }

  const ctx = contextFrom(flags, resolved.workDir);
  const summary = readJson<RunSummary>(resolve(process.cwd(), ctx.summaryPath));
  if (!summary) {
    console.error(`[run-heal-mecanico] setup: ${ctx.summaryPath} ilegible`);
    return 1;
  }

  // Compliance re-check del target (regla dura #3 — heal navega el target igual que la generación).
  const url = flags['url'] || String(summary.target_url ?? '');
  if (!url) {
    console.error('[run-heal-mecanico] setup: el run-summary no trae target_url y no se pasó --url');
    return 1;
  }
  const verdictResult = runPreflight(url, flags['config']);
  const compliance = {
    verdict: verdictResult.verdict,
    rule: verdictResult.rule ?? null,
    url: verdictResult.url,
    reason: verdictResult.reason ?? null,
  };
  if (compliance.verdict === 'block') {
    out({ stage: 'setup', compliance, next: 'abortar: target bloqueado por compliance (sin override)' });
    return 2;
  }
  if (compliance.verdict === 'warn' && !('warn-acknowledged' in flags)) {
    out({
      stage: 'setup',
      pending: 'compliance-warn',
      compliance,
      next: 'ask-first: muestra el warning al QA; si acepta, re-invoca setup con --warn-acknowledged',
    });
    return 3;
  }

  const reds = redsFromSummary(summary);
  const specsDir = specsDirFromSummary(summary);
  mkdirSync(resolve(process.cwd(), ctx.workDir, 'healing'), { recursive: true });

  appendAuditEntry(
    {
      source: 'command',
      action: reds.length > 0 ? 'invoke' : 'skip',
      rule: 'healer-setup',
      target: ctx.summaryPath,
      reason:
        reds.length > 0
          ? `${reds.length} rojo(s) en el run-summary — sanación como post-proceso (el Healer no es juez)`
          : 'sin rojos en el run-summary — nada que sanar',
      result: 'pass',
      metadata: { reds: reds.map((r) => r.spec), healed_previously: (summary.healed ?? []).length },
    },
    ctx.logPath,
  );

  out({
    stage: 'setup',
    work_dir: ctx.workDir,
    site_id: ctx.siteId,
    summary_path: ctx.summaryPath,
    style: ctx.stylePath,
    target_url: url,
    compliance,
    specs_dir: specsDir,
    reds,
    healed_previously: (summary.healed ?? []).map((h) => h.spec),
    next:
      reds.length === 0
        ? 'sin rojos: reporta al QA que no hay nada que sanar y termina (re-ejecutable sin efectos)'
        : 'invoca playwright-test-healer por spec rojo — SECUENCIAL (comparten navegador MCP), SIEMPRE FOREGROUND, ' +
          'test_run acotado al spec; escribe <workDir>/healing/heal-notes.json (UN array JSON, Write completo); ' +
          'después el Reviewer por spec afectado (feedback a <workDir>/healing/review-feedback/) y el stage verify.',
  });
  return 0;
}

// ---------------------------------------------------------------------------
// Stage: verify (protocolo post-heal mecánico)
// ---------------------------------------------------------------------------

function stageVerify(flags: Record<string, string | undefined>): number {
  const resolved = resolveWorkDir(flags);
  if ('error' in resolved) {
    console.error(`[run-heal-mecanico] verify: ${resolved.error}`);
    return 1;
  }
  if ('candidates' in resolved) {
    console.error(
      `[run-heal-mecanico] verify: varios runs candidatos (${resolved.candidates.join(', ')}) — pasa --work-dir=<elegido>`,
    );
    return 1;
  }
  const ctx = contextFrom(flags, resolved.workDir);
  const summaryAbs = resolve(process.cwd(), ctx.summaryPath);
  const summary = readJson<RunSummary>(summaryAbs);
  if (!summary) {
    console.error(`[run-heal-mecanico] verify: ${ctx.summaryPath} ilegible`);
    return 1;
  }
  const url = flags['url'] || String(summary.target_url ?? '');
  if (!url) {
    console.error('[run-heal-mecanico] verify: sin target_url (summary) ni --url');
    return 1;
  }
  const specsDir = flags['specs-dir'] || specsDirFromSummary(summary);
  if (!specsDir) {
    console.error('[run-heal-mecanico] verify: el run-summary no trae specs — nada que verificar');
    return 1;
  }

  const healingDir = resolve(process.cwd(), ctx.workDir, 'healing');
  mkdirSync(healingDir, { recursive: true });

  // Notas del orquestador (causa raíz + ficheros tocados por el Healer). Sin fichero → healed[]
  // se construye desde los rojos previos del summary, con causa raíz null (ruidoso, no silencio).
  const notesPath = flags['notes'] || toPosix(join(ctx.workDir, 'healing', 'heal-notes.json'));
  const notesRaw = readJson<HealNote[]>(resolve(process.cwd(), notesPath));
  const notes: HealNote[] =
    notesRaw ?? redsFromSummary(summary).map((r) => ({ spec: r.spec }));
  if (!notesRaw) {
    console.error(`[run-heal-mecanico] verify: sin ${notesPath} — healed[] quedará sin causa raíz/ficheros (rellénalo)`);
  }

  const contract = loadContract(ctx.stylePath);
  const styleFlag = ctx.stylePath ? ` --style-contract=${ctx.stylePath}` : '';

  // 1 — suite re-ejecutada del namespace entero (blast radius Q1: 1 fix en POM cura N specs)
  const resultsPath = `${ctx.workDir}/healing/playwright-results.json`;
  const env: Record<string, string> = {
    QA_BASE_URL: url,
    PLAYWRIGHT_JSON_OUTPUT_NAME: resultsPath,
  };
  if (contract.auth?.enabled && contract.auth?.storage_state) {
    env.QA_STORAGE_STATE = String(contract.auth.storage_state);
  }
  const run = runChild(`npx --no-install playwright test ${toPosix(specsDir)}/ --reporter=list,json`, ctx, env);
  const results = readJson<any>(resolve(process.cwd(), resultsPath));
  if (!results) {
    console.error(`[run-heal-mecanico] verify: sin ${resultsPath} — el run de Playwright no llegó a reportar (exit ${run.status})`);
    console.error(run.stdout.slice(-2000));
    return 1;
  }
  const outcomes = parsePlaywrightResults(results).filter((o) => o.project !== 'setup');

  // 2 — pre-review determinístico post-heal (con MF-postcondition si hay discovery:
  // sanar no puede degradar el assert de negocio a chrome)
  const pre = runChild(
    `npx --no-install tsx src/scripts/pre-review.ts ${toPosix(specsDir)}${styleFlag} ` +
      `--discovery-report=${ctx.workDir}/discovery-report.json --out-dir=${ctx.workDir}/healing/pre-review`,
    ctx,
  );
  let preJson: any = null;
  try {
    preJson = JSON.parse(pre.stdout);
  } catch {
    console.error('[run-heal-mecanico] verify: pre-review no devolvió JSON parseable');
    return 1;
  }

  // 3 — verify-a11y post-heal (el Healer pudo tocar el bloque del scan)
  const a11y = runChild(`npx --no-install tsx src/scripts/verify-a11y.ts ${toPosix(specsDir)}${styleFlag}`, ctx);
  let a11yJson: any = null;
  try {
    a11yJson = JSON.parse(a11y.stdout);
  } catch {
    console.error('[run-heal-mecanico] verify: verify-a11y no devolvió JSON parseable');
    return 1;
  }
  writeFileSync(join(healingDir, 'a11y-verify.json'), JSON.stringify(a11yJson, null, 2) + '\n', 'utf8');

  // 4 — verdicts del Reviewer post-heal (ficheros per-spec en <workDir>/healing/review-feedback/)
  const reviews = consolidateReviews(healingDir);
  const reviewSummary = summarizeReviews(existsSync(reviews.output) ? readFileSync(reviews.output, 'utf8') : '');

  // 5 — healed[] + run-summary actualizado (reemplazo por spec: re-ejecutable sin duplicar)
  const healedAt = new Date().toISOString();
  const healed: HealedEntry[] = notes.map((n) => {
    const spec = toPosix(n.spec);
    const specBase = basename(spec);
    const specOutcomes = outcomes.filter((o) => basename(o.file) === specBase);
    const failed = specOutcomes.filter((o) => o.status !== 'passed');
    const preSpec = (preJson.dirty_specs ?? []).find((d: any) => basename(String(d.file)) === specBase);
    const a11ySpec = a11yJson?.results?.find((r: any) => basename(String(r.file)) === specBase);
    const review = reviewSummary.find((r) => basename(r.spec) === specBase);
    const genEntry = (summary.tests_generated ?? []).find((t) => basename(String(t.spec)) === specBase);
    return {
      tc_id: (genEntry?.tc_id as string | null) ?? null,
      spec,
      files_touched: n.files_touched ?? null,
      root_cause: n.root_cause ?? null,
      cost_usd: n.cost_usd ?? null,
      healed_at: healedAt,
      post_heal: {
        run_result: specOutcomes.length === 0 ? 'not-run' : failed.length === 0 ? 'passed' : 'failed',
        pre_review_clean: preJson.specs_total != null ? !preSpec : null,
        a11y_ok: a11ySpec ? Boolean(a11ySpec.ok) : null,
        reviewer_verdict: review?.verdict ?? 'unknown',
        reviewer_must_fix: review ? review.must_fix : null,
      },
    };
  });

  for (const t of summary.tests_generated ?? []) {
    const specBase = basename(String(t.spec));
    const specOutcomes = outcomes.filter((o) => basename(o.file) === specBase);
    if (specOutcomes.length === 0) continue;
    const failed = specOutcomes.filter((o) => o.status !== 'passed');
    t.run_result = failed.length === 0 ? 'passed' : 'failed';
    if (failed.length > 0) {
      (t as any).failure = failed.map((f) => `${f.title}: ${f.message ?? 'sin mensaje'}`).join(' | ');
    } else {
      delete (t as any).failure;
    }
  }
  const healedSpecs = new Set(healed.map((h) => h.spec));
  summary.healed = [...(summary.healed ?? []).filter((h) => !healedSpecs.has(toPosix(h.spec))), ...healed];
  writeFileSync(summaryAbs, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  // 6 — trazabilidad regulatoria del cambio sobre código de test
  for (const h of healed) {
    appendAuditEntry(
      {
        source: 'command',
        action: 'edit_file',
        target: h.spec,
        rule: 'healer-post-heal',
        reason: h.root_cause ?? 'causa raíz no anotada por el orquestador (heal-notes.json ausente o incompleto)',
        result: h.post_heal.run_result === 'passed' ? 'pass' : 'fail',
        metadata: {
          files_touched: h.files_touched,
          cost_usd: h.cost_usd,
          post_heal: h.post_heal as unknown as Record<string, unknown>,
        },
      },
      ctx.logPath,
    );
  }

  const remainingReds = redsFromSummary(summary);
  out({
    stage: 'verify',
    playwright_exit: run.status,
    suite: {
      passed: outcomes.filter((o) => o.status === 'passed').length,
      failed: outcomes.filter((o) => o.status !== 'passed').length,
    },
    pre_review: { specs_total: preJson.specs_total, must_fix_total: preJson.must_fix_total, dirty_specs: preJson.dirty_specs },
    a11y: { ok: a11y.status === 0, specs_ok: a11yJson.specs_ok, specs_total: a11yJson.specs_total },
    reviews: { consolidated: reviewSummary.length, corrupt: reviews.corrupt },
    healed,
    remaining_reds: remainingReds,
    summary_path: ctx.summaryPath,
    next:
      remainingReds.length === 0
        ? 'reporta al QA: sanación auditada (healed[] en el run-summary), suite verde.'
        : 'quedan rojos: repórtalos al QA con su causa — decide el QA (segunda pasada de heal o ajuste manual).',
  });
  return remainingReds.length === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(): void {
  const stage = process.argv[2];
  const argv = process.argv.slice(3).map((a) => (/^--[a-z-]+$/.test(a) ? `${a}=true` : a));
  const flags = parseFlags(argv);
  switch (stage) {
    case 'setup':
      process.exit(stageSetup(flags));
      break;
    case 'verify':
      process.exit(stageVerify(flags));
      break;
    default:
      console.error('[run-heal-mecanico] uso: tsx src/scripts/run-heal-mecanico.ts <setup|verify> [--flags]');
      process.exit(1);
  }
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('run-heal-mecanico.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
