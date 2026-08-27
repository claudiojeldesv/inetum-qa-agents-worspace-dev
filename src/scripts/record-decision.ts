#!/usr/bin/env tsx
/**
 * record-decision — firma una decisión del QA en el acta.
 *
 * El QA mira el drift, decide quién tiene razón —la aplicación o el FD— y esa decisión
 * queda encadenada en `config/decisions/<site>.jsonl` con su autor, su grado de evidencia
 * y la huella del FD y del guion contra los que se tomó.
 *
 * **Registro por FLAGS o por FICHERO DE PENDIENTES, nunca por JSON en línea** (D32:
 * PowerShell 5.1 se come las comillas al pasar argumentos a un ejecutable nativo y el
 * JSON llega destrozado). El panel, que corre en el navegador, escribe pendientes; una
 * persona en una consola usa flags.
 *
 * Uso (flags):
 *   tsx src/scripts/record-decision.ts --site=parabank --rf=RF-004 --paso=transfer/s7 \
 *       --decision=app --valor-nuevo="Transfer Complete!" --evidencia=en-vivo \
 *       --fd=.work/parabank/criteria.json --script=.work/parabank/walk-script.json \
 *       --actor="claudio.jeldes"
 *
 * Uso (pendientes que dejó el panel):
 *   tsx src/scripts/record-decision.ts --site=parabank --pendings=.work/parabank/decisions-pending.jsonl
 *
 * `--actor` puede venir de la variable `QA_ACTOR`. Si no hay ninguna de las dos, no hay
 * decisión: una decisión anónima no es evidencia de nada (fail-closed).
 *
 * Exit 0 = firmada. Exit 2 = rechazada (falta actor, enum inválido, acta con cadena rota).
 * Exit 1 = uso incorrecto.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { anclarDecisionEnAudit } from '../decisions-audit.ts';
import {
  appendDecision,
  claveDecision,
  decisionsPathFor,
  effectiveDecisions,
  hashJson,
  hashText,
  normalizeActor,
  parseDecisions,
  type DecisionEntry,
  type DecisionInput,
  type DecisionKind,
  type EvidenceGrade,
} from '../decisions.ts';

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const has = (n: string): boolean => args.includes(`--${n}`);

const USO =
  '[record-decision] uso:\n' +
  '  --site=<id> --rf=RF-NNN --paso=<flujo>/<paso> --decision=app|fd|defer --evidencia=desde-cero|en-vivo|sin-verificar\n' +
  '  --fd=<path>|--fd-hash=<hex>   --script=<path>|--script-hash=<hex>   [--actor=<nombre> | QA_ACTOR]\n' +
  '  [--valor-nuevo=<texto> | --valor-nuevo-file=<path>] [--supersedes=<hash> | --supersede-vigente]\n' +
  '  o bien:  --site=<id> --pendings=<path-jsonl>\n' +
  '  NUNCA pases la decisión como JSON en línea: PowerShell 5.1 la destroza (D32).';

/**
 * Huella de un artefacto de entrada. Si es JSON parseable se hashea el objeto (mismo
 * algoritmo que `hashScript`, así que el `script_hash` de un walk-script coincide con el
 * que calcula el walker); si no, el texto crudo — un FD en markdown no es JSON.
 */
function huellaDeFichero(path: string): string {
  const abs = resolve(path);
  if (!existsSync(abs)) throw new Error(`no existe ${abs}`);
  const texto = readFileSync(abs, 'utf8');
  try {
    return hashJson(JSON.parse(texto.replace(/^\uFEFF/, '')));
  } catch {
    return hashText(texto);
  }
}

function resolverHuella(nombre: 'fd' | 'script'): string {
  const directa = flag(`${nombre}-hash`);
  if (directa && directa.trim()) return directa.trim();
  const path = flag(nombre);
  if (path) return huellaDeFichero(path);
  throw new Error(`falta --${nombre}=<path> o --${nombre}-hash=<hex>: sin huella la decisión no dice contra QUÉ se decidió`);
}

/** El valor que el QA adopta. Por fichero cuando el literal lleva comillas o saltos. */
function resolverValorNuevo(): string | undefined {
  const file = flag('valor-nuevo-file');
  if (file) {
    const abs = resolve(file);
    if (!existsSync(abs)) throw new Error(`no existe ${abs}`);
    // Sin trim del interior: el literal se busca TAL CUAL en la página. Solo el
    // salto de línea final que añade cualquier editor.
    return readFileSync(abs, 'utf8').replace(/\r?\n$/, '');
  }
  return flag('valor-nuevo');
}

/** Lo que el panel dejó pendiente. Mismos campos, sin `hash` ni `timestamp`. */
type Pendiente = Partial<DecisionInput> & { rf?: string; paso?: string };

