/**
 * Fase C — la propuesta de FD, con los pares del plan.
 *
 * La comprobación falsable que el plan dejó escrita, literal: «un acta con dos
 * decisiones produce exactamente esos dos cambios, con su origen; un `defer` no
 * aparece». Y alrededor, las ramas fail-honest: lo que no se puede derivar con
 * certeza se aparta CON motivo — una propuesta que adivina es peor que ninguna,
 * porque hereda la autoridad del acta sin su respaldo.
 */
import { describe, it, expect } from 'vitest';

import {
  aplicarAlTexto,
  derivarCambios,
  esPasoDeOraculo,
  renderPropuesta,
} from '../../src/fd-proposal.ts';
import type { GuionMinimo } from '../../src/fd-proposal.ts';
import { effectiveDecisions } from '../../src/decisions.ts';
import type { DecisionEntry } from '../../src/decisions.ts';
import { ACCIONES_QUE_OBSERVAN } from '../../copilot/src/walk-verdict.ts';

const HUELLA = 'aaaa111122223333';

const decision = (over: Partial<DecisionEntry>): DecisionEntry =>
  ({
    rf: 'CP005',
    paso: 'ciclo/s8',
    decision: 'app',
    fd_hash: HUELLA,
    script_hash: 'guion123',
    evidencia: 'en-vivo',
    actor: 'ana.qa',
    timestamp: '2026-08-29T18:00:00.000Z',
    hash: 'deadbeefdeadbeefdeadbeefdeadbeef',
    ...over,
  }) as DecisionEntry;

const guion: GuionMinimo = {
  site_id: 'demo',
  flows: [
    {
      flow: 'ciclo',
      criteria: ['CP005'],
      steps: [
        { id: 's6', action: 'expect_text', value: 'Datos del empleado' },
        { id: 's7', action: 'click', hint: { role: 'button', name: 'Search' } },
        { id: 's8', action: 'expect_text', value: 'Registros encontrados' },
      ],
    },
  ],
};

const original: GuionMinimo = {
  site_id: 'demo',
  flows: [
    {
      flow: 'ciclo',
      steps: [
        { id: 's6', action: 'expect_text', value: 'Datos del empleado' },
        { id: 's7', action: 'click', hint: { role: 'button', name: 'Buscar' } },
        { id: 's8', action: 'expect_text', value: 'Registros encontrados' },
      ],
    },
  ],
};

const FD = [
  '# Caso CP005',
  '7. Comprobar que se muestra el bloque **Datos del empleado**.',
  '8. Pulsar el botón **Buscar**.',
  '9. Comprobar que se muestra el texto **Registros encontrados**.',
].join('\n');

describe('derivarCambios — qué propone el acta y qué no', () => {
  it('EL PAR DEL PLAN: dos decisiones producen EXACTAMENTE esos dos cambios, y el defer no aparece', () => {
    const d = derivarCambios(
      [
        decision({ paso: 'ciclo/s8', valor_nuevo: '(110) Records Found' }),
        decision({ paso: 'ciclo/s7', hash: 'beb1beb1beb1beb1beb1beb1beb1beb1' }),
        decision({ paso: 'ciclo/s6', decision: 'defer', hash: 'cafecafecafecafecafecafecafecafe' }),
      ],
      guion,
      original,
      HUELLA,
    );
    expect(d.cambios).toHaveLength(2);
    const oraculo = d.cambios.find((c) => c.tipo === 'oraculo');
    expect(oraculo).toMatchObject({ paso: 'ciclo/s8', de: 'Registros encontrados', a: '(110) Records Found' });
    const elemento = d.cambios.find((c) => c.tipo === 'elemento');
    // el antes/después del elemento se reconstruye del original anclado contra el
    // guion fundido: la decisión no lleva locator a propósito (decisión 9)
    expect(elemento).toMatchObject({ paso: 'ciclo/s7', de: 'Buscar', a: 'Search' });
    expect(d.sin_decidir).toBe(1);
    // y el defer no está en NINGUNA lista visible
    expect(d.apartadas).toHaveLength(0);
    expect(d.sostenidos).toHaveLength(0);
  });

  it('un `fd` SOSTIENE el criterio: va al anexo con su literal y el cuerpo no se toca', () => {
    const d = derivarCambios([decision({ paso: 'ciclo/s8', decision: 'fd' })], guion, original, HUELLA);
    expect(d.cambios).toHaveLength(0);
    expect(d.sostenidos).toHaveLength(1);
    expect(d.sostenidos[0].literal).toBe('Registros encontrados');
  });

  it('un `app` de oráculo SIN literal se aparta: no dice con qué sustituir', () => {
    const d = derivarCambios([decision({ paso: 'ciclo/s8' })], guion, original, HUELLA);
    expect(d.cambios).toHaveLength(0);
    expect(d.apartadas[0].motivo).toMatch(/sin literal/);
  });

  it('firmada contra OTRA versión del FD → apartada, jamás aplicada', () => {
    const d = derivarCambios(
      [decision({ paso: 'ciclo/s8', valor_nuevo: 'X', fd_hash: 'ffff000011112222' })],
      guion,
      original,
      HUELLA,
    );
    expect(d.cambios).toHaveLength(0);
    expect(d.apartadas[0].motivo).toMatch(/OTRA versión/);
  });

  it('elemento sin el original anclado → apartada nombrando el baseline que falta', () => {
    const d = derivarCambios([decision({ paso: 'ciclo/s7' })], guion, undefined, HUELLA);
    expect(d.cambios).toHaveLength(0);
    expect(d.apartadas[0].motivo).toMatch(/original anclado/);
  });

  it('D67: el original anclado de OTRO caso no sirve de «antes», y el motivo lo nombra', () => {
    /**
     * Encontrado generando la propuesta real: el baseline del sitio era el del
     * PRIMER caso fundido (cp001), y el elemento de cp005 salía apartado con un
     * motivo que culpaba a los nombres. El ancla es por sitio, los guiones por
     * caso — la propuesta no lo puede arreglar, pero sí decirlo con la salida.
     */
    const originalAjeno: GuionMinimo = {
      site_id: 'demo',
      flows: [{ flow: 'otro-caso', steps: [{ id: 's7', action: 'click', hint: { name: 'Buscar' } }] }],
    };
    const d = derivarCambios([decision({ paso: 'ciclo/s7' })], guion, originalAjeno, HUELLA);
    expect(d.cambios).toHaveLength(0);
    expect(d.apartadas[0].motivo).toMatch(/OTRO caso/);
    expect(d.apartadas[0].motivo).toMatch(/--original=/);
  });

  it('decisiones de OTRO caso se cuentan y no se listan: el anexo de este FD no es su sitio', () => {
    const d = derivarCambios([decision({ paso: 'otro-flujo/s3', valor_nuevo: 'X' })], guion, original, HUELLA);
    expect(d.fuera_del_guion).toBe(1);
    expect(d.cambios).toHaveLength(0);
    expect(d.apartadas).toHaveLength(0);
  });

  it('un literal adoptado con cifras lleva su aviso mecánico: se detecta, no se opina', () => {
    const d = derivarCambios([decision({ paso: 'ciclo/s8', valor_nuevo: '(110) Records Found' })], guion, original, HUELLA);
    expect(d.cambios[0].avisos[0]).toMatch(/cifras/);
  });
});

