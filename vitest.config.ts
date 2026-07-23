import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'copilot/tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules', 'docs/spike/artifacts'],
    environment: 'node',
    globals: false,
  },
});
