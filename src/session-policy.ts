/**
 * Política de sesiones concurrentes del target — medida, no declarada.
 *
 * Muchas aplicaciones corporativas (banca, seguros, ERPs) no permiten al mismo usuario
 * tener dos sesiones vivas a la vez. Eso NO suele estar escrito en ningún documento
 * funcional, y cuando está, está desactualizado. Pero cambia cómo hay que ejecutar la
 * suite, así que hay que saberlo.
 *
 * **El peligro no es que un test falle: es que este defecto se disfraza de flakiness.**
 * Nuestra propia configuración lo tiene servido hoy: `playwright.config.ts` corre
 * `fullyParallel: true` con varios workers, el proyecto de auth comparte `storageState`,
 * y a la vez el spec que valida el login hace su PROPIO login (`test.use({ storageState:
 * { cookies: [], origins: [] } })`, tal cual en el TC-001 de ParaBank). En una aplicación
 * de sesión única, ese segundo login invalida la sesión compartida y los demás specs caen
 * de forma intermitente. Se diagnostica como timing y no lo es.
 *
 * La asimetría del default es deliberada: equivocarse hacia **serializar** cuesta unos
 * minutos de reloj; equivocarse hacia paralelizar cuesta una suite intermitente, un
 * diagnóstico equivocado y la confianza del cliente. En la duda, se serializa.
 */

/** Lo que el contract puede declarar. `unknown` es el default honesto. */
export type PoliticaDeclarada = 'single' | 'multiple' | 'unknown';

/** Lo que la sonda concluye. Los dos `single-*` se distinguen porque se arreglan distinto. */
export type PoliticaMedida =
  | 'multiple'
  /** El segundo login expulsa al primero: la sesión compartida muere a mitad de suite. */
  | 'single-last-wins'
  /** El segundo login es rechazado: el test que intenta loguearse falla, el resto sigue. */
  | 'single-first-wins'
  /** No se pudo distinguir (p.ej. límite de N sesiones, throttling por IP). */
  | 'inconclusive';

/** Lo que la sonda observa. Tres hechos, ninguno interpretado. */
export interface ObservacionSonda {
  /** ¿La sesión A sigue autenticada DESPUÉS de que B se autenticara? */
  aSobrevive: boolean;
  /** ¿B llegó a la señal de éxito? */
  bAutenticada: boolean;
  /** Literal capturado si B fue rechazada. Evidencia, no adorno. */
  bRechazoTexto?: string;
}

export interface VeredictoSesion {
  policy: PoliticaMedida;
  /** La consecuencia operativa: ¿hay que ejecutar la suite en serie? */
  serialize: boolean;
  reason: string;
}

/**
 * Clasifica las tres observaciones. Sin heurística ni umbrales: es una tabla de verdad.
 */
export function classifySessionPolicy(obs: ObservacionSonda): VeredictoSesion {
  if (obs.bAutenticada && obs.aSobrevive) {
    return {
      policy: 'multiple',
      serialize: false,
      reason: 'dos sesiones simultáneas del mismo usuario convivieron: la app permite concurrencia',
    };
  }
  if (obs.bAutenticada && !obs.aSobrevive) {
    return {
      policy: 'single-last-wins',
      serialize: true,
      reason:
        'el segundo login expulsó al primero: una suite en paralelo se auto-invalida la sesión ' +
        'compartida a mitad de camino y falla de forma intermitente',
    };
  }
  if (!obs.bAutenticada && obs.aSobrevive) {
    return {
      policy: 'single-first-wins',
      serialize: true,
      reason:
        'el segundo login fue rechazado con la primera sesión viva' +
        (obs.bRechazoTexto ? `: «${obs.bRechazoTexto}»` : ''),
    };
  }
  return {
    policy: 'inconclusive',
    serialize: true,
    reason:
      'ninguna de las dos sesiones quedó viva: la sonda no distingue el caso (límite de N sesiones, ' +
      'throttling, o la app estaba caída). Se serializa por precaución — el error barato',
  };
}

/** El perfil MEDIDO del sitio. Lo escribe la sonda; el contract no se toca. */
export interface PerfilDeSitio {
  site_id: string;
  target_url: string;
  measured_at: string;
  session: VeredictoSesion & { source: 'probe' | 'contract' };
}

/**
 * D45 — de dónde sale la `baseURL` de la suite, y por qué el default es peligroso.
 *
 * `playwright.config.ts` caía directo en `https://www.saucedemo.com/` cuando faltaba
 * `QA_BASE_URL`. Medido en la iteración 2 del loop de OrangeHRM (2026-08-22): se me olvidó
 * exportarla, los tres specs de OrangeHRM navegaron a saucedemo, la página salió en blanco y
 * el fallo fue «locator.fill: Test timeout» sobre `getByPlaceholder('Username')`. El POM era
 * byte a byte el de la iteración 1, que estaba verde: el mensaje mandaba a mirar el locator y
 * la causa era que la suite corría contra otra aplicación.
 *
 * El default se queda —los labs de saucedemo dependen de él— pero deja de ser lo primero:
 * si el sitio tiene perfil medido, su `target_url` manda. Y caer al default con un site-id
 * que no es ese sitio produce un aviso: correr contra otra app en silencio no es aceptable.
 */
