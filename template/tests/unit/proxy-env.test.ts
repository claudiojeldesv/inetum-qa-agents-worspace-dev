import { describe, it, expect } from 'vitest';

import { proxyFromEnv } from '../../src/proxy-env.ts';

describe('proxyFromEnv (proxy corporativo opt-in por entorno)', () => {
  it('sin variables → undefined (Chromium directo, comportamiento previo)', () => {
    expect(proxyFromEnv({})).toBeUndefined();
  });

  it('HTTPS_PROXY manda; NO_PROXY se traduce a bypass', () => {
    expect(
      proxyFromEnv({ HTTPS_PROXY: 'http://proxy:80', NO_PROXY: 'localhost,.mapfre.net' }),
    ).toEqual({ server: 'http://proxy:80', bypass: 'localhost,.mapfre.net' });
  });

  it('cae a HTTP_PROXY y acepta variantes en minúscula', () => {
    expect(proxyFromEnv({ http_proxy: 'http://proxy:80' })).toEqual({ server: 'http://proxy:80' });
  });
});
