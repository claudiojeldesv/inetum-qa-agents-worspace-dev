#!/usr/bin/env node
/**
 * build-template — genera el workspace `template/` desde el repo (fuente de verdad).
 *
 * Mata el drift repo↔template: el núcleo de código del agente vive una sola vez
 * (en el repo) y el template se reconstruye. Idempotente y re-ejecutable.
 *
 * Uso: npm run build:template
 *
 * Reglas (ver SPEC §3 y CLAUDE "Reorganización de estructura"):
 *  - COPIA del repo (núcleo idéntico): .claude/{agents,commands,settings.json},
 *    src/ (sin este builder), hooks/, docs/references/, tests/unit/ y los configs
 *    de tooling. Adopta la estructura nueva (docs/references, config/style-contracts,
 *    src/scripts, .work/).
 *  - TRANSFORMA package.json: deps/scripts/engines del repo + name/description del template.
 *  - PRESERVA (propio del template, NO se toca): config/ (allowed-targets +
 *    style-contracts didácticos), examples/, tests/{e2e,pages,integration},
 *    specs/, criteria/, README.md, CLAUDE.md, .env.example, package-lock.json.
 */
import { cpSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = process.cwd();
const tpl = resolve(repo, 'template');

if (!existsSync(tpl)) {
  console.error('[build-template] template/ no existe en', repo);
  process.exit(1);
}

// 1. Limpia ubicaciones viejas del núcleo en el template (transición a estructura nueva + idempotencia).
for (const d of ['references', 'scripts', 'style-contracts']) {
  rmSync(resolve(tpl, d), { recursive: true, force: true });
}

// 2. Copia el núcleo del repo → template (sobrescribe la copia anterior).
const COPY_DIRS = [
  '.claude/agents',
  '.claude/commands',
  'src',
  'hooks',
  'docs/references',
  'tests/unit',
];
const COPY_FILES = [
  '.claude/settings.json',
  'tsconfig.json',
  'vitest.config.ts',
  'playwright.config.ts',
  'playwright.global-setup.ts',
  '.eslintrc.json',
  '.eslintignore',
  '.prettierrc.json',
  '.mcp.json',
  '.gitignore',
];
for (const d of COPY_DIRS) {
  const dest = resolve(tpl, d);
  rmSync(dest, { recursive: true, force: true });
  cpSync(resolve(repo, d), dest, { recursive: true });
}
for (const f of COPY_FILES) {
  cpSync(resolve(repo, f), resolve(tpl, f));
}

// 3. El builder no viaja al template (el SDET no reconstruye el template).
rmSync(resolve(tpl, 'src/scripts/build-template.mjs'), { force: true });

// 4. package.json: deps/scripts/engines del repo, identity del template.
const repoPkg = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8'));
const tplPkg = JSON.parse(readFileSync(resolve(tpl, 'package.json'), 'utf8'));
const scripts = { ...repoPkg.scripts };
delete scripts['build:template']; // específico del repo
const merged = {
  name: tplPkg.name,
  version: repoPkg.version,
  description: tplPkg.description,
  private: true,
  type: repoPkg.type,
  engines: repoPkg.engines,
  scripts,
  devDependencies: repoPkg.devDependencies,
};
writeFileSync(resolve(tpl, 'package.json'), JSON.stringify(merged, null, 2) + '\n');

console.log('[build-template] template/ regenerado desde el repo (estructura nueva).');
console.log('[build-template] preservados: config/, examples/, tests/{e2e,pages,integration}, specs/, criteria/, README.md, CLAUDE.md, .env.example.');
