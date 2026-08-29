/**
 * El veredicto del QA sobre una postcondición incumplida (fase B de
 * `docs/tasks/plan-panel-y-acta.md`).
 *
 * ## Por qué existe
 *
 * Cuando un `expect_text` no se cumple, el walker llamaba a `blockStep` y volvía:
 * el drift quedaba escrito en el informe y ahí moría. Era **el único drift que no
 * podía llegar al acta**, justo el que más falta hace que llegue — porque un
 * `expect_text` incumplido no es un problema de locator, es el negocio diciendo
 * algo distinto de lo que el FD escribió, y quién tiene razón NO lo puede decidir
 * un programa (decisión 1 del plan).
 *
 * ## Lo que este módulo NO hace
 *
 * No juzga. Traduce el gesto del QA a una entrada del acta, y **se niega** cuando
 * el gesto no es una decisión. Esa negativa es la mitad del valor: una decisión
 * `app` que no dice QUÉ dice la aplicación no sirve para nada aguas abajo (la
 * propuesta de FD de la fase C no tendría con qué sustituir el criterio), pero
 * queda firmada igual de bonita en el acta. Firmar humo es peor que no firmar.
 *
 * Puro a propósito: cero `fs`, cero reloj, cero navegador. El walker aporta los
 * hechos medidos, este módulo decide si con eso hay decisión.
 */
import type { DecisionInput, EvidenceGrade } from '../../src/decisions.ts';

/** Los tres botones del panel. Mismo vocabulario que el acta, no otro. */
export type VerdictKind = 'app' | 'fd' | 'defer';

export const VERDICT_KINDS: readonly VerdictKind[] = ['app', 'fd', 'defer'];

/**
 * Lo que el panel manda a Node cuando el QA pulsa uno de los tres botones.
 *
 * Deliberadamente NO es un `AssistSubmission`: aquel payload transporta una
 * secuencia de elementos señalados para construir un locator, y aquí no hay
 * locator que construir. Mezclarlos obligaría a que cada consumidor comprobase
 * cuál de las dos formas le ha llegado.
 */
export interface VerdictSubmission {
  step: string;
  verdict: VerdictKind;
  /** El literal que el QA adopta como resultado correcto. Solo tiene sentido con 'app'. */
  value?: string;
  /** De dónde salió el literal: elegido de la lista medida, o señalado en la pantalla. */
  source?: 'candidato' | 'senalado';
  reason?: string;
}

/** Los hechos que el walker ya tiene medidos cuando abre el panel. */
export interface VerdictContext {
  rf: string;
  flow: string;
  step: string;
  fdHash: string;
  scriptHash: string;
  actor: string;
  /** Lo que el FD pedía y no se observó. */
  esperado: string;
}

export type VerdictOutcome =
  | { ok: true; input: Omit<DecisionInput, 'timestamp'>; nota: string }
  | { ok: false; motivo: string };

/**
 * Un literal de comprobación es una frase, no media pantalla. Por encima de esto
 * lo que se ha señalado es un contenedor, y un `expect_text` con 300 caracteres
 * dentro es un test que se rompe con cualquier retoque de maquetación.
 */
export const MAX_LITERAL = 300;

/**
 * Los relojes de una espera, en un solo objeto.
 *
 * Suena a rodeo y no lo es: quien los para es `finish`, que se define ANTES de que
 * existan (la inyección del panel puede fallar y cerrar la espera antes del primer
 * `setTimeout`). Con dos `let` sueltos eso obliga a leerlos antes de asignarlos;
 * con un contenedor, `finish` cierra sobre algo que ya existe y para lo que haya.
 */
export interface Relojes {
  espera?: ReturnType<typeof setTimeout>;
  vigilante?: ReturnType<typeof setInterval>;
}

/** Para lo que haya arrancado. Idempotente: se llama desde un `finish` con cerrojo. */
export function pararRelojes(r: Relojes): void {
  if (r.espera !== undefined) clearTimeout(r.espera);
  if (r.vigilante !== undefined) clearInterval(r.vigilante);
}

/**
 * El grado que corresponde a un veredicto del panel, siempre el mismo y por una
 * razón concreta: el QA está mirando la pantalla de ESTE run, con el estado que
 * dejaron los pasos anteriores. No hay reproducción en contexto limpio, así que
 * `desde-cero` sería mentira; y hay observación directa sobre la página, así que
 * `sin-verificar` se quedaría corto. Es exactamente lo que el schema llama
 * `en-vivo`: «comprobado contra la página actual».
 *
 * Es una constante y no un parámetro para que nadie pueda subirlo desde fuera.
 */
