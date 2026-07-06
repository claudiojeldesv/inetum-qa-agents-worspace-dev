#!/usr/bin/env node
/**
 * consolidate-reviews — une los ficheros de feedback por-spec en el review-feedback.json plano.
 *
 * Fix de concurrencia: los ia4d-writer/reviewer corren en paralelo (Acto 4). Si cada uno hace
 * *append* sobre un único review-feedback.json compartido, se corrompe (entradas truncadas, race).
 * En su lugar, el Reviewer escribe UN fichero propio por spec en `<workDir>/review-feedback/<spec>.json`
 * (sin contención), y este script los consolida de forma DETERMINÍSTICA en `<workDir>/review-feedback.json`
 * (JSON-lines, ordenado por nombre de fichero) para el enricher de Allure y el reporte ejecutivo.
 *
 * Idempotente. Si no existe el directorio per-spec, no hace nada (compat con runs antiguos).
 *
 * Uso:  tsx src/scripts/consolidate-reviews.ts [<workDir>]    (default: $QA_WORK_DIR || .work)
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Lee objetos JSON de un fichero: array, objeto único o JSON-lines. */
function readJsonObjects(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  const t = readFileSync(path, 'utf8').trim();
  if (!t) return [];
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [v];
  } catch {
    /* JSON-lines u objeto parcial: intenta línea a línea */
  }
  const out: Record<string, unknown>[] = [];
  for (const line of t.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s));
    } catch {
      /* línea corrupta: se omite, no se truncan las demás */
    }
  }
  return out;
}

export function consolidateReviews(workDir: string): { count: number; files: number; output: string } {
  const dir = resolve(workDir, 'review-feedback');
  const output = resolve(workDir, 'review-feedback.json');
  if (!existsSync(dir)) return { count: 0, files: 0, output };

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort(); // orden estable → salida determinística
  const lines: string[] = [];
  for (const f of files) {
    for (const obj of readJsonObjects(resolve(dir, f))) lines.push(JSON.stringify(obj));
  }
  writeFileSync(output, lines.length ? lines.join('\n') + '\n' : '', 'utf8');
  return { count: lines.length, files: files.length, output };
}

function main(): void {
  const workDir = resolve(process.cwd(), process.argv[2] || process.env.QA_WORK_DIR || '.work');
  const { count, files, output } = consolidateReviews(workDir);
  console.log(
    files === 0
      ? `[consolidate-reviews] sin directorio review-feedback/ en ${workDir} (nada que consolidar).`
      : `[consolidate-reviews] ${count} entradas de ${files} ficheros per-spec → ${output}`,
  );
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('consolidate-reviews.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
