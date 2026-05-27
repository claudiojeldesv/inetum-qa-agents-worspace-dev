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

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { text } from 'node:stream/consumers';

import { parse as parseYaml } from 'yaml';

import { appendAuditEntry, createEntry } from './audit.js';
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

// ----- Modo audit-dir (S9) -----
//
// Recorre un directorio recursivo, extrae URLs y credenciales hardcoded de
// los .spec.ts encontrados, y evalúa cada una contra el config de allowed
// targets. Devuelve un AuditReport con findings.
//
// Heurísticas de extracción (puramente estáticas, sin ejecutar el código):
//   - URLs: literales 'http://...' o "https://..." dentro del código.
//   - Credenciales: argumentos string de .fill(...) o .type(...) cuando el
//     locator inmediatamente anterior cae sobre un campo con nombre
//     'username' / 'user' / 'password' / 'pass' / 'email'.
//
// Las heurísticas pueden tener falsos positivos. La filosofía es la misma
// que el pre-flight runtime: defense in depth, falsos positivos preferibles
// a falsos negativos.

export interface AuditFinding {
  file: string;
  line: number;
  type: 'URL_NOT_ALLOWLISTED' | 'URL_BLOCKLISTED' | 'CREDENTIAL_NOT_SYNTHETIC_DECLARED' | 'CREDENTIAL_LOOKS_LIKE_PII';
  value: string;
}

export interface AuditReport {
  pass: boolean;
  scanned: string[];
  findings: AuditFinding[];
}

async function walkSpecFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function recurse(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let info;
      try {
        info = await stat(full);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        await recurse(full);
      } else if (full.endsWith('.spec.ts')) {
        out.push(full);
      }
    }
  }
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat) return out;
  if (rootStat.isDirectory()) await recurse(root);
  else if (root.endsWith('.spec.ts')) out.push(root);
  return out;
}

const URL_REGEX = /['"`](https?:\/\/[^'"`\s]+)['"`]/g;
const CRED_FIELD_REGEX = /getBy(?:TestId|Label|Role|Text)\s*\([^)]*?(username|user|password|pass|email)[^)]*?\)\s*\.\s*(?:fill|type)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
const CRED_OBJECT_REGEX = /\b(username|password|email|user|pass)\s*:\s*['"`]([^'"`]+)['"`]/gi;

export function extractStaticUrls(content: string): Array<{ url: string; line: number }> {
  const out: Array<{ url: string; line: number }> = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const re = new RegExp(URL_REGEX.source, URL_REGEX.flags);
    for (const m of line.matchAll(re)) {
      const url = m[1];
      if (url) out.push({ url, line: i + 1 });
    }
  }
  return out;
}

export function extractStaticCredentials(content: string): Array<{ value: string; line: number }> {
  const out: Array<{ value: string; line: number }> = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const re1 = new RegExp(CRED_FIELD_REGEX.source, CRED_FIELD_REGEX.flags);
    for (const m of line.matchAll(re1)) {
      const val = m[2];
      if (val) out.push({ value: val, line: i + 1 });
    }
    const re2 = new RegExp(CRED_OBJECT_REGEX.source, CRED_OBJECT_REGEX.flags);
    for (const m of line.matchAll(re2)) {
      const val = m[2];
      if (val) out.push({ value: val, line: i + 1 });
    }
  }
  return out;
}

export async function auditDirectory(
  dir: string,
  configPath: string = resolve(process.cwd(), DEFAULT_CONFIG_PATH),
): Promise<AuditReport> {
  const config = await loadConfig(configPath);
  const files = await walkSpecFiles(dir);
  const findings: AuditFinding[] = [];

  if (!config) {
    // sin config no podemos validar; devolvemos el dir escaneado pero pass:false
    return {
      pass: false,
      scanned: files,
      findings: [
        {
          file: configPath,
          line: 0,
          type: 'URL_NOT_ALLOWLISTED',
          value: 'CONFIG_MISSING_OR_INVALID',
        },
      ],
    };
  }

  const declaredUsernames = new Set(config.syntheticCredentials?.usernames ?? []);
  const declaredPasswords = new Set(config.syntheticCredentials?.passwords ?? []);
  const declared = new Set<string>([...declaredUsernames, ...declaredPasswords]);

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    for (const { url, line } of extractStaticUrls(content)) {
      if (config.blockedPatterns && matchesAny(url, config.blockedPatterns)) {
        findings.push({ file, line, type: 'URL_BLOCKLISTED', value: url });
        continue;
      }
      if (!matchesAny(url, config.allowedPatterns)) {
        findings.push({ file, line, type: 'URL_NOT_ALLOWLISTED', value: url });
      }
    }

    for (const { value, line } of extractStaticCredentials(content)) {
      const piiType = looksLikePII(value);
      if (piiType !== null) {
        findings.push({ file, line, type: 'CREDENTIAL_LOOKS_LIKE_PII', value: `${value} (${piiType})` });
        continue;
      }
      if (declared.size > 0 && !declared.has(value)) {
        findings.push({ file, line, type: 'CREDENTIAL_NOT_SYNTHETIC_DECLARED', value });
      }
    }
  }

  return { pass: findings.length === 0, scanned: files, findings };
}

async function runAuditDirMode(dir: string): Promise<void> {
  const report = await auditDirectory(dir);
  process.stdout.write(JSON.stringify(report) + '\n');
  process.exit(0);
}

async function main(): Promise<void> {
  // Modo audit-dir (S9): salida JSON estructurada, siempre exit 0.
  const auditDirIndex = process.argv.indexOf('--audit-dir');
  if (auditDirIndex !== -1) {
    const dir = process.argv[auditDirIndex + 1];
    if (!dir) {
      process.stderr.write('[pre-flight] --audit-dir requiere path\n');
      process.exit(1);
    }
    await runAuditDirMode(dir);
    return;
  }

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

  // Audit entry — antes de los return path para garantizar traza
  // independientemente del modo (CLI o hook).
  const url = extractUrl(payload.tool_input);
  await appendAuditEntry(
    createEntry({
      source: 'hook:pre-flight',
      action: 'compliance_check',
      target: url ?? '<no-url>',
      result: verdict.pass ? 'pass' : 'block',
      metadata: {
        sessionId: (payload as { session_id?: string }).session_id ?? 'unknown',
        event: payload.hook_event_name ?? 'unknown',
        ...(verdict.reason ? { reason: verdict.reason } : {}),
      },
    }),
  );

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
