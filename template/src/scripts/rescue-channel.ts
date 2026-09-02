#!/usr/bin/env tsx
/**
 * Declara (o retira) el CANAL DE RESCATE de un work-dir — Fase 2 del plan del
 * rescate en proceso.
 *
 * El walker no habla con ningún LLM: escribe `rescue-request.json` y espera un
 * `rescue-response.json` (regla dura #5). Pero solo espera si alguien se ha
 * comprometido a contestar, y ese compromiso se declara con este fichero. Sin
 * él sale por `exit 42` como siempre, que es lo correcto en CI o en un run
 * lanzado a pelo: colgar un run esperando a quien no existe cuesta el run
 * entero, mientras que el replay solo cuesta pasos.
 *
 * Existe como script y no como «escribe este JSON a mano» por una razón medida
 * en esta misma sesión: el comillado de JSON en PowerShell rompió dos comandos
 * distintos, y un paso manual que falla la mitad de las veces no es un paso.
 *
 * Uso:
 *   npm run qa:canal -- --work-dir=.work/f2 --listener=orquestador [--timeout=90]
 *   npm run qa:canal -- --work-dir=.work/f2 --retirar
 *
 * Exit: 0 declarado o retirado · 1 uso/IO.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendAuditEntry } from '../audit-log.ts';

/** El mismo techo que aplica el walker: pedir más no sirve de nada. */
export const MAX_TIMEOUT_S = 120;

export function construirCanal(i: { listener: string; timeoutS: number }): { listener: string; timeout_ms: number } {
  const listener = i.listener.trim();
  if (!listener) throw new Error('--listener no puede estar vacío: el canal declara QUIÉN escucha');
  if (!Number.isFinite(i.timeoutS) || i.timeoutS <= 0) throw new Error(`--timeout inválido: '${i.timeoutS}'`);
  // El walker recorta al techo de todas formas; recortar aquí también hace que
  // lo escrito en disco sea lo que de verdad va a ocurrir, y no una promesa
  // que el consumidor incumple en silencio.
  return { listener, timeout_ms: Math.min(i.timeoutS, MAX_TIMEOUT_S) * 1000 };
}

function main(): void {
  const { values } = parseArgs({
    options: {
      'work-dir': { type: 'string' },
      listener: { type: 'string' },
      timeout: { type: 'string' },
      retirar: { type: 'boolean', default: false },
    },
  });
  if (!values['work-dir']) {
    console.error('uso: qa:canal -- --work-dir=<dir> --listener=<quién> [--timeout=<segundos>] | --retirar');
    process.exit(1);
  }
  const dir = resolve(values['work-dir']);
  const path = resolve(dir, 'rescue-channel.json');

  if (values.retirar) {
    const habia = existsSync(path);
    rmSync(path, { force: true });
    appendAuditEntry({
      source: 'command',
      action: habia ? 'allow' : 'skip',
      target: path,
      reason: habia ? 'canal de rescate retirado: el walker volverá a salir con exit 42' : 'no había canal que retirar',
      metadata: { phase: 'rescue-channel' },
    });
    console.log(habia ? `[qa:canal] retirado — el walker volverá a exit 42.` : `[qa:canal] no había canal en ${dir}.`);
    return;
  }

  let canal: { listener: string; timeout_ms: number };
  try {
    canal = construirCanal({ listener: values.listener ?? '', timeoutS: Number(values.timeout ?? 90) });
  } catch (err) {
    console.error(`[qa:canal] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(canal, null, 2), 'utf8');
  appendAuditEntry({
    source: 'command',
    action: 'allow',
    target: path,
    reason: `canal de rescate declarado por '${canal.listener}' con plazo ${canal.timeout_ms} ms`,
    metadata: { phase: 'rescue-channel', listener: canal.listener },
  });
  console.log(
    `[qa:canal] declarado en ${path}\n` +
      `  escucha: ${canal.listener} · plazo: ${canal.timeout_ms / 1000}s\n` +
      `  el walker ESPERARÁ la respuesta sin cerrar el navegador; si nadie contesta, sale con exit 42 y nada se pierde.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
