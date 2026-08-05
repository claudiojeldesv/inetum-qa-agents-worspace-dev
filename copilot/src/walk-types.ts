/**
 * Tipos del dom-walker (edición Copilot, S3). Copilot-only: vive en copilot/src,
 * NO en src/ core (decisión cerrada del plan; promoción a core = decisión futura).
 *
 * Dos contratos de datos:
 *  - walk-script.json  (INPUT): guion de pasos por flujo. En H2 lo emite el
 *    ia4d-spec-refiner adaptado; en H1 se escribe a mano como fixture.
 *  - dom-map.json      (OUTPUT): mapa podado del DOM recorrido — pantallas,
 *    elementos con locators candidatos por prioridad del contract, formularios,
 *    transiciones, iframes (frame_path) y pasos bloqueados (open_questions).
 */

/** Pista declarativa para resolver un elemento contra el DOM vivo. */
export interface StepHint {
  /** data-test / data-testid / etc. Máxima prioridad si el contract la lista. */
  test_id?: string;
  /** Rol ARIA esperado ('button', 'textbox', 'link', ...). */
  role?: string;
  /** Accessible name esperado (matching case-insensitive, substring). */
  name?: string;
  /** Texto de label asociado (inputs). */
  label?: string;
  /** Texto visible (último recurso de la prioridad). */
  text?: string;
}

export type WalkAction =
  | 'goto'          // target = path o URL absoluta
  | 'fill'          // hint + value (soporta refs $fixtures.*)
  | 'click'
  | 'hover'         // abridor de menús que despliegan por hover (K0.10). Sin él, el item del
                    // submenú resuelve en el DOM pero nunca es clicable: timeout opaco.
  | 'select'        // hint + value (option label o value)
  | 'check'
  | 'uncheck'
  | 'press'         // value = tecla ('Enter', 'Tab', ...)
  | 'wait_url'      // target = substring/regex-source de URL esperada
  | 'wait_text'     // value = texto visible esperado
  | 'expect_text'   // POSTCONDICIÓN del FD: value = texto de negocio. Fallo → drift (open_question);
                    // éxito → el texto se registra como business_text de la pantalla con locator
  | 'expect_state'  // POSTCONDICIÓN del FD: hint + value ∈ visible|enabled|disabled|checked|unchecked
  | 'capture';      // captura explícita de pantalla sin acción

export interface WalkStep {
  id: string;                    // único dentro del flujo, p.ej. 's3'
  action: WalkAction;
  hint?: StepHint;               // requerido para fill/click/select/check/uncheck
  target?: string;               // goto/wait_url
  value?: string;                // fill/select/press/wait_text; admite '$fixtures.<path>'
  secret?: boolean;              // no volcar el value a dom-map/audit (p.ej. passwords)
  screen?: string;               // nombre semántico de la pantalla tras el paso (si transiciona)
  expect_transition?: boolean;   // tras el paso se espera navegación/cambio de pantalla → capturar
  dialog?: 'accept' | 'dismiss'; // manejo del diálogo nativo que dispara el paso
  optional?: boolean;            // si no resuelve, se anota y se continúa SIN rescate
  /**
   * K0.13 capa 3 — postcondición INLINE del paso: texto de negocio que debe
   * aparecer después de la acción. Es a la vez aserción y ORÁCULO de
   * sincronización: si no aparece, el paso no surtió efecto (o hay drift), y esa
   * distinción se resuelve comparando la huella de pantalla, no adivinando.
   */
  expect_after?: string;
  /**
   * ¿Se puede repetir la acción sin duplicar estado de negocio? Default por
   * acción (ver isRetrySafe): hover/fill/press/select son seguras; `click` NO,
   * porque re-pulsar "Finalizar" crea dos declaraciones. Opt-in explícito para
   * los clicks de navegación.
   */
  retry_safe?: boolean;
  /** Válvula declarada para la pantalla patológica: settle propio de este paso. */
  settle?: SettleProfile;
}

// -------------------------------------------- sincronización (K0.13, capa 2)

/**
 * Perfil de settle. La señal de quietud es una VENTANA, no una comprobación
 * instantánea: con spinners que se abren 2 o 3 veces por carga, "el spinner no
 * está visible ahora" es falso positivo — el hueco entre ciclos parece calma.
 * Se exige quietud CONTINUADA durante quiet_ms.
 *
 * Agotar timeout_ms NO es un fallo: se continúa y se anota. El veredicto lo da
 * la postcondición (capa 3), no el reloj.
 */
