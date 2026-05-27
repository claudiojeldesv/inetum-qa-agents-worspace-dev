/**
 * CLI — `npx tsx hooks/style-enforce.ts --spec <path> --contract <path> [--fix]`
 *
 * Aplica un Style Contract a un .spec.ts recién escrito por el
 * playwright-test-generator nativo. Combina ts-morph (AST mínimo, solo
 * para manipulación segura de ImportDeclarations) con regex para las
 * reglas restantes. Determinista — el subagent ia4d-style-enforcer
 * únicamente expone su output al SDET.
 *
 * Severidades:
 *   block → exit 2, JSON con pass:false
 *   warn  → exit 0, JSON con pass:true y violations con severity:warn
 *
 * En modo --fix:
 *   - inserta imports requeridos faltantes
 *   - elimina llamadas a page.waitForTimeout(...) y page.pause()
 *   - re-evalúa violations sobre el texto resultante
 *
 * Schema documentado en references/style-contract-schema.md.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

import { Project } from 'ts-morph';
import { parse as parseYaml } from 'yaml';

interface RequiredImport {
  module: string;
  named: string[];
}

interface StyleContract {
  version: number;
  client?: string;
  pom?: {
    enabled?: boolean;
    dir?: string;
    classSuffix?: string;
  };
  locators?: {
    priority?: string[];
    banned?: string[];
  };
  bannedApis?: string[];
  a11y?: {
    enabled?: boolean;
    injectorImport?: string;
  };
  requiredImports?: RequiredImport[];
  jsdoc?: {
    citeCriterion?: boolean;
  };
}

export interface Violation {
  rule:
    | 'BANNED_API'
    | 'RAW_CSS_LOCATOR'
    | 'XPATH_LOCATOR'
    | 'MISSING_IMPORT'
    | 'MISSING_JSDOC_CRITERION'
    | 'POM_REFERENCED_NOT_FOUND';
  severity: 'block' | 'warn';
  line: number;
  column: number;
  detail: string;
}

interface FixApplied {
  rule: 'BANNED_API' | 'MISSING_IMPORT';
  line: number;
  detail: string;
}

interface EnforceReport {
  pass: boolean;
  specFile: string;
  contractFile: string;
  violations: Violation[];
  fixesApplied: FixApplied[];
}

function parseArgs(argv: string[]): {
  spec: string | null;
  contract: string | null;
  fix: boolean;
} {
  let spec: string | null = null;
  let contract: string | null = null;
  let fix = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--spec') spec = argv[++i] ?? null;
    else if (a === '--contract') contract = argv[++i] ?? null;
    else if (a === '--fix') fix = true;
  }
  return { spec, contract, fix };
}

function locateInText(content: string, regex: RegExp): Array<{ line: number; column: number; match: string }> {
  const out: Array<{ line: number; column: number; match: string }> = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const m of line.matchAll(regex)) {
      out.push({ line: i + 1, column: (m.index ?? 0) + 1, match: m[0] });
    }
  }
  return out;
}

function detectBannedApis(content: string, banned: string[]): Violation[] {
  const violations: Violation[] = [];
  for (const api of banned) {
    const escaped = api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\s*\\(`, 'g');
    for (const hit of locateInText(content, regex)) {
      violations.push({
        rule: 'BANNED_API',
        severity: 'block',
        line: hit.line,
        column: hit.column,
        detail: `Uso prohibido por contract: ${api}`,
      });
    }
  }
  return violations;
}

function detectBadLocators(content: string, banned: string[]): Violation[] {
  const violations: Violation[] = [];
  // page.locator('...') o locator('...') con argumento string.
  // Tres alternativas para tolerar comillas internas heterogéneas.
  const locatorRe = /\blocator\s*\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g;
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const m of line.matchAll(locatorRe)) {
      const arg = m[1] ?? m[2] ?? m[3] ?? '';
      const col = (m.index ?? 0) + 1;
      const isXpath = arg.startsWith('//') || arg.startsWith('xpath=');
      const isCss = !isXpath; // todo string en locator() que no es xpath se trata como CSS raw
      if (isXpath && banned.includes('xpath')) {
        violations.push({
          rule: 'XPATH_LOCATOR',
          severity: 'block',
          line: i + 1,
          column: col,
          detail: `XPath locator prohibido: ${arg}`,
        });
      } else if (isCss && banned.includes('rawCss')) {
        violations.push({
          rule: 'RAW_CSS_LOCATOR',
          severity: 'block',
          line: i + 1,
          column: col,
          detail: `Raw CSS locator prohibido: ${arg}`,
        });
      }
    }
  }
  return violations;
}

function detectMissingJsdocCriterion(content: string): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split(/\r?\n/);
  const criterionRe = /\b(RF|FREE|GAP)-\d+\b/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const testMatch = line.match(/^\s*test\s*\(/);
    if (!testMatch) continue;
    // mira hacia atrás hasta encontrar el cierre de un JSDoc */
    let j = i - 1;
    let foundClose = false;
    while (j >= 0 && /^\s*$/.test(lines[j] ?? '')) j--;
    if (j >= 0 && (lines[j] ?? '').includes('*/')) {
      foundClose = true;
    }
    if (!foundClose) {
      violations.push({
        rule: 'MISSING_JSDOC_CRITERION',
        severity: 'warn',
        line: i + 1,
        column: 1,
        detail: 'test(...) sin JSDoc previo citando criterio (RF-NNN / FREE-NNN / GAP-NNN).',
      });
      continue;
    }
    // recolecta el bloque jsdoc hacia atrás hasta /**
    let k = j;
    const blockLines: string[] = [];
    while (k >= 0) {
      const ln = lines[k] ?? '';
      blockLines.unshift(ln);
      if (ln.includes('/**')) break;
      k--;
    }
    const block = blockLines.join('\n');
    if (!criterionRe.test(block)) {
      violations.push({
        rule: 'MISSING_JSDOC_CRITERION',
        severity: 'warn',
        line: i + 1,
        column: 1,
        detail: 'JSDoc del test no cita criterio (RF-NNN / FREE-NNN / GAP-NNN).',
      });
    }
  }
  return violations;
}

