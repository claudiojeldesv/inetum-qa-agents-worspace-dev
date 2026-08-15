import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from '@playwright/test';

import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import { corpusVerdict } from '../src/walk-core.ts';
import { loadHtml, parseManifest, prepareBenchPage, runCase } from '../src/resolve-bench.ts';
import type { WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

/**
 * K0.32 — el CAPTURADOR de corpus: cada walk deja fotografiado el DOM en el que
 * la escalera resolvió, y esas fotos alimentan el banco (K0.31). Sin esto, cada
 * visita a un sitio real se perdía al cerrar el navegador y los hallazgos eran
 * anécdotas de un día en vez de regresión permanente.
 *
 * Lo que estos tests fijan, por orden de importancia:
 *   1. La VERDAD del corpus no puede salir de la propia escalera. Un caso solo
 *      entra si algo independiente lo corrobora (postcondición del FD cumplida,
 *      o el QA señalando el elemento); si no, va a pendientes con su motivo.
 *   2. El bucle se cierra: lo capturado se puede correr en el banco.
 *   3. Está apagado por defecto — una foto es HTML crudo (regla dura #6).
 */
const FIX = pathToFileURL(resolve(__dirname, '../fixtures')).href;
const contract: StyleContract = { locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] } };

function freshState(): WalkState {
  return {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
}

/** Un login con dos pasos: uno con postcondición (entra) y otro sin ella (no entra). */
const PASOS: WalkStep[] = [
  { id: 's1', action: 'fill', hint: { label: 'Usuario' }, value: 'demo' },
  { id: 's2', action: 'fill', hint: { label: 'Contraseña' }, value: 'clave', secret: true },
  { id: 's3', action: 'click', hint: { role: 'button', name: 'Login' }, expect_after: 'Sesión iniciada' },
];

async function walkConCorpus(corpusDir?: string): Promise<string> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-corpus-'));
  const script: WalkScript = { version: 1, site_id: 'login', entry: '/login-sin-label.html', flows: [{ flow: 'f', steps: PASOS }] };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
    corpusDir,
  };
  await new DomWalker(opts, script, contract, freshState()).run();
  return workDir;
}

const leerJsonl = (p: string): Array<Record<string, unknown>> =>
  existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

describe('K0.32 — qué puede ser VERDAD del corpus (decisión pura)', () => {
  const base = { outcome: 'ok' as const, tienePostcondicion: true, via: "getByRole('button')", frame_path: [] };

  it('postcondición cumplida = verdad corroborada por la app, no por el walker', () => {
    expect(corpusVerdict(base).incluir).toBe(true);
  });

  it('el QA señalando el elemento es la verdad más fuerte, con o sin postcondición', () => {
    const v = corpusVerdict({ ...base, tienePostcondicion: false, via: "✎ getByRole('button', { name: 'X' })" });
    expect(v.incluir).toBe(true);
    expect(v.motivo).toContain('humana');
  });

  it('resolvió y ejecutó pero NADA lo corrobora → fuera, y el motivo lo dice sin adornos', () => {
    // es la regla que evita que el banco se mida a sí mismo: si la verdad la
    // pusiera la propia escalera, daría 100% de acierto por construcción
    const v = corpusVerdict({ ...base, tienePostcondicion: false });
    expect(v.incluir).toBe(false);
    expect(v.motivo).toContain('medirse a sí mismo');
  });

  it('un paso que salió mal no aporta verdad de nada', () => {
    expect(corpusVerdict({ ...base, outcome: 'postcondition_unmet' }).incluir).toBe(false);
    expect(corpusVerdict({ ...base, outcome: 'action_failed' }).incluir).toBe(false);
  });

  it('dentro de un iframe se excluye: la foto del documento principal no lo contiene', () => {
    const v = corpusVerdict({ ...base, frame_path: ['iframe#negocio'] });
    expect(v.incluir).toBe(false);
    expect(v.motivo).toContain('iframe');
  });
});

