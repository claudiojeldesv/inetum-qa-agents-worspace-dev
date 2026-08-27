#!/usr/bin/env tsx
/**
 * merge-assist-patch — la aprobación del parche del panel.
 *
 * El panel resuelve un paso bloqueado y escribe `assist-patch.json`. Hasta hoy nadie lo
 * fundía: el walker imprimía «fúndelo en el guion y relanza» y el QA lo hacía a mano, o
 * no lo hacía. Medido en campo: los tres parches de un run de ParaBank quedaron sin
 * fundir. El producto recordaba dónde está un elemento y olvidaba qué pasos faltaban.
 *
 * **Y que no se fundiera solo no era un descuido**:
 *
 *   «El parche NUNCA se aplica solo… que un programa lo reescriba en silencio es
 *    inaceptable» — docs/SPEC-kernel-v2.md:157
 *   «aprobación, no aplicación ciega» — docs/SPEC-caos-corporativo.md:359
 *
 * Por eso esta herramienta **por defecto no toca nada**: enseña lo que cambiaría,
 * agrupado por peso, y sale. `--aplicar` es lo único que escribe, y exige actor.
 *
 * La aprobación se expresa con BANDERAS, no con un prompt: el QA lee, y después teclea
 * (o autoriza) el comando exacto que nombra lo que aprueba. Es el patrón del repo —y
 * además el QA conduce esto con Claude desde la terminal, donde no hay prompt que
 * valga.
 *
 * Uso:
 *   tsx copilot/src/merge-assist-patch.ts --work-dir=.work/<sitio> --script=<walk-script.json>
 *   ... --aplicar --actor=<nombre> --fd=<path>|--fd-hash=<hex>|--sin-fd [--oraculo=<paso>]…
 *
 * Exit 0 = revisión mostrada, o fundido y firmado.
 * Exit 1 = uso incorrecto, o no hay nada que fundir.
 * Exit 2 = rechazo — NADA escrito.
 * Exit 3 = las firmas se pusieron y la escritura del guion falló: acta y guion
 *          discrepan. Es el único estado en que los dos artefactos no cuadran, y
 *          meterlo en el 2 («nada escrito») sería mentir.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { hashScript, parseJsonLoose, validateWalkScript } from './walk-core.ts';
import { agruparPorPeso, fundirGuion, parcheIntegro, type Cambio, type Seleccion } from './walk-merge.ts';
import type { AssistPatch, WalkScript } from './walk-types.ts';
import {
  appendDecision,
  claveDecision,
  decisionsPathFor,
  effectiveDecisions,
  hashJson,
  hashText,
  normalizeActor,
  parseDecisions,
  verifyChain,
  type DecisionEntry,
} from '../../src/decisions.ts';
import { anclarDecisionEnAudit } from '../../src/decisions-audit.ts';

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const flags = (n: string): string[] => args.filter((a) => a.startsWith(`--${n}=`)).map((a) => a.split('=').slice(1).join('='));
const has = (n: string): boolean => args.includes(`--${n}`);

const EXIT_OK = 0;
const EXIT_USO = 1;
const EXIT_RECHAZO = 2;
const EXIT_DISCREPAN = 3;

const USO =
  '[merge-assist-patch] uso:\n' +
  '  --work-dir=<dir del run> --script=<walk-script.json>            → enseña, no toca nada\n' +
  '  ... --aplicar --actor=<nombre> --fd=<path>|--fd-hash=<hex>|--sin-fd [--oraculo=<paso>]…\n' +
  '  --sin-coreografia   deja fuera el camino; --oraculo=<paso> aprueba UNA comprobación (repetible)';

function morir(codigo: number, ...lineas: string[]): never {
  for (const l of lineas) console.error(l);
  process.exit(codigo);
}

/** Escritura atómica: tmp + rename en el mismo directorio. Un guion a medias no es un guion. */
function escribirAtomico(path: string, contenido: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, contenido, 'utf8');
  renameSync(tmp, path);
}