function detectMissingImports(
  content: string,
  required: RequiredImport[],
): Violation[] {
  const violations: Violation[] = [];
  if (required.length === 0) return violations;
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
  });
  const source = project.createSourceFile('virtual.spec.ts', content, { overwrite: true });
  const imports = source.getImportDeclarations();
  for (const req of required) {
    const decl = imports.find((d) => d.getModuleSpecifierValue() === req.module);
    if (!decl) {
      violations.push({
        rule: 'MISSING_IMPORT',
        severity: 'block',
        line: 1,
        column: 1,
        detail: `Falta import desde '${req.module}' (named: ${req.named.join(', ')})`,
      });
      continue;
    }
    const declared = new Set(decl.getNamedImports().map((n) => n.getName()));
    const missing = req.named.filter((n) => !declared.has(n));
    if (missing.length > 0) {
      violations.push({
        rule: 'MISSING_IMPORT',
        severity: 'block',
        line: decl.getStartLineNumber(),
        column: 1,
        detail: `Imports faltantes desde '${req.module}': ${missing.join(', ')}`,
      });
    }
  }
  return violations;
}

function applyFixes(
  content: string,
  required: RequiredImport[],
  bannedApis: string[],
): { content: string; fixes: FixApplied[] } {
  const fixes: FixApplied[] = [];
  let working = content;

  // 1) eliminar banned APIs (sustituye la línea entera por comentario)
  const lines = working.split(/\r?\n/);
  for (const api of bannedApis) {
    const escaped = api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\s*\\(`);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (regex.test(line)) {
        lines[i] = `// [enforcer] ${api} eliminado — usa wait semántico`;
        fixes.push({
          rule: 'BANNED_API',
          line: i + 1,
          detail: `Línea reemplazada por comentario (${api}).`,
        });
      }
    }
  }
  working = lines.join('\n');

  // 2) insertar imports requeridos faltantes vía ts-morph
  if (required.length > 0) {
    const project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
    });
    const source = project.createSourceFile('virtual.spec.ts', working, { overwrite: true });
    let mutated = false;
    for (const req of required) {
      let decl = source.getImportDeclaration((d) => d.getModuleSpecifierValue() === req.module);
      if (!decl) {
        decl = source.addImportDeclaration({
          moduleSpecifier: req.module,
          namedImports: req.named,
        });
        mutated = true;
        fixes.push({
          rule: 'MISSING_IMPORT',
          line: decl.getStartLineNumber(),
          detail: `Import añadido desde '${req.module}' (named: ${req.named.join(', ')}).`,
        });
      } else {
        const declared = new Set(decl.getNamedImports().map((n) => n.getName()));
        const missing = req.named.filter((n) => !declared.has(n));
        if (missing.length > 0) {
          decl.addNamedImports(missing);
          mutated = true;
          fixes.push({
            rule: 'MISSING_IMPORT',
            line: decl.getStartLineNumber(),
            detail: `Imports añadidos a '${req.module}': ${missing.join(', ')}.`,
          });
        }
      }
    }
    if (mutated) working = source.getFullText();
  }

  return { content: working, fixes };
}