describe('K0.32 — la captura durante un walk', () => {
  it('OFF por defecto: sin la bandera no se escribe ni una foto', async () => {
    const workDir = await walkConCorpus(undefined);
    expect(readdirSync(workDir).filter((f) => f.endsWith('.html'))).toEqual([]);
  }, 120_000);

  it('reparte: solo el paso corroborado entra en el manifiesto, el resto queda pendiente con motivo', async () => {
    const corpus = mkdtempSync(resolve(tmpdir(), 'qa-corpusdir-'));
    await walkConCorpus(corpus);

    const casos = leerJsonl(resolve(corpus, 'manifest.jsonl'));
    const pendientes = leerJsonl(resolve(corpus, 'pendientes.jsonl'));
    // s3 tiene expect_after y pasó → verdad; s1 y s2 resolvieron pero nada los corrobora
    expect(casos.map((c) => c.task)).toEqual(['f/s3']);
    expect(pendientes.map((c) => c.task).sort()).toEqual(['f/s1', 'f/s2']);
    expect(String(pendientes[0].excluido)).toContain('medirse a sí mismo');
    // y el pendiente conserva CÓMO lo resolvió el walker, que es lo que el QA
    // necesita para decidir si promoverlo a verdad
    expect(pendientes[0].resuelto_como).toBeDefined();
  }, 120_000);

  it('la foto CONGELA la visibilidad: sin eso, el CSS externo perdido inventa ambigüedad', async () => {
    /**
     * La clase, medida con el primer corpus real (tufarmacia): dos de tres casos
     * que resolvían en vivo se plantaban sobre su propia foto, porque las hojas
     * de estilo son peticiones externas que la foto no lleva — y sin CSS, lo
     * oculto se vuelve visible. Aquí el duplicado del "menú móvil" lo esconde
     * una hoja EXTERNA, igual que en el sitio real.
     */
    const corpus = mkdtempSync(resolve(tmpdir(), 'qa-corpuscss-'));
    const workDir = mkdtempSync(resolve(tmpdir(), 'qa-corpuscssw-'));
    const script: WalkScript = {
      version: 1, site_id: 'css', entry: '/corpus-css-externo.html',
      flows: [{ flow: 'f', steps: [{ id: 's1', action: 'click', hint: { text: 'Medicamentos' }, expect_after: 'Categoria abierta' }] }],
    };
    const opts: WalkerOptions = {
      scriptPath: 't', contractPath: 't', baseUrl: FIX, workDir, rescueBudget: 0, screenCap: 60,
      headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
      aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
      corpusDir: corpus,
    };
    await new DomWalker(opts, script, contract, freshState()).run();

    const casos = parseManifest(readFileSync(resolve(corpus, 'manifest.jsonl'), 'utf8'));
    expect(casos).toHaveLength(1);
    const html = loadHtml(casos[0], corpus)!;

    const browser: Browser = await chromium.launch();
    const page = await browser.newPage();
    await prepareBenchPage(page);
    try {
      // el par falsable, sobre la MISMA foto: quitándole el congelado, el
      // duplicado reaparece y la escalera tendría dos candidatos visibles
      const sinCongelar = html.replace(/<style id="qa-corpus-visibility">[\s\S]*?<\/style>/, '');
      await page.setContent(sinCongelar, { waitUntil: 'domcontentloaded' });
      expect(await page.getByText('Medicamentos', { exact: true }).filter({ visible: true }).count()).toBe(2);

      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      expect(await page.getByText('Medicamentos', { exact: true }).filter({ visible: true }).count()).toBe(1);

      // y con el congelado el banco acierta, como en vivo
      const benchDir = mkdtempSync(resolve(tmpdir(), 'qa-bench-css-'));
      const walker = DomWalker.forBench(page, contract, benchDir, resolve(benchDir, 'sin-alias.json'));
      const r = await runCase(page, walker, casos[0], html);
      expect(r.outcome).toBe('acierto');
    } finally {
      await browser.close();
    }
  }, 180_000);

  it('EL BUCLE CERRADO: lo capturado se corre en el banco y resuelve', async () => {
    const corpus = mkdtempSync(resolve(tmpdir(), 'qa-corpusdir-'));
    await walkConCorpus(corpus);
    const manifest = resolve(corpus, 'manifest.jsonl');
    const casos = parseManifest(readFileSync(manifest, 'utf8'));
    expect(casos.length).toBeGreaterThan(0);

    const browser: Browser = await chromium.launch();
    const page = await browser.newPage();
    await prepareBenchPage(page);
    const workDir = mkdtempSync(resolve(tmpdir(), 'qa-bench-c-'));
    const walker = DomWalker.forBench(page, contract, workDir, resolve(workDir, 'sin-alias.json'));
    try {
      for (const c of casos) {
        const html = loadHtml(c, corpus);
        expect(html, `sin foto para ${c.id}`).not.toBeNull();
        const r = await runCase(page, walker, c, html!);
        // el caso vino de un paso que la app corroboró: la escalera debe volver
        // a dar con el mismo elemento sobre la foto, y desde luego no con otro
        expect(r.outcome, `${c.id}: ${r.got ?? ''}`).toBe('acierto');
      }
    } finally {
      await browser.close();
    }
  }, 180_000);
});
