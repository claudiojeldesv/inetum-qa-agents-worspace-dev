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
  /**
   * K0.30 (F5) — POSTCONDICIÓN sobre el VALOR de un control: hint + value.
   * Existe porque en las apps corporativas (JSF/ADF/UI5, banca y seguros) el
   * resultado calculado no es texto de la página: es el `value` de un campo de
   * solo lectura o deshabilitado — importe, número de expediente, prima
   * calculada. `expect_text` no lo ve, y asertar "aparece en algún sitio de la
   * pantalla" es justo lo que produce verdes falsos (medido en la gira, §20).
   */
  | 'expect_value'
  | 'expect_count'  // POSTCONDICIÓN de cardinalidad (Fase 6): hint = colección, operator + value numérico
  | 'expect_each'   // POSTCONDICIÓN por-elemento (Fase 6): hint = contenedores, each = condición dentro de cada uno
  | 'scroll_until'  // Fase 4 (virtual scroll): hint = objetivo, container = viewport scrollable, max_steps = tope
  | 'capture';      // captura explícita de pantalla sin acción

/** Operador de comparación de `expect_count`/`expect_each.operator` (Fase 6). */
export type CountOperator = '>' | '>=' | '=' | '<';

/**
 * Condición por-elemento de `expect_each` (Fase 6): dentro de CADA contenedor
 * que matchea el `hint` del paso, cuántos sub-elementos que matchean `hint`
 * (aquí) deben cumplir `operator value`. P.ej. "cada listbox tiene ≥ 1 option".
 */