function detectPomMissing(content: string, contract: StyleContract, specFile: string): Violation[] {
  const violations: Violation[] = [];
  const pom = contract.pom;
  if (!pom?.enabled) return violations;
  const dir = pom.dir ?? 'tests/pages';
  const suffix = pom.classSuffix ?? 'Page';
  // detecta `new XxxPage(` o `new XxxPage()` y resuelve el import
  const newRe = new RegExp(`new\\s+(\\w+${suffix})\\s*\\(`, 'g');
  const referenced = new Set<string>();
  for (const m of content.matchAll(newRe)) {
    if (m[1]) referenced.add(m[1]);
  }
  if (referenced.size === 0) return violations;

  // resuelve imports relativos del spec para cada clase
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
  });
  const source = project.createSourceFile('virtual.spec.ts', content, { overwrite: true });
  const importMap = new Map<string, string>(); // className → moduleSpecifier
  for (const imp of source.getImportDeclarations()) {
    const mod = imp.getModuleSpecifierValue();
    for (const named of imp.getNamedImports()) {
      importMap.set(named.getName(), mod);
    }
    const defaultImport = imp.getDefaultImport()?.getText();
    if (defaultImport) importMap.set(defaultImport, mod);
  }

  const specDir = dirname(isAbsolute(specFile) ? specFile : join(process.cwd(), specFile));

  for (const cls of referenced) {
    const mod = importMap.get(cls);
    if (!mod) {
      // no import → no podemos validar filesystem, marcamos warn
      violations.push({
        rule: 'POM_REFERENCED_NOT_FOUND',
        severity: 'warn',
        line: 1,
        column: 1,
        detail: `Clase ${cls} usada pero no importada — no se puede verificar POM en ${dir}/.`,
      });
      continue;
    }
    if (!mod.startsWith('.')) continue; // skip non-relative
    const candidates = [`${mod}.ts`, `${mod}.tsx`, mod];
    const found = candidates.some((c) => existsSync(join(specDir, c)));
    if (!found) {
      violations.push({
        rule: 'POM_REFERENCED_NOT_FOUND',
        severity: 'warn',
        line: 1,
        column: 1,
        detail: `POM ${cls} referenciado pero archivo no existe relativo al spec: ${mod}`,
      });
    }
  }
  return violations;
}

function evaluate(content: string, contract: StyleContract, specFile: string): Violation[] {
  const violations: Violation[] = [];
  violations.push(...detectBannedApis(content, contract.bannedApis ?? []));
  violations.push(...detectBadLocators(content, contract.locators?.banned ?? []));
  violations.push(...detectMissingImports(content, contract.requiredImports ?? []));
  if (contract.jsdoc?.citeCriterion) {
    violations.push(...detectMissingJsdocCriterion(content));
  }
  violations.push(...detectPomMissing(content, contract, specFile));
  return violations;
}

async function main(): Promise<void> {
  const { spec, contract: contractPath, fix } = parseArgs(process.argv.slice(2));
  if (!spec || !contractPath) {
    process.stderr.write(
      '[style-enforce] uso: --spec <path> --contract <path> [--fix]\n',
    );
    process.exit(1);
  }

  let content: string;
  try {
    content = await readFile(spec, 'utf8');
  } catch (err) {
    process.stderr.write(`[style-enforce] no se pudo leer spec: ${(err as Error).message}\n`);
    process.exit(1);
  }

  let contractRaw: string;
  try {
    contractRaw = await readFile(contractPath, 'utf8');
  } catch (err) {
    process.stderr.write(`[style-enforce] no se pudo leer contract: ${(err as Error).message}\n`);
    process.exit(1);
  }

  let contract: StyleContract;
  try {
    contract = parseYaml(contractRaw) as StyleContract;
  } catch (err) {
    process.stderr.write(`[style-enforce] contract YAML inválido: ${(err as Error).message}\n`);
    process.exit(1);
  }

  let fixes: FixApplied[] = [];
  if (fix) {
    const r = applyFixes(content, contract.requiredImports ?? [], contract.bannedApis ?? []);
    content = r.content;
    fixes = r.fixes;
    await writeFile(spec, content, 'utf8');
  }

  const violations = evaluate(content, contract, spec);
  const blocking = violations.some((v) => v.severity === 'block');

  const report: EnforceReport = {
    pass: !blocking,
    specFile: spec,
    contractFile: contractPath,
    violations,
    fixesApplied: fixes,
  };

  process.stdout.write(JSON.stringify(report) + '\n');
  process.exit(blocking ? 2 : 0);
}

void main();
