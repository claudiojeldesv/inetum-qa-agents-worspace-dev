/**
 * K0.47 — cada salida del panel tiene su consecuencia correcta, probada CONDUCIENDO
 * el panel de verdad (fixture autopilotado por `qa-assist-cmd`), no sembrando
 * `state.rescues` a mano — que es exactamente como los tests de K0.44 dejaron
 * escapar dos defectos de campo:
 *
 *   (1) el QA obedece el hover en un paso que muta y declara transición → la
 *       promoción era IMPOSIBLE siempre (la transición no puede existir);
 *   (2) "capturar sin ejecutar" no empujaba registro y el parche vive en `.work/`,
 *       que el run siguiente borra → la enseñanza más delicada era la que menos
 *       sobrevivía.
 *
 * Más el agujero del doble disparo: `performed` estaba declarado en el tipo desde
 * K0.14 y no lo consumía nadie — si el QA pulsaba el objetivo grabando, el walker
 * lo re-disparaba después. El contador del fixture es el testigo: 2 = doble.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { aliasPromotionVerdict } from '../src/walk-core.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 'k047', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

/** Un paso click cuyo hint NO existe en la página: fuerza el panel; la página lo maneja según `cmd`. */
async function correr(cmd: string): Promise<{ map: DomMap; aliasPath: string; workDir: string }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-k047-'));
  const aliasPath = resolve(workDir, 'aliases.json');
  const script: WalkScript = {
    version: 1,
    site_id: 'k047',
    entry: `/panel-autopilot.html?cmd=${cmd}`,
    flows: [
      {
        flow: 'pago',
        steps: [{ id: 's1', action: 'click', hint: { role: 'button', name: 'Autorizar el pago' } }],
      },
    ],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: true, assistTimeoutMs: 45_000, assistMinimize: false,
    aliasesPath: aliasPath, timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  const map = await new DomWalker(opts, script, contract, freshState()).run();
  return { map, aliasPath, workDir };
}

const razon = (m: DomMap): string => m.open_questions.find((q) => q.step === 's1')?.reason ?? '';
const leerAliases = (p: string): Record<string, { locator: string }> =>
  existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).aliases : {};

describe('K0.47 — la regla pura, las combinaciones que el campo produjo', () => {
  const base = { stepBlocked: false, expectsTransition: true, transitionRecorded: false, flowExpectsFailed: false };

  it('FRÁGIL no entra nunca, ni con humano y todo lo demás en verde', () => {
    const v = aliasPromotionVerdict({ ...base, source: 'human', executed: 'walker', transitionRecorded: true, fragile: true });
    expect(v.promote).toBe(false);
    if (!v.promote) expect(v.reason).toMatch(/frágil/);
  });

  it('captura-sin-ejecutar (none) + humano promueve AUNQUE el paso quede bloqueado — el bloqueo es el diseño de esa salida, no evidencia', () => {
    const v = aliasPromotionVerdict({ ...base, source: 'human', executed: 'none', stepBlocked: true });
    expect(v.promote).toBe(true);
    if (v.promote) expect(v.viaHumanOverride).toBe(true);
  });

  it('none + subagente NO promueve: sin ejecución y sin mirada humana no hay corroboración', () => {
    const v = aliasPromotionVerdict({ ...base, source: 'llm', executed: 'none' });
    expect(v.promote).toBe(false);
  });

  it('el QA disparó grabando (human): el cerrojo de transición se calla — nadie estaba midiendo', () => {
    const v = aliasPromotionVerdict({ ...base, source: 'human', executed: 'human' });
    expect(v.promote).toBe(true);
  });

  it('el par falsable: ejecutó el WALKER, declaraba transición y no navegó → rechazado igual que siempre', () => {
    // este cerrojo cazó un locator equivocado en campo (bill-pay/s1, .nth(20) que
    // no navegó) y NO se afloja: es evidencia directa sobre el elemento
    const v = aliasPromotionVerdict({ ...base, source: 'human', executed: 'walker' });
    expect(v.promote).toBe(false);
    if (!v.promote) expect(v.reason).toMatch(/transición/);
  });

  it('ausente = walker: los checkpoints viejos se juzgan con la vara de antes', () => {
    const v = aliasPromotionVerdict({ ...base, source: 'human' });
    expect(v.promote).toBe(false);
  });
});

describe('K0.47 — las salidas del panel, conducidas de verdad', () => {
  it('«No existe aquí»: bloqueado como drift, sin alias, y el botón sin tocar', async () => {
    const { map, aliasPath } = await correr('drift');
    expect(razon(map)).toMatch(/drift/);
    expect(Object.keys(leerAliases(aliasPath))).toHaveLength(0);
  }, 120_000);

  it('«Bloquear paso»: bloqueado, sin alias', async () => {
    const { map, aliasPath } = await correr('block');
    expect(razon(map)).toMatch(/bloque/);
    expect(Object.keys(leerAliases(aliasPath))).toHaveLength(0);
  }, 120_000);

  it('«capturar sin ejecutar»: el flujo se detiene Y la enseñanza SOBREVIVE como alias con procedencia humana', async () => {
    const { map, aliasPath } = await correr('capture-click');
    // el flujo abortado sigue siendo el comportamiento K0.14
    expect(razon(map)).toMatch(/capturado sin ejecutar/);
    // y lo nuevo: antes aquí no había NADA — la enseñanza moría con .work/
    const aliases = leerAliases(aliasPath);
    const claves = Object.keys(aliases);
    expect(claves, 'el alias de la captura-sin-ejecutar no se promovió').toHaveLength(1);
    expect(aliases[claves[0]].locator).toMatch(/Confirmar operación/);
  }, 120_000);

  it('performed: el QA pulsó el objetivo grabando y el walker NO lo re-dispara', async () => {
    const { map, workDir, aliasPath } = await correr('record-click');
    const paso = map.step_reports.find((r) => r.step === 's1');
    expect(paso?.outcome).toBe('ok');
    // el testigo es la rama del audit: esa rama hace `return` ANTES de runAction,
    // así que si su línea existe, el segundo disparo es imposible por construcción.
    // (La pantalla no sirve de testigo: se fotografía antes del clic del QA.)
    const audit = readFileSync(resolve(workDir, 'audit-log.json'), 'utf8');
    expect(audit).toMatch(/no se re-dispara/);
    // y la enseñanza entra en memoria con la vara de 'human': sin bracket del
    // walker, el cerrojo de transición no tiene dato y no puede exigirse
    const aliases = leerAliases(aliasPath);
    expect(Object.keys(aliases)).toHaveLength(1);
  }, 120_000);
});
