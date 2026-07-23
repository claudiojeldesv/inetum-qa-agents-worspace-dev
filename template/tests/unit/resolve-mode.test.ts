import { describe, it, expect } from 'vitest';

import { resolveMode, parseFlags } from '../../src/scripts/resolve-mode.ts';

describe('resolve-mode (sustituto determinístico de ia4d-mode-router)', () => {
  it('parsea flags --k=v', () => {
    expect(parseFlags(['--url=https://x.test/', '--max-scenarios=5'])).toEqual({
      url: 'https://x.test/',
      'max-scenarios': '5',
    });
  });

  it.each([
    [{ url: 'https://x.test/' }, 'S4', 'functional'],
    [{ fd: 'fd.md', url: 'https://x.test/' }, 'S3', 'functional'],
    [{ gherkin: 'a.feature', url: 'https://x.test/' }, 'S2', 'functional'],
    [{ fd: 'fd.md' }, 'S3', 'needs_input'],
    [{ gherkin: 'a.feature' }, 'S2', 'needs_input'],
    [{ openapi: 'api.yaml' }, 'S2', 'stub'],
    [{ repo: './front' }, 'S1', 'stub'],
  ] as const)('%o → %s (%s)', (flags, module, status) => {
    const res = resolveMode({ ...flags });
    expect(res.module).toBe(module);
    expect(res.status).toBe(status);
  });

  it('--repo gana sobre el resto (mismo orden que el decision tree del agente)', () => {
    expect(resolveMode({ repo: './x', url: 'https://x.test/' }).module).toBe('S1');
  });

  it('sin input → error con user_message accionable', () => {
    const res = resolveMode({});
    expect(res.status).toBe('error');
    expect(res.user_message).toMatch(/--url/);
  });
});