export interface EachCondition {
  hint: StepHint;
  operator: CountOperator;
  value: string;
}

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
  /**
   * K0.16 — CONTENEDOR dentro del cual resolver el `hint`. Lo emite el refiner
   * desde el vocabulario del FD ("en la ventana 'Documento de Liquidación', pulsa
   * el botón X").
   *
   * Sin esto, los tres botones "X" del CP001 de onesait tienen la MISMA hint y son
   * indistinguibles: ni por hint, ni por alias (la clave se deriva de la hint, así
   * que colisionan). El scope entra en la clave del alias, de modo que cada "X"
   * tiene su propia memoria.
   */
  scope?: StepHint;
  /**
   * K0.16 — locator AUTORITATIVO del paso, en la gramática de cadena
   * (`getByRole(...) >> getByRole(...)`, sufijo `.nth(N)`).
   *
   * Existe porque es lo que emite el parche del modo asistido: sin este campo, un
   * parche cuyo locator esté por encima del tier plano (`scoped`, `anchored`,
   * `indexed`) NO SE PUEDE FUNDIR en el guion — el modo asistido resolvía el paso
   * en su run y no dejaba nada reutilizable. Si deja de resolver, la escalera
   * normal sigue (drift del DOM no bloquea el paso).
   */
  locator?: string;
  /** Fase 6 — operador de `expect_count` (el hint apunta a la COLECCIÓN: filas, opciones...). */
  operator?: CountOperator;
  /** Fase 6 — condición por-elemento de `expect_each` (el hint del paso apunta a los CONTENEDORES). */
  each?: EachCondition;
  /**
   * Fase 5 (SPEC-caos-corporativo §4) — el campo tiene `debounceTime`: tras
   * teclear hay un hueco de calma IGUAL al debounce antes de que salga la
   * petición, y ese hueco es calma FALSA para la ventana de quietud (la clase
   * K0.17 "todavía no ha empezado" reubicada en inputs). `true` usa un default
   * conservador (300 ms, el habitual de un buscador/typeahead); `debounce_ms`
   * declara el intervalo exacto cuando se conoce. El settle de ESTE paso no se
   * cierra hasta que pase ese intervalo — no es un campo por-locator, es una
   * válvula de sincronización, como `settle`.
   */
  debounced?: boolean;
  /** Intervalo exacto del debounce en ms. Tiene prioridad sobre `debounced: true`. */
  debounce_ms?: number;
  /**
   * Fase 4 (SPEC-caos-corporativo §4) — viewport SCROLLABLE de `scroll_until`
   * (listas virtualizadas tipo `cdk-virtual-scroll`: la fila objetivo no
   * existe en el DOM hasta hacer scroll). Distinto de `scope`: `scope` acota
   * DÓNDE buscar un hint ambiguo, `container` es el elemento que se scrollea.
   */
  container?: StepHint;
  /** Tope de iteraciones de scroll de `scroll_until`. Bucle acotado: sin esto, un objetivo ausente cuelga el walk. */
  max_steps?: number;
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
  /**
   * Fase 3 (SPEC-caos-corporativo §4) — matar animaciones de ruta/diálogo: las
   * mantiene la caja del elemento en movimiento y retrasan la accionabilidad (o
   * desplazan el objetivo a mitad del clic). Knob del Style Contract, no del
   * paso: se aplica UNA VEZ al crear el contexto del navegador (reducedMotion +
   * CSS `transition/animation:none`), no por step. Default ON en funcional; se
   * apaga para regresión visual, donde la animación es el objeto de la prueba.
   */
  disable_animations?: boolean;
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
  /**
   * K0.17 — la pantalla no tenía NINGÚN elemento interactivo al empezar a observar.
   * Medido contra OrangeHRM: una SPA que tarda segundos en montar es máximamente
   * quieta antes de montar, y la ventana de quietud la declaraba estable. Cuando
   * esto es true, la quietud exigió además haber visto al menos una mutación.
   */
  started_empty?: boolean;
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
  /**
   * K0.27a (marcador) — la cadena del locator que resolvió el paso, tal como la
   * devolvió la escalera (`resolveHint().via`). Es el dato que convierte un run
   * en una fila del marcador de peldaños: sin él, un paso 'ok' no dice si lo
   * resolvió el determinismo, un alias o el panel. Ausente en pasos sin hint
   * (goto/press/wait_*).
   */
  resolved_via?: string;
  /**
   * Texto COMPLETO del nodo que satisfizo un `expect_text`, cuando no es idéntico
   * al literal buscado. Existe por un verde falso medido en campo (OrangeHRM):
   * el criterio del FD pedía "Records Found" y la pantalla decía "(0) No Records
   * Found" — el literal aparecía, la búsqueda no había encontrado nada, y el caso
   * salía verde. El artefacto registraba el texto BUSCADO, así que el informe
   * escondía justo el dato que delataba el problema.
   *
   * No cambia el veredicto: decidir que "No X" niega a "X" es específico del
   * idioma y sería adivinar. Solo cita lo medido, como la nota de página de error
   * (K0.35) o el conteo fuera del ámbito (K0.36).
   */
  matched_text?: string;
  /**
   * El literal que pedía el FD, guardado JUNTO a `matched_text` para que la fila
   * del informe se explique sola: sin los dos al lado, "coincidencia parcial" no
   * dice de qué. Solo se rellena cuando hay coincidencia parcial.
   */
  value_searched?: string;
  /**
   * K0.39 — id del paso ANTERIOR del mismo flujo que quedó bloqueado. Se rellena
   * solo en aserciones que PASAN: si el paso que debía cambiar la pantalla no se
   * ejecutó, la postcondición puede estar observando el estado previo, y eso ya se
   * ha cobrado verdes falsos. No cambia el veredicto — la aserción se cumplió y
   * puede ser legítima —, solo dice de qué hay que desconfiar.
   */
  after_blocked?: string;
  /**
   * K0.41 — el paso lo resolvió el PELDAÑO DÉBIL (texto visible), que es el
   * último de la escalera y solo entra cuando ningún vocabulario mejor —testid,
   * rol, etiqueta, marcador— describía al elemento.
   *
   * Sale de medir la escalera contra 6.249 páginas reales (§30): el peldaño de
   * rol dio 2.954 aciertos y 5 fallos; el de texto, 1.216 y **33**. O sea que 33
   * de los 38 fallos del corpus entero salieron de aquí. Hoy una resolución por
   * rol y una por texto se reportaban EXACTAMENTE IGUAL, y no lo son.
   *
   * No cambia el veredicto ni la cobertura: el paso resolvió y punto. Lo que
   * cambia es que el QA sepa dónde mirar — unos pocos pasos de cada cien en vez
   * de todos. Convierte el fallo residual de silencioso en visible, que es lo
   * único que le faltaba para ser auditable.
   */
  peldano_debil?: true;
  /**
   * El elemento que resolvió, DICHO EN CASTELLANO («el enlace "Cerrar", en el pie
   * de página»). El locator dice con qué frase se buscó; esto dice qué se tocó, y
   * es lo único con lo que un QA funcional puede juzgar el aviso sin abrir el
   * navegador. Solo se rellena para el peldaño débil, que es donde hay que juzgar.
   */
  resolved_desc?: string;
  /**
   * K0.41 — además del peldaño débil, el flujo NO comprueba nada después de este
   * paso. Es la combinación que de verdad preocupa: resuelto por el vocabulario
   * más flojo y sin ninguna aserción de negocio detrás que delate el error. Con
   * red, un elemento equivocado suele hacer fallar la postcondición; sin red, no
   * lo caza nadie — y el Reviewer tampoco, porque lee código, no la pantalla.
   */
  sin_red?: true;
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
  /**
   * Texto COMPLETO del nodo, cuando el `name` registrado es solo un fragmento de
   * él. Ver `StepReport.matched_text`: la evidencia tiene que decir lo que había
   * en pantalla, no lo que se buscó.
   */
  matched_text?: string;
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
  /** Tablas capturadas como datos estructurados (Fase 6). */
  tables?: DomTable[];
}

