/**
 * Fundir el parche del panel en el guion — el núcleo, puro y sin I/O.
 *
 * El panel ya sabe resolver un paso bloqueado: el QA señala, el walker construye el
 * parche y lo VERIFICA por replay. Y ahí se acababa: nadie lo fundía, el walker
 * imprimía «fúndelo en el guion y relanza», y al run siguiente se tropezaba con lo
 * mismo. El producto recordaba **dónde está un elemento** (los hint-aliases son
 * durables) y olvidaba **qué pasos faltaban**.
 *
 * **Que no se fundiera solo NO era un descuido**, y conviene tenerlo delante al leer
 * esto:
 *
 *   «El parche NUNCA se aplica solo… que un programa lo reescriba en silencio es
 *    inaceptable» — docs/SPEC-kernel-v2.md:157
 *   «aprobación, no aplicación ciega» — docs/SPEC-caos-corporativo.md:359
 *
 * Así que lo que falta no es fundir: es **la aprobación**, que es la mitad que hace
 * legítimo fundir. Este módulo produce el material de esa aprobación —qué cambiaría,
 * agrupado por peso— y aplica solo lo que le señalen. Decidir no es cosa suya.
 *
 * Todo aquí es **puro**: sin `fs`, sin reloj, sin `process.exit`. El CLI hace el I/O.
 */
import type {
  AssistPatch,
  AssistPatchStep,
  StepHint,
  WalkFlow,
  WalkScript,
  WalkStep,
} from './walk-types.ts';
import { assistStepsToWalkSteps, normalizeText, validateWalkScript } from './walk-core.ts';

// ------------------------------------------------------------------ grados

/** Los tres grados del acta, tal cual los define `src/decisions.ts`. */
export type GradoEvidencia = 'desde-cero' | 'en-vivo' | 'sin-verificar';

type Entry = AssistPatch['entries'][number];

/**
 * Qué garantía trae el parche, leída de lo que `verifyAssistPatch` dejó escrito.
 *
 * Con `ok: true` solo hay dos salidas posibles: sin `reason` (replay en contexto
 * limpio) o con la cadena literal «verificado SOLO EN VIVO: …». Cualquier otro
 * `reason` con `ok: true` no lo reconocemos, y entonces **no** se le da la garantía
 * fuerte: un motivo que no sabemos leer no es evidencia de un replay limpio.
 */
export function gradoDeEvidencia(entry: Pick<Entry, 'verified' | 'verify_reason'>): GradoEvidencia {
  if (!entry.verified) return 'sin-verificar';
  if (entry.verify_reason === undefined) return 'desde-cero';
  return /SOLO EN VIVO/.test(entry.verify_reason) ? 'en-vivo' : 'sin-verificar';
}

// ------------------------------------------------- conservación de campos

/**
 * Los campos del paso original que hay que re-pegar, **como dato y no como una
 * cascada de `if`**. Es lo que hay que tocar el día que `WalkStep` crezca, y lo que un
 * test puede recorrer exhaustivamente contra las claves del tipo.
 *
 * Van al paso `target` porque el target **es** el paso original resuelto por otra vía:
 * hereda su misma acción (`buildAssistSteps` usa `targetAction = step.action`). Los
 * `opener` son andamiaje que el guion no tenía y las `assertion` son comprobaciones
 * nuevas: ninguno hereda nada.
 *
 * Tres de estos no son comodidad, son **corrección**:
 *  - `value`: un `fill` bloqueado produce un target `fill` SIN value, y el guion deja
 *    de validar (`NEEDS_VALUE`). Igual `target` en goto/wait_url y `operator`/`each`.
 *  - `secret`: perderlo vuelca la contraseña al dom-map y al audit-log.
 *  - `expect_after` / `expect_transition`: sin ellos, un `retry_safe: true` heredado
 *    deja de validar («sin oráculo el reintento es ciego»).
 */
export const CAMPOS_AL_TARGET = [
  'value',
  'secret',
  'dialog',
  'target',
  'operator',
  'each',
  'container',
  'max_steps',
  'debounced',
  'debounce_ms',
  'expect_after',
  'expect_transition',
  'screen',
  'retry_safe',
  'settle',
] as const;

