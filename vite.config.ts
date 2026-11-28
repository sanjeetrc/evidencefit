import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Deploy traceability without version control. `source` is a hash of everything that shapes the build:
 * - src/, public/, index.html, package files and this config (line endings normalised);
 * - the Drive client ID.
 * The same source always gives the same hash, whatever the build time. Compare `/version.json` on Netlify
 * with `dist/version.json` (or Settings → About) to see which version the phone runs.
 */
function sourceHash(root: string, env: Record<string, string>): string {
  const files: string[] = [];
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) readdirSync(p).sort().forEach((f) => walk(join(p, f)));
    else files.push(p);
  };
  ['src', 'public', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts']
    .map((f) => join(root, f))
    .forEach((p) => { try { walk(p); } catch { /* missing file */ } });
  const h = createHash('sha256');
  for (const f of files) {
    h.update(relative(root, f).replace(/\\/g, '/'));
    h.update(readFileSync(f).toString('latin1').replace(/\r\n/g, '\n'));
  }
  h.update(`client:${env.VITE_GOOGLE_CLIENT_ID ?? ''}`);
  return h.digest('hex').slice(0, 10);
}

/** "3ede062" or "3ede062+changes" (uncommitted edits); null outside a git checkout. */
function gitCommit(root: string): string | null {
  try {
    const run = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const hash = run(['rev-parse', '--short', 'HEAD']);
    return run(['status', '--porcelain']) ? `${hash}+changes` : hash;
  } catch {
    return null;
  }
}

function versionFile(build: { time: string; source: string; commit: string | null }): Plugin {
  return {
    name: 'evidencefit-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify(build, null, 2)}\n` });
    },
  };
}

/** Stamp dist/sw.js with this build's id and every emitted /assets file, so they're all cached at install. */
function swPrecache(build: { time: string; source: string; commit: string | null }): Plugin {
  return {
    name: 'evidencefit-sw-precache',
    apply: 'build',
    writeBundle(options, bundle) {
      const dir = options.dir ?? 'dist';
      const swPath = join(dir, 'sw.js');
      const assets = Object.keys(bundle).filter((f) => f.startsWith('assets/')).sort().map((f) => `${BASE}${f}`);
      const sw = readFileSync(swPath, 'utf8');
      const stamped = sw
        .replace("const BUILD = 'dev';", `const BUILD = ${JSON.stringify(`${build.source}-${build.time.replace(/\D/g, '').slice(0, 14)}`)};`)
        .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(assets)};`);
      if (stamped === sw) throw new Error('sw.js placeholders not found — keep `const BUILD = \'dev\';` and `const PRECACHE = [];`');
      writeFileSync(swPath, stamped);
    },
  };
}

// Served from https://sanjeetrc.github.io/evidencefit/ (GitHub Pages project site).
const BASE = '/evidencefit/';

export default defineConfig(({ mode }) => {
  const root = process.cwd();
  const build = { time: new Date().toISOString(), source: sourceHash(root, loadEnv(mode, root, 'VITE_')), commit: gitCommit(root) };
  return {
    base: BASE,
    plugins: [react(), tailwindcss(), versionFile(build), swPrecache(build)],
    define: { __APP_BUILD__: JSON.stringify(build) },
  };
});
