/**
 * F0 del plan CLI-en-vez-de-MCP — la puerta del playwright-cli.
 *
 * Lo que protegen estos tests no es el wrapper: es la regla dura #3. El hook
 * pre-flight no ve un Bash(playwright-cli …), así que ESTA puerta es la única
 * barrera del transporte CLI. Si se relaja, el allowlist tiene un túnel.
 */
import { describe, it, expect } from 'vitest';
import { planBrowse, type PlanInput } from '../../src/scripts/qa-browse.ts';
import type { PreflightResult } from '../../src/compliance-preflight.ts';

const permite = (url: string): PreflightResult => ({ verdict: 'pass', url });
const bloquea = (url: string): PreflightResult => ({ verdict: 'block', rule: 'C1', reason: 'fuera del allowlist', url });

function plan(argv: string[], o: Partial<Omit<PlanInput, 'argv'>> = {}) {
  return planBrowse({ argv, verificarUrl: o.verificarUrl ?? permite, sesionAbierta: o.sesionAbierta ?? (() => true) });
}

describe('qa:browse — URLs por la puerta ANTES de ejecutar', () => {
  it('open con URL fuera del allowlist se bloquea sin ejecutar nada', () => {
    const p = plan(['open', 'https://malicioso.example/'], { verificarUrl: bloquea });
    expect(p.veredicto).toBe('bloquear');
    expect(p).toMatchObject({ regla: 'C1' });
  });

  it('goto y tab-new pasan por el MISMO verificador', () => {
    expect(plan(['goto', 'https://x.example/'], { verificarUrl: bloquea }).veredicto).toBe('bloquear');
    expect(plan(['tab-new', 'https://x.example/'], { verificarUrl: bloquea }).veredicto).toBe('bloquear');
  });

  it('una URL sin esquema se normaliza a https y SE VERIFICA', () => {
    const vistas: string[] = [];
    const p = plan(['open', 'www.saucedemo.com/'], { verificarUrl: (u) => (vistas.push(u), permite(u)) });
    expect(p.veredicto).toBe('ejecutar');
    expect(vistas).toEqual(['https://www.saucedemo.com/']);
  });

  it('un positional ilegible en un comando de navegación bloquea (fail-closed, no "a ver qué hace el CLI")', () => {
    const p = plan(['goto', ':::esto-no-es-url']);
    expect(p).toMatchObject({ veredicto: 'bloquear', regla: 'url-ilegible' });
  });

  it('goto sin URL es uso inválido, no un pase', () => {
    expect(plan(['goto'])).toMatchObject({ veredicto: 'bloquear', regla: 'uso' });
  });
});

describe('qa:browse — lo prohibido, con su motivo', () => {
  it('attach y run-code no entran: navegador externo y API completa sin verificación', () => {
    expect(plan(['attach', '--cdp=chrome'])).toMatchObject({ veredicto: 'bloquear' });
    expect(plan(['run-code', 'async page => page.goto("https://x")'])).toMatchObject({ veredicto: 'bloquear', regla: 'comando-prohibido' });
  });

  it('los flags --cdp/--extension/--profile/--persistent bloquean aparezcan donde aparezcan', () => {
    for (const f of ['--cdp=http://localhost:9222', '--extension=chrome', '--profile=/tmp/x', '--persistent']) {
      expect(plan(['open', 'https://ok.example/', f]).veredicto, f).toBe('bloquear');
    }
  });
});

describe('qa:browse — el engine', () => {
  it('open sin --browser inyecta chromium (el default del CLI busca el chrome del SISTEMA)', () => {
    const p = plan(['open', 'https://ok.example/']);
    expect(p).toMatchObject({ veredicto: 'ejecutar' });
    if (p.veredicto === 'ejecutar') expect(p.args).toContain('--browser=chromium');
  });

  it('canales del sistema (chrome/msedge) se rechazan; engines empaquetados pasan', () => {
    expect(plan(['open', 'https://ok.example/', '--browser=msedge'])).toMatchObject({ veredicto: 'bloquear', regla: 'engine' });
    expect(plan(['open', 'https://ok.example/', '--browser=firefox']).veredicto).toBe('ejecutar');
  });
});

describe('qa:browse — solo sesiones abiertas por la puerta', () => {
  it('un comando de acción sin sesión del wrapper se bloquea', () => {
    const p = plan(['click', 'e15'], { sesionAbierta: () => false });
    expect(p).toMatchObject({ veredicto: 'bloquear', regla: 'sesion-ajena' });
  });

  it('goto con URL permitida pero sesión ajena TAMBIÉN se bloquea (la URL no compra la sesión)', () => {
    const p = plan(['goto', 'https://ok.example/'], { sesionAbierta: () => false });
    expect(p).toMatchObject({ veredicto: 'bloquear', regla: 'sesion-ajena' });
  });

  it('la sesión viaja como -s= al CLI y open la marca como abierta por el wrapper', () => {
    const p = plan(['-s=crm', 'open', 'https://ok.example/']);
    expect(p).toMatchObject({ veredicto: 'ejecutar', sesion: 'crm', abreSesion: true });
    if (p.veredicto === 'ejecutar') expect(p.args[0]).toBe('-s=crm');
  });

  it('close y delete-data retiran el marcador', () => {
    expect(plan(['close'])).toMatchObject({ veredicto: 'ejecutar', cierraSesion: true });
    expect(plan(['delete-data'])).toMatchObject({ veredicto: 'ejecutar', cierraSesion: true });
  });
});
