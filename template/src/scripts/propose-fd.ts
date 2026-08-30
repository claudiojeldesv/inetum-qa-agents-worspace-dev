/**
 * Fase C — CLI de la propuesta de FD corregido.
 *
 *   npm run qa:propuesta -- --fd=<fd.md> --script=<walk-script.json> [--site=<id>]
 *     [--decisions=<acta.jsonl>] [--original=<walk-script.original.json>] [--out=<ruta>]
 *
 * Todo el I/O vive aquí; las reglas viven en `src/fd-proposal.ts` (puras, con
 * sus tests). Cerrojos ANTES de escribir nada, el mismo principio que la fusión:
 *
 *  - acta con la cadena rota → exit 2 y CERO bytes: una propuesta derivada de un
 *    acta manipulada heredaría la manipulación con cara de documento limpio;
 *  - la salida JAMÁS es el FD del cliente (ni con --out apuntándolo a propósito);
 *  - sin decisiones que digan nada de este caso, no se fabrica un fichero vacío.
 *
 * Exit: 0 propuesta escrita (o nada que proponer, dicho) · 1 uso/IO · 2 acta rota.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  decisionsPathFor,
  effectiveDecisions,
  huellaDeArtefacto,
  parseDecisions,
  verifyChain,
} from '../decisions.ts';
import { aplicarAlTexto, derivarCambios, renderPropuesta } from '../fd-proposal.ts';
import type { GuionMinimo } from '../fd-proposal.ts';

const EXIT_OK = 0;
const EXIT_USO = 1;
const EXIT_ACTA = 2;

function leerJson<T>(path: string): T {
  // BOM de PowerShell/editores: mismo trato que el resto de lectores del repo
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as T;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      fd: { type: 'string' },
      script: { type: 'string' },
      site: { type: 'string' },
      decisions: { type: 'string' },
      original: { type: 'string' },
      out: { type: 'string' },
    },
  });

  if (!values.fd || !values.script) {
    console.error(
      'Uso: tsx src/scripts/propose-fd.ts --fd=<fd.md> --script=<walk-script.json> ' +
        '[--site=<id>] [--decisions=<acta.jsonl>] [--original=<original.json>] [--out=<ruta>]',
    );
    return EXIT_USO;
  }

  const fdPath = resolve(values.fd);
  const scriptPath = resolve(values.script);
  if (!existsSync(fdPath) || !existsSync(scriptPath)) {
    console.error(`[propuesta] no existe: ${!existsSync(fdPath) ? fdPath : scriptPath}`);
    return EXIT_USO;
  }
  const guion = leerJson<GuionMinimo>(scriptPath);
  const site = values.site ?? guion.site_id;
  if (!site) {
    console.error('[propuesta] el guion no declara site_id y no hay --site');
    return EXIT_USO;
  }

  const actaPath = resolve(values.decisions ?? decisionsPathFor(site));
  if (!existsSync(actaPath)) {
    console.error(`[propuesta] no hay acta en ${actaPath} — sin decisiones firmadas no hay nada que proponer`);
    return EXIT_USO;
  }
  const parsed = parseDecisions(readFileSync(actaPath, 'utf8'));
  const cadena = verifyChain(parsed.entries, parsed.malformed);
  if (!cadena.ok) {
    console.error('[propuesta] EL ACTA TIENE LA CADENA ROTA — no se deriva nada de un acta manipulada.');
    console.error('            Verifica con: npm run qa:decisions -- --site=' + site);
    return EXIT_ACTA;
  }

  // el original anclado: default el de la fusión, si existe; sin él, los cambios
  // de elemento se apartan con su motivo (la propuesta lo dice, no lo esconde)
  const originalPath = resolve(values.original ?? `config/baselines/${site}/walk-script.original.json`);
  const original = existsSync(originalPath) ? leerJson<GuionMinimo>(originalPath) : undefined;

  const huellaFd = huellaDeArtefacto(fdPath);
  const vigentes = [...effectiveDecisions(parsed.entries).values()];
  const derivacion = derivarCambios(vigentes, guion, original, huellaFd);
  const aplicacion = aplicarAlTexto(readFileSync(fdPath, 'utf8'), derivacion.cambios);

  const outPath = resolve(values.out ?? `${fdPath}.propuesta.md`);
  if (outPath === fdPath) {
    console.error('[propuesta] la salida NO puede ser el FD del cliente. Ese documento no se toca.');
    return EXIT_USO;
  }

  const hay = aplicacion.aplicados.length + aplicacion.no_ubicables.length + derivacion.sostenidos.length + derivacion.apartadas.length;
  if (hay === 0) {
    console.log(
      `[propuesta] nada que proponer para ${basename(fdPath)}: ` +
        `${derivacion.sin_decidir} sin decidir (defer), ${derivacion.fuera_del_guion} de otros casos. No se escribe fichero.`,
    );
    return EXIT_OK;
  }

  const texto = renderPropuesta(aplicacion, derivacion, {
    site,
    fd_nombre: basename(fdPath),
    huella_fd: huellaFd,
    cabeza_acta: parsed.entries.length ? parsed.entries[parsed.entries.length - 1].hash : '(acta vacía)',
    acta_ruta: actaPath,
  });
  writeFileSync(outPath, texto, 'utf8');

  console.log(`[propuesta] escrita → ${outPath}`);
  console.log(
    `  ${aplicacion.aplicados.length} cambio(s) aplicados · ${derivacion.sostenidos.length} criterio(s) sostenidos · ` +
      `${aplicacion.no_ubicables.length} no ubicable(s) · ${derivacion.apartadas.length} apartada(s) · ` +
      `${derivacion.sin_decidir} sin decidir (no aparecen) · ${derivacion.fuera_del_guion} de otros casos`,
  );
  for (const c of aplicacion.aplicados) {
    console.log(`  ✎ ${c.paso}: «${c.de}» → «${c.a}»${c.avisos.length ? '  ⚠ ' + c.avisos[0] : ''}`);
  }
  for (const c of aplicacion.no_ubicables) console.log(`  ✗ ${c.paso}: ${c.motivo}`);
  return EXIT_OK;
}

const invocado = process.argv[1] || '';
if (invocado.endsWith('propose-fd.ts')) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`[propuesta] error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(EXIT_USO);
    },
  );
}
