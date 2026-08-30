/**
 * G2 — el smoke run instrumentado (plan gate-locators-medidos), la mitad que
 * corre: un run por lote de specs contra el sitio, ANTES de que la suite sea el
 * juez, con las DOS salidas que el plan exige y que no se pueden mezclar:
 *
 *  1. verde/rojo, separando dos clases de rojo que piden manos distintas:
 *     - **rojo-locator** (el locator no resuelve, strict mode, acción que no
 *       llega): lo arregla el Writer, legítimo;
 *     - **rojo-aserción** (falla un expect): posible defecto del PRODUCTO bajo
 *       prueba. El Writer NO toca la aserción; se escala al informe. Sin esta
 *       separación el gate le enseña al Writer a escribir tests que pasan — y
 *       eso es peor que no tener gate.
 *  2. la otra mitad de G2 —`count() >= 2` con el test en verde— vive como
 *     `MF-eligio-a-ciegas` en pre-review, cruzando los `.first()/.nth()` del
 *     spec con la MEDICIÓN de verify-locators. Desviación deliberada del plan
 *     (fixture al momento de uso): escrita en el propio plan, con su porqué.
 *
 * `QA_SMOKE=1` se exporta al run — reservado para el fixture de conteo en vivo
 * si algún día se materializa; hoy no cambia nada y se declara.
 *
 * Uso:  tsx src/scripts/smoke-run.ts <spec|dir>... [--config=<playwright.config>] [--out-dir=<dir>]
 * Exit: 0 todo verde · 1 uso/infra · 2 hay rojos (las clases van en el resumen).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { appendAuditEntry } from '../audit-log.ts';

export type ClaseDeRojo = 'locator' | 'asercion' | 'entorno' | 'desconocida';

/**
 * La clasificación es por el SITIO del fallo, no por palabras sueltas: un expect
 * que expira también dice «waiting for locator», y clasificarlo como locator
 * mandaría al Writer a «arreglar» un oráculo — exactamente lo prohibido. Por eso
 * la aserción se decide PRIMERO (matcher de expect en el mensaje) y lo demás
 * después. Lo que no casa con ninguna clase se declara `desconocida`: mejor un
 * rojo sin clase que una clase inventada.
 */
export function clasificarRojo(mensaje: string): ClaseDeRojo {
  const m = mensaje ?? '';
  if (/expect\s*\(.*\)\s*\.\s*(not\.)?to[A-Z]\w*|Expect "\w+"|expect\(received\)|toHave\w+|toBe\w+|toContain\w+/s.test(m)) {
    return 'asercion';
  }
  if (/falta la variable de entorno/.test(m)) {
    return 'entorno'; // la guarda D43 del emisor: el propio error nombra la variable y de dónde sale
  }
  if (
    /strict mode violation|waiting for locator|locator\.\w+: (Timeout|Target|Error)|element is not attached|resolved to \d+ elements|intercepts pointer events|element is (not visible|disabled|hidden)/s.test(
      m,
    )
  ) {
    return 'locator';
  }
  return 'desconocida';
}

export interface ResultadoDeTest {
  file: string;
  title: string;
  status: 'verde' | 'rojo' | 'saltado';
  clase?: ClaseDeRojo;
  error?: string;
  /** Qué mano lo arregla — la frase va al informe tal cual. */
  siguiente_paso?: string;
}

const GUIA: Record<ClaseDeRojo, string> = {
  locator: 'el Writer arregla el locator (legítimo) — el criterio NO se toca',
  asercion:
    'posible DEFECTO del producto bajo prueba: el Writer NO toca la aserción; se escala al informe de reconciliación',
  entorno: 'falta una variable de entorno que el propio error nombra (D43): exportala y repite — ni Writer ni producto',
  desconocida: 'rojo sin clase reconocible: mirar el error a mano antes de tocar nada',
};

interface JsonReporterResult {
  status?: string;
  error?: { message?: string; stack?: string };
  errors?: Array<{ message?: string }>;
}
interface JsonReporterSuite {
  suites?: JsonReporterSuite[];
  specs?: Array<{
    title: string;
    file?: string;
    tests?: Array<{ results?: JsonReporterResult[]; status?: string }>;
  }>;
  file?: string;
}