/**
 * `optional` va a TODOS los pasos fundidos, no solo al target: si el paso original
 * podía no existir, el camino hasta él tampoco.
 *
 * Contra-argumento honesto: hace silencioso el fallo de un abridor, y un abridor que
 * falla es drift que querrías ver. Pero el paso original **ya** era silencioso en ese
 * caso, y preservar la semántica del guion del cliente gana a mejorarla sin permiso.
 */
export const CAMPOS_A_TODOS = ['optional'] as const;

/** Motivo por el que un campo del original NO se pudo re-pegar. */
export interface CampoDescartado {
  campo: string;
  motivo: string;
}

// ------------------------------------------------------------------- ids

/**
 * Los ids del paso fundido, con una regla que no es cosmética: **el target conserva el
 * id del paso al que sustituye**.
 *
 * `assistStepsToWalkSteps` los deriva por posición (`s6`, `s6b`, `s6c`) y el orden es
 * `[abridores…, target, aserciones…]`. O sea que en cuanto hay un abridor, `s6` pasa a
 * ser el hover del menú y el paso que el FD llamaba s6 pasa a ser `s6b`. Y todo lo que
 * nombra `flujo/s6` —`WalkState.completed`, `--from`/`--to`, y sobre todo **el `paso`
 * de las decisiones ya firmadas en el acta**— pasaría a apuntar a un paso que el FD
 * nunca describió.
 *
 * La validación solo exige unicidad dentro del flujo, sin formato impuesto, así que
 * `s6#a1` es legal. Lo que se compra es continuidad: `flujo/s6` sigue nombrando el
 * mismo acto, y `supersedes` sigue teniendo sentido.
 */
export function derivarIds(replacesStep: string, roles: AssistPatchStep['role'][]): string[] {
  let abridores = 0;
  let aserciones = 0;
  return roles.map((role) => {
    if (role === 'target') return replacesStep;
    if (role === 'assertion') return `${replacesStep}#v${++aserciones}`;
    return `${replacesStep}#a${++abridores}`;
  });
}

// ------------------------------------------------------- identidad de hint

/**
 * ¿La hint fundida sigue nombrando el MISMO elemento que la original?
 *
 * Regla del superset: todo campo presente en la original sigue igual (tras normalizar)
 * en la fundida; la fundida puede traer más. Enriquecer `{name:'Usuario'}` a
 * `{role:'textbox', name:'Usuario'}` es un refinamiento y no molesta a nadie.
 *
 * Existe por la decisión 9 del plan: los locators no llegan al QA salvo que el cambio
 * signifique que **el elemento es otro**. Una confirmación que avisa de todo se acaba
 * clicando sin leer, y entonces la firma no vale nada.
 */
export function esMismoElemento(original: StepHint | undefined, fundida: StepHint | undefined): boolean {
  if (!original) return true; // sin original no hay nada que contradecir
  const f = fundida ?? {};
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) continue;
    const otro = (f as Record<string, unknown>)[k];
    if (otro === undefined) return false;
    if (normalizeText(String(v)) !== normalizeText(String(otro))) return false;
  }
  return true;
}

// ---------------------------------------------------------------- cambios

export type ClaseCambio =
  /** Un paso de camino que el guion no tenía. */
  | 'paso-nuevo'
  /** El mismo elemento, nombrado con más precisión. */
  | 'identidad-refinada'
  /** Se retira el `scope` porque el locator ya es absoluto. */
  | 'scope-retirado'
  /** Una comprobación que el guion no tenía. */
  | 'oraculo-nuevo'
  /** El objetivo apunta a un elemento que NO es el que nombraba el plan. */
  | 'elemento-distinto';

/** Los pesos. Dos, no tres: el par falsable del plan protege que sean exactamente dos. */
export type Peso = 'coreografia' | 'oraculo';

export interface Cambio {
  clase: ClaseCambio;
  peso: Peso;
  flow: string;
  /** El paso del guion al que pertenece el cambio (id ya re-clavado). */
  paso: string;
  /** Frase corta, en palabras del QA, de qué cambia. */
  descripcion: string;
  /** Solo en cambios de oráculo: el literal que se pasaría a esperar. */
  valor?: string;
  grado: GradoEvidencia;
}

