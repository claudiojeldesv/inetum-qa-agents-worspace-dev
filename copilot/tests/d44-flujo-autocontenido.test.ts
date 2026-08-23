/**
 * D44 — un flujo que da por hecha la sesión del flujo anterior está roto por
 * construcción, y el esquema lo daba por bueno.
 *
 * Medido en la iteración 2 del loop de OrangeHRM (2026-08-22). Mismo FD, mismo
 * prompt, mismo agente que la iteración 1 — y guion distinto: la 1 repetía el login
 * dentro de cada flujo, la 2 lo puso solo en el primero y arrancó los otros dos con
 * `click "PIM"`. `check-walk-script` dijo VÁLIDO (lo es, como esquema) y el fallo
 * salió con el navegador arrancado, en el segundo flujo, como «hint irresoluble».
 *
 * Ese mensaje manda a mirar el hint. El `aria_snapshot` del rescue-request decía la
 * verdad: la pantalla era la de **login**. El walker aísla la sesión entre flujos
 * (D42) a propósito, así que la iteración 1 no acertó por saber la regla — acertó
 * porque le salió así.
 *
 * Los dos casos base son los guiones REALES de las dos iteraciones, reducidos a lo
 * que este check mira. El par falsable: el de la iteración 1 tiene que pasar. Si
 * también fallara, el check estaría rechazando por otra cosa.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFlowsSelfContained, checkWalkScriptFile, formatReport } from '../src/check-walk-script.ts';
import type { WalkFlow } from '../src/walk-types.ts';

const login = (): WalkFlow => ({
  flow: 'login',
  criteria: ['RF-001'],
  steps: [
    { id: 's1', action: 'goto', target: '/web/index.php/auth/login' },
    { id: 's2', action: 'fill', hint: { label: 'Username' }, value: '$fixtures.credentials[0].username' },
    { id: 's3', action: 'fill', hint: { label: 'Password' }, value: '$fixtures.credentials[0].password', secret: true },
    { id: 's4', action: 'click', hint: { role: 'button', name: 'Login' }, expect_transition: true },
    { id: 's5', action: 'expect_text', value: 'Dashboard' },
  ],
});

/** Iteración 2: arranca dando por hecha la sesión. Es el defecto. */
const PIM_DEPENDIENTE: WalkFlow = {
  flow: 'view-employee-list',
  criteria: ['RF-003', 'RF-004'],
  steps: [
    { id: 's1', action: 'click', hint: { name: 'PIM' }, expect_transition: true },
    { id: 's2', action: 'expect_text', value: 'Employee Information' },
  ],
};

/** Iteración 1: el login va dentro del flujo. Es lo correcto. */
const PIM_AUTOCONTENIDO: WalkFlow = {
  ...PIM_DEPENDIENTE,
  steps: [...login().steps, { id: 's6', action: 'click', hint: { text: 'PIM' }, expect_transition: true }],
};

describe('checkFlowsSelfContained — la regla que el esquema no cubría', () => {
  it('EL PAR FALSABLE: el guion de la iteración 1 (login inline en cada flujo) pasa', () => {
    const errores = checkFlowsSelfContained({ authEnabled: true, flows: [login(), PIM_AUTOCONTENIDO] });
    expect(errores).toEqual([]);
  });

  it('el guion de la iteración 2 se rechaza, y solo el flujo culpable', () => {
    const errores = checkFlowsSelfContained({ authEnabled: true, flows: [login(), PIM_DEPENDIENTE] });
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('view-employee-list');
    expect(errores[0]).not.toContain('login:');
  });

  it('el mensaje dice la CAUSA (el walker reinicia la sesión) y las DOS salidas', () => {
    // sin esto el refiner reemite a ciegas: es el fallo de K0.34/D2 — un mensaje
    // que nombra el síntoma y manda a la acción equivocada.
    const [e] = checkFlowsSelfContained({ authEnabled: true, flows: [PIM_DEPENDIENTE] });
    expect(e).toMatch(/reinicia la sesión/);
    expect(e).toMatch(/entry/);
    expect(e).toMatch(/unauthenticated/);
    expect(e).toMatch(/\$fixtures\.credentials/);
  });

  it('`unauthenticated: true` exime al flujo: hay pantallas que corren sin sesión a propósito', () => {
    const publico: WalkFlow = { ...PIM_DEPENDIENTE, flow: 'portada', unauthenticated: true };
    expect(checkFlowsSelfContained({ authEnabled: true, flows: [publico] })).toEqual([]);
  });

  it('sin auth en el contract el check no aplica: no se inventa una regla que no toca', () => {
    expect(checkFlowsSelfContained({ authEnabled: false, flows: [PIM_DEPENDIENTE] })).toEqual([]);
  });

  it('cuenta como login cualquier ref a $fixtures.credentials, no un literal parecido', () => {
    const conLiteral: WalkFlow = {
      flow: 'x',
      steps: [{ id: 's1', action: 'fill', hint: { label: 'Username' }, value: 'Admin' }],
    };
    expect(checkFlowsSelfContained({ authEnabled: true, flows: [conLiteral] })).toHaveLength(1);
  });
});

describe('checkWalkScriptFile — el check solo corre con el contract delante, y lo dice', () => {
  const dir = mkdtempSync(join(tmpdir(), 'd44-'));
  const escribir = (nombre: string, contenido: string): string => {
    const p = join(dir, nombre);
    writeFileSync(p, contenido, 'utf8');
    return p;
  };
  const guion = (flows: WalkFlow[]): string =>
    JSON.stringify({ version: 1, site_id: 'orangehrm', entry: '/web/index.php/auth/login', flows });
  const contratoAuth = escribir('auth.yaml', 'version: 1\nproject: orangehrm\nauth:\n  enabled: true\n');
  const contratoSinAuth = escribir('sin-auth.yaml', 'version: 1\nproject: x\nauth:\n  enabled: false\n');

  it('con contract y auth activa, el guion de la iteración 2 sale INVÁLIDO', () => {
    const res = checkWalkScriptFile(escribir('malo.json', guion([login(), PIM_DEPENDIENTE])), contratoAuth);
    expect(res.ok).toBe(false);
    expect(res.errors.join('\n')).toContain('view-employee-list');
    expect(res.authCheckSkipped).toBeUndefined();
  });

  it('con contract y auth activa, el guion de la iteración 1 sale VÁLIDO', () => {
    const res = checkWalkScriptFile(escribir('bueno.json', guion([login(), PIM_AUTOCONTENIDO])), contratoAuth);
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('con auth desactivada el mismo guion pasa', () => {
    const res = checkWalkScriptFile(escribir('malo2.json', guion([login(), PIM_DEPENDIENTE])), contratoSinAuth);
    expect(res.ok).toBe(true);
  });

  it('SIN contract el check no corre — y el informe lo declara en vez de callarlo (D30)', () => {
    const res = checkWalkScriptFile(escribir('malo3.json', guion([login(), PIM_DEPENDIENTE])));
    expect(res.ok).toBe(true); // el esquema sí es válido
    expect(res.authCheckSkipped).toMatch(/sin --contract/);
    expect(formatReport('walk-script.json', res)).toMatch(/aviso: sin --contract/);
  });

  it('un contract que no existe tampoco se traga en silencio', () => {
    const res = checkWalkScriptFile(escribir('malo4.json', guion([PIM_DEPENDIENTE])), join(dir, 'no-existe.yaml'));
    expect(res.authCheckSkipped).toMatch(/no encontrado/);
  });
});
