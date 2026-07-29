/**
 * proxy-env — proxy corporativo para los navegadores del pipeline.
 *
 * El Chromium de Playwright NO usa el PAC del sistema (a diferencia del Chrome
 * del usuario): sin config explícita sale directo, y con proxy explícito enruta
 * TODO por él — incluido el tráfico interno (*.corp) que el PAC mandaría DIRECT.
 * Convención estándar de entorno, leída por todos los lanzadores del pipeline
 * (dom-walker, verify-locators, playwright.config):
 *
 *   HTTPS_PROXY / HTTP_PROXY  → servidor (p.ej. http://proxy:80)
 *   NO_PROXY                  → hosts que van directo, separados por coma
 *                               (p.ej. "localhost,.mapfre.net")
 *
 * Sin variables → undefined (Chromium directo, comportamiento previo).
 */
export interface ProxySettings {
  server: string;
  bypass?: string;
}

export function proxyFromEnv(env: Record<string, string | undefined> = process.env): ProxySettings | undefined {
  const server = env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy;
  if (!server) return undefined;
  const bypass = env.NO_PROXY ?? env.no_proxy;
  return bypass ? { server, bypass } : { server };
}