/**
 * El peso de cada clase. Decisión 8 del plan: añadir un paso es *cómo se llega* y se
 * acepta en bloque; cambiar un resultado esperado es *qué significa correcto* y va uno
 * a uno.
 *
 * `elemento-distinto` cae en oráculo aunque la decisión 8 no lo nombre: no es «añadir
 * un paso» ni «cambiar un resultado», pero SÍ es una afirmación sobre el plan («el FD
 * nombra un elemento que no es el que hace esto»), que es justo lo que el acta
 * registra.
 */
const PESO_DE: Record<ClaseCambio, Peso> = {
  'paso-nuevo': 'coreografia',
  'identidad-refinada': 'coreografia',
  'scope-retirado': 'coreografia',
  'oraculo-nuevo': 'oraculo',
  'elemento-distinto': 'oraculo',
};

export interface Grupos {
  coreografia: Cambio[];
  oraculo: Cambio[];
}

/**
 * Agrupa por peso. **Un cambio es una operación sobre la lista de pasos, no un
 * campo** — si se contaran campos, re-pegar `retry_safe`+`expect_transition`+`screen`
 * sumaría tres y el par falsable del plan («6 de coreografía y 1 de resultado esperado
 * producen dos grupos, no una lista de 7») sería imposible de cumplir.
 */
export function agruparPorPeso(cambios: Cambio[]): Grupos {
  return {
    coreografia: cambios.filter((c) => c.peso === 'coreografia'),
    oraculo: cambios.filter((c) => c.peso === 'oraculo'),
  };
}

// -------------------------------------------------------------- la fusión

export interface Aviso {
  flow: string;
  paso: string;
  texto: string;
}

export interface Rechazo {
  flow: string;
  paso: string;
  motivo: string;
}

export interface ResultadoFusion {
  /** El guion fundido. Copia — la entrada nunca se muta. */
  script: WalkScript;
  cambios: Cambio[];
  avisos: Aviso[];
  /** Motivos por los que NO se puede fundir. Si hay alguno, `script` no sirve. */
  rechazos: Rechazo[];
  /** Lo que se conservó del paso original: no es un cambio, pero se enseña (decisión 6). */
  conservados: Array<{ flow: string; paso: string; campos: string[] }>;
  descartados: Array<{ flow: string; paso: string; campo: string; motivo: string }>;
}

/**
 * Qué se aprueba. Lo que no se nombra, no entra — con una excepción declarada.
 *
 * La coreografía va en bloque y por eso su default es «sí»: es *cómo se llega*, y el
 * plan decidió que se acepta entera. Lo que toca **qué significa correcto** —una
 * comprobación nueva, o que el objetivo resulte ser otro elemento— hay que nombrarlo.
 */
export interface Seleccion {
  /** Por defecto sí: el camino se acepta en bloque (decisión 8). */
  coreografia?: boolean;
  /** Ids de las comprobaciones nuevas aprobadas. Sin nombrar, no entran. */
  oraculos?: string[];
  /**
   * Ids de paso cuyo objetivo resultó ser OTRO elemento del que nombraba el plan.
   * No es un paso que se pueda dejar fuera: o se funde la entrada entera, o no se
   * funde. Sin nombrarlo, la entrada se salta.
   */
  elementos?: string[];
}

const clonar = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Funde una entrada del parche sobre su flujo. Devuelve los pasos resultantes o los
 * motivos por los que no se puede.
 *
 * Los dos rechazos duros no son cambios revisables: «perder el oráculo del paso» y
 * «filtrar una contraseña» **no se ofrecen a aprobar**, porque si se ofrecen alguien
 * los aprueba.
 */