function leerPendientes(path: string): Pendiente[] {
  const abs = resolve(path);
  if (!existsSync(abs)) throw new Error(`no existe el fichero de pendientes ${abs}`);
  const out: Pendiente[] = [];
  for (const [i, cruda] of readFileSync(abs, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const linea = cruda.trim();
    if (!linea) continue;
    try {
      out.push(JSON.parse(linea) as Pendiente);
    } catch (err) {
      throw new Error(`línea ${i + 1} de ${abs} ilegible: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

/**
 * Vacía el pendiente ya firmado dejando los que quedan. Se reescribe DESPUÉS de cada
 * append, no al final: si el proceso muere a mitad, lo firmado no vuelve a firmarse.
 */
function reescribirPendientes(path: string, restantes: Pendiente[]): void {
  writeFileSync(resolve(path), restantes.map((p) => JSON.stringify(p)).join('\n') + (restantes.length ? '\n' : ''), 'utf8');
}


function main(): void {
  const site = flag('site');
  const actaPath = flag('file') ? resolve(flag('file') as string) : site ? decisionsPathFor(site) : null;
  if (!actaPath || !site) {
    console.error(USO);
    process.exit(1);
  }

  const actor = normalizeActor(flag('actor') ?? process.env.QA_ACTOR);
  if (!actor) {
    console.error(
      '[record-decision] SIN ACTOR: no hay decisión.\n' +
        '  Declara --actor=<nombre> o la variable QA_ACTOR. Una decisión anónima no es evidencia\n' +
        '  de nada, y el acta existe justamente para que cada cambio del plan tenga responsable.',
    );
    process.exit(2);
  }

  const workDir = flag('work-dir') ?? process.env.QA_WORK_DIR ?? `.work/${site}`;
  const auditPath = flag('audit') ? resolve(flag('audit') as string) : resolve(workDir, 'audit-log.json');

  const pendingsPath = flag('pendings');
  const firmadas: DecisionEntry[] = [];

  try {
    if (pendingsPath) {
      let restantes = leerPendientes(pendingsPath);
      if (restantes.length === 0) {
        console.log('[record-decision] el fichero de pendientes está vacío — nada que firmar.');
        process.exit(0);
      }
      while (restantes.length > 0) {
        const p = restantes[0];
        const { entry } = appendDecision(
          {
            rf: String(p.rf ?? ''),
            paso: String(p.paso ?? ''),
            decision: p.decision as DecisionKind,
            ...(p.valor_nuevo !== undefined ? { valor_nuevo: String(p.valor_nuevo) } : {}),
            fd_hash: String(p.fd_hash ?? ''),
            script_hash: String(p.script_hash ?? ''),
            evidencia: p.evidencia as EvidenceGrade,
            // El actor del pendiente manda (lo grabó quien decidió); el de la consola
            // solo cubre al panel que no lo supo. Nunca al revés: no se reasigna autoría.
            actor: normalizeActor(p.actor) ?? actor,
            ...(p.timestamp ? { timestamp: String(p.timestamp) } : {}),
            ...(p.supersedes !== undefined ? { supersedes: String(p.supersedes) } : {}),
          },
          actaPath,
        );
        firmadas.push(entry);
        anclarDecisionEnAudit(entry, site, auditPath);
        restantes = restantes.slice(1);
        reescribirPendientes(pendingsPath, restantes);
      }
    } else {
      const rf = flag('rf');
      const paso = flag('paso');
      const decision = flag('decision') as DecisionKind | undefined;
      const evidencia = flag('evidencia') as EvidenceGrade | undefined;
      if (!rf || !paso || !decision || !evidencia) {
        console.error(USO);
        process.exit(1);
      }

      let supersedes = flag('supersedes');
      if (!supersedes && has('supersede-vigente')) {
        const previas = existsSync(actaPath) ? parseDecisions(readFileSync(actaPath, 'utf8')).entries : [];
        const vigente = effectiveDecisions(previas).get(claveDecision(rf, paso));
        if (!vigente) {
          console.error(`[record-decision] --supersede-vigente pero no hay decisión previa para ${rf} · ${paso}. Quita el flag.`);
          process.exit(2);
        }
        supersedes = vigente.hash;
      }

      const valorNuevo = resolverValorNuevo();
      const { entry } = appendDecision(
        {
          rf,
          paso,
          decision,
          ...(valorNuevo !== undefined ? { valor_nuevo: valorNuevo } : {}),
          fd_hash: resolverHuella('fd'),
          script_hash: resolverHuella('script'),
          evidencia,
          actor,
          ...(supersedes !== undefined ? { supersedes } : {}),
        },
        actaPath,
      );
      firmadas.push(entry);
      anclarDecisionEnAudit(entry, site, auditPath);
    }
  } catch (err) {
    console.error(`[record-decision] RECHAZADA: ${err instanceof Error ? err.message : String(err)}`);
    if (firmadas.length > 0) console.error(`  ${firmadas.length} decisión(es) sí quedaron firmadas antes del fallo.`);
    process.exit(2);
  }

  if (has('json')) {
    console.log(JSON.stringify({ ok: true, acta: actaPath, firmadas }, null, 2));
    process.exit(0);
  }
  console.log(`\nACTA — ${site}   ${actaPath}`);
  for (const e of firmadas) {
    const valor = e.valor_nuevo !== undefined ? `  → «${e.valor_nuevo}»` : '';
    console.log(`  firmada  ${e.rf} · ${e.paso}  ${e.decision} · ${e.evidencia} · ${e.actor}${valor}`);
    console.log(`           hash ${e.hash}${e.supersedes ? `  (revoca ${e.supersedes})` : ''}`);
  }
  console.log(`\n  Anclada en el audit-log: ${auditPath}`);
  console.log(`  Verifica cuando quieras: tsx src/scripts/check-decisions.ts --site=${site} --audit=${auditPath}\n`);
  process.exit(0);
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('record-decision.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
