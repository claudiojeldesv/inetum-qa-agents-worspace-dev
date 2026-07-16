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

export function consolidateReviews(workDir: string): {
  count: number;
  files: number;
  corrupt: string[];
  output: string;
} {
  const dir = resolve(workDir, 'review-feedback');
  const output = resolve(workDir, 'review-feedback.json');
  if (!existsSync(dir)) return { count: 0, files: 0, corrupt: [], output };

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort(); // orden estable → salida determinística
  const lines: string[] = [];
  const corrupt: string[] = [];
  for (const f of files) {
    const path = resolve(dir, f);
    const objs = readJsonObjects(path);
    const nonEmpty = readFileSync(path, 'utf8').trim().length > 0;
    if (nonEmpty && objs.length === 0) {
      // Fichero no vacío pero no parseable: NO se pierde en silencio (bug histórico).
      // Se registra un placeholder auditable y se reporta al caller.
      corrupt.push(f);
      lines.push(
        JSON.stringify({ spec: f, verdict: 'unknown', error: 'invalid JSON in per-spec feedback file' }),
      );
      continue;
    }
    for (const obj of objs) lines.push(JSON.stringify(obj));
  }
  writeFileSync(output, lines.length ? lines.join('\n') + '\n' : '', 'utf8');
  return { count: lines.length, files: files.length, corrupt, output };
}

function main(): void {
  const workDir = resolve(process.cwd(), process.argv[2] || process.env.QA_WORK_DIR || '.work');
  const { count, files, corrupt, output } = consolidateReviews(workDir);
  if (files === 0) {
    console.log(`[consolidate-reviews] sin directorio review-feedback/ en ${workDir} (nada que consolidar).`);
    return;
  }
  console.log(`[consolidate-reviews] ${count} entradas de ${files} ficheros per-spec → ${output}`);
  if (corrupt.length) {
    // Ruidoso a propósito: nunca perder feedback en silencio.
    console.error(
      `[consolidate-reviews] WARN: ${corrupt.length} fichero(s) de feedback con JSON inválido ` +
        `(placeholder registrado; revisa la salida del ia4d-reviewer): ${corrupt.join(', ')}`,
    );
  }
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('consolidate-reviews.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
