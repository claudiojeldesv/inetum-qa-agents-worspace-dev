/**
 * EL FLECO DE LA FASE 2 — lo que el QA enseña tiene que DECIRSE al terminar.
 *
 * Medido en EspoCRM (2026-09-02): dos de los cuatro rescates de un run fueron
 * para pasos que el QA YA había enseñado el día anterior. La cadena entera
 * existe —panel → parche verificado → fusión firmada → memoria durable— y se
 * verificó a mano que la fusión se comporta bien (retiene los cambios que
 * alteran QUÉ elemento hace el paso hasta que se nombran). Lo que faltaba era
 * el traspaso: el run terminaba sin mencionar que había un parche esperando.
 *
 * Lo que estos tests fijan NO es que se funda solo —fundir se aprueba, y esa
 * regla no se toca— sino que el dom-map lleve la cuenta, y con la distinción
 * que el QA no puede deducir: el ALIAS sobrevive al run, el GUION no cambia.
 * Un paso enseñado SIN alias durable se volverá a preguntar sí o sí.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 'fleco', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function correr(cmd: string): Promise<{ map: DomMap; workDir: string }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-fleco-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'fleco',
    entry: `/fachada-tapada.html?cmd=${cmd}`,
    flows: [{ flow: 'asegurado', steps: [{ id: 's1', action: 'check', hint: { test_id: 'no-existe-este-testid' } }] }],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: true, assistTimeoutMs: 45_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'aliases.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  const map = await new DomWalker(opts, script, contract, freshState()).run();
  return { map, workDir };
}

describe('el parche del panel se anuncia al terminar el run', () => {
  it('lo enseñado aparece en el dom-map, con su paso y su locator', async () => {
    const { map, workDir } = await correr('inventario');
    expect(existsSync(resolve(workDir, 'assist-patch.json')), 'el parche debe escribirse').toBe(true);
    expect(map.assist_patch, 'el dom-map tiene que llevar la cuenta').toBeTruthy();
    expect(map.assist_patch!.entries).toBe(1);
    const [p] = map.assist_patch!.pendientes;
    expect(p.flow).toBe('asegurado');
    expect(p.step).toBe('s1');
    expect(p.locator, 'sin locator el aviso no sirve de nada').toBeTruthy();
  }, 90_000);

  it('`alias_durable` dice la VERDAD sobre el fichero de aliases, no una suposición', async () => {
    // El valor solo vale si se puede contrastar con lo que hay en disco: es la
    // diferencia entre «el próximo run no te lo volverá a preguntar» y un
    // adorno. Se compara contra el fichero, no contra una expectativa fija.
    const { map, workDir } = await correr('inventario');
    const [p] = map.assist_patch!.pendientes;
    const ruta = resolve(workDir, 'aliases.json');
    const enDisco = existsSync(ruta)
      ? Object.values(
          (JSON.parse(readFileSync(ruta, 'utf8')) as { aliases: Record<string, { locator: string }> }).aliases,
        ).some((a) => a.locator === p.locator)
      : false;
    expect(p.alias_durable).toBe(enDisco);
  }, 90_000);

  it('el guion NO se toca: anunciar no es fundir', async () => {
    // La regla dura del kernel (§157) es que el parche nunca se aplica solo.
    // Este test es el cerrojo de que el arreglo del silencio no la erosionó.
    const { map, workDir } = await correr('inventario');
    expect(map.assist_patch!.entries).toBe(1);
    // el walker no escribe guiones: si algún día lo hiciera, aparecería aquí
    expect(existsSync(resolve(workDir, 'walk-script.json'))).toBe(false);
  }, 90_000);

  it('si el QA bloquea en vez de enseñar, no hay nada que anunciar', async () => {
    const { map } = await correr('block');
    expect(map.assist_patch, 'sin gestos no puede haber parche pendiente').toBeUndefined();
  }, 90_000);
});
