import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { appendAuditEntry } from './audit-log.ts';

export interface AllowedTargetsConfig {
  version: number;
  mode: 'greybox' | 'whitebox';
  patterns: string[];
  forbidden_patterns?: string[];
  allowed_test_credentials?: Array<{ username: string; password: string; source: string }>;
}

export interface PreflightResult {
  verdict: 'pass' | 'warn' | 'block';
  rule?: string;
  reason?: string;
  url: string;
}

const FORBIDDEN_HARDCODED = [
  /^https?:\/\/[^/]*\.(prod|production)\./i,
  /^https?:\/\/prod\./i,
  /^https?:\/\/[^/]*\.production\./i,
];

const SOFT_PREFIX_HINTS = [
  /^https?:\/\/(qa|test|int|staging|dev|uat)\./i,
  /^https?:\/\/[^/]*\.(qa|test|int|staging|dev|uat)\./i,
  /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$|\/)/i,
];

export function loadConfig(configPath?: string): AllowedTargetsConfig {
  const path = configPath ?? resolve(process.cwd(), 'config/allowed-targets.yaml');
  if (!existsSync(path)) {
    throw new Error(`allowed-targets config not found at ${path}`);
  }
  const raw = readFileSync(path, 'utf8');
  const parsed = parseYaml(raw) as AllowedTargetsConfig;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid allowed-targets.yaml');
  }
  if (parsed.version !== 1) {
    throw new Error(`Unsupported allowed-targets version: ${parsed.version}`);
  }
  if (!parsed.mode || (parsed.mode !== 'greybox' && parsed.mode !== 'whitebox')) {
    throw new Error('allowed-targets.yaml must declare mode: greybox|whitebox');
  }
  if (!Array.isArray(parsed.patterns) || parsed.patterns.length === 0) {
    throw new Error('allowed-targets.yaml must declare non-empty patterns[]');
  }
  return parsed;
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function checkUrl(url: string, config: AllowedTargetsConfig): PreflightResult {
  // C2 — hard forbidden
  for (const re of FORBIDDEN_HARDCODED) {
    if (re.test(url)) {
      return { verdict: 'block', rule: 'C2', reason: 'URL matches hardcoded production pattern', url };
    }
  }
  // C2 extra — explicit forbidden_patterns
  for (const pat of config.forbidden_patterns ?? []) {
    if (patternToRegex(pat).test(url)) {
      return { verdict: 'block', rule: 'C2', reason: `URL matches forbidden pattern: ${pat}`, url };
    }
  }
  // C1 — must match an allowed pattern
  const allowed = config.patterns.some((pat) => patternToRegex(pat).test(url));
  if (!allowed) {
    return { verdict: 'block', rule: 'C1', reason: 'URL not declared in allowed-targets.yaml patterns', url };
  }
  // W1 — soft warning if not in standard non-prod prefix
  const isPrefixed = SOFT_PREFIX_HINTS.some((re) => re.test(url));
  if (!isPrefixed && !/saucedemo\.com|demo\.playwright\.dev|todomvc\.com/i.test(url)) {
    return { verdict: 'warn', rule: 'W1', reason: 'URL allowed but lacks non-prod prefix', url };
  }
  return { verdict: 'pass', url };
}

export function runPreflight(url: string, configPath?: string): PreflightResult {
  let config: AllowedTargetsConfig;
  try {
    config = loadConfig(configPath);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const res: PreflightResult = { verdict: 'block', rule: 'C3', reason, url };
    appendAuditEntry({
      source: 'pre-flight',
      action: 'block',
      target: url,
      rule: res.rule,
      reason: res.reason,
      result: 'exit_2',
    });
    return res;
  }

  const result = checkUrl(url, config);

  appendAuditEntry({
    source: 'pre-flight',
    action: result.verdict === 'block' ? 'block' : result.verdict === 'warn' ? 'warn' : 'allow',
    target: url,
    rule: result.rule,
    reason: result.reason,
    result: result.verdict === 'block' ? 'exit_2' : 'pass',
  });

  return result;
}