/**
 * Fase 6 (SPEC-caos-corporativo §4) — tabla capturada como DATOS: el notario
 * copia headers+rows vía un único `evaluate` (nunca cuenta como "hecho
 * interpretado" — eso es trabajo del LLM en la fase de derivación, que compara
 * esto contra lo que el plan esperaba). Solo se captura cuando `expect_count`
 * resolvió al menos una fila; una tabla sin filas no tiene de dónde subir al
 * ancestro `<table>`, y "no hay datos" ya queda dicho por el propio outcome.
 */
export interface DomTable {
  headers: string[];
  rows: string[][];
  frame_path?: string[];
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
  /**
   * K0.29 — por qué el snapshot llegó vacío, cuando llegó vacío. Existe porque
   * el silencio era peor que el fallo: el subagent recibía `aria_snapshot: ""`
   * sin explicación y solo podía responder null a ciegas o inventar.
   */
  snapshot_error?: string;
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
  /**
   * K0.20 (A+B) — locator escrito/corregido a mano por el QA en el panel, que
   * SUSTITUYE al que calcularía la escalera. La página es la fuente de la verdad:
   * cuando el plan/DF está desactualizado o la escalera no acierta, el QA teclea el
   * locator correcto y se valida en vivo contra el DOM antes de aceptarlo. Autoritativo.
   */
  manual_locator?: string;
}

/**
 * Candidato de locator con su nivel de la escalera y si es frágil. La fragilidad se
 * PROPAGA al parche y al panel: un `nth` funciona hoy y se rompe al añadir una fila,
 * y el QA tiene derecho a saberlo antes de aceptarlo.
 */
export interface LocatorCandidate {
  source: string;
  tier: 'semantic' | 'scoped' | 'anchored' | 'indexed' | 'css' | 'manual';
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
    /**
     * K0.16 — los mismos pasos ya en forma de `WalkStep[]`, listos para pegar en el
     * guion sustituyendo al paso bloqueado. Traducir a mano el parche era un paso
     * manual con margen de error, y con locators por encima del tier plano era
     * directamente imposible antes de que WalkStep tuviera `locator`.
     */
    walk_steps: WalkStep[];
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
