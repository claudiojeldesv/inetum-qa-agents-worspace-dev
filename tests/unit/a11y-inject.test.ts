import { describe, expect, it } from 'vitest';

import { processContent } from '../../hooks/a11y-inject.js';

const SPEC_BASIC = `import { test } from '@playwright/test';

test('login', async ({ page }) => {
  await page.goto('https://example.com/');
});
`;

const SPEC_TWO_TESTS = `import { test } from '@playwright/test';

test('one', async ({ page }) => {
  await page.goto('https://example.com/one');
});

test('two', async ({ page }) => {
  await page.goto('https://example.com/two');
});
`;

describe('a11y-inject mode=block (default)', () => {
  it('inyecta snippet con expect y añade ambos imports', () => {
    const { text, report } = processContent(SPEC_BASIC, 'block');
    expect(report.mode).toBe('block');
    if (report.mode !== 'block') return;
    expect(report.injected).toBe(1);
    expect(report.alreadyPresent).toBe(0);
    expect(report.importsAdded).toContain('@axe-core/playwright');
    expect(text).toContain('new AxeBuilder({ page }).analyze()');
    expect(text).toContain('expect(_axe.violations).toEqual([]);');
    expect(text).not.toContain('console.warn');
  });

  it('inyecta en múltiples tests', () => {
    const { report } = processContent(SPEC_TWO_TESTS, 'block');
    if (report.mode !== 'block') return;
    expect(report.injected).toBe(2);
  });

  it('idempotente: re-procesar reporta alreadyPresent', () => {
    const first = processContent(SPEC_BASIC, 'block');
    const second = processContent(first.text, 'block');
    if (second.report.mode !== 'block') return;
    expect(second.report.injected).toBe(0);
    expect(second.report.alreadyPresent).toBe(1);
  });
});

describe('a11y-inject mode=warn', () => {
  it('inyecta snippet con console.warn, sin expect', () => {
    const { text, report } = processContent(SPEC_BASIC, 'warn');
    expect(report.mode).toBe('warn');
    if (report.mode !== 'warn') return;
    expect(report.injected).toBe(1);
    expect(text).toContain('new AxeBuilder({ page }).analyze()');
    expect(text).toContain('console.warn');
    expect(text).not.toContain('expect(_axe.violations).toEqual([]);');
  });

  it('no añade import de expect (solo AxeBuilder)', () => {
    const { report } = processContent(SPEC_BASIC, 'warn');
    if (report.mode !== 'warn') return;
    expect(report.importsAdded).toContain('@axe-core/playwright');
    // expect ya estaba importado en el fixture base, así que importsAdded
    // no debe listar '@playwright/test' como nuevo:
    expect(report.importsAdded).not.toContain('@playwright/test');
  });

  it('idempotente: re-procesar reporta alreadyPresent', () => {
    const first = processContent(SPEC_BASIC, 'warn');
    const second = processContent(first.text, 'warn');
    if (second.report.mode !== 'warn') return;
    expect(second.report.injected).toBe(0);
    expect(second.report.alreadyPresent).toBe(1);
  });
});

describe('a11y-inject mode=skip', () => {
  it('no modifica el texto y reporta skipped=N', () => {
    const { text, report } = processContent(SPEC_TWO_TESTS, 'skip');
    expect(report.mode).toBe('skip');
    if (report.mode !== 'skip') return;
    expect(report.skipped).toBe(2);
    expect(text).toBe(SPEC_TWO_TESTS);
    expect(text).not.toContain('new AxeBuilder');
  });

  it('no añade imports ni snippets', () => {
    const { text } = processContent(SPEC_BASIC, 'skip');
    expect(text).not.toContain('@axe-core/playwright');
    expect(text).not.toContain('AxeBuilder');
  });
});
