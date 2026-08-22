#!/usr/bin/env tsx
/**
 * audit-mark — escribe UNA entrada de audit bien formada, sin que nadie teclee JSON.
 *
 * Dos motivos, los dos medidos:
 *
 * 1. **Una sección que se puede calcular no se le pide a un LLM.** En el run 3 el
 *    orquestador escribió el run-summary a mano con nombres de campo inventados y el
 *    consumidor de `heal` lo cazó con `reds: []`. Los commands llevan doce «registra al
 *    audit-log» y ninguna forma mecánica de hacerlo: esta es.
 *
 * 2. **Sin marcas alrededor de los `Task`, el reloj del run no se puede atribuir.** El
 *    audit-log solo se escribe cuando alguien toca un fichero, así que un hueco de 14 min
 *    entre dos entradas es indistinguible de un orquestador ocioso y de un subagente
 *    trabajando. `run-cost` los etiquetó todos como «espera del orquestador» y produjo un
 *    «95,5% del activo en esperas» que hubo que retirar. Con `--task-start` / `--task-end`
 *    el hueco se atribuye a quien lo consumió, y sale gratis el reloj por subagente.
 *
 * Uso:
 *   tsx src/scripts/audit-mark.ts --task-start=writer-TC-002 [--target=<path>]
 *   tsx src/scripts/audit-mark.ts --task-end=writer-TC-002 [--result=pass]
 *   tsx src/scripts/audit-mark.ts --action=drift_detected --rule=drift --reason="..." --meta-rfs=3
 *
 * `--meta-<clave>=<valor>` añade metadata (los numéricos se convierten). Exit 0 siempre:
 * un fallo al registrar no debe tumbar un run que por lo demás va bien — se avisa por stderr.
 */
import { appendAuditEntry, type AuditAction, type AuditResult, type AuditSource } from '../audit-log.ts';

const args = process.argv.slice(2);
const flag = (n: string): string | undefined =>
  args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');

const ACCIONES = new Set<string>([
  'invoke', 'block', 'warn', 'allow', 'skip', 'exploration_brief', 'scenario_selection',
  'write_file', 'edit_file', 'read_file', 'archive_file', 'judge_decision', 'review_decision', 'llm_call',
]);

const inicio = flag('task-start');
const fin = flag('task-end');

/**
 * Las marcas de `Task` usan acciones que ya existen en el vocabulario (`invoke` / `allow`)
 * y se distinguen por `rule`. Deliberado: `run-cost` agrupa por `rule`, así que no hace
 * falta ampliar el union de acciones ni tocar a ningún otro consumidor.
 */
let action: string | undefined = flag('action');
let rule: string | undefined = flag('rule');
let target: string | undefined = flag('target');

if (inicio) {
  action = 'invoke';
  rule = 'task-start';
  target = target ?? inicio;
} else if (fin) {
  action = 'allow';
  rule = 'task-end';
  target = target ?? fin;
}

if (!action) {
  console.error(
    '[audit-mark] falta --action (o --task-start / --task-end).\n' +
      `            acciones válidas: ${[...ACCIONES].join(', ')}`,
  );
  process.exit(1);
}
if (!ACCIONES.has(action)) {
  console.error(`[audit-mark] acción desconocida '${action}'. Válidas: ${[...ACCIONES].join(', ')}`);
  process.exit(1);
}

const metadata: Record<string, unknown> = {};
for (const a of args) {
  const m = /^--meta-([^=]+)=(.*)$/.exec(a);
  if (!m) continue;
  const valor = m[2];
  metadata[m[1]] = valor !== '' && Number.isFinite(Number(valor)) ? Number(valor) : valor;
}

try {
  const entry = appendAuditEntry({
    source: (flag('source') as AuditSource) ?? 'command',
    action: action as AuditAction,
    ...(target ? { target } : {}),
    ...(rule ? { rule } : {}),
    ...(flag('reason') ? { reason: flag('reason') } : {}),
    ...(flag('result') ? { result: flag('result') as AuditResult } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  });
  console.log(`[audit-mark] ${entry.timestamp}  ${entry.rule ?? entry.action}${entry.target ? `  ${entry.target}` : ''}`);
} catch (err) {
  // registrar es instrumentación: si falla, se avisa y el run sigue
  console.error(`[audit-mark] no se pudo registrar: ${String(err instanceof Error ? err.message : err)}`);
}
