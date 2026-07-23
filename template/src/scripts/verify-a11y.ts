#!/usr/bin/env node
/**
 * verify-a11y — verificación determinística del scan de accesibilidad en los specs.
 *
 * Sustituye la pasada LLM de `ia4d-a11y-injector` ×N por spec (Fase 1 token-efficiency): el
 * ia4d-writer YA inyecta el scan AxeBuilder (paso 3 de su prompt); este script verifica que lo
 * hizo. La regla dura "scan siempre inyectado" se garantiza igual o mejor: verificación
 * determinística en vez de fe en el Haiku. El injector pasa de camino caliente a RESCATE — el
 * command solo lo invoca para los specs que este script marque en rojo.
 *
 * Por cada `test()` del spec comprueba:
 *   1. El scan `AxeBuilder` está presente (y después del primer `.goto(` si el test navega).
 *   2. El modo corresponde a `a11y.fail_on_violations` del Style Contract:
 *      - `true`  → gate: `expect(<...>iolations).toEqual([])` (aborta el test).
 *      - `false` → warning: `test.info().annotations.push({ type: 'a11y-...' })` (evidencia).
 *
 * Los ficheros de setup (`*.setup.ts` / `import { test as setup }`) se saltan: el auth-setup
 * no lleva AxeBuilder por diseño (es setup, no test del flujo).
 *
 * Uso:  tsx src/scripts/verify-a11y.ts <spec.ts|dir> [más specs/dirs...] [--style-contract=<path>]
 * Salida: JSON por stdout con el detalle por spec. Exit 0 = todos OK; exit 1 = lista de specs
 * sin scan (o con modo equivocado) — esos son los que el command manda al injector.
 * Registra el gate-mode por spec al audit-log (mismo rastro que dejaba el paso del injector).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

import { appendAuditEntry } from '../audit-log.ts';

export interface A11yContract {
  fail_on_violations: boolean;
  severity_threshold: string[];
}

export interface TestBlockResult {
  title: string;
  ok: boolean;
  problem: string | null;
}

export interface SpecResult {
  file: string;
  skipped: boolean;
  gate_mode: 'fail' | 'warning';
  tests: TestBlockResult[];
  ok: boolean;
}

export function loadA11yContract(contractPath?: string): A11yContract {
  const defaults: A11yContract = { fail_on_violations: false, severity_threshold: ['serious', 'critical'] };
  if (!contractPath) return defaults;
  const path = resolve(process.cwd(), contractPath);
  if (!existsSync(path)) return defaults;
  const parsed = parseYaml(readFileSync(path, 'utf8')) as { a11y?: Partial<A11yContract> } | null;
  const a11y = parsed?.a11y ?? {};
  return {
    fail_on_violations: a11y.fail_on_violations === true,
    severity_threshold: Array.isArray(a11y.severity_threshold) && a11y.severity_threshold.length > 0
      ? a11y.severity_threshold
      : defaults.severity_threshold,
  };
}

const TEST_START = /\btest(?:\.only|\.fixme)?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;

/** Segmenta el fuente en bloques test(): de cada arranque hasta el siguiente (o EOF). */
export function extractTestBlocks(source: string): Array<{ title: string; body: string }> {
  const starts: Array<{ index: number; title: string }> = [];
  for (const m of source.matchAll(TEST_START)) {
    starts.push({ index: m.index!, title: m[2] });
  }
  return starts.map((s, i) => ({
    title: s.title,
    body: source.slice(s.index, i + 1 < starts.length ? starts[i + 1].index : source.length),
  }));
}

