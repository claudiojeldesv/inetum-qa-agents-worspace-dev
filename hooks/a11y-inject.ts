/**
 * CLI — `npx tsx hooks/a11y-inject.ts --spec <path> [--mode <block|warn|skip>] [--reason "<texto>"]`
 *
 * Inyecta (o no) el check de axe-core en cada `test(...)` del .spec.ts
 * indicado, según el modo declarado por el SDET o por el Style Contract:
 *
 *   --mode block (default): inyecta
 *       const _axe = await new AxeBuilder({ page }).analyze();
 *       expect(_axe.violations).toEqual([]);
 *
 *   --mode warn: inyecta una versión no-bloqueante
 *       const _axe = await new AxeBuilder({ page }).analyze();
 *       if (_axe.violations.length > 0) {
 *         console.warn('[a11y][warn] ' + _axe.violations.length +
 *           ' violation(s) — downgrade declarado por SDET');
 *       }
 *
 *   --mode skip: no inyecta nada. El subagent reporta skipped:N. La
 *       responsabilidad del audit trail vive en hooks/policy-skip.ts
 *       (lo invoca el slash command al inicio cuando detecta no-block).
 *
 * Reason es obligatorio si --mode != block. Se acepta como argumento
 * pero el CLI no lo persiste — solo lo valida. La persistencia del
 * reason vive en la entry audit emitida por policy-skip.ts.
 *
 * Output JSON a stdout (shape varía por modo):
 *   block:  { specFile, mode:'block', injected, alreadyPresent, importsAdded }
 *   warn:   { specFile, mode:'warn',  injected, alreadyPresent, importsAdded }
 *   skip:   { specFile, mode:'skip',  skipped:N }
 *
 * Exit 0 si éxito. Exit 1 si error de I/O, archivo sin test(),
 * o --reason faltante cuando se requiere.
 */

import { readFile, writeFile } from 'node:fs/promises';

import { Project, SyntaxKind, type ArrowFunction, type CallExpression, type FunctionExpression } from 'ts-morph';

export type A11yMode = 'block' | 'warn' | 'skip';

interface InjectReportBlockOrWarn {
  specFile: string;
  mode: 'block' | 'warn';
  injected: number;
  alreadyPresent: number;
  importsAdded: string[];
}

interface InjectReportSkip {
  specFile: string;
  mode: 'skip';
  skipped: number;
}

export type InjectReport = InjectReportBlockOrWarn | InjectReportSkip;

const SNIPPET_BLOCK = [
  '  const _axe = await new AxeBuilder({ page }).analyze();',
  '  expect(_axe.violations).toEqual([]);',
];

const SNIPPET_WARN = [
  '  const _axe = await new AxeBuilder({ page }).analyze();',
  '  if (_axe.violations.length > 0) {',
  "    console.warn('[a11y][warn] ' + _axe.violations.length + ' violation(s) — downgrade declarado por SDET');",
  '  }',
];

function snippetFor(mode: 'block' | 'warn'): string[] {
  return mode === 'block' ? SNIPPET_BLOCK : SNIPPET_WARN;
}

function parseArgs(argv: string[]): {
  spec: string | null;
  mode: A11yMode;
  reason: string | null;
} {
  let spec: string | null = null;
  let mode: A11yMode = 'block';
  let reason: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--spec') spec = argv[++i] ?? null;
    else if (a === '--mode') {
      const v = argv[++i] ?? '';
      if (v === 'block' || v === 'warn' || v === 'skip') mode = v;
      else {
        process.stderr.write(`[a11y-inject] --mode debe ser block|warn|skip (recibido: ${v})\n`);
        process.exit(1);
      }
    } else if (a === '--reason') reason = argv[++i] ?? null;
  }
  return { spec, mode, reason };
}

function ensureImports(
  project: Project,
  sourceText: string,
  needsExpect: boolean,
): { text: string; added: string[] } {
  const added: string[] = [];
  const source = project.createSourceFile('virtual.spec.ts', sourceText, { overwrite: true });

  // @axe-core/playwright — AxeBuilder
  let axe = source.getImportDeclaration((d) => d.getModuleSpecifierValue() === '@axe-core/playwright');
  if (!axe) {
    axe = source.addImportDeclaration({
      moduleSpecifier: '@axe-core/playwright',
      namedImports: ['AxeBuilder'],
    });
    added.push('@axe-core/playwright');
  } else {
    const declared = new Set(axe.getNamedImports().map((n) => n.getName()));
    if (!declared.has('AxeBuilder')) {
      axe.addNamedImport('AxeBuilder');
      if (!added.includes('@axe-core/playwright')) added.push('@axe-core/playwright');
    }
  }

  // @playwright/test — expect (solo en modo block; modo warn no usa expect)
  if (needsExpect) {
    let pw = source.getImportDeclaration((d) => d.getModuleSpecifierValue() === '@playwright/test');
    if (!pw) {
      pw = source.addImportDeclaration({
        moduleSpecifier: '@playwright/test',
        namedImports: ['expect'],
      });
      added.push('@playwright/test');
    } else {
      const declared = new Set(pw.getNamedImports().map((n) => n.getName()));
      if (!declared.has('expect')) {
        pw.addNamedImport('expect');
        if (!added.includes('@playwright/test')) added.push('@playwright/test');
      }
    }
  }

  return { text: source.getFullText(), added };
}

