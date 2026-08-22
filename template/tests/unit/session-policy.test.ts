/**
 * Política de sesiones concurrentes — el defecto que se disfraza de flakiness.
 *
 * Contexto: nuestra propia configuración lo tiene servido. `playwright.config.ts` corre
 * `fullyParallel` con varios workers, el proyecto de auth comparte `storageState`, y a la
 * vez el spec que valida el login hace su PROPIO login limpiando el storageState — tal cual
 * en el TC-001 de ParaBank. En una app de sesión única ese segundo login mata la sesión
 * compartida y los demás specs caen de forma intermitente. Se archiva como timing y no lo es.
 *
 * La asimetría del default es el corazón de este módulo: equivocarse serializando cuesta
 * minutos; equivocarse paralelizando cuesta una suite intermitente y un diagnóstico falso.
 */
import { describe, it, expect } from 'vitest';
import {
  classifySessionPolicy,
  effectiveSessionPolicy,
  shouldProbe,
  huellaDeConflictoDeSesion,
} from '../../src/session-policy.ts';

describe('classifySessionPolicy — tabla de verdad de las tres observaciones', () => {
  it('las dos sesiones conviven → multiple, y se puede paralelizar', () => {
    const v = classifySessionPolicy({ aSobrevive: true, bAutenticada: true });
    expect(v.policy).toBe('multiple');
    expect(v.serialize).toBe(false);
  });

  it('EL PAR FALSABLE: B entra y A muere → single-last-wins, hay que serializar', () => {
    // es el caso peligroso: la suite en paralelo se auto-invalida la sesión compartida
    const v = classifySessionPolicy({ aSobrevive: false, bAutenticada: true });
    expect(v.policy).toBe('single-last-wins');
    expect(v.serialize).toBe(true);
    expect(v.reason).toMatch(/intermitente/);
  });

  it('B es rechazada con A viva → single-first-wins, y el literal queda como evidencia', () => {
    const v = classifySessionPolicy({
      aSobrevive: true,
      bAutenticada: false,
      bRechazoTexto: 'El usuario ya tiene una sesión activa',
    });
    expect(v.policy).toBe('single-first-wins');
    expect(v.serialize).toBe(true);
    expect(v.reason).toContain('El usuario ya tiene una sesión activa');
  });

  it('ninguna viva → inconcluso, y AUN ASI se serializa', () => {
    // límite de N sesiones, throttling por IP, o la app caída: no se distingue.
    // Se serializa porque es el error barato.
    const v = classifySessionPolicy({ aSobrevive: false, bAutenticada: false });
    expect(v.policy).toBe('inconclusive');
    expect(v.serialize).toBe(true);
  });

  it('serialize es true en TODO lo que no sea multiple demostrado', () => {
    const casos = [
      { aSobrevive: false, bAutenticada: true },
      { aSobrevive: true, bAutenticada: false },
      { aSobrevive: false, bAutenticada: false },
    ];
    for (const c of casos) expect(classifySessionPolicy(c).serialize).toBe(true);
  });
});

describe('effectiveSessionPolicy — quién manda', () => {
  const medidaMultiple = classifySessionPolicy({ aSobrevive: true, bAutenticada: true });

  it('lo declarado en el contract gana sobre la medición: el QA suele saberlo y sondear es intrusivo', () => {
    const e = effectiveSessionPolicy('single', medidaMultiple);
    expect(e.serialize).toBe(true);
    expect(e.source).toBe('contract');
  });

  it('con `unknown` manda la medición', () => {
    const e = effectiveSessionPolicy('unknown', medidaMultiple);
    expect(e.policy).toBe('multiple');
    expect(e.source).toBe('probe');
  });

  it('EL DEFAULT SEGURO: sin declarar y sin medir se SERIALIZA, no se asume concurrencia', () => {
    const e = effectiveSessionPolicy(undefined, null);
    expect(e.serialize).toBe(true);
    expect(e.source).toBe('default');
    expect(e.reason).toMatch(/sin evidencia/);
  });

  it('`multiple` declarado permite paralelizar sin sondear', () => {
    const e = effectiveSessionPolicy('multiple', null);
    expect(e.serialize).toBe(false);
    expect(e.source).toBe('contract');
  });
});

describe('shouldProbe — la sonda es intrusiva, así que corre lo mínimo', () => {
  it('sin auth no hay nada que sondear', () => {
    const r = shouldProbe({ authEnabled: false, declarada: undefined, perfilExiste: false });
    expect(r.probe).toBe(false);
  });

  it('si el contract ya lo declara, no se sondea: sería intrusivo sin ganar nada', () => {
    expect(shouldProbe({ authEnabled: true, declarada: 'single', perfilExiste: false }).probe).toBe(false);
    expect(shouldProbe({ authEnabled: true, declarada: 'multiple', perfilExiste: false }).probe).toBe(false);
  });

  it('con perfil previo no se repite: es propiedad del TARGET, no del run', () => {
    const r = shouldProbe({ authEnabled: true, declarada: 'unknown', perfilExiste: true });
    expect(r.probe).toBe(false);
    expect(r.reason).toMatch(/propiedad del target/);
  });

  it('auth activa, sin declarar y sin medir → procede sondear una vez', () => {
    expect(shouldProbe({ authEnabled: true, declarada: 'unknown', perfilExiste: false }).probe).toBe(true);
    expect(shouldProbe({ authEnabled: true, declarada: undefined, perfilExiste: false }).probe).toBe(true);
  });
});

describe('huellaDeConflictoDeSesion — la red para cuando NO se sondeó', () => {
  it('EL PAR FALSABLE: setup verde + fallos por redirección al login = conflicto, NO flake', () => {
    const h = huellaDeConflictoDeSesion({
      setupOk: true,
      specsTotal: 4,
      specsFallados: 3,
      fallosConRedireccionALogin: 3,
    });
    expect(h.sospecha).toBe(true);
    expect(h.reason).toMatch(/NO de timing/);
  });

  it('si el setup falló, el diagnóstico es otro: no se acusa a la concurrencia', () => {
    const h = huellaDeConflictoDeSesion({
      setupOk: false,
      specsTotal: 4,
      specsFallados: 3,
      fallosConRedireccionALogin: 3,
    });
    expect(h.sospecha).toBe(false);
  });

  it('un fallo aislado entre muchos no es la huella: no se sobre-diagnostica', () => {
    const h = huellaDeConflictoDeSesion({
      setupOk: true,
      specsTotal: 10,
      specsFallados: 8,
      fallosConRedireccionALogin: 1,
    });
    expect(h.sospecha).toBe(false);
  });

  it('sin fallos no hay sospecha', () => {
    expect(
      huellaDeConflictoDeSesion({ setupOk: true, specsTotal: 4, specsFallados: 0, fallosConRedireccionALogin: 0 })
        .sospecha,
    ).toBe(false);
  });
});
