#!/usr/bin/env node
/**
 * PostToolUse (Write|Edit) — deja rastro en el audit-log de CADA fichero escrito.
 *
 * Existe por D30, medido en tres runs de campo y confirmado con instrucción explícita
 * delante: los subagentes registran el fichero principal de su tarea y **no** los demás
 * que tocan. En el run del 2026-08-21 los Writers auditaron su `.spec.ts` y dejaron sin
 * rastro los POM que editaron; `verify-ack` los reportó como `s/rastro` seis veces. En el
 * re-run, con la orden «una entrada por CADA fichero que toques» escrita en el prompt,
 * volvió a pasar. La prosa no basta: la trazabilidad tiene que ser mecánica.
 *
 * Es la contrapartida de `pii-post.ts`, que ya corre en este mismo evento. El hook
 * hermano `audit-write.ts` NO hace esto pese al nombre: cierra la sesión con un resumen.
 *
 * Nunca bloquea. Un fallo registrando no puede tumbar un run que por lo demás va bien:
 * exit 0 siempre.
 */
import { appendAuditEntry } from '../src/audit-log.ts';

interface HookPayload {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

/** El log del sitio en curso. Sin la var, el de siempre. */
function logPath(): string {
  return `${process.env.QA_WORK_DIR || '.work'}/audit-log.json`;
}

/**
 * Artefactos de EVIDENCIA: los produce una etapa y las siguientes los consumen. Que
 * alguien los reescriba es un hecho que hay que poder ver.
 *
 * D38, medido el 2026-08-21: dos de tres Writers editaron `discovery-report.json` para
 * poder satisfacer un gate que era un falso positivo (D37). Citaron el plan y lo
 * declararon, pero un Writer no debe mutar la evidencia sobre la que se le juzga — y con
 * el filtro anterior, que descartaba todo `.work/`, esas escrituras no dejaban rastro
 * ninguno. Se registran con su propia `rule` para que el rastro las distinga.
 */
const EVIDENCIA = [
  'discovery-report.json',
  'criteria.json',
  'walk-script.json',
  'dom-map.json',
  'drift-report.json',
  'refinement-questions.md',
];

function esEvidencia(n: string): boolean {
  return EVIDENCIA.some((e) => n.endsWith(`/${e}`) || n === e);
}

/**
 * Ruido de verdad: dependencias, el propio audit-log (se auto-registraría en bucle) y los
 * subproductos de ejecución. El resto de `.work/` es efímero y tampoco interesa, PERO los
 * artefactos de evidencia de arriba se registran aunque vivan ahí.
 */
function esRuido(p: string): boolean {
  const n = p.replace(/\\/g, '/');
  if (esEvidencia(n)) return false;
  // ojo con la barra inicial: 'node_modules/x' NO contiene '/node_modules/'. Se comprueban
  // las dos formas — el test de ruido cazo justo esa (una de tres escrituras se colo).
  const enSegmento = (seg: string): boolean => n.includes(`/${seg}/`) || n.startsWith(`${seg}/`);
  return enSegmento('.work') || enSegmento('node_modules') || n.endsWith('audit-log.json');
}

async function main(): Promise<void> {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;

  let payload: HookPayload;
  try {
    payload = JSON.parse(raw) as HookPayload;
  } catch {
    return; // payload ilegible: no se inventa una entrada
  }

  const fp = payload.tool_input?.file_path;
  if (typeof fp !== 'string' || !fp || esRuido(fp)) return;

  appendAuditEntry(
    {
      source: 'audit-write',
      action: payload.tool_name === 'Edit' ? 'edit_file' : 'write_file',
      target: fp,
      rule: esEvidencia(fp.replace(/\\/g, '/')) ? 'evidence-write' : 'file-write-hook',
      reason: esEvidencia(fp.replace(/\\/g, '/'))
        ? 'escritura sobre un artefacto de EVIDENCIA (D38): quien lo consume se fia de el, revisa quien lo toco'
        : 'rastro automático de escritura (D30: los subagentes no registran todo lo que tocan)',
      result: 'pass',
    },
    logPath(),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`[audit-file-write] ${err}\n`);
    process.exit(0);
  });
