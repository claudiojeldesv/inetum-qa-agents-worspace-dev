/**
 * Style Contract validator + resolved-config explainer (v0.2, feat/config-help).
 *
 * Backs the /qa-automator:config command. Two deterministic jobs (hard rule #5 —
 * no LLM-as-validator):
 *
 *   1. validateContract(text) — parses the YAML and reports unknown fields
 *      (typo suspects with a suggestion), invalid enum values, wrong types, and
 *      semantic incoherences (e.g. auth.enabled:true without login_path,
 *      fail_on_violations:true with an empty severity_threshold). This closes the
 *      silent-typo hole: today `fail_on_violation:` (singular) or
 *      `evidence.level: complete` pass unnoticed and the gate never fires.
 *
 *   2. resolveConfigState(contract, env) — merges contract + env-vars + schema
 *      defaults into the EFFECTIVE configuration of the current session: which
 *      gates are on, the evidence level, auth, locator strategy. Answers "what do
 *      I actually have active right now".
 *
 * The schema is a declarative TS structure (not a separate .json) so it travels
 * with src/ when build-template regenerates the workspace (config/ is preserved,
 * not copied) and needs no ajv dependency. Source of truth for humans stays
 * docs/references/style-contract-schema.md; this mirrors it for the machine.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';

export type Severity = 'error' | 'warning';

export interface Issue {
  severity: Severity;
  path: string; // dotted location, e.g. "a11y.fail_on_violations"
  message: string;
}

export interface ValidationResult {
  contract: string; // display name (project or file)
  ok: boolean; // no errors (warnings still allow ok:true)
  issues: Issue[];
  parsed: Record<string, unknown> | null;
}

type FieldType = 'boolean' | 'string' | 'number' | 'string[]' | 'object' | 'map<boolean>';

interface FieldSpec {
  type: FieldType;
  enum?: string[]; // allowed scalar values
  itemEnum?: string[]; // for string[]: allowed item values (soft — warning)
  fields?: Record<string, FieldSpec>; // for nested objects
  freeform?: boolean; // object with client-defined keys — do not flag unknowns
}

// Declarative mirror of docs/references/style-contract-schema.md.
const SCHEMA: Record<string, FieldSpec> = {
  version: { type: 'number' },
  project: { type: 'string' },
  pom: {
    type: 'object',
    fields: {
      enabled: { type: 'boolean' },
      location: { type: 'string' },
      class_suffix: { type: 'string' },
      base_page: { type: 'boolean' },
      components: { type: 'boolean' },
    },
  },
  locators: {
    type: 'object',
    fields: {
      priority: {
        type: 'string[]',
        itemEnum: [
          'getByTestId',
          'getByRole',
          'getByLabel',
          'getByText',
          'getByPlaceholder',
          'getByAltText',
          'getByTitle',
        ],
      },
      forbid_css_selectors: { type: 'boolean' },
      forbid_xpath: { type: 'boolean' },
      css_fallback_attributes: { type: 'string[]', itemEnum: ['name', 'id'] },
    },
  },
  naming: {
    type: 'object',
    fields: {
      language: { type: 'string', enum: ['es', 'en'] },
      spec_pattern: { type: 'string' },
      test_title_pattern: { type: 'string' },
    },
  },
  tc_registry: {
    type: 'object',
    fields: {
      enabled: { type: 'boolean' },
      path: { type: 'string' },
      id_prefix: { type: 'string' },
    },
  },
  asserts: {
    type: 'object',
    fields: {
      semantic_only: { type: 'boolean' },
      forbid_text_equality: { type: 'boolean' },
    },
  },
  waits: {
    type: 'object',
    fields: {
      forbid_wait_for_timeout: { type: 'boolean' },
      prefer_locators_assert: { type: 'boolean' },
    },
  },
  fixtures: {
    type: 'object',
    fields: {
      location: { type: 'string' },
      synthetic_data_only: { type: 'boolean' },
    },
  },
  a11y: {
    type: 'object',
    fields: {
      inject_axe_check: { type: 'boolean' },
      fail_on_violations: { type: 'boolean' },
      severity_threshold: {
        type: 'string[]',
        itemEnum: ['minor', 'moderate', 'serious', 'critical'],
      },
    },
  },
  auth: {
    type: 'object',
    fields: {
      enabled: { type: 'boolean' },
      login_path: { type: 'string' },
      storage_state: { type: 'string' },
      credentials_ref: { type: 'number' },
      success_signal: {
        type: 'object',
        fields: {
          type: { type: 'string', enum: ['url', 'locator'] },
          value: { type: 'string' },
        },
      },
    },
  },
  // Sanación off por defecto (regla #10, v0.3 quality-greens Q3). enabled:true → autonomous
  // encadena /qa-automator:heal sobre los rojos tras el Verification step.
  healing: {
    type: 'object',
    fields: {
      enabled: { type: 'boolean' },
    },
  },
  evidence: {
    type: 'object',
    fields: {
      level: { type: 'string', enum: ['minimal', 'steps', 'full'] },
      screenshots: { type: 'string', enum: ['on', 'only-on-failure', 'off'] },
    },
  },
  test_design: {
    type: 'object',
    fields: {
      require_business_postcondition: { type: 'boolean' },
      min_functional_asserts: { type: 'number' },
      forbid_navigation_only_test: { type: 'boolean' },
      coverage: {
        type: 'object',
        fields: {
          negatives_by_flow: { type: 'map<boolean>' },
        },
      },
      no_assume_undiscovered_flows: { type: 'boolean' },
    },
  },
  // Client-defined test data (sites add buyer_info, invalid_credentials, ...).
  // Freeform: unknown children are NOT typo suspects.
  synthetic_fixtures: { type: 'object', freeform: true },
  banned_apis: { type: 'string[]' },
};

/** Levenshtein distance, capped for the typo-suggestion heuristic. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

/** Nearest known key within edit distance 2, else null. */
function suggest(key: string, known: string[]): string | null {
  let best: string | null = null;
  let bestDist = 3;
  for (const k of known) {
    const dist = editDistance(key.toLowerCase(), k.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = k;
    }
  }
  return best;
}