function findTestCalls(project: Project, sourceText: string): CallExpression[] {
  const source = project.createSourceFile('inspect.spec.ts', sourceText, { overwrite: true });
  const out: CallExpression[] = [];
  source.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.CallExpression) return;
    const call = node as CallExpression;
    const expr = call.getExpression().getText();
    // matches `test`, `test.only`, `test.skip`. Excluye `test.fixme`,
    // `test.describe`, `test.beforeEach`, etc.
    if (expr === 'test' || expr === 'test.only' || expr === 'test.skip') {
      out.push(call);
    }
  });
  return out;
}

function injectSnippets(
  sourceText: string,
  project: Project,
  snippet: string[],
): { text: string; injected: number; alreadyPresent: number } {
  let working = sourceText;
  let injected = 0;
  let alreadyPresent = 0;

  const initialCount = findTestCalls(project, working).length;
  for (let iter = 0; iter < initialCount; iter++) {
    const calls = findTestCalls(project, working);
    let mutated = false;
    for (const call of calls) {
      const args = call.getArguments();
      if (args.length < 2) continue;
      const callback = args[1];
      if (!callback) continue;
      const cbKind = callback.getKind();
      if (cbKind !== SyntaxKind.ArrowFunction && cbKind !== SyntaxKind.FunctionExpression) {
        continue;
      }
      const body = (callback as ArrowFunction | FunctionExpression).getBody();
      if (body.getKind() !== SyntaxKind.Block) continue;
      const bodyText = body.getText();
      if (bodyText.includes('new AxeBuilder(')) {
        alreadyPresent++;
        continue;
      }
      const bodyStart = body.getStart();
      const openBrace = working.indexOf('{', bodyStart);
      if (openBrace === -1) continue;
      const insertAt = openBrace + 1;
      const snippetText = '\n' + snippet.join('\n') + '\n';
      working = working.slice(0, insertAt) + snippetText + working.slice(insertAt);
      injected++;
      mutated = true;
      break;
    }
    if (!mutated) break;
  }
  return { text: working, injected, alreadyPresent };
}

/**
 * Función pura para tests vitest. Devuelve el texto resultante y el
 * report; no toca el filesystem.
 */
export function processContent(
  sourceText: string,
  mode: A11yMode,
): { text: string; report: InjectReport; testCount: number } {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
  });

  const tests = findTestCalls(project, sourceText);
  const testCount = tests.length;

  if (mode === 'skip') {
    const report: InjectReport = {
      specFile: '<inline>',
      mode: 'skip',
      skipped: testCount,
    };
    return { text: sourceText, report, testCount };
  }

  const needsExpect = mode === 'block';
  const importStep = ensureImports(project, sourceText, needsExpect);
  let content = importStep.text;

  const injectStep = injectSnippets(content, project, snippetFor(mode));
  content = injectStep.text;

  const report: InjectReport = {
    specFile: '<inline>',
    mode,
    injected: injectStep.injected,
    alreadyPresent: injectStep.alreadyPresent,
    importsAdded: importStep.added,
  };
  return { text: content, report, testCount };
}

async function main(): Promise<void> {
  const { spec, mode, reason } = parseArgs(process.argv.slice(2));
  if (!spec) {
    process.stderr.write('[a11y-inject] uso: --spec <path> [--mode block|warn|skip] [--reason "<texto>"]\n');
    process.exit(1);
  }
  if (mode !== 'block' && (!reason || reason.trim().length === 0)) {
    process.stderr.write(`[a11y-inject] --reason es obligatorio cuando --mode=${mode}\n`);
    process.exit(1);
  }

  let content: string;
  try {
    content = await readFile(spec, 'utf8');
  } catch (err) {
    process.stderr.write(`[a11y-inject] no se pudo leer spec: ${(err as Error).message}\n`);
    process.exit(1);
  }

  const { text, report, testCount } = processContent(content, mode);

  if (testCount === 0) {
    process.stderr.write(`[a11y-inject] el archivo no contiene ningún test(): ${spec}\n`);
    process.exit(1);
  }

  if (mode !== 'skip') {
    await writeFile(spec, text, 'utf8');
  }

  const finalReport: InjectReport = { ...report, specFile: spec };
  process.stdout.write(JSON.stringify(finalReport) + '\n');
  process.exit(0);
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
