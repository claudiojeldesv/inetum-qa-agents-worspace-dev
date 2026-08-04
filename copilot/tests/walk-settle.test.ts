import { describe, it, expect } from 'vitest';
import {
  BUSY_SELECTORS,
  calibratedTimeout,
  DEFAULT_SETTLE,
  isRetrySafe,
  mergeSettle,
  percentile,
  updateTimingProfile,
} from '../src/walk-core.ts';
import type { TimingProfile, WalkStep } from '../src/walk-types.ts';

/**
 * Núcleo puro de la sincronización (K0.13, capas 2/3/4). Lo que se puede decidir
 * sin navegador se decide aquí; lo que exige DOM vivo está en spinner-sync.test.ts.
 */

describe('settle: precedencia y acumulacion de senales (capa 2)', () => {
  it('sin capas devuelve los defaults con las heuristicas', () => {
    const p = mergeSettle();
    expect(p.quiet_ms).toBe(DEFAULT_SETTLE.quiet_ms);
    expect(p.timeout_ms).toBe(DEFAULT_SETTLE.timeout_ms);
    expect(p.max_mutations).toBe(DEFAULT_SETTLE.max_mutations);
    expect(p.busy_selectors).toEqual(BUSY_SELECTORS);
    expect(p.ignore_selectors).toEqual([]);
  });

  it('la capa mas especifica gana en los escalares', () => {
    const p = mergeSettle({ quiet_ms: 100 }, { quiet_ms: 200 }, undefined, { quiet_ms: 900 });
    expect(p.quiet_ms).toBe(900);
  });

  it('undefined no pisa a la capa anterior', () => {
    const p = mergeSettle({ quiet_ms: 700, timeout_ms: 4000 }, { quiet_ms: undefined });
    expect([p.quiet_ms, p.timeout_ms]).toEqual([700, 4000]);
  });

  it('los selectores se ACUMULAN: el pack del cliente anade, no sustituye', () => {
    const p = mergeSettle({ busy_selectors: ['.mi-spinner'] }, { busy_selectors: ['.otro', '.mi-spinner'] });
    expect(p.busy_selectors).toContain('.mi-spinner');
    expect(p.busy_selectors).toContain('.otro');
    // las heuristicas siguen ahi: perder una por descuido cuesta flakiness
    expect(p.busy_selectors).toContain('[aria-busy="true"]');
    expect(p.busy_selectors.filter((s) => s === '.mi-spinner')).toHaveLength(1);
  });

  it('quiet_ms 0 es un valor legitimo (desactivar la ventana), no un ausente', () => {
    expect(mergeSettle({ quiet_ms: 0 }).quiet_ms).toBe(0);
  });
});

describe('reintento: seguridad por accion (capa 3)', () => {
  const step = (action: WalkStep['action'], extra: Partial<WalkStep> = {}): WalkStep =>
    ({ id: 's1', action, ...extra }) as WalkStep;

  it('las acciones que no mutan negocio son reintentables por defecto', () => {
    for (const a of ['hover', 'fill', 'press', 'select', 'goto', 'capture'] as const) {
      expect(isRetrySafe(step(a))).toBe(true);
    }
  });

  it('click/check/uncheck NO lo son: repetir Finalizar crea dos declaraciones', () => {
    for (const a of ['click', 'check', 'uncheck'] as const) {
      expect(isRetrySafe(step(a))).toBe(false);
    }
  });

  it('la declaracion explicita del guion manda en los dos sentidos', () => {
    expect(isRetrySafe(step('click', { retry_safe: true }))).toBe(true);
    expect(isRetrySafe(step('fill', { retry_safe: false }))).toBe(false);
  });
});

describe('calibracion de timeouts por observacion (capas 4 y 6)', () => {
  it('percentil por rango mas cercano, sin interpolar', () => {
    expect(percentile([], 95)).toBe(0);
    expect(percentile([500], 95)).toBe(500);
    expect(percentile([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000], 95)).toBe(1000);
    expect(percentile([100, 200, 300, 400], 50)).toBe(200);
  });

  it('sin muestras no hay calibracion: null, y el default sigue mandando', () => {
    expect(calibratedTimeout([])).toBeNull();
  });

  it('con pocas muestras degrada al maximo, que es lo prudente', () => {
    expect(calibratedTimeout([200, 800])).toBe(3_000); // 800x2 < suelo -> suelo
    expect(calibratedTimeout([2_000, 5_000])).toBe(10_000);
  });

  it('con muestras suficientes usa el p95 x margen', () => {
    expect(calibratedTimeout([4_000, 4_100, 4_200, 4_300, 9_000])).toBe(18_000);
  });

  it('acota por suelo y por techo: ni 200 ms ni infinito', () => {
    expect(calibratedTimeout([10, 20, 30, 40, 50])).toBe(3_000);
    expect(calibratedTimeout([50_000, 60_000, 70_000, 80_000, 90_000])).toBe(60_000);
  });

  it('el perfil es una ventana movil: conserva las ultimas N muestras', () => {
    let profile: TimingProfile = { version: 1, site_id: 's', steps: {} };
    for (let i = 1; i <= 12; i += 1) {
      profile = updateTimingProfile(profile, 'f/s1', i * 100, { keep: 10, date: '2026-08-04' });
    }
    const entry = profile.steps['f/s1'];
    expect(entry.samples).toHaveLength(10);
    expect(entry.samples[0]).toBe(300);
    expect(entry.samples[9]).toBe(1_200);
    expect(entry.updated).toBe('2026-08-04');
  });

  it('conserva la pantalla ya registrada si la muestra nueva no la trae', () => {
    let profile: TimingProfile = { version: 1, site_id: 's', steps: {} };
    profile = updateTimingProfile(profile, 'f/s1', 100, { screen: 'consulta', date: '2026-08-04' });
    profile = updateTimingProfile(profile, 'f/s1', 120, { date: '2026-08-04' });
    expect(profile.steps['f/s1'].screen).toBe('consulta');
  });
});
