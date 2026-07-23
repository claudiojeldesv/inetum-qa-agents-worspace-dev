#!/usr/bin/env node
/**
 * Stop hook — cierra la sesión en el audit-log (flavor lean S3, prueba
 * copilot-efficient-tokens). Portado del spike Copilot.
 *
 * El audit-log se va escribiendo entrada a entrada por el runner y los subagents;
 * este hook lo cierra con un summary. 0 tokens, regla dura (evidencia). Bundle a
 * `.github/hooks/dist/audit-write.mjs` con esbuild.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { appendAuditEntry } from '../../src/audit-log.ts';

async function main(): Promise<number> {
  const logPath = resolve(process.cwd(), '.work/audit-log.json');
  if (!existsSync(logPath)) {
    appendAuditEntry({
      source: 'audit-write',
      action: 'invoke',
      result: 'pass',
      metadata: { note: 'session ended with no prior audit entries' },
    });
    return 0;
  }

  const lines = readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean);
  appendAuditEntry({
    source: 'audit-write',
    action: 'invoke',
    result: 'pass',
    metadata: { total_entries: lines.length, session_closed: true },
  });
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`[audit-write] internal error: ${err}\n`);
    process.exit(0); // No bloqueamos por error en este hook.
  });