export function resolveBaseUrl(input: {
  envUrl?: string;
  perfil?: { target_url?: string } | null;
  siteId?: string;
  fallback: string;
}): { baseUrl: string; source: 'env' | 'site-profile' | 'default'; warning?: string } {
  if (input.envUrl) return { baseUrl: input.envUrl, source: 'env' };
  if (input.perfil?.target_url) return { baseUrl: input.perfil.target_url, source: 'site-profile' };
  const base = { baseUrl: input.fallback, source: 'default' as const };
  // sin site-id no hay nada que contradiga al default: es el workspace genérico
  if (!input.siteId || input.siteId === '.work') return base;
  return {
    ...base,
    warning:
      `sin QA_BASE_URL y sin config/site-profile/${input.siteId}.json — la suite corre contra ` +
      `el default ${input.fallback}. Si '${input.siteId}' no es ese sitio, exporta QA_BASE_URL.`,
  };
}

/**
 * Qué política manda. Si el contract la declara, gana: el QA suele saberlo y sondear es
 * intrusivo. Si dice `unknown`, manda la medición. Si no hay ninguna de las dos, se
 * serializa — no se asume concurrencia sin evidencia.
 */
export function effectiveSessionPolicy(
  declarada: PoliticaDeclarada | undefined,
  medida: VeredictoSesion | null,
): VeredictoSesion & { source: 'contract' | 'probe' | 'default' } {
  if (declarada === 'single') {
    return {
      policy: 'single-last-wins',
      serialize: true,
      reason: 'declarado en el contract (auth.concurrent_sessions: single)',
      source: 'contract',
    };
  }
  if (declarada === 'multiple') {
    return {
      policy: 'multiple',
      serialize: false,
      reason: 'declarado en el contract (auth.concurrent_sessions: multiple)',
      source: 'contract',
    };
  }
  if (medida) return { ...medida, source: 'probe' };
  return {
    policy: 'inconclusive',
    serialize: true,
    reason:
      'sin declarar en el contract y sin medir: se serializa. No se asume concurrencia sin evidencia — ' +
      'el coste de acertar serializando son minutos; el de fallar paralelizando es una suite intermitente',
    source: 'default',
  };
}

/**
 * ¿Hay que correr la sonda? Solo con auth activa, sin política declarada y sin perfil
 * previo. Es una propiedad del TARGET, no del run: se mide una vez y se reutiliza.
 *
 * Y es INTRUSIVA: crea una segunda sesión, que en un staging compartido con un único
 * usuario de pruebas puede echar a un compañero. Por eso no corre sola en cada run.
 */
export function shouldProbe(input: {
  authEnabled: boolean;
  declarada: PoliticaDeclarada | undefined;
  perfilExiste: boolean;
}): { probe: boolean; reason: string } {
  if (!input.authEnabled) {
    return { probe: false, reason: 'auth.enabled es false: no hay sesión que sondear' };
  }
  if (input.declarada === 'single' || input.declarada === 'multiple') {
    return { probe: false, reason: `el contract ya lo declara (${input.declarada}): sondear sería intrusivo sin ganar nada` };
  }
  if (input.perfilExiste) {
    return { probe: false, reason: 'ya hay perfil medido para este sitio: es propiedad del target, no del run' };
  }
  return { probe: true, reason: 'auth activa, sin declarar y sin medir: procede sondear UNA vez' };
}

/**
 * La firma de fallo, para cuando NO se sondeó. Si el proyecto de setup pasó en verde y
 * luego varios specs caen redirigidos al login, eso tiene huella reconocible — y hoy se
 * archivaría como «flaky», que es el diagnóstico equivocado.
 */
export function huellaDeConflictoDeSesion(input: {
  setupOk: boolean;
  specsFallados: number;
  specsTotal: number;
  fallosConRedireccionALogin: number;
}): { sospecha: boolean; reason: string } {
  const { setupOk, specsFallados, fallosConRedireccionALogin } = input;
  if (!setupOk || specsFallados === 0) return { sospecha: false, reason: '' };
  if (fallosConRedireccionALogin < 1) return { sospecha: false, reason: '' };
  const proporcion = fallosConRedireccionALogin / specsFallados;
  if (proporcion < 0.5) return { sospecha: false, reason: '' };
  return {
    sospecha: true,
    reason:
      `el setup de auth pasó pero ${fallosConRedireccionALogin} de ${specsFallados} fallos son ` +
      'redirecciones al login: firma de conflicto de sesión concurrente, NO de timing. ' +
      'Mide la política con probe-session-policy antes de tratarlo como flake',
  };
}