export interface SettleProfile {
  /** ms consecutivos de quietud exigidos. Default DEFAULT_SETTLE.quiet_ms. */
  quiet_ms?: number;
  /** tope de espera. Agotarlo se registra como settle_timeout y se sigue. */
  timeout_ms?: number;
  /**
   * Mutaciones toleradas DENTRO de la ventana. Un ciclo de spinner produce
   * decenas; un reloj que tictaquea, una. Es un umbral de TASA, y por eso una
   * app con polling que repinta un contador no cuelga el walk para siempre.
   */
  max_mutations?: number;
  /** Selectores de "ocupado" propios del sitio, además de los heurísticos. */
  busy_selectors?: string[];
  /** Subárboles cuyas mutaciones no cuentan (relojes, contadores, chats). */
  ignore_selectors?: string[];
}

/** Lo OBSERVADO en un settle. Es telemetría, no veredicto. */
export interface SettleObservation {
  waited_ms: number;
  /** Veces que una señal de ocupado apareció: los ciclos de spinner, contados. */
  busy_cycles: number;
  /** Veces que la ventana de quietud se reinició por exceso de mutaciones. */
  resets: number;
  timed_out: boolean;
  /** Qué selectores de ocupado matchearon de verdad (los demás no se reportan). */
  signals: string[];
}

/**
 * Desenlace de un paso. La distinción que importa: `ok_after_retry` es ruido de
 * entorno y `postcondition_unmet` es candidato a drift. Confundirlos envenena el
 * informe de reconciliación — reportaríamos que el plan cambió cuando solo hubo
 * un spinner.
 */
export type StepOutcome =
  | 'ok'
  | 'ok_after_retry'
  | 'settle_timeout'
  | 'postcondition_unmet'
  | 'action_failed';

export interface StepReport {
  flow: string;
  step: string;
  action: WalkAction;
  outcome: StepOutcome;
  action_ms: number;
  screen?: string;
  settle?: SettleObservation;
  retried: boolean;
  retry_reason?: string;
  /** Por qué NO se reintentó habiendo motivo: la acción podía duplicar negocio. */
  retry_refused?: string;
}

/**
 * Perfil de tiempos observados, durable (K0.13, capas 4 y 6). Convierte el
 * "10 segundos" inventado en un p95 medido por paso, y cada run recalibra: la
 * flakiness converge a la baja en vez de pelearse para siempre.
 * Fichero `config/timing-profiles/<site_id>.json`, versionable como los aliases.
 */
export interface TimingProfile {
  version: 1;
  site_id: string;
  /** clave '<flow>/<step>' → muestras de espera de settle en ms (las últimas N). */
  steps: Record<string, { samples: number[]; screen?: string; updated: string }>;
}

export interface WalkFlow {
  flow: string;                  // id del flujo (coincide con criteria[].flow)
  criteria?: string[];           // RF-NNN que este flujo cubre (trazabilidad)
  steps: WalkStep[];
}

export interface WalkScript {
  version: 1;
  site_id: string;
  entry: string;                 // path inicial relativo a la base URL (o URL absoluta)
  base_url?: string;             // opcional; si falta se pasa por CLI/env
  flows: WalkFlow[];
  /** Settle por defecto del sitio. Precedencia: default < contract < script < paso. */
  settle?: SettleProfile;
}

/** Elemento capturado (post-poda). */
export interface DomElement {
  role: string;
  name?: string;
  test_id?: string;
  label?: string;
  /** Cadena de iframes desde el top hasta el frame del elemento. Vacío = top. */
  frame_path?: string[];
  /** Locators candidatos ordenados según locators.priority del contract. */
  locator_candidates: string[];
  /** Nº de apariciones deduplicadas (componentes repetidos, p.ej. cards). */
  count?: number;
  disabled?: boolean;
}

export interface DomForm {
  name: string;                  // accesible o derivado (form0, form1...)
  frame_path?: string[];
  fields: DomElement[];
  submit?: DomElement;
}

