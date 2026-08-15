import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { urlEstable } from '../src/walk-core.ts';
import type { DomMap, WalkScript, WalkState } from '../src/walk-types.ts';

/**
 * K0.35 — sitio 3b: las dos clases que salieron de estresar el banco JSF 1.2 con
 * la vista caducada y el error de servidor.
 *
 *   A. LA PÁGINA DE ERROR. El walker reportaba "drift: postcondición no
 *      observada" y "hint irresoluble" cuando la aplicación se había caído: dos
 *      diagnósticos que mandan al QA a revisar el plan y los locators. El aviso
 *      no cambia el veredicto, añade la evidencia — y se calla cuando no la hay,
 *      que es la mitad que decide si esto es mejora o ruido.
 *   B. EL TESTIGO DE SESIÓN EN LA URL. Los contenedores Java reescriben
 *      `…/x.jsf;jsessionid=…` mientras no saben si hay cookies. Medido: la
 *      primera visita lo lleva y la segunda no, con valor distinto cada run. En
 *      el `url_pattern` del dom-map eso rompe la invariante de determinismo.
 */
const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

async function walk(entry: string, steps: WalkScript['flows'][0]['steps']): Promise<DomMap> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-k035-'));
  const script: WalkScript = { version: 1, site_id: 'k035', entry, flows: [{ flow: 'f', steps }] };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  return new DomWalker(opts, script, contract, freshState()).run();
}

const razon = (m: DomMap, id: string): string => m.open_questions.find((q) => q.step === id)?.reason ?? '';

describe('K0.35-A — la página de error del servidor deja de pasar por drift del negocio', () => {
  it('la postcondición fallida cita la excepción y el título, no solo el texto que falta', async () => {
    const map = await walk('/pagina-de-error.html', [
      { id: 's1', action: 'expect_text', value: 'Resumen de la póliza' },
    ]);
    const r = razon(map, 's1');
    // el veredicto de siempre sigue ahí: no se sustituye, se acompaña
    expect(r).toContain('postcondición del FD no observada');
    expect(r).toContain('PÁGINA DE ERROR');
    expect(r).toContain('java.lang.NullPointerException'); // la evidencia, citada
  }, 120_000);

  it('el hint irresoluble también lo dice: el elemento no falta, la app se cayó', async () => {
    const map = await walk('/pagina-de-error.html', [
      { id: 's1', action: 'fill', hint: { label: 'Importe' }, value: '10' },
    ]);
    const r = razon(map, 's1');
    expect(r).toContain('hint irresoluble');
    expect(r).toContain('PÁGINA DE ERROR');
  }, 120_000);

  it('PAR FALSABLE: una pantalla legítima que habla de errores NO dispara el aviso', async () => {
    // sin esto, cada glosario de códigos y cada visor de logs de un portal
    // corporativo llevaría el aviso pegado, y el aviso dejaría de significar nada
    const map = await walk('/catalogo-excepciones.html', [
      { id: 's1', action: 'expect_text', value: 'Resumen de la póliza' },
    ]);
    const r = razon(map, 's1');
    expect(r).toContain('postcondición del FD no observada');
    expect(r).not.toContain('PÁGINA DE ERROR');
  }, 120_000);
});

describe('K0.35-B — el testigo de sesión no entra en lo que se compara entre runs', () => {
  it('se quita el jsessionid que reescribe el contenedor', () => {
    expect(urlEstable('http://x/jsf/validate.jsf;jsessionid=9DAC003E21C2798133C2539CB1422283'))
      .toBe('http://x/jsf/validate.jsf');
    // en mayúsculas y con consulta detrás, que es como lo emiten algunos contenedores
    expect(urlEstable('http://x/a.do;JSESSIONID=ABC?id=7')).toBe('http://x/a.do?id=7');
    expect(urlEstable('http://x/a.jsp;jsessionid=ABC/b.jsp')).toBe('http://x/a.jsp/b.jsp');
  });

  it('no se inventa que cualquier parámetro de ruta sea de sesión', () => {
    // hay aplicaciones que usan parámetros de matriz para negocio: tocarlos sería
    // adivinar, y perderíamos información real del mapa
    const conNegocio = 'http://x/poliza;ramo=hogar;anio=2026';
    expect(urlEstable(conNegocio)).toBe(conNegocio);
  });

  it('una URL sin testigo no se toca', () => {
    expect(urlEstable('http://x/jsf/validate.jsf?a=1#b')).toBe('http://x/jsf/validate.jsf?a=1#b');
  });
});
