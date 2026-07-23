#!/usr/bin/env node
/**
 * PreToolUse hook — compliance pre-flight gate (flavor lean S3, prueba
 * copilot-efficient-tokens). Portado del spike Copilot (deny-JSON portable).
 *
 * Lee el payload del hook por stdin (JSON), aplica las reglas de
 * `config/allowed-targets.yaml` vía `src/compliance-preflight.ts` y DENIEGA la
 * tool si el target no está permitido. Sin override, sin flag (regla dura #3).
 *
 * Bundle a `.github/hooks/dist/pre-flight.mjs` con esbuild (~100ms de arranque);
 * VS Code no puede usar `npx tsx` en hooks (1-3s → timeout fail-open). El gate
 * también corre determinísticamente en `lean-run prepare`; este hook es la
 * segunda barrera contra navegación MCP dirigida por el LLM.
 */
interface PreflightResult {
  verdict: string;
  rule?: string;
  reason?: string;
}

interface HookPayload {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

// Deny portable: en VS Code el `exit 2` NO deniega (queda en warning y la tool corre —
// hallazgo D2 del spike). El deny real es JSON por stdout + exit 0, protocolo que Claude
// Code también honra. Este camino deniega en ambas plataformas.
function denyExit(reason: string): number {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n',
  );
  return 0;
}

function extractUrl(payload: HookPayload): string | null {
  const input = payload.tool_input ?? {};
  const candidate = (input.url ?? input.target ?? input.base_url) as string | undefined;
  if (typeof candidate === 'string' && candidate.startsWith('http')) {
    return candidate;
  }
  return null;
}

async function main(): Promise<number> {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  let payload: HookPayload = {};
  if (raw.trim().length > 0) {
    try {
      payload = JSON.parse(raw);
    } catch {
      return 0;
    }
  }

  // Guard de matcher replicado en el script: VS Code IGNORA los matchers de hooks.json, así que
  // este hook corre en TODAS las tool calls. Solo validamos navegación/playwright — naming Claude
  // (`mcp__playwright-test__browser_*`), naming VS Code (`playwright-test/browser_*`) o el nombre
  // MCP a secas (`browser_navigate`). Sin el guard, un `web/fetch` a docs quedaría bloqueado.
  const toolName = payload.tool_name ?? '';
  if (toolName && !/playwright|browser_|planner_|generator_/i.test(toolName)) {
    return 0;
  }

  const url = extractUrl(payload);
  if (!url) return 0;

  let runPreflight: (url: string) => PreflightResult;
  try {
    ({ runPreflight } = await import('../../src/compliance-preflight.ts'));
  } catch (err) {
    process.stderr.write(
      '[pre-flight] No puedo cargar el validador de compliance (¿falta `npm install`?). ' +
        `Bloqueo por seguridad. (${err})\n`,
    );
    return denyExit(
      '[pre-flight] Validador de compliance no disponible (¿falta npm install?). Fail-closed: tool denegada.',
    );
  }

  const result = runPreflight(url);

  if (result.verdict === 'block') {
    process.stderr.write(`[pre-flight] BLOCK rule=${result.rule} url=${url} reason=${result.reason}\n`);
    return denyExit(
      `[pre-flight] BLOCK rule=${result.rule} url=${url} reason=${result.reason}. Target no permitido por config/allowed-targets.yaml. Sin override.`,
    );
  }
  if (result.verdict === 'warn') {
    process.stderr.write(`[pre-flight] WARN rule=${result.rule} url=${url} reason=${result.reason}\n`);
    return 0;
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`[pre-flight] internal error: ${err}\n`);
    process.exit(denyExit(`[pre-flight] internal error: ${err}. Fail-closed: tool denegada.`));
  });
