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
  };
  screens: DomScreen[];
  transitions: DomTransition[];
  open_questions: BlockedStep[];
  rescues: RescueRecord[];
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
