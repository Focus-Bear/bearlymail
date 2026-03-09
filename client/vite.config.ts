import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    open: false,
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
  envPrefix: 'VITE_',
  define: {
    // Injected at build time. Pass COMMIT_HASH=$(git rev-parse --short HEAD) as an env var.
    // Falls back to 'dev' when building locally without the env var set.
    __COMMIT_HASH__: JSON.stringify(process.env.COMMIT_HASH ?? 'dev'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
