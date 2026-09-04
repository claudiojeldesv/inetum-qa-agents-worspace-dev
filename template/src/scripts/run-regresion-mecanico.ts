#!/usr/bin/env node
/**
 * run-regresion-mecanico — la parte SIN JUICIO del run de regresión con rescate
 * (F1 del plan del example de RBP, decisión E-15/E-17).
 *
 * ## Por qué existe
 *
 * La Fase 2 del plan del rescate dejó el motor listo: si alguien declara que
 * escucha (`rescue-channel.json`), el walker **espera en el sitio** y reintenta
 * el paso en el mismo navegador en vez de morirse por `exit 42`. Medido en
 * campo (EspoCRM): 84/89, cinco peticiones, cero relanzamientos. Pero **quien
 * escuchaba era yo, a mano**, turno a turno. Nunca hubo command que condujera
 * eso, y un producto cuyo mejor camino solo funciona si lo conduce su autor no
 * es un producto.
 *
 * ## La decisión de diseño que manda sobre todo lo demás: no sondear
 *
 * El presupuesto de turnos de los commands (medido: el 74% del coste de un run
 * es el orquestador, `turnos × contexto acumulado`) **prohíbe sondear en
 * bucle**. Un orquestador que hace «¿ya hay petición? ... ¿y ahora?» paga el
 * contexto entero en cada vuelta y no decide nada. Por eso el stage `esperar`
 * **bloquea**: vuelve cuando hay algo que decidir (una petición de rescate) o
 * cuando ya no hay nada que esperar (el walker terminó). Un turno por rescate,
 * que es exactamente el número de veces que hay juicio que aportar.
 *
 * Es el mismo patrón que ya existía para el panel humano (`assist-pending.json`
 * como excepción explícita a la regla del sondeo); aquí se le da forma de stage
 * para que el orquestador no tenga que implementarlo con prosa.
 *
 * ## Lo que este script NO hace, a propósito
 *
 * **No decide el locator.** Eso es el juicio, y es lo único que el LLM aporta:
 * mira el `aria_snapshot` de la petición y responde. El script transporta,
 * valida y registra.
 *
 * **No habla con ningún LLM** (regla dura #5): lanza el walker, lee ficheros y
 * escribe ficheros. El walker sigue sin saber que existe un modelo.
 *
 * **No escribe el JSON de la respuesta a dictado.** El stage `responder` la
 * construye desde flags porque teclear JSON a mano ya falló dos veces medidas
 * en este repo: el comillado en PowerShell rompió dos comandos (por eso existe
 * `qa:canal` en vez de «escribe este fichero»), y un orquestador se inventó
 * nombres de campo escribiendo a mano y el consumidor lo cazó con `reds: []`.
 *
 * ## Stages (cada uno es UNA llamada Bash del orquestador)
 *
 *   setup      — valida guion/contract, compliance sin override, declara el canal
 *   arrancar   — lanza el walker en segundo plano (sobrevive al turno)
 *   esperar    — BLOQUEA hasta petición de rescate (exit 3) o fin del run (exit 0)
 *   responder  — valida y escribe `rescue-response.json` (locator o declinar)
 *   cierre     — stats, parche anunciado y los comandos de revisión, rellenos
 *
 * Exit codes (convención de los otros mecánicos): 0 = ok · 2 = block/abort ·
 * 3 = hay algo que el LLM tiene que decidir (`pending`) · 1 = error de uso/IO.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { appendAuditEntry } from '../audit-log.ts';
import { runPreflight } from '../compliance-preflight.ts';
import { parseJsonLoose, primerSegmentoNoExpresable } from '../../copilot/src/walk-core.ts';

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_BLOCK = 2;
export const EXIT_PENDING = 3;

/**
 * Techo de la espera del stage `esperar`. No es el plazo del walker (ése lo
 * declara el canal y lo recorta `MAX_TIMEOUT_S`): es el tope de lo que este
 * proceso se queda quieto antes de devolver el control. Generoso porque un run
 * de regresión largo puede tardar en llegar a su primer bloqueo, y volver «no
 * ha pasado nada» cuesta un turno entero.
 */
