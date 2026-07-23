import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

export type AuditSource =
  | 'pre-flight'
  | 'pii-post'
  | 'audit-write'
  | 'command'
  | 'subagent';

export type AuditAction =
  | 'invoke'
  | 'block'
  | 'warn'
  | 'allow'
  | 'skip'
  | 'exploration_brief'
  | 'scenario_selection'
  | 'write_file'
  | 'edit_file'
  | 'read_file'
  | 'archive_file'
  | 'judge_decision'
  | 'review_decision'
  | 'llm_call';

export type AuditResult =
  | 'pass'
  | 'fail'
  | 'exit_0'
  | 'exit_2'
  | 'iteration_1'
  | 'iteration_2'
  | 'iteration_2_exhausted';

export interface AuditLogEntry {
  timestamp: string;
  source: AuditSource;
  action: AuditAction;
  target?: string;
  rule?: string;
  reason?: string;
  result?: AuditResult;
  metadata?: Record<string, unknown>;
}

// Work dir por-sitio (v0.2): QA_WORK_DIR='.work/<site-id>' aísla el audit-log por sitio.
// Sin la var → '.work' (comportamiento previo). Los tests pasan logPath explícito → no se afectan.
function defaultLogPath(): string {
  return resolve(process.cwd(), `${process.env.QA_WORK_DIR || '.work'}/audit-log.json`);
}

/**
 * Normalización defensiva de la ruta del log (Q2, hallazgo Q1): un caller LLM que interpola
 * la ruta en un string JS/shell puede perder los backslashes ('.work\saucedemo\audit-log.json'
 * → '.worksaucedemoaudit-log.json') y appendFileSync crearía un fichero basura en la raíz.
 * Regla: la ruta debe terminar en el segmento literal 'audit-log.json'; si no, la escritura
 * cae al log default del run y la entrada conserva la ruta inválida en metadata.
 */
export function sanitizeLogPath(logPath: string): { path: string; repairedFrom?: string } {
  const resolved = resolve(process.cwd(), logPath.replace(/\\/g, '/'));
  if (basename(resolved) === 'audit-log.json') return { path: resolved };
  return { path: defaultLogPath(), repairedFrom: logPath };
}

export function appendAuditEntry(
  entry: Omit<AuditLogEntry, 'timestamp'> & { timestamp?: string },
  logPath: string = defaultLogPath(),
): AuditLogEntry {
  const { path, repairedFrom } = sanitizeLogPath(logPath);
  const metadata =
    entry.metadata || repairedFrom
      ? { ...(entry.metadata ?? {}), ...(repairedFrom ? { invalid_log_path: repairedFrom } : {}) }
      : undefined;
  const full: AuditLogEntry = {
    timestamp: entry.timestamp ?? new Date().toISOString(),
    source: entry.source,
    action: entry.action,
    ...(entry.target ? { target: entry.target.replace(/\\/g, '/') } : {}),
    ...(entry.rule ? { rule: entry.rule } : {}),
    ...(entry.reason ? { reason: entry.reason } : {}),
    ...(entry.result ? { result: entry.result } : {}),
    ...(metadata ? { metadata } : {}),
  };

  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  appendFileSync(path, JSON.stringify(full) + '\n', { encoding: 'utf8' });
  return full;
}
