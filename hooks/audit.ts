/**
 * Audit log helper compartido — Slice 4.
 *
 * Cualquier hook, command o subagent que produzca verdict relevante usa
 * appendAuditEntry() para escribir una línea JSONL en audit-log.json.
 * Schema documentado en references/audit-log-schema.md.
 */

import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export type AuditSource =
  | 'hook:audit-write'
  | 'hook:pre-flight'
  | 'hook:pii-post'
  | `command:${string}`
  | `subagent:${string}`;

export type AuditAction = 'tool_invocation' | 'compliance_check' | 'pii_scan';

export type AuditResult = 'pass' | 'block' | 'noop' | 'unknown';

export interface AuditMetadata {
  schemaVersion?: number;
  sessionId?: string;
  event?: string;
  reason?: string;
  findings?: number;
  [extra: string]: unknown;
}

export interface AuditEntry {
  timestamp: string;
  source: AuditSource;
  action: AuditAction;
  target: string;
  result: AuditResult;
  metadata: AuditMetadata;
}

export const SCHEMA_VERSION = 1;

const VALID_ACTIONS = new Set<AuditAction>([
  'tool_invocation',
  'compliance_check',
  'pii_scan',
]);

const VALID_RESULTS = new Set<AuditResult>(['pass', 'block', 'noop', 'unknown']);

const DEFAULT_LOG_PATH = 'audit-log.json';

/**
 * Crea una entrada con campos por defecto seguros. El llamador rellena
 * lo que conoce, este helper completa timestamp + schemaVersion.
 */
export function createEntry(input: {
  source: AuditSource;
  action: AuditAction;
  target: string;
  result: AuditResult;
  metadata?: AuditMetadata;
}): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    source: input.source,
    action: input.action,
    target: input.target,
    result: input.result,
    metadata: {
      schemaVersion: SCHEMA_VERSION,
      ...input.metadata,
    },
  };
}

/**
 * Valida estructuralmente una entrada parseada (típicamente desde una
 * línea de audit-log.json). Devuelve la entrada tipada si pasa, null si
 * no. No lanza — el log es append-only y queremos tolerar líneas viejas.
 */
export function validateAuditEntry(value: unknown): AuditEntry | null {
  if (value === null || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;

  if (typeof v.timestamp !== 'string') return null;
  if (typeof v.source !== 'string') return null;
  if (typeof v.target !== 'string') return null;

  const action = v.action;
  if (typeof action !== 'string' || !VALID_ACTIONS.has(action as AuditAction)) {
    return null;
  }

  const result = v.result;
  if (typeof result !== 'string' || !VALID_RESULTS.has(result as AuditResult)) {
    return null;
  }

  if (v.metadata === null || typeof v.metadata !== 'object') return null;

  return {
    timestamp: v.timestamp,
    source: v.source as AuditSource,
    action: action as AuditAction,
    target: v.target,
    result: result as AuditResult,
    metadata: v.metadata as AuditMetadata,
  };
}

/**
 * Append a una línea JSONL. Nunca lanza — si la escritura falla, escribe
 * a stderr y continúa. El audit log no debe romper el flujo del modelo.
 */
export async function appendAuditEntry(
  entry: AuditEntry,
  logPath: string = resolve(process.cwd(), DEFAULT_LOG_PATH),
): Promise<void> {
  try {
    await appendFile(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(
      `[audit] no se pudo escribir ${logPath}: ${(err as Error).message}\n`,
    );
  }
}
