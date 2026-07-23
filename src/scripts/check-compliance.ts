#!/usr/bin/env node
/**
 * check-compliance — gate de compliance pre-flight, invocable por el command.
 *
 * Sustituye la invocación LLM de `ia4d-compliance-checker` (Fase 1 token-efficiency): el agente
 * solo envolvía `runPreflight()` (src/compliance-preflight.ts), la misma lógica que ya corre el
 * hook PreToolUse en cada llamada MCP. El gate NO cambia de semántica: sigue sin override
 * (regla dura #3) y el hook sigue activo como segunda barrera.
 *
 * Uso:  tsx src/scripts/check-compliance.ts <URL> [--config=config/allowed-targets.yaml]
 * Salida: verdict JSON por stdout y a `.work/compliance-verdict.json` (misma ruta y forma que
 * escribía el agente — el compliance corre ANTES de que el run defina su namespace por-sitio).
 * Exit 0 = pass|warn (warn se muestra al QA, ask-first en el command); exit 2 = block.
 * runPreflight ya registra el veredicto al audit-log.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runPreflight } from '../compliance-preflight.ts';

const VERDICT_PATH = resolve(process.cwd(), '.work/compliance-verdict.json');

function main(): void {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith('--'));
  const configPath = args.find((a) => a.startsWith('--config='))?.slice('--config='.length);

  if (!url || !/^https?:\/\//.test(url)) {
    console.error('[check-compliance] uso: tsx src/scripts/check-compliance.ts <URL> [--config=<path>]');
    process.exit(2);
  }

  const result = runPreflight(url, configPath);

  const verdict = {
    verdict: result.verdict,
    rule: result.rule ?? null,
    url: result.url,
    reason: result.reason ?? null,
    audit_logged: true,
  };

  const dir = dirname(VERDICT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(VERDICT_PATH, JSON.stringify(verdict, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify(verdict, null, 2));
  process.exit(result.verdict === 'block' ? 2 : 0);
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('check-compliance.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
