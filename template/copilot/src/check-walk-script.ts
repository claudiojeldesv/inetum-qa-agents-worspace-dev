/**
 * K0.43 — validador del walk-script AL EMITIRLO.
 *
 * `validateWalkScript` (walk-core) ya existía y es buena, pero solo corría en el
 * CONSUMIDOR: el walker la ejecuta al cargar el guion, o sea cuando el navegador
 * ya está arrancando. Medido en el primer run de campo del plugin (ParaBank, S3):
 * el refiner emitió un guion con 26 errores de esquema, el fallo apareció al
 * lanzar el walker, y recuperarse costó extraer el contrato de tipos a mano para
 * devolvérselo al subagente. Eso pasaría en CADA run de S3.
 *
 * El propio producto ya resuelve esta clase en otro sitio y es lo que el QA
 * señaló como lo mejor del run: `/setup` emite el Style Contract y lo pasa por
 * `src/contract-validator.ts` ANTES de darlo por bueno. Mismo patrón, un
 * consumidor lo tenía y el otro no.
 *
 * Por qué es un CLI y no una llamada del propio refiner: `ia4d-spec-refiner`
 * tiene `tools: Read, Write, Glob` — no puede ejecutar nada, y ampliarle el radio
 * para esto rompería su frontera. La orquestación vive en los commands, que sí
 * ejecutan scripts deterministas (misma forma que check-compliance / verify-a11y
 * / verify-locators).
 *
 * Al fallar imprime el ESQUELETO CANÓNICO además de los errores. Sin eso, el
 * command tendría que reconstruir el contrato de tipos para el reintento — que es
 * justo el trabajo manual que este script existe para eliminar.
 *
 * Exit: 0 válido · 2 inválido (convención del gate: 0 allow / 2 block) · 1 uso/IO.
 */

import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
// parseJsonLoose y no JSON.parse: es EXACTAMENTE lo que usa el walker al cargar el
// guion (dom-walker), y un validador más estricto que su consumidor bloquearía un
// guion perfectamente ejecutable — la enfermedad de D1 al revés. El BOM importa de
// verdad aquí: el walk-script es artefacto del cliente y se afina A MANO (K0.20),
// así que pasa por editores y por PowerShell, que lo escriben con BOM.
import { validateWalkScript, parseJsonLoose } from './walk-core.ts';

export const EXIT_VALID = 0;
export const EXIT_IO = 1;
export const EXIT_INVALID = 2;

/**
 * El contrato mínimo de `WalkScript`, en el mismo vocabulario que emite el
 * refiner. No duplica la validación (esa vive en walk-core, fuente única): es
 * material de reintento, para que el command devuelva el esquema REAL en vez de
 * una reconstrucción.
 */
export const CANONICAL_SKELETON = `{
  "version": 1,                       // literal 1
  "site_id": "<site-id>",             // el mismo del workDir
  "entry": "/ruta/inicial",           // path inicial, NO una URL completa
  "flows": [
    {
      "flow": "login",                // el nombre del flujo va en 'flow' (NO en 'id')
      "criteria": ["RF-001"],         // los RF-NNN van en 'criteria' (NO en 'criterion_refs')
      "steps": [
        { "id": "s1", "action": "goto", "target": "/parabank/index.htm" },
        { "id": "s2", "action": "fill",  "hint": { "label": "Username" }, "value": "john" },
        { "id": "s3", "action": "click", "hint": { "role": "button", "name": "Log In" },
          "expect_transition": true },
        { "id": "s4", "action": "expect_text", "value": "Accounts Overview" }
      ]
    }
  ]
}`;

const RULES = [
  "cada paso necesita 'id' único dentro de su flujo ('s1', 's2', ...)",
  "'goto' y 'wait_url' llevan la ruta en 'target'; 'hint' es para elementos, no para URLs",
  "fill/select/press/wait_text/expect_text/expect_state/expect_value/expect_count necesitan 'value'",
  "fill/click/hover/select/check/uncheck/expect_state/expect_value/expect_count/expect_each necesitan 'hint'",
  "'hint' solo admite test_id | role | name | label | text — nunca id, clase, xpath ni posición",
  "'expect_state' exige value ∈ visible|enabled|disabled|checked|unchecked",
];

export interface CheckResult {
  ok: boolean;
  errors: string[];
  /** Fallo de lectura/parseo: no es un guion inválido, es un fichero ilegible. */
  ioError?: string;
}

/** Puro: separa "no se pudo leer" de "se leyó y está mal". El command actúa distinto en cada caso. */
export function checkWalkScriptFile(path: string): CheckResult {
  if (!existsSync(path)) return { ok: false, errors: [], ioError: `no existe: ${path}` };
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    return { ok: false, errors: [], ioError: `no se pudo leer: ${(e as Error).message}` };
  }
  let parsed: unknown;
  try {
    parsed = parseJsonLoose(raw);
  } catch (e) {
    return { ok: false, errors: [], ioError: `JSON inválido: ${(e as Error).message}` };
  }
  const { ok, errors } = validateWalkScript(parsed);
  return { ok, errors };
}

export function formatReport(path: string, res: CheckResult): string {
  if (res.ioError) return `walk-script ILEGIBLE — ${path}\n  ${res.ioError}`;
  if (res.ok) return `walk-script VÁLIDO — ${path}`;
  const lines = [
    `walk-script INVÁLIDO — ${path}`,
    `${res.errors.length} error(es) de esquema:`,
    ...res.errors.map((e, i) => `  ${String(i + 1).padStart(2)}. ${e}`),
    '',
    'Esquema real (copilot/src/walk-types.ts, fuente única):',
    ...CANONICAL_SKELETON.split('\n').map((l) => `  ${l}`),
    '',
    'Reglas que más se incumplen:',
    ...RULES.map((r) => `  - ${r}`),
  ];
  return lines.join('\n');
}

function main(argv: string[]): number {
  const path = argv.find((a) => !a.startsWith('--'));
  if (!path) {
    console.error('uso: check-walk-script.ts <walk-script.json>');
    return EXIT_IO;
  }
  const res = checkWalkScriptFile(path);
  const out = formatReport(path, res);
  if (res.ok) {
    console.log(out);
    return EXIT_VALID;
  }
  console.error(out);
  return res.ioError ? EXIT_IO : EXIT_INVALID;
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('check-walk-script.ts') || import.meta.url === pathToFileURL(invoked).href) {
  process.exit(main(process.argv.slice(2)));
}
