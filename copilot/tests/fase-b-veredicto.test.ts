/**
 * FASE B — la postcondición incumplida deja de morir en el informe.
 *
 * Hasta aquí, un `expect_text` que no se cumplía llamaba a `blockStep` y volvía: era
 * **el único drift que no podía llegar al acta**. Y no es un drift cualquiera — un
 * literal que no aparece no es un problema de locator, es el negocio diciendo algo
 * distinto de lo que el FD escribió, que es justo lo que el acta existe para recoger.
 *
 * Lo que se prueba aquí NO es que una función pura devuelva la entrada correcta (eso
 * está abajo y es barato). Es el camino ENTERO, con un walker y un navegador de
 * verdad: postcondición incumplida → panel abierto → el QA pulsa → decisión firmada
 * y encadenada → el paso sigue bloqueado y su motivo lleva el veredicto detrás.
 * Atraviesa tres ficheros y una página, y ahí es donde se escondieron los defectos
 * que los tests de unidad de K0.44 no vieron.
 *
 * El guion pide «Solicitud aprobada» y la pantalla dice «Solicitud rechazada».
 *
 * El primer intento copiaba el caso de campo —pedía «Records Found» sobre una pantalla
 * que decía «No Records Found»— y NO falló: el literal positivo casa dentro del negativo
 * y el paso salía VERDE. Es K0.37 reproducido por accidente montando su propio test, y
 * es la demostración de que la fase B **no** cierra ese hueco: un verde no abre panel.
 * Para probar el disparador hace falta una ausencia de verdad.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { parseDecisions, verifyChain, type DecisionEntry } from '../../src/decisions.ts';
import { REGLA_DECISION_ANCLADA } from '../../src/decisions-audit.ts';
import {
  faltaParaFirmar,
  motivoConVeredicto,
  veredictoADecision,
  MAX_LITERAL,
  type VerdictContext,
} from '../src/walk-verdict.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };
const ESPERADO = 'Solicitud aprobada';
/** El motivo de siempre, el que fijan los dos tests de K0.35. No puede desaparecer. */
const MOTIVO_DE_SIEMPRE = 'postcondición del FD no observada';