function typeOfValue(v: unknown): FieldType | 'null' | 'array' | 'unknown' {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  if (t === 'boolean' || t === 'string' || t === 'number') return t;
  if (t === 'object') return 'object';
  return 'unknown';
}

function checkField(
  path: string,
  spec: FieldSpec,
  value: unknown,
  issues: Issue[],
): void {
  const actual = typeOfValue(value);

  switch (spec.type) {
    case 'boolean':
    case 'string':
    case 'number':
      if (actual !== spec.type) {
        issues.push({
          severity: 'error',
          path,
          message: `esperaba ${spec.type}, encontró ${actual === 'null' ? 'vacío/null' : actual}`,
        });
        return;
      }
      if (spec.enum && !spec.enum.includes(value as string)) {
        issues.push({
          severity: 'error',
          path,
          message: `valor '${value}' no válido. Permitidos: ${spec.enum.join(' | ')}`,
        });
      }
      break;

    case 'string[]':
      if (actual !== 'array') {
        issues.push({ severity: 'error', path, message: `esperaba una lista, encontró ${actual}` });
        return;
      }
      if (spec.itemEnum) {
        for (const item of value as unknown[]) {
          if (typeof item === 'string' && !spec.itemEnum.includes(item)) {
            issues.push({
              severity: 'warning',
              path,
              message: `'${item}' no es un valor conocido. Esperados: ${spec.itemEnum.join(' | ')}`,
            });
          }
        }
      }
      break;

    case 'map<boolean>':
      if (actual !== 'object') {
        issues.push({ severity: 'error', path, message: `esperaba un mapa clave→bool, encontró ${actual}` });
        return;
      }
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v !== 'boolean') {
          issues.push({
            severity: 'error',
            path: `${path}.${k}`,
            message: `esperaba boolean, encontró ${typeOfValue(v)}`,
          });
        }
      }
      break;

    case 'object':
      if (actual !== 'object') {
        issues.push({ severity: 'error', path, message: `esperaba un bloque, encontró ${actual}` });
        return;
      }
      if (spec.freeform) return; // client-defined keys — do not police
      checkObject(path, spec.fields ?? {}, value as Record<string, unknown>, issues);
      break;
  }
}

