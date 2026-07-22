#!/usr/bin/env node
/**
 * run-s4-mecanico — orquestación determinística de los pasos SIN juicio del módulo S4
 * (Fase 4 token-efficiency, R7).
 *
 * F2 demostró que el coste del orquestador lo domina el nº de turnos (historial de tool-results
 * re-leído en cada llamada), no la prosa del command. Este script encadena en 5 stages lo que el
 * orquestador ejecutaba paso a paso leyendo prosa; el LLM conserva el juicio: brief y pausas
 * ask-first, invocación de planners/discovery/writers, decisión del checkpoint cuando el cap se
 * supera, guarda 6.5 ("¿navegó de verdad?" — aquí solo se verifica existencia/estructura del
 * fragmento) y el reporte final al QA.
 *
 * Stages (el command los invoca en orden; cada uno es UNA llamada Bash del orquestador):
 *   setup           — resolve-mode + compliance (sin override) + brief 5.b + namespace/limpieza 5.c
 *   check-fragments — verificación estructural de los fragmentos del planner (parte mecánica de 6.5)
 *   checkpoint      — cap + selección + IDs estables + tc-registry + scaffold POM (Actos 2.5 y 3)
 *   post-writers    — verify-a11y + consolidate-reviews + pre-review (pasos 11, 11.b, 11.c)
 *   verify          — skip del Judge (off), limpieza seed, `npx playwright test`, run-summary
 *
 * Exit codes: 0 = ok · 2 = block/abort (compliance) · 3 = decisión del QA pendiente (el stage
 * imprime `pending` y el orquestador pausa ask-first y re-invoca con la respuesta) · 1 = error.
 *
 * Las env-vars (QA_WORK_DIR, QA_BASE_URL…) se setean AQUÍ al spawnear hijos — el orquestador
 * nunca necesita prefijos `VAR=x cmd` (la clase de permission-denial que contaminó F2).
 */
import { execSync, type ExecSyncOptions } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

import { appendAuditEntry } from '../audit-log.ts';
import { runPreflight } from '../compliance-preflight.ts';
import { scaffold, fileNameFor, type DiscoveryScreen, type DiscoveryComponent } from '../pom-scaffolder.ts';
import { consolidateReviews } from './consolidate-reviews.ts';
import { parseFlags, resolveMode } from './resolve-mode.ts';

// ---------------------------------------------------------------------------
// Contexto común
// ---------------------------------------------------------------------------

export interface RunContext {
  stylePath: string;
  siteId: string;
  workDir: string;
  logPath: string;
  specsDir: string;
  pagesDir: string;
  componentsDir: string;
  plansDir: string;
}

export function contextFromFlags(flags: Record<string, string | undefined>): RunContext {
  const stylePath = flags['style'] || 'config/style-contracts/saucedemo.yaml';
  const siteId = basename(stylePath).replace(/\.[^.]+$/, '');
  const workDir = flags['work-dir'] || `.work/${siteId}`;
  return {
    stylePath,
    siteId,
    workDir,
    logPath: resolve(process.cwd(), workDir, 'audit-log.json'),
    specsDir: flags['output-dir'] || `tests/e2e/${siteId}`,
    pagesDir: `tests/pages/${siteId}`,
    componentsDir: `tests/components/${siteId}`,
    plansDir: `docs/test-plans/${siteId}`,
  };
}

function loadContract(stylePath: string): Record<string, any> {
  const abs = resolve(process.cwd(), stylePath);
  if (!existsSync(abs)) return {};
  return (parseYaml(readFileSync(abs, 'utf8')) as Record<string, any>) ?? {};
}

