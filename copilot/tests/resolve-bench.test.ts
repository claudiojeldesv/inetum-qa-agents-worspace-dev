import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { chromium, type Browser } from '@playwright/test';

import { DomWalker, type StyleContract } from '../src/dom-walker.ts';
import {
  controlRoto,
  loadHtml,
  parseManifest,
  prepareBenchPage,
  renderBench,
  runCase,
  type BenchResult,
} from '../src/resolve-bench.ts';

/**
 * K0.31 — el banco de resolución, la pieza que faltaba para medir la escalera
 * contra un corpus grande (Mind2Web) en vez de contra anécdotas.
 *
 * Estos tests NO miden al walker: validan el ARNÉS. Lo que se comprueba es que
 * sabe emitir los tres desenlaces y, sobre todo, que sabe emitir EQUIVOCADO —
 * un banco incapaz de detectar un fallo mudo daría 100% de acierto siempre y
 * sería peor que no tener banco.
 */
const MANIFEST = resolve(__dirname, '../fixtures/bench/manifest.jsonl');
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

async function correrCorpus(): Promise<Map<string, BenchResult>> {
  const casos = parseManifest(readFileSync(MANIFEST, 'utf8'));
  const dir = dirname(MANIFEST);
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-bench-t-'));
  const browser: Browser = await chromium.launch();
  const page = await browser.newPage();
  // misma preparación que el CLI: si el test corriera con la red abierta y el
  // CLI no, estaríamos midiendo dos cosas distintas
  await prepareBenchPage(page);
  const walker = DomWalker.forBench(page, contract, workDir, resolve(workDir, 'sin-alias.json'));
  const out = new Map<string, BenchResult>();
  try {
    for (const c of casos) {
      const html = loadHtml(c, dir);
      expect(html, `sin html para ${c.id}`).not.toBeNull();
      out.set(c.id, await runCase(page, walker, c, html!));
    }
  } finally {
    await browser.close();
  }
  return out;
}

describe('K0.31 — banco de resolución', () => {
  it('el manifiesto tolera comentarios y líneas rotas sin tumbar el corpus', () => {
    const casos = parseManifest(
      ['# comentario', '', '{"id":"a","action":"click","hint":{},"target":"#a"}', '{roto', '{"id":"b"}'].join('\n'),
    );
    // 'b' cae por no traer action/target: un caso incompleto no puede puntuar
    expect(casos.map((c) => c.id)).toEqual(['a']);
  });

  it('clasifica los tres desenlaces contra páginas reales', async () => {
    const r = await correrCorpus();
    expect(r.get('acierto-role')!.outcome).toBe('acierto');
    expect(r.get('acierto-label')!.outcome).toBe('acierto');
    expect(r.get('acierto-html-inline')!.outcome).toBe('acierto');
    // el peldaño exacto de K0.28, medido por el banco: substring vería dos
    expect(r.get('acierto-texto-exacto')!.outcome).toBe('acierto');
    expect(r.get('acierto-texto-exacto')!.via).toContain('exact: true');
    // ambiguo y ausente → planta, que es el desenlace honesto
    expect(r.get('planta-ambiguo')!.outcome).toBe('planta');
    expect(r.get('planta-inexistente')!.outcome).toBe('planta');
  }, 120_000);

  it('SABE cantar EQUIVOCADO (si no, el banco no vale): y dice qué resolvió', async () => {
    const r = await correrCorpus();
    const malo = r.get('harness-check')!;
    expect(malo.outcome).toBe('EQUIVOCADO');
    // `got` es lo que la escalera RESOLVIÓ (aquí #guardar) frente a la verdad
    // anotada (#cancelar): sin ese dato, un EQUIVOCADO no se puede depurar
    expect(malo.got).toContain('guardar');
    expect(malo.via).toBeDefined();
  }, 120_000);

  it('K0.40 — «dentro» es su propio desenlace: ni acierto ni EQUIVOCADO', async () => {
    // La forma más común de un control real: `<a><span>Texto</span></a>`. El
    // peldaño de texto resuelve el `<span>` y lo anotado es el `<a>`. El clic
    // burbuja, así que el negocio ocurre igual — pero no es el mismo nodo.
    const r = await correrCorpus();
    const d = r.get('dentro-del-anotado')!;
    expect(d.outcome).toBe('dentro');
    expect(d.got).toContain('span');
    // y NO se cuela en la cifra de acierto: son líneas distintas del informe
    const txt = renderBench([...r.values()]);
    expect(txt).toMatch(/acierto {8}4\b/);
    expect(txt).toMatch(/dentro {9}1\b/);
  }, 120_000);

  it('K0.40 — MITADES FALSABLES: el ancestro y la acción que no propaga siguen siendo EQUIVOCADO', async () => {
    // Sin estas dos, «dentro» sería una amnistía en vez de una categoría.
    const r = await correrCorpus();
    // hacia arriba no burbuja: pulsar el contenedor pulsa su centro, otro hijo
    expect(r.get('ancestro-sigue-siendo-equivocado')!.outcome).toBe('EQUIVOCADO');
    expect(r.get('ancestro-sigue-siendo-equivocado')!.relacion).toBe('ancestro');
    // teclear sobre el span no activa el enlace: ahí «por dentro» no equivale a nada
    expect(r.get('dentro-sin-propagacion')!.outcome).toBe('EQUIVOCADO');
    expect(r.get('dentro-sin-propagacion')!.relacion).toBe('dentro');
  }, 120_000);

  it('un caso sin verdad anotada no puntúa a favor de nadie', async () => {
    const r = await correrCorpus();
    const sin = r.get('sin-verdad')!;
    expect(sin.invalid).toContain('no existe en la foto');
    expect(sin.outcome).not.toBe('acierto'); // jamás se cuenta como éxito
  }, 120_000);

  it('el caso de control se declara en los datos: no puntúa, pero si deja de cumplirse el banco está roto', async () => {
    const r = await correrCorpus();
    const ctrl = r.get('harness-check')!;
    expect(ctrl.control).toEqual({ expected: 'EQUIVOCADO', ok: true });
    // y el informe lo aparta del recuento del walker: 0 equivocados REALES
    const txt = renderBench([...r.values()]);
    expect(txt).toContain('EQUIVOCADO     0');
    expect(txt).toContain('autocomprobación del banco: 3/3 OK');
  }, 120_000);

  it('si el control deja de detectar el fallo mudo, el informe grita BANCO ROTO', () => {
    // el fallo que de verdad importa de esta pieza: que el termómetro mienta
    const txt = renderBench([
      { id: 'a', site: 's', outcome: 'acierto' },
      { id: 'ctrl', site: 's', outcome: 'acierto', control: { expected: 'EQUIVOCADO', ok: false } },
    ]);
    expect(txt).toContain('BANCO ROTO');
    expect(txt).toContain('NO es fiable');
    expect(controlRoto([{ id: 'ctrl', site: 's', outcome: 'acierto', control: { expected: 'EQUIVOCADO', ok: false } }]))
      .toHaveLength(1);
  });

  it('el informe pone el EQUIVOCADO en primer plano, no diluido en un porcentaje', () => {
    const txt = renderBench([
      { id: 'a', site: 's', outcome: 'acierto' },
      { id: 'b', site: 's', outcome: 'planta' },
      { id: 'c', site: 's', outcome: 'EQUIVOCADO', via: "getByRole('button')", got: 'button#otro' },
    ]);
    expect(txt).toContain('tiene que ser CERO');
    expect(txt).toContain('elementos equivocados');
    expect(txt).toContain('button#otro');
  });
});
