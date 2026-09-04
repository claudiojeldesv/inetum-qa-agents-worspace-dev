/**
 * F1 del plan del example — el protocolo del respondedor de rescate, en tests.
 *
 * Por qué estos y no otros: el command es prosa, pero las tres cosas que pueden
 * dejar un run corrupto son código y se citan aquí.
 *
 *  1. La GRAMÁTICA del locator. Si pasa notación que el emisor no entiende, el
 *     fallo aparece lejos (al ejecutar el spec) y con un mensaje que no habla
 *     del origen. Es la lista blanca de D20, reutilizada; se comprueba que el
 *     respondedor la aplica de verdad y no solo que exista.
 *  2. La RESPUESTA se construye, no se dicta. Teclear JSON a mano ya falló dos
 *     veces medidas en este repo (el comillado de PowerShell, y un orquestador
 *     inventándose nombres de campo). Se comprueba la forma exacta que el
 *     walker consume: `{step, locator, reason?}` con `locator: null` al declinar.
 *  3. Una petición ya contestada NO se vuelve a anunciar. Entre «escribo la
 *     respuesta» y «el walker la consume» el fichero de petición sigue en
 *     disco; sin este cerrojo el orquestador contestaría dos veces el mismo
 *     paso y gastaría un turno (y un rescate del presupuesto) en nada.
 *
 * Sin navegador y sin red: todo lo de aquí es aritmética de ficheros.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  veredictoDelLocator,
  procesoVivo,
  leerEstado,
  leerPeticion,
  argsDelWalker,
  contextoDelGuion,
  resumenDelRun,
  EXIT_OK,
  EXIT_ERROR,
  EXIT_PENDING,
} from '../../src/scripts/run-regresion-mecanico.ts';

const SCRIPT = resolve(process.cwd(), 'src/scripts/run-regresion-mecanico.ts');
/**
 * Se invoca `node <tsx/cli.mjs>` y no `npx tsx`: en Windows `npx` es un `.cmd` y
 * Node ya no lo lanza sin shell — y CON shell los valores que llevan espacios se
 * cortan en el primer espacio (`--motivo=no esta aqui` llegaba como `no`), asi
 * que el test mediria el shell en vez del stage. Sin shell y sin `.cmd`, los
 * argumentos llegan tal cual.
 */
const TSX = resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');

/** Ejecuta un stage de verdad y devuelve exit + stdout parseado. */
function stage(args: string[]): { code: number; out: any; raw: string } {
  try {
    const raw = execFileSync(process.execPath, [TSX, SCRIPT, ...args], { encoding: 'utf8' });
    return { code: 0, out: safeJson(raw), raw };
  } catch (err: any) {
    const raw = String(err.stdout ?? '') + String(err.stderr ?? '');
    return { code: err.status ?? 1, out: safeJson(String(err.stdout ?? '')), raw };
  }
}

function safeJson(s: string): any {
  const i = s.indexOf('{');
  if (i < 0) return null;
  try {
    return JSON.parse(s.slice(i));
  } catch {
    return null;
  }
}