describe('aplicarAlTexto — sustituir sin adivinar', () => {
  const cambio = (de: string, a: string) => ({
    tipo: 'oraculo' as const, rf: 'CP005', paso: 'ciclo/s8', de, a,
    decision: decision({ valor_nuevo: a }), avisos: [],
  });

  it('el literal único se sustituye y queda su línea', () => {
    const r = aplicarAlTexto(FD, [cambio('Registros encontrados', '(110) Records Found')]);
    expect(r.texto).toContain('**(110) Records Found**');
    expect(r.texto).not.toContain('Registros encontrados');
    expect(r.aplicados[0].linea).toBe(4);
  });

  it('EL PAR: repetido no se toca («elegir una sería adivinar»), ausente tampoco', () => {
    const repe = aplicarAlTexto(FD + '\nNota: Buscar de nuevo.', [cambio('Buscar', 'Search')]);
    expect(repe.aplicados).toHaveLength(0);
    expect(repe.no_ubicables[0].motivo).toMatch(/aparece 2 veces/);
    expect(repe.texto).toContain('Buscar');

    const ausente = aplicarAlTexto(FD, [cambio('Texto que no está', 'X')]);
    expect(ausente.no_ubicables[0].motivo).toMatch(/no aparece/);
  });
});

describe('renderPropuesta — determinista y con el origen delante', () => {
  const armar = () => {
    const d = derivarCambios(
      [
        decision({ paso: 'ciclo/s8', valor_nuevo: '(110) Records Found' }),
        decision({ paso: 'ciclo/s6', decision: 'fd', hash: 'feedfeedfeedfeedfeedfeedfeedfeed' }),
      ],
      guion,
      original,
      HUELLA,
    );
    const a = aplicarAlTexto(FD, d.cambios);
    return renderPropuesta(a, d, {
      site: 'demo', fd_nombre: 'fd.md', huella_fd: HUELLA,
      cabeza_acta: 'deadbeefdeadbeef', acta_ruta: 'config/decisions/demo.jsonl',
    });
  };

  it('mismas entradas, mismos bytes: la versión es la cabeza del acta, no el reloj', () => {
    expect(armar()).toBe(armar());
    expect(armar()).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s*$/m);
  });

  it('dice lo que es, con el origen de cada cambio y el aviso del contador', () => {
    const t = armar();
    expect(t).toContain('NO sustituye al FD del cliente');
    expect(t).toContain('**(110) Records Found**');
    // el origen: actor, grado y hash corto en la misma fila del cambio
    expect(t).toMatch(/\(110\) Records Found.*en-vivo · ana\.qa · 2026-08-29 · \[deadbeef\]/);
    expect(t).toMatch(/Aviso sobre «\(110\) Records Found».*cifras/);
    // el criterio sostenido, sin tocar el cuerpo
    expect(t).toContain('el defecto es de la aplicación');
    expect(t).toContain('**Datos del empleado**');
  });
});

describe('acoplamiento con el walker — la frontera oráculo/elemento es UNA', () => {
  it('esPasoDeOraculo coincide con ACCIONES_QUE_OBSERVAN, acción a acción', () => {
    for (const a of ACCIONES_QUE_OBSERVAN) {
      expect(esPasoDeOraculo(a), `${a} observa para el walker y no para la propuesta`).toBe(true);
    }
    for (const a of ['click', 'fill', 'goto', 'press', 'select', 'hover', 'check', 'scroll_until']) {
      expect(esPasoDeOraculo(a), `${a} mueve la app`).toBe(false);
    }
  });

  it('la vigencia la decide effectiveDecisions: un defer superseded por app SÍ propone', () => {
    const defer = decision({ paso: 'ciclo/s8', decision: 'defer', hash: 'aaaa0000aaaa0000aaaa0000aaaa0000' });
    const app = decision({ paso: 'ciclo/s8', valor_nuevo: '(110) Records Found', supersedes: defer.hash });
    const vigentes = [...effectiveDecisions([defer, app]).values()];
    const d = derivarCambios(vigentes, guion, original, HUELLA);
    expect(d.cambios).toHaveLength(1);
    expect(d.sin_decidir).toBe(0);
  });
});
