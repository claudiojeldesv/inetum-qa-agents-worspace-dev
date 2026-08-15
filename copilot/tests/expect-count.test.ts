import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, StepReport, WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

/**
 * Fase 6 (SPEC-caos-corporativo §4) — `expect_count` + captura de tabla, contra
 * LA TABLA de corp-bench (Consulta Declaraciones): reutiliza el guion de 30
 * pasos de `corp-bench.walk.json` tal cual está en el repo (sin tocarlo) y le
 * inyecta en memoria los pasos de cardinalidad, para no duplicar el flujo de
 * login+navegación en un fixture aparte.
 */

const FIXTURES = pathToFileURL(resolve(__dirname, '../fixtures')).href;

const contract: StyleContract = {
  locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
  settle: { quiet_ms: 400, busy_selectors: ['#velo'], ignore_selectors: [] },
};

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

/** El scope nombra "Declaraciones" (aria-label de tabla-dec) — distingue la
 * tabla de resultados de la otra tabla (role=table) del formulario de arriba. */
const TABLA_SCOPE = { role: 'table', name: 'Declaraciones' };

/**
 * s20-s25 del guion base no dejan `current_screen` apuntando a la pantalla de
 * Consulta Declaraciones (ninguno de esos pasos declara `screen:` ni
 * `expect_transition` — el último `capture` real fue en s19, "tras-finalizar").
 * Una `capture` explícita antes de contar fija el ancla correcta para que la
 * tabla capturada quede en la pantalla que de verdad la contiene.
 */
const CAPTURA_CONSULTA: WalkStep = { id: 's25a', action: 'capture', screen: 'consulta-declaraciones' };

const EXPECT_COUNT_ROWS_POSITIVO: WalkStep = {
  id: 's25b',
  action: 'expect_count',
  scope: TABLA_SCOPE,
  hint: { role: 'row' },
  operator: '>',
  value: '0',
};

const RE_BUSCAR: WalkStep = {
  id: 's31',
  action: 'click',
  hint: { role: 'button', name: 'Buscar' },
  expect_after: 'No hay datos para mostrar',
};

const EXPECT_COUNT_SIN_DATOS: WalkStep = {
  id: 's32',
  action: 'expect_count',
  scope: TABLA_SCOPE,
  hint: { role: 'row' },
  operator: '>',
  value: '0',
};

let cached: DomMap | null = null;

async function bench(): Promise<DomMap> {
  if (cached) return cached;
  const base = JSON.parse(
    readFileSync(resolve(__dirname, '../fixtures/corp-bench.walk.json'), 'utf8'),
  ) as WalkScript;
  const steps = [...base.flows[0].steps];
  const idxS25 = steps.findIndex((s) => s.id === 's25');
  steps.splice(idxS25 + 1, 0, CAPTURA_CONSULTA, EXPECT_COUNT_ROWS_POSITIVO);
  steps.push(RE_BUSCAR, EXPECT_COUNT_SIN_DATOS);
  const script: WalkScript = { ...base, flows: [{ ...base.flows[0], steps }] };

  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-count-'));
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
    aliasesPath: resolve(workDir, 'aliases.json'),
    timingProfilePath: resolve(workDir, 'timing.json'),
    calibrate: true,
  };
  cached = await new DomWalker(opts, script, contract, freshState()).run();
  return cached;
}

const report = (map: DomMap, id: string): StepReport => (map.step_reports ?? []).find((r) => r.step === id)!;

