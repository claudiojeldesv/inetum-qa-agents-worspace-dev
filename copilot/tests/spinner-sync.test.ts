import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, SettleProfile, StepReport, WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

/**
 * Sincronización contra DOM vivo (K0.13). El fixture reproduce el patrón que
 * rompe la sincronización naíf: DOS ciclos de spinner en la misma carga con un
 * hueco de calma FALSA entre ellos, más un reloj de polling que repinta cada
 * 250 ms para siempre.
 *
 * El test central es un PAR falsable: el mismo guion sobre la misma página, y lo
 * único que cambia es la política de espera. Con "espera a que el spinner
 * desaparezca" el clic se pierde; con la ventana de quietud, no. Si algún día la
 * capa 2 deja de funcionar, este par se rompe.
 */

const FIXTURES = pathToFileURL(resolve(__dirname, '../fixtures')).href;

const contract: StyleContract = {
  locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
};

/** Emula la sincronización que escribe casi todo el mundo: "spinner no visible → adelante". */
const NAIVE_SETTLE: SettleProfile = { quiet_ms: 1, max_mutations: 999_999 };

function freshState(): WalkState {
  return {
    script_hash: 'test',
    completed: [],
    rescues_used: 0,
    screens: [],
    transitions: [],
    open_questions: [],
    rescues: [],
    current_screen: null,
    step_reports: [],
  };
}

interface RunResult {
  map: DomMap;
  workDir: string;
  report: (stepId: string) => StepReport | undefined;
}

async function walk(steps: WalkStep[], settle?: SettleProfile): Promise<RunResult> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-settle-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'spinner-multi',
    entry: '/spinner-multi.html',
    flows: [{ flow: 'sync', steps }],
    ...(settle ? { settle } : {}),
  };
  const opts: WalkerOptions = {
    scriptPath: 'test',
    contractPath: 'test',
    baseUrl: FIXTURES,
    workDir,
    rescueBudget: 0,
    screenCap: 60,
    headed: false,
    assist: false,
    assistTimeoutMs: 1_000,
    assistMinimize: false,
    // fuera de config/: el test no puede tocar la memoria durable del proyecto
    aliasesPath: resolve(workDir, 'aliases.json'),
    timingProfilePath: resolve(workDir, 'timing.json'),
    calibrate: true,
  };
  const walker = new DomWalker(opts, script, contract, freshState());
  const map = await walker.run();
  return {
    map,
    workDir,
    report: (stepId) => (map.step_reports ?? []).find((r) => r.step === stepId),
  };
}

describe('capa 2 — ventana de quietud vs "el spinner ya no esta"', () => {
  it('la sincronizacion naif actua en el hueco falso y PIERDE el clic', async () => {
    const { map, report } = await walk(
      [{ id: 's1', action: 'click', hint: { role: 'button', name: 'Consultar' }, expect_after: 'Consulta OK' }],
      NAIVE_SETTLE,
    );

    const r = report('s1')!;
    expect(r.outcome).toBe('postcondition_unmet');
    // el diagnostico correcto: la accion no surtio efecto, la pantalla no cambio
    const blocked = map.open_questions.find((q) => q.step === 's1')!;
    expect(blocked.reason).toContain('no surtió efecto');
    // y no se reintento, porque un click puede duplicar negocio
    expect(r.retried).toBe(false);
    expect(r.retry_refused).toContain('retry_safe');
  }, 120_000);

  it('con la ventana de quietud el mismo guion pasa a la primera', async () => {
    const { map, report } = await walk([
      { id: 's1', action: 'click', hint: { role: 'button', name: 'Consultar' }, expect_after: 'Consulta OK' },
    ]);

    expect(report('s1')!.outcome).toBe('ok');
    expect(report('s1')!.retried).toBe(false);
    expect(map.open_questions).toHaveLength(0);
    expect(map.stats.postcondition_unmet).toBe(0);
  }, 120_000);

  /**
   * Un solo walk para las tres observaciones de la carga: cada `walk()` arranca su
   * propio Chromium y repetirlo por assert no compra nada.
   */
  it('la carga con doble ciclo queda MEDIDA: ciclos contados, senales, y sin colgarse', async () => {
    const { workDir, report } = await walk([{ id: 's1', action: 'capture', screen: 'inicial' }]);
    const entry = report('__entry')!;

    // los dos ciclos son DATO, no sorpresa
    expect(entry.settle!.busy_cycles).toBeGreaterThanOrEqual(2);
    // las dos senales distintas del fixture: clase .spinner y aria-busy
    expect(entry.settle!.signals.length).toBeGreaterThanOrEqual(2);
    // esperó hasta el final del segundo ciclo, no hasta el hueco
    expect(entry.settle!.waited_ms).toBeGreaterThan(1_000);

    // el reloj de polling (250 ms, para siempre) no cuelga la espera: la regla es
    // de TASA, no de presencia. Con tolerancia cero esto seria timed_out.
    expect(entry.settle!.timed_out).toBe(false);
    expect(report('s1')!.settle!.timed_out).toBe(false);

    // capa 4: lo observado se persiste y calibra el run siguiente
    const profile = JSON.parse(readFileSync(resolve(workDir, 'timing.json'), 'utf8'));
    expect(profile.version).toBe(1);
    expect(profile.site_id).toBe('spinner-multi');
    expect(profile.steps['sync/__entry'].samples).toEqual([entry.settle!.waited_ms]);
  }, 120_000);
});

