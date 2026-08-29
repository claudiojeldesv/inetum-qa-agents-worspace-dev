/**
 * El banco de pruebas de paneles — el conductor.
 *
 * Arranca el walker DE VERDAD (mismo `DomWalker`, mismo Chromium, misma acta
 * encadenada) y atiende sus paneles siguiendo un escenario JSON: cuando aparece
 * `assist-pending.json`, despacha sobre el host los mismos `qa-assist-cmd` que
 * pulsaría una persona, y al final compara lo firmado y lo bloqueado con lo que
 * el escenario declara. Sirve para probar los paneles contra el SITIO REAL sin
 * gastar la atención del QA en cada iteración — la primera vez de una persona
 * sigue siendo insustituible, y eso está escrito en `bench-core.ts`.
 *
 * Por qué esto es un programa aparte y NO una bandera del walker: una bandera
 * tipo `--auto-veredicto` respondería paneles en nombre del actor de la CLI —
 * fabricar decisiones humanas con firma humana. Aquí el actor es la constante
 * `banco-de-pruebas` y el acta vive dentro del work-dir del banco; ninguna de
 * las dos cosas es configurable, ni por flag ni por env.
 *
 * Uso:
 *   npx tsx copilot/src/walk-bench.ts --script=<walk-script.json> --contract=<style.yaml> \
 *     --escenario=<escenario.json> --work-dir=.work/bench/<caso> [--base-url=...] \
 *     [--fd=<fd.md> | --fd-hash=<hex> | --sin-fd] [--rf=RF-NNN] [--abrir-panel] [--headed] \
 *     [--assist-timeout=<segundos>]
 *
 * `--abrir-panel` fuerza el shadow root a `open` para poder LEER los textos del
 * panel (tildes, avisos, la salida). Eso cambia el aislamiento: con el shadow
 * abierto los locators de Playwright SÍ atraviesan el panel, así que una pasada
 * con `--abrir-panel` audita mensajes y una pasada sin él audita comportamiento.
 * El informe deja escrito en qué modo se corrió.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { Page } from '@playwright/test';

import { DomWalker, loadState } from './dom-walker.ts';
import type { StyleContract, WalkerOptions } from './dom-walker.ts';
import { parseJsonLoose, validateWalkScript } from './walk-core.ts';
import type { AssistMarker } from './walk-core.ts';
import type { DomMap, WalkScript } from './walk-types.ts';
import { huellaDeArtefacto, parseDecisions } from '../../src/decisions.ts';
import type { DecisionEntry } from '../../src/decisions.ts';
import {
  ACTA_DEL_BANCO,
  ACTOR_BANCO,
  claveDeMarcador,
  esClick,
  esEspera,
  esMover,
  esPanelDeVeredicto,
  evaluarFinal,
  evaluarPanel,
  gestoDeSocorro,
  validarEscenario,
} from './bench-core.ts';
import type { Comprobacion, Escenario } from './bench-core.ts';

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Fuerza los shadow roots futuros a `open` para poder leer el panel desde Node.
 * Es el mismo truco que `verdict-overlay.test.ts` documenta: con el shadow
 * cerrado, leer devuelve null y un test «pasa por vacuidad, que es peor».
 */
const ABRIR_SHADOW = `(() => {
  if (window.__qaBancoShadowAbierto) return;
  window.__qaBancoShadowAbierto = true;
  const orig = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    return orig.call(this, Object.assign({}, init, { mode: 'open' }));
  };
})()`;

export interface OpcionesBanco {
  script: WalkScript;
  contract: StyleContract;
  escenario: Escenario;
  workDir: string;
  baseUrl?: string;
  headed?: boolean;
  /** Por panel. Corto a propósito: si el escenario no cubre un panel, el gesto
   * de socorro lo cierra igual; esto es solo la red del navegador colgado. */
  assistTimeoutMs?: number;
  /** Shadow root abierto para leer textos. Cambia el aislamiento — ver cabecera. */
  abrirPanel?: boolean;
  /**
   * Verificación del parche por replay, como en producción (default true). La
   * primera pasada del banco contra OrangeHRM salió con esto en false y el
   * hallazgo fue del banco: un parche SIN VERIFICAR deja el paso bloqueado, y el
   * guardián del camino roto silencia —correctamente— el veredicto siguiente.
   */
  minimize?: boolean;
  fdHash?: string;
  rf?: string;
}

