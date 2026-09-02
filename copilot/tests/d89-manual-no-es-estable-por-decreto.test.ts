/**
 * D89 — la fragilidad se CALCULA, no se decreta.
 *
 * El camino del inventario (D81) estampaba `fragile: false, why: 'introducido
 * por el QA'` sin mirar el locator, así que el cerrojo de D85 —el único que no
 * admite override humano, porque un posicional caduca al añadir una fila— no
 * cubría lo que el QA elige de la lista. Estaba latente hasta que D87 empezó a
 * desambiguar con `.nth(i)`: desde entonces lo que el QA señala ES posicional.
 *
 * Coste medido en campo el mismo día (Restful Booker): se promovieron TRES
 * aliases durables frágiles, y además FALSOS —apuntaban al botón del banner o a
 * la habitación equivocada—, y `cp010` reutilizó uno y acabó pidiendo «Reserve
 * Now» en la portada. Que lo escriba una persona no lo hace estable.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { locatorEsFragil } from '../src/walk-core.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 'd89', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

/** El QA abre «ver todo lo que hay» y elige un «Book now»: con D87 eso es posicional. */
async function correr(): Promise<{ map: DomMap; aliases: string; log: string }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-d89-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'd89',
    entry: '/cuatro-iguales.html?cmd=inventario',
    // SIN scope a propósito: es el caso ambiguo que abre el panel
    flows: [{ flow: 'habitacion', steps: [{ id: 's1', action: 'click', hint: { role: 'link', name: 'Book now' } }] }],
  };
  const aliasesPath = resolve(workDir, 'aliases.json');
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: true, assistTimeoutMs: 45_000, assistMinimize: false,
    aliasesPath, timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  const map = await new DomWalker(opts, script, contract, freshState()).run();
  return {
    map,
    aliases: existsSync(aliasesPath) ? readFileSync(aliasesPath, 'utf8') : '',
    log: readFileSync(resolve(workDir, 'audit-log.json'), 'utf8'),
  };
}

describe('D89 — un posicional elegido por el QA no entra en memoria durable', () => {
  it('el locator que sale del inventario ES posicional (si no, este test no prueba nada)', async () => {
    const { map } = await correr();
    const r = (map.rescues ?? []).find((x) => x.step === 's1');
    expect(r?.locator, 'el QA no llegó a señalar nada').toBeTruthy();
    expect(locatorEsFragil(r!.locator!), r!.locator!).toBe(true);
  }, 90_000);

  it('se marca frágil aunque venga de una persona, y por eso NO se promueve', async () => {
    const { map, aliases, log } = await correr();
    const r = (map.rescues ?? []).find((x) => x.step === 's1');
    expect(r?.fragile, 'la fragilidad se calcula, no se decreta').toBe(true);
    expect(aliases, 'un posicional no puede quedar en la memoria del cliente').not.toContain('.nth(');
    expect(log).toMatch(/NO promovido a alias/);
  }, 90_000);

  it('pero SÍ se usa en este run: el cerrojo es la memoria, no el paso', async () => {
    // D85 nunca fue «rechaza el locator»: es «úsalo hoy y no lo hereden mañana».
    const { map } = await correr();
    expect(map.open_questions, 'el paso tenía que ejecutarse igualmente').toHaveLength(0);
  }, 90_000);
});
