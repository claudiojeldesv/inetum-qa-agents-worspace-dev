import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { AuditLogEntry } from '../../src/audit-log.ts';
import type { DomMap, StepReport, WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

/**
 * K0.30 — las dos clases que la gira dejó nombradas con evidencia (§20), de la
 * familia más peligrosa para un producto de QA: equivocarse EN VERDE.
 *
 *   F4 — `expect_text` busca en TODA la página y puede cobrarse el verde de
 *        cualquier sitio (allí, del bloque de código con que la web documentaba
 *        su ejemplo). Arreglo: `scope` — el texto tiene que estar DONDE dice el
 *        negocio, con el mismo campo que el refiner ya emite desde el FD.
 *   F5 — el resultado calculado de las apps corporativas vive en el `value` de
 *        un campo de solo lectura, que ninguna acción sabía mirar: `expect_value`.
 *
 * El fixture reproduce la disposición (resultado en campo deshabilitado + el
 * literal esperado presente en otro sitio de la pantalla), no el sitio.
 */
const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function walkFull(steps: WalkStep[]): Promise<{ map: DomMap; audit: AuditLogEntry[] }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-value-'));
  const script: WalkScript = { version: 1, site_id: 'valor', entry: '/resultado-en-campo.html', flows: [{ flow: 'f', steps }] };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  const map = await new DomWalker(opts, script, contract, freshState()).run();
  const auditPath = resolve(workDir, 'audit-log.json');
  const audit: AuditLogEntry[] = existsSync(auditPath)
    ? readFileSync(auditPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  return { map, audit };
}

const walk = async (steps: WalkStep[]): Promise<DomMap> => (await walkFull(steps)).map;
const report = (m: DomMap, id: string): StepReport | undefined => (m.step_reports ?? []).find((r) => r.step === id);
const enviar: WalkStep[] = [
  { id: 'a1', action: 'select', hint: { label: 'Marca' }, value: 'Honda' },
  { id: 'a2', action: 'click', hint: { role: 'button', name: 'Enviar' } },
];

describe('K0.30/F4 — el ámbito de la postcondición', () => {
  it('la clase existe: SIN enviar nada, expect_text a nivel de página ya se cumple (verde falso)', async () => {
    const map = await walk([{ id: 's1', action: 'expect_text', value: 'Honda' }]);
    const r = report(map, 's1')!;
    expect(r.outcome).toBe('ok'); // pasa... y no debería significar nada
    // el arreglo mínimo que hace visible el problema: DÓNDE se cumplió viaja al informe
    expect(r.resolved_via).toBeDefined();
  }, 60_000);

  it('con `scope`, el mismo paso NO se cobra el verde del otro rincón de la pantalla', async () => {
    const map = await walk([
      { id: 's1', action: 'expect_text', value: 'Honda', scope: { role: 'region', name: 'Resultado del envio' } },
    ]);
    expect(report(map, 's1')!.outcome).toBe('postcondition_unmet');
    expect(map.open_questions.find((q) => q.step === 's1')!.reason).toContain('drift');
  }, 60_000);

  it('el ámbito irresoluble se dice como tal, no como "el texto no aparece"', async () => {
    // culpar al negocio de un problema de locator es lo que envenena el informe
    // de reconciliación: son dos hallazgos distintos y se reportan distintos.
    const map = await walk([
      { id: 's1', action: 'expect_text', value: 'Honda', scope: { role: 'region', name: 'Panel que no existe' } },
    ]);
    expect(report(map, 's1')!.outcome).toBe('postcondition_unmet');
    expect(map.open_questions.find((q) => q.step === 's1')!.reason).toContain('ámbito');
  }, 60_000);
});

describe('K0.30/F5 — expect_value: el resultado que vive en un campo', () => {
  it('tras enviar, el valor del campo deshabilitado se asserta y el informe dice sobre qué', async () => {
    const map = await walk([
      ...enviar,
      { id: 's3', action: 'expect_value', hint: { label: 'Ultimo valor enviado' }, value: 'Honda' },
    ]);
    const r = report(map, 's3')!;
    expect(r.outcome).toBe('ok');
    expect(r.resolved_via).toBeDefined();
    expect(map.open_questions).toEqual([]);
  }, 60_000);

  it('el par falsable: SIN enviar, expect_value falla donde expect_text daba verde', async () => {
    const map = await walk([{ id: 's1', action: 'expect_value', hint: { label: 'Ultimo valor enviado' }, value: 'Honda' }]);
    expect(report(map, 's1')!.outcome).toBe('postcondition_unmet');
  }, 60_000);

  it('cuando no coincide, el motivo dice el valor REAL (no solo que falló)', async () => {
    const map = await walk([
      ...enviar,
      { id: 's3', action: 'expect_value', hint: { label: 'Ultimo valor enviado' }, value: 'Opel' },
    ]);
    const blocked = map.open_questions.find((q) => q.step === 's3')!;
    expect(blocked.reason).toContain("vale 'Honda'");
    expect(blocked.reason).toContain("espera 'Opel'");
  }, 60_000);

  it('drift de caja/acento: se tolera como en el resto de la escalera, y queda AUDITADO', async () => {
    const { map, audit } = await walkFull([
      ...enviar,
      { id: 's3', action: 'expect_value', hint: { label: 'Ultimo valor enviado' }, value: 'HONDA' },
    ]);
    expect(report(map, 's3')!.outcome).toBe('ok');
    const drift = audit.find((e) => (e.metadata as Record<string, unknown> | undefined)?.phase === 'value-normalizado');
    expect(drift, 'la tolerancia sin apunte sería una equivalencia decidida en silencio').toBeDefined();
  }, 60_000);

  it('sobre algo que no es un control, lo dice: "no es un control con valor legible"', async () => {
    const map = await walk([
      { id: 's1', action: 'expect_value', hint: { role: 'heading', name: 'Alta de vehículo' }, value: 'x' },
    ]);
    expect(map.open_questions.find((q) => q.step === 's1')!.reason).toContain('no es un control con valor legible');
  }, 60_000);
});
