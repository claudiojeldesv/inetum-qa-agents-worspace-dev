import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendAuditEntry,
  createEntry,
  SCHEMA_VERSION,
  validateAuditEntry,
  type AuditEntry,
} from '../../hooks/audit.js';

describe('createEntry', () => {
  it('genera timestamp ISO y schemaVersion 1', () => {
    const e = createEntry({
      source: 'hook:audit-write',
      action: 'tool_invocation',
      target: 'Bash',
      result: 'pass',
    });
    expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(e.metadata.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('preserva metadata extra del caller', () => {
    const e = createEntry({
      source: 'hook:pre-flight',
      action: 'compliance_check',
      target: 'https://x.com/',
      result: 'block',
      metadata: { reason: 'URL_NOT_ALLOWLISTED', sessionId: 'abc' },
    });
    expect(e.metadata.reason).toBe('URL_NOT_ALLOWLISTED');
    expect(e.metadata.sessionId).toBe('abc');
    expect(e.metadata.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('validateAuditEntry', () => {
  const valid: AuditEntry = {
    timestamp: '2026-05-26T18:30:00.000Z',
    source: 'hook:audit-write',
    action: 'tool_invocation',
    target: 'Bash',
    result: 'pass',
    metadata: { schemaVersion: 1 },
  };

  it('acepta entrada bien formada', () => {
    expect(validateAuditEntry(valid)).not.toBeNull();
  });

  it('rechaza action fuera del enum', () => {
    expect(validateAuditEntry({ ...valid, action: 'wat' })).toBeNull();
  });

  it('rechaza result fuera del enum', () => {
    expect(validateAuditEntry({ ...valid, result: 'maybe' })).toBeNull();
  });

  it('rechaza entrada sin metadata', () => {
    const noMetadata = {
      timestamp: valid.timestamp,
      source: valid.source,
      action: valid.action,
      target: valid.target,
      result: valid.result,
    };
    expect(validateAuditEntry(noMetadata)).toBeNull();
  });

  it('rechaza null y primitivos', () => {
    expect(validateAuditEntry(null)).toBeNull();
    expect(validateAuditEntry('string')).toBeNull();
    expect(validateAuditEntry(42)).toBeNull();
  });
});

describe('appendAuditEntry', () => {
  let tmp: string;
  let logPath: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'audit-'));
    logPath = join(tmp, 'audit-log.json');
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('escribe N entradas como JSONL y las re-lee todas válidas', async () => {
    const sources: Array<AuditEntry['source']> = [
      'hook:audit-write',
      'hook:pre-flight',
      'hook:pii-post',
    ];
    const actions: AuditEntry['action'][] = [
      'tool_invocation',
      'compliance_check',
      'pii_scan',
    ];

    for (let i = 0; i < 5; i++) {
      const entry = createEntry({
        source: sources[i % sources.length] as AuditEntry['source'],
        action: actions[i % actions.length] as AuditEntry['action'],
        target: `target-${i}`,
        result: i % 2 === 0 ? 'pass' : 'block',
        metadata: { sessionId: `sess-${i}` },
      });
      await appendAuditEntry(entry, logPath);
    }

    const raw = await readFile(logPath, 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(5);

    for (const line of lines) {
      const parsed = JSON.parse(line) as unknown;
      const validated = validateAuditEntry(parsed);
      expect(validated).not.toBeNull();
    }
  });

  it('no lanza si el path no es escribible (graceful)', async () => {
    const entry = createEntry({
      source: 'hook:audit-write',
      action: 'tool_invocation',
      target: 'X',
      result: 'pass',
    });
    // path inexistente sin permisos de creación
    await expect(
      appendAuditEntry(entry, '/dev/null/imposible/audit-log.json'),
    ).resolves.toBeUndefined();
  });
});
