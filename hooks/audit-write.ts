/**
 * Hook PostToolUse `*` — audit transversal.
 *
 * Cada tool use queda registrado como `action: tool_invocation` en
 * audit-log.json. Schema en references/audit-log-schema.md.
 *
 * Diseño intencional: el hook nunca falla la ejecución del modelo. Si el
 * stdin está malformado o la escritura falla, loggeamos a stderr y
 * salimos con exit 0.
 */

import { text } from 'node:stream/consumers';

import { appendAuditEntry, createEntry } from './audit.js';

interface ClaudeHookInput {
  session_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  cwd?: string;
}

async function main(): Promise<void> {
  let payload: ClaudeHookInput = {};

  try {
    const raw = await text(process.stdin);
    if (raw.trim().length > 0) {
      payload = JSON.parse(raw) as ClaudeHookInput;
    }
  } catch (err) {
    process.stderr.write(
      `[audit-write] stdin no parseable: ${(err as Error).message}\n`,
    );
  }

  const toolName = payload.tool_name ?? 'unknown';
  const event = payload.hook_event_name ?? 'unknown';
  const sessionId = payload.session_id ?? 'unknown';

  const entry = createEntry({
    source: 'hook:audit-write',
    action: 'tool_invocation',
    target: toolName,
    result: payload.tool_name ? 'pass' : 'unknown',
    metadata: {
      event,
      sessionId,
    },
  });

  await appendAuditEntry(entry);
}

main().catch((err: unknown) => {
  process.stderr.write(`[audit-write] error inesperado: ${String(err)}\n`);
});