export function verifySpec(filePath: string, contract: A11yContract): SpecResult {
  const gateMode: 'fail' | 'warning' = contract.fail_on_violations ? 'fail' : 'warning';
  const file = filePath.replace(/\\/g, '/');
  const source = readFileSync(filePath, 'utf8');

  if (/\.setup\.ts$/.test(file) || /import\s*\{\s*test\s+as\s+setup\s*\}/.test(source)) {
    return { file, skipped: true, gate_mode: gateMode, tests: [], ok: true };
  }

  const blocks = extractTestBlocks(source);
  // Acepta default y named import — el paquete exporta AxeBuilder de las dos formas (≥4.5).
  const hasImport = /import\s+(?:AxeBuilder|\{[^}]*\bAxeBuilder\b[^}]*\})\s+from\s+['"]@axe-core\/playwright['"]/.test(source);

  const tests: TestBlockResult[] = blocks.map(({ title, body }) => {
    const axeAt = body.indexOf('AxeBuilder');
    if (axeAt < 0) return { title, ok: false, problem: 'sin scan AxeBuilder' };
    if (!hasImport) return { title, ok: false, problem: "falta import AxeBuilder from '@axe-core/playwright'" };

    const gotoAt = body.search(/\.goto\s*\(/);
    if (gotoAt >= 0 && axeAt < gotoAt) {
      return { title, ok: false, problem: 'scan AxeBuilder antes del primer goto (debe correr sobre la página cargada)' };
    }

    if (gateMode === 'fail') {
      const gated = /expect\(\s*\w*[Vv]iolations\w*\s*\)\s*\.\s*(toEqual\(\s*\[\s*\]\s*\)|toHaveLength\(\s*0\s*\))/.test(body);
      if (!gated) {
        return { title, ok: false, problem: 'contract pide fail_on_violations:true pero el scan no aborta (falta expect(...violations).toEqual([]))' };
      }
    } else {
      const annotated = /annotations\s*\.\s*push\s*\(/.test(body) && /a11y/i.test(body);
      if (!annotated) {
        return { title, ok: false, problem: 'modo warning: el scan no registra annotation a11y (falta test.info().annotations.push)' };
      }
    }
    return { title, ok: true, problem: null };
  });

  const ok = blocks.length > 0 && tests.every((t) => t.ok);
  return {
    file,
    skipped: false,
    gate_mode: gateMode,
    tests: blocks.length > 0 ? tests : [{ title: '(ninguno)', ok: false, problem: 'el spec no contiene bloques test()' }],
    ok,
  };
}

function collectSpecs(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const abs = resolve(process.cwd(), p);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isDirectory()) {
      for (const f of readdirSync(abs)) {
        if ((f.endsWith('.spec.ts') || f.endsWith('.setup.ts')) && f !== 'seed.spec.ts') out.push(join(abs, f));
      }
    } else {
      out.push(abs);
    }
  }
  return out.sort();
}

function main(): void {
  const args = process.argv.slice(2);
  const contractPath = args.find((a) => a.startsWith('--style-contract='))?.slice('--style-contract='.length);
  const targets = args.filter((a) => !a.startsWith('--'));

  if (targets.length === 0) {
    console.error('[verify-a11y] uso: tsx src/scripts/verify-a11y.ts <spec.ts|dir>... [--style-contract=<path>]');
    process.exit(1);
  }

  const contract = loadA11yContract(contractPath);
  const specs = collectSpecs(targets);
  if (specs.length === 0) {
    console.error(`[verify-a11y] no se encontraron specs en: ${targets.join(', ')}`);
    process.exit(1);
  }

  const results = specs.map((s) => verifySpec(s, contract));

  for (const r of results.filter((x) => !x.skipped)) {
    appendAuditEntry({
      source: 'command',
      action: r.ok ? (r.gate_mode === 'warning' ? 'warn' : 'allow') : 'block',
      target: basename(r.file),
      rule: 'a11y-gate',
      reason: r.ok
        ? `fail_on_violations:${contract.fail_on_violations} → ${r.gate_mode} mode (verificado determinístico)`
        : `scan a11y ausente o modo equivocado — escalar a ia4d-a11y-injector`,
      result: r.ok ? 'pass' : 'fail',
    });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify(
      {
        gate_mode: contract.fail_on_violations ? 'fail' : 'warning',
        severity_threshold: contract.severity_threshold,
        specs_total: results.length,
        specs_ok: results.length - failed.length,
        failed_specs: failed.map((r) => ({
          file: r.file,
          problems: r.tests.filter((t) => !t.ok).map((t) => `${t.title}: ${t.problem}`),
        })),
        results,
      },
      null,
      2,
    ),
  );
  process.exit(failed.length > 0 ? 1 : 0);
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('verify-a11y.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
