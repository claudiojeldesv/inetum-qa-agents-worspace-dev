import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    // con BasePage delega en super.goto: resuelve contra la base de la app
    // (context path incluido), no contra el origen
    expect(result.content).toContain("super.goto('https://www.saucedemo.com/')");
  });

  it('goto() without BasePage keeps the direct page.goto', () => {
    const result = scaffoldPage(
      { name: 'login', url_pattern: '/login.do' },
      { basePage: false },
    );
    expect(result.content).toContain("page.goto('/login.do')");
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

  it('derives the component import path from site-namespaced dirs (spike bug)', () => {
    const result = scaffoldPage(
      { name: 'home', components: ['nav'] },
      { outputDir: 'tests/pages/saucedemo', componentsDir: 'tests/components/saucedemo' },
    );
    expect(result.content).toContain(
      "import { NavComponent } from '../../components/saucedemo/nav.component'",
    );
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

describe('pom-scaffolder — el esqueleto solo declara lo que el discovery vio (hallazgo F2)', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('cada locator del esqueleto proviene de un interactive_element del discovery', () => {
    const result = scaffoldPage({
      name: 'inventory',
      url_pattern: '/inventory.html',
      interactive_elements: [
        { role: 'heading', name: 'Products', test_id: 'title' },
        { role: 'button', name: 'Add to Cart', test_id: 'add-to-cart-sauce-labs-backpack' },
      ],
    });
    // Exactamente los locators del discovery, ni uno más
    const locatorLines = result.content.split('\n').filter((l) => /this\.\w+ = this\.page\.getBy/.test(l));
    expect(locatorLines).toHaveLength(2);
    expect(result.content).toContain("getByTestId('title')");
    expect(result.content).toContain("getByTestId('add-to-cart-sauce-labs-backpack')");
    // La clase histórica del bug: nada de menuButton/logo/orderSummary sin respaldo
    expect(result.content).not.toMatch(/menuButton|logo|orderSummary/);
  });

  it('marca con advertencia los locators que verify-locators no resolvió (Q2.1)', () => {
    const result = scaffoldPage({
      name: 'login',
      interactive_elements: [
        { role: 'button', name: 'Login', test_id: 'login-button', verified: true },
        { role: 'heading', name: 'Error message', test_id: 'error', verified: false, verify_reason: 'not-found' },
      ],
    });
    const errorLine = result.content.split('\n').find((l) => l.includes("getByTestId('error')"))!;
    expect(errorLine).toContain('verify-locators: not-found');
    expect(errorLine).toContain('evidencia del plan');
    const okLine = result.content.split('\n').find((l) => l.includes("getByTestId('login-button')"))!;
    expect(okLine).not.toContain('verify-locators');
  });

  it('sobrescribe un POM stale de un discovery anterior (los locators fantasma desaparecen)', () => {
    dir = mkdtempSync(join(tmpdir(), 'pom-scaffolder-'));
    const stalePath = join(dir, 'inventory.page.ts');
    writeFileSync(
      stalePath,
      `export class InventoryPage {\n  readonly menuButton = this.page.getByRole('button', { name: 'Open Menu' });\n}\n`,
      'utf8',
    );

    scaffold(
      [{ name: 'inventory', interactive_elements: [{ role: 'heading', name: 'Products', test_id: 'title' }] }],
      { outputDir: dir, componentsDir: join(dir, 'components'), basePage: false },
    );

    const regenerated = readFileSync(stalePath, 'utf8');
    expect(regenerated).toContain("getByTestId('title')");
    expect(regenerated).not.toContain('menuButton');
    expect(regenerated).not.toContain('Open Menu');
  });
});


describe('pom-scaffolder — frame_path y business_text (kernel v2 K0)', () => {
  it('elemento con frame_path emite cadena de frameLocator (K0.4)', () => {
    const result = scaffoldPage({
      name: 'pago',
      interactive_elements: [
        { role: 'textbox', name: 'Card number', frame_path: ['iframe[name="pago"]'] },
      ],
    });
    expect(result.content).toContain(
      `this.page.frameLocator('iframe[name="pago"]').getByRole('textbox', { name: 'Card number' })`,
    );
  });

  it('frame_path anidado encadena un frameLocator por segmento', () => {
    const result = scaffoldPage({
      name: 'pago-anidado',
      interactive_elements: [
        { role: 'button', name: 'Pagar', frame_path: ['iframe#outer', 'iframe[name="inner"]'] },
      ],
    });
    expect(result.content).toContain(
      `this.page.frameLocator('iframe#outer').frameLocator('iframe[name="inner"]').getByRole('button', { name: 'Pagar' })`,
    );
  });

  it('test_id dentro de frame tambien se scopea', () => {
    const result = scaffoldPage({
      name: 'pago-tid',
      interactive_elements: [
        { role: 'textbox', test_id: 'pan', frame_path: ['iframe[name="pago"]'] },
      ],
    });
    expect(result.content).toContain(`this.page.frameLocator('iframe[name="pago"]').getByTestId('pan')`);
  });

  it("role 'text' (business_text de expect_text) emite getByText (K0.2)", () => {
    const result = scaffoldPage({
      name: 'confirmacion',
      interactive_elements: [{ role: 'text', name: 'Operacion realizada' }],
    });
    expect(result.content).toContain(`this.page.getByText('Operacion realizada')`);
    expect(result.content).not.toContain(`getByRole('text'`);
  });
});
