#!/usr/bin/env node
/**
 * PostToolUse hook — PII scanner sobre archivos .spec.ts recién escritos.
 *
 * Aplica reglas en references/pii-patterns.md.
 * Detecta también inserción no autorizada de test.fixme() por el Healer.
 * Sin override.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { scanText, scanForUnauthorizedTestFixme, type PiiMatch } from '../src/pii-detector.ts';
import { appendAuditEntry } from '../src/audit-log.ts';

interface HookPayload {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
}

interface SyntheticAllowlist {
  syntheticTestCards: string[];
  syntheticIbans: string[];
  syntheticUsernames: string[];
}

function loadSyntheticAllowlist(): SyntheticAllowlist {
  const result: SyntheticAllowlist = {
    syntheticTestCards: [],
    syntheticIbans: [],
    syntheticUsernames: [],
  };
  const dir = resolve(process.cwd(), 'style-contracts');
  if (!existsSync(dir)) return result;

  try {
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
      const raw = readFileSync(resolve(dir, file), 'utf8');
      const parsed = parseYaml(raw) as {
        synthetic_fixtures?: {
          credentials?: Array<{ username?: string }>;
          test_cards?: string[];
          test_iban?: string[];
        };
      };
      const syn = parsed?.synthetic_fixtures ?? {};
      result.syntheticTestCards.push(...(syn.test_cards ?? []));
      result.syntheticIbans.push(...(syn.test_iban ?? []));
      for (const c of syn.credentials ?? []) {
        if (c.username) result.syntheticUsernames.push(c.username);
      }
    }
  } catch {
    // best-effort
  }
  return result;
}

function extractWrittenFiles(payload: HookPayload): string[] {
  const files: string[] = [];
  const input = payload.tool_input ?? {};
  const fp = input.file_path as string | undefined;
  if (typeof fp === 'string' && (fp.endsWith('.spec.ts') || fp.endsWith('.test.ts'))) {
    files.push(fp);
  }
  return files;
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

  const files = extractWrittenFiles(payload);
  if (files.length === 0) return 0;

  const allowlist = loadSyntheticAllowlist();
  let hardFailures = 0;

  for (const file of files) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf8');

    const pii = scanText(content, {
      syntheticTestCards: allowlist.syntheticTestCards,
      syntheticIbans: allowlist.syntheticIbans,
    });
    const fixmes = scanForUnauthorizedTestFixme(content);
    const all: PiiMatch[] = [...pii, ...fixmes];

    if (all.length === 0) {
      appendAuditEntry({
        source: 'pii-post',
        action: 'allow',
        target: file,
        rule: 'P1-P6',
        result: 'pass',
      });
      continue;
    }

    hardFailures += all.length;
    for (const m of all) {
      appendAuditEntry({
        source: 'pii-post',
        action: 'block',
        target: `${file}:${m.line}`,
        rule: m.rule,
        reason: `Match: "${m.value}" (column ${m.column})`,
        result: 'exit_2',
      });
      process.stderr.write(
        `[pii-post] BLOCK rule=${m.rule} ${file}:${m.line}:${m.column} match="${m.value}"\n`,
      );
    }
  }

  return hardFailures > 0 ? 2 : 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  process.stderr.write(`[pii-post] internal error: ${err}\n`);
  process.exit(2);
});
