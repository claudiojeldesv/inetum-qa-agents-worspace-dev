/**
 * POM scaffolder — produces deterministic Page Object Model skeletons from a
 * discovery report. The LLM (Writer) later fills in locators and actions.
 *
 * Why deterministic and not LLM: speed + structural consistency. We pay no
 * tokens for the skeleton. Locators are TODO placeholders the Writer resolves
 * by reading the discovery-report.json.
 *
 * Structure: a shared BasePage (common page + goto/waitForReady) that every page
 * extends, optional shared component objects (nav/header/footer) for elements that
 * repeat across screens, and one Page class per discovered screen.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';

export interface InteractiveElement {
  role: string;                       // 'button' | 'textbox' | 'link' | 'checkbox' | etc.
  name?: string;                      // accessible name if available
  test_id?: string;                   // data-test attr if present
  label?: string;
  verified?: boolean | null;          // anotado por verify-locators (Q2.1): true = resuelve único contra el DOM real
  verify_reason?: string;             // 'not-found' | 'ambiguous(n)' | ... cuando verified !== true
  /** Cadena de iframes hasta el frame del elemento (K0.4). El locator se emite
   *  encadenando page.frameLocator(...) — sin esto el POM apunta al top frame
   *  y el locator de un form embebido (p.ej. pago) no resuelve jamás. */
  frame_path?: string[];
}

export interface DiscoveryScreen {
  name: string;                       // semantic name, e.g. 'login', 'inventory', 'checkout-step-one'
  url_pattern?: string;               // optional URL fragment for goto helper
  interactive_elements?: InteractiveElement[];
  components?: string[];              // names of shared components this screen uses (e.g. ['nav'])
}

export interface DiscoveryComponent {
  name: string;                       // e.g. 'nav', 'header', 'footer'
  interactive_elements?: InteractiveElement[];
}

export interface ScaffoldOptions {
  outputDir?: string;                 // default: 'tests/pages'
  classSuffix?: string;               // default: 'Page'
  basePage?: boolean;                 // default: true — emit BasePage and have pages extend it
  components?: DiscoveryComponent[];  // shared components to generate (default: none)
  componentsDir?: string;             // default: 'tests/components'
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

export function fileNameFor(name: string, kind: 'page' | 'component'): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + `.${kind}.ts`;
}

function componentClassName(name: string): string {
  return toPascalCase(name) + 'Component';
}

/**
 * Import base from the pages dir to the components dir. With site namespacing
 * (tests/pages/<site-id> vs tests/components/<site-id>) the hardcoded
 * '../components' was wrong: it must be derived from the actual dirs.
 */
