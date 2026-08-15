/**
 * walk-scoreboard — el MARCADOR de peldaños (K0.27a, paso 1 del plan de escala).
 *
 * Agrega los artefactos de uno o más runs del walker (`walk-state.json` +
 * `audit-log.json` por directorio de trabajo) y produce la tabla que convierte
 * un run en un dato comparable: pasos por desenlace, distribución por peldaño
 * de resolución (`resolved_via`, K0.27a), asistencias, alias-hits y rescates.
 * Sin esto, la gira de stacks produce anécdotas; con esto, produce una serie.
 *
 * Determinístico, $0, sin dependencias. Uso:
 *   tsx copilot/src/walk-scoreboard.ts [dirs...] [--work-root=.work] [--json]
 * Sin dirs explícitos, barre los hijos directos de --work-root que tengan
 * walk-state.json.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

import type { StepReport, WalkState } from './walk-types.ts';

/** Peldaños del marcador, en el orden de la escalera. */
export type Rung =
  | 'manual'
  | 'testid'
  | 'role'
  | 'label'
  | 'placeholder'
  | 'texto'
  | 'texto-normalizado'
  | 'anchored'
  | 'alias'
  | 'css'
  | 'sin-via';

/**
 * Clasifica la cadena `resolved_via` en su peldaño. El prefijo de frame
 * (`framePath >> ...`) se descarta: clasifica el último eslabón, que es el
 * que localizó el elemento.
 */
export function classifyVia(via: string | undefined): Rung {
  if (!via) return 'sin-via';
  const last = via.split('>>').pop()!.trim();
  if (last.startsWith('✎') || last.includes('manual')) return 'manual';
  if (last.includes('anchored(')) return 'anchored';
  if (last.startsWith('getByTestId')) return 'testid';
  if (last.startsWith('getByRole')) return 'role';
  if (last.startsWith('getByLabel')) return 'label';
  if (last.startsWith('getByPlaceholder')) return 'placeholder';
  if (last.startsWith('getByText(/')) return 'texto-normalizado';
  if (last.startsWith('getByText')) return 'texto';
  if (last.startsWith('css=')) return 'css';
  return 'sin-via';
}

interface AuditEntry {
  reason?: string;
  metadata?: { phase?: string };
}

export interface RunScore {
  dir: string;
  site_id: string;
  pasos: number;
  ok: number;
  ok_after_retry: number;
  settle_timeout: number;
  postcondition_unmet: number;
  action_failed: number;
  plantas: number; // open_questions
  asistencias: number; // paneles solicitados (audit phase 'assist')
  alias_hits: number; // audit phase 'alias'
  rescates_resueltos: number;
  rescates_nulos: number;
  drift_select: number; // audit 'select drift tolerado'
  peldanos: Record<Rung, number>;
}

function emptyRungs(): Record<Rung, number> {
  return {
    manual: 0, testid: 0, role: 0, label: 0, placeholder: 0,
    texto: 0, 'texto-normalizado': 0, anchored: 0, alias: 0, css: 0, 'sin-via': 0,
  };
}

/** Lee un JSONL tolerante: líneas corruptas se ignoran (el audit es append-only). */
function readAuditLog(path: string): AuditEntry[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try { return JSON.parse(l) as AuditEntry; } catch { return null; }
    })
    .filter((e): e is AuditEntry => e !== null);
}

export function scoreRun(workDir: string): RunScore | null {
  // Un run TERMINADO consolida el estado en dom-map.json (y borra walk-state);
  // uno interrumpido deja walk-state.json. El marcador lee el que exista —
  // dom-map primero, que es el definitivo.
  let state: (WalkState & { site_id?: string }) | null = null;
  for (const name of ['dom-map.json', 'walk-state.json']) {
    const p = join(workDir, name);
    if (!existsSync(p)) continue;
    try {
      state = JSON.parse(readFileSync(p, 'utf8'));
      break;
    } catch { /* corrupto: prueba el siguiente */ }
  }
  if (!state) return null;
  const siteId = state.site_id;
  const audit = readAuditLog(join(workDir, 'audit-log.json'));
  const reports: StepReport[] = state.step_reports ?? [];
  // __entry es plomería (goto de arranque), no un paso del guion.
  const steps = reports.filter((r) => r.step !== '__entry');

  const score: RunScore = {
    dir: basename(workDir),
    site_id: siteId ?? '?',
    pasos: steps.length,
    ok: 0, ok_after_retry: 0, settle_timeout: 0, postcondition_unmet: 0, action_failed: 0,
    plantas: (state.open_questions ?? []).length,
    asistencias: 0, alias_hits: 0,
    rescates_resueltos: (state.rescues ?? []).filter((r) => r.resolved).length,
    rescates_nulos: (state.rescues ?? []).filter((r) => !r.resolved).length,
    drift_select: 0,
    peldanos: emptyRungs(),
  };

  for (const r of steps) {
    if (r.outcome in score) (score as unknown as Record<string, number>)[r.outcome] += 1;
    score.peldanos[classifyVia(r.resolved_via)] += 1;
  }
  for (const e of audit) {
    const phase = e.metadata?.phase ?? '';
    if (phase === 'assist' && (e.reason ?? '').startsWith('asistencia solicitada')) score.asistencias += 1;
    if (phase === 'alias' && (e.reason ?? '').startsWith('alias-hit')) score.alias_hits += 1;
    if (phase === 'select-normalizado') score.drift_select += 1;
  }
  return score;
}

