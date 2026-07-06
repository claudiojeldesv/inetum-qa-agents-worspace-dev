#!/usr/bin/env node
/**
 * PreToolUse hook — compliance pre-flight gate.
 *
 * Invocado por Claude Code antes de cualquier tool call que dispare el matcher
 * declarado en hooks/hooks.json (MCP playwright-test, principalmente).
 *
 * Lee el payload del hook por stdin (JSON), aplica reglas declaradas en
 * docs/references/compliance-rules.md y bloquea con exit code 2 si procede.
 *
 * Sin override. Sin flag.
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

function extractUrl(payload: HookPayload): string | null {
  const input = payload.tool_input ?? {};
  // playwright MCP usa varios nombres: url, target, base_url
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
      // Hook invocado sin payload válido. No bloqueamos por esto sólo.
      return 0;
    }
  }

  const url = extractUrl(payload);
  if (!url) {
    // No hay URL en el payload, nada que validar.
    return 0;
  }

  // El validador de compliance parsea YAML (paquete `yaml`). Se carga de forma diferida: si el
  // workspace no está instalado, el `import` falla. Compliance es una regla dura sin fail-open:
  // en vez de crashear críptico (exit 1, no-bloqueante, dejaba pasar el run sin gate), bloqueamos
  // limpio (exit 2) con un mensaje accionable.
  let runPreflight: (url: string) => PreflightResult;
  try {
    ({ runPreflight } = await import('../src/compliance-preflight.ts'));
  } catch {
    process.stderr.write(
      '[pre-flight] No puedo cargar el validador de compliance (¿falta `npm install`?). ' +
        'Bloqueo por seguridad: instala dependencias y reintenta.\n',
    );
    return 2;
  }

  const result = runPreflight(url);

  if (result.verdict === 'block') {
    process.stderr.write(
      `[pre-flight] BLOCK rule=${result.rule} url=${url} reason=${result.reason}\n`,
    );
    return 2;
  }
  if (result.verdict === 'warn') {
    process.stderr.write(
      `[pre-flight] WARN rule=${result.rule} url=${url} reason=${result.reason}\n`,
    );
    return 0;
  }
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  process.stderr.write(`[pre-flight] internal error: ${err}\n`);
  process.exit(2);
});