function checkObject(
  prefix: string,
  fields: Record<string, FieldSpec>,
  obj: Record<string, unknown>,
  issues: Issue[],
): void {
  const known = Object.keys(fields);
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const spec = fields[key];
    if (!spec) {
      const hint = suggest(key, known);
      issues.push({
        severity: 'warning',
        path,
        message: hint ? `campo desconocido — ¿quisiste decir '${hint}'?` : 'campo desconocido (ignorado)',
      });
      continue;
    }
    checkField(path, spec, value, issues);
  }
}

/** Cross-field coherence — things individually valid but jointly wrong. */
function checkCoherence(c: Record<string, unknown>, issues: Issue[]): void {
  const auth = c.auth as Record<string, unknown> | undefined;
  if (auth?.enabled === true) {
    if (!auth.login_path) {
      issues.push({
        severity: 'warning',
        path: 'auth.login_path',
        message: 'auth.enabled:true pero no hay login_path — el setup no sabrá dónde loguear',
      });
    }
    if (!auth.success_signal) {
      issues.push({
        severity: 'warning',
        path: 'auth.success_signal',
        message: 'auth.enabled:true sin success_signal — el setup no podrá verificar el login antes de guardar el estado',
      });
    }
  }

  const a11y = c.a11y as Record<string, unknown> | undefined;
  if (a11y?.fail_on_violations === true) {
    const th = a11y.severity_threshold;
    if (Array.isArray(th) && th.length === 0) {
      issues.push({
        severity: 'warning',
        path: 'a11y.severity_threshold',
        message: 'fail_on_violations:true pero severity_threshold vacío — el gate está on pero nada cuenta, no abortará nunca',
      });
    }
  }

  const version = c.version;
  if (version !== undefined && version !== 1) {
    issues.push({
      severity: 'warning',
      path: 'version',
      message: `version ${version} no reconocida (se espera 1)`,
    });
  }
}

export function validateContract(text: string, displayName?: string): ValidationResult {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = parseYaml(text) as Record<string, unknown>;
  } catch (err) {
    return {
      contract: displayName ?? '(inline)',
      ok: false,
      issues: [{ severity: 'error', path: '(root)', message: `YAML inválido: ${err instanceof Error ? err.message : String(err)}` }],
      parsed: null,
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      contract: displayName ?? '(inline)',
      ok: false,
      issues: [{ severity: 'error', path: '(root)', message: 'el contract debe ser un objeto YAML' }],
      parsed: null,
    };
  }

  const issues: Issue[] = [];
  checkObject('', SCHEMA, parsed, issues);
  checkCoherence(parsed, issues);

  const name = displayName ?? (typeof parsed.project === 'string' ? parsed.project : '(sin project)');
  const ok = !issues.some((i) => i.severity === 'error');
  return { contract: name, ok, issues, parsed };
}

// ---- Resolved config state -------------------------------------------------

export interface StateRow {
  key: string;
  value: string;
  origin: 'env' | 'contract' | 'default';
  note?: string;
}

export interface ResolvedState {
  rows: StateRow[];
}

const TRUTHY = new Set(['1', 'true', 'on']);
function envOn(v: string | undefined): boolean {
  return v !== undefined && TRUTHY.has(v.toLowerCase());
}

