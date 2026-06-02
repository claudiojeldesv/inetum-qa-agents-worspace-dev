/**
 * POM scaffolder — produces deterministic Page Object Model skeletons from a
 * discovery report. The LLM (Writer) later fills in locators and actions.
 *
 * Why deterministic and not LLM: speed + structural consistency. We pay no
 * tokens for the skeleton. Locators are TODO placeholders the Writer resolves
 * by reading the discovery-report.json.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export interface DiscoveryScreen {
  name: string;                       // semantic name, e.g. 'login', 'inventory', 'checkout-step-one'
  url_pattern?: string;               // optional URL fragment for goto helper
  interactive_elements?: Array<{
    role: string;                     // 'button' | 'textbox' | 'link' | 'checkbox' | etc.
    name?: string;                    // accessible name if available
    test_id?: string;                 // data-test attr if present
    label?: string;
  }>;
}

export interface ScaffoldOptions {
  outputDir?: string;                 // default: 'tests/pages'
  classSuffix?: string;               // default: 'Page'
}

export interface ScaffoldResult {
  files: Array<{ path: string; className: string; content: string }>;
}

function toPascalCase(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9\s\-_/]+/g, ' ')
    .split(/[-_\s/]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('');
}

function toCamelCase(input: string): string {
  const pascal = toPascalCase(input);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function fileNameFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.page.ts';
}

function renderLocator(el: NonNullable<DiscoveryScreen['interactive_elements']>[number]): string {
  if (el.test_id) {
    return `this.page.getByTestId('${el.test_id}')`;
  }
  if (el.role && el.name) {
    return `this.page.getByRole('${el.role}', { name: '${el.name.replace(/'/g, "\\'")}' })`;
  }
  if (el.label) {
    return `this.page.getByLabel('${el.label.replace(/'/g, "\\'")}')`;
  }
  return `this.page.getByRole('${el.role ?? 'generic'}') /* TODO writer: refine */`;
}

export function scaffoldPage(
  screen: DiscoveryScreen,
  options: ScaffoldOptions = {},
): { className: string; fileName: string; content: string } {
  const suffix = options.classSuffix ?? 'Page';
  const className = toPascalCase(screen.name) + suffix;
  const fileName = fileNameFor(screen.name);

  const elements = screen.interactive_elements ?? [];
  const seenKeys = new Set<string>();
  const locatorAssignments = elements
    .map((el, idx) => {
      let key = el.test_id
        ? toCamelCase(el.test_id)
        : el.name
          ? toCamelCase(el.name)
          : `element${idx}`;
      // Ensure unique keys within a class
      let unique = key;
      let suffix = 2;
      while (seenKeys.has(unique)) {
        unique = `${key}${suffix++}`;
      }
      seenKeys.add(unique);
      const locator = renderLocator(el);
      return { key: unique, locator };
    });

  const fieldDeclarations = locatorAssignments
    .map(({ key }) => `  readonly ${key}: Locator;`)
    .join('\n');

  const fieldInits = locatorAssignments
    .map(({ key, locator }) => `    this.${key} = ${locator};`)
    .join('\n');

  const gotoBlock = screen.url_pattern
    ? `  async goto() {\n    await this.page.goto('${screen.url_pattern}');\n  }`
    : `  // TODO writer: add goto() method when URL is known`;

  const content = `import { type Locator, type Page } from '@playwright/test';

/**
 * ${className} — Page Object Model for the "${screen.name}" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class ${className} {
  readonly page: Page;
${fieldDeclarations}

  constructor(page: Page) {
    this.page = page;
${fieldInits}
  }

${gotoBlock}

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
`;

  return { className, fileName, content };
}

export function scaffold(
  screens: DiscoveryScreen[],
  options: ScaffoldOptions = {},
  writeToDisk = true,
): ScaffoldResult {
  const outDir = options.outputDir ?? resolve(process.cwd(), 'tests/pages');
  const files: ScaffoldResult['files'] = [];

  for (const screen of screens) {
    const { className, fileName, content } = scaffoldPage(screen, options);
    const fullPath = resolve(outDir, fileName);
    files.push({ path: fullPath, className, content });

    if (writeToDisk) {
      mkdirSync(dirname(fullPath), { recursive: true });
      if (!existsSync(fullPath)) {
        writeFileSync(fullPath, content, 'utf8');
      }
    }
  }

  return { files };
}