export interface DomScreen {
  name: string;                  // step.screen o slug derivado de la URL
  url_pattern: string;
  flow: string;                  // flujo durante el que se capturó
  elements: DomElement[];
  forms: DomForm[];
  landmarks: DomElement[];       // nav/main/banner/contentinfo/search
  /**
   * Textos de resultado NO interactivos (headings, role=alert/status): las
   * postconditions de negocio que el Writer necesita asertar y que la captura
   * de interactivos no ve (gap semántico clase checkout, Fase A). K0.3.
   */
  business_text?: DomElement[];
  /** Elementos descartados por el cap por pantalla (transparencia de poda). */
  truncated?: number;
  dialogs?: string[];            // mensajes de diálogos nativos aparecidos
}

export interface DomTransition {
  from: string;
  to: string;
  flow: string;
  step: string;                  // id del paso que la provocó
  via: string;                   // locator usado
}

export interface BlockedStep {
  flow: string;
  step: string;
  action: WalkAction;
  hint?: StepHint;
  reason: string;                // por qué quedó bloqueado (sin adivinar)
  rescue_attempted: boolean;
}

export interface RescueRecord {
  flow: string;
  step: string;
  resolved: boolean;
  locator?: string;
  audit_logged: boolean;
}

export interface DomMap {
  version: 1;
  site_id: string;
  generated_by: 'dom-walker';
  generated_at: string;          // único campo no-determinista (gate: igual módulo timestamps)
  target_url: string;
  contract: string;
  testid_attribute: string;
  stats: {
    flows: number;
    steps_total: number;
    steps_executed: number;
    steps_blocked: number;
    rescues_used: number;
    rescue_budget: number;
    screens: number;
    /** Pasos que solo pasaron al reintentar: ruido de entorno, NO drift (K0.13). */
    flaky_timing: number;
    /** Pasos que no se estabilizaron dentro del tope y siguieron adelante. */
    settle_timeouts: number;
    /** Postcondiciones no cumplidas con el estado ya cambiado: candidatos a drift. */
    postcondition_unmet: number;
  };
  screens: DomScreen[];
  transitions: DomTransition[];
  open_questions: BlockedStep[];
  rescues: RescueRecord[];
  /**
   * Telemetría por paso: tiempos, ciclos de spinner observados y desenlace (K0.13).
   * Opcional para poder leer dom-maps generados antes de K0.13 sin migrarlos.
   */
  step_reports?: StepReport[];
}

/** Petición de rescate LLM (handoff por archivo: el orquestador delega en Haiku). */
export interface RescueRequest {
  version: 1;
  site_id: string;
  flow: string;
  step: string;
  action: WalkAction;
  hint?: StepHint;
  /** Snapshot ARIA podado del frame donde falló la resolución. */
  aria_snapshot: string;
  frame_path: string[];
  budget_remaining: number;
  instructions: string;          // qué debe devolver el subagent (rescue-response.json)
}

/** Respuesta del subagent de rescate. locator=null → no resoluble, paso a open_questions. */
export interface RescueResponse {
  step: string;
  locator: string | null;
  reason?: string;
}

// ------------------------------------------------- modo asistido (K0.10)

/**
 * Elemento señalado por el QA en el overlay. Los campos los extrae el MISMO
 * código in-page que usa la captura del dom-map (fragmento compartido), para que
 * el locator del picker y el del dom-map no puedan divergir.
 */
export interface PickedElement {
  role: string;
  name?: string;
  test_id?: string;
  label?: string;
  /** 'click' = el QA lo pulsó · 'hover' = pasó por encima de forma sostenida. */
  via: 'click' | 'hover';
  // --- contexto para la escalera de fallback (K0.11b). Sin esto, un elemento sin
  // identidad semántica (input sin name/label/test-id: la norma en formularios Java
  // corporativos) no tiene locator posible y la asistencia se rendía tras el trabajo
  // del humano. Playwright genera algo casi siempre; esto es lo que le faltaba.
  /** Ancestro más cercano con role+name — ancla de scope. */
  anchor?: { role: string; name: string };
  /** Texto previo más cercano (patrón label-en-celda de tablas corporativas). */
  nearby_text?: string;
  /** Índice del elemento entre los de su mismo rol dentro del ancla (o del documento). */
  nth_of_role?: number;
  /** id del DOM y juicio de estabilidad (los generados no sirven como locator). */
  dom_id?: string;
  id_stable?: boolean;
  /** Rol del elemento marcado por el QA como comprobación (K0.11c). */
  as?: 'opener' | 'target' | 'assertion';
}

