/**
 * D18 — el workspace desplegado no declara su versión, y nada la comprueba.
 *
 * Medido tres veces en un solo día: `/init` despliega el payload al que apunta
 * `CLAUDE_PLUGIN_ROOT`, esa variable se congela al arrancar la sesión, y un despliegue
 * de hace dos releases sale **indistinguible de uno correcto** — healthcheck 26/26,
 * resolve-mode OK, compliance evaluado, contract compatible. Cinco verdes sobre código
 * anterior a los arreglos que se iban a medir.
 *
 * La comprobación es aritmética pura: la versión que el workspace lleva escrita contra
 * la que el registro de plugins dice instalada. No infiere nada del contenido.
 *
 * Se separa del script porque `healthcheck.ts` ejecuta al importarse: una regla que
 * decide si el runtime es de fiar tiene que poder probarse sin lanzar el runtime.
 */

/** Marcador que SOLO existe en el repo de desarrollo: no viaja al payload del plugin. */
export const DEV_REPO_MARKER = 'src/scripts/build-template.mjs';

export interface VersionDriftInput {
  /** El cwd es el repo donde se construye el plugin, no un workspace desplegado. */
  isDevRepo: boolean;
  /** `package.json` del workspace: qué payload se copió aquí. */
  workspaceVersion: string | null;
  /** Registro de plugins de Claude Code: qué versión está instalada en la máquina. */
  installedVersion: string | null;
  /** Derivada de `CLAUDE_PLUGIN_ROOT` si está presente: qué cargó ESTA sesión. */
  sessionVersion: string | null;
}

export interface VersionDriftVerdict {
  ok: boolean;
  detail: string;
}

export function versionDriftVerdict(i: VersionDriftInput): VersionDriftVerdict {
  if (i.isDevRepo) {
    return { ok: true, detail: `repo de desarrollo (v${i.workspaceVersion ?? '?'}) — no aplica` };
  }
  if (!i.workspaceVersion) {
    return { ok: false, detail: 'el workspace no declara versión en package.json' };
  }
  // Sin plugin instalado no hay contra qué comparar. Eso NO es un fallo: alguien puede
  // haber desplegado el workspace en otra máquina, o a mano desde el repo. Afirmar drift
  // sin la otra mitad del dato sería inventarlo.
  if (!i.installedVersion) {
    return { ok: true, detail: `workspace v${i.workspaceVersion} (plugin no instalado aquí: nada que comparar)` };
  }
  if (i.workspaceVersion !== i.installedVersion) {
    return {
      ok: false,
      detail:
        `workspace v${i.workspaceVersion} pero el plugin instalado es v${i.installedVersion} — ` +
        `el despliegue es VIEJO. Re-despliega desde la cache de v${i.installedVersion} ` +
        `(scaffold.mjs <destino> --force) en vez de repetir /init, que vuelve a leer la ` +
        `variable de sesión congelada`,
    };
  }
  // Segundo eje: el payload puede estar al día y los COMANDOS no, porque no viven en el
  // workspace — los carga la sesión del plugin. Un walker nuevo conducido por un command
  // viejo es la mitad del arreglo, en silencio.
  if (i.sessionVersion && i.sessionVersion !== i.installedVersion) {
    return {
      ok: false,
      detail:
        `workspace v${i.workspaceVersion} correcto, pero ESTA SESIÓN cargó el plugin ` +
        `v${i.sessionVersion} — sus comandos son viejos. Cierra y vuelve a abrir la sesión`,
    };
  }
  return { ok: true, detail: `workspace v${i.workspaceVersion} = plugin instalado v${i.installedVersion}` };
}

/** Versión que codifica una ruta de cache del plugin (`.../ia4d-qa-automator/<version>`). */
export function versionFromPluginPath(path: string | undefined | null): string | null {
  if (!path) return null;
  const segs = path.replace(/\\/g, '/').split('/').filter(Boolean);
  const last = segs[segs.length - 1];
  return last && /^\d+\.\d+\.\d+/.test(last) ? last : null;
}
