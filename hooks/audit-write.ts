#!/usr/bin/env node
/**
 * Stop / Notify hook — registra fin de sesión en audit-log.
 *
 * El audit log se va escribiendo entrada a entrada por los otros hooks y por
 * los subagents. Este hook cierra la sesión con un summary.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { appendAuditEntry } from '../src/audit-log.ts';

async function main(): Promise<number> {
  // QA_WORK_DIR: en un run namespaciado el log vive en .work/<site-id>/. Sin esto el
  // resumen de cierre se escribia en otro fichero y el run se cerraba sin cerrarse.
  const logPath = resolve(process.cwd(), `${process.env.QA_WORK_DIR || '.work'}/audit-log.json`);
  if (!existsSync(logPath)) {
    appendAuditEntry({
      source: 'audit-write',
      action: 'invoke',
      result: 'pass',
      metadata: { note: 'session ended with no prior audit entries' },
    }, logPath);
    return 0;
  }

  const lines = readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean);
  appendAuditEntry({
    source: 'audit-write',
    action: 'invoke',
    result: 'pass',
    metadata: {
      total_entries: lines.length,
      session_closed: true,
    },
  }, logPath);
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  process.stderr.write(`[audit-write] internal error: ${err}\n`);
  process.exit(0); // No bloqueamos por error en este hook.
});
