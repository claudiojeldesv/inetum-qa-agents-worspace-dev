import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
import { scaffoldPage, scaffoldBasePage, scaffold } from '../../src/pom-scaffolder.ts';

describe('pom-scaffolder scaffoldPage', () => {
  it('generates a Page class with PascalCase name from a kebab-case screen name', () => {
    const result = scaffoldPage({ name: 'checkout-step-one' });
    expect(result.className).toBe('CheckoutStepOnePage');
    expect(result.fileName).toBe('checkout-step-one.page.ts');
  });

  it('uses getByTestId when test_id is available', () => {
    const result = scaffoldPage({
      name: 'login',
      interactive_elements: [{ role: 'button', name: 'Login', test_id: 'login-button' }],
    });
    expect(result.content).toContain("getByTestId('login-button')");
  });

  it('falls back to getByRole when no test_id', () => {
    const result = scaffoldPage({
      name: 'inventory',
      interactive_elements: [{ role: 'button', name: 'Add to cart' }],
    });
    expect(result.content).toContain("getByRole('button', { name: 'Add to cart' })");
  });

  it('falls back to getByLabel when no test_id and no role+name', () => {
    const result = scaffoldPage({
      name: 'profile',
      interactive_elements: [{ role: 'textbox', label: 'Email' }],
    });
    expect(result.content).toContain("getByLabel('Email')");
  });

  it('adds a goto() method when url_pattern is provided', () => {
    const result = scaffoldPage({
      name: 'login',
      url_pattern: 'https://www.saucedemo.com/',
    });
    expect(result.content).toContain('async goto()');
    expect(result.content).toContain("page.goto('https://www.saucedemo.com/')");
  });

  it('leaves a TODO when url_pattern is missing', () => {
    const result = scaffoldPage({ name: 'unknown' });
    expect(result.content).toContain('TODO writer: add goto()');
  });

  it('escapes single quotes in names', () => {
    const result = scaffoldPage({
      name: 'shop',
      interactive_elements: [{ role: 'button', name: "User's profile" }],
    });
    expect(result.content).toContain("name: 'User\\'s profile'");
  });

  it('extends BasePage and imports it by default', () => {
    const result = scaffoldPage({ name: 'login' });
    expect(result.content).toContain('extends BasePage');
    expect(result.content).toContain("import { BasePage } from './base.page'");
    expect(result.content).toContain('super(page);');
  });

  it('produces a standalone class (no BasePage) when basePage:false', () => {
    const result = scaffoldPage({ name: 'login' }, { basePage: false });
    expect(result.content).not.toContain('extends BasePage');
    expect(result.content).toContain('readonly page: Page;');
    expect(result.content).toContain('this.page = page;');
  });

  it('names anonymous elements by role+index instead of element0', () => {
    const result = scaffoldPage({
      name: 'widget',
      interactive_elements: [{ role: 'button' }],
    });
    expect(result.content).toContain('readonly button0: Locator;');
    expect(result.content).not.toContain('element0');
  });

  it('exposes a declared component as a field and imports it', () => {
    const result = scaffoldPage({ name: 'home', components: ['nav'] });
    expect(result.content).toContain('readonly nav: NavComponent;');
    expect(result.content).toContain('this.nav = new NavComponent(page);');
    expect(result.content).toContain("import { NavComponent } from '../components/nav.component'");
  });
});

describe('pom-scaffolder scaffoldBasePage', () => {
  it('emits a BasePage class with goto and waitForReady helpers', () => {
    const base = scaffoldBasePage();
    expect(base.className).toBe('BasePage');
    expect(base.fileName).toBe('base.page.ts');
    expect(base.content).toContain('export class BasePage');
    expect(base.content).toContain('async goto(path');
    expect(base.content).toContain('async waitForReady()');
  });
});

describe('pom-scaffolder scaffold (in-memory)', () => {
  it('emits BasePage plus one file per screen when writeToDisk=false', () => {
    const result = scaffold(
      [
        { name: 'login', url_pattern: 'https://www.saucedemo.com/' },
        { name: 'inventory' },
        { name: 'checkout-step-one' },
      ],
      {},
      false,
    );
    expect(result.files).toHaveLength(4); // BasePage + 3 pages
    const classNames = result.files.map((f) => f.className);
    expect(classNames).toContain('BasePage');
    expect(classNames).toContain('LoginPage');
    expect(classNames).toContain('InventoryPage');
    expect(classNames).toContain('CheckoutStepOnePage');
  });

  it('emits shared component files into the components dir', () => {
    const result = scaffold(
      [{ name: 'home', components: ['nav'] }],
      { components: [{ name: 'nav', interactive_elements: [{ role: 'link', name: 'Home' }] }] },
      false,
    );
    const nav = result.files.find((f) => f.className === 'NavComponent');
    expect(nav).toBeDefined();
    expect(nav?.path.replace(/\\/g, '/')).toContain('components/nav.component.ts');
    expect(nav?.content).toContain("getByRole('link', { name: 'Home' })");
  });

  it('omits BasePage when basePage:false', () => {
    const result = scaffold([{ name: 'login' }], { basePage: false }, false);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].className).toBe('LoginPage');
  });
});

describe('pom-scaffolder scaffold (on disk)', () => {
  let dir: string;

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('overwrites an existing page file on re-scaffold (no staleness between runs)', () => {
    dir = mkdtempSync(join(tmpdir(), 'pom-scaffold-'));
    const stalePath = join(dir, 'login.page.ts');
    writeFileSync(stalePath, '// stale content from a previous run\n', 'utf8');

    scaffold(
      [{ name: 'login', interactive_elements: [{ role: 'button', name: 'Login', test_id: 'login-button' }] }],
      { outputDir: dir, basePage: false },
    );

    const content = readFileSync(stalePath, 'utf8');
    expect(content).not.toContain('stale content');
    expect(content).toContain("getByTestId('login-button')");
  });
});