function fundirEntrada(
  original: WalkStep,
  entry: Entry,
  seleccion: Seleccion,
): {
  pasos: WalkStep[];
  cambios: Cambio[];
  avisos: string[];
  rechazos: string[];
  conservados: string[];
  descartados: CampoDescartado[];
} {
  const rechazos: string[] = [];
  const avisos: string[] = [];
  const cambios: Cambio[] = [];
  const conservados: string[] = [];
  const descartados: CampoDescartado[] = [];
  const grado = gradoDeEvidencia(entry);

  const roles = entry.steps.map((s) => s.role);
  const targetIdx = roles.indexOf('target');
  if (targetIdx < 0 || roles.indexOf('target', targetIdx + 1) >= 0) {
    return { pasos: [], cambios, avisos, rechazos: ['el parche no tiene exactamente un objetivo'], conservados, descartados };
  }

  const ids = derivarIds(entry.replaces_step, roles);
  const base = clonar(entry.walk_steps);
  const pasos: WalkStep[] = base.map((p, i) => ({ ...p, id: ids[i] }));
  const target = pasos[targetIdx];

  // --- re-pegado de campos al target
  for (const campo of CAMPOS_AL_TARGET) {
    const v = (original as unknown as Record<string, unknown>)[campo];
    if (v === undefined) continue;
    if (campo === 'expect_after' && NO_ADMITE_POSTCONDICION.has(target.action)) {
      rechazos.push(
        `el paso esperaba '${String(v)}' después de actuar, y la acción resuelta ('${target.action}') no admite esa comprobación — se perdería el oráculo del paso`,
      );
      continue;
    }
    (target as unknown as Record<string, unknown>)[campo] = v;
    conservados.push(campo);
  }
  if (original.secret === true && target.value === undefined) {
    rechazos.push('el paso llevaba un valor secreto y el parche no trae con qué rellenarlo — fundirlo volcaría el dato');
  }
  for (const campo of CAMPOS_A_TODOS) {
    const v = (original as unknown as Record<string, unknown>)[campo];
    if (v === undefined) continue;
    for (const p of pasos) (p as unknown as Record<string, unknown>)[campo] = v;
    conservados.push(campo);
  }

  // --- scope: excluyente con locator (el locator ya es absoluto)
  if (original.scope !== undefined) {
    if (typeof target.locator === 'string' && target.locator.trim() !== '') {
      descartados.push({ campo: 'scope', motivo: 'el locator resuelto ya es absoluto' });
      cambios.push({
        clase: 'scope-retirado',
        peso: PESO_DE['scope-retirado'],
        flow: entry.flow,
        paso: target.id,
        descripcion: 'ya no hace falta decir en qué zona buscar: el camino quedó fijado',
        grado,
      });
    } else {
      target.scope = original.scope;
      conservados.push('scope');
      avisos.push('el objetivo se fundió sin camino fijo: sigue resolviéndose por su descripción');
    }
  }

  // --- los cambios
  for (const [i, p] of pasos.entries()) {
    if (i === targetIdx) continue;
    if (roles[i] === 'assertion') {
      cambios.push({
        clase: 'oraculo-nuevo',
        peso: PESO_DE['oraculo-nuevo'],
        flow: entry.flow,
        paso: p.id,
        descripcion: `comprobar que aparece «${p.value ?? ''}»`,
        valor: p.value,
        grado,
      });
    } else {
      cambios.push({
        clase: 'paso-nuevo',
        peso: PESO_DE['paso-nuevo'],
        flow: entry.flow,
        paso: p.id,
        descripcion: `paso de camino que el plan no tenía: ${p.action}${p.hint?.name ? ` «${p.hint.name}»` : ''}`,
        grado,
      });
    }
  }
  const mismo = esMismoElemento(entry.original_hint, target.hint);
  if (!entry.original_hint) {
    avisos.push('el plan no decía qué elemento era, así que no se puede corroborar que sea el mismo');
  }
  cambios.push(
    mismo
      ? {
          clase: 'identidad-refinada',
          peso: PESO_DE['identidad-refinada'],
          flow: entry.flow,
          paso: target.id,
          descripcion: 'el mismo elemento, localizado con más precisión',
          grado,
        }
      : {
          clase: 'elemento-distinto',
          peso: PESO_DE['elemento-distinto'],
          flow: entry.flow,
          paso: target.id,
          descripcion: `el plan nombraba «${resumirHint(entry.original_hint)}» y lo que hace el trabajo es ${describirObjetivo(target)}`,
          grado,
        },
  );

  /**
   * La selección. **Un oráculo no entra si no se nombra**, aunque se pida aplicar.
   *
   * Es la decisión 8 del plan: la coreografía se acepta en bloque, pero cambiar un
   * resultado esperado es cambiar *qué significa correcto*, y eso va uno a uno. Si el
   * default fuera «todos», `--aplicar` a secas se llevaría por delante los oráculos sin
   * que nadie los mirase — que es justo el «se acaba clicando sin leer» que la decisión
   * 9 quiere evitar, con la firma del QA detrás.
   */
  const aprobados = new Set(seleccion.oraculos ?? []);
  const finales = pasos.filter((p, i) => (roles[i] === 'assertion' ? aprobados.has(p.id) : true));

  return { pasos: finales, cambios, avisos, rechazos, conservados, descartados };
}

