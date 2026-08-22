#!/usr/bin/env tsx
/**
 * run-cost — cierra un run diciendo lo que costó, sin que nadie lo escriba a mano.
 *
 * Post-proceso desacoplado y re-ejecutable (patrón `report`/`heal`): lee el audit-log
 * del workDir, calcula reloj y silencios, opcionalmente añade el desglose de tokens
 * de `token-usage.mjs`, y **funde el bloque `cost` en el run-summary por código**.
 *
 * Ese último punto es deliberado: en el run 3 el orquestador escribió el run-summary
 * a mano con nombres de campo inventados y el consumidor de `heal` lo cazó con
 * `reds: []`. Una sección que se puede calcular no se le pide a un LLM.
 *
 * Uso:
 *   tsx src/scripts/run-cost.ts [--work-dir=.work/<site>] [--no-tokens] [--json]
 *                               [--gap-threshold=60] [--summary=<path>] [--session=<id>]
 * Exit 0 = informe emitido (aunque no haya tokens: su ausencia se declara, no falla).
 * Exit 1 = no hay audit-log que leer.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { computeCost, fmtMs, parseAuditLog, PAUSA_HUMANA_MS, type CostReport } from '../run-cost.ts';

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const has = (n: string): boolean => args.includes(`--${n}`);

const workDir = flag('work-dir') ?? process.env.QA_WORK_DIR ?? '.work';
const auditPath = resolve(workDir, 'audit-log.json');
const summaryPath = resolve(flag('summary') ?? resolve(workDir, 'qa-automator-run-summary.json'));
const gapThreshold = Number(flag('gap-threshold') ?? 60) * 1000;

if (!existsSync(auditPath)) {
  console.error(`[run-cost] no hay audit-log en ${auditPath} — ¿QA_WORK_DIR correcto?`);
  process.exit(1);
}

const { entries, skipped } = parseAuditLog(readFileSync(auditPath, 'utf8'));
const cost: CostReport & { audit_path: string; audit_skipped_lines?: number; tokens?: unknown; tokens_source?: string; tokens_note?: string } = {
  ...computeCost(entries, gapThreshold),
  audit_path: auditPath,
  ...(skipped > 0 ? { audit_skipped_lines: skipped } : {}),
};

/**
 * Los tokens NO son derivables del audit-log: viven en los transcripts de Claude
 * Code, fuera del run. `token-usage.mjs` ya los lee y desglosa por modelo y por
 * subagente, así que aquí solo se invoca. Si falla —sesión no encontrada, ruta de
 * transcripts distinta, run en CI— se DECLARA la ausencia en vez de dejar el campo
 * a cero, que se leería como «gratis».
 */
