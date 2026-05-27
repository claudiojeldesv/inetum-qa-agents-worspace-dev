/**
 * CLI — `npx tsx hooks/a11y-inject.ts --spec <path>`
 *
 * Inyecta el check de axe-core en cada `test(...)` del .spec.ts indicado.
 * Baked-in, no opcional (SPEC §6 — Always do).
 *
 * Operación:
 *   1) asegura import { AxeBuilder } from '@axe-core/playwright'
 *   2) por cada `test('...', async ({ page }) => { ... })`:
 *      - si el callback ya contiene `new AxeBuilder(`, no toca.
 *      - si no, inserta al inicio del bloque:
 *          const _axe = await new AxeBuilder({ page }).analyze();
 *          expect(_axe.violations).toEqual([]);
 *      - registra que se necesita `expect` (de '@playwright/test') si no estaba.
 *
 * Determinista. ts-morph para imports + parse del CallExpression `test`,
 * texto crudo para la inyección del snippet.
 *
 * Output JSON a stdout:
 *   { specFile, injected: <n>, alreadyPresent: <n>, importsAdded: [<modules>] }
 *
 * Exit 0 siempre que no haya error de I/O. Exit 1 si el path no se pudo
 * leer/escribir o el archivo no contiene ningún `test(...)`.
 */

import { readFile, writeFile } from 'node:fs/promises';

import { Project, SyntaxKind, type ArrowFunction, type CallExpression, type FunctionExpression } from 'ts-morph';

interface InjectReport {
  specFile: string;
  injected: number;
  alreadyPresent: number;
  importsAdded: string[];
}

const SNIPPET_LINES = [
  '  const _axe = await new AxeBuilder({ page }).analyze();',
  '  expect(_axe.violations).toEqual([]);',
];

function parseArgs(argv: string[]): { spec: string | null } {
  let spec: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--spec') spec = argv[++i] ?? null;
  }
  return { spec };
}

function ensureImports(project: Project, sourceText: string): { text: string; added: string[] } {
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

  // @playwright/test — expect
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

function injectSnippets(sourceText: string, project: Project): { text: string; injected: number; alreadyPresent: number } {
  let working = sourceText;
  let injected = 0;
  let alreadyPresent = 0;

  // iterar hasta que ningún `test()` callback quede sin axe.
  // Re-parseamos en cada iteración porque las inserciones desplazan offsets.
  // Salida segura: máximo N iteraciones = número inicial de `test(`.
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
      if (body.getKind() !== SyntaxKind.Block) continue; // arrow sin braces — no soportado
      const bodyText = body.getText();
      if (bodyText.includes('new AxeBuilder(')) {
        alreadyPresent++;
        continue;
      }
      // inserta justo después de la `{` inicial
      const bodyStart = body.getStart();
      const openBrace = working.indexOf('{', bodyStart);
      if (openBrace === -1) continue;
      const insertAt = openBrace + 1;
      const snippet = '\n' + SNIPPET_LINES.join('\n') + '\n';
      working = working.slice(0, insertAt) + snippet + working.slice(insertAt);
      injected++;
      mutated = true;
      break; // re-parse y vuelve a empezar
    }
    if (!mutated) break;
  }
  return { text: working, injected, alreadyPresent };
}

async function main(): Promise<void> {
  const { spec } = parseArgs(process.argv.slice(2));
  if (!spec) {
    process.stderr.write('[a11y-inject] uso: --spec <path>\n');
    process.exit(1);
  }

  let content: string;
  try {
    content = await readFile(spec, 'utf8');
  } catch (err) {
    process.stderr.write(`[a11y-inject] no se pudo leer spec: ${(err as Error).message}\n`);
    process.exit(1);
  }

  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
  });

  const tests = findTestCalls(project, content);
  if (tests.length === 0) {
    process.stderr.write(`[a11y-inject] el archivo no contiene ningún test(): ${spec}\n`);
    process.exit(1);
  }

  // 1) imports
  const importStep = ensureImports(project, content);
  content = importStep.text;

  // 2) inyección por test
  const injectStep = injectSnippets(content, project);
  content = injectStep.text;

  await writeFile(spec, content, 'utf8');

  const report: InjectReport = {
    specFile: spec,
    injected: injectStep.injected,
    alreadyPresent: injectStep.alreadyPresent,
    importsAdded: importStep.added,
  };
  process.stdout.write(JSON.stringify(report) + '\n');
  process.exit(0);
}

void main();