/** Aplana el árbol del reporter JSON de Playwright a resultados clasificados. */
export function clasificarReporte(raiz: { suites?: JsonReporterSuite[] }): ResultadoDeTest[] {
  const out: ResultadoDeTest[] = [];
  const visitar = (s: JsonReporterSuite): void => {
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const ultimo = t.results?.[t.results.length - 1];
        const status = ultimo?.status ?? t.status ?? 'skipped';
        if (status === 'passed') {
          out.push({ file: spec.file ?? s.file ?? '', title: spec.title, status: 'verde' });
        } else if (status === 'skipped') {
          out.push({ file: spec.file ?? s.file ?? '', title: spec.title, status: 'saltado' });
        } else {
          const msg = ultimo?.error?.message ?? ultimo?.errors?.[0]?.message ?? '';
          const clase = clasificarRojo(msg);
          out.push({
            file: spec.file ?? s.file ?? '',
            title: spec.title,
            status: 'rojo',
            clase,
            error: msg.split('\n').slice(0, 3).join(' ').slice(0, 300),
            siguiente_paso: GUIA[clase],
          });
        }
      }
    }
    for (const hijo of s.suites ?? []) visitar(hijo);
  };
  for (const s of raiz.suites ?? []) visitar(s);
  return out;
}

// ------------------------------------------------------------------------ CLI

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const targets = args.filter((a) => !a.startsWith('--'));
  const config = args.find((a) => a.startsWith('--config='))?.slice('--config='.length);
  const outDir = resolve(
    process.cwd(),
    args.find((a) => a.startsWith('--out-dir='))?.slice('--out-dir='.length) ??
      join(process.env.QA_WORK_DIR || '.work', 'smoke'),
  );
  if (targets.length === 0) {
    console.error('Uso: tsx src/scripts/smoke-run.ts <spec|dir>... [--config=<playwright.config>] [--out-dir=<dir>]');
    return 1;
  }
  const cli = resolve(process.cwd(), 'node_modules/@playwright/test/cli.js');
  if (!existsSync(cli)) {
    console.error('[smoke-run] no hay @playwright/test en este workspace (npm install)');
    return 1;
  }

  let stdout = '';
  try {
    stdout = execFileSync(
      process.execPath,
      [cli, 'test', ...targets, ...(config ? [`--config=${config}`] : []), '--reporter=json'],
      { encoding: 'utf8', env: { ...process.env, QA_SMOKE: '1' }, maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (err) {
    const e = err as { stdout?: string; message?: string };
    // exit != 0 con rojos es el caso NORMAL: el reporte viene igualmente por stdout
    stdout = e.stdout ?? '';
    if (!stdout.trim()) {
      console.error(`[smoke-run] playwright no produjo reporte: ${e.message?.split('\n')[0]}`);
      return 1;
    }
  }

  let raiz: { suites?: JsonReporterSuite[] };
  try {
    raiz = JSON.parse(stdout.slice(stdout.indexOf('{'))) as { suites?: JsonReporterSuite[] };
  } catch {
    console.error('[smoke-run] el reporte JSON de playwright no parsea');
    return 1;
  }

  const resultados = clasificarReporte(raiz);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'smoke-run.jsonl'), resultados.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  const rojos = resultados.filter((r) => r.status === 'rojo');
  const resumen = {
    out: join(outDir, 'smoke-run.jsonl').replace(/\\/g, '/'),
    total: resultados.length,
    verdes: resultados.filter((r) => r.status === 'verde').length,
    saltados: resultados.filter((r) => r.status === 'saltado').length,
    rojos_locator: rojos.filter((r) => r.clase === 'locator').length,
    rojos_asercion: rojos.filter((r) => r.clase === 'asercion').length,
    rojos_entorno: rojos.filter((r) => r.clase === 'entorno').length,
    rojos_desconocida: rojos.filter((r) => r.clase === 'desconocida').length,
    rojos: rojos.map((r) => ({ file: r.file, title: r.title, clase: r.clase, siguiente_paso: r.siguiente_paso })),
  };
  console.log(JSON.stringify(resumen, null, 2));

  appendAuditEntry({
    source: 'command',
    action: rojos.length ? 'warn' : 'allow',
    target: targets.join(' '),
    rule: 'smoke-run-g2',
    reason: rojos.length
      ? `${resumen.rojos_locator} rojo(s) de locator (Writer) · ${resumen.rojos_asercion} de aserción (ESCALAR, no tocar) · ${resumen.rojos_desconocida} sin clase`
      : `smoke verde: ${resumen.verdes}/${resumen.total}`,
    result: rojos.length ? 'fail' : 'pass',
  });
  return rojos.length ? 2 : 0;
}

const invocado = process.argv[1] || '';
if (invocado.endsWith('smoke-run.ts') || import.meta.url === pathToFileURL(invocado).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`[smoke-run] error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    },
  );
}
