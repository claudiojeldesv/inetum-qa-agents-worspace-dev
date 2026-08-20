/**
 * K0.44 (D3) — la memoria del cliente distingue QUIÉN resolvió el paso.
 *
 * Sale del primer run de campo del plugin (ParaBank, S3): FD en castellano contra
 * app en inglés, el QA señaló Username y Password en el panel asistido, y NADA se
 * promovió a `config/hint-aliases/`. El motivo, medido en el código y no inferido:
 * la aserción del flujo (`expect_text 'resumen de cuentas'`) falló —está en
 * castellano por la MISMA razón que los hints—, `flowExpectsFailed` se puso a true
 * y bloqueó la promoción de todos los rescates del flujo, incluidos los humanos.
 *
 * O sea: el run en el que el QA más enseña era el run en el que no se aprendía
 * nada, y a la siguiente vuelta volvía a señalar lo mismo.
 *
 * El par falsable de todo el fichero: MISMA situación, solo cambia la procedencia.
 * Con `llm` no se promueve (comportamiento intacto); con `human` sí.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aliasPromotionVerdict, type AliasPromotionInput } from '../src/walk-core.ts';
import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { HintAliasFile, RescueRecord, WalkScript, WalkState } from '../src/walk-types.ts';

/** El caso de campo: aserción del flujo en drift, paso propio limpio. */
const CAMPO: Omit<AliasPromotionInput, 'source'> = {
  stepBlocked: false,
  expectsTransition: false,
  transitionRecorded: false,
  flowExpectsFailed: true,
};

describe('K0.44 — el par falsable: misma situación, distinta procedencia', () => {
  it('rescate de SUBAGENTE con la postcondición del flujo en drift: NO se promueve', () => {
    const v = aliasPromotionVerdict({ ...CAMPO, source: 'llm' });
    expect(v.promote).toBe(false);
    expect(v).toMatchObject({ reason: expect.stringContaining('subagente') });
  });

  it('el QA señalando en el panel, misma situación: SÍ se promueve', () => {
    const v = aliasPromotionVerdict({ ...CAMPO, source: 'human' });
    expect(v.promote).toBe(true);
    expect(v).toMatchObject({ viaHumanOverride: true });
  });

  it('sin procedencia se trata como subagente (checkpoints anteriores a K0.44)', () => {
    expect(aliasPromotionVerdict({ ...CAMPO }).promote).toBe(false);
  });
});

describe('K0.44 — lo que el humano NO puede saltarse', () => {
  it('un paso bloqueado no se memoriza aunque lo señalara el QA', () => {
    const v = aliasPromotionVerdict({ ...CAMPO, source: 'human', stepBlocked: true });
    expect(v.promote).toBe(false);
    expect(v).toMatchObject({ reason: expect.stringContaining('bloqueado') });
  });

  it('si declaraba transición y no navegó, el elemento era otro — tampoco se memoriza', () => {
    const v = aliasPromotionVerdict({
      source: 'human',
      stepBlocked: false,
      expectsTransition: true,
      transitionRecorded: false,
      flowExpectsFailed: false,
    });
    expect(v.promote).toBe(false);
    expect(v).toMatchObject({ reason: expect.stringContaining('transición') });
  });

  it('el cerrojo de transición manda por encima del drift del flujo (no lo enmascara)', () => {
    const v = aliasPromotionVerdict({
      source: 'human',
      stepBlocked: false,
      expectsTransition: true,
      transitionRecorded: false,
      flowExpectsFailed: true,
    });
    expect(v).toMatchObject({ promote: false, reason: expect.stringContaining('transición') });
  });

  it('con transición registrada y flujo en drift, el humano sí promueve', () => {
    const v = aliasPromotionVerdict({
      source: 'human',
      stepBlocked: false,
      expectsTransition: true,
      transitionRecorded: true,
      flowExpectsFailed: true,
    });
    expect(v).toMatchObject({ promote: true, viaHumanOverride: true });
  });
});

/**
 * Cableado real, que es lo que de verdad falló en campo: la regla podía estar bien
 * y el `source` no llegar nunca a `promoteRescues`. Se siembra el rescate en el
 * estado (equivale a "el panel ya resolvió este paso antes en el mismo run") y se
 * comprueba el fichero de alias EN DISCO tras correr el walker.
 *
 * El fixture es el login sin label asociado (K0.19): misma disposición que el caso
 * de campo — etiqueta visible hermana del input.
 */
describe('K0.44 — cableado: el alias aparece (o no) en disco según la procedencia', () => {
  const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;

  async function correr(source: RescueRecord['source']): Promise<HintAliasFile | null> {
    const workDir = mkdtempSync(resolve(tmpdir(), 'qa-k044-'));
    const aliasesPath = resolve(workDir, 'aliases.json');
    const script: WalkScript = {
      version: 1,
      site_id: 'k044',
      entry: '/login-sin-label.html',
      flows: [
        {
          flow: 'login',
          steps: [
            // resuelve por el tier anclado (K0.19/K0.21): el paso NO queda bloqueado
            { id: 's1', action: 'fill', hint: { label: 'Usuario' }, value: 'jane' },
            // la postcondición está en el idioma equivocado, igual que en campo:
            // la pantalla no dice esto, así que el flujo queda en drift
            { id: 's2', action: 'expect_text', value: 'resumen de cuentas' },
          ],
        },
      ],
    };
    const state: WalkState = {
      script_hash: 'k044', completed: [], rescues_used: 0, screens: [], transitions: [],
      open_questions: [], current_screen: null, step_reports: [],
      rescues: [{ flow: 'login', step: 's1', resolved: true, locator: 'css=#username', audit_logged: true, source }],
    };
    const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };
    const opts: WalkerOptions = {
      scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
      headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
      aliasesPath, timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
    };
    const map = await new DomWalker(opts, script, contract, state).run();
    // el par solo significa algo si el flujo QUEDÓ en drift: es la precondición
    expect(map.open_questions.some((q) => q.step === 's2')).toBe(true);
    return existsSync(aliasesPath) ? (JSON.parse(readFileSync(aliasesPath, 'utf8')) as HintAliasFile) : null;
  }

  it('procedencia humana: el alias se escribe pese al drift del flujo', async () => {
    const file = await correr('human');
    expect(file).not.toBeNull();
    const aliases = Object.values(file!.aliases);
    expect(aliases).toHaveLength(1);
    expect(aliases[0].locator).toBe('css=#username');
  }, 120_000);

  it('procedencia de subagente, MISMO guion: no se escribe nada', async () => {
    const file = await correr('llm');
    expect(file === null || Object.keys(file.aliases).length === 0).toBe(true);
  }, 120_000);
});

describe('K0.44 — el camino feliz no cambia para nadie', () => {
  const limpio: AliasPromotionInput = {
    stepBlocked: false,
    expectsTransition: false,
    transitionRecorded: false,
    flowExpectsFailed: false,
  };

  it('subagente con todo en verde: se promueve, como desde K0.5', () => {
    expect(aliasPromotionVerdict({ ...limpio, source: 'llm' })).toEqual({
      promote: true,
      viaHumanOverride: false,
    });
  });

  it('humano con todo en verde: se promueve y NO se marca override', () => {
    // el override solo existe cuando de verdad se saltó el gate; si saliera siempre
    // dejaría de significar nada en la traza de auditoría
    expect(aliasPromotionVerdict({ ...limpio, source: 'human' })).toEqual({
      promote: true,
      viaHumanOverride: false,
    });
  });
});
