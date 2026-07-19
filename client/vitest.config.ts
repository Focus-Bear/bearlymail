/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import path from 'node:path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// Test-only config. The production build uses vite.config.ts; this file mirrors
// the plugins needed for JSX + tsconfig path resolution and adds the Vitest
// runner config (jsdom + Testing Library).
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    // Match Create React App's Jest preset, which set `resetMocks: true` (resets
    // mock implementations and call history before every test). Without this,
    // mock state leaks across tests in ways the suite was not written for.
    mockReset: true,
    // `config/api` reads import.meta.env and sets axios.defaults at module load,
    // which breaks when axios is auto-mocked. Map it to a lightweight stub, the
    // same way the old Jest moduleNameMapper did.
    alias: [
      {
        find: /^(\.\.\/)*config\/api$/,
        replacement: path.resolve(__dirname, 'src/__mocks__/config/api.ts'),
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
