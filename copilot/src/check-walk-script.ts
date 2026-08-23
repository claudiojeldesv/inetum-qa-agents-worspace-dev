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
import { parse as parseYaml } from 'yaml';
import { validateWalkScript, parseJsonLoose } from './walk-core.ts';
import type { WalkFlow } from './walk-types.ts';

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
  'con auth.enabled, cada flujo repite su propio login: el walker reinicia la sesión entre flujos',
];

/**
 * D44 — coherencia con `auth.enabled`: todo flujo tiene que ser AUTOCONTENIDO.
 *
 * Medido en la iteración 2 del loop de OrangeHRM (2026-08-22). Mismo FD, mismo
 * prompt, mismo refiner que la iteración 1, y salió un guion distinto: la 1 repetía
 * el login dentro de cada flujo, la 2 lo puso solo en el primero y arrancó los otros
 * dos con `click PIM` dando por hecha la sesión. El esquema lo daba por VÁLIDO —
 * lo es— y el fallo apareció con el navegador ya arrancado, en el segundo flujo,
 * como «hint irresoluble»: un diagnóstico que manda a mirar el hint cuando lo que
 * pasa es que la pantalla es la de login.
 *
 * El walker aísla la sesión entre flujos (D42) y vuelve a `entry` antes de cada uno,
 * a propósito: sin eso un flujo hereda la contaminación del anterior. La consecuencia
 * es que un flujo que dependa del anterior está roto por construcción, y eso no lo
 * decía ningún contrato — la iteración 1 acertó por suerte.
 *
 * Se comprueba aquí y no con prosa en el prompt del refiner porque las correcciones
 * de prosa al productor son una moneda al aire: D34 se arregló así y midió 18/18 en
 * un run y 0/31 en el siguiente con el prompt idéntico.
 *
 * La señal de que el flujo se autentica es que rellena algo de
 * `$fixtures.credentials` — genérico, sale del contract, no de esta aplicación.
 * `unauthenticated: true` en el flujo lo exime (pantalla pública, login inválido).
 */
export function checkFlowsSelfContained(input: {
  authEnabled: boolean;
  flows: WalkFlow[];
}): string[] {
  if (!input.authEnabled) return [];
  const errors: string[] = [];
  for (const flow of input.flows) {
    if (flow.unauthenticated === true) continue;
    const seAutentica = (flow.steps ?? []).some(
      (s) => typeof s.value === 'string' && s.value.startsWith('$fixtures.credentials'),
    );
    if (seAutentica) continue;
    errors.push(
      `${flow.flow}: el contract declara auth.enabled y este flujo no se autentica. ` +
        'El walker reinicia la sesión y vuelve a `entry` antes de CADA flujo, así que no ' +
        'hereda la sesión del anterior: repite los pasos de login dentro del flujo ' +
        '(mismo `$fixtures.credentials...` que usa el flujo de login), o declara ' +
        '`"unauthenticated": true` en el flujo si corre a propósito sin sesión.',
    );
  }
  return errors;
}

export interface CheckResult {
  ok: boolean;
  errors: string[];
  /** Fallo de lectura/parseo: no es un guion inválido, es un fichero ilegible. */
  ioError?: string;
  /**
   * D30 — una comprobación que no se ejecuta tiene que DECIRLO. Sin contract no hay
   * forma de saber si el sitio tiene auth, y callarlo se lee como «comprobado y bien».
   */
  authCheckSkipped?: string;
}

/** Puro: separa "no se pudo leer" de "se leyó y está mal". El command actúa distinto en cada caso. */
export function checkWalkScriptFile(path: string, contractPath?: string): CheckResult {
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

  // La coherencia de auth solo se puede juzgar con el contract delante.
  if (!contractPath) {
    return { ok, errors, authCheckSkipped: 'sin --contract: no se comprobó la coherencia con auth.enabled' };
  }
  if (!existsSync(contractPath)) {
    return { ok, errors, authCheckSkipped: `contract no encontrado (${contractPath}): no se comprobó auth.enabled` };
  }
  let authEnabled = false;
  try {
    const contract = (parseYaml(readFileSync(contractPath, 'utf8')) ?? {}) as { auth?: { enabled?: boolean } };
    authEnabled = contract.auth?.enabled === true;
  } catch (e) {
    return { ok, errors, authCheckSkipped: `contract ilegible (${(e as Error).message}): no se comprobó auth.enabled` };
  }
  const flows = ((parsed as { flows?: WalkFlow[] }).flows ?? []).filter((f) => f && typeof f === 'object');
  const authErrors = checkFlowsSelfContained({ authEnabled, flows });
  const todos = [...errors, ...authErrors];
  return { ok: todos.length === 0, errors: todos };
}

export function formatReport(path: string, res: CheckResult): string {
  if (res.ioError) return `walk-script ILEGIBLE — ${path}\n  ${res.ioError}`;
  const aviso = res.authCheckSkipped ? `\n  aviso: ${res.authCheckSkipped}` : '';
  if (res.ok) return `walk-script VÁLIDO — ${path}${aviso}`;
  const lines = [
    `walk-script INVÁLIDO — ${path}${aviso}`,
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
    console.error('uso: check-walk-script.ts <walk-script.json> [--contract=<style-contract.yaml>]');
    return EXIT_IO;
  }
  const contract = argv.find((a) => a.startsWith('--contract='))?.slice('--contract='.length);
  const res = checkWalkScriptFile(path, contract);
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