function out(payload: Record<string, unknown>): void {
  console.log(JSON.stringify(payload, null, 2));
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Spawn de un script/binario local con las env-vars del run ya puestas. */
function runChild(
  command: string,
  ctx: RunContext,
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
// Stage: setup (Acto 1 + 5.b + 5.c)
// ---------------------------------------------------------------------------

function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function stageSetup(flags: Record<string, string | undefined>): number {
  const ctx = contextFromFlags(flags);

  // 1. Módulo (misma semántica que resolve-mode.ts; audit al log del run)
  const mode = resolveMode(flags);
  if (mode.module !== 'S4' || mode.status !== 'functional') {
    out({ stage: 'setup', ...mode });
    return mode.status === 'error' ? 1 : 0;
  }

  // 2. Compliance pre-flight (SIN override — regla dura #3; el hook PreToolUse sigue de segunda barrera)
  const url = flags['url']!;
  const verdictResult = runPreflight(url, flags['config']);
  const verdict = {
    verdict: verdictResult.verdict,
    rule: verdictResult.rule ?? null,
    url: verdictResult.url,
    reason: verdictResult.reason ?? null,
    audit_logged: true,
  };
  // Misma ruta que check-compliance.ts: .work/ plano, corre antes del namespace 5.c.
  mkdirSync(resolve(process.cwd(), '.work'), { recursive: true });
  writeFileSync(resolve(process.cwd(), '.work/compliance-verdict.json'), JSON.stringify(verdict, null, 2) + '\n', 'utf8');

  if (verdict.verdict === 'block') {
    out({ stage: 'setup', compliance: verdict, next: 'abortar: target bloqueado por compliance (sin override)' });
    return 2;
  }
  if (verdict.verdict === 'warn' && !('warn-acknowledged' in flags)) {
    out({
      stage: 'setup',
      pending: 'compliance-warn',
      compliance: verdict,
      next: 'ask-first: muestra el warning al QA; si acepta, re-invoca setup con --warn-acknowledged',
    });
    return 3;
  }

  // 5.b — Brief de exploración
  const flows = csv(flags['flows']);
  const ignore = csv(flags['ignore']);
  const negatives = csv(flags['negatives']);
  const entry = flags['entry'] || url;
  const directed = flows.length > 0 || Boolean(flags['entry']) || ignore.length > 0;
  const blindAcknowledged = 'blind-acknowledged' in flags;
  if (!directed && !blindAcknowledged) {
    out({
      stage: 'setup',
      pending: 'exploration-brief',
      compliance: verdict,
      next:
        'ask-first: muestra el WARNING de modo ciego (autonomous-operations.md §1) y pide flujos. ' +
        'Respuesta con flujos → re-invoca setup con --flows=...; respuesta EXACTA "EXPLORAR SIN ACOTAR" → --blind-acknowledged.',
    });
    return 3;
  }

  // 5.c — Namespace por sitio + limpieza (NO toca el tc-registry)
  const workAbs = resolve(process.cwd(), ctx.workDir);
  mkdirSync(workAbs, { recursive: true });
  for (const entryName of readdirSync(workAbs)) {
    rmSync(join(workAbs, entryName), { recursive: true, force: true });
  }
  for (const dir of [ctx.specsDir, ctx.pagesDir, ctx.componentsDir, ctx.plansDir]) {
    mkdirSync(resolve(process.cwd(), dir), { recursive: true });
  }

  appendAuditEntry(
    {
      source: 'command',
      action: 'allow',
      rule: 'mode-router',
      reason: 'resolved S4 (functional) — run-s4-mecanico setup',
      result: 'pass',
      metadata: { module: 'S4', status: 'functional' },
    },
    ctx.logPath,
  );
  appendAuditEntry(
    {
      source: 'command',
      action: 'exploration_brief',
      target: url,
      metadata: {
        flows,
        entry,
        ignore,
        negatives_override: negatives,
        mode: directed ? 'directed' : 'blind',
        blind_acknowledged: blindAcknowledged,
      },
    },
    ctx.logPath,
  );

  out({
    stage: 'setup',
    module: 'S4',
    status: 'functional',
    compliance: verdict,
    site_id: ctx.siteId,
    work_dir: ctx.workDir,
    dirs: { specs: ctx.specsDir, pages: ctx.pagesDir, components: ctx.componentsDir, plans: ctx.plansDir },
    brief: { mode: directed ? 'directed' : 'blind', flows, entry, ignore, negatives_override: negatives, blind_acknowledged: blindAcknowledged },
    next: 'Acto 2: planner POR FLUJO secuencial (Task) + check-fragments al terminar',
  });
  return 0;
}

// ---------------------------------------------------------------------------
// Stage: check-fragments (parte mecánica de la guarda 6.5)
// ---------------------------------------------------------------------------

export interface FragmentCheck {
  flow: string;
  path: string;
  exists: boolean;
  bytes: number;
  concrete: boolean;
  problems: string[];
}

/** Evidencia mínima de discovery real: locators/URLs concretos y estructura de plan con pasos. */
export function checkFragmentSource(source: string): { concrete: boolean; problems: string[] } {
  const problems: string[] = [];
  if (source.trim().length < 400) problems.push('fragmento demasiado corto para un plan real');
  if (!/\*\*Steps?:?\*\*|^\s*\d+\.\s/m.test(source)) problems.push('sin pasos numerados ni sección Steps');
  const evidence =
    source.match(/getBy\w+|data-test|test[-_]?id\s*=|\[\w[\w-]*\s*=\s*["']|https?:\/\/[\w./-]+/gi) ?? [];
  if (evidence.length < 3) {
    problems.push(`solo ${evidence.length} señales de locators/URLs concretos (mínimo 3) — posible plan fabricado`);
  }
  return { concrete: problems.length === 0, problems };
}

function stageCheckFragments(flags: Record<string, string | undefined>): number {
  const ctx = contextFromFlags(flags);
  const flows = csv(flags['flows']);
  const explicitPlan = flags['plan'];
  const targets: Array<{ flow: string; path: string }> = explicitPlan
    ? [{ flow: basename(explicitPlan).replace(/\.plan\.md$/, ''), path: explicitPlan }]
    : flows.map((f) => ({ flow: f, path: `${ctx.plansDir}/${f}.plan.md` }));

  if (targets.length === 0) {
    console.error('[run-s4-mecanico] check-fragments: falta --flows=a,b,c o --plan=<file>');
    return 1;
  }

  const results: FragmentCheck[] = targets.map(({ flow, path }) => {
    const abs = resolve(process.cwd(), path);
    if (!existsSync(abs)) {
      return { flow, path: toPosix(path), exists: false, bytes: 0, concrete: false, problems: ['el fragmento no existe (no hubo planner_save_plan)'] };
    }
    const source = readFileSync(abs, 'utf8');
    const { concrete, problems } = checkFragmentSource(source);
    return { flow, path: toPosix(path), exists: true, bytes: statSync(abs).size, concrete, problems };
  });

  for (const r of results) {
    appendAuditEntry(
      {
        source: 'command',
        action: r.exists && r.concrete ? 'allow' : 'block',
        target: r.path,
        rule: 'planner-fragment-check',
        reason: r.exists && r.concrete ? 'estructura y evidencia de discovery real OK (guarda 6.5, parte mecánica)' : r.problems.join('; '),
        result: r.exists && r.concrete ? 'pass' : 'fail',
        metadata: { flow: r.flow },
      },
      ctx.logPath,
    );
  }

  const failed = results.filter((r) => !r.exists || !r.concrete);
  out({
    stage: 'check-fragments',
    fragments: results,
    ok: failed.length === 0,
    failed_flows: failed.map((r) => r.flow),
    next:
      failed.length === 0
        ? 'Acto 2 cont.: invoca ia4d-discovery-analyzer con el directorio de fragmentos'
        : 'guarda 6.5: reintenta UNA vez cada flujo fallido; si persiste, PAUSA ask-first (autonomous-operations.md §4)',
  });
  return failed.length === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Stage: checkpoint (Acto 2.5 + Acto 3)
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  scenario_slug: string;
  feature: string;
  condicion: string;
  nature: string;
  suite_tags: string[];
  criticality: string;
  rank: number;
  rationale?: string;
  screens?: string[];              // pantallas que pisa el escenario (Q2.4, insumo del ownership de POMs)
}

/**
 * Q2.4 — ownership de POMs compartidos: cada fichero POM pertenece al PRIMER escenario
 * seleccionado (en orden de selección) que pisa esa pantalla; el resto lo usa read-only
 * (mitiga la race de dos Writers paralelos editando el mismo POM — hallazgo Q1, trigger del
 * approved iter-0 2/5 y de los verdicts inconsistentes inter-Reviewer). BasePage y components
 * no tienen dueño: read-only para todos. Si algún escenario seleccionado no trae `screens`
 * (discovery-analyzer antiguo) → sin ownership (null): degradación al comportamiento previo.
 * Serializar Writers como alternativa queda PROHIBIDO (mata el paralelismo del wall-clock).
 */
export function computePomOwnership(
  selected: Array<{ key: string; screens?: string[] }>,
  pagesDir: string,
): { ownership: Record<string, string>; ownedBy: Map<string, string[]> } | null {
  if (selected.some((s) => !Array.isArray(s.screens))) return null;
  const ownership: Record<string, string> = {};
  const ownedBy = new Map<string, string[]>(selected.map((s) => [s.key, []]));
  for (const entry of selected) {
    for (const screen of entry.screens!) {
      const pomPath = `${pagesDir}/${fileNameFor(screen, 'page')}`.replace(/\\/g, '/');
      if (!ownership[pomPath]) {
        ownership[pomPath] = entry.key;
        ownedBy.get(entry.key)!.push(pomPath);
      }
    }
  }
  return { ownership, ownedBy };
}

export interface SelectionPick {
  num: number;
  tags?: string[];
}

/** Parsea la respuesta del checkpoint: TOP | TODOS | lista de # con ediciones de tags (`3:@a,@b`). */
export function parseSelection(
  input: string,
  total: number,
  cap: number,
): { mode: 'checkpoint' | 'all-acknowledged'; picks: SelectionPick[] } {
  const trimmed = input.trim();
  if (/^top$/i.test(trimmed)) {
    return { mode: 'checkpoint', picks: Array.from({ length: Math.min(cap, total) }, (_, i) => ({ num: i + 1 })) };
  }
  if (/^todos$/i.test(trimmed)) {
    return { mode: 'all-acknowledged', picks: Array.from({ length: total }, (_, i) => ({ num: i + 1 })) };
  }
  const picks: SelectionPick[] = [];
  const seen = new Set<number>();
  for (const part of trimmed.split(',').map((s) => s.trim()).filter(Boolean)) {
    // Las ediciones de tags llevan comas dentro: re-ensambla `3:@a` + `@b` sobre el pick previo
    if (part.startsWith('@')) {
      const prev = picks[picks.length - 1];
      if (!prev?.tags) throw new Error(`selección ambigua: '${part}' sin un # previo con ':' al que pertenecer`);
      prev.tags.push(part);
      continue;
    }
    const m = /^(\d+)(?::(.+))?$/.exec(part);
    if (!m) throw new Error(`selección ambigua: token '${part}' no es un # de escenario`);
    const num = Number(m[1]);
    if (num < 1 || num > total) throw new Error(`# fuera de rango: ${num} (catálogo de ${total})`);
    if (seen.has(num)) throw new Error(`# duplicado: ${num}`);
    seen.add(num);
    picks.push({ num, ...(m[2] ? { tags: m[2].split(',').map((t) => t.trim()).filter(Boolean) } : {}) });
  }
  if (picks.length === 0) throw new Error('selección vacía');
  return { mode: 'checkpoint', picks };
}

/** IDs estables: reusa por slug; nuevo → siguiente `<prefix>-NNN` libre (max+1, 3 dígitos). */
export function assignIds(
  slugs: string[],
  registry: Record<string, string>,
  prefix: string,
): { ids: Record<string, string>; registry: Record<string, string>; assigned: string[]; reused: string[] } {
  const updated = { ...registry };
  const ids: Record<string, string> = {};
  const assigned: string[] = [];
  const reused: string[] = [];
  const numPattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const id of Object.values(updated)) {
    const m = numPattern.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  for (const slug of slugs) {
    if (updated[slug]) {
      ids[slug] = updated[slug];
      reused.push(slug);
      continue;
    }
    max += 1;
    const id = `${prefix}-${String(max).padStart(3, '0')}`;
    updated[slug] = id;
    ids[slug] = id;
    assigned.push(slug);
  }
  return { ids, registry: updated, assigned, reused };
}

export function specPathFor(
  entry: { feature: string; condicion: string },
  id: string | null,
  pattern: string,
  outputDir: string,
): string {
  let p = pattern;
  if (id === null) p = p.replace(/\{id\}[_-]?/, '');
  const fileName = p
    .replace('{id}', id ?? '')
    .replace('{feature}', entry.feature)
    .replace('{condicion}', entry.condicion);
  return toPosix(join(outputDir, fileName));
}

export function renderCheckpointTable(
  rows: Array<CatalogEntry & { num: number; current_id: string | null }>,
  cap: number,
): string {
  const lines = [
    `El descubrimiento devolvió ${rows.length} escenarios; el cap es ${cap}. Selecciona cuáles materializar.`,
    '',
    '#     ID            Escenario (slug)                          Naturaleza  Tags                    Rank  Crit.',
  ];
  for (const r of rows) {
    lines.push(
      [
        String(r.num).padEnd(5),
        (r.current_id ?? 'nuevo').padEnd(13),
        r.scenario_slug.padEnd(41),
        r.nature.padEnd(11),
        r.suite_tags.join(' ').padEnd(23),
        String(r.rank).padEnd(5),
        r.criticality,
      ].join(' '),
    );
  }
  lines.push(
    '',
    `Selecciona por # (ej. \`1,2,3\`, tags editables \`3:@regression,@negative\`), \`TOP\` para los ${cap} de mayor rank, o \`TODOS\` para ignorar el cap bajo tu responsabilidad.`,
  );
  return lines.join('\n');
}

function stageCheckpoint(flags: Record<string, string | undefined>): number {
  const ctx = contextFromFlags(flags);
  const contract = loadContract(ctx.stylePath);
  const cap = Number(flags['max-scenarios'] ?? 8);

  // Q2.1 — guarda determinística de locators: anota el discovery contra el DOM real ANTES del
  // scaffold (una pasada de navegador sin LLM, una vez por run — la re-invocación tras la pausa
  // de selección no re-verifica). Sin --url o si falla → sigue sin anotaciones (estado legacy).
  const locatorVerifyPath = resolve(process.cwd(), ctx.workDir, 'locator-verify.json');
  if (flags['url'] && !existsSync(locatorVerifyPath)) {
    const v = runChild(
      `npx --no-install tsx src/scripts/verify-locators.ts --report=${ctx.workDir}/discovery-report.json --url=${flags['url']} --style-contract=${ctx.stylePath}`,
      ctx,
    );
    if (v.status !== 0) {
      console.error('[run-s4-mecanico] checkpoint: verify-locators falló — continúo sin anotaciones (estado legacy)');
    }
  }
  const locatorVerify = readJson<{ session_bootstrap: string; totals: Record<string, number> }>(locatorVerifyPath);

  const discovery = readJson<{ scenarios_catalog: CatalogEntry[]; screens: DiscoveryScreen[]; components?: DiscoveryComponent[] }>(
    resolve(process.cwd(), ctx.workDir, 'discovery-report.json'),
  );
  if (!discovery?.scenarios_catalog?.length) {
    console.error(`[run-s4-mecanico] checkpoint: sin scenarios_catalog en ${ctx.workDir}/discovery-report.json`);
    return 1;
  }

  const registryEnabled = contract.tc_registry?.enabled !== false;
  const registryPath = resolve(process.cwd(), contract.tc_registry?.path || `config/tc-registry/${ctx.siteId}.json`);
  const idPrefix: string = contract.tc_registry?.id_prefix || 'TC';
  const registry = readJson<Record<string, string>>(registryPath) ?? {};

  const catalog = [...discovery.scenarios_catalog].sort((a, b) => a.rank - b.rank);
  const rows = catalog.map((s, i) => ({ ...s, num: i + 1, current_id: registry[s.scenario_slug] ?? null }));

  let mode: 'auto-under-cap' | 'checkpoint' | 'all-acknowledged';
  let picks: SelectionPick[];
  if (!flags['select']) {
    if (rows.length > cap) {
      out({
        stage: 'checkpoint',
        pending: 'checkpoint-selection',
        total: rows.length,
        cap,
        table: renderCheckpointTable(rows, cap),
        next: 'ask-first: muestra la tabla al QA tal cual y re-invoca checkpoint con --select=<respuesta>. Ambiguo o silencio → no generes.',
      });
      return 3;
    }
    mode = 'auto-under-cap';
    picks = rows.map((r) => ({ num: r.num }));
  } else {
    try {
      const parsed = parseSelection(flags['select']!, rows.length, cap);
      mode = parsed.mode;
      picks = parsed.picks;
    } catch (err) {
      console.error(`[run-s4-mecanico] checkpoint: ${err instanceof Error ? err.message : err} — no se genera nada`);
      return 1;
    }
  }

  const chosen = picks.map((p) => ({ row: rows[p.num - 1], tags: p.tags }));
  const { ids, registry: updatedRegistry, assigned, reused } = assignIds(
    chosen.map((c) => c.row.scenario_slug),
    registry,
    idPrefix,
  );
  if (registryEnabled) {
    mkdirSync(resolve(registryPath, '..'), { recursive: true });
    writeFileSync(registryPath, JSON.stringify(updatedRegistry, null, 2) + '\n', 'utf8');
  }

  const pattern: string = contract.naming?.spec_pattern || '{id}_{feature}.{condicion}.spec.ts';
  const selected = chosen.map(({ row, tags }) => ({
    num: row.num,
    tc_id: registryEnabled ? ids[row.scenario_slug] : null,
    scenario_slug: row.scenario_slug,
    feature: row.feature,
    condicion: row.condicion,
    nature: row.nature,
    suite_tags: tags ?? row.suite_tags,
    rank: row.rank,
    criticality: row.criticality,
    spec_path: specPathFor(row, registryEnabled ? ids[row.scenario_slug] : null, pattern, ctx.specsDir),
    screens: row.screens,
  }));

  // Q2.4 — ownership de POMs por escenario (clave: scenario_slug)
  const pomOwnership = computePomOwnership(
    selected.map((s) => ({ key: s.scenario_slug, screens: s.screens })),
    ctx.pagesDir,
  );
  const selectedWithPoms = selected.map((s) => ({
    ...s,
    owned_poms: pomOwnership ? pomOwnership.ownedBy.get(s.scenario_slug)! : null,
  }));

  const selection = {
    total: rows.length,
    cap,
    mode,
    dropped: rows.filter((r) => !picks.some((p) => p.num === r.num)).map((r) => r.scenario_slug),
    pom_ownership: pomOwnership ? pomOwnership.ownership : null,
    selected: selectedWithPoms,
  };
  writeFileSync(resolve(process.cwd(), ctx.workDir, 'selection.json'), JSON.stringify(selection, null, 2) + '\n', 'utf8');

  appendAuditEntry(
    {
      source: 'command',
      action: 'scenario_selection',
      result: 'pass',
      metadata: { total: rows.length, cap, selected: selected.length, mode, dropped: selection.dropped },
    },
    ctx.logPath,
  );
  if (registryEnabled) {
    appendAuditEntry(
      {
        source: 'command',
        action: 'write_file',
        target: toPosix(contract.tc_registry?.path || `config/tc-registry/${ctx.siteId}.json`),
        rule: 'tc-registry',
        reason: `IDs estables: ${reused.length} reusados, ${assigned.length} nuevos (${idPrefix}-NNN correlativo)`,
        metadata: { assigned, reused },
      },
      ctx.logPath,
    );
  }

  // Acto 3 — scaffold POM determinístico (mismo motor que scaffold-poms.ts + toggles del contract)
  const scaffoldResult = scaffold(discovery.screens, {
    outputDir: resolve(process.cwd(), ctx.pagesDir),
    componentsDir: resolve(process.cwd(), ctx.componentsDir),
    basePage: contract.pom?.base_page !== false,
    components: contract.pom?.components !== false ? discovery.components : undefined,
  });

  out({
    stage: 'checkpoint',
    locator_verification: locatorVerify
      ? { session_bootstrap: locatorVerify.session_bootstrap, totals: locatorVerify.totals }
      : 'skipped (sin --url o verify-locators falló)',
    selection,
    scaffold: scaffoldResult.files.map((f) => ({ className: f.className, path: toPosix(f.path) })),
    next:
      'Acto 4: (auth.enabled → Writer del auth.setup primero) un ia4d-writer por escenario seleccionado — escalonados ' +
      '(primero UNO, el resto en paralelo), SIEMPRE FOREGROUND (nunca background). Prompts con rutas (spec_path, plan del ' +
      'flujo, discovery-report, contract, POM dir) + --owned-poms=<owned_poms del escenario> si pom_ownership no es null. ' +
      'Nunca payload inline. Después: post-writers.',
  });
  return 0;
}

// ---------------------------------------------------------------------------
// Stage: post-writers (pasos 11 + 11.b + 11.c)
// ---------------------------------------------------------------------------

export interface SpecReviewSummary {
  spec: string;
  verdict: string;
  iterations: number;
  must_fix: number;
  should_fix: number;
}

/** Resume el review-feedback.json consolidado (JSON-lines): última iteración por spec. */
export function summarizeReviews(consolidated: string): SpecReviewSummary[] {
  const bySpec = new Map<string, { iteration: number; verdict: string; must: number; should: number }>();
  for (const line of consolidated.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    let obj: any;
    try {
      obj = JSON.parse(s);
    } catch {
      continue;
    }
    const spec = toPosix(String(obj.test_file ?? obj.spec ?? ''));
    if (!spec) continue;
    const iteration = Number(obj.iteration ?? 0);
    const prev = bySpec.get(spec);
    if (prev && prev.iteration >= iteration) continue;
    const feedback: any[] = Array.isArray(obj.feedback) ? obj.feedback : [];
    bySpec.set(spec, {
      iteration,
      verdict: String(obj.verdict ?? 'unknown'),
      must: feedback.filter((f) => f?.severity === 'must-fix').length,
      should: feedback.filter((f) => f?.severity === 'should-fix').length,
    });
  }
  return [...bySpec.entries()]
    .map(([spec, v]) => ({ spec, verdict: v.verdict, iterations: v.iteration, must_fix: v.must, should_fix: v.should }))
    .sort((a, b) => a.spec.localeCompare(b.spec));
}

function stagePostWriters(flags: Record<string, string | undefined>): number {
  const ctx = contextFromFlags(flags);

  // 11 — a11y determinística (verify-a11y.ts registra su propio audit; exit 1 = specs a rescatar)
  const a11y = runChild(
    `npx --no-install tsx src/scripts/verify-a11y.ts ${ctx.specsDir} --style-contract=${ctx.stylePath}`,
    ctx,
  );
  let a11yJson: any = null;
  try {
    a11yJson = JSON.parse(a11y.stdout);
  } catch {
    console.error('[run-s4-mecanico] post-writers: verify-a11y no devolvió JSON parseable');
    return 1;
  }
  writeFileSync(resolve(process.cwd(), ctx.workDir, 'a11y-verify.json'), JSON.stringify(a11yJson, null, 2) + '\n', 'utf8');

  // 11.b — consolidación anti-race del feedback per-spec
  const reviews = consolidateReviews(resolve(process.cwd(), ctx.workDir));
  const reviewSummary = summarizeReviews(
    existsSync(reviews.output) ? readFileSync(reviews.output, 'utf8') : '',
  );

  // 11.c — pre-review determinístico (red objetiva post-review; informa, no bloquea)
  const pre = runChild(
    `npx --no-install tsx src/scripts/pre-review.ts ${ctx.specsDir} --style-contract=${ctx.stylePath} --out-dir=${ctx.workDir}/pre-review`,
    ctx,
  );
  let preJson: any = null;
  try {
    preJson = JSON.parse(pre.stdout);
  } catch {
    console.error('[run-s4-mecanico] post-writers: pre-review no devolvió JSON parseable');
    return 1;
  }

  const a11yOk = a11y.status === 0;
  out({
    stage: 'post-writers',
    a11y: {
      ok: a11yOk,
      gate_mode: a11yJson.gate_mode,
      specs_total: a11yJson.specs_total,
      specs_ok: a11yJson.specs_ok,
      failed_specs: a11yJson.failed_specs,
    },
    reviews: { consolidated: reviewSummary.length, corrupt: reviews.corrupt, specs: reviewSummary },
    pre_review: preJson,
    next: a11yOk
      ? 'Acto 5: (QA_ENABLE_JUDGE → ia4d-judge por spec antes) invoca verify.'
      : 'rescate: invoca ia4d-a11y-injector SOLO por spec de failed_specs y re-invoca post-writers.',
  });
  return a11yOk ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Stage: verify (Acto 5 mecánico + Verification step + run-summary)
// ---------------------------------------------------------------------------

export interface TestOutcome {
  file: string;
  title: string;
  status: string;
  message: string | null;
  project: string;
}

/** Aplana el árbol de suites del reporter JSON de Playwright a un resultado por test. */
export function parsePlaywrightResults(root: any): TestOutcome[] {
  const outcomes: TestOutcome[] = [];
  const walk = (suite: any): void => {
    for (const child of suite.suites ?? []) walk(child);
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = (t.results ?? []).at(-1) ?? {};
        const message: string | null = last.error?.message
          ? String(last.error.message).replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0]
          : null;
        outcomes.push({
          file: toPosix(String(spec.file ?? suite.file ?? '')),
          title: String(spec.title ?? ''),
          status: String(last.status ?? (spec.ok ? 'passed' : 'failed')),
          message,
          project: String(t.projectName ?? ''),
        });
      }
    }
  };
  for (const s of root?.suites ?? []) walk(s);
  return outcomes;
}

function judgeEnabled(): boolean {
  return ['1', 'true', 'on'].includes((process.env.QA_ENABLE_JUDGE ?? '').toLowerCase());
}

function normalizeEvidence(v: unknown): string | null {
  if (v === true) return 'on';
  if (v === false) return 'off';
  return typeof v === 'string' && v ? v : null;
}

function stageVerify(flags: Record<string, string | undefined>): number {
  const ctx = contextFromFlags(flags);
  const contract = loadContract(ctx.stylePath);
  const url = flags['url'];
  if (!url) {
    console.error('[run-s4-mecanico] verify: falta --url (QA_BASE_URL es obligatoria: los POM usan goto relativo)');
    return 1;
  }

  const selection = readJson<{ total: number; cap: number; selected: any[] }>(
    resolve(process.cwd(), ctx.workDir, 'selection.json'),
  );
  if (!selection) {
    console.error(`[run-s4-mecanico] verify: sin ${ctx.workDir}/selection.json — corre checkpoint primero`);
    return 1;
  }

  // Acto 5 — Judge off por defecto; su omisión se registra (regla dura #8/#10)
  let judge: unknown = 'skipped';
  if (!judgeEnabled()) {
    appendAuditEntry(
      { source: 'command', action: 'skip', rule: 'judge', reason: 'judge off (QA_ENABLE_JUDGE unset)' },
      ctx.logPath,
    );
  } else {
    judge = readJson(resolve(process.cwd(), ctx.workDir, 'judge-report.json')) ?? 'enabled-no-report';
  }

  // Verification 1 — seed.spec.ts fuera (test vacío siempre-verde; §3 de autonomous-operations)
  const seed = resolve(process.cwd(), ctx.specsDir, 'seed.spec.ts');
  const seedDeleted = existsSync(seed);
  if (seedDeleted) rmSync(seed);

  // Verification 2-3 — env-vars + npx playwright test (evidence.level decide reporters)
  const level = String(contract.evidence?.level ?? 'minimal');
  const resultsPath = `${ctx.workDir}/playwright-results.json`;
  const env: Record<string, string> = {
    QA_BASE_URL: url,
    PLAYWRIGHT_JSON_OUTPUT_NAME: resultsPath,
  };
  if (level === 'full') {
    env.QA_SCREENSHOT = 'on';
    env.QA_TRACE = 'on';
  } else {
    const shots = normalizeEvidence(contract.evidence?.screenshots);
    if (shots && shots !== 'only-on-failure') env.QA_SCREENSHOT = shots;
  }
  if (contract.auth?.enabled && contract.auth?.storage_state) {
    env.QA_STORAGE_STATE = String(contract.auth.storage_state);
  }
  // full → reporters del config (allure incluido); resto → list + json explícitos
  const reporterFlag = level === 'full' ? '' : ' --reporter=list,json';
  const run = runChild(`npx --no-install playwright test ${toPosix(ctx.specsDir)}/${reporterFlag}`, ctx, env);

  const results = readJson<any>(resolve(process.cwd(), resultsPath));
  if (!results) {
    console.error(`[run-s4-mecanico] verify: sin ${resultsPath} — el run de Playwright no llegó a reportar (exit ${run.status})`);
    console.error(run.stdout.slice(-2000));
    return 1;
  }
  const outcomes = parsePlaywrightResults(results).filter((o) => o.project !== 'setup');

  // run-summary — ensamblado 100% desde artefactos del run
  const reviewsFile = resolve(process.cwd(), ctx.workDir, 'review-feedback.json');
  const reviewSummary = summarizeReviews(existsSync(reviewsFile) ? readFileSync(reviewsFile, 'utf8') : '');
  const a11yJson = readJson<any>(resolve(process.cwd(), ctx.workDir, 'a11y-verify.json'));
  const preDir = resolve(process.cwd(), ctx.workDir, 'pre-review');
  const preResults = existsSync(preDir)
    ? readdirSync(preDir).filter((f) => f.endsWith('.json')).map((f) => readJson<any>(join(preDir, f))).filter(Boolean)
    : [];

  const testsGenerated = selection.selected.map((s: any) => {
    const specPosix = toPosix(String(s.spec_path));
    const specBase = basename(specPosix);
    const review = reviewSummary.find((r) => basename(r.spec) === specBase);
    const a11ySpec = a11yJson?.results?.find((r: any) => basename(String(r.file)) === specBase);
    const outcome = outcomes.filter((o) => basename(o.file) === specBase);
    const failed = outcome.filter((o) => o.status !== 'passed');
    return {
      tc_id: s.tc_id,
      spec: specPosix,
      tags: s.suite_tags,
      reviewer_verdict: review?.verdict ?? 'unknown',
      iterations: review?.iterations ?? 0,
      must_fix: review?.must_fix ?? 0,
      should_fix: review?.should_fix ?? 0,
      axe: a11ySpec ? (a11ySpec.ok ? `${a11ySpec.gate_mode}-mode scan ok` : 'scan AUSENTE') : 'sin verificación',
      run_result: outcome.length === 0 ? 'not-run' : failed.length === 0 ? 'passed' : 'failed',
      ...(failed.length > 0 ? { failure: failed.map((f) => `${f.title}: ${f.message ?? 'sin mensaje'}`).join(' | ') } : {}),
    };
  });

  const runSummary = {
    module: 'S4',
    run: flags['run-label'] ?? `autonomous ${new Date().toISOString()}`,
    target_url: url,
    scenarios_total: selection.total,
    scenarios_selected: selection.selected.length,
    judge,
    pre_review: {
      specs: preResults.filter((p: any) => !p.skipped).length,
      clean: preResults.filter((p: any) => !p.skipped && p.clean).length,
      must_fix: preResults.reduce((n: number, p: any) => n + (p.must_fix ?? 0), 0),
    },
    tests_generated: testsGenerated,
  };
  const summaryPath = resolve(process.cwd(), ctx.workDir, 'qa-automator-run-summary.json');
  writeFileSync(summaryPath, JSON.stringify(runSummary, null, 2) + '\n', 'utf8');

  const passed = testsGenerated.filter((t) => t.run_result === 'passed').length;
  out({
    stage: 'verify',
    seed_deleted: seedDeleted,
    evidence_level: level,
    playwright_exit: run.status,
    passed,
    failed: testsGenerated.filter((t) => t.run_result !== 'passed').map((t) => ({ spec: t.spec, run_result: t.run_result, failure: (t as any).failure ?? null })),
    pre_review_must_fix: runSummary.pre_review.must_fix,
    summary_path: toPosix(`${ctx.workDir}/qa-automator-run-summary.json`),
    run_summary: runSummary,
    next: 'reporta al QA: verdes/rojos + must-fix del pre-review si los hay. Rojos → decide el QA (Healer o ajuste manual).',
  });
  return 0;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(): void {
  const stage = process.argv[2];
  // parseFlags (resolve-mode) solo entiende --k=v; los booleanos (--blind-acknowledged) se normalizan
  const argv = process.argv.slice(3).map((a) => (/^--[a-z-]+$/.test(a) ? `${a}=true` : a));
  const flags = parseFlags(argv);
  switch (stage) {
    case 'setup':
      process.exit(stageSetup(flags));
      break;
    case 'check-fragments':
      process.exit(stageCheckFragments(flags));
      break;
    case 'checkpoint':
      process.exit(stageCheckpoint(flags));
      break;
    case 'post-writers':
      process.exit(stagePostWriters(flags));
      break;
    case 'verify':
      process.exit(stageVerify(flags));
      break;
    default:
      console.error(
        '[run-s4-mecanico] uso: tsx src/scripts/run-s4-mecanico.ts <setup|check-fragments|checkpoint|post-writers|verify> [--flags]',
      );
      process.exit(1);
  }
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('run-s4-mecanico.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