export interface PanelAtendido {
  flujo: string;
  paso: string;
  accion: string;
  tipo: 'veredicto' | 'asistencia';
  /** false = el escenario no lo preveía y se despachó el gesto de socorro. */
  cubierto: boolean;
  /** Texto del panel si el modo lo permite (--abrir-panel); null si no. */
  texto: string | null;
}

export interface ResultadoBanco {
  ok: boolean;
  map: DomMap;
  acta: DecisionEntry[];
  actaPath: string;
  paneles: PanelAtendido[];
  comprobaciones: Comprobacion[];
}

/**
 * Corre el walker con el escenario al lado. El bucle es el QA mecánico: espera
 * el marcador en disco (el mismo `assist-pending.json` que le dice a una persona
 * «te espera»), localiza el host del panel y despacha los gestos declarados.
 */
export async function correrBanco(o: OpcionesBanco): Promise<ResultadoBanco> {
  mkdirSync(o.workDir, { recursive: true });
  const actaPath = resolve(o.workDir, ACTA_DEL_BANCO);
  const markerPath = resolve(o.workDir, 'assist-pending.json');

  const opts: WalkerOptions = {
    scriptPath: 'banco', contractPath: 'banco', baseUrl: o.baseUrl, workDir: o.workDir,
    rescueBudget: 0, screenCap: 60, headed: o.headed ?? false,
    assist: true, assistTimeoutMs: o.assistTimeoutMs ?? 30_000, assistMinimize: o.minimize ?? true,
    aliasesPath: resolve(o.workDir, 'aliases-banco.json'),
    timingProfilePath: resolve(o.workDir, 'timing-banco.json'),
    calibrate: false,
    // Las dos guardas del banco. No son opciones de OpcionesBanco a propósito.
    actor: ACTOR_BANCO,
    decisionsPath: actaPath,
    fdHash: o.fdHash,
    rf: o.rf,
  };

  const walker = new DomWalker(opts, o.script, o.contract, loadState(o.workDir, o.script));
  let terminado = false;
  const corriendo = walker.run().finally(() => {
    terminado = true;
  });

  const atendidos = new Set<string>();
  const consumidas = new Set<number>();
  const paneles: PanelAtendido[] = [];
  const comprobaciones: Comprobacion[] = [];
  let parcheado = false;

  const paginaViva = (): Page | undefined => (walker as unknown as { page?: Page }).page;

  const despachar = async (detail: unknown): Promise<void> => {
    const page = paginaViva();
    if (!page) throw new Error('no hay página sobre la que despachar');
    await page.evaluate((d) => {
      document.querySelector('[data-qa-assist-host]')?.dispatchEvent(new CustomEvent('qa-assist-cmd', { detail: d }));
    }, detail);
  };

  const leerPanel = async (): Promise<string | null> => {
    const page = paginaViva();
    if (!page) return null;
    return page.evaluate(() => {
      const host = document.querySelector('[data-qa-assist-host]');
      const root = host && (host as { shadowRoot: ShadowRoot | null }).shadowRoot;
      return root ? (root.textContent ?? '') : null;
    });
  };

  const atenderPanel = async (marker: AssistMarker): Promise<void> => {
    const page = paginaViva();
    if (!page) return;
    await page.waitForSelector('[data-qa-assist-host]', { state: 'attached', timeout: 15_000 });
    // el panel monta sus listeners al inyectarse; un respiro evita perder el primer gesto
    await dormir(500);
    const tipo = esPanelDeVeredicto(marker.action) ? 'veredicto' : 'asistencia';
    const texto = o.abrirPanel ? await leerPanel() : null;
    const idx = o.escenario.acciones.findIndex(
      (a, i) => !consumidas.has(i) && a.paso === marker.step && (!a.flujo || a.flujo === marker.flow),
    );
    if (idx === -1) {
      paneles.push({ flujo: marker.flow, paso: marker.step, accion: marker.action, tipo, cubierto: false, texto });
      const socorro = gestoDeSocorro(marker.action);
      comprobaciones.push({
        ok: false,
        que: `panel NO previsto por el escenario: ${marker.flow}/${marker.step} (${marker.action})`,
        detalle: `se despachó «${socorro}» para no colgar el run — si este panel es legítimo, añádelo al escenario`,
      });
      await despachar(socorro);
      return;
    }
    consumidas.add(idx);
    const accion = o.escenario.acciones[idx];
    paneles.push({ flujo: marker.flow, paso: marker.step, accion: marker.action, tipo, cubierto: true, texto });
    comprobaciones.push(...evaluarPanel(accion, texto));
    for (const gesto of accion.hacer) {
      if (esEspera(gesto)) {
        await dormir(gesto.esperar_ms);
      } else if (esMover(gesto)) {
        // el mismo efecto que arrastrar la cabecera: left/top y right suelto
        await page.evaluate((pos) => {
          const h = document.querySelector('[data-qa-assist-host]') as HTMLElement | null;
          if (h) {
            h.style.left = `${pos.x}px`;
            h.style.top = `${pos.y}px`;
            h.style.right = 'auto';
          }
        }, gesto.mover_panel);
        await dormir(150);
      } else if (esClick(gesto)) {
        await page.locator(gesto.click_pagina).first().click({ timeout: 10_000 });
        await dormir(300);
      } else {
        await despachar(gesto.cmd);
        await dormir(400);
      }
    }
  };

  while (!terminado) {
    await dormir(250);
    const page = paginaViva();
    if (!page) continue;
    if (o.abrirPanel && !parcheado) {
      try {
        await page.addInitScript(ABRIR_SHADOW);
        await page.evaluate(ABRIR_SHADOW);
        parcheado = true;
      } catch {
        // la página puede estar en plena navegación; se reintenta en el próximo tic
      }
    }
    let marker: AssistMarker | null = null;
    try {
      marker = existsSync(markerPath) ? parseJsonLoose<AssistMarker>(readFileSync(markerPath, 'utf8')) : null;
    } catch {
      marker = null; // escrito a medias: el próximo tic lo lee entero
    }
    if (!marker) continue;
    const clave = claveDeMarcador(marker);
    if (atendidos.has(clave)) continue;
    atendidos.add(clave);
    try {
      await atenderPanel(marker);
    } catch (err) {
      comprobaciones.push({
        ok: false,
        que: `atender el panel de ${marker.flow}/${marker.step}`,
        detalle: String(err).split('\n')[0],
      });
    }
  }

  const map = await corriendo;
  const acta = existsSync(actaPath) ? parseDecisions(readFileSync(actaPath, 'utf8')).entries : [];
  comprobaciones.push(...evaluarFinal(o.escenario.al_final, acta, map));
  for (const [i, a] of o.escenario.acciones.entries()) {
    if (!consumidas.has(i)) {
      comprobaciones.push({
        ok: false,
        que: `el panel previsto para ${a.paso} nunca se abrió`,
        detalle: 'o el paso resolvió solo, o el cerrojo de la puerta no dejó abrirlo — mira la consola del run',
      });
    }
  }

  const ok = comprobaciones.every((c) => c.ok);
  const informe = {
    proposito: o.escenario.proposito ?? '(sin propósito declarado)',
    ok,
    modo_panel: o.abrirPanel ? 'shadow ABIERTO (audita textos; el aislamiento no es el de producción)' : 'shadow cerrado (comportamiento fiel)',
    actor: ACTOR_BANCO,
    acta: actaPath,
    paneles,
    comprobaciones,
  };
  writeFileSync(resolve(o.workDir, 'bench-report.json'), JSON.stringify(informe, null, 2), 'utf8');

  return { ok, map, acta, actaPath, paneles, comprobaciones };
}