function freshState(): WalkState {
  return {
    script_hash: 'faseb', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

interface Corrida {
  map: DomMap;
  acta: DecisionEntry[];
  actaPath: string;
  auditPath: string;
}

/**
 * Un flujo con la postcondición que falla y UN PASO DETRÁS. El paso de detrás no es
 * decorado: es el control de que los tres veredictos **continúan el run**, que es lo
 * que el plan promete y lo más fácil de romper sin enterarse.
 */
async function correr(
  cmd: string,
  extra: Partial<WalkerOptions> = {},
  opciones: { criterios?: string[] } = {},
): Promise<Corrida> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-faseb-'));
  const actaPath = resolve(workDir, 'acta.jsonl');
  const script: WalkScript = {
    version: 1,
    site_id: 'faseb',
    entry: `/veredicto-autopilot.html?cmd=${cmd}`,
    flows: [
      {
        flow: 'busqueda',
        criteria: opciones.criterios ?? ['RF-001'],
        steps: [
          { id: 's1', action: 'expect_text', value: ESPERADO },
          { id: 's2', action: 'expect_text', value: 'Listado de peticiones' },
        ],
      },
    ],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: true, assistTimeoutMs: 8_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
    actor: 'qa.tests', fdHash: 'fd-de-prueba', decisionsPath: actaPath,
    ...extra,
  };
  const map = await new DomWalker(opts, script, contract, freshState()).run();
  const acta = existsSync(actaPath) ? parseDecisions(readFileSync(actaPath, 'utf8')).entries : [];
  return { map, acta, actaPath, auditPath: resolve(workDir, 'audit-log.json') };
}

const razon = (m: DomMap, id = 's1'): string => m.open_questions.find((q) => q.step === id)?.reason ?? '';
const salida = (m: DomMap, id: string): string | undefined =>
  m.step_reports?.find((r) => r.step === id)?.outcome;

describe('fase B — el veredicto del QA sobre una postcondición incumplida', () => {
  it('EL PAR PRINCIPAL: «es un defecto» firma en el acta y el motivo de siempre SIGUE ENTERO', async () => {
    const { map, acta, auditPath } = await correr('fd');

    const r = razon(map);
    // el mensaje que fijan los dos tests de K0.35 no se sustituye: se acompaña
    expect(r).toContain(MOTIVO_DE_SIEMPRE);
    expect(r).toContain(`texto '${ESPERADO}' no visible`);
    expect(r).toContain('VEREDICTO DEL QA');
    expect(r).toContain('DEFECTO de la aplicación');

    expect(acta, 'no se firmó ninguna decisión').toHaveLength(1);
    expect(acta[0].decision).toBe('fd');
    expect(acta[0].rf).toBe('RF-001');
    expect(acta[0].paso).toBe('busqueda/s1');
    expect(acta[0].actor).toBe('qa.tests');
    // el QA miró la pantalla de ESTE run, sin reproducción en limpio: eso es en-vivo
    expect(acta[0].evidencia).toBe('en-vivo');
    expect(acta[0].valor_nuevo, 'un defecto NO propone texto nuevo').toBeUndefined();
    expect(verifyChain(acta).ok, 'la cadena del acta tiene que quedar coherente').toBe(true);

    // anclada en el audit-log: es lo ÚNICO que caza la cola truncada del acta
    const audit = readFileSync(auditPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const ancla = audit.find((e) => e.rule === REGLA_DECISION_ANCLADA);
    expect(ancla, 'la decisión no quedó anclada en el audit-log').toBeDefined();
    expect((ancla!.metadata as { hash: string }).hash).toBe(acta[0].hash);

    // y el run CONTINÚA: el paso de detrás se ejecutó
    expect(salida(map, 's2')).toBe('ok');
  }, 120_000);

  it('«la aplicación tiene razón» adopta el literal que el QA elige de lo medido', async () => {
    /**
     * El fixture elige el candidato 0, así que esto prueba DOS cosas a la vez: que la
     * adopción firma el literal, y que el ranking pone el resultado por delante del
     * título de la pantalla. Lo segundo lo aprendí rompiéndolo — con la pantalla
     * titulada «Listado de solicitudes» y el FD pidiendo «Solicitud aprobada», el
     * título ganaba por compartir palabra y el candidato 0 era el rótulo. Si el orden
     * no ayuda, el QA elige a ciegas y el panel es un formulario, no una ayuda.
     */
    const { map, acta } = await correr('app-candidato');
    expect(acta).toHaveLength(1);
    expect(acta[0].decision).toBe('app');
    expect(acta[0].valor_nuevo, 'sin el literal, la fase C no tendría qué sustituir').toBe('Solicitud rechazada');
    expect(razon(map)).toContain('adopta lo que dice la APLICACIÓN');
    expect(salida(map, 's2')).toBe('ok');
  }, 120_000);

  it('la salida «lo señalo yo»: el literal sale de un texto pulsado en la página', async () => {
    const { acta } = await correr('app-senalado');
    expect(acta).toHaveLength(1);
    expect(acta[0].decision).toBe('app');
    expect(acta[0].valor_nuevo).toBe('Solicitud rechazada');
  }, 120_000);

  it('«luego» firma un defer sin literal, y también continúa', async () => {
    const { map, acta } = await correr('defer');
    expect(acta).toHaveLength(1);
    expect(acta[0].decision).toBe('defer');
    expect(acta[0].valor_nuevo).toBeUndefined();
    expect(razon(map)).toContain('PARA LUEGO');
    expect(salida(map, 's2')).toBe('ok');
  }, 120_000);

  it('EL VERDE QUE NO SE FABRICA: con veredicto «app» el paso sigue siendo hallazgo, no verde', async () => {
    /**
     * La tentación es pintar el paso de verde cuando el QA dice que la aplicación
     * tiene razón. Sería fabricar exactamente el verde falso que este trabajo
     * existe para cazar: lo que se MIDIÓ es que el texto del FD no está. El
     * veredicto cambia el criterio del PRÓXIMO run (fase C), no lo medido en éste.
     */
    const { map } = await correr('app-candidato');
    expect(salida(map, 's1')).toBe('postcondition_unmet');
    expect(map.open_questions.some((q) => q.step === 's1'), 'el paso tiene que seguir bloqueado').toBe(true);
  }, 120_000);

  it('el rechazo devuelve el panel en vez de firmar humo, y a la segunda sale', async () => {
    // primero «la aplicación tiene razón» SIN literal (no es una decisión), y al
    // reabrirse el panel el QA elige. Una sola firma, la buena.
    const { acta } = await correr('app-tras-rechazo');
    expect(acta, 'un rechazo no puede dejar entrada en el acta').toHaveLength(1);
    expect(acta[0].decision).toBe('app');
    expect(acta[0].valor_nuevo).toBe('Solicitud rechazada');
  }, 120_000);

  it('CONTROL: un «app» sin literal que nadie corrige NO firma nada', async () => {
    const { map, acta } = await correr('app-vacio', { assistTimeoutMs: 3_000 });
    expect(acta, 'se firmó una decisión vacía').toHaveLength(0);
    expect(razon(map)).toContain(MOTIVO_DE_SIEMPRE);
    expect(razon(map)).not.toContain('VEREDICTO DEL QA');
  }, 120_000);
});

describe('fase B — fail-closed en la puerta: cuándo el panel NO se abre', () => {
  /**
   * El cerrojo va ANTES de gastar la atención del QA, igual que en la fusión de
   * parches. Abrir un panel para pedir un veredicto que después no se va a poder
   * firmar hace trabajar a una persona para nada y pierde su decisión en silencio,
   * que es precisamente lo que el acta existe para impedir.
   *
   * En los tres casos el fixture está esperando para pulsar: si el panel se abriera,
   * habría decisión. Que el acta quede vacía es la prueba de que no se abrió.
   */
  it('sin --assist no hay panel y el motivo es el de siempre, intacto', async () => {
    const { map, acta } = await correr('fd', { assist: false });
    expect(acta).toHaveLength(0);
    expect(razon(map)).toContain(MOTIVO_DE_SIEMPRE);
    expect(razon(map)).not.toContain('VEREDICTO');
  }, 120_000);

  it('sin actor no se abre: una decisión anónima no es evidencia de nada', async () => {
    const { map, acta } = await correr('fd', { actor: undefined, assistTimeoutMs: 3_000 });
    expect(acta).toHaveLength(0);
    expect(razon(map)).not.toContain('VEREDICTO');
  }, 120_000);

  it('sin saber contra qué FD se decide, tampoco', async () => {
    const { acta } = await correr('fd', { fdHash: undefined, assistTimeoutMs: 3_000 });
    expect(acta).toHaveLength(0);
  }, 120_000);

  it('con un flujo que cubre DOS criterios no se inventa cuál: hace falta --rf', async () => {
    const dos = await correr('fd', { assistTimeoutMs: 3_000 }, { criterios: ['RF-001', 'RF-002'] });
    expect(dos.acta, 'se firmó contra un criterio fabricado').toHaveLength(0);

    // y con --rf explícito sí se abre: el cerrojo es la ambigüedad, no el número
    const conRf = await correr('fd', { rf: 'RF-002' }, { criterios: ['RF-001', 'RF-002'] });
    expect(conRf.acta).toHaveLength(1);
    expect(conRf.acta[0].rf).toBe('RF-002');
  }, 240_000);
});

// --------------------------------------------------------------- la regla pura

describe('veredictoADecision — qué es una decisión y qué es un encogimiento de hombros', () => {
  const ctx: VerdictContext = {
    rf: 'RF-007', flow: 'f', step: 's3', fdHash: 'fd1', scriptHash: 'sc1',
    actor: 'ana', esperado: 'Transfer Complete',
  };

  it('app sin literal se RECHAZA: sin saber qué dice la app, la decisión no sirve aguas abajo', () => {
    const r = veredictoADecision({ step: 's3', verdict: 'app' }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/QUÉ dice/);
  });

  it('app con el MISMO literal que el FD pedía se rechaza: se acaba de medir que no está', () => {
    const r = veredictoADecision({ step: 's3', verdict: 'app', value: 'Transfer Complete' }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/Es un defecto/);
  });

  it('app con media pantalla dentro se rechaza: eso es un contenedor, no un resultado', () => {
    const r = veredictoADecision({ step: 's3', verdict: 'app', value: 'x'.repeat(MAX_LITERAL + 1) }, ctx);
    expect(r.ok).toBe(false);
  });

  it('app válido: el literal viaja recortado y el paso queda bien formado', () => {
    const r = veredictoADecision({ step: 's3', verdict: 'app', value: '  Transferencia realizada  ', source: 'candidato' }, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.valor_nuevo).toBe('Transferencia realizada');
      expect(r.input.paso).toBe('f/s3');
      expect(r.input.evidencia).toBe('en-vivo');
      expect(r.nota).toContain('elegido de lo medido');
    }
  });

  it('fd y defer NUNCA llevan valor_nuevo, aunque el panel lo mande', () => {
    for (const v of ['fd', 'defer'] as const) {
      const r = veredictoADecision({ step: 's3', verdict: v, value: 'algo' }, ctx);
      expect(r.ok).toBe(true);
      // un "es un defecto" que además propone texto son dos decisiones
      // contradictorias en una firma, y la fase C leería la propuesta como adoptada
      if (r.ok) expect(r.input.valor_nuevo).toBeUndefined();
    }
  });

  it('un veredicto que no es ninguno de los tres se rechaza', () => {
    const r = veredictoADecision({ step: 's3', verdict: 'sí' as never }, ctx);
    expect(r.ok).toBe(false);
  });
});

describe('faltaParaFirmar y el motivo ampliado', () => {
  const todo = { actor: 'ana', fdHash: 'fd1', rf: 'RF-1', actaSana: true };

  it('con todo puesto no falta nada', () => {
    expect(faltaParaFirmar(todo)).toEqual([]);
  });

  it('cada pieza que falta se nombra, y se nombran TODAS a la vez', () => {
    const f = faltaParaFirmar({ actor: null, fdHash: null, rf: null, actaSana: false });
    expect(f).toHaveLength(4);
    // decirle al QA que falta el actor, y cuando lo pone que falta el FD, y luego
    // que falta el rf, es tres relanzamientos por un solo problema
    expect(f.join(' ')).toMatch(/actor/);
    expect(f.join(' ')).toMatch(/FD/);
    expect(f.join(' ')).toMatch(/--rf/);
    expect(f.join(' ')).toMatch(/cadena rota/);
  });

  it('un acta con la cadena rota frena la firma: encadenar encima sella la manipulación', () => {
    expect(faltaParaFirmar({ ...todo, actaSana: false })).toHaveLength(1);
  });

  it('el motivo ampliado CONSERVA el original delante y añade el hash de la decisión', () => {
    const m = motivoConVeredicto('drift: postcondición del FD no observada — texto x', 'el QA dice y', 'abc123');
    expect(m.startsWith('drift: postcondición del FD no observada')).toBe(true);
    expect(m).toContain('VEREDICTO DEL QA: el QA dice y');
    expect(m).toContain('[decisión abc123]');
  });
});