/**
 * Este test existe por un bug concreto, y no se borra.
 *
 * La primera versión del observador de quietud se pasaba a `page.evaluate` como
 * REFERENCIA de función. Playwright serializa `fn.toString()`, y esbuild —que es lo
 * que usa `tsx` en producción— envuelve las declaraciones con su helper `__name`
 * (keepNames). Ese helper no existe en la página: `ReferenceError: __name is not
 * defined`, settle capturado por el catch y silenciosamente inerte. El transform de
 * vitest NO añade `__name`, así que TODOS los tests de arriba pasaban en verde
 * mientras el CLI no esperaba nada.
 *
 * Moraleja operativa: el código in-page hay que ejercitarlo por el MISMO camino de
 * ejecución que producción. Este test lanza el CLI de verdad, con tsx, en un
 * subproceso.
 */
describe('el CLI real (tsx), no solo el modulo importado', () => {
  it('el observador de quietud funciona bajo tsx y no solo bajo el transform de vitest', () => {
    const workDir = mkdtempSync(resolve(tmpdir(), 'qa-settle-cli-'));
    const scriptPath = resolve(workDir, 'walk.json');
    const contractPath = resolve(workDir, 'contract.yaml');

    writeFileSync(
      scriptPath,
      JSON.stringify({
        version: 1,
        site_id: 'spinner-multi',
        entry: '/spinner-multi.html',
        flows: [
          {
            flow: 'sync',
            steps: [
              { id: 's1', action: 'click', hint: { role: 'button', name: 'Consultar' }, expect_after: 'Consulta OK' },
            ],
          },
        ],
      }),
      'utf8',
    );
    // el pack declara una señal propia y un subárbol de polling a ignorar
    writeFileSync(
      contractPath,
      ['version: 1', 'settle:', '  busy_selectors:', "    - '.overlay'", '  ignore_selectors:', "    - '#reloj'", ''].join('\n'),
      'utf8',
    );

    // node + loader tsx en vez de `npx ... --shell`: mismo transform que producción,
    // sin shell (que en Windows concatena sin escapar) y sin depender del PATH.
    const r = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'copilot/src/dom-walker.ts',
        `--script=${scriptPath}`,
        `--contract=${contractPath}`,
        `--base-url=${FIXTURES}`,
        `--work-dir=${workDir}`,
        `--timing-profile=${resolve(workDir, 'timing.json')}`,
        `--aliases=${resolve(workDir, 'aliases.json')}`,
      ],
      { encoding: 'utf8', timeout: 180_000 },
    );

    expect(r.status).toBe(0);
    // el sintoma exacto del bug: settle inerte -> este mensaje en stderr
    expect(r.stderr ?? '').not.toContain('settle no observado');

    const map = JSON.parse(readFileSync(resolve(workDir, 'dom-map.json'), 'utf8'));
    const entry = (map.step_reports as StepReport[]).find((x) => x.step === '__entry')!;
    // con el bug: waited_ms 0, busy_cycles 0. Sin el bug: los dos ciclos de la carga.
    expect(entry.settle!.busy_cycles).toBeGreaterThanOrEqual(2);
    expect(entry.settle!.waited_ms).toBeGreaterThan(1_000);
    // y el paso pasa a la primera, que es la consecuencia observable
    expect((map.step_reports as StepReport[]).find((x) => x.step === 's1')!.outcome).toBe('ok');
    expect(map.open_questions).toHaveLength(0);
  }, 240_000);
});

describe('capa 3 — la postcondicion como oraculo, con reintento discriminado', () => {
  it('un clic perdido se recupera al reintentar y se clasifica como flaky, no como drift', async () => {
    const { map, report } = await walk([
      {
        id: 's1',
        action: 'click',
        hint: { role: 'button', name: 'Filtrar' },
        expect_after: 'Paso 2 listo',
        retry_safe: true,
      },
    ]);

    const r = report('s1')!;
    expect(r.outcome).toBe('ok_after_retry');
    expect(r.retried).toBe(true);
    expect(r.retry_reason).toContain('no surtió efecto');
    // la distincion que importa: esto NO contamina el diagnostico del plan
    expect(map.stats.flaky_timing).toBe(1);
    expect(map.stats.postcondition_unmet).toBe(0);
    expect(map.open_questions).toHaveLength(0);
  }, 120_000);

  it('si la pantalla YA cambio no se reintenta: no se duplica la operacion de negocio', async () => {
    const { map, report } = await walk([
      {
        id: 's1',
        action: 'click',
        hint: { role: 'button', name: 'Crear declaración' },
        // postcondicion que la app nunca produce: el caso "el plan dice otra cosa"
        expect_after: 'Declaración firmada',
        // el guion la declara reintentable, y aun asi NO se reintenta: manda la huella
        retry_safe: true,
      },
      { id: 's2', action: 'capture', screen: 'final' },
    ]);

    const r = report('s1')!;
    expect(r.outcome).toBe('postcondition_unmet');
    expect(r.retried).toBe(false);
    expect(map.open_questions.find((q) => q.step === 's1')!.reason).toContain('drift candidato');

    // la prueba dura: UNA declaracion creada, no dos
    const final = map.screens.find((s) => s.name === 'final')!;
    const contador = (final.business_text ?? []).map((b) => b.name);
    expect(contador).toContain('Creados: 1');
    expect(contador).not.toContain('Creados: 2');
  }, 120_000);

  it('accion no reintentable con pantalla intacta: se para y se dice por que', async () => {
    const { map, report } = await walk([
      { id: 's1', action: 'click', hint: { role: 'button', name: 'Continuar' }, expect_after: 'Nunca aparece' },
    ]);

    const r = report('s1')!;
    expect(r.outcome).toBe('postcondition_unmet');
    expect(r.retried).toBe(false);
    expect(r.retry_refused).toContain('duplicar estado de negocio');
    expect(map.open_questions.find((q) => q.step === 's1')!.reason).toContain('no surtió efecto');
  }, 120_000);
});