function main(): void {
  const workDir = flag('work-dir') ?? process.env.QA_WORK_DIR;
  const scriptPath = flag('script');
  if (!workDir || !scriptPath) morir(EXIT_USO, USO);

  const patchPath = flag('patch') ?? resolve(workDir, 'assist-patch.json');
  const scriptAbs = resolve(scriptPath);

  // ---------------------------------------------------------- fase A: entrada
  if (!existsSync(patchPath)) {
    console.log(`[merge-assist-patch] no hay parche en ${patchPath} — nada que fundir.`);
    process.exit(EXIT_USO);
  }
  if (!existsSync(scriptAbs)) morir(EXIT_USO, `[merge-assist-patch] no existe el guion ${scriptAbs}`);

  let patch: AssistPatch;
  let script: WalkScript;
  try {
    patch = parseJsonLoose<AssistPatch>(readFileSync(patchPath, 'utf8'));
    script = parseJsonLoose<WalkScript>(readFileSync(scriptAbs, 'utf8'));
  } catch (err) {
    morir(EXIT_USO, `[merge-assist-patch] JSON ilegible: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!patch.entries?.length) {
    console.log('[merge-assist-patch] el parche no tiene entradas — nada que fundir.');
    process.exit(EXIT_USO);
  }
  if (patch.site_id !== script.site_id) {
    morir(EXIT_RECHAZO, `[merge-assist-patch] el parche es de '${patch.site_id}' y el guion de '${script.site_id}'.`);
  }

  /**
   * El guion BASE tiene que validar ANTES de tocarlo. Sin esto, un error posterior no
   * es imputable a la fusión y no se puede distinguir «lo rompí yo» de «ya estaba roto».
   */
  const base = validateWalkScript(script);
  if (!base.ok) {
    morir(EXIT_RECHAZO, '[merge-assist-patch] el guion YA no valida antes de fundir nada:', ...base.errors.map((e) => `  - ${e}`));
  }

  for (const e of patch.entries) {
    if (!parcheIntegro(e) && !has('permitir-parche-editado')) {
      morir(
        EXIT_RECHAZO,
        `[merge-assist-patch] el parche de ${e.flow}/${e.replaces_step} no es el que escribió el panel (editado a mano).`,
        '  Un parche editado no es lo que verificó el replay. Si aun así quieres fundirlo:',
        '  --permitir-parche-editado (forzará el grado a "sin-verificar").',
      );
    }
  }

  const aplicar = has('aplicar');
  const site = script.site_id;
  const actaPath = decisionsPathFor(site);
  const auditPath = flag('audit') ? resolve(flag('audit') as string) : resolve(workDir, 'audit-log.json');

  // ------------------------------------------- fase B: cerrojos, ANTES de gastar
  // la atención del QA. Hacerle revisar siete cambios para luego decirle que falta
  // el actor tira su trabajo.
  let actor = '';
  let fdHash = '';
  if (aplicar) {
    const a = normalizeActor(flag('actor') ?? process.env.QA_ACTOR);
    if (!a) {
      morir(
        EXIT_RECHAZO,
        '[merge-assist-patch] SIN ACTOR: no se firma nada.',
        '  Declara --actor=<nombre> o la variable QA_ACTOR. Fundir el plan del cliente sin',
        '  responsable es exactamente lo que el acta existe para impedir.',
      );
    }
    actor = a;

    if (existsSync(actaPath)) {
      const { entries, malformed } = parseDecisions(readFileSync(actaPath, 'utf8'));
      const v = verifyChain(entries, malformed);
      if (!v.ok) {
        morir(
          EXIT_RECHAZO,
          `[merge-assist-patch] el acta de ${site} tiene la cadena rota — no se firma encima.`,
          `  ${v.issues.find((i) => i.severity === 'error')?.detail ?? ''}`,
          `  Resuélvelo antes: npm run qa:decisions -- --site=${site}`,
        );
      }
    }

    const directo = flag('fd-hash');
    const fdPath = flag('fd');
    if (directo?.trim()) fdHash = directo.trim();
    else if (fdPath) {
      if (!existsSync(resolve(fdPath))) morir(EXIT_RECHAZO, `[merge-assist-patch] no existe ${resolve(fdPath)}`);
      const txt = readFileSync(resolve(fdPath), 'utf8');
      try {
        fdHash = hashJson(JSON.parse(txt.replace(/^\uFEFF/, '')));
      } catch {
        fdHash = hashText(txt);
      }
    } else if (has('sin-fd')) {
      // Modo S4: no hay FD. Se declara, no se inventa un default silencioso (D45).
      fdHash = 'sin-fd';
    } else {
      morir(
        EXIT_RECHAZO,
        '[merge-assist-patch] falta contra qué FD se decide: --fd=<path>, --fd-hash=<hex>, o --sin-fd si el run no tiene FD.',
      );
    }
  }

  // --------------------------------------------------------- fusión en memoria
  const seleccion: Seleccion = {
    ...(has('sin-coreografia') ? { coreografia: false } : {}),
    oraculos: flags('oraculo'),
    elementos: flags('elemento'),
  };
  const r = fundirGuion(script, patch, seleccion);

  // ------------------------------------------------------------- presentación
  const g = agruparPorPeso(r.cambios);
  console.log(`\nFUSIÓN DEL PARCHE — ${site}`);
  console.log(`  guion:  ${scriptAbs}`);
  console.log(`  parche: ${patchPath}  (${patch.entries.length} paso(s) asistido(s))`);

  if (g.coreografia.length) {
    console.log(`\n  CÓMO SE LLEGA — ${g.coreografia.length} cambio(s), se aceptan en bloque`);
    for (const c of g.coreografia) console.log(`    · ${c.flow}/${c.paso}  ${c.descripcion}   [${c.grado}]`);
  }
  if (g.oraculo.length) {
    console.log(`\n  QUÉ SIGNIFICA CORRECTO — ${g.oraculo.length} cambio(s), uno a uno`);
    console.log('    Estos NO entran si no los nombras: cambian qué se considera correcto.');
    for (const c of g.oraculo) {
      const bandera = c.clase === 'elemento-distinto' ? `--elemento=${c.paso}` : `--oraculo=${c.paso}`;
      const marca = seleccionado(c, seleccion) ? 'APROBADO' : 'sin aprobar';
      console.log(`    · ${c.flow}/${c.paso}  ${c.descripcion}   [${c.grado}] — ${marca}`);
      console.log(`        para aprobarlo:  ${bandera}`);
    }
  }
  if (r.conservados.length) {
    console.log('\n  SE CONSERVA del paso original (no cambia nada, pero conviene verlo):');
    for (const c of r.conservados) console.log(`    · ${c.flow}/${c.paso}: ${c.campos.join(', ')}`);
  }
  for (const a of r.avisos) console.log(`\n  aviso  ${a.flow}/${a.paso}: ${a.texto}`);

  if (r.rechazos.length) {
    console.error('\n  NO SE PUEDE FUNDIR:');
    for (const x of r.rechazos) console.error(`    ${x.flow}/${x.paso} — ${x.motivo}`);
    console.error('\n  Nada se ha tocado.\n');
    process.exit(EXIT_RECHAZO);
  }
  if (!r.cambios.length) {
    console.log('\n  El parche no aporta ningún cambio al guion.\n');
    process.exit(EXIT_USO);
  }

  // ------------------------------------------------------------ fase E: valida
  const v = validateWalkScript(r.script);
  if (!v.ok) {
    console.error('\n  El guion fundido NO valida — el fichero no se ha tocado:');
    for (const e of v.errors) console.error(`    - ${e}`);
    console.error('');
    process.exit(EXIT_RECHAZO);
  }
  if (hashScript(r.script) === hashScript(script)) {
    console.log('\n  El resultado es idéntico al guion actual: ya estaba fundido.\n');
    process.exit(EXIT_USO);
  }

  if (!aplicar) {
    console.log('\n  Esto es una VISTA PREVIA: no se ha tocado nada.');
    console.log(`  Para aplicarlo:  --aplicar --actor=<nombre> --fd=<path>\n`);
    process.exit(EXIT_OK);
  }

  // ------------------------------------------------- fase G: baseline → firmar → escribir
  const baseDir = resolve(process.cwd(), 'config/baselines', site);
  const basePath = resolve(baseDir, 'walk-script.original.json');
  if (!existsSync(basePath)) {
    mkdirSync(baseDir, { recursive: true });
    copyFileSync(scriptAbs, basePath);
    writeFileSync(
      resolve(baseDir, 'baseline.json'),
      JSON.stringify({ version: 1, site_id: site, script_hash: hashScript(script), created_at: new Date().toISOString(), actor, source_path: scriptAbs, origen: 'primera-fusion' }, null, 2) + '\n',
      'utf8',
    );
    console.log(`\n  original guardado en ${basePath} (nunca se sobrescribe)`);
  }

  /**
   * Firmar ANTES de escribir. Si se escribe primero y la firma falla, el plan del
   * cliente cambió sin decisión detrás — justo lo que el acta promete que no pasa. Al
   * revés queda una firma sin efecto: recuperable (relanzar es seguro) y visible.
   */
  const hashBase = hashScript(script);
  const previas = existsSync(actaPath) ? parseDecisions(readFileSync(actaPath, 'utf8')).entries : [];
  const vigentes = effectiveDecisions(previas);
  const firmadas: DecisionEntry[] = [];
  const rfDe = (flow: string): string => {
    const explicito = flag('rf');
    if (explicito) return explicito;
    const f = r.script.flows.find((x) => x.flow === flow);
    if (f?.criteria?.length === 1) return f.criteria[0];
    morir(
      EXIT_RECHAZO,
      `[merge-assist-patch] el flujo '${flow}' no declara un criterio único: pásalo con --rf=<RF-NNN>.`,
      '  No se inventa: una decisión de auditoría con un criterio fabricado no vale nada.',
    );
  };

  try {
    for (const gesto of gestosDeAprobacion(g.coreografia, g.oraculo.filter((c) => seleccionado(c, seleccion)))) {
      const rf = rfDe(gesto.flow);
      const previa = vigentes.get(claveDecision(rf, `${gesto.flow}/${gesto.paso}`));
      const { entry } = appendDecision(
        {
          rf,
          paso: `${gesto.flow}/${gesto.paso}`,
          decision: 'app',
          ...(gesto.valor !== undefined ? { valor_nuevo: gesto.valor } : {}),
          fd_hash: fdHash,
          script_hash: hashBase,
          evidencia: gesto.grado,
          actor,
          ...(previa ? { supersedes: previa.hash } : {}),
        },
        actaPath,
      );
      firmadas.push(entry);
      anclarDecisionEnAudit(entry, site, auditPath, { origen: 'patch-merged', guion_resultante: hashScript(r.script) });
    }
  } catch (err) {
    morir(EXIT_RECHAZO, `[merge-assist-patch] la firma falló, el guion NO se ha tocado: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    escribirAtomico(scriptAbs, JSON.stringify(r.script, null, 2) + '\n');
  } catch (err) {
    morir(
      EXIT_DISCREPAN,
      `[merge-assist-patch] ${firmadas.length} firma(s) puestas y la escritura del guion FALLÓ: ${err instanceof Error ? err.message : String(err)}`,
      '  El acta y el guion discrepan. Relanzar es seguro: la fusión es idempotente.',
    );
  }

  console.log(`\n  FUNDIDO. ${r.cambios.length} cambio(s), ${firmadas.length} firma(s) en ${actaPath}`);
  console.log(`  Comprueba:  npx tsx copilot/src/check-walk-script.ts ${scriptPath} --contract=<style.yaml>`);
  console.log(`              npm run qa:decisions -- --site=${site} --audit=${auditPath}\n`);
  process.exit(EXIT_OK);
}

/** ¿Este cambio de oráculo lo aprobó el QA nombrándolo? */
function seleccionado(c: Cambio, sel: Seleccion): boolean {
  return c.clase === 'elemento-distinto'
    ? (sel.elementos ?? []).includes(c.paso)
    : (sel.oraculos ?? []).includes(c.paso);
}

/**
 * Un gesto de aprobación, que es lo que se firma — ni una firma por entrada ni una por
 * campo. El bloque de coreografía de cada flujo se aprobó en UN acto, así que es UNA
 * firma; cada oráculo se aprobó por separado, así que va suelto.
 */
function gestosDeAprobacion(
  coreografia: Cambio[],
  oraculo: Cambio[],
): Array<{ flow: string; paso: string; valor?: string; grado: Cambio['grado'] }> {
  const out: Array<{ flow: string; paso: string; valor?: string; grado: Cambio['grado'] }> = [];
  const porPaso = new Map<string, Cambio[]>();
  for (const c of coreografia) {
    // el bloque se ancla en el paso del plan, que es el que conserva el id del objetivo
    const ancla = c.paso.split('#')[0];
    const k = `${c.flow}/${ancla}`;
    porPaso.set(k, [...(porPaso.get(k) ?? []), c]);
  }
  for (const [k, lista] of porPaso) {
    const [flow, paso] = k.split('/');
    out.push({
      flow,
      paso,
      valor: `+${lista.length} cambio(s) de camino (${lista.map((c) => c.paso).join(', ')})`,
      grado: lista[0].grado,
    });
  }
  for (const c of oraculo) out.push({ flow: c.flow, paso: c.paso, valor: c.valor, grado: c.grado });
  return out;
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('merge-assist-patch.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
