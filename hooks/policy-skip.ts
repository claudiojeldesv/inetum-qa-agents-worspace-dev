/**
 * CLI — `npx tsx hooks/policy-skip.ts --policy <name> --mode <warn|skip> --reason "<texto>" --declared-in <cli|contract>`
 *
 * Helper invocado desde slash commands cuando el SDET declara un
 * downgrade de una política bloqueante (ej. a11y de block a warn).
 * Escribe una entry `policy_skip` en `audit-log.json`.
 *
 * Reason es obligatorio y no vacío. Si falta, exit 1 sin escribir.
 *
 * Schema documentado en references/audit-log-schema.md.
 */

import { appendAuditEntry, createEntry, type AuditSource } from './audit.js';

interface Args {
  policy: string | null;
  mode: string | null;
  reason: string | null;
  declaredIn: string | null;
  source: string | null;
}

function parseArgs(argv: string[]): Args {
  let policy: string | null = null;
  let mode: string | null = null;
  let reason: string | null = null;
  let declaredIn: string | null = null;
  let source: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--policy') policy = argv[++i] ?? null;
    else if (a === '--mode') mode = argv[++i] ?? null;
    else if (a === '--reason') reason = argv[++i] ?? null;
    else if (a === '--declared-in') declaredIn = argv[++i] ?? null;
    else if (a === '--source') source = argv[++i] ?? null;
  }
  return { policy, mode, reason, declaredIn, source };
}

async function main(): Promise<void> {
  const { policy, mode, reason, declaredIn, source } = parseArgs(process.argv.slice(2));

  if (!policy) {
    process.stderr.write('[policy-skip] --policy <name> requerido\n');
    process.exit(1);
  }
  if (mode !== 'warn' && mode !== 'skip') {
    process.stderr.write(`[policy-skip] --mode debe ser 'warn' o 'skip' (recibido: ${mode ?? '<vacío>'})\n`);
    process.exit(1);
  }
  if (!reason || reason.trim().length === 0) {
    process.stderr.write('[policy-skip] --reason es obligatorio (no vacío) cuando se declara un downgrade\n');
    process.exit(1);
  }
  if (declaredIn !== 'cli' && declaredIn !== 'contract') {
    process.stderr.write(`[policy-skip] --declared-in debe ser 'cli' o 'contract' (recibido: ${declaredIn ?? '<vacío>'})\n`);
    process.exit(1);
  }

  const entrySource: AuditSource = (source ?? 'command:policy-skip') as AuditSource;

  const entry = createEntry({
    source: entrySource,
    action: 'policy_skip',
    target: policy,
    result: 'pass',
    metadata: {
      policy,
      mode,
      reason,
      declaredIn,
    },
  });

  await appendAuditEntry(entry);
  process.stdout.write(JSON.stringify({ ok: true, entry }) + '\n');
  process.exit(0);
}

const isDirectInvocation = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  void main();
}
