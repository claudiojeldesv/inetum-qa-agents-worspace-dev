#!/usr/bin/env tsx
/**
 * verify-ack — una llamada de Bash que dice si el acuse de un subagente era cierto.
 *
 * El orquestador recibe `{"ok":true,"files":[...]}` (palanca 2) y lo pasa por aquí
 * ANTES de darlo por hecho. Coste: un subproceso, cero contexto, cero tokens de LLM.
 * Sin esto, D28 salió a la luz tres actos más tarde y costó una reanudación de Writer.
 *
 * Uso:
 *   tsx src/scripts/verify-ack.ts --files=a.spec.ts,b.page.ts [--label=writer-TC-002]
 *   tsx src/scripts/verify-ack.ts --ack-file=<path-con-el-json-del-subagente>
 *   tsx src/scripts/verify-ack.ts --ack='{"ok":true,"files":["x.ts"]}'
 *
 * `--files` es la forma recomendada desde un orquestador en Windows: no hay JSON que
 * escapar en PowerShell. `--ack`/`--ack-file` aceptan el acuse literal, con prosa
 * alrededor incluida.
 *
 * Exit 0 = el acuse dice la verdad (aunque falte rastro en el audit: se avisa).
 * Exit 2 = el acuse MIENTE: algo declarado no existe o está vacío. No sigas.
 * Exit 1 = no había nada que verificar (uso incorrecto).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { appendAuditEntry } from '../audit-log.ts';
import { parseAuditLog } from '../run-cost.ts';
import { parseAck, verifyAck, type SubagentAck } from '../verify-ack.ts';

const args = process.argv.slice(2);
const flag = (n: string): string | undefined =>
  args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const has = (n: string): boolean => args.includes(`--${n}`);

const workDir = flag('work-dir') ?? process.env.QA_WORK_DIR ?? '.work';
const label = flag('label') ?? 'subagente';
const minBytes = Number(flag('min-bytes') ?? 1);

/** El acuse, por cualquiera de las tres vías. `--files` gana: es la menos frágil. */
function leerAck(): SubagentAck | null {
  const files = flag('files');
  if (files) {
    const lista = files.split(',').map((f) => f.trim()).filter(Boolean);
    if (lista.length > 0) return { files: lista };
  }
  const ackFile = flag('ack-file');
  if (ackFile && existsSync(resolve(ackFile))) {
    return parseAck(readFileSync(resolve(ackFile), 'utf8'));
  }
  const inline = flag('ack');
  if (inline) return parseAck(inline);
  return null;
}

const ack = leerAck();
if (!ack || ack.files.length === 0) {
  console.error(
    '[verify-ack] nada que verificar. Uso: --files=a.ts,b.ts | --ack-file=<path> | --ack=<json>\n' +
      '            Si el subagente no declaró ficheros, su acuse no es verificable: trátalo como fallo.\n' +
      '            EN POWERSHELL 5.1: --ack con JSON en línea NO funciona (la shell se come las comillas\n' +
      '            dobles al pasar argumentos a un ejecutable nativo, medido). Usa --files o --ack-file.',
  );
  process.exit(1);
}

/**
 * Los `target` que el audit-log ya registró. Se leen con el parser TOLERANTE de
 * run-cost (JSONL, array, BOM) por la misma razón que existe allí: este fichero pasa
 * por hooks, editores y PowerShell, y un lector estricto se lo comería como vacío —
 * lo que aquí produciría un falso "sin rastro en el audit" para TODO.
 */
const auditPath = resolve(workDir, 'audit-log.json');
let auditTargets: string[] = [];
let auditLegible = false;
if (existsSync(auditPath)) {
  const { entries } = parseAuditLog(readFileSync(auditPath, 'utf8'));
  auditTargets = entries.map((e) => e.target).filter((t): t is string => typeof t === 'string');
  auditLegible = true;
}

const verdict = verifyAck(
  ack,
  (file) => {
    const abs = resolve(file);
    if (!existsSync(abs)) return { exists: false, bytes: 0, resolved: abs };
    try {
      return { exists: true, bytes: statSync(abs).size, resolved: abs };
    } catch {
      return { exists: false, bytes: 0, resolved: abs };
    }
  },
  auditTargets,
  minBytes,
);

appendAuditEntry(
  {
    source: 'command',
    action: verdict.truthful ? (verdict.untraced.length > 0 ? 'warn' : 'allow') : 'block',
    target: label,
    rule: 'ack-verification',
    reason: verdict.truthful
      ? verdict.untraced.length > 0
        ? `acuse cierto (${verdict.claimed} fichero(s)); ${verdict.untraced.length} sin entrada en el audit`
        : `acuse cierto: ${verdict.claimed} fichero(s) en disco y auditados`
      : `ACUSE FALSO: ${verdict.liars.join(', ')}`,
    result: verdict.truthful ? 'pass' : 'fail',
    metadata: { claimed: verdict.claimed, liars: verdict.liars, untraced: verdict.untraced },
  },
  auditPath,
);

if (has('json')) {
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(verdict.exit);
}

console.log(`\nVERIFICACIÓN DE ACUSE — ${label}   (${verdict.claimed} fichero(s) declarado(s))`);
/**
 * El cwd se imprime SIEMPRE porque los acuses llegan en rutas relativas: correr esto
 * desde el directorio equivocado verifica un fichero distinto con la misma ruta y
 * anuncia «verificado». Paso en el smoke test de esta herramienta.
 */
console.log(`  resuelto contra: ${process.cwd()}`);
for (const f of verdict.files) {
  const marca = f.problem ? 'FALSO ' : f.audited ? '  ok   ' : ' s/rastro';
  console.log(`  ${marca}  ${f.file}${f.problem ? `  ← ${f.problem}` : `  (${f.bytes} bytes)`}`);
}
if (verdict.self_reported_failure) {
  console.log(`\n  El subagente declaró ok:false — fallo declarado, no mentira. Lee su nota antes de reintentar.`);
}
if (!auditLegible) {
  console.log(`\n  Sin audit-log en ${auditPath}: la columna de rastro no aplica (no se inventa un fallo de trazabilidad).`);
} else if (verdict.untraced.length > 0) {
  console.log(
    `\n  ${verdict.untraced.length} fichero(s) sin entrada en el audit — el trabajo está hecho pero no queda rastro (clase D30).\n` +
      `  No bloquea: abortar el run no arregla una laguna de trazabilidad.`,
  );
}
if (!verdict.truthful) {
  console.log(
    `\n  EL ACUSE MIENTE. No sigas: reanuda al subagente con el hecho («declaraste X, no existe»)\n` +
      `  y exígele Read-after-Write. Es la clase D28 y sale tres actos más tarde si se ignora.\n`,
  );
} else {
  console.log(`\n  Acuse verificado.\n`);
}
process.exit(verdict.exit);
