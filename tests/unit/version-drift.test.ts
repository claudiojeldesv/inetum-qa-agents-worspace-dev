/**
 * D18 — el despliegue viejo tiene que DELATARSE.
 *
 * El caso que motiva esto se midió tres veces el 2026-08-19: un workspace desplegado desde
 * el payload de `0.4.0-beta.1` con `0.4.0-beta.3` instalada, pasando el healthcheck entero
 * (26/26) y todas las demás comprobaciones del agente. Cinco verdes sobre código anterior a
 * los tres arreglos que se iban a medir.
 *
 * El par falsable vive en el primer bloque: mismos datos salvo la versión del workspace.
 */
import { describe, it, expect } from 'vitest';
import { versionDriftVerdict, versionFromPluginPath } from '../../src/version-drift.ts';

const base = { isDevRepo: false, installedVersion: '0.4.0-beta.3', sessionVersion: null };

describe('D18 — deriva de versión del payload', () => {
  it('el caso REAL: workspace beta.1 con beta.3 instalada → FALLA', () => {
    const v = versionDriftVerdict({ ...base, workspaceVersion: '0.4.0-beta.1' });
    expect(v.ok).toBe(false);
    expect(v.detail).toMatch(/VIEJO/);
    // manda a la acción correcta: re-desplegar desde la cache, NO repetir /init
    expect(v.detail).toMatch(/scaffold\.mjs/);
    expect(v.detail).toMatch(/en vez de repetir \/init/);
  });

  it('el par falsable: mismo escenario con la versión correcta → PASA', () => {
    const v = versionDriftVerdict({ ...base, workspaceVersion: '0.4.0-beta.3' });
    expect(v.ok).toBe(true);
    expect(v.detail).toMatch(/0\.4\.0-beta\.3/);
  });

  it('el segundo eje: payload al día pero SESIÓN vieja → falla y manda a reiniciar', () => {
    // los comandos no viven en el workspace; un walker nuevo conducido por un command
    // viejo es la mitad del arreglo, en silencio
    const v = versionDriftVerdict({
      ...base,
      workspaceVersion: '0.4.0-beta.3',
      sessionVersion: '0.4.0-beta.1',
    });
    expect(v.ok).toBe(false);
    expect(v.detail).toMatch(/ESTA SESIÓN/);
    expect(v.detail).toMatch(/vuelve a abrir/i);
  });

  it('sesión coherente con lo instalado → no molesta', () => {
    const v = versionDriftVerdict({
      ...base,
      workspaceVersion: '0.4.0-beta.3',
      sessionVersion: '0.4.0-beta.3',
    });
    expect(v.ok).toBe(true);
  });

  it('el repo de desarrollo NO se compara: ahí el package.json es la fuente, no la copia', () => {
    // sin esta salvedad el healthcheck del propio repo fallaría cada vez que se trabaja
    // en una versión que todavía no se ha instalado
    const v = versionDriftVerdict({ ...base, isDevRepo: true, workspaceVersion: '0.5.0-dev' });
    expect(v.ok).toBe(true);
    expect(v.detail).toMatch(/no aplica/);
  });

  it('sin plugin instalado NO se afirma deriva: falta la mitad del dato', () => {
    // un workspace desplegado en otra máquina, o a mano desde el repo, es legítimo
    const v = versionDriftVerdict({ ...base, installedVersion: null, workspaceVersion: '0.4.0-beta.3' });
    expect(v.ok).toBe(true);
    expect(v.detail).toMatch(/nada que comparar/);
  });

  it('un workspace sin versión declarada es un fallo por derecho propio', () => {
    const v = versionDriftVerdict({ ...base, workspaceVersion: null });
    expect(v.ok).toBe(false);
  });
});

describe('D18 — versión a partir de la ruta de cache', () => {
  it('extrae la versión del último segmento, con separadores de Windows', () => {
    expect(versionFromPluginPath('C:\\Users\\x\\.claude\\plugins\\cache\\m\\ia4d-qa-automator\\0.4.0-beta.3')).toBe(
      '0.4.0-beta.3',
    );
  });

  it('y con separadores POSIX', () => {
    expect(versionFromPluginPath('/home/x/.claude/plugins/cache/m/ia4d-qa-automator/0.3.4')).toBe('0.3.4');
  });

  it('una ruta que no termina en versión devuelve null, no una invención', () => {
    expect(versionFromPluginPath('/opt/plugins/ia4d-qa-automator')).toBeNull();
    expect(versionFromPluginPath(undefined)).toBeNull();
  });
});