/**
 * Candidato de locator con su nivel de la escalera y si es frágil. La fragilidad se
 * PROPAGA al parche y al panel: un `nth` funciona hoy y se rompe al añadir una fila,
 * y el QA tiene derecho a saberlo antes de aceptarlo.
 */
export interface LocatorCandidate {
  source: string;
  tier: 'semantic' | 'scoped' | 'anchored' | 'indexed' | 'css';
  fragile: boolean;
  why?: string;
}

/**
 * Payload que el overlay manda a Node vía exposeFunction al pulsar Parar (o los
 * botones de escape). `sequence` va en orden cronológico: el ÚLTIMO click es el
 * objetivo del paso; lo anterior es el camino (abridores de menú).
 */
export interface AssistSubmission {
  kind: 'recorded' | 'drift' | 'block';
  step: string;
  sequence: PickedElement[];
  /** Índice del objetivo si el QA lo marcó explícitamente; si no, el último click. */
  target_index?: number;
  /** true si el último click del QA ya ejecutó la acción del paso (la app navegó). */
  performed?: boolean;
  /**
   * false = "capturar sin ejecutar" (K0.14): se construye y verifica el parche pero
   * NO se ejecuta la acción del paso, y el flujo se aborta. Existe porque capturar
   * el locator de un "Finalizar" no puede costar una declaración de verdad.
   * Ausente o true = comportamiento normal.
   */
  execute?: boolean;
  reason?: string;
}

/** Un paso propuesto por el modo asistido, listo para insertar en el guion. */
export interface AssistPatchStep {
  action: WalkAction;
  hint: StepHint;
  locator: string;
  role: 'opener' | 'target' | 'assertion';
  /** Nivel de la escalera del locator y fragilidad (K0.11a). */
  tier?: LocatorCandidate['tier'];
  fragile?: boolean;
  fragile_why?: string;
  /** value del paso cuando es una comprobación (expect_text). */
  value?: string;
}

/**
 * Parche del modo asistido. Se escribe en `assist-patch.json` del workDir y
 * NUNCA se aplica solo al guion: el walk-script es artefacto del cliente,
 * afinado a mano, y reescribirlo en silencio sería inaceptable. El QA lo revisa
 * y lo funde.
 */
export interface AssistPatch {
  version: 1;
  site_id: string;
  generated_at: string;
  entries: Array<{
    flow: string;
    /** Paso del guion que estaba bloqueado y que estos pasos sustituyen. */
    replaces_step: string;
    original_hint?: StepHint;
    steps: AssistPatchStep[];
    /** Replay en contexto fresco: ¿el parche reproduce de verdad? */
    verified: boolean;
    verify_reason?: string;
  }>;
}

/**
 * Estado reanudable del walk (sin timeout de subagents, reanudar ES la mitigación).
 * Semántica de resume: los flujos 100% completados se saltan (su sesión de navegador
 * se restaura desde walk-session.json); el flujo en curso se REPLAYEA desde entry para
 * reconstruir el estado in-page, saltando pasos bloqueados y reutilizando rescates
 * resueltos (state.rescues) sin gastar presupuesto de nuevo.
 */
export interface WalkState {
  script_hash: string;
  completed: string[];           // ids 'flow/step' ya ejecutados
  rescues_used: number;
  screens: DomScreen[];
  transitions: DomTransition[];
  open_questions: BlockedStep[];
  rescues: RescueRecord[];
  current_screen: string | null;
  testid_attr?: string;          // autodetección estable entre reanudaciones
  /** Telemetría de sincronización acumulada (K0.13); tolerante a checkpoints viejos. */
  step_reports?: StepReport[];
}

/**
 * Aliases de hints (K0.5): memoria de instancias del cliente. Un rescate pagado
 * (y con postcondición cumplida) se promueve aquí y no se vuelve a pagar nunca.
 * Fichero durable `config/hint-aliases/<site_id>.json` — semilla del client pack,
 * versionable y revisable por PR. La clave es el hint normalizado (aliasKey).
 */
export interface HintAlias {
  locator: string;               // grammar de locatorFromSource (getBy* | css=)
  hint: StepHint;                // hint original que falló (documentación)
  origin: { flow: string; step: string; date: string };
}

export interface HintAliasFile {
  version: 1;
  site_id: string;
  aliases: Record<string, HintAlias>;
}

/** Exit codes del CLI: el runner/orquestador distingue rescate de error. */
export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_RESCUE_NEEDED = 42;