const sesion = flag('session');
if (!has('no-tokens')) {
  try {
    const sel = sesion ? [sesion] : ['--latest'];
    const out = execFileSync(process.execPath, [resolve('src/scripts/token-usage.mjs'), ...sel, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    cost.tokens = JSON.parse(out);
    /**
     * De QUÉ sesión salen esos tokens, siempre escrito al lado de la cifra. `--latest`
     * es relativo: corriendo esto al cerrar el run desde su workspace acierta, pero en
     * un análisis a posteriori coge la sesión más reciente, que puede ser otra. Una
     * cifra huérfana de su fuente se atribuye mal, y eso es peor que no tenerla.
     */
    cost.tokens_source = sesion ? `sesión ${sesion} (explícita)` : '--latest: la sesión MÁS RECIENTE del proyecto — verifica que es la del run';
  } catch (err) {
    cost.tokens_note =
      `no medidos: ${String(err instanceof Error ? err.message.split('\n')[0] : err)} — ` +
      `los tokens viven en los transcripts de Claude Code, no en el run; correr ` +
      `\`node src/scripts/token-usage.mjs --latest\` a mano si hace falta`;
  }
}

writeFileSync(resolve(workDir, 'run-cost.json'), `${JSON.stringify(cost, null, 2)}\n`, 'utf8');

// funde el bloque en el run-summary si existe: una sección calculable no se teclea
if (existsSync(summaryPath)) {
  try {
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as Record<string, unknown>;
    summary.cost = cost;
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.error(`[run-cost] run-summary ilegible, no se fundió el bloque: ${String(err).split('\n')[0]}`);
  }
}

if (has('json')) {
  console.log(JSON.stringify(cost, null, 2));
  process.exit(0);
}

console.log(`\nCOSTE DEL RUN  —  ${workDir}`);
console.log(`  reloj de pared  : ${fmtMs(cost.wall_ms)}   (${cost.entries} entradas de audit)`);
if (cost.pause_ms > 0) {
  console.log(`  pausas humanas  : ${fmtMs(cost.pause_ms)} en ${cost.pauses.length} tramo(s) — NO es coste del producto`);
}
console.log(`  tiempo ACTIVO   : ${fmtMs(cost.active_ms)}   ← el coste real del run`);
if (cost.subagent_ms > 0) {
  console.log(`  subagentes      : ${fmtMs(cost.subagent_ms)} en ${cost.subagent_gaps.length} tramo(s) — trabajo del producto, NO espera`);
}
console.log(`  esperas >${Math.round(gapThreshold / 1000)}s    : ${fmtMs(cost.gap_ms)}${cost.gap_pct !== null ? `  = ${cost.gap_pct}% del activo` : ''}`);

/**
 * El aviso más importante del informe. Sin marcas `task-start` la línea de esperas
 * incluye el tiempo en que los subagentes estaban TRABAJANDO, y presentarla como
 * «esperas del orquestador» es exactamente la mentira que este informe publicó una vez
 * («95,5% del activo en esperas», siendo el hueco mayor un Writer produciendo).
 */
if (!cost.markers_present) {
  console.log(
    `\n  AVISO: el log no tiene marcas 'task-start', así que la cifra de esperas NO se puede\n` +
      `  atribuir: incluye el tiempo en que los subagentes estaban trabajando. Trátala como techo,\n` +
      `  no como espera muerta. Para medirlo de verdad, el orquestador debe marcar cada Task con\n` +
      `  'tsx src/scripts/audit-mark.ts --task-start=<label>' y '--task-end=<label>'.`,
  );
}
if (cost.tokens) console.log(`  tokens          : ver bloque 'tokens' en run-cost.json  [${cost.tokens_source}]`);
if (cost.tokens_note) console.log(`  tokens          : ${cost.tokens_note}`);

if (cost.gaps.length > 0) {
  console.log(
    cost.markers_present
      ? `\nESPERAS DEL ORQUESTADOR (silencio que NO cubre ningún Task marcado: espera de verdad)`
      : `\nSILENCIOS SIN ATRIBUIR (sin marcas task-start no se sabe si es espera o subagente trabajando)`,
  );
  for (const g of cost.gaps) {
    console.log(`  ${fmtMs(g.ms).padStart(10)}  tras «${g.after}»  →  hasta «${g.before}»`);
  }
}
if (cost.subagent_gaps.length > 0) {
  console.log(`\nTIEMPO DE SUBAGENTE (hueco tras una marca task-start: trabajo, no espera)`);
  for (const g of cost.subagent_gaps) {
    console.log(`  ${fmtMs(g.ms).padStart(10)}  ${g.after}  →  hasta «${g.before}»`);
  }
}
if (cost.pauses.length > 0) {
  console.log(`\nPAUSAS (>${Math.round(PAUSA_HUMANA_MS / 60_000)} min: el run estuvo parado esperando a una persona)`);
  for (const g of cost.pauses) {
    console.log(`  ${fmtMs(g.ms).padStart(10)}  tras «${g.after}»`);
  }
}

console.log(`\nTIEMPO ATRIBUIDO POR ETIQUETA DEL AUDIT (vocabulario del propio log, sin traducir)`);
for (const g of cost.groups.slice(0, 12)) {
  console.log(`  ${fmtMs(g.span_ms).padStart(10)}  ${String(g.entries).padStart(3)} ent.  ${g.label}`);
}
console.log(`\nEscrito ${resolve(workDir, 'run-cost.json')}${existsSync(summaryPath) ? ' (+ bloque cost en el run-summary)' : ''}\n`);