describe('veredictoDelLocator — la puerta de la gramática', () => {
  it('acepta las formas que el emisor sabe escribir, encadenadas incluidas', () => {
    for (const l of [
      "getByRole('link', { name: 'Book now' })",
      "getByTestId('room-1') >> getByRole('button', { name: 'Book' })",
      "css=.room-card >> getByText('Single')",
      "getByRole('row').filter({ hasText: 'Single' }) >> getByRole('link')",
    ]) {
      expect(veredictoDelLocator({ locator: l }), l).toEqual({ ok: true });
    }
  });

  it('RECHAZA notación propia del modelo — el caso real fue anchored(...)', () => {
    const v = veredictoDelLocator({ locator: 'anchored("Book now")' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toContain('anchored');
  });

  it('rechaza también cuando el segmento MALO va en medio de la cadena', () => {
    // El primer segmento es bueno: si la comprobación fuese solo del primero,
    // esto pasaría. Es el fallo que la lista blanca existe para cazar.
    const v = veredictoDelLocator({ locator: "getByTestId('x') >> anchored('y')" });
    expect(v.ok).toBe(false);
  });

  it('un locator vacío no es una declinación: manda usar --declinar', () => {
    const v = veredictoDelLocator({ locator: '   ' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.motivo).toContain('--declinar');
  });

  it('no acepta repetir lo que el hint ya expresaba', () => {
    const hint = "getByRole('link', { name: 'Book now' })";
    expect(veredictoDelLocator({ locator: hint, hintExpresado: hint }).ok).toBe(false);
    expect(veredictoDelLocator({ locator: `${hint}.nth(0)`, hintExpresado: hint }).ok).toBe(true);
  });
});

describe('procesoVivo — saber si el walker sigue ahí', () => {
  it('dice la verdad sobre este proceso y sobre uno inventado', () => {
    expect(procesoVivo(process.pid)).toBe(true);
    expect(procesoVivo(999_999)).toBe(false);
    expect(procesoVivo(undefined)).toBe(false);
  });
});

describe('argsDelWalker — lo que se le pasa al motor', () => {
  it('lleva el presupuesto de rescate y NUNCA --assist (ése es el otro camino)', () => {
    const a = argsDelWalker({
      script: 'g.json',
      baseUrl: 'https://x.test',
      workDir: '.work/x',
      rescueBudget: 3,
    });
    expect(a).toContain('--rescue-budget=3');
    expect(a.some((x) => x.startsWith('--assist'))).toBe(false);
    expect(a[0]).toBe('copilot/src/dom-walker.ts');
  });

  it('los opcionales solo aparecen si se piden', () => {
    const sin = argsDelWalker({ script: 'g', baseUrl: 'u', workDir: 'w', rescueBudget: 1 });
    expect(sin.some((x) => x.startsWith('--criterios'))).toBe(false);
    const con = argsDelWalker({
      script: 'g',
      baseUrl: 'u',
      workDir: 'w',
      rescueBudget: 1,
      criterios: 'c.json',
      contract: 'k.yaml',
      headed: true,
    });
    expect(con).toContain('--criterios=c.json');
    expect(con).toContain('--contract=k.yaml');
    expect(con).toContain('--headed');
  });
});

describe('lectura de artefactos', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(resolve(tmpdir(), 'regresion-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('contextoDelGuion cuenta flujos y pasos, y saca el site_id', () => {
    const p = resolve(dir, 'g.walk.json');
    writeFileSync(
      p,
      JSON.stringify({ site_id: 'sitio-x', flows: [{ flow: 'a', steps: [1, 2] }, { flow: 'b', steps: [3] }] }),
    );
    expect(contextoDelGuion(p)).toEqual({ siteId: 'sitio-x', flujos: 2, pasos: 3 });
  });

  it('una petición a medio escribir NO se anuncia como petición', () => {
    writeFileSync(resolve(dir, 'rescue-request.json'), '{"flow":"cp001","ste');
    expect(leerPeticion(dir)).toBeNull();
  });

  it('una petición sin step tampoco cuenta', () => {
    writeFileSync(resolve(dir, 'rescue-request.json'), JSON.stringify({ flow: 'cp001' }));
    expect(leerPeticion(dir)).toBeNull();
  });

  it('un estado ilegible se reconstruye en vez de tumbar el run', () => {
    writeFileSync(resolve(dir, 'regresion-estado.json'), 'no soy json');
    expect(leerEstado(dir)).toEqual({ version: 1, work_dir: dir, contestadas: 0 });
  });

  it('resumenDelRun dice que falta el mapa en vez de inventar ceros', () => {
    expect(resumenDelRun(dir).exit_esperado).toContain('sin dom-map');
  });

  it('resumenDelRun cuenta bloqueados, rescates y pasos del parche', () => {
    writeFileSync(
      resolve(dir, 'dom-map.json'),
      JSON.stringify({
        stats: { steps_total: 10, steps_ok: 8 },
        open_questions: [{ step: 's1' }, { step: 's2' }],
        rescues: [{ step: 's1', resolved: true }],
        assist_patch: { steps: [{ step: 's1' }] },
      }),
    );
    const r = resumenDelRun(dir);
    expect(r.bloqueados).toBe(2);
    expect(r.rescates).toBe(1);
    expect(r.assist_patch).toBe(1);
  });
});

describe('stage responder — de punta a punta, con el proceso real', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(resolve(tmpdir(), 'regresion-e2e-'));
    writeFileSync(
      resolve(dir, 'rescue-request.json'),
      JSON.stringify({
        version: 1,
        flow: 'cp001-reserva',
        step: 's5',
        action: 'click',
        hint: { role: 'link', name: 'Book now' },
        aria_snapshot: '- link "Book now"',
      }),
    );
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('escribe la respuesta en la forma EXACTA que el walker consume', () => {
    const r = stage(['responder', `--work-dir=${dir}`, "--locator=getByRole('link', { name: 'Book now' }).nth(0)"]);
    expect(r.code, r.raw).toBe(EXIT_OK);
    const escrito = JSON.parse(readFileSync(resolve(dir, 'rescue-response.json'), 'utf8'));
    // `step` sin el flow: es lo que compara `consumeRescueResponse`.
    expect(escrito).toEqual({ step: 's5', locator: "getByRole('link', { name: 'Book now' }).nth(0)" });
  });

  it('al declinar escribe locator NULL, no una cadena vacía', () => {
    const r = stage(['responder', `--work-dir=${dir}`, '--declinar', '--motivo=no está en el snapshot']);
    expect(r.code, r.raw).toBe(EXIT_OK);
    const escrito = JSON.parse(readFileSync(resolve(dir, 'rescue-response.json'), 'utf8'));
    expect(escrito.locator).toBeNull();
    expect(escrito.reason).toBe('no está en el snapshot');
  });

  it('declinar SIN motivo se rechaza: un null mudo no sirve aguas abajo', () => {
    const r = stage(['responder', `--work-dir=${dir}`, '--declinar']);
    expect(r.code).toBe(EXIT_ERROR);
    expect(existsSync(resolve(dir, 'rescue-response.json'))).toBe(false);
  });

  it('un locator con gramática mala NO llega a disco', () => {
    const r = stage(['responder', `--work-dir=${dir}`, '--locator=anchored("Book now")']);
    expect(r.code).toBe(EXIT_ERROR);
    expect(existsSync(resolve(dir, 'rescue-response.json'))).toBe(false);
  });

  it('sin petición pendiente no se puede responder', () => {
    rmSync(resolve(dir, 'rescue-request.json'));
    const r = stage(['responder', `--work-dir=${dir}`, "--locator=getByRole('link')"]);
    expect(r.code).toBe(EXIT_ERROR);
  });

  it('tras contestar, `esperar` NO vuelve a anunciar el mismo paso', () => {
    // El cerrojo del punto 3: el fichero de petición sigue en disco hasta que el
    // walker la consume. Con el walker muerto (no hay pid), `esperar` tiene que
    // dar el run por terminado en vez de pedir el mismo rescate otra vez.
    expect(stage(['responder', `--work-dir=${dir}`, "--locator=getByRole('link').nth(0)"]).code).toBe(EXIT_OK);
    const r = stage(['esperar', `--work-dir=${dir}`, '--cap=3']);
    expect(r.code, r.raw).toBe(EXIT_OK);
    expect(r.out?.terminado).toBe(true);
  });

  it('una petición NUEVA sí se anuncia, con snapshot e instrucciones', () => {
    expect(stage(['responder', `--work-dir=${dir}`, "--locator=getByRole('link').nth(0)"]).code).toBe(EXIT_OK);
    writeFileSync(
      resolve(dir, 'rescue-request.json'),
      JSON.stringify({
        flow: 'cp002-otro',
        step: 's9',
        action: 'fill',
        aria_snapshot: '- textbox "Firstname"',
        instructions: 'Resuelve el locator...',
        budget_remaining: 2,
      }),
    );
    const r = stage(['esperar', `--work-dir=${dir}`, '--cap=5']);
    expect(r.code, r.raw).toBe(EXIT_PENDING);
    expect(r.out?.pending).toBe('rescate');
    expect(r.out?.paso).toBe('cp002-otro/s9');
    expect(r.out?.aria_snapshot).toContain('Firstname');
    expect(r.out?.budget_remaining).toBe(2);
  });
});

describe('stage arrancar — las puertas antes de abrir un navegador', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(resolve(tmpdir(), 'regresion-arr-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('rechaza presupuesto 0: sin rescate no hay nada que conducir', () => {
    writeFileSync(
      resolve(dir, 'regresion-estado.json'),
      JSON.stringify({ version: 1, work_dir: dir, script: 'g.json', contestadas: 0 }),
    );
    const r = stage(['arrancar', `--work-dir=${dir}`, '--base-url=https://x.test', '--rescue-budget=0']);
    expect(r.code).toBe(EXIT_ERROR);
    expect(r.raw).toContain('rescue-budget');
  });

  it('sin setup previo no arranca: no se inventa el guion', () => {
    const r = stage(['arrancar', `--work-dir=${dir}`, '--base-url=https://x.test']);
    expect(r.code).toBe(EXIT_ERROR);
    expect(r.raw).toContain('setup');
  });
});
