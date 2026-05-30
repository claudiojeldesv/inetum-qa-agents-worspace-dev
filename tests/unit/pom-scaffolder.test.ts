import { describe, it, expect } from 'vitest';
import { scaffoldPage, scaffold } from '../../src/pom-scaffolder.ts';

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
});

describe('pom-scaffolder scaffold (in-memory)', () => {
  it('produces one file per screen without writing to disk when writeToDisk=false', () => {
    const result = scaffold(
      [
        { name: 'login', url_pattern: 'https://www.saucedemo.com/' },
        { name: 'inventory' },
        { name: 'checkout-step-one' },
      ],
      {},
      false,
    );
    expect(result.files).toHaveLength(3);
    expect(result.files.map((f) => f.className)).toEqual([
      'LoginPage',
      'InventoryPage',
      'CheckoutStepOnePage',
    ]);
  });
});