export function resolveConfigState(
  contract: Record<string, unknown> | null,
  env: Record<string, string | undefined> = process.env,
): ResolvedState {
  const c = contract ?? {};
  const a11y = (c.a11y as Record<string, unknown>) ?? {};
  const auth = (c.auth as Record<string, unknown>) ?? {};
  const evidence = (c.evidence as Record<string, unknown>) ?? {};
  const locators = (c.locators as Record<string, unknown>) ?? {};

  const rows: StateRow[] = [];

  // Gates (env-driven, off by default — regla dura #10)
  rows.push({
    key: 'gate: PII scanner',
    value: envOn(env.QA_ENABLE_PII) ? 'ON' : 'off',
    origin: 'env',
    note: 'QA_ENABLE_PII',
  });
  rows.push({
    key: 'gate: Judge',
    value: envOn(env.QA_ENABLE_JUDGE) ? 'ON' : 'off',
    origin: 'env',
    note: 'QA_ENABLE_JUDGE',
  });

  // a11y gate (contract-driven, per-site)
  const failOn = a11y.fail_on_violations;
  rows.push({
    key: 'gate: a11y (fail_on_violations)',
    value: failOn === true ? 'ON (aborta)' : 'off (warning)',
    origin: failOn === undefined ? 'default' : 'contract',
    note: 'el scan axe-core se inyecta SIEMPRE; esto es solo el gate',
  });

  // healing (contract-driven, regla #10 — off por defecto)
  const healing = (c.healing as Record<string, unknown>) ?? {};
  rows.push({
    key: 'healing (post-proceso)',
    value:
      healing.enabled === true
        ? 'ON (autonomous encadena la sanación sobre los rojos)'
        : 'off (reporta rojos y termina)',
    origin: healing.enabled === undefined ? 'default' : 'contract',
    note: '/ia4d-qa-automator:heal siempre disponible como command desacoplado',
  });

  // Evidence
  const level = (evidence.level as string) ?? 'minimal';
  rows.push({
    key: 'evidence.level',
    value: level,
    origin: evidence.level === undefined ? 'default' : 'contract',
    note: level === 'full' ? 'fuerza QA_SCREENSHOT=on + QA_TRACE=on' : undefined,
  });

  // Auth
  const authEnabled = auth.enabled === true;
  rows.push({
    key: 'auth',
    value: authEnabled ? 'enabled (setup project + storageState)' : 'off',
    origin: auth.enabled === undefined ? 'default' : 'contract',
    note: envOn(env.QA_STORAGE_STATE) || env.QA_STORAGE_STATE ? `QA_STORAGE_STATE=${env.QA_STORAGE_STATE}` : undefined,
  });

  // Locator strategy (first of priority)
  const priority = Array.isArray(locators.priority) ? (locators.priority as string[]) : [];
  rows.push({
    key: 'locators (primera prioridad)',
    value: priority[0] ?? 'getByTestId → getByRole → getByLabel → getByText',
    origin: priority.length ? 'contract' : 'default',
  });

  return rows.length ? { rows } : { rows };
}

// ---- CLI -------------------------------------------------------------------

function formatResult(res: ValidationResult): string {
  const lines: string[] = [];
  const errs = res.issues.filter((i) => i.severity === 'error');
  const warns = res.issues.filter((i) => i.severity === 'warning');
  const badge = res.ok ? (warns.length ? 'OK con avisos' : 'OK') : 'ERRORES';
  lines.push(`\n═══ Contract: ${res.contract} — ${badge} ═══`);
  if (res.issues.length === 0) {
    lines.push('  ✓ sin problemas: campos, enums, tipos y coherencia correctos');
  } else {
    for (const i of errs) lines.push(`  ✗ ERROR  ${i.path}: ${i.message}`);
    for (const i of warns) lines.push(`  ! aviso  ${i.path}: ${i.message}`);
  }
  return lines.join('\n');
}

function formatState(res: ResolvedState): string {
  const lines: string[] = ['\n─── Estado efectivo de la sesión ───'];
  for (const r of res.rows) {
    const origin = `[${r.origin}]`.padEnd(11);
    const note = r.note ? `  — ${r.note}` : '';
    lines.push(`  ${origin} ${r.key}: ${r.value}${note}`);
  }
  return lines.join('\n');
}

function main(argv: string[]): number {
  const arg = argv.find((a) => !a.startsWith('-'));
  const contractsDir = resolve(process.cwd(), 'config/style-contracts');

  let files: string[];
  if (arg) {
    const path = existsSync(arg) ? arg : resolve(contractsDir, arg);
    if (!existsSync(path)) {
      console.error(`[config] contract no encontrado: ${arg}`);
      return 1;
    }
    files = [path];
  } else {
    if (!existsSync(contractsDir)) {
      console.error(`[config] no existe ${contractsDir}`);
      return 1;
    }
    files = readdirSync(contractsDir)
      .filter((f) => /\.ya?ml$/.test(f) && !f.startsWith('_'))
      .map((f) => resolve(contractsDir, f));
    if (files.length === 0) {
      console.error('[config] no hay contracts en config/style-contracts/');
      return 1;
    }
  }

  let anyError = false;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const res = validateContract(text, basename(file));
    console.log(formatResult(res));
    if (!res.ok) anyError = true;
    // Resolved state only makes sense for a single explicit contract.
    if (arg) console.log(formatState(resolveConfigState(res.parsed)));
  }
  console.log('');
  return anyError ? 1 : 0;
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  /contract-validator\.ts$/.test(process.argv[1] ?? '');

if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
