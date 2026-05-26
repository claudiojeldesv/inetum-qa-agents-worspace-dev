import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanContent, scanDirectory } from '../../hooks/pii-post.js';

describe('scanContent', () => {
  it('detecta PII y test.fixme() juntos en un .spec.ts contaminado', () => {
    const content = [
      "import { test } from '@playwright/test';",
      "test('login', async ({ page }) => {",
      "  const dni = '12345678Z';",
      '  test.fixme();',
      "  await page.fill('#user', dni);",
      '});',
    ].join('\n');
    const findings = scanContent('contaminated.spec.ts', content);
    const types = findings.map((f) => f.type);
    expect(types).toContain('PII_DNI');
    expect(types).toContain('TEST_FIXME_INSERTED');
  });

  it('no detecta nada en un .spec.ts limpio', () => {
    const content = [
      "import { test } from '@playwright/test';",
      "test('login', async ({ page }) => {",
      "  await page.fill('#user', 'standard_user');",
      "  await page.fill('#pass', 'secret_sauce');",
      '});',
    ].join('\n');
    expect(scanContent('clean.spec.ts', content)).toHaveLength(0);
  });

  it('detecta test.fixme() incluso con espacios y variantes', () => {
    const content = ['test.fixme();', '  test.fixme  (  );'].join('\n');
    const findings = scanContent('x.spec.ts', content);
    const fixme = findings.filter((f) => f.type === 'TEST_FIXME_INSERTED');
    expect(fixme).toHaveLength(2);
  });
});

describe('scanDirectory', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'pii-scan-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('escanea recursivamente y reporta pass:false con findings cuando hay PII', async () => {
    await writeFile(
      join(tmp, 'a.spec.ts'),
      "const card = '4532015112830366';",
      'utf8',
    );
    await writeFile(
      join(tmp, 'b.spec.ts'),
      "const user = 'standard_user';",
      'utf8',
    );
    const report = await scanDirectory(tmp);
    expect(report.pass).toBe(false);
    expect(report.scanned).toHaveLength(2);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings[0]?.type).toBe('PII_CARD');
  });

  it('reporta pass:true cuando todos los .spec.ts del dir están limpios', async () => {
    await writeFile(
      join(tmp, 'clean.spec.ts'),
      "const user = 'standard_user';",
      'utf8',
    );
    const report = await scanDirectory(tmp);
    expect(report.pass).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  it('ignora archivos que no son .spec.ts (no falsos positivos en docs)', async () => {
    await writeFile(
      join(tmp, 'README.md'),
      'Mi DNI de prueba: 12345678Z',
      'utf8',
    );
    const report = await scanDirectory(tmp);
    expect(report.pass).toBe(true);
    expect(report.scanned).toHaveLength(0);
  });
});