function componentsImportBase(options: ScaffoldOptions): string {
  const pagesDir = resolve(options.outputDir ?? 'tests/pages');
  const componentsDir = resolve(options.componentsDir ?? 'tests/components');
  const rel = relative(pagesDir, componentsDir).replace(/\\/g, '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function renderLocator(el: InteractiveElement): string {
  // K0.4: elemento dentro de iframes → encadenar frameLocator por segmento
  const scope = el.frame_path?.length
    ? 'this.page' + el.frame_path.map((s) => `.frameLocator('${s.replace(/'/g, "\\'")}')`).join('')
    : 'this.page';
  if (el.test_id) {
    return `${scope}.getByTestId('${el.test_id}')`;
  }
  // business_text de expect_text (K0.2): texto plano sin rol ARIA
  if (el.role === 'text' && el.name) {
    return `${scope}.getByText('${el.name.replace(/'/g, "\\'")}')`;
  }
  if (el.role && el.name) {
    return `${scope}.getByRole('${el.role}', { name: '${el.name.replace(/'/g, "\\'")}' })`;
  }
  if (el.label) {
    return `${scope}.getByLabel('${el.label.replace(/'/g, "\\'")}')`;
  }
  return `${scope}.getByRole('${el.role ?? 'generic'}') /* TODO writer: refine */`;
}

/**
 * Build the (key, locator) assignments for a list of elements, with unique field names.
 * Naming: test_id → camelCase(test_id); else name → camelCase(name); else role+index
 * (e.g. `button0`) instead of the old anonymous `element0`.
 */
function locatorAssignments(elements: InteractiveElement[]): Array<{ key: string; locator: string }> {
  const seenKeys = new Set<string>();
  return elements.map((el, idx) => {
    const base = el.test_id
      ? toCamelCase(el.test_id)
      : el.name
        ? toCamelCase(el.name)
        : `${toCamelCase(el.role ?? 'element')}${idx}`;
    let unique = base;
    let n = 2;
    while (seenKeys.has(unique)) {
      unique = `${base}${n++}`;
    }
    seenKeys.add(unique);
    // verify-locators (Q2.1) marcó el elemento como no resuelto contra el DOM real: el campo se
    // scaffoldea igual (puede ser un estado condicional), pero con la advertencia para el Writer.
    const locator =
      el.verified === false
        ? `${renderLocator(el)} /* verify-locators: ${el.verify_reason ?? 'not-found'} en el estado por defecto — usar solo con evidencia del plan o TODO */`
        : renderLocator(el);
    return { key: unique, locator };
  });
}

/** BasePage — common base every Page Object extends. */
export function scaffoldBasePage(): { className: string; fileName: string; content: string } {
  const content = `import { type Page } from '@playwright/test';

/**
 * BasePage — common base for every Page Object. Scaffolded by src/pom-scaffolder.ts.
 * Holds the Playwright \`page\` and shared navigation helpers so concrete pages don't repeat them.
 */
export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to a path (relative to the app base URL) or an absolute URL.
   * Resolves by APPENDING to QA_BASE_URL: \`page.goto('/x')\` would resolve
   * against the origin and drop the context path of apps served under a
   * subpath (e.g. https://host/mi-app — the norm in corporate Java webapps).
   */
  async goto(path = '/') {
    const base = process.env.QA_BASE_URL;
    const url =
      /^https?:\\/\\//i.test(path) || !base
        ? path
        : base.replace(/\\/+$/, '') + (path.startsWith('/') ? path : \`/\${path}\`);
    await this.page.goto(url);
  }

  /** Wait until the page has settled. Override per page when a better signal exists. */
  async waitForReady() {
    await this.page.waitForLoadState('load');
  }
}
`;
  return { className: 'BasePage', fileName: 'base.page.ts', content };
}

/** Component object — shared interactive region reused across screens (nav/header/footer). */
export function scaffoldComponent(
  component: DiscoveryComponent,
): { className: string; fileName: string; content: string } {
  const className = componentClassName(component.name);
  const fileName = fileNameFor(component.name, 'component');
  const assignments = locatorAssignments(component.interactive_elements ?? []);

  const fieldDeclarations = assignments.map(({ key }) => `  readonly ${key}: Locator;`).join('\n');
  const fieldInits = assignments.map(({ key, locator }) => `    this.${key} = ${locator};`).join('\n');

  const content = `import { type Locator, type Page } from '@playwright/test';

/**
 * ${className} — shared component object for "${component.name}".
 * Scaffolded by src/pom-scaffolder.ts. Locators come from discovery-report.
 */
export class ${className} {
  readonly page: Page;
${fieldDeclarations}

  constructor(page: Page) {
    this.page = page;
${fieldInits}
  }
}
`;
  return { className, fileName, content };
}

export function scaffoldPage(
  screen: DiscoveryScreen,
  options: ScaffoldOptions = {},
): { className: string; fileName: string; content: string } {
  const suffix = options.classSuffix ?? 'Page';
  const useBase = options.basePage !== false;
  const className = toPascalCase(screen.name) + suffix;
  const fileName = fileNameFor(screen.name, 'page');

  const assignments = locatorAssignments(screen.interactive_elements ?? []);
  const usedComponents = screen.components ?? [];

  const locatorFieldDeclarations = assignments.map(({ key }) => `  readonly ${key}: Locator;`);
  const componentFieldDeclarations = usedComponents.map(
    (c) => `  readonly ${toCamelCase(c)}: ${componentClassName(c)};`,
  );
  const fieldDeclarations = [...locatorFieldDeclarations, ...componentFieldDeclarations].join('\n');

  const locatorInits = assignments.map(({ key, locator }) => `    this.${key} = ${locator};`);
  const componentInits = usedComponents.map(
    (c) => `    this.${toCamelCase(c)} = new ${componentClassName(c)}(page);`,
  );
  const ctorOpen = useBase ? '    super(page);' : '    this.page = page;';
  const fieldInits = [ctorOpen, ...locatorInits, ...componentInits].join('\n');

  // Con BasePage delega en super.goto: resuelve el pattern contra la base de la
  // app (context path incluido). Sin BasePage, goto directo (comportamiento previo).
  const gotoBlock = screen.url_pattern
    ? useBase
      ? `  async goto() {\n    await super.goto('${screen.url_pattern}');\n  }`
      : `  async goto() {\n    await this.page.goto('${screen.url_pattern}');\n  }`
    : `  // TODO writer: add goto() method when URL is known`;

  const imports = [`import { type Locator, type Page } from '@playwright/test';`];
  if (useBase) imports.push(`import { BasePage } from './base.page';`);
  const importBase = componentsImportBase(options);
  for (const c of usedComponents) {
    imports.push(`import { ${componentClassName(c)} } from '${importBase}/${fileNameFor(c, 'component').replace(/\.ts$/, '')}';`);
  }
  const classDecl = useBase ? `export class ${className} extends BasePage {` : `export class ${className} {`;
  const pageField = useBase ? '' : '  readonly page: Page;\n';

  const content = `${imports.join('\n')}

/**
 * ${className} — Page Object Model for the "${screen.name}" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
${classDecl}
${pageField}${fieldDeclarations}

  constructor(page: Page) {
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
  const componentsDir = options.componentsDir ?? resolve(process.cwd(), 'tests/components');
  const useBase = options.basePage !== false;
  const files: ScaffoldResult['files'] = [];

  // Sobrescribe SIEMPRE: el esqueleto solo declara lo que el discovery actual vio. Un fichero
  // stale de un run anterior conserva locators sin respaldo del discovery vigente (hallazgo F2:
  // menuButton/title/logo/orderSummary) y el Writer los usa creyéndolos legítimos. Lo que no está
  // en el discovery lo añade el Writer de este run, con evidencia.
  const emit = (dir: string, file: { className: string; fileName: string; content: string }) => {
    const fullPath = resolve(dir, file.fileName);
    files.push({ path: fullPath, className: file.className, content: file.content });
    if (writeToDisk) {
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, file.content, 'utf8');
    }
  };

  if (useBase) emit(outDir, scaffoldBasePage());
  for (const component of options.components ?? []) {
    emit(componentsDir, scaffoldComponent(component));
  }
  for (const screen of screens) {
    emit(outDir, scaffoldPage(screen, options));
  }

  return { files };
}
