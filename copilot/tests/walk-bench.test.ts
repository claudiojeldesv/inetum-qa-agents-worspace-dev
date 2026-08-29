/**
 * El banco de pruebas de paneles, probado.
 *
 * Lo de siempre al cuadrado: el banco existe para probar los paneles sin gastar
 * la atención del QA, y estos tests existen para que el banco no mienta. Las dos
 * cosas que NO pueden fallar en silencio son sus guardas — que firma como
 * `banco-de-pruebas` y solo dentro de su work-dir — y que una expectativa
 * incumplida se ponga ROJA: un banco que aprueba por vacuidad es peor que no
 * tener banco, porque desactiva la vigilancia de la persona.
 *
 * Los E2E conducen el fixture de veredicto SIN `?cmd`: el autopiloto de la página
 * no toca nada y quien pulsa es el banco, por el mismo canal que usaría contra
 * OrangeHRM. Es deliberadamente el camino de producción del banco, no un atajo.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { correrBanco } from '../src/walk-bench.ts';
import type { ResultadoBanco } from '../src/walk-bench.ts';
import {
  ACTA_DEL_BANCO,
  ACTOR_BANCO,
  claveDeMarcador,
  esPanelDeVeredicto,
  evaluarFinal,
  evaluarPanel,
  gestoDeSocorro,
  validarEscenario,
} from '../src/bench-core.ts';
import type { Escenario } from '../src/bench-core.ts';
import type { StyleContract } from '../src/dom-walker.ts';
import type { WalkScript } from '../src/walk-types.ts';
import type { DecisionEntry } from '../../src/decisions.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const REPO = resolve(__dirname, '../..');
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };
const ESPERADO = 'Solicitud aprobada';

function guion(): WalkScript {
  return {
    version: 1,
    site_id: 'faseb',
    // sin ?cmd: el autopiloto del fixture queda mudo y conduce el BANCO
    entry: '/veredicto-autopilot.html',
    flows: [
      {
        flow: 'busqueda',
        criteria: ['RF-001'],
        steps: [
          { id: 's1', action: 'expect_text', value: ESPERADO },
          { id: 's2', action: 'expect_text', value: 'Listado de peticiones' },
        ],
      },
    ],
  };
}

function correr(escenario: Escenario, extra: { abrirPanel?: boolean; timeoutMs?: number } = {}): Promise<ResultadoBanco> {
  return correrBanco({
    script: guion(),
    contract,
    escenario,
    workDir: mkdtempSync(resolve(tmpdir(), 'qa-banco-')),
    baseUrl: FIX,
    assistTimeoutMs: extra.timeoutMs ?? 20_000,
    abrirPanel: extra.abrirPanel ?? false,
    fdHash: 'fd-de-prueba',
  });
}

// ------------------------------------------------------------------- el núcleo

describe('bench-core — el escenario se valida antes de gastar navegador', () => {
  it('un escenario bien formado pasa', () => {
    const r = validarEscenario({ version: 1, acciones: [{ paso: 's1', hacer: [{ cmd: 'fd' }] }] });
    expect(r.ok).toBe(true);
  });

  it('cada defecto estructural se nombra: version, paso, gesto ambiguo', () => {
    const r = validarEscenario({
      version: 2,
      acciones: [{ hacer: [] }, { paso: 's2', hacer: [{ cmd: 'fd', esperar_ms: 100 }] }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores.join(' ')).toMatch(/version/);
      expect(r.errores.join(' ')).toMatch(/paso/);
      expect(r.errores.join(' ')).toMatch(/exactamente uno/);
    }
  });

  it('el gesto de socorro distingue los dos paneles, y la clave no lleva reloj', () => {
    expect(esPanelDeVeredicto('expect_text')).toBe(true);
    expect(esPanelDeVeredicto('click')).toBe(false);
    expect(gestoDeSocorro('expect_text')).toBe('defer');
    expect(gestoDeSocorro('click')).toBe('block');
    // el marcador se reescribe al grabar (cambia `abierto`): si la clave llevara
    // el reloj, cada gesto grabado parecería un panel nuevo
    expect(claveDeMarcador({ flow: 'f', step: 's7' })).toBe('f|s7');
  });
});

describe('bench-core — una expectativa incumplida se pone ROJA, no se pasa por vacuidad', () => {
  const entrada = (over: Partial<DecisionEntry>): DecisionEntry =>
    ({
      rf: 'RF-1', paso: 'f/s1', decision: 'fd', fd_hash: 'x', script_hash: 'y',
      evidencia: 'en-vivo', actor: ACTOR_BANCO, timestamp: '2026-08-29T00:00:00Z', hash: 'h1',
      ...over,
    }) as DecisionEntry;
  const mapa = { open_questions: [], step_reports: [] };

  it('EL PAR: la decisión esperada presente pasa; la ausente se nombra con lo que sí hay', () => {
    const acta = [entrada({})];
    const bien = evaluarFinal({ decisiones: [{ paso: 'f/s1', decision: 'fd' }] }, acta, mapa);
    expect(bien.find((c) => c.que.includes('firmada fd'))?.ok).toBe(true);

    const mal = evaluarFinal({ decisiones: [{ paso: 'f/s1', decision: 'app', valor_nuevo: 'X' }] }, acta, mapa);
    const roja = mal.find((c) => c.que.includes('firmada app'));
    expect(roja?.ok).toBe(false);
    expect(roja?.detalle, 'el informe tiene que decir qué había en el acta').toContain('f/s1:fd');
  });

  it('LA GUARDA: una firma con actor humano pone el informe rojo aunque nadie lo pidiera', () => {
    const comps = evaluarFinal(undefined, [entrada({ actor: 'claudio.jeldes' })], mapa);
    const guarda = comps.find((c) => c.que.includes('GUARDA'));
    expect(guarda?.ok).toBe(false);
    expect(guarda?.detalle).toContain('claudio.jeldes');
  });

  it('exigir texto del panel sin poder leerlo es un fallo que dice el remedio', () => {
    const comps = evaluarPanel({ paso: 's1', hacer: [], panel_contiene: ['x'] }, null);
    expect(comps).toHaveLength(1);
    expect(comps[0].ok).toBe(false);
    expect(comps[0].detalle).toContain('--abrir-panel');
  });
});

// ----------------------------------------------------------------------- E2E

describe('el banco conduce el panel de verdad, por el canal de producción', () => {
  it('EL CAMINO ENTERO: elige un candidato, firma «app» como banco, y lee lo que el panel dice', async () => {
    const r = await correr(
      {
        version: 1,
        proposito: 'autotest del banco: veredicto app con candidato',
        acciones: [
          {
            paso: 's1',
            hacer: [{ cmd: { choose: 0 } }, { cmd: 'app' }],
            // lo que costó una sesión de campo: la salida escrita y las tildes
            panel_contiene: ['tres botones', 'La aplicación tiene razón'],
            panel_no_contiene: ['aplicacion tiene razon', 'senalo yo'],
          },
        ],
        al_final: {
          acta_total: 1,
          decisiones: [{ paso: 'busqueda/s1', decision: 'app', valor_nuevo: 'Solicitud rechazada' }],
          outcomes: { s1: 'postcondition_unmet', s2: 'ok' },
          motivo_contiene: { s1: ['VEREDICTO DEL QA'] },
        },
      },
      { abrirPanel: true },
    );

    expect(r.comprobaciones.filter((c) => !c.ok), 'comprobaciones rojas').toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.paneles).toHaveLength(1);
    expect(r.paneles[0].tipo).toBe('veredicto');
    expect(r.paneles[0].texto).toContain('La aplicación tiene razón');

    // las guardas, medidas y no solo declaradas: actor del banco, acta en el work-dir
    expect(r.acta[0].actor).toBe(ACTOR_BANCO);
    expect(r.actaPath.endsWith(ACTA_DEL_BANCO)).toBe(true);
    expect(existsSync(resolve(REPO, 'config/decisions/faseb.jsonl')), 'el banco escribió en el acta del sitio').toBe(false);
  }, 180_000);

  it('un panel NO previsto no cuelga el run: gesto de socorro, informe rojo, y el panel previsto que no llega también canta', async () => {
    const r = await correr({
      version: 1,
      proposito: 'autotest del banco: escenario que no casa con la realidad',
      // s99 no existe → nunca se abre; s1 sí se abre → no está previsto
      acciones: [{ paso: 's99', hacer: [{ cmd: 'fd' }] }],
    });

    expect(r.ok).toBe(false);
    expect(r.paneles).toHaveLength(1);
    expect(r.paneles[0].cubierto).toBe(false);
    // el socorro de un veredicto es «luego»: firma defer, que es lo que significa
    expect(r.acta).toHaveLength(1);
    expect(r.acta[0].decision).toBe('defer');
    expect(r.acta[0].actor).toBe(ACTOR_BANCO);
    // y el run CONTINUÓ hasta s2 en vez de morir por timeout
    expect(r.map.step_reports?.find((x) => x.step === 's2')?.outcome).toBe('ok');

    const que = r.comprobaciones.map((c) => `${c.ok ? '+' : '-'}${c.que}`).join('\n');
    expect(que).toMatch(/-panel NO previsto .*s1/);
    expect(que).toMatch(/-el panel previsto para s99 nunca se abrió/);
  }, 180_000);
});
