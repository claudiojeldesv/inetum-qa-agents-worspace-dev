import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { appendAuditEntry, type AuditLogEntry } from '../../src/audit-log.ts';

describe('audit-log appendAuditEntry', () => {
  let dir: string;
  let logPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'audit-log-'));
    logPath = join(dir, 'nested', 'audit-log.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the parent directory and appends one JSONL line', () => {
    expect(existsSync(logPath)).toBe(false);
    appendAuditEntry({ source: 'command', action: 'invoke', target: 'tests/e2e/demo' }, logPath);

    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]) as AuditLogEntry;
    expect(entry.source).toBe('command');
    expect(entry.action).toBe('invoke');
    expect(entry.target).toBe('tests/e2e/demo');
  });

  it('is append-only: successive calls accumulate lines without overwriting', () => {
    appendAuditEntry({ source: 'pre-flight', action: 'block', rule: 'C1' }, logPath);
    appendAuditEntry({ source: 'pre-flight', action: 'allow' }, logPath);

    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect((JSON.parse(lines[0]) as AuditLogEntry).action).toBe('block');
    expect((JSON.parse(lines[1]) as AuditLogEntry).action).toBe('allow');
  });

  it('stamps an ISO timestamp by default and respects an explicit one', () => {
    const auto = appendAuditEntry({ source: 'subagent', action: 'judge_decision' }, logPath);
    expect(new Date(auto.timestamp).toISOString()).toBe(auto.timestamp);

    const fixed = '2026-05-30T01:36:15.032Z';
    const explicit = appendAuditEntry(
      { source: 'subagent', action: 'judge_decision', timestamp: fixed },
      logPath,
    );
    expect(explicit.timestamp).toBe(fixed);
  });

  it('omits optional fields that were not provided', () => {
    appendAuditEntry({ source: 'audit-write', action: 'write_file' }, logPath);

    const entry = JSON.parse(readFileSync(logPath, 'utf8').trim()) as Record<string, unknown>;
    expect(entry).not.toHaveProperty('target');
    expect(entry).not.toHaveProperty('rule');
    expect(entry).not.toHaveProperty('reason');
    expect(entry).not.toHaveProperty('result');
    expect(entry).not.toHaveProperty('metadata');
  });

  it('serializes rule, reason, result and metadata when provided', () => {
    appendAuditEntry(
      {
        source: 'pii-post',
        action: 'block',
        rule: 'P2',
        reason: 'IBAN outside allowlist',
        result: 'exit_2',
        metadata: { file: 'tests/e2e/demo/TC-001_pago.datos-validos.spec.ts' },
      },
      logPath,
    );

    const entry = JSON.parse(readFileSync(logPath, 'utf8').trim()) as AuditLogEntry;
    expect(entry.rule).toBe('P2');
    expect(entry.reason).toBe('IBAN outside allowlist');
    expect(entry.result).toBe('exit_2');
    expect(entry.metadata).toEqual({ file: 'tests/e2e/demo/TC-001_pago.datos-validos.spec.ts' });
  });
});
