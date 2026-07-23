#!/usr/bin/env node
// Sonda de hooks (flavor lean S3). Registra cada disparo en .work/hook-probe.log
// para confirmar que VS Code carga los hooks de .github/hooks/ durante la medición
// de Fase B. Sin dependencias, exit 0 siempre: nunca bloquea. Es .mjs puro (no
// necesita bundle). El marker `source` (argv) distingue el origen.
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const source = process.argv[2] ?? 'unknown';
const started = Date.now();

let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;

let payload = {};
try {
  payload = raw.trim() ? JSON.parse(raw) : {};
} catch {
  payload = { parse_error: true, raw: raw.slice(0, 500) };
}

const entry = {
  ts: new Date().toISOString(),
  source,
  hook_event_name: payload.hook_event_name ?? null,
  tool_name: payload.tool_name ?? null,
  tool_input_keys: payload.tool_input ? Object.keys(payload.tool_input) : null,
  cwd_process: process.cwd(),
  startup_ms: Date.now() - started,
};

try {
  const dir = resolve(process.cwd(), '.work');
  mkdirSync(dir, { recursive: true });
  appendFileSync(resolve(dir, 'hook-probe.log'), JSON.stringify(entry) + '\n', 'utf8');
} catch {
  // best-effort
}
process.exit(0);
