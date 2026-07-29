/**
 * app-url — semántica ÚNICA de resolución de URLs de la app bajo test.
 *
 * El contrato del pipeline: `url_pattern` de un screen es RELATIVO A LA BASE DE
 * LA APP (lo que el QA pasa por --url), no al origen. Cuando la app vive bajo un
 * context path (p.ej. https://host/npa-escritorio — la norma en webapps Java
 * corporativas), `new URL('/login.do', base)` descarta el path de la base y
 * resuelve contra el origen: página equivocada, verificación en falso, POMs con
 * goto roto. Todos los consumidores (verify-locators, pom-scaffolder/BasePage,
 * adapter) deben resolver con este helper — misma semántica que el
 * resolveTarget del dom-walker, la única pieza que lo hacía bien.
 */

/** Patrón absoluto http(s) → tal cual; relativo → anexado al path de la base. */
export function resolveAppUrl(baseUrl: string, pattern: string): string {
  if (/^https?:\/\//i.test(pattern)) return pattern;
  const base = baseUrl.replace(/\/+$/, '');
  return base + (pattern.startsWith('/') ? pattern : `/${pattern}`);
}

/** Pathname normalizado (sin barra final) del patrón resuelto contra la base. */
export function appPathname(baseUrl: string, pattern: string): string {
  try {
    return new URL(resolveAppUrl(baseUrl, pattern)).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return pattern;
  }
}