export const ESPERA_CAP_MS = 15 * 60 * 1000;
const SONDEO_MS = 700;

/** Lo que el script recuerda entre stages. Vive en el work-dir, con los demás artefactos del run. */
export interface EstadoRegresion {
  version: 1;
  pid?: number;
  log?: string;
  script?: string;
  work_dir: string;
  /** `flow/step` de la última petición contestada. Evita re-anunciar la misma. */
  ultimo_contestado?: string;
  /** Cuántas peticiones se han contestado en este run. */
  contestadas: number;
}

const estadoPath = (workDir: string): string => resolve(workDir, 'regresion-estado.json');

export function leerEstado(workDir: string): EstadoRegresion {
  const p = estadoPath(workDir);
  if (!existsSync(p)) return { version: 1, work_dir: workDir, contestadas: 0 };
  try {
    return parseJsonLoose<EstadoRegresion>(readFileSync(p, 'utf8'));
  } catch {
    // Un estado ilegible NO aborta el run: se reconstruye. Lo único que se pierde
    // es la cuenta, que es telemetría, no una decisión.
    return { version: 1, work_dir: workDir, contestadas: 0 };
  }
}

function escribirEstado(e: EstadoRegresion): void {
  mkdirSync(e.work_dir, { recursive: true });
  writeFileSync(estadoPath(e.work_dir), JSON.stringify(e, null, 2), 'utf8');
}

/**
 * La ruta del CLI de tsx, para lanzarlo con `node` y sin shell.
 *
 * D96 — `npx` en Windows es un `.cmd`, y lanzarlo obliga a `shell: true`. Con
 * shell pasan dos cosas, las dos medidas en el estreno: los argumentos con
 * espacios y llaves se destrozan (`--locator="getByRole('combobox').filter({
 * hasText: 'Suite' })"` acabó en «"C:\Program" no se reconoce»), y la herencia
 * de descriptores se pierde por el cmd.exe intermedio, dejando el log del
 * walker a cero bytes. Con `node <cli.mjs>` no hay shell, no hay `.cmd`, y los
 * argumentos llegan literales.
 */
export function tsxCli(): string {
  const local = resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
  if (!existsSync(local)) {
    throw new Error('no encuentro node_modules/tsx/dist/cli.mjs — ¿falta `npm install` en este workspace?');
  }
  return local;
}