export const GRADO_DEL_VEREDICTO: EvidenceGrade = 'en-vivo';

/**
 * Traduce el gesto del QA a una entrada del acta, o dice por qué no hay decisión.
 *
 * El mensaje de la negativa se le enseña al QA con el panel todavía en pantalla,
 * así que está escrito para que pueda corregir sin salir de allí.
 */
export function veredictoADecision(sub: VerdictSubmission, ctx: VerdictContext): VerdictOutcome {
  if (!VERDICT_KINDS.includes(sub.verdict)) {
    return { ok: false, motivo: `veredicto desconocido: '${String(sub.verdict)}'` };
  }

  const base = {
    rf: ctx.rf,
    paso: `${ctx.flow}/${ctx.step}`,
    decision: sub.verdict,
    fd_hash: ctx.fdHash,
    script_hash: ctx.scriptHash,
    evidencia: GRADO_DEL_VEREDICTO,
    actor: ctx.actor,
  } as const;

  if (sub.verdict !== 'app') {
    /**
     * `fd` y `defer` NO llevan `valor_nuevo`, aunque el panel lo mande. Un
     * «es un defecto» que además propone un texto nuevo son dos decisiones
     * contradictorias en una firma, y la de la fase C leería la propuesta como
     * si el QA la hubiera adoptado.
     */
    const nota =
      sub.verdict === 'fd'
        ? `el QA declara DEFECTO de la aplicación: el FD pedía '${ctx.esperado}' y la pantalla no lo muestra`
        : `el QA lo deja PARA LUEGO: la discrepancia sobre '${ctx.esperado}' queda sin resolver`;
    return { ok: true, input: base, nota };
  }

  const valor = (sub.value ?? '').trim();
  if (!valor) {
    return {
      ok: false,
      motivo:
        'Para adoptar lo que dice la aplicación hace falta saber QUÉ dice: elige uno de los ' +
        'textos de la lista o señálalo en la pantalla. Sin literal no hay nada que sustituya ' +
        'al criterio del FD, y la decisión no serviría de nada.',
    };
  }
  if (valor.length > MAX_LITERAL) {
    return {
      ok: false,
      motivo:
        `Eso son ${valor.length} caracteres: has señalado un contenedor, no un resultado. ` +
        `Un literal de comprobación tiene que caber en una frase (máximo ${MAX_LITERAL}); ` +
        'si no, el test se rompe con cualquier retoque de maquetación.',
    };
  }
  if (valor === ctx.esperado) {
    /**
     * El paso falló porque ese texto NO se encontró. Adoptarlo como «lo que dice la
     * aplicación» es firmar que la aplicación dice justo lo que se acaba de medir
     * que no dice. No se bloquea al QA: los otros dos botones siguen ahí.
     */
    return {
      ok: false,
      motivo:
        `Ese es exactamente el texto que el FD ya pedía ('${ctx.esperado}') y que no aparece ` +
        'en la pantalla. Adoptarlo no cambia nada. Si crees que la aplicación está mal, el ' +
        'botón es «Es un defecto».',
    };
  }

  const origen = sub.source === 'senalado' ? 'señalado en la pantalla' : 'elegido de lo medido en la pantalla';
  return {
    ok: true,
    input: { ...base, valor_nuevo: valor },
    nota: `el QA adopta lo que dice la APLICACIÓN: '${valor}' (${origen}), en lugar de '${ctx.esperado}'`,
  };
}

/**
 * La frase que se AÑADE al motivo del bloqueo, nunca la que lo sustituye.
 *
 * El mensaje de bloqueo actual está fijado por dos tests de K0.35 —que la
 * postcondición fallida siga citando la excepción y el título de una página de
 * error— y esos tests protegen una distinción que costó una gira entera: «el
 * negocio no ocurrió» y «la aplicación se cayó» no son el mismo hallazgo. El
 * veredicto es información NUEVA, y va detrás.
 */
export function motivoConVeredicto(motivoOriginal: string, nota: string, hash: string): string {
  return `${motivoOriginal} — VEREDICTO DEL QA: ${nota} [decisión ${hash}]`;
}

