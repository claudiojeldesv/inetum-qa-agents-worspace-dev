#!/usr/bin/env node
/**
 * pre-review — checks objetivos del Reviewer, determinísticos (Fase 3 token-efficiency, R6).
 *
 * Extrae del ia4d-reviewer los criterios que no requieren juicio: locators prohibidos (MF-1/MF-1b),
 * waits hardcodeados (MF-2), banned APIs del contract, scan a11y (MF-4, delegado en verify-a11y),
 * cita @criterion (MF-5), conteo de asserts funcionales (parte mecánica de MF-3/MF-9), uso de POM
 * (MF-8, proxy por import), toHaveClass con regex sin anclas (MF-regex-anchor, Q3) y naturaleza
 * en el título (should-fix de naming).
 *
 * NO es un gate ni sustituye al Reviewer: es la red determinística que corre tras el Writer+Reviewer
 * (Acto 4, junto a verify-a11y) y garantiza que ningún must-fix objetivo llegó al final del run.
 * El juicio (calidad de la post-condición de negocio, datos sintéticos, estado compartido,
 * should-fix contextuales) sigue siendo del ia4d-reviewer per-spec. El "Reviewer de lote" que
 * habría consumido este output fue DESCARTADO por A/B en la Fase 3 (ver token-efficiency-plan.md).
 *
 * Uso:  tsx src/scripts/pre-review.ts <spec.ts|dir>... [--style-contract=<path>] [--out-dir=<dir>]
 * Output: un JSON por spec en <out-dir>/<basename>.json (default: $QA_WORK_DIR/pre-review/ o
 * .work/pre-review/) + resumen JSON por stdout. Exit 0 siempre (informa, no bloquea).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

import { appendAuditEntry } from '../audit-log.ts';
import { extractTestBlocks, loadA11yContract, verifySpec } from './verify-a11y.ts';

export interface PreReviewContract {
  forbid_css_selectors: boolean;
  forbid_xpath: boolean;
  css_fallback_attributes: string[];
  banned_apis: string[];
  pom_enabled: boolean;
  require_business_postcondition: boolean;
  min_functional_asserts: number;
}

export interface PreReviewFinding {
  criterion_id: string; // MF-N para los must-fix, SF-naming para el should-fix
  category:
    | 'locator-strategy'
    | 'wait-strategy'
    | 'assert-quality'
    | 'a11y-missing'
    | 'criterion-not-cited'
    | 'pom-violation'
    | 'style-contract';
  severity: 'must-fix' | 'should-fix';
  location: { line: number };
  description: string;
}

export interface PreReviewResult {
  test_file: string;
  source: 'pre-review-deterministic';
  skipped: boolean;
  findings: PreReviewFinding[];
  must_fix: number;
  should_fix: number;
  clean: boolean;
}

export function loadPreReviewContract(contractPath?: string): PreReviewContract {
  const defaults: PreReviewContract = {
    forbid_css_selectors: true,
    forbid_xpath: true,
    css_fallback_attributes: [],
    banned_apis: [],
    pom_enabled: true,
    require_business_postcondition: false,
    min_functional_asserts: 1,
  };
  if (!contractPath) return defaults;
  const path = resolve(process.cwd(), contractPath);
  if (!existsSync(path)) return defaults;
  const parsed = parseYaml(readFileSync(path, 'utf8')) as Record<string, any> | null;
  if (!parsed) return defaults;
  const locators = parsed.locators ?? {};
  const testDesign = parsed.test_design ?? {};
  return {
    forbid_css_selectors: locators.forbid_css_selectors !== false,
    forbid_xpath: locators.forbid_xpath !== false,
    css_fallback_attributes: Array.isArray(locators.css_fallback_attributes)
      ? locators.css_fallback_attributes
      : [],
    banned_apis: Array.isArray(parsed.banned_apis) ? parsed.banned_apis : [],
    pom_enabled: parsed.pom?.enabled !== false,
    require_business_postcondition: testDesign.require_business_postcondition === true,
    min_functional_asserts:
      typeof testDesign.min_functional_asserts === 'number' ? testDesign.min_functional_asserts : 1,
  };
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function lineText(source: string, index: number): string {
  const start = source.lastIndexOf('\n', index) + 1;
  const end = source.indexOf('\n', index);
  return source.slice(start, end < 0 ? source.length : end);
}

const LOCATOR_CALL = /\.locator\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
const BOUNDED_ID = /^#[A-Za-z_][\w-]*$/;
const BOUNDED_ATTR = /^\[([a-zA-Z_-]+)\s*=\s*(?:"[^"]*"|'[^']*')\]$/;
const NATURE_IN_TITLE = /\b(happy[- ]?path|happy|negative|smoke)\b/i;
const TITLE_CALL = /\btest(?:\.describe)?(?:\.only|\.fixme)?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;

export function preReviewSpec(
  filePath: string,
  contract: PreReviewContract,
  a11yContractPath?: string,
): PreReviewResult {
  const file = filePath.replace(/\\/g, '/');
  const source = readFileSync(filePath, 'utf8');
  const findings: PreReviewFinding[] = [];
  const seen = new Set<string>();
  const add = (f: PreReviewFinding): void => {
    const key = `${f.criterion_id}:${f.location.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };

  if (/\.setup\.ts$/.test(file) || /import\s*\{\s*test\s+as\s+setup\s*\}/.test(source)) {
    return { test_file: file, source: 'pre-review-deterministic', skipped: true, findings: [], must_fix: 0, should_fix: 0, clean: true };
  }

  // MF-1 / MF-1b — locators CSS bruto / XPath en llamadas .locator('...')
  for (const m of source.matchAll(LOCATOR_CALL)) {
    const selector = m[2];
    const line = lineOf(source, m.index!);
    if (/^xpath=/i.test(selector) || selector.startsWith('//')) {
      if (contract.forbid_xpath) {
        add({ criterion_id: 'MF-1', category: 'locator-strategy', severity: 'must-fix', location: { line }, description: `Locator XPath prohibido: ${selector}` });
      }
      continue;
    }
    if (!contract.forbid_css_selectors) continue;
    const attrMatch = selector.match(BOUNDED_ATTR);
    const isBoundedId = BOUNDED_ID.test(selector);
    if (attrMatch || isBoundedId) {
      const attr = attrMatch ? attrMatch[1] : 'id';
      const tagged = /\/\/\s*css-fallback:/.test(lineText(source, m.index!));
      const sanctioned = contract.css_fallback_attributes.includes(attr);
      if (tagged && sanctioned) continue; // excepción legacy del contract (MF-1)
      add({
        criterion_id: 'MF-1', category: 'locator-strategy', severity: 'must-fix', location: { line },
        description: sanctioned
          ? `Selector de atributo acotado '${selector}' sin tag // css-fallback:`
          : `Selector CSS '${selector}' — atributo '${attr}' no declarado en locators.css_fallback_attributes`,
      });
    } else {
      add({ criterion_id: 'MF-1', category: 'locator-strategy', severity: 'must-fix', location: { line }, description: `Selector CSS bruto prohibido: ${selector}` });
    }
  }

  // MF-2 — waitForTimeout
  for (const m of source.matchAll(/\bwaitForTimeout\s*\(/g)) {
    add({ criterion_id: 'MF-2', category: 'wait-strategy', severity: 'must-fix', location: { line: lineOf(source, m.index!) }, description: 'page.waitForTimeout() prohibido — usar asserts semánticos sobre locators' });
  }

  // MF-regex-anchor — toHaveClass con regex sin anclas (Q3, clase del rojo TC-005 de Q2):
  // /error/ matchea por SUBSTRING contra clases compuestas siempre presentes ('input_error'
  // contiene 'error'), así que not.toHaveClass(/error/) falla aunque la clase suelta no esté.
  // Se exige ancla en el patrón: \b, \B, ^ o $.
  for (const m of source.matchAll(/\btoHaveClass\s*\(/g)) {
    const line = lineOf(source, m.index!);
    const text = lineText(source, m.index!).replace(/\/\/.*$/, ''); // sin el comentario de cola
    for (const re of text.matchAll(/\/((?:\\.|[^/\\\n])+)\/[a-z]*/g)) {
      const pattern = re[1];
      const anchored = /[\^$]/.test(pattern) || /\\[bB]/.test(pattern);
      if (!anchored) {
        add({
          criterion_id: 'MF-regex-anchor', category: 'assert-quality', severity: 'must-fix', location: { line },
          description: `toHaveClass(/${pattern}/) — regex sin anclas matchea substrings de clases compuestas (p.ej. 'input_error' contiene 'error'); ancla con \\b, ^ o $`,
        });
      }
    }
  }

  // banned_apis del contract (los ya cubiertos arriba se deduplican por línea)
  for (const api of contract.banned_apis) {
    if (api === 'xpath' || api === 'page.waitForTimeout') continue; // cubiertos por MF-1/MF-2
    let idx = source.indexOf(api);
    while (idx >= 0) {
      add({ criterion_id: 'MF-banned-api', category: 'style-contract', severity: 'must-fix', location: { line: lineOf(source, idx) }, description: `API prohibida por el contract: ${api}` });
      idx = source.indexOf(api, idx + api.length);
    }
  }

  // MF-4 — scan AxeBuilder por test() (delegado en verify-a11y: misma garantía, misma lógica)
  const a11y = verifySpec(filePath, loadA11yContract(a11yContractPath));
  for (const t of a11y.tests.filter((x) => !x.ok)) {
    add({ criterion_id: 'MF-4', category: 'a11y-missing', severity: 'must-fix', location: { line: 1 }, description: `test '${t.title}': ${t.problem}` });
  }

  // MF-5 — cita @criterion en JSDoc
  if (!/@criterion\s+\S/.test(source)) {
    add({ criterion_id: 'MF-5', category: 'criterion-not-cited', severity: 'must-fix', location: { line: 1 }, description: 'JSDoc sin cita @criterion' });
  }

  // MF-8 (proxy mecánico) — POM no importado con pom.enabled
  if (contract.pom_enabled && !/import\s+.*from\s+['"][^'"]*\.page(?:\.ts)?['"]/.test(source)) {
    add({ criterion_id: 'MF-8', category: 'pom-violation', severity: 'must-fix', location: { line: 1 }, description: 'pom.enabled:true pero el spec no importa ninguna clase *.page — verificar si existe Page para la pantalla' });
  }

  // Parte mecánica de MF-3/MF-9 — conteo de asserts funcionales por test()
  if (contract.require_business_postcondition) {
    for (const block of extractTestBlocks(source)) {
      let functional = 0;
      for (const em of block.body.matchAll(/\bexpect\s*(?:\.soft\s*)?\(/g)) {
        const stmt = block.body.slice(em.index!, block.body.indexOf('\n', em.index!) + 1 || undefined);
        if (/toHaveURL/.test(stmt)) continue; // navegación, no funcional (MF-3)
        if (/iolations|a11y/i.test(stmt)) continue; // gate a11y, no assert de negocio
        functional += 1;
      }
      if (functional < contract.min_functional_asserts) {
        add({
          criterion_id: 'MF-9', category: 'assert-quality', severity: 'must-fix', location: { line: 1 },
          description: `test '${block.title}': ${functional} assert(s) funcionales < min_functional_asserts (${contract.min_functional_asserts}) — solo navegación/a11y no basta`,
        });
      }
    }
  }

  // Should-fix — naturaleza en el título/describe (la naturaleza vive solo en el tag @negative)
  for (const m of source.matchAll(TITLE_CALL)) {
    const title = m[2];
    if (NATURE_IN_TITLE.test(title)) {
      add({ criterion_id: 'SF-naming', category: 'style-contract', severity: 'should-fix', location: { line: lineOf(source, m.index!) }, description: `Título '${title}' nombra la naturaleza — describir condición → resultado` });
    }
  }

  const mustFix = findings.filter((f) => f.severity === 'must-fix').length;
  const shouldFix = findings.length - mustFix;
  return {
    test_file: file,
    source: 'pre-review-deterministic',
    skipped: false,
    findings,
    must_fix: mustFix,
    should_fix: shouldFix,
    clean: mustFix === 0,
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
  const outDirArg = args.find((a) => a.startsWith('--out-dir='))?.slice('--out-dir='.length);
  const targets = args.filter((a) => !a.startsWith('--'));

  if (targets.length === 0) {
    console.error('[pre-review] uso: tsx src/scripts/pre-review.ts <spec.ts|dir>... [--style-contract=<path>] [--out-dir=<dir>]');
    process.exit(1);
  }

  const contract = loadPreReviewContract(contractPath);
  const specs = collectSpecs(targets);
  if (specs.length === 0) {
    console.error(`[pre-review] no se encontraron specs en: ${targets.join(', ')}`);
    process.exit(1);
  }

  const outDir = resolve(process.cwd(), outDirArg || join(process.env.QA_WORK_DIR || '.work', 'pre-review'));
  mkdirSync(outDir, { recursive: true });

  const results = specs.map((s) => preReviewSpec(s, contract, contractPath));
  for (const r of results) {
    if (r.skipped) continue;
    writeFileSync(join(outDir, `${basename(r.test_file)}.json`), JSON.stringify(r, null, 2), 'utf8');
    appendAuditEntry({
      source: 'command',
      action: r.clean ? 'allow' : 'warn',
      target: basename(r.test_file),
      rule: 'pre-review-deterministic',
      reason: r.clean
        ? 'checks objetivos OK (red determinística post-review)'
        : `${r.must_fix} must-fix determinísticos: ${[...new Set(r.findings.filter((f) => f.severity === 'must-fix').map((f) => f.criterion_id))].join(', ')}`,
      result: r.clean ? 'pass' : 'fail',
    });
  }

  const active = results.filter((r) => !r.skipped);
  console.log(
    JSON.stringify(
      {
        out_dir: outDir.replace(/\\/g, '/'),
        specs_total: active.length,
        specs_clean: active.filter((r) => r.clean).length,
        must_fix_total: active.reduce((n, r) => n + r.must_fix, 0),
        should_fix_total: active.reduce((n, r) => n + r.should_fix, 0),
        dirty_specs: active.filter((r) => !r.clean).map((r) => ({
          file: r.test_file,
          criteria: [...new Set(r.findings.filter((f) => f.severity === 'must-fix').map((f) => f.criterion_id))],
        })),
      },
      null,
      2,
    ),
  );
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('pre-review.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
