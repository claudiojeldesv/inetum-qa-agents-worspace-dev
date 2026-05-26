/**
 * Hook PostToolUse — esqueleto S1-T5.
 *
 * Lee un payload JSON por stdin (formato Claude Code hooks) y hace append
 * de una línea JSON a audit-log.json en la raíz del proyecto.
 *
 * Diseño intencional: el hook nunca falla la ejecución del modelo. Si el
 * stdin está malformado o la escritura falla, loggeamos a stderr y salimos
 * con exit 0. La integridad del audit log no debe romper el flujo del SDET.
 *
 * El schema completo y el resto de hooks (pre-flight, pii-post) se
 * implementan en Slice 4 y siguientes.
 */

import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { text } from 'node:stream/consumers';

interface ClaudeHookInput {
  session_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  cwd?: string;
}

interface AuditEntry {
  timestamp: string;
  source: 'hook:audit-write';
  event: string;
  tool: string;
  sessionId: string;
}

const AUDIT_LOG_PATH = resolve(process.cwd(), 'audit-log.json');

async function main(): Promise<void> {
  let payload: ClaudeHookInput = {};

  try {
    const raw = await text(process.stdin);
    if (raw.trim().length > 0) {
      payload = JSON.parse(raw) as ClaudeHookInput;
    }
  } catch (err) {
    process.stderr.write(
      `[audit-write] stdin no parseable como JSON: ${(err as Error).message}\n`,
    );
  }

  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    source: 'hook:audit-write',
    event: payload.hook_event_name ?? 'unknown',
    tool: payload.tool_name ?? 'unknown',
    sessionId: payload.session_id ?? 'unknown',
  };

  try {
    await appendFile(AUDIT_LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(
      `[audit-write] fallo escribiendo ${AUDIT_LOG_PATH}: ${(err as Error).message}\n`,
    );
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`[audit-write] error inesperado: ${String(err)}\n`);
});