/**
 * El motivo ampliado cuando NO se pregunta, y por qué. También va detrás del
 * original, y también sin sustituirlo.
 *
 * Existe para un caso concreto: la postcondición que falla porque un paso ANTERIOR
 * del mismo flujo quedó bloqueado. Ahí no hay nada que decidir —la pantalla no es la
 * que el caso describe porque el camino no ocurrió— y quien lea el informe tiene que
 * poder distinguirlo de un drift de verdad.
 */
export function motivoSinVeredicto(motivoOriginal: string, causa: string): string {
  return `${motivoOriginal} — NO se pidió veredicto: ${causa}`;
}

/**
 * Las acciones que **observan** y no mueven la aplicación. Un `expect_*` que falla
 * deja un hallazgo, no un estado distinto: la pantalla siguiente es exactamente la
 * misma que si hubiera pasado.
 *
 * Es la lista que decide si un paso bloqueado rompe el camino o no, y va como DATO
 * y no como una condición enterrada: es lo que hay que tocar cuando `WalkAction`
 * crezca, y lo que un test puede recorrer entero.
 */
export const ACCIONES_QUE_OBSERVAN: readonly string[] = [
  'expect_text',
  'expect_state',
  'expect_value',
  'expect_count',
  'expect_each',
  'capture',
];

/**
 * ¿Un paso bloqueado deja la aplicación donde el caso no la describe?
 *
 * **Solo si ese paso iba a mover algo.** La primera versión de esta regla miraba
 * únicamente si había algún paso previo bloqueado, y se comió el panel del ejercicio
 * de campo: una postcondición bloqueada dos pasos antes silenció la pregunta de la
 * siguiente, cuando el clic de en medio había funcionado y la pantalla era justo la
 * correcta. Pasarse de ancho aquí es la forma silenciosa de deshacer la fase B.
 */
export function rompeElCamino(action: string): boolean {
  return !ACCIONES_QUE_OBSERVAN.includes(action);
}

/**
 * La causa que se cuenta cuando el camino no llegó. Un solo sitio: la escribe el
 * walker en el informe y la lee el QA en consola.
 */
export function causaCaminoRoto(pasosBloqueados: readonly string[]): string {
  const lista = pasosBloqueados.join(', ');
  return (
    `antes de este paso ya se había bloqueado ${pasosBloqueados.length === 1 ? 'el paso' : 'los pasos'} ` +
    `${lista}, así que la pantalla no es la que el caso describe. Que el texto no aparezca no dice ` +
    'nada sobre quién tiene razón: resuelve primero lo de arriba y vuelve a correr'
  );
}

/**
 * Por qué NO se abrió el panel, cuando el run lleva `--assist` pero falta algo para
 * poder firmar.
 *
 * Esto es el fail-closed puesto en la puerta, y es la misma regla que la fusión ya
 * aplica: los cerrojos de escritura van ANTES de gastar la atención del QA. Abrir
 * un panel para pedirle un veredicto que después no se va a poder firmar le hace
 * trabajar para nada y pierde la decisión en silencio, que es justo lo que el acta
 * existe para impedir.
 */
export function porQueNoSeAbre(faltan: readonly string[]): string {
  return (
    `[dom-walker] postcondición incumplida y NO se abre el panel de veredicto: ${faltan.join('; ')}.\n` +
    '            El paso queda bloqueado como siempre. Para poder decidir aquí mismo, relanza con\n' +
    '            --actor=<nombre> y --fd=<path> (o --sin-fd si el run no tiene FD).'
  );
}

/**
 * Qué le falta al run para poder firmar un veredicto. Devuelve la lista de motivos
 * en el orden en que conviene leerlos; vacía = se puede abrir el panel.
 *
 * Se calcula APARTE de abrir el panel, y sobre datos ya resueltos, para que el
 * walker pueda comprobarlo sin efectos secundarios y un test pueda recorrer las
 * combinaciones sin levantar un navegador.
 */
export function faltaParaFirmar(args: {
  actor: string | null;
  fdHash: string | null;
  rf: string | null;
  actaSana: boolean;
}): string[] {
  const faltan: string[] = [];
  if (!args.actor) faltan.push('no hay actor declarado (--actor= o QA_ACTOR)');
  if (!args.fdHash) faltan.push('no se sabe contra qué FD se decide (--fd=, --fd-hash= o --sin-fd)');
  if (!args.rf) faltan.push('el flujo no declara un criterio único: pásalo con --rf=');
  if (!args.actaSana) faltan.push('el acta del sitio tiene la cadena rota y no se firma encima');
  return faltan;
}
