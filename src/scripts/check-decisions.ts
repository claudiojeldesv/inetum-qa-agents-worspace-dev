#!/usr/bin/env tsx
/**
 * check-decisions — recomputa la cadena del acta de decisiones y dice si alguien la tocó.
 *
 * El acta (`config/decisions/<site>.jsonl`) es donde queda firmada cada decisión del QA
 * sobre el drift entre el FD y la aplicación. Su valor entero depende de que se pueda
 * demostrar que no se ha reescrito: eso es lo que hace este script, y por eso entra en el
 * healthcheck en vez de vivir como una utilidad que alguien recuerda correr.
 *
 * Uso:
 *   tsx src/scripts/check-decisions.ts                      → todas las actas de config/decisions/
 *   tsx src/scripts/check-decisions.ts --site=parabank
 *   tsx src/scripts/check-decisions.ts --file=<path>
 *   ... [--audit=.work/<site>/audit-log.json] [--json] [--vigentes]
 *
 * `--audit` cruza el acta con los hashes que `record-decision` dejó en el audit-log. Es lo
 * único que caza la COLA TRUNCADA: borrar las últimas N entradas deja una cadena
 * impecable —es inherente a un hash chain sin ancla externa— pero deja los hashes
 * huérfanos en el otro fichero. Sin `--audit` no se afirma nada sobre la cola.
 *
 * Exit 0 = cadena coherente (los avisos no bloquean).
 * Exit 2 = manipulación o schema inválido: NO sigas escribiendo encima.
 * Exit 1 = uso incorrecto o no hay nada que verificar donde se pidió.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseAuditLog } from '../run-cost.ts';
import {
  decisionsPathFor,
  effectiveDecisions,
  huerfanosDeAudit,
  parseDecisions,
  verifyChain,
  type ChainIssue,
  type ChainVerdict,
} from '../decisions.ts';

interface ActaVerdict extends ChainVerdict {
  site: string;
  path: string;
  /** Hashes que el audit-log registra y el acta ya no contiene (cola truncada). */
  huerfanos: string[];
}

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const has = (n: string): boolean => args.includes(`--${n}`);

const DIR = resolve(process.cwd(), 'config/decisions');

/** Qué actas hay que mirar: la pedida, la del sitio, o todas las que existan. */
function actasAVerificar(): string[] {
  const file = flag('file');
  if (file) return [resolve(file)];
  const site = flag('site');
  if (site) return [decisionsPathFor(site)];
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .map((f) => resolve(DIR, f));
}

/**
 * Los hashes de decisión que el audit-log conoce. Se lee con el parser TOLERANTE de
 * run-cost por la misma razón que en verify-ack: este fichero pasa por hooks, editores y
 * PowerShell, y un lector estricto lo daría por vacío — lo que aquí produciría un falso
 * "ningún huérfano" y el cruce diría verde sin haber cruzado nada.
 */
function hashesEnAudit(auditPath: string, site: string): string[] {
  if (!existsSync(auditPath)) return [];
  const { entries } = parseAuditLog(readFileSync(auditPath, 'utf8'));
  return entries
    .filter((e) => e.rule === 'decision-recorded' && (!e.target || e.target === `decision:${site}`))
    .map((e) => (typeof e.metadata?.hash === 'string' ? (e.metadata.hash as string) : ''))
    .filter(Boolean);
}

function verificarActa(path: string, auditPath: string | undefined): ActaVerdict {
  const site = basename(path).replace(/\.jsonl$/, '');
  const texto = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const { entries, malformed } = parseDecisions(texto);
  const verdict = verifyChain(entries, malformed);

  let huerfanos: string[] = [];
  if (auditPath) {
    huerfanos = huerfanosDeAudit(entries, hashesEnAudit(auditPath, site));
    for (const h of huerfanos) {
      verdict.issues.push({
        severity: 'error',
        index: -1,
        rule: 'cola-truncada',
        detail:
          `el audit-log registra la decisión ${h} y el acta ya no la contiene: la cola fue truncada. ` +
          `La cadena por sí sola no lo ve (borrar el final siempre deja una cadena válida).`,
      });
      verdict.ok = false;
    }
  }
  return { ...verdict, site, path, huerfanos };
}

function pintarIssue(i: ChainIssue): string {
  return `    ${i.severity === 'error' ? 'ROTO ' : 'aviso'}  [${i.rule}] ${i.detail}`;
}

function main(): void {
  const actas = actasAVerificar();
  const auditPath = flag('audit') ? resolve(flag('audit') as string) : undefined;

  if (actas.length === 0) {
    // Un repo sin actas es el estado normal antes del primer run: no es un fallo.
    if (flag('file') || flag('site')) {
      console.error(`[check-decisions] no existe el acta pedida. Nada que verificar.`);
      process.exit(1);
    }
    if (has('json')) console.log(JSON.stringify({ actas: [], ok: true, reason: 'sin actas' }, null, 2));
    else console.log('check-decisions: no hay actas en config/decisions/ — nada que verificar (estado normal antes del primer run).');
    process.exit(0);
  }

  const verdicts = actas.map((p) => verificarActa(p, auditPath));
  const roto = verdicts.some((v) => !v.ok);

  if (has('json')) {
    console.log(JSON.stringify({ ok: !roto, actas: verdicts }, null, 2));
    process.exit(roto ? 2 : 0);
  }

  console.log('\nACTA DE DECISIONES — verificación de cadena');
  console.log(`  resuelto contra: ${process.cwd()}`);
  if (!auditPath) {
    console.log('  sin --audit: se verifica la cadena, NO la cola (truncar el final no rompe un hash chain).');
  }
  for (const v of verdicts) {
    const marca = v.ok ? '  OK  ' : ' ROTA ';
    console.log(`\n${marca} ${v.site}  — ${v.total} decisión(es), head ${v.head ?? '(vacío)'}`);
    console.log(`        ${v.path}`);
    for (const i of v.issues) console.log(pintarIssue(i));
    if (has('vigentes') && v.total > 0) {
      const { entries } = parseDecisions(readFileSync(v.path, 'utf8'));
      console.log('        vigentes (manda la última por rf+paso):');
      for (const [clave, e] of effectiveDecisions(entries)) {
        const valor = e.valor_nuevo !== undefined ? `  → «${e.valor_nuevo}»` : '';
        console.log(`          ${clave}  ${e.decision} · ${e.evidencia} · ${e.actor}${valor}`);
      }
    }
  }

  if (roto) {
    console.error(
      '\n  EL ACTA FUE ALTERADA. No escribas encima: encadenar sobre una cadena rota la sella y\n' +
        '  vuelve la manipulación indistinguible de una decisión legítima (appendDecision se niega).\n' +
        '  Recupera el fichero del control de versiones o del despliegue anterior, y compara.\n',
    );
    process.exit(2);
  }
  console.log('\n  Cadena coherente.\n');
  process.exit(0);
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('check-decisions.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