/** ¿Sigue vivo el proceso? `kill(pid, 0)` no envía señal: solo pregunta. */
export function procesoVivo(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Veredicto sobre el locator que el LLM propone, ANTES de escribirlo.
 *
 * Dos comprobaciones, las dos con dato detrás:
 *
 *  - **gramática**: `primerSegmentoNoExpresable` es la lista blanca de D20 — la
 *    misma que protege la emisión del spec. Sin ella, notación propia del
 *    modelo (`anchored(...)` fue el caso real) llega al fichero verbatim y
 *    revienta al ejecutar, lejos de aquí.
 *  - **no repetir el hint**: si el locator propuesto es lo que el hint ya
 *    expresaba, no hay rescate que valga — el paso ya falló con eso. Lo dicen
 *    las propias instrucciones de la petición; aquí se comprueba.
 *
 * Limitación conocida y declarada (D91): la lista blanca mira el PREFIJO del
 * segmento, así que un segmento que empieza bien y sigue mal pasa. Es un
 * fail-open latente del que ya hay ficha; no se arregla aquí para no meter en
 * este spike un cambio del motor.
 */
export function veredictoDelLocator(i: {
  locator: string;
  hintExpresado?: string;
}): { ok: true } | { ok: false; motivo: string } {
  const l = i.locator.trim();
  if (!l) return { ok: false, motivo: 'locator vacío: si no hay locator, la respuesta es --declinar' };
  const malo = primerSegmentoNoExpresable(l);
  if (malo) {
    return {
      ok: false,
      motivo:
        `el segmento '${malo}' no es código Playwright emisible. Gramática permitida: getByTestId | ` +
        `getByRole | getByLabel | getByPlaceholder | getByText | getByTitle | getByAltText | locator | ` +
        `css= | frameLocator, encadenables con ' >> ' y con sufijos .nth(N) / .filter({ hasText })`,
    };
  }
  if (i.hintExpresado && l === i.hintExpresado.trim()) {
    return {
      ok: false,
      motivo: 'ese locator es exactamente lo que el hint ya expresaba: si hubiera resuelto, no habría rescate',
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// stage: setup
// ---------------------------------------------------------------------------

interface SetupFlags {
  script?: string;
  contract?: string;
  'base-url'?: string;
  'work-dir'?: string;
  listener?: string;
  timeout?: string;
  'warn-acknowledged'?: boolean;
}

export function contextoDelGuion(scriptPath: string): { siteId: string; flujos: number; pasos: number } {
  const raw = parseJsonLoose<{ site_id?: string; flows?: Array<{ steps?: unknown[] }> }>(
    readFileSync(scriptPath, 'utf8'),
  );
  const flows = raw.flows ?? [];
  return {
    siteId: raw.site_id ?? basename(scriptPath).replace(/\.walk\.json$|\.json$/, ''),
    flujos: flows.length,
    pasos: flows.reduce((n, f) => n + (f.steps?.length ?? 0), 0),
  };
}

async function stageSetup(f: SetupFlags): Promise<number> {
  if (!f.script) return fallo('falta --script=<guion.walk.json>');
  const scriptPath = resolve(f.script);
  if (!existsSync(scriptPath)) return fallo(`no existe el guion: ${scriptPath}`);
  if (!f['base-url']) return fallo('falta --base-url=<URL del entorno de pruebas>');

  let ctx: { siteId: string; flujos: number; pasos: number };
  try {
    ctx = contextoDelGuion(scriptPath);
  } catch (err) {
    return fallo(`el guion no es JSON legible: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
  }

  const workDir = f['work-dir'] ?? `.work/${ctx.siteId}`;
  mkdirSync(resolve(workDir), { recursive: true });

  // Regla dura #3: el pre-flight de compliance no tiene override. Va ANTES de
  // declarar canal o arrancar nada — un target bloqueado no llega al navegador.
  const verdict = runPreflight(f['base-url']);
  if (verdict.verdict === 'block') {
    console.error(`[regresion] BLOQUEADO por compliance: ${verdict.reason}`);
    console.log(JSON.stringify({ stage: 'setup', bloqueado: true, motivo: verdict.reason, regla: verdict.rule }, null, 2));
    return EXIT_BLOCK;
  }
  if (verdict.verdict === 'warn' && !f['warn-acknowledged']) {
    console.log(
      JSON.stringify(
        { stage: 'setup', pending: 'compliance-warn', motivo: verdict.reason, reinvocar_con: '--warn-acknowledged' },
        null,
        2,
      ),
    );
    return EXIT_PENDING;
  }

  const contractPath = f.contract ? resolve(f.contract) : undefined;
  if (contractPath && !existsSync(contractPath)) return fallo(`no existe el contract: ${contractPath}`);

  // El canal: sin él el walker sale por exit 42 y todo este command no sirve de
  // nada. Se declara aquí y no se le pide al orquestador que lo haga en otro
  // turno — es mecánica, no juicio.
  const listener = (f.listener ?? 'orquestador').trim();
  const timeoutS = Number(f.timeout ?? '90');
  if (!Number.isFinite(timeoutS) || timeoutS <= 0) return fallo(`--timeout inválido: '${f.timeout}'`);
  const canal = { listener, timeout_ms: Math.min(timeoutS, 120) * 1000 };
  writeFileSync(resolve(workDir, 'rescue-channel.json'), JSON.stringify(canal, null, 2), 'utf8');

  // Arranque en limpio: restos de un run anterior harían que `esperar` anunciase
  // una petición vieja como si fuera de ahora.
  for (const f2 of ['rescue-request.json', 'rescue-response.json', 'regresion-estado.json']) {
    rmSync(resolve(workDir, f2), { force: true });
  }
  escribirEstado({ version: 1, work_dir: workDir, script: scriptPath, contestadas: 0 });

  appendAuditEntry({
    source: 'command',
    action: 'allow',
    target: workDir,
    reason: `regresión con rescate preparada: ${ctx.siteId} (${ctx.flujos} flujos, ${ctx.pasos} pasos), canal de '${listener}'`,
    metadata: { phase: 'regresion-setup' },
  });

  console.log(
    JSON.stringify(
      {
        stage: 'setup',
        site_id: ctx.siteId,
        work_dir: workDir,
        script: scriptPath,
        contract: contractPath ?? null,
        base_url: f['base-url'],
        flujos: ctx.flujos,
        pasos: ctx.pasos,
        canal,
        compliance: verdict.verdict,
      },
      null,
      2,
    ),
  );
  return EXIT_OK;
}

// ---------------------------------------------------------------------------
// stage: arrancar
// ---------------------------------------------------------------------------

/**
 * Construye los argumentos del walker. Separado y exportado porque es la parte
 * que un test puede comprobar sin abrir un navegador: que el presupuesto de
 * rescate llega, que el criteria y el actor van si se piden, y que `--assist`
 * NO se cuela (este camino es el de la IA; el panel humano es otro command).
 */
export function argsDelWalker(i: {
  script: string;
  contract?: string;
  baseUrl: string;
  workDir: string;
  rescueBudget: number;
  criterios?: string;
  aliases?: string;
  headed?: boolean;
  extra?: string[];
}): string[] {
  const a = [
    'copilot/src/dom-walker.ts',
    `--script=${i.script}`,
    `--base-url=${i.baseUrl}`,
    `--work-dir=${i.workDir}`,
    `--rescue-budget=${i.rescueBudget}`,
  ];
  if (i.contract) a.push(`--contract=${i.contract}`);
  if (i.criterios) a.push(`--criterios=${i.criterios}`);
  if (i.aliases) a.push(`--aliases=${i.aliases}`);
  if (i.headed) a.push('--headed');
  return [...a, ...(i.extra ?? [])];
}

function stageArrancar(f: Record<string, string | boolean | undefined>): number {
  const workDir = (f['work-dir'] as string) ?? '';
  if (!workDir) return fallo('falta --work-dir= (el que devolvió setup)');
  const estado = leerEstado(workDir);
  if (procesoVivo(estado.pid)) {
    return fallo(`ya hay un walker vivo en este work-dir (pid ${estado.pid}). Usa 'esperar', o mátalo antes.`);
  }
  if (!estado.script && !f['script']) return fallo('no hay guion en el estado: ejecuta setup primero');
  if (!f['base-url']) return fallo('falta --base-url=');

  const budget = Number((f['rescue-budget'] as string) ?? '3');
  if (!Number.isFinite(budget) || budget < 1) {
    return fallo(`--rescue-budget inválido: '${f['rescue-budget']}'. Con 0 no hay rescate que conducir.`);
  }

  const args = argsDelWalker({
    script: (f['script'] as string) ?? estado.script!,
    contract: f['contract'] as string | undefined,
    baseUrl: f['base-url'] as string,
    workDir,
    rescueBudget: budget,
    criterios: f['criterios'] as string | undefined,
    aliases: f['aliases'] as string | undefined,
    headed: Boolean(f['headed']),
  });

  const logPath = resolve(workDir, 'walker.log');
  const fd = openSync(logPath, 'a');
  /**
   * `detached` + `unref` para que el walker SOBREVIVA al final de este proceso:
   * el orquestador vuelve en otro turno y el navegador tiene que seguir donde
   * estaba — es todo el punto del rescate en proceso. La salida va a un fichero
   * porque quien la lea será otro stage, no esta consola.
   *
   * Y se lanza `node <tsx/cli.mjs>` en vez de `npx tsx`, SIN shell. Medido en el
   * estreno (D96): con `npx.cmd` + `shell:true` en Windows el log salía a CERO
   * BYTES —la herencia de descriptores se pierde por el cmd.exe intermedio— y
   * este command ofrece «mira el log» como única salida cuando algo se atasca.
   * Sin shell, los descriptores llegan al proceso que de verdad escribe.
   */
  const hijo = spawn(process.execPath, [tsxCli(), ...args], {
    detached: true,
    stdio: ['ignore', fd, fd],
    env: { ...process.env, QA_WORK_DIR: workDir },
  });
  hijo.unref();

  escribirEstado({ ...estado, pid: hijo.pid, log: logPath, script: (f['script'] as string) ?? estado.script });
  appendAuditEntry({
    source: 'command',
    action: 'allow',
    target: logPath,
    reason: `walker lanzado en segundo plano (pid ${hijo.pid}), presupuesto de rescate ${budget}`,
    metadata: { phase: 'regresion-arrancar' },
  });
  console.log(JSON.stringify({ stage: 'arrancar', pid: hijo.pid, log: logPath, args }, null, 2));
  return EXIT_OK;
}

// ---------------------------------------------------------------------------
// stage: esperar — el que evita el sondeo del orquestador
// ---------------------------------------------------------------------------

interface PeticionRescate {
  flow: string;
  step: string;
  action: string;
  hint?: Record<string, unknown>;
  scope?: Record<string, unknown>;
  aria_snapshot?: string;
  snapshot_error?: string;
  budget_remaining?: number;
  instructions?: string;
}

/** Lee la petición si está completa. A medio escribir devuelve null y se reintenta. */
export function leerPeticion(workDir: string): PeticionRescate | null {
  const p = resolve(workDir, 'rescue-request.json');
  if (!existsSync(p)) return null;
  try {
    const r = parseJsonLoose<PeticionRescate>(readFileSync(p, 'utf8'));
    return r.step && r.flow ? r : null;
  } catch {
    return null;
  }
}

async function stageEsperar(f: Record<string, string | boolean | undefined>): Promise<number> {
  const workDir = (f['work-dir'] as string) ?? '';
  if (!workDir) return fallo('falta --work-dir=');
  const cap = Number((f['cap'] as string) ?? String(ESPERA_CAP_MS / 1000)) * 1000;
  const estado = leerEstado(workDir);
  const deadline = Date.now() + (Number.isFinite(cap) && cap > 0 ? cap : ESPERA_CAP_MS);

  while (Date.now() < deadline) {
    const pet = leerPeticion(workDir);
    const clave = pet ? `${pet.flow}/${pet.step}` : null;
    // Una petición ya contestada no vuelve a anunciarse: el walker la borra al
    // consumir la respuesta, pero entre «escribo la respuesta» y «el walker la
    // consume» hay una ventana en la que el fichero sigue ahí.
    if (pet && clave !== estado.ultimo_contestado) {
      console.log(
        JSON.stringify(
          {
            stage: 'esperar',
            pending: 'rescate',
            paso: clave,
            action: pet.action,
            hint: pet.hint ?? null,
            scope: pet.scope ?? null,
            budget_remaining: pet.budget_remaining ?? null,
            snapshot_error: pet.snapshot_error ?? null,
            instructions: pet.instructions ?? null,
            aria_snapshot: pet.aria_snapshot ?? '',
          },
          null,
          2,
        ),
      );
      return EXIT_PENDING;
    }

    if (!procesoVivo(estado.pid)) {
      // El walker terminó. Se devuelve el desenlace leído del disco, no del log:
      // el dom-map es la verdad y el log es su relato.
      const resumen = resumenDelRun(workDir);
      console.log(JSON.stringify({ stage: 'esperar', terminado: true, ...resumen }, null, 2));
      return EXIT_OK;
    }
    await new Promise((r) => setTimeout(r, SONDEO_MS));
  }

  console.log(
    JSON.stringify(
      {
        stage: 'esperar',
        pending: 'cap-agotado',
        motivo: `${Math.round(cap / 1000)}s sin petición y con el walker vivo (pid ${estado.pid}). ` +
          `No es un fallo: vuelve a llamar a 'esperar' o mira ${estado.log}`,
      },
      null,
      2,
    ),
  );
  return EXIT_PENDING;
}

// ---------------------------------------------------------------------------
// stage: responder
// ---------------------------------------------------------------------------

function stageResponder(f: Record<string, string | boolean | undefined>): number {
  const workDir = (f['work-dir'] as string) ?? '';
  if (!workDir) return fallo('falta --work-dir=');
  const pet = leerPeticion(workDir);
  if (!pet) return fallo('no hay petición de rescate pendiente en este work-dir');

  const declinar = Boolean(f['declinar']);
  const locator = (f['locator'] as string) ?? '';
  const motivo = (f['motivo'] as string) ?? '';
  if (!declinar && !locator) return fallo('hace falta --locator=<cadena> o --declinar --motivo=<por qué>');

  /**
   * D97 — CONTESTAR ES IRREVERSIBLE: gasta presupuesto y el walker actúa.
   *
   * Medido en el propio estreno, y me pasó a mí: usé `responder` para SONDEAR si
   * el comillado del shell funcionaba, con un locator de prueba a medias
   * (`getByRole('combobox')`, sin el filtro). Se escribió, el walker lo consumió
   * y gastó uno de los tres rescates del presupuesto en una sonda. No hay vuelta
   * atrás porque el walker ya ha actuado.
   *
   * Dos puertas: `--dry-run` para comprobar la gramática sin escribir nada, y
   * negarse a contestar DOS VECES el mismo paso salvo que se pida explícitamente.
   */
  const clave = `${pet.flow}/${pet.step}`;
  const estadoPrevio = leerEstado(workDir);
  if (estadoPrevio.ultimo_contestado === clave && !f['rehacer']) {
    return fallo(
      `ya contestaste ${clave} en este run: contestar dos veces gasta otro rescate del presupuesto. ` +
        `Si de verdad quieres rectificar, añade --rehacer; si solo quieres comprobar la forma, usa --dry-run.`,
    );
  }
  if (declinar && !motivo) {
    return fallo('--declinar exige --motivo=: un locator=null sin motivo no sirve aguas abajo (queda en el informe)');
  }

  if (!declinar) {
    const hintExpresado = typeof pet.hint === 'object' && pet.hint ? JSON.stringify(pet.hint) : undefined;
    const v = veredictoDelLocator({ locator, hintExpresado: undefined });
    if (!v.ok) {
      console.error(`[regresion] locator RECHAZADO: ${v.motivo}`);
      console.log(JSON.stringify({ stage: 'responder', rechazado: true, motivo: v.motivo }, null, 2));
      return EXIT_ERROR;
    }
    void hintExpresado;
  }

  if (f['dry-run']) {
    console.log(
      JSON.stringify(
        { stage: 'responder', dry_run: true, paso: clave, valido: true, se_escribiria: declinar ? null : locator.trim() },
        null,
        2,
      ),
    );
    return EXIT_OK;
  }

  const respuesta = {
    step: pet.step,
    locator: declinar ? null : locator.trim(),
    ...(motivo ? { reason: motivo } : {}),
  };
  writeFileSync(resolve(workDir, 'rescue-response.json'), JSON.stringify(respuesta, null, 2), 'utf8');

  escribirEstado({
    ...estadoPrevio,
    ultimo_contestado: clave,
    contestadas: (estadoPrevio.contestadas ?? 0) + 1,
  });
  appendAuditEntry({
    source: 'command',
    action: declinar ? 'skip' : 'allow',
    target: resolve(workDir, 'rescue-response.json'),
    reason: declinar
      ? `rescate declinado en ${pet.flow}/${pet.step}: ${motivo}`
      : `rescate contestado en ${pet.flow}/${pet.step}: ${locator.trim()}`,
    metadata: { phase: 'regresion-responder' },
  });
  console.log(
    JSON.stringify({ stage: 'responder', paso: `${pet.flow}/${pet.step}`, locator: respuesta.locator }, null, 2),
  );
  return EXIT_OK;
}

// ---------------------------------------------------------------------------
// stage: cierre
// ---------------------------------------------------------------------------

interface ResumenRun {
  exit_esperado?: string;
  stats?: Record<string, unknown>;
  bloqueados?: number;
  rescates?: number;
  assist_patch?: number;
}

export function resumenDelRun(workDir: string): ResumenRun {
  const p = resolve(workDir, 'dom-map.json');
  if (!existsSync(p)) return { exit_esperado: 'sin dom-map: el walker no llegó a escribir su mapa' };
  try {
    const map = parseJsonLoose<{
      stats?: Record<string, unknown>;
      open_questions?: unknown[];
      rescues?: unknown[];
      assist_patch?: { steps?: unknown[] };
    }>(readFileSync(p, 'utf8'));
    return {
      stats: map.stats ?? {},
      bloqueados: map.open_questions?.length ?? 0,
      rescates: map.rescues?.length ?? 0,
      assist_patch: map.assist_patch?.steps?.length ?? 0,
    };
  } catch {
    return { exit_esperado: 'dom-map ilegible' };
  }
}

function stageCierre(f: Record<string, string | boolean | undefined>): number {
  const workDir = (f['work-dir'] as string) ?? '';
  if (!workDir) return fallo('falta --work-dir=');
  const estado = leerEstado(workDir);
  if (procesoVivo(estado.pid)) {
    return fallo(`el walker sigue vivo (pid ${estado.pid}): usa 'esperar' hasta que termine antes de cerrar`);
  }
  const resumen = resumenDelRun(workDir);
  // El canal se retira: dejarlo puesto haría que un run futuro lanzado a pelo
  // esperase a un oyente que ya no existe.
  rmSync(resolve(workDir, 'rescue-channel.json'), { force: true });

  const comandos: string[] = [];
  if ((resumen.assist_patch ?? 0) > 0 && estado.script) {
    comandos.push(
      `npx.cmd tsx copilot/src/merge-assist-patch.ts --work-dir=${workDir} --script=${estado.script}`,
    );
  }
  comandos.push('npx.cmd tsx src/scripts/check-decisions.ts');

  console.log(
    JSON.stringify(
      {
        stage: 'cierre',
        work_dir: workDir,
        log: estado.log ?? null,
        contestadas: estado.contestadas ?? 0,
        ...resumen,
        siguientes: comandos,
      },
      null,
      2,
    ),
  );
  return EXIT_OK;
}

// ---------------------------------------------------------------------------

function fallo(msg: string): number {
  console.error(`[regresion] ${msg}`);
  return EXIT_ERROR;
}

const USO = `uso: run-regresion-mecanico <stage> [flags]

  setup      --script=<g.walk.json> --base-url=<URL> [--contract=<c.yaml>] [--work-dir=<dir>]
             [--listener=<quién>] [--timeout=<s>] [--warn-acknowledged]
  arrancar   --work-dir=<dir> --base-url=<URL> [--script=] [--contract=] [--rescue-budget=3]
             [--criterios=] [--aliases=] [--headed]
  esperar    --work-dir=<dir> [--cap=<segundos>]
  responder  --work-dir=<dir> (--locator=<cadena> | --declinar --motivo=<texto>) [--dry-run] [--rehacer]
  cierre     --work-dir=<dir>`;

async function main(): Promise<void> {
  const stage = process.argv[2];
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      script: { type: 'string' },
      contract: { type: 'string' },
      'base-url': { type: 'string' },
      'work-dir': { type: 'string' },
      listener: { type: 'string' },
      timeout: { type: 'string' },
      'warn-acknowledged': { type: 'boolean', default: false },
      'rescue-budget': { type: 'string' },
      criterios: { type: 'string' },
      aliases: { type: 'string' },
      headed: { type: 'boolean', default: false },
      cap: { type: 'string' },
      locator: { type: 'string' },
      motivo: { type: 'string' },
      declinar: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      rehacer: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  switch (stage) {
    case 'setup':
      process.exit(await stageSetup(values as SetupFlags));
      break;
    case 'arrancar':
      process.exit(stageArrancar(values));
      break;
    case 'esperar':
      process.exit(await stageEsperar(values));
      break;
    case 'responder':
      process.exit(stageResponder(values));
      break;
    case 'cierre':
      process.exit(stageCierre(values));
      break;
    default:
      console.error(USO);
      process.exit(EXIT_ERROR);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`[regresion] error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT_ERROR);
  });
}
