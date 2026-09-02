/**
 * D88 — el ámbito que señala al TÍTULO tiene que llegar al CONTENEDOR.
 *
 * K0.36 dejó esto escrito como límite aceptado («elegir qué ancestro es el
 * contenedor sería adivinar»). La segunda mitad sigue siendo cierta; la primera
 * resultó evitable, y su coste se midió en la repetición del tramo del QA sobre
 * Restful Booker (2026-09-02): los pasos traían `scope: {text:'Single'}` —que es
 * lenguaje del FD y dice exactamente cuál de los cuatro «Book now» toca— y el
 * ámbito resolvía al <h5> de la tarjeta, donde no hay enlaces. **Cuatro de los
 * seis paneles de aquel run existieron solo por esto**, con la respuesta escrita
 * en el guion, y el QA elegía la primera fila: el botón del banner.
 *
 * La regla que no es adivinar: subir al ancestro MÁS CERCANO que contenga alguna
 * coincidencia y exigir que contenga EXACTAMENTE UNA. Si el primero que sabe
 * algo ya trae varias, no se desempata — el paso sube al panel, como hoy.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { DomMap, StepHint, WalkScript, WalkState } from '../src/walk-types.ts';

const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 'd88', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function correr(hint: StepHint, scope: StepHint, esperado: string): Promise<{ map: DomMap; log: string }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-d88-'));
  const script: WalkScript = {
    version: 1,
    site_id: 'd88',
    entry: '/cuatro-iguales.html',
    flows: [{ flow: 'habitacion', steps: [
      { id: 's1', action: 'click', hint, scope },
      // el cerrojo de verdad: no basta con "no quedó bloqueado", hay que saber
      // QUÉ enlace se pulsó. Un paso verde sobre el enlace equivocado es el
      // fallo que este defecto produjo en campo.
      { id: 's2', action: 'expect_text', value: esperado },
    ] }],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 5_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'aliases.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  const map = await new DomWalker(opts, script, contract, freshState()).run();
  return { map, log: readFileSync(resolve(workDir, 'audit-log.json'), 'utf8') };
}

describe('D88 — la trepada del ámbito', () => {
  it('el enlace hermano del título se resuelve sin panel, y es EL SUYO', async () => {
    const { map, log } = await correr({ role: 'link', name: 'Book now' }, { text: 'Single' }, 'pulsado: s');
    expect(map.open_questions, `bloqueos: ${JSON.stringify(map.open_questions)}`).toHaveLength(0);
    expect(log).toMatch(/ámbito trepado 1 nivel/);
  }, 90_000);

  it('no es suerte ni «el primero que encuentre»: cada ámbito lleva al suyo', async () => {
    // Con el defecto vivo, el panel ofrecía cuatro filas idénticas y elegir la
    // primera parecía funcionar. Este par lo distingue.
    const { map } = await correr({ role: 'link', name: 'Book now' }, { text: 'Suite' }, 'pulsado: u');
    expect(map.open_questions).toHaveLength(0);
  }, 90_000);

  it('lo que se apunta como `resolved_via` es CÓDIGO, y describe lo que se hizo', async () => {
    // D20: `via` se emite a un .spec.ts cuando es expresable. Una notación de
    // diagnóstico ahí produce un fichero que no compila, y un `via` «limpio»
    // sería peor: compilaría apuntando al título, donde no hay nada.
    const { map } = await correr({ role: 'link', name: 'Book now' }, { text: 'Double' }, 'pulsado: d');
    const via = (map.step_reports ?? []).find((r) => r.step === 's1')?.resolved_via ?? '';
    expect(via, via).toContain(".locator('xpath=..')");
    expect(via, 'una flecha de diagnóstico no es código').not.toMatch(/[↑]/);
  }, 90_000);

  it('si el primer ancestro que sabe algo trae VARIAS, no se desempata', async () => {
    // Trepar no puede convertirse en «elige tú»: eso es K0.33 exactamente.
    const { map, log } = await correr({ role: 'link', name: 'Ver detalle' }, { text: 'Planta baja' }, 'pulsado: v1');
    expect(map.open_questions.length, 'el paso tiene que seguir subiendo al panel').toBeGreaterThan(0);
    expect(log).not.toMatch(/ámbito trepado/);
    // y el diagnóstico de K0.36 sigue vivo: es el que le dice al QA que el ámbito
    // señala al título y no al contenedor. D88 le quita trabajo, no lo sustituye.
    expect(map.open_questions[0].reason).toContain('NO está dentro del ámbito');
  }, 90_000);
});
