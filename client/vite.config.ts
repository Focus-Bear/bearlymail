import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Short SHA for Settings footer + console banner.
 * - CI: set `COMMIT_HASH` (optionally 7 chars) or rely on `GITHUB_SHA`.
 * - Local: `git rev-parse --short HEAD` from `client/` or repo root.
 */
function resolveCommitHashForBuild(): string {
  const trimmedExplicit = process.env.COMMIT_HASH?.trim();
  if (trimmedExplicit) {
    return trimmedExplicit.length > 7 ? trimmedExplicit.slice(0, 7) : trimmedExplicit;
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

/**
 * Vite plugin that injects Subresource Integrity (SRI) hashes into the generated
 * HTML output. Browsers use these to verify bundled scripts and stylesheets have
 * not been tampered with, providing defence against CDN compromise or
 * man-in-the-middle attacks.
 *
 * Uses the `closeBundle` hook (fires after all files are written to disk) so that
 * hashes are computed from the exact bytes served to the browser — avoiding any
 * mismatch that could arise when Vite post-processes chunks after `generateBundle`.
 *
 * Addresses: SAQ Q6 / GAP-6 — no SRI hashes on static assets (issue #1812).
 */
function sriPlugin(): Plugin {
  let outDir = '';

  return {
    name: 'vite-plugin-sri',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const htmlPath = path.join(outDir, 'index.html');
      if (!fs.existsSync(htmlPath)) return;

      let html = fs.readFileSync(htmlPath, 'utf-8');

      const getIntegrity = (assetPath: string): string | null => {
        const cleanPath = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
        const absPath = path.join(outDir, cleanPath);
        if (!fs.existsSync(absPath)) return null;
        const content = fs.readFileSync(absPath);
        return `sha384-${createHash('sha384').update(content).digest('base64')}`;
      };

      // Inject SRI into <script src="..."></script> tags
      html = html.replace(/<script\b([^>]*)><\/script>/gi, (scriptTag, attrs: string) => {
        const srcMatch = /\bsrc="([^"]+)"/.exec(attrs);
        if (!srcMatch || attrs.includes('integrity=')) return scriptTag;
        const integrity = getIntegrity(srcMatch[1]);
        if (!integrity) return scriptTag;
        const cleanAttrs = attrs
          .replace(/\s*\bcrossorigin(?:="[^"]*")?\s*/g, ' ')
          .trim();
        return `<script ${cleanAttrs} integrity="${integrity}" crossorigin="anonymous"></script>`;
      });

      // Inject SRI into <link href="..."> tags (stylesheets and module preloads)
      html = html.replace(/<link\b([^>]*)>/gi, (linkTag, attrs: string) => {
        const hrefMatch = /\bhref="([^"]+)"/.exec(attrs);
        if (!hrefMatch || attrs.includes('integrity=')) return linkTag;
        const integrity = getIntegrity(hrefMatch[1]);
        if (!integrity) return linkTag;
        const cleanAttrs = attrs
          .replace(/\s*\bcrossorigin(?:="[^"]*")?\s*/g, ' ')
          .replace(/\s*\/$/, '')
          .trim();
        return `<link ${cleanAttrs} integrity="${integrity}" crossorigin="anonymous">`;
      });

      fs.writeFileSync(htmlPath, html, 'utf-8');
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths(), sriPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
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
