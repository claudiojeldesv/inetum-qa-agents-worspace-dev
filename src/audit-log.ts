import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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
  | 'write_file'
  | 'edit_file'
  | 'read_file'
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

const DEFAULT_LOG_PATH = resolve(process.cwd(), '.work/audit-log.json');

export function appendAuditEntry(
  entry: Omit<AuditLogEntry, 'timestamp'> & { timestamp?: string },
  logPath: string = DEFAULT_LOG_PATH,
): AuditLogEntry {
  const full: AuditLogEntry = {
    timestamp: entry.timestamp ?? new Date().toISOString(),
    source: entry.source,
    action: entry.action,
    ...(entry.target ? { target: entry.target } : {}),
    ...(entry.rule ? { rule: entry.rule } : {}),
    ...(entry.reason ? { reason: entry.reason } : {}),
    ...(entry.result ? { result: entry.result } : {}),
    ...(entry.metadata ? { metadata: entry.metadata } : {}),
  };

  const dir = dirname(logPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  appendFileSync(logPath, JSON.stringify(full) + '\n', { encoding: 'utf8' });
  return full;
}
