/**
 * Hook PreToolUse — compliance gate de Slice 2.
 *
 * Aplica las reglas R-001..R-005 documentadas en
 * references/compliance-rules.md sobre cada invocación de Playwright MCP.
 *
 * Comportamiento:
 *   - Exit 0 si la llamada pasa todas las reglas.
 *   - Exit 2 si alguna regla bloquea (Claude Code aborta el tool call).
 *   - El verdict razonado se escribe a stderr para que el SDET lo vea.
 *
 * Defensive defaults: si el config falta/no parsea, bloquea. Sin override.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { text } from 'node:stream/consumers';

import { parse as parseYaml } from 'yaml';

import { looksLikePII } from './pii-detector.js';

export interface AllowedTargetsConfig {
  version: number;
  mode: string;
  allowedPatterns: string[];
  blockedPatterns?: string[];
  syntheticCredentials?: {
    usernames?: string[];
    passwords?: string[];
  };
}

export interface HookPayload {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

export type BlockReason =
  | 'CONFIG_MISSING_OR_INVALID'
  | 'CONFIG_VERSION_UNSUPPORTED'
  | 'MODE_INVALID_OR_MISSING'
  | 'URL_NOT_ALLOWLISTED'
  | 'URL_BLOCKLISTED'
  | 'CREDENTIAL_NOT_SYNTHETIC_DECLARED'
  | 'CREDENTIAL_LOOKS_LIKE_PII';

export interface Verdict {
  pass: boolean;
  reason?: BlockReason;
  detail?: string;
}

const DEFAULT_CONFIG_PATH = 'config/allowed-targets.yaml';
const SUPPORTED_VERSION = 1;

const CREDENTIAL_KEYS = new Set(['username', 'password', 'email', 'user', 'pass']);

async function loadConfig(path: string): Promise<AllowedTargetsConfig | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return parseYaml(raw) as AllowedTargetsConfig;
  } catch {
    return null;
  }
}

function globToRegex(glob: string): RegExp {
  const placeholder = '___DOUBLESTAR___';
  const escaped = glob
    .replace(/\*\*/g, placeholder)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(new RegExp(placeholder, 'g'), '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function matchesAny(url: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegex(p).test(url));
}

function extractUrl(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null;
  if (typeof input.url === 'string') return input.url;
  return null;
}

function extractCredentials(input: Record<string, unknown> | undefined): string[] {
  if (!input) return [];
  const creds: string[] = [];
  function recurse(obj: unknown): void {
    if (obj === null || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (CREDENTIAL_KEYS.has(k.toLowerCase()) && typeof v === 'string') {
        creds.push(v);
      } else if (typeof v === 'object') {
        recurse(v);
      }
    }
  }
  recurse(input);
  return creds;
}

export async function evaluate(
  input: HookPayload,
  configPath: string = resolve(process.cwd(), DEFAULT_CONFIG_PATH),
): Promise<Verdict> {
  const config = await loadConfig(configPath);
  if (!config) {
    return { pass: false, reason: 'CONFIG_MISSING_OR_INVALID', detail: configPath };
  }

  if (config.version !== SUPPORTED_VERSION) {
    return {
      pass: false,
      reason: 'CONFIG_VERSION_UNSUPPORTED',
      detail: `got version=${String(config.version)}`,
    };
  }

  if (config.mode !== 'greybox') {
    return {
      pass: false,
      reason: 'MODE_INVALID_OR_MISSING',
      detail: `got mode=${String(config.mode)}`,
    };
  }

  const url = extractUrl(input.tool_input);

  if (url) {
    if (config.blockedPatterns && matchesAny(url, config.blockedPatterns)) {
      return { pass: false, reason: 'URL_BLOCKLISTED', detail: url };
    }
    if (!matchesAny(url, config.allowedPatterns)) {
      return { pass: false, reason: 'URL_NOT_ALLOWLISTED', detail: url };
    }
  }

  const creds = extractCredentials(input.tool_input);
  const declaredUsernames = new Set(config.syntheticCredentials?.usernames ?? []);
  const declaredPasswords = new Set(config.syntheticCredentials?.passwords ?? []);
  const declared = new Set<string>([...declaredUsernames, ...declaredPasswords]);

  for (const cred of creds) {
    const piiType = looksLikePII(cred);
    if (piiType !== null) {
      return {
        pass: false,
        reason: 'CREDENTIAL_LOOKS_LIKE_PII',
        detail: `${cred} (${piiType})`,
      };
    }
    if (declared.size > 0 && !declared.has(cred)) {
      return {
        pass: false,
        reason: 'CREDENTIAL_NOT_SYNTHETIC_DECLARED',
        detail: cred,
      };
    }
  }

  return { pass: true };
}

async function main(): Promise<void> {
  let payload: HookPayload = {};
  try {
    const raw = await text(process.stdin);
    if (raw.trim().length > 0) {
      payload = JSON.parse(raw) as HookPayload;
    }
  } catch (err) {
    process.stderr.write(
      `[pre-flight] stdin no parseable: ${(err as Error).message}\n`,
    );
  }

  const verdict = await evaluate(payload);

  // Modo CLI directo: usado por subagents que necesitan verdict máquina-legible.
  // En lugar de exit 2 + stderr, escribimos JSON a stdout y siempre exit 0.
  if (process.argv.includes('--cli-json')) {
    process.stdout.write(JSON.stringify(verdict) + '\n');
    process.exit(0);
  }

  // Modo hook PreToolUse: el comportamiento que Claude Code espera.
  if (verdict.pass) {
    process.exit(0);
  }

  process.stderr.write(
    `[pre-flight] BLOCKED reason=${verdict.reason ?? 'UNKNOWN'} detail=${verdict.detail ?? ''}\n`,
  );
  process.exit(2);
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
