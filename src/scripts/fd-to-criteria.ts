#!/usr/bin/env tsx
/**
 * `qa:criterios` — del FD markdown al `criteria.json` del estándar S3, sin LLM.
 *
 * Uso:
 *   tsx src/scripts/fd-to-criteria.ts --fd=<ruta.md> --url=<url> [--out=<ruta.json>]
 *
 * Sin `--out` no escribe: enseña el resumen y sale. Escribir un artefacto que
 * otras capas consumen se pide explícitamente, como en `merge-assist-patch`.
 *
 * Exit 0 = convertido (o resumen mostrado) · 1 = uso incorrecto o FD ilegible
 * · 2 = el FD no contiene ningún caso reconocible.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import { fdACriteria, parseFdOnesait } from '../fd-to-criteria.ts';

const args = process.argv.slice(2);
const flag = (n: string): string | undefined =>
  args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');

const fd = flag('fd');
const url = flag('url');
const out = flag('out');

if (!fd || !url) {
  console.error('uso: tsx src/scripts/fd-to-criteria.ts --fd=<ruta.md> --url=<url> [--out=<ruta.json>]');
  process.exit(1);
}
if (!existsSync(fd)) {
  console.error(`[qa:criterios] no existe el FD: ${fd}`);
  process.exit(1);
}

const casos = parseFdOnesait(readFileSync(fd, 'utf8'));
if (casos.length === 0) {
  console.error(
    `[qa:criterios] ningún caso reconocible en ${fd}. Se espera la forma onesait: ` +
      '«## CPNNN — título» con «### Pasos» y «### Resultado esperado».',
  );
  process.exit(2);
}

const doc = fdACriteria(casos, { sourceFd: basename(fd), targetUrl: url });

console.log(`[qa:criterios] ${casos.length} caso(s) en ${basename(fd)}`);
for (const c of doc.criteria) {
  const faltan = c.assumptions.length ? '  ← INCOMPLETO' : '';
  console.log(`  ${c.id.padEnd(6)} ${c.source_ref.padEnd(34)} ${c.title}${faltan}`);
}
const incompletos = doc.criteria.filter((c) => c.assumptions.length);
if (incompletos.length) {
  console.log(`\n[qa:criterios] ${incompletos.length} caso(s) con secciones ausentes — se anotan, NO se rellenan:`);
  for (const c of incompletos) console.log(`  - ${c.id}: ${c.assumptions[0]}`);
}

if (!out) {
  console.log('\n[qa:criterios] VISTA PREVIA: no se ha escrito nada. Añade --out=<ruta.json> para generarlo.');
  process.exit(0);
}

mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(resolve(out), `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
console.log(`\n[qa:criterios] escrito ${out}`);
console.log('[qa:criterios] el walker lo consume con --criterios=<ruta>; el panel enseñará la línea del FD.');