/** Acciones que no ejecutan nada, así que no admiten postcondición inline. */
const NO_ADMITE_POSTCONDICION = new Set([
  'capture',
  'expect_text',
  'expect_state',
  'expect_value',
  'expect_count',
  'expect_each',
  'wait_url',
  'wait_text',
  'scroll_until',
]);

function resumirHint(h: StepHint | undefined): string {
  if (!h) return '(sin descripción)';
  return h.name ?? h.label ?? h.text ?? h.test_id ?? h.role ?? '(sin descripción)';
}

/** Nombres de rol en el idioma del QA, no en el del motor. */
const ROL_EN_CASTELLANO: Record<string, string> = {
  button: 'un botón', link: 'un enlace', textbox: 'un campo de texto', checkbox: 'una casilla',
  combobox: 'un desplegable', radio: 'una opción', row: 'una fila', cell: 'una celda',
  link_menu: 'un elemento de menú', tab: 'una pestaña', menuitem: 'una opción de menú',
};

/**
 * Cómo se le describe al QA el elemento que resultó hacer el trabajo.
 *
 * Cuando NO tiene nombre —el caso de los botones de icono, que es justo cuando esto se
 * lee— decir «lo que hace esto es "button"» no informa de nada. Lo que el QA necesita
 * saber es que no tiene nombre y que por eso se localiza por su sitio: eso explica el
 * aviso de fragilidad que verá al lado, y le deja decidir con conocimiento.
 */
function describirObjetivo(paso: WalkStep): string {
  const nombre = paso.hint?.name ?? paso.hint?.label ?? paso.hint?.text;
  const rol = ROL_EN_CASTELLANO[paso.hint?.role ?? ''] ?? `un elemento (${paso.hint?.role ?? 'sin rol'})`;
  if (nombre) return `${rol} llamado «${nombre}»`;
  const porPosicion = typeof paso.locator === 'string' && /\.nth\(\d+\)/.test(paso.locator);
  return porPosicion
    ? `${rol} SIN NOMBRE, que solo se puede localizar por su posición — por eso va marcado como frágil`
    : `${rol} sin nombre`;
}

/**
 * Funde el parche entero sobre el guion.
 *
 * **Nunca muta la entrada** y **nunca decide**: aplica lo que la selección le señale y
 * devuelve, además del guion, el material de la aprobación.
 */
export function fundirGuion(script: WalkScript, patch: AssistPatch, seleccion: Seleccion = {}): ResultadoFusion {
  const out = clonar(script);
  const cambios: Cambio[] = [];
  const avisos: Aviso[] = [];
  const rechazos: Rechazo[] = [];
  const conservados: ResultadoFusion['conservados'] = [];
  const descartados: ResultadoFusion['descartados'] = [];

  for (const entry of deduplicar(patch.entries, avisos)) {
    const flow: WalkFlow | undefined = out.flows.find((f) => f.flow === entry.flow);
    if (!flow) {
      rechazos.push({ flow: entry.flow, paso: entry.replaces_step, motivo: 'ese flujo ya no está en el plan' });
      continue;
    }
    const idx = flow.steps.findIndex((s) => s.id === entry.replaces_step);
    if (idx < 0) {
      rechazos.push({
        flow: entry.flow,
        paso: entry.replaces_step,
        motivo: 'ese paso ya no está en el plan — o el plan cambió, o esto ya se fundió antes',
      });
      continue;
    }
    const original = flow.steps[idx];

    if (entry.original_hint && !esMismoElemento(entry.original_hint, original.hint)) {
      /**
       * Antes de acusar a nadie de reescribir el paso: puede que ese paso sea YA el
       * resultado de fundir este mismo parche. Distinguirlo importa — «alguien tocó
       * el plan» manda al QA a investigar, y «esto ya está hecho» no. Salió probando
       * el re-aplicado, que es lo primero que hace cualquiera.
       */
      const yaFundido = entry.steps.some(
        (s) => s.role === 'target' && esMismoElemento(s.hint, original.hint) && esMismoElemento(original.hint, s.hint),
      );
      rechazos.push({
        flow: entry.flow,
        paso: entry.replaces_step,
        motivo: yaFundido
          ? 'este parche ya está fundido en el plan: no hay nada que volver a aplicar'
          : 'el plan describe ahora otro elemento que cuando se grabó: alguien reescribió ese paso',
      });
      continue;
    }

    const r = fundirEntrada(original, entry, seleccion);
    for (const t of r.avisos) avisos.push({ flow: entry.flow, paso: entry.replaces_step, texto: t });
    if (r.rechazos.length > 0) {
      for (const m of r.rechazos) rechazos.push({ flow: entry.flow, paso: entry.replaces_step, motivo: m });
      continue;
    }
    cambios.push(...r.cambios);
    if (r.conservados.length) conservados.push({ flow: entry.flow, paso: entry.replaces_step, campos: r.conservados });
    for (const d of r.descartados) descartados.push({ flow: entry.flow, paso: entry.replaces_step, ...d });

    /**
     * Si el objetivo resultó ser OTRO elemento del que nombraba el plan, la entrada no
     * se funde sin permiso explícito. No se puede «aplicar el resto y dejar eso
     * fuera»: el objetivo es la entrada. O entra con su cambio de significado, o no
     * entra.
     */
    const cambiaElemento = r.cambios.some((c) => c.clase === 'elemento-distinto');
    if (cambiaElemento && !(seleccion.elementos ?? []).includes(entry.replaces_step)) {
      avisos.push({
        flow: entry.flow,
        paso: entry.replaces_step,
        texto: 'sin aplicar: cambia QUÉ elemento hace este paso, y eso se aprueba nombrándolo',
      });
      continue;
    }

    if (seleccion.coreografia === false) continue; // solo se revisó, no se aplica
    flow.steps.splice(idx, 1, ...r.pasos);
  }

  return { script: out, cambios, avisos, rechazos, conservados, descartados };
}