const RUNGS: Rung[] = [
  'testid', 'role', 'label', 'placeholder', 'texto', 'texto-normalizado',
  'anchored', 'alias', 'manual', 'css', 'sin-via',
];

export function renderTable(scores: RunScore[]): string {
  const lines: string[] = [];
  const header = [
    'run', 'site', 'pasos', 'ok', 'retry', 'settle_to', 'postcond', 'act_fail',
    'plantas', 'asist', 'alias', 'resc±', 'driftSel',
  ];
  const rows = scores.map((s) => [
    s.dir, s.site_id, String(s.pasos), String(s.ok), String(s.ok_after_retry),
    String(s.settle_timeout), String(s.postcondition_unmet), String(s.action_failed),
    String(s.plantas), String(s.asistencias), String(s.alias_hits),
    `${s.rescates_resueltos}/${s.rescates_nulos}`, String(s.drift_select),
  ]);
  const total: RunScore = scores.reduce((acc, s) => ({
    ...acc,
    pasos: acc.pasos + s.pasos, ok: acc.ok + s.ok, ok_after_retry: acc.ok_after_retry + s.ok_after_retry,
    settle_timeout: acc.settle_timeout + s.settle_timeout,
    postcondition_unmet: acc.postcondition_unmet + s.postcondition_unmet,
    action_failed: acc.action_failed + s.action_failed, plantas: acc.plantas + s.plantas,
    asistencias: acc.asistencias + s.asistencias, alias_hits: acc.alias_hits + s.alias_hits,
    rescates_resueltos: acc.rescates_resueltos + s.rescates_resueltos,
    rescates_nulos: acc.rescates_nulos + s.rescates_nulos, drift_select: acc.drift_select + s.drift_select,
    peldanos: Object.fromEntries(RUNGS.map((k) => [k, acc.peldanos[k] + s.peldanos[k]])) as Record<Rung, number>,
  }), { ...scores[0], dir: 'TOTAL', site_id: '', pasos: 0, ok: 0, ok_after_retry: 0, settle_timeout: 0, postcondition_unmet: 0, action_failed: 0, plantas: 0, asistencias: 0, alias_hits: 0, rescates_resueltos: 0, rescates_nulos: 0, drift_select: 0, peldanos: emptyRungs() });
  if (scores.length > 1) rows.push([
    total.dir, '', String(total.pasos), String(total.ok), String(total.ok_after_retry),
    String(total.settle_timeout), String(total.postcondition_unmet), String(total.action_failed),
    String(total.plantas), String(total.asistencias), String(total.alias_hits),
    `${total.rescates_resueltos}/${total.rescates_nulos}`, String(total.drift_select),
  ]);

  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (cells: string[]): string => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  lines.push(fmt(header));
  lines.push(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) lines.push(fmt(r));

  lines.push('');
  lines.push('peldaños de resolución (pasos con hint):');
  const src = scores.length > 1 ? total : scores[0];
  const conVia = RUNGS.filter((k) => k !== 'sin-via').reduce((n, k) => n + src.peldanos[k], 0);
  for (const k of RUNGS) {
    if (k === 'sin-via') continue; // tiene su línea fija abajo, con explicación
    const n = src.peldanos[k];
    if (n === 0) continue;
    const pct = conVia > 0 ? ` (${Math.round((n / conVia) * 100)}%)` : '';
    lines.push(`  ${k.padEnd(18)} ${String(n).padStart(3)}${pct}`);
  }
  lines.push(`  ${'—'.padEnd(18)} ${String(src.peldanos['sin-via']).padStart(3)}  (sin resolved_via: pasos sin hint o runs previos a K0.27a)`);
  return lines.join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  const workRoot = args.find((a) => a.startsWith('--work-root='))?.slice('--work-root='.length) ?? '.work';
  const asJson = args.includes('--json');
  const explicit = args.filter((a) => !a.startsWith('--'));

  const dirs = explicit.length > 0
    ? explicit.map((d) => resolve(d))
    : (existsSync(workRoot)
        ? readdirSync(workRoot)
            .map((d) => resolve(workRoot, d))
            .filter((d) => statSync(d).isDirectory())
        : []);

  const scores = dirs.map(scoreRun).filter((s): s is RunScore => s !== null);
  if (scores.length === 0) {
    console.error(`[walk-scoreboard] ningún walk-state.json bajo ${explicit.length ? explicit.join(', ') : workRoot}`);
    process.exit(1);
  }
  if (asJson) console.log(JSON.stringify(scores, null, 2));
  else console.log(renderTable(scores));
}

const invoked = (process.argv[1] ?? '').replace(/\\/g, '/');
if (invoked.endsWith('walk-scoreboard.ts')) main();
