/**
 * Hook PostToolUse — PII scanner sobre .spec.ts recién escritos. Slice 3.
 *
 * Dos modos:
 *   1. Hook (default): stdin con payload Claude Code, escanea el .spec.ts
 *      modificado por Edit/Write/MultiEdit. Exit 2 si encuentra PII o
 *      test.fixme().
 *   2. CLI (`--scan-dir <path>`): escanea recursivamente cualquier .spec.ts
 *      bajo path, devuelve JSON con findings y pass:bool. Para uso del
 *      subagent ia4d-pii-scanner. Exit 0 siempre.
 *
 * Razones documentadas en references/pii-patterns.md y SPEC §6 (Never do —
 * PII real + test.fixme() sin sign-off).
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';

import { detectPII, type PIIFinding } from './pii-detector.js';

interface HookPayload {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

interface FixmeFinding {
  type: 'TEST_FIXME_INSERTED';
  line: number;
  column: number;
}

export interface FileFinding {
  file: string;
  type: PIIFinding['type'] | 'TEST_FIXME_INSERTED';
  value?: string;
  line?: number;
  column?: number;
}

export interface ScanReport {
  pass: boolean;
  scanned: string[];
  findings: FileFinding[];
}

const TARGET_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);
const TARGET_EXTENSIONS = ['.spec.ts'];

function isTargetFile(path: string): boolean {
  return TARGET_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function findTestFixme(content: string): FixmeFinding[] {
  const findings: FixmeFinding[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const regex = /\btest\.fixme\s*\(/g;
    for (const match of line.matchAll(regex)) {
      findings.push({
        type: 'TEST_FIXME_INSERTED',
        line: i + 1,
        column: (match.index ?? 0) + 1,
      });
    }
  }
  return findings;
}

export function scanContent(file: string, content: string): FileFinding[] {
  const findings: FileFinding[] = [];
  for (const pii of detectPII(content)) {
    findings.push({
      file,
      type: pii.type,
      value: pii.value,
      line: pii.line,
      column: pii.column,
    });
  }
  for (const f of findTestFixme(content)) {
    findings.push({ file, type: f.type, line: f.line, column: f.column });
  }
  return findings;
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
      } else if (isTargetFile(full)) {
        out.push(full);
      }
    }
  }
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat) return out;
  if (rootStat.isDirectory()) {
    await recurse(root);
  } else if (isTargetFile(root)) {
    out.push(root);
  }
  return out;
}

export async function scanDirectory(dir: string): Promise<ScanReport> {
  const files = await walkSpecFiles(dir);
  const findings: FileFinding[] = [];
  for (const file of files) {
    try {
      const content = await readFile(file, 'utf8');
      findings.push(...scanContent(file, content));
    } catch {
      // archivo desaparece entre walk y read: lo saltamos
    }
  }
  return {
    pass: findings.length === 0,
    scanned: files,
    findings,
  };
}

async function runHookMode(): Promise<void> {
  let payload: HookPayload = {};
  try {
    const raw = await text(process.stdin);
    if (raw.trim().length > 0) {
      payload = JSON.parse(raw) as HookPayload;
    }
  } catch {
    process.exit(0);
  }

  if (!payload.tool_name || !TARGET_TOOLS.has(payload.tool_name)) {
    process.exit(0);
  }

  const filePath = payload.tool_input?.file_path;
  if (typeof filePath !== 'string' || !isTargetFile(filePath)) {
    process.exit(0);
  }

  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    process.exit(0);
  }

  const findings = scanContent(filePath, content);
  if (findings.length === 0) {
    process.exit(0);
  }

  const lines: string[] = [`[pii-post] BLOCKED file=${filePath}`];
  for (const f of findings) {
    const loc = `line=${String(f.line ?? '?')} col=${String(f.column ?? '?')}`;
    const value = f.value ? ` value=${f.value}` : '';
    lines.push(`  ${f.type} ${loc}${value}`);
  }
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(2);
}

async function runScanDirMode(dir: string): Promise<void> {
  const report = await scanDirectory(dir);
  process.stdout.write(JSON.stringify(report) + '\n');
  process.exit(0);
}

const scanDirIndex = process.argv.indexOf('--scan-dir');
if (scanDirIndex !== -1) {
  const dir = process.argv[scanDirIndex + 1];
  if (!dir) {
    process.stderr.write('[pii-post] --scan-dir requiere path\n');
    process.exit(1);
  }
  void runScanDirMode(dir);
} else {
  void runHookMode();
}
