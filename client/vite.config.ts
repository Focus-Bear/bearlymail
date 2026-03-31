import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Short SHA for Settings footer + console banner.
 * - CI: set `COMMIT_HASH` (optionally 7 chars) or rely on `GITHUB_SHA`.
 * - Local: `git rev-parse --short HEAD` from `client/` or repo root.
 */
function resolveCommitHashForBuild(): string {
  const trimmedExplicit = process.env.COMMIT_HASH?.trim();
  if (trimmedExplicit) {
    return trimmedExplicit.length > 7
      ? trimmedExplicit.slice(0, 7)
      : trimmedExplicit;
  }

  const ghSha = process.env.GITHUB_SHA?.trim();
  if (ghSha) {
    return ghSha.slice(0, 7);
  }

  const searchRoots = [process.cwd(), path.resolve(process.cwd(), '..')];
  for (const cwd of searchRoots) {
    try {
      const hash = execSync('git rev-parse --short HEAD', {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (hash) {
        return hash.length > 7 ? hash.slice(0, 7) : hash;
      }
    } catch {
      // Not a git checkout or git unavailable
    }
  }

  return 'dev';
}

const commitHash = resolveCommitHashForBuild();

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
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
