#!/usr/bin/env node
/**
 * build-plugin — genera el paquete de plugin de marketplace `plugin/` desde el repo.
 *
 * Modelo A (repartidor): el plugin es fino. Aporta el command /qa-automator:init, que
 * despliega el workspace completo (el `template/`) en la carpeta del QA. El agente real
 * vive en el .claude/ del proyecto scaffoldeado, no en el plugin.
 *
 * Uso: npm run build:plugin
 *
 * Reglas:
 *  - Corre build:template antes (payload fresco).
 *  - Fuentes hand-authored en plugin-src/ (init/help/scaffold/plugin.json base).
 *  - Payload = copia de template/ SIN node_modules/.work/.git/playwright/.auth.
 *  - version del plugin = version de package.json del repo (inyectada).
 *  - Salida idempotente y re-ejecutable; sin timestamps (git-friendly).
 */
import { execSync } from 'node:child_process';
import { cpSync, rmSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, sep, join } from 'node:path';

const repo = process.cwd();
const src = resolve(repo, 'plugin-src');
const tpl = resolve(repo, 'template');
const out = resolve(repo, 'plugin');
const PLUGIN_NAME = 'ia4d-qa-automator';

if (!existsSync(src)) {
  console.error('[build-plugin] plugin-src/ no existe en', repo);
  process.exit(1);
}

// 1. Payload fresco: regenera template/ desde el repo.
console.log('[build-plugin] refrescando payload (build:template)...');
execSync('node src/scripts/build-template.mjs', { cwd: repo, stdio: 'inherit' });
if (!existsSync(tpl)) {
  console.error('[build-plugin] template/ no existe tras build:template');
  process.exit(1);
}

// 2. Estructura del marketplace (layout del catálogo ia4d).
const pluginDir = resolve(out, '.claude-plugin', 'plugins', PLUGIN_NAME);
const payloadDir = resolve(pluginDir, 'scaffold', 'payload');
rmSync(out, { recursive: true, force: true });
mkdirSync(pluginDir, { recursive: true });

// 3. Componentes al plugin (híbrido): agentes ia4d + comandos (workspace + init/help) + scaffold.
const agentsDst = resolve(pluginDir, 'agents');
const cmdsDst = resolve(pluginDir, 'commands');
mkdirSync(agentsDst, { recursive: true });
mkdirSync(cmdsDst, { recursive: true });

// 3a. 12 agentes ia4d desde el repo. Los nativos playwright-test-* NO: viven en el workspace
//     (pineados a la versión de Playwright).
const repoAgents = resolve(repo, '.claude/agents');
for (const f of readdirSync(repoAgents)) {
  if (f.startsWith('ia4d-') && f.endsWith('.md')) {
    cpSync(resolve(repoAgents, f), resolve(agentsDst, f));
  }
}

// 3b. 7 comandos del workspace desde el repo.
const repoCmds = resolve(repo, '.claude/commands/qa-automator');
for (const f of readdirSync(repoCmds)) {
  if (f.endsWith('.md')) cpSync(resolve(repoCmds, f), resolve(cmdsDst, f));
}

// 3c. Comandos propios del plugin (init, help) + scaffold determinístico.
for (const f of readdirSync(resolve(src, 'commands'))) {
  if (f.endsWith('.md')) cpSync(resolve(src, 'commands', f), resolve(cmdsDst, f));
}
cpSync(resolve(src, 'scaffold', 'scaffold.mjs'), resolve(pluginDir, 'scaffold', 'scaffold.mjs'));

// 4. Manifiesto: base (name/description/author) + version del repo + inventario DESCUBIERTO.
const repoPkg = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8'));
const basePluginJson = JSON.parse(readFileSync(resolve(src, 'plugin.json'), 'utf8'));
const agentList = readdirSync(agentsDst)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => `./agents/${f}`);
const cmdList = readdirSync(cmdsDst)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => `./commands/${f}`);
const pluginJson = {
  name: basePluginJson.name,
  version: repoPkg.version,
  description: basePluginJson.description,
  author: basePluginJson.author,
  agents: agentList,
  commands: cmdList,
};
mkdirSync(resolve(pluginDir, '.claude-plugin'), { recursive: true });
writeFileSync(
  resolve(pluginDir, '.claude-plugin', 'plugin.json'),
  JSON.stringify(pluginJson, null, 2) + '\n',
);

// 5. Payload = template/ sin artefactos de máquina.
const EXCLUDE_DIRS = new Set(['node_modules', '.work', '.git']);
const AUTH_DIR = join('playwright', '.auth');
mkdirSync(payloadDir, { recursive: true });
cpSync(tpl, payloadDir, {
  recursive: true,
  filter: (from) => {
    const rel = from.slice(tpl.length + 1);
    if (!rel) return true;
    const segs = rel.split(sep);
    if (segs.some((s) => EXCLUDE_DIRS.has(s))) return false;
    if (rel === AUTH_DIR || rel.startsWith(AUTH_DIR + sep)) return false;
    return true;
  },
});

// 6. marketplace.json (raíz del market local, forma estándar con `source`).
const marketplaceJson = {
  name: `${PLUGIN_NAME}-marketplace`,
  description: 'Marketplace local del agente QA ia4d-qa-automator (catálogo Inetum, categoría Documentación y Calidad).',
  owner: { name: 'IA4D / Inetum' },
  plugins: [
    {
      name: PLUGIN_NAME,
      source: `./.claude-plugin/plugins/${PLUGIN_NAME}`,
      description: basePluginJson.description,
    },
  ],
};
writeFileSync(
  resolve(out, '.claude-plugin', 'marketplace.json'),
  JSON.stringify(marketplaceJson, null, 2) + '\n',
);

console.log(`[build-plugin] plugin/ generado (v${repoPkg.version}): ${agentList.length} agentes + ${cmdList.length} comandos.`);
console.log('[build-plugin] payload sin node_modules/.work/.git/playwright/.auth.');
console.log('[build-plugin] simular: /plugin marketplace add <ruta-abs>/plugin');
