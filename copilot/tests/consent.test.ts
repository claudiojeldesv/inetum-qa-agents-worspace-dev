import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { CONSENT_ACCEPT, CONSENT_REJECT, consentSelector } from '../src/walk-core.ts';
import type { AuditLogEntry } from '../../src/audit-log.ts';
import type { DomMap, StepReport, WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

/**
 * K0.30 — CONSENTIMIENTO POR DISEÑO. El banner de cookies sale en la mayoría de
 * los portales corporativos: no es una excepción que cada client pack deba
 * redescubrir y declarar (y, como midió la gira en §20, declararlo mal envenena
 * el run entero). El walker conoce las FAMILIAS de CMP y comprueba el DOM.
 *
 * Las tres reglas que estos tests fijan:
 *   1. Rechazar antes que cerrar; aceptar NUNCA.
 *   2. Si solo se puede aceptar: neutralizar localmente sin consentir, y decirlo.
 *   3. No tocar lo que no está superpuesto — contenido de la app, aunque hable
 *      de cookies, no se toca jamás.
 */
const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function walk(
  entry: string,
  steps: WalkStep[],
  c: StyleContract = contract,
): Promise<{ map: DomMap; audit: AuditLogEntry[] }> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-consent-'));
  const script: WalkScript = { version: 1, site_id: 'consent', entry, flows: [{ flow: 'f', steps }] };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  const map = await new DomWalker(opts, script, c, freshState()).run();
  const auditPath = resolve(workDir, 'audit-log.json');
  const audit: AuditLogEntry[] = existsSync(auditPath)
    ? readFileSync(auditPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  return { map, audit };
}

const report = (m: DomMap, id: string): StepReport | undefined => (m.step_reports ?? []).find((r) => r.step === id);
const consentEntries = (a: AuditLogEntry[]): AuditLogEntry[] =>
  a.filter((e) => (e.metadata as Record<string, unknown> | undefined)?.phase === 'consent');
const continuar: WalkStep = { id: 's1', action: 'click', hint: { role: 'button', name: 'Continuar' } };

describe('K0.30 — familias de CMP (datos puros)', () => {
  it('el selector combinado cubre los CMP más extendidos y admite el casero del cliente', () => {
    const sel = consentSelector(['#mi-banner-corporativo']);
    for (const s of ['#onetrust-banner-sdk', '#CybotCookiebotDialog', '.cc-window', '#didomi-popup']) {
      expect(sel).toContain(s);
    }
    expect(sel).toContain('#mi-banner-corporativo');
  });

  it('el rechazo se reconoce en los idiomas que se mezclan en los portales españoles', () => {
    for (const t of ['Rechazar todas', 'Reject all', 'Solo las necesarias', 'Continuar sin aceptar', 'Ablehnen']) {
      expect(CONSENT_REJECT.test(t), t).toBe(true);
    }
    // y no se confunde con aceptar: si el rechazo matcheara "Aceptar", el walker
    // consentiría creyendo que rechaza — el peor fallo posible de esta pieza
    for (const t of ['Aceptar todas', 'Accept all', 'De acuerdo']) {
      expect(CONSENT_REJECT.test(t), t).toBe(false);
      expect(CONSENT_ACCEPT.test(t), t).toBe(true);
    }
  });
});

describe('K0.30 — el banner con rechazo', () => {
  it('lo descarta RECHAZANDO (no aceptando) y el paso tapado pasa', async () => {
    const { map, audit } = await walk('/consent-rechazable.html', [
      { ...continuar, expect_after: 'Continuado con consentimiento: rechazo' },
    ]);
    expect(report(map, 's1')!.outcome).toBe('ok');
    expect(map.open_questions).toEqual([]);
    const c = consentEntries(audit);
    expect(c.length).toBeGreaterThan(0);
    expect((c[0].metadata as Record<string, unknown>).outcome).toBe('rechazo');
  }, 120_000);

  it('sin declarar NADA en el contract: es comportamiento por diseño, no opt-in', async () => {
    // el contract de este test no menciona cookies ni estorbos por ningún lado
    const { audit } = await walk('/consent-rechazable.html', [continuar]);
    expect(consentEntries(audit).length).toBeGreaterThan(0);
  }, 120_000);

  it('con consent.enabled=false el walker no lo toca (el banner puede SER la prueba)', async () => {
    const { map, audit } = await walk('/consent-rechazable.html', [continuar], {
      ...contract,
      consent: { enabled: false },
    });
    expect(consentEntries(audit)).toEqual([]);
    // y entonces el banner tapa el objetivo: el paso falla con el motivo real
    expect(report(map, 's1')!.outcome).toBe('action_failed');
    expect(map.open_questions.find((q) => q.step === 's1')!.reason.toLowerCase()).toMatch(/intercept|pointer/);
  }, 120_000);
});

describe('K0.30 — el banner que solo deja aceptar', () => {
  it('NO acepta: lo neutraliza localmente, el flujo sigue y el audit dice exactamente eso', async () => {
    const { map, audit } = await walk('/consent-solo-aceptar.html', [
      // la postcondición delata la vía: si el walker hubiera pulsado "Aceptar
      // cookies", aquí pondría 'aceptado' y este paso fallaría
      { ...continuar, expect_after: 'Continuado con consentimiento: ninguno' },
    ]);
    expect(report(map, 's1')!.outcome).toBe('ok');
    const c = consentEntries(audit);
    expect((c[0].metadata as Record<string, unknown>).outcome).toBe('neutralizado-sin-consentir');
    expect(c[0].reason).toContain('aceptar es decisión del usuario');
  }, 120_000);

  it('el barrido no se come el presupuesto del paso que lo dispara', async () => {
    // Regresión de campo, cazada en el primer run tras escribir la pieza: leer el
    // texto de un botón de cierre que NO EXISTE no devuelve vacío, espera el tope
    // por defecto (30 s). Como el barrido corre dentro de la espera de
    // accionabilidad, una postcondición que SÍ estaba en pantalla se declaraba
    // incumplida por el reloj. Este fixture no tiene botón de cierre: es el caso.
    const { map } = await walk('/consent-solo-aceptar.html', [{ id: 's1', action: 'expect_text', value: 'Tienda' }]);
    expect(report(map, 's1')!.outcome).toBe('ok');
  }, 120_000);
});

describe('K0.30 — la guarda: no tocar contenido de la aplicación', () => {
  it('una sección estática que habla de cookies NO se toca, aunque encaje con los patrones', async () => {
    const { map, audit } = await walk('/consent-falso-positivo.html', [
      { ...continuar, expect_after: 'Continuado' },
      { id: 's2', action: 'expect_text', value: 'Texto legal de la politica' },
    ]);
    expect(report(map, 's1')!.outcome).toBe('ok');
    // si el walker hubiera pulsado el "Rechazar todas" del CONTENIDO, este texto
    // habría cambiado y la aserción caería
    expect(report(map, 's2')!.outcome).toBe('ok');
    expect(consentEntries(audit)).toEqual([]);
  }, 120_000);
});
