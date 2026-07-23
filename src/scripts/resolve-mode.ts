#!/usr/bin/env node
/**
 * resolve-mode — resolución determinística del módulo de entrada (S1-S4).
 *
 * Sustituye la invocación LLM de `ia4d-mode-router` (Fase 1 token-efficiency): clasificar
 * flags explícitos es un `if`, no una llamada a un modelo. Misma semántica que el agente:
 * S2-Gherkin (--gherkin + --url), S3 (--fd + --url) y S4 (--url) funcionales; S1 (--repo)
 * y S2-OpenAPI (--openapi) stubs informativos; --gherkin/--fd sin --url → needs_input.
 *
 * Uso:  tsx src/scripts/resolve-mode.ts --url=<URL> [--fd=... --gherkin=... --openapi=... --repo=...]
 * Salida: JSON { module, status, next_action, user_message } por stdout (el command lo lee).
 * Exit 0 si resolvió un módulo (functional | stub | needs_input); exit 1 si no llegó ningún input.
 * Registra la resolución al audit-log (mismo rastro que dejaba la invocación del subagent).
 */
import { pathToFileURL } from 'node:url';

import { appendAuditEntry } from '../audit-log.ts';

export interface ModeResolution {
  module: 'S1' | 'S2' | 'S3' | 'S4' | null;
  status: 'functional' | 'stub' | 'needs_input' | 'error';
  next_action: string;
  user_message: string | null;
}

export function resolveMode(flags: Record<string, string | undefined>): ModeResolution {
  const has = (k: string) => typeof flags[k] === 'string' && flags[k]!.length > 0;

  if (has('repo')) {
    return {
      module: 'S1',
      status: 'stub',
      next_action: 'inform and stop',
      user_message:
        'S1 (Code-driven) not implemented — roadmap, sin versión comprometida. Usa --url (S4), --fd+--url (S3) o --gherkin+--url (S2).',
    };
  }
  if (has('gherkin')) {
    if (!has('url')) {
      return {
        module: 'S2',
        status: 'needs_input',
        next_action: 'ask for --url and stop',
        user_message:
          'S2 exige --gherkin + --url: el .feature da los criterios, la URL da el DOM. Sin target no hay locators reales ni run verde.',
      };
    }
    return {
      module: 'S2',
      status: 'functional',
      next_action: 'proceed with S2 (req-driven, Gherkin)',
      user_message: null,
    };
  }
  if (has('openapi')) {
    return {
      module: 'S2',
      status: 'stub',
      next_action: 'inform and stop',
      user_message:
        'S2-OpenAPI diferido a v0.4 (tests de API necesitan otro writer, no el motor DOM). Usa --gherkin+--url para la vía Gherkin.',
    };
  }
  if (has('fd')) {
    if (!has('url')) {
      return {
        module: 'S3',
        status: 'needs_input',
        next_action: 'ask for --url and stop',
        user_message:
          'S3 Forma B exige --fd + --url: el FD da los criterios, la URL da el DOM. Forma A (FD sin target) no está implementada.',
      };
    }
    return {
      module: 'S3',
      status: 'functional',
      next_action: 'proceed with S3 (spec-refiner, Forma B)',
      user_message: null,
    };
  }
  if (has('url')) {
    return {
      module: 'S4',
      status: 'functional',
      next_action: 'proceed with S4 (autonomous)',
      user_message: null,
    };
  }
  return {
    module: null,
    status: 'error',
    next_action: 'abort',
    user_message: 'no input provided. Use --url, --fd, --gherkin, --openapi, or --repo',
  };
}

export function parseFlags(argv: string[]): Record<string, string | undefined> {
  const flags: Record<string, string | undefined> = {};
  for (const arg of argv) {
    const m = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (m) flags[m[1]] = m[2];
  }
  return flags;
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2));
  const res = resolveMode(flags);

  appendAuditEntry({
    source: 'command',
    action: res.status === 'error' ? 'block' : 'allow',
    rule: 'mode-router',
    reason: `resolved ${res.module ?? 'none'} (${res.status}) — deterministic resolve-mode.ts`,
    result: res.status === 'error' ? 'fail' : 'pass',
    metadata: { module: res.module, status: res.status },
  });

  console.log(JSON.stringify(res, null, 2));
  process.exit(res.status === 'error' ? 1 : 0);
}

const invoked = process.argv[1] || '';
if (invoked.endsWith('resolve-mode.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
