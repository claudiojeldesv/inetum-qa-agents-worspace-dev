import { describe, expect, it } from 'vitest';

import { convertCssLocators } from '../../hooks/style-enforce.js';

describe('convertCssLocators', () => {
  it('convierte data-test → getByTestId con outer single quote', () => {
    const input = `await page.locator('[data-test="login-button"]').click();`;
    const { content, fixes } = convertCssLocators(input);
    expect(content).toContain(`page.getByTestId('login-button')`);
    expect(content).not.toContain(`page.locator('[data-test=`);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]?.rule).toBe('RAW_CSS_LOCATOR');
    expect(fixes[0]?.line).toBe(1);
  });

  it('convierte data-testid con outer double quote y preserva la quote', () => {
    const input = `await page.locator("[data-testid='user-name']").fill('foo');`;
    const { content, fixes } = convertCssLocators(input);
    expect(content).toContain(`page.getByTestId("user-name")`);
    expect(fixes).toHaveLength(1);
  });

  it('convierte data-qa con valor sin quotes internas', () => {
    const input = `await page.locator('[data-qa=submit]').click();`;
    const { content, fixes } = convertCssLocators(input);
    expect(content).toContain(`page.getByTestId('submit')`);
    expect(fixes).toHaveLength(1);
  });

  it('NO convierte CSS raw arbitrario (.class)', () => {
    const input = `await page.locator('.login-button').click();`;
    const { content, fixes } = convertCssLocators(input);
    expect(content).toBe(input);
    expect(fixes).toHaveLength(0);
  });

  it('NO convierte CSS raw arbitrario (#id)', () => {
    const input = `await page.locator('#login').click();`;
    const { content, fixes } = convertCssLocators(input);
    expect(content).toBe(input);
    expect(fixes).toHaveLength(0);
  });

  it('NO convierte XPath', () => {
    const input = `await page.locator('//button[@id="login"]').click();`;
    const { content, fixes } = convertCssLocators(input);
    expect(content).toBe(input);
    expect(fixes).toHaveLength(0);
  });

  it('NO convierte cuando ya es getByTestId (idempotencia)', () => {
    const input = `await page.getByTestId('login-button').click();`;
    const { content, fixes } = convertCssLocators(input);
    expect(content).toBe(input);
    expect(fixes).toHaveLength(0);
  });

  it('aplicar dos veces no añade fixes en la segunda pasada', () => {
    const input = `await page.locator('[data-test="x"]').click();`;
    const first = convertCssLocators(input);
    expect(first.fixes).toHaveLength(1);
    const second = convertCssLocators(first.content);
    expect(second.fixes).toHaveLength(0);
    expect(second.content).toBe(first.content);
  });

  it('convierte múltiples ocurrencias en líneas distintas y reporta posición correcta', () => {
    const input = [
      `import { test } from '@playwright/test';`,
      `test('x', async ({ page }) => {`,
      `  await page.locator('[data-test="user"]').fill('u');`,
      `  await page.locator('[data-test="pass"]').fill('p');`,
      `});`,
    ].join('\n');
    const { content, fixes } = convertCssLocators(input);
    expect(fixes).toHaveLength(2);
    expect(fixes[0]?.line).toBe(3);
    expect(fixes[1]?.line).toBe(4);
    expect(content).toContain(`getByTestId('user')`);
    expect(content).toContain(`getByTestId('pass')`);
  });
});
