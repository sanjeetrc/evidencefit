import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` produces one self-contained index.html (for preview hosting);
// the default build produces the installable offline PWA.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins:
    mode === 'single'
      ? [react(), viteSingleFile()]
      : [
          react(),
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'script',
            includeAssets: ['icon.svg', 'icon-192.png'],
            manifest: {
              name: 'EvidenceFit',
              short_name: 'EvidenceFit',
              description: 'Evidence-based exercise and protein companion. Data stays on your device.',
              theme_color: '#047857',
              background_color: '#f8fafc',
              display: 'standalone',
              start_url: '.',
              id: '/evidencefit/',
              orientation: 'portrait',
              lang: 'en-IN',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
              ],
            },
            workbox: { globPatterns: ['**/*.{js,css,html,svg,png}'], skipWaiting: true, clientsClaim: true, cleanupOutdatedCaches: true },
          }),
        ],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}));
