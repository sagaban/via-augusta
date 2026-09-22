/**
 * Business context: configures deterministic browser-like regression tests for
 * browser-facing domain modules. JSDOM supplies the browser XML APIs used by local GPX parsing
 * without starting the application.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    clearMocks: true,
    restoreMocks: true,
  },
});
