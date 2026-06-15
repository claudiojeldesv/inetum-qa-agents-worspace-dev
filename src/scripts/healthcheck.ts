#!/usr/bin/env tsx
/**
 * Healthcheck estructural de ia4d-qa-automator.
 * Verifica que el runtime del agente está completo y cableado, sin invocar el MCP
 * ni gastar tokens. Determinístico: solo comprueba presencia de archivos y wiring.
 *
 * Uso: npm run qa:healthcheck
 * Exit 0 si todo OK, 1 si falta algo crítico.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const r = (p: string) => resolve(root, p);

type Check = { label: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function fileCheck(label: string, rel: string): void {
  checks.push({ label, ok: existsSync(r(rel)), detail: rel });
}

function dirCountCheck(label: string, rel: string, min: number): void {
  const ok = existsSync(r(rel)) && readdirSync(r(rel)).length >= min;
  const n = existsSync(r(rel)) ? readdirSync(r(rel)).length : 0;
  checks.push({ label, ok, detail: `${rel} (${n} entradas, min ${min})` });
}

// Subagents
dirCountCheck('Subagents en .claude/agents', '.claude/agents', 10);
// Commands
fileCheck('Command autonomous (S4)', '.claude/commands/qa-automator/autonomous.md');
fileCheck('Command req-driven (S2)', '.claude/commands/qa-automator/req-driven.md');
fileCheck('Command spec-refiner (S3)', '.claude/commands/qa-automator/spec-refiner.md');
fileCheck('Command healthcheck', '.claude/commands/qa-automator/healthcheck.md');
// Hooks cableados
fileCheck('Hook compliance pre-flight', 'hooks/pre-flight.ts');
fileCheck('Hook PII/anti-fixme post-write', 'hooks/pii-post.ts');
fileCheck('Hook audit-write', 'hooks/audit-write.ts');
fileCheck('settings.json cablea hooks', '.claude/settings.json');
// Lógica determinística
fileCheck('POM scaffolder', 'src/pom-scaffolder.ts');
fileCheck('Compliance pre-flight (lógica)', 'src/compliance-preflight.ts');
fileCheck('PII detector', 'src/pii-detector.ts');
fileCheck('Gherkin→criteria (S2)', 'src/gherkin-to-criteria.ts');
fileCheck('Judge scoring', 'src/judge-scoring.ts');
// Config declarativa
fileCheck('allowed-targets (compliance)', 'config/allowed-targets.yaml');
fileCheck('MCP playwright-test', '.mcp.json');
fileCheck('playwright.config.ts', 'playwright.config.ts');

// Verificación de wiring: settings.json debe registrar los 3 hooks
if (existsSync(r('.claude/settings.json'))) {
  try {
    const s = JSON.parse(readFileSync(r('.claude/settings.json'), 'utf8'));
    const wired =
      s.hooks?.PreToolUse?.length > 0 &&
      s.hooks?.PostToolUse?.length > 0 &&
      s.hooks?.Stop?.length > 0;
    checks.push({
      label: 'settings.json registra PreToolUse/PostToolUse/Stop',
      ok: !!wired,
      detail: wired ? '3 hooks cableados' : 'faltan bloques de hooks',
    });
  } catch {
    checks.push({ label: 'settings.json parseable', ok: false, detail: 'JSON inválido' });
  }
}

// Gates opcionales (informativo, no falla)
const pii = process.env.QA_ENABLE_PII === '1';
const judge = process.env.QA_ENABLE_JUDGE === '1';

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? '  OK  ' : ' FAIL '} ${c.label}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log('');
console.log(`Gates opcionales: PII=${pii ? 'ON' : 'off'}  Judge=${judge ? 'ON' : 'off'}  (toggles: QA_ENABLE_PII / QA_ENABLE_JUDGE)`);
console.log('');

if (failed.length > 0) {
  console.error(`Healthcheck FAILED: ${failed.length} comprobación(es) crítica(s) sin pasar.`);
  process.exit(1);
}
console.log(`Healthcheck OK: runtime de ia4d-qa-automator completo (${checks.length} comprobaciones).`);