describe('Fase 6 — expect_count contra la tabla de corp-bench (Consulta Declaraciones)', () => {
  it('rows > 0 PASA tras la busqueda con resultados', async () => {
    const map = await bench();
    expect(report(map, 's25b').outcome).toBe('ok');
    expect(map.open_questions.find((q) => q.step === 's25b')).toBeUndefined();
  }, 300_000);

  it('la tabla capturada aparece como datos estructurados: cabeceras y filas', async () => {
    const map = await bench();
    const consulta = map.screens.find((s) => s.name === 'consulta-declaraciones')!;
    expect(consulta).toBeDefined();
    expect(consulta.tables ?? []).toHaveLength(1);
    const table = consulta.tables![0];
    expect(table.headers).toEqual(['', 'Declaración', 'Póliza', 'Estado']);
    expect(table.rows.length).toBe(2);
    expect(table.rows.map((r) => r[1])).toContain('DRT-1024');
  }, 300_000);

  /**
   * K0.33 — esta aserción decía 'incumplido' y era un VERDE FALSO del propio
   * banco, destapado al quitar el substring del peldaño de texto alimentado por
   * `name`. Con la búsqueda sin resultados, `#tabla-dec` se OCULTA, así que el
   * ámbito {role:'table', name:'Declaraciones'} no existe en pantalla — pero el
   * plan caía al intento `getByText('Declaraciones')` y resolvía el ámbito al
   * `<h1>Consulta Declaraciones</h1>`. Contar filas dentro de un titular da 0, y
   * ese 0 pasaba por "incumplido": la respuesta correcta por el camino
   * equivocado. Lo verdadero es que no hay DÓNDE contar, y no es lo mismo que
   * "cuenta 0" — el paso sigue siendo postcondition_unmet, pero por su motivo.
   */
  it('sin datos, el contenedor declarado NO está en pantalla y se dice tal cual', async () => {
    const map = await bench();
    expect(report(map, 's32').outcome).toBe('postcondition_unmet');
    const blocked = map.open_questions.find((q) => q.step === 's32');
    expect(blocked).toBeDefined();
    expect(blocked!.reason).toContain('no está en pantalla');
    expect(blocked!.reason).not.toContain('ambigua');
    // "no hay datos" no crashea el run: el resto de pasos ya se ejecutaron
    expect(map.stats.steps_total).toBe(34);
  }, 300_000);
});

/**
 * `captureTable` NO usa `evaluate` en absoluto — ni de cadena ni de función.
 * Se probó primero con una cadena (Playwright nunca invoca un `string` como
 * función: `locator.evaluate("(el) => ...")` devuelve SIEMPRE `undefined`,
 * el argumento nunca se inyecta), y luego con un arrow ANÓNIMO inline (la
 * hipótesis de que `keepNames` de esbuild solo envuelve bindings CON
 * NOMBRE) — y ese también revienta con `__name is not defined` bajo el CLI
 * real (`tsx`) dentro de ESTE fichero, aunque una prueba aislada en un
 * script suelto no lo reproducía. El transform de vitest no lo detecta
 * ninguna de las dos veces (K0.13). La solución que sobrevivió: subir al
 * `<table>` ancestro vía XPath `ancestor::` ENCADENADO sobre el locator
 * (nativo de Playwright, sin ejecutar nada nuestro en la página) y leer
 * cabeceras/filas con `allTextContents()` — cero código in-page, cero
 * riesgo. Se prueba contra el CLI real precisamente porque la hipótesis
 * inicial (arrow anónimo = seguro) parecía razonable y no lo era.
 */
describe('Fase 6 — captura de tabla bajo el CLI real (tsx), no solo el transform de vitest', () => {
  it('expect_count + captura de tabla funcionan lanzando el CLI de verdad', () => {
    const workDir = mkdtempSync(resolve(tmpdir(), 'qa-count-cli-'));
    const scriptPath = resolve(workDir, 'walk.json');
    const contractPath = resolve(workDir, 'contract.yaml');
    writeFileSync(
      scriptPath,
      JSON.stringify({
        version: 1,
        site_id: 'tabla-simple',
        entry: '/tabla-simple.html',
        flows: [
          {
            flow: 'count',
            steps: [
              { id: 's1', action: 'expect_count', scope: { role: 'table', name: 'Resultados' }, hint: { role: 'row' }, operator: '>', value: '0' },
            ],
          },
        ],
      }),
      'utf8',
    );
    writeFileSync(contractPath, 'version: 1\n', 'utf8');

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
      { encoding: 'utf8', timeout: 60_000 },
    );

    expect(r.status).toBe(0);
    const map = JSON.parse(readFileSync(resolve(workDir, 'dom-map.json'), 'utf8')) as DomMap;
    expect(map.open_questions).toEqual([]);
    const screen = map.screens.find((s) => (s.tables ?? []).length > 0);
    expect(screen).toBeDefined();
    expect(screen!.tables![0].headers).toEqual(['Id', 'Nombre']);
    expect(screen!.tables![0].rows).toEqual([['1', 'Uno'], ['2', 'Dos']]);
  }, 90_000);
});