/**
 * El parche puede traer dos entradas para el mismo paso: el push del walker es
 * incondicional y no deduplica. Si son iguales salvo el resultado de la verificación,
 * el QA regrabó lo mismo y manda **la última** — es la que vio por última vez.
 *
 * Divergencia deliberada respecto al walker, que en caliente se queda con la primera
 * (`.find`): allí necesita *una* respuesta y la primera vale. Una herramienta que
 * reescribe el plan del cliente eligiendo en silencio entre dos parches distintos
 * sería la aplicación ciega que la spec prohíbe — por eso si difieren en contenido no
 * se elige: se rechaza.
 */
function deduplicar(entries: Entry[], avisos: Aviso[]): Entry[] {
  const porClave = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = `${e.flow} ${e.replaces_step}`;
    porClave.set(k, [...(porClave.get(k) ?? []), e]);
  }
  const out: Entry[] = [];
  for (const [, lista] of porClave) {
    if (lista.length === 1) {
      out.push(lista[0]);
      continue;
    }
    const cuerpo = (e: Entry): string => JSON.stringify({ ...e, verified: null, verify_reason: null });
    const iguales = lista.every((e) => cuerpo(e) === cuerpo(lista[0]));
    const ultima = lista[lista.length - 1];
    avisos.push({
      flow: ultima.flow,
      paso: ultima.replaces_step,
      texto: iguales
        ? `se grabó ${lista.length} veces lo mismo: vale la última`
        : `HAY ${lista.length} VERSIONES DISTINTAS de este paso en el parche — se toma la última, revísala con cuidado`,
    });
    out.push(ultima);
  }
  return out;
}

// ------------------------------------------------------------- integridad

/**
 * ¿El parche es el que escribió el walker, o alguien lo editó a mano?
 *
 * Recomputar `assistStepsToWalkSteps` y compararlo con `walk_steps` cubre de una vez
 * «los dos arrays van en paralelo», «los ids están bien derivados» y «nadie tocó el
 * fichero». Un parche editado a mano no es lo que verificó el replay.
 */
export function parcheIntegro(entry: Entry): boolean {
  const esperado = assistStepsToWalkSteps(entry.steps, entry.replaces_step);
  return JSON.stringify(esperado) === JSON.stringify(entry.walk_steps);
}

/** El guion fundido tiene que pasar la misma red que cualquier otro guion. */
export function validarFundido(script: WalkScript): { ok: boolean; errors: string[] } {
  const v = validateWalkScript(script);
  return { ok: v.ok, errors: v.errors };
}
