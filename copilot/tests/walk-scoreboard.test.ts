import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { classifyVia, scoreRun, renderTable } from '../src/walk-scoreboard.ts';

/**
 * K0.27a — el marcador de peldaños. Agrega walk-state/dom-map + audit-log en
 * la tabla que convierte cada run de la gira en una fila comparable. Sin LLM,
 * sin red: puro parsing. El clasificador de `resolved_via` es la pieza con
 * lógica — cada peldaño de la escalera tiene su cubeta y el prefijo de frame
 * no lo contamina.
 */

describe('classifyVia — cada peldaño a su cubeta', () => {
  it('clasifica las cadenas reales de la escalera', () => {
    expect(classifyVia("getByTestId('checkout')")).toBe('testid');
    expect(classifyVia("getByRole('button', { name: 'Login' })")).toBe('role');
    expect(classifyVia("getByLabel('Usuario')")).toBe('label');
    expect(classifyVia("getByText('Alcohol 96º Aposan 250 ml')")).toBe('texto');
    expect(classifyVia('getByText(/GESTI[oó]N/i)')).toBe('texto-normalizado');
    expect(classifyVia("anchored(label:'Tipo Prestación')")).toBe('anchored');
    expect(classifyVia(undefined)).toBe('sin-via');
  });

  it('el prefijo de frame no contamina: clasifica el último eslabón', () => {
    expect(classifyVia("frame[0] >> getByRole('textbox', { name: 'Usuario' })")).toBe('role');
    expect(classifyVia("iframe#negocio >> anchored(label:'Importe')")).toBe('anchored');
  });
});

describe('scoreRun — agrega un run desde sus artefactos', () => {
  function makeRun(dirName: string, files: Record<string, unknown | string>): string {
    const root = mkdtempSync(resolve(tmpdir(), 'qa-scoreboard-'));
    const dir = resolve(root, dirName);
    mkdirSync(dir);
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(resolve(dir, name), typeof content === 'string' ? content : JSON.stringify(content), 'utf8');
    }
    return dir;
  }

  const reports = [
    { flow: 'f', step: '__entry', action: 'goto', outcome: 'ok', action_ms: 100, retried: false },
    { flow: 'f', step: 's1', action: 'fill', outcome: 'ok', action_ms: 50, retried: false, resolved_via: "getByRole('textbox', { name: 'Usuario' })" },
    { flow: 'f', step: 's2', action: 'click', outcome: 'ok_after_retry', action_ms: 90, retried: true, resolved_via: "getByText('Entrar')" },
    { flow: 'f', step: 's3', action: 'select', outcome: 'action_failed', action_ms: 10500, retried: false, resolved_via: "anchored(label:'Orden')" },
    { flow: 'f', step: 's4', action: 'expect_text', outcome: 'ok', action_ms: 40, retried: false },
  ];
  const auditLines = [
    JSON.stringify({ reason: 'alias-hit s1: getByRole(...)', metadata: { phase: 'alias' } }),
    JSON.stringify({ reason: 'asistencia solicitada: f/s3', metadata: { phase: 'assist' } }),
    JSON.stringify({ reason: "select drift tolerado: guion 'x' → opción real 'X'", metadata: { phase: 'select-normalizado' } }),
    'linea corrupta { no json',
  ].join('\n');

  it('lee dom-map.json (run terminado), excluye __entry y cruza el audit', () => {
    const dir = makeRun('run-a', {
      'dom-map.json': {
        site_id: 'demo',
        step_reports: reports,
        open_questions: [{ flow: 'f', step: 's3' }],
        rescues: [{ flow: 'f', step: 's9', resolved: true }, { flow: 'f', step: 's3', resolved: false }],
      },
      'audit-log.json': auditLines,
    });

    const s = scoreRun(dir)!;
    expect(s.site_id).toBe('demo');
    expect(s.pasos).toBe(4); // __entry fuera
    expect(s.ok).toBe(2);
    expect(s.ok_after_retry).toBe(1);
    expect(s.action_failed).toBe(1);
    expect(s.plantas).toBe(1);
    expect(s.asistencias).toBe(1);
    expect(s.alias_hits).toBe(1);
    expect(s.rescates_resueltos).toBe(1);
    expect(s.rescates_nulos).toBe(1);
    expect(s.drift_select).toBe(1);
    expect(s.peldanos.role).toBe(1);
    expect(s.peldanos.texto).toBe(1);
    expect(s.peldanos.anchored).toBe(1);
    expect(s.peldanos['sin-via']).toBe(1); // el expect_text sin hint
  });

  it('cae a walk-state.json cuando el run quedó interrumpido, y la tabla renderiza', () => {
    const dir = makeRun('run-b', {
      'walk-state.json': { step_reports: reports.slice(0, 2), open_questions: [], rescues: [] },
    });
    const s = scoreRun(dir)!;
    expect(s.site_id).toBe('?');
    expect(s.pasos).toBe(1);
    const table = renderTable([s]);
    expect(table).toContain('run-b');
    expect(table).toContain('peldaños de resolución');
  });

  it('directorio sin artefactos → null, no revienta', () => {
    const dir = makeRun('run-c', { 'otra-cosa.txt': 'nada' });
    expect(scoreRun(dir)).toBeNull();
  });
});
