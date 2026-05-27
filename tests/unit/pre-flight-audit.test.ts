import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  auditDirectory,
  extractStaticCredentials,
  extractStaticUrls,
} from '../../hooks/pre-flight.js';

const VALID_CONFIG = `version: 1
mode: greybox
allowedPatterns:
  - "https://www.saucedemo.com/*"
blockedPatterns:
  - "https://prod-*/**"
syntheticCredentials:
  usernames:
    - "standard_user"
  passwords:
    - "secret_sauce"
`;

describe('extractStaticUrls', () => {
  it('captura URLs literales con goto', () => {
    const out = extractStaticUrls(`await page.goto('https://www.saucedemo.com/');`);
    expect(out).toHaveLength(1);
    expect(out[0]?.url).toBe('https://www.saucedemo.com/');
    expect(out[0]?.line).toBe(1);
  });

  it('captura URLs en líneas distintas con su number', () => {
    const text = [
      `// header`,
      `await page.goto('https://www.saucedemo.com/');`,
      ``,
      `await page.goto("https://prod-banco.com/login");`,
    ].join('\n');
    const out = extractStaticUrls(text);
    expect(out).toHaveLength(2);
    expect(out[0]?.line).toBe(2);
    expect(out[1]?.line).toBe(4);
  });

  it('ignora URLs relativas (sin protocolo)', () => {
    const out = extractStaticUrls(`await page.goto('/inventory.html');`);
    expect(out).toHaveLength(0);
  });
});

describe('extractStaticCredentials', () => {
  it('captura cred desde getByTestId(...).fill(value)', () => {
    const out = extractStaticCredentials(
      `await page.getByTestId('username').fill('standard_user');`,
    );
    expect(out.some((c) => c.value === 'standard_user')).toBe(true);
  });

  it('captura cred desde literal en objeto { username: "X" }', () => {
    const out = extractStaticCredentials(
      `const creds = { username: 'standard_user', password: 'secret_sauce' };`,
    );
    const vals = out.map((c) => c.value);
    expect(vals).toContain('standard_user');
    expect(vals).toContain('secret_sauce');
  });

  it('ignora strings que no parecen credenciales', () => {
    const out = extractStaticCredentials(
      `await page.goto('https://www.saucedemo.com/');`,
    );
    expect(out).toHaveLength(0);
  });
});

describe('auditDirectory', () => {
  let tmp: string;
  let configPath: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'pre-flight-audit-'));
    configPath = join(tmp, 'config.yaml');
    await writeFile(configPath, VALID_CONFIG, 'utf8');
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  async function writeSpec(name: string, body: string): Promise<string> {
    const p = join(tmp, name);
    await writeFile(p, body, 'utf8');
    return p;
  }

  it('dir limpio (URLs y creds declaradas) → pass', async () => {
    await writeSpec(
      'login.spec.ts',
      [
        `import { test, expect } from '@playwright/test';`,
        `test('login', async ({ page }) => {`,
        `  await page.goto('https://www.saucedemo.com/');`,
        `  await page.getByTestId('username').fill('standard_user');`,
        `  await page.getByTestId('password').fill('secret_sauce');`,
        `});`,
      ].join('\n'),
    );
    const report = await auditDirectory(tmp, configPath);
    expect(report.pass).toBe(true);
    expect(report.findings).toHaveLength(0);
    expect(report.scanned).toHaveLength(1);
  });

  it('URL prohibida en spec → finding URL_NOT_ALLOWLISTED', async () => {
    await writeSpec(
      'bad-url.spec.ts',
      [
        `import { test } from '@playwright/test';`,
        `test('x', async ({ page }) => {`,
        `  await page.goto('https://www.banco-falso.com/login');`,
        `});`,
      ].join('\n'),
    );
    const report = await auditDirectory(tmp, configPath);
    expect(report.pass).toBe(false);
    expect(report.findings.some((f) => f.type === 'URL_NOT_ALLOWLISTED')).toBe(true);
  });

  it('URL en blocklist → finding URL_BLOCKLISTED', async () => {
    await writeSpec(
      'prod.spec.ts',
      [
        `import { test } from '@playwright/test';`,
        `test('x', async ({ page }) => {`,
        `  await page.goto('https://prod-saucedemo.com/');`,
        `});`,
      ].join('\n'),
    );
    const report = await auditDirectory(tmp, configPath);
    expect(report.pass).toBe(false);
    expect(report.findings.some((f) => f.type === 'URL_BLOCKLISTED')).toBe(true);
  });

  it('credencial no declarada → finding CREDENTIAL_NOT_SYNTHETIC_DECLARED', async () => {
    await writeSpec(
      'cred.spec.ts',
      [
        `import { test } from '@playwright/test';`,
        `test('x', async ({ page }) => {`,
        `  await page.getByTestId('username').fill('un_user_inventado');`,
        `});`,
      ].join('\n'),
    );
    const report = await auditDirectory(tmp, configPath);
    expect(report.pass).toBe(false);
    expect(
      report.findings.some((f) => f.type === 'CREDENTIAL_NOT_SYNTHETIC_DECLARED'),
    ).toBe(true);
  });

  it('credencial parece DNI → finding CREDENTIAL_LOOKS_LIKE_PII', async () => {
    await writeSpec(
      'pii.spec.ts',
      [
        `import { test } from '@playwright/test';`,
        `test('x', async ({ page }) => {`,
        `  await page.getByTestId('username').fill('12345678Z');`,
        `});`,
      ].join('\n'),
    );
    const report = await auditDirectory(tmp, configPath);
    expect(report.pass).toBe(false);
    expect(report.findings.some((f) => f.type === 'CREDENTIAL_LOOKS_LIKE_PII')).toBe(true);
  });

  it('archivo no .spec.ts es ignorado', async () => {
    await writeSpec(
      'README.md',
      `Cred sospechosa: 'fake_user' — pero no .spec.ts.`,
    );
    const report = await auditDirectory(tmp, configPath);
    expect(report.scanned).toHaveLength(0);
    expect(report.pass).toBe(true);
  });
});
