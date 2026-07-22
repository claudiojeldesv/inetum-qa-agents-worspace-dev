import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendAuditEntry, sanitizeLogPath } from '../../src/audit-log.ts';

describe('audit-log appendAuditEntry', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'audit-log-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.QA_WORK_DIR;
  });

  it('escribe una entrada JSON-line en la ruta indicada', () => {
    const logPath = join(dir, 'audit-log.json');
    appendAuditEntry({ source: 'command', action: 'allow', target: 'x.spec.ts', result: 'pass' }, logPath);
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.source).toBe('command');
    expect(entry.target).toBe('x.spec.ts');
    expect(entry.timestamp).toBeTruthy();
  });

  it('normaliza backslashes del target a forward slashes', () => {
    const logPath = join(dir, 'audit-log.json');
    const entry = appendAuditEntry(
      { source: 'subagent', action: 'write_file', target: 'tests\\e2e\\saucedemo\\TC-004_pago.spec.ts' },
      logPath,
    );
    expect(entry.target).toBe('tests/e2e/saucedemo/TC-004_pago.spec.ts');
  });

  it('acepta una ruta de log con backslashes reales (Windows nativo)', () => {
    const logPath = join(dir, 'sub') + '\\audit-log.json';
    appendAuditEntry({ source: 'command', action: 'allow' }, logPath);
    expect(existsSync(join(dir, 'sub', 'audit-log.json'))).toBe(true);
  });

  it('ruta mangled (backslashes comidos) NO crea fichero basura: cae al log default del run', () => {
    process.env.QA_WORK_DIR = join(dir, 'work');
    // La clase Q1: '.work\saucedemo\audit-log.json' interpolado en un string JS pierde los '\'
    const mangled = '.worksaucedemoaudit-log.json';
    const entry = appendAuditEntry({ source: 'subagent', action: 'write_file', target: 'x.spec.ts' }, mangled);
    // No aparece el fichero basura en cwd
    expect(existsSync(join(process.cwd(), mangled))).toBe(false);
    // La entrada aterriza en el default y conserva la ruta inválida
    const fallback = join(dir, 'work', 'audit-log.json');
    expect(existsSync(fallback)).toBe(true);
    expect(entry.metadata?.invalid_log_path).toBe(mangled);
    // No se creó nada más dentro de dir que el work dir
    expect(readdirSync(dir)).toEqual(['work']);
  });

  it('sanitizeLogPath conserva rutas válidas y repara las inválidas', () => {
    const ok = sanitizeLogPath(join(dir, 'audit-log.json'));
    expect(ok.repairedFrom).toBeUndefined();
    const bad = sanitizeLogPath(join(dir, 'worksaucedemoaudit-log.json'));
    expect(bad.repairedFrom).toBeTruthy();
  });
});