// ------------------------------------------------------------------------ CLI

const EXIT_OK = 0;
const EXIT_USO = 1;
const EXIT_ROJO = 2;

function fdHashDeCli(values: Record<string, unknown>): string | undefined {
  const declarados = ['fd', 'fd-hash', 'sin-fd'].filter((k) => values[k]);
  if (declarados.length > 1) {
    console.error(`[walk-bench] --fd, --fd-hash y --sin-fd son excluyentes (hay: ${declarados.join(', ')})`);
    process.exit(EXIT_USO);
  }
  if (values['sin-fd']) return 'sin-fd';
  if (values['fd-hash']) return String(values['fd-hash']);
  if (values.fd) return huellaDeArtefacto(resolve(String(values.fd)));
  return undefined;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      script: { type: 'string' },
      contract: { type: 'string' },
      escenario: { type: 'string' },
      'work-dir': { type: 'string' },
      'base-url': { type: 'string' },
      'assist-timeout': { type: 'string' },
      fd: { type: 'string' },
      'fd-hash': { type: 'string' },
      'sin-fd': { type: 'boolean' },
      rf: { type: 'string' },
      'abrir-panel': { type: 'boolean' },
      headed: { type: 'boolean' },
    },
  });

  if (!values.script || !values.contract || !values.escenario || !values['work-dir']) {
    console.error(
      'Uso: tsx copilot/src/walk-bench.ts --script=<walk-script.json> --contract=<style.yaml> ' +
        '--escenario=<escenario.json> --work-dir=<dir> [--base-url=...] [--fd=...|--fd-hash=...|--sin-fd] ' +
        '[--rf=RF-NNN] [--abrir-panel] [--headed] [--assist-timeout=<segundos>]',
    );
    return EXIT_USO;
  }

  const script = parseJsonLoose<WalkScript>(readFileSync(resolve(values.script), 'utf8'));
  const validacion = validateWalkScript(script);
  if (!validacion.ok) {
    console.error('[walk-bench] walk-script inválido:');
    for (const e of validacion.errors) console.error(`  - ${e}`);
    return EXIT_USO;
  }
  const contract = parseYaml(readFileSync(resolve(values.contract), 'utf8')) as StyleContract;
  const crudo = parseJsonLoose<unknown>(readFileSync(resolve(values.escenario), 'utf8'));
  const esc = validarEscenario(crudo);
  if (!esc.ok) {
    console.error('[walk-bench] escenario inválido:');
    for (const e of esc.errores) console.error(`  - ${e}`);
    return EXIT_USO;
  }

  const resultado = await correrBanco({
    script,
    contract,
    escenario: esc.escenario,
    workDir: resolve(values['work-dir']),
    baseUrl: values['base-url'],
    headed: values.headed ?? false,
    assistTimeoutMs: values['assist-timeout'] ? Number(values['assist-timeout']) * 1000 : undefined,
    abrirPanel: values['abrir-panel'] ?? false,
    fdHash: fdHashDeCli(values as Record<string, unknown>),
    rf: values.rf,
  });

  console.log(`\n[walk-bench] ${esc.escenario.proposito ?? 'escenario sin propósito declarado'}`);
  console.log(`[walk-bench] actor: ${ACTOR_BANCO} · acta: ${resultado.actaPath}`);
  for (const p of resultado.paneles) {
    console.log(`  panel ${p.tipo} en ${p.flujo}/${p.paso}${p.cubierto ? '' : '  ← NO PREVISTO'}`);
  }
  for (const c of resultado.comprobaciones) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.que}${c.ok || !c.detalle ? '' : `\n      ${c.detalle}`}`);
  }
  const rojas = resultado.comprobaciones.filter((c) => !c.ok).length;
  console.log(`[walk-bench] ${resultado.comprobaciones.length - rojas}/${resultado.comprobaciones.length} comprobaciones · informe: ${resolve(values['work-dir'], 'bench-report.json')}`);
  return resultado.ok ? EXIT_OK : EXIT_ROJO;
}

const invocado = process.argv[1] || '';
if (invocado.endsWith('walk-bench.ts') || import.meta.url === pathToFileURL(invocado).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`[walk-bench] error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(EXIT_USO);
    },
  );
}
