import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const REPO = 'endless-runner'
const APP  = 'runner'
// Deployed at github.io/endless-runner/runner/ alongside the other games.
const BASE = process.env.NODE_ENV === 'production' ? `/${REPO}/${APP}/` : '/'

export default defineConfig({
  base: BASE,
  build: {
    outDir: '../../dist/runner',
    emptyOutDir: true,
  },
  server: {
    host: true,   // bind to 0.0.0.0 so LAN devices can connect
    port: 5173,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'favicon.svg'],
      manifest: {
        name: 'Runner',
        short_name: 'Runner',
        description: 'A fun endless runner game',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: `/${REPO}/${APP}/`,
        scope: `/${REPO}/${APP}/`,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,glb,gltf,ogg,ttf}'],
        // Twelve characters at ~150 KB each: the chosen one is fetched on
        // demand and kept in a runtime cache rather than precached.
        globIgnores: ['**/models/characters/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,  // 8 MB — Babylon.js bundle is ~5 MB
        runtimeCaching: [{
          urlPattern: /\/models\/characters\/[^/]+\.glb$/,
          handler: 'CacheFirst',
          options: { cacheName: 'characters', expiration: { maxEntries: 16 } },
        }],
      },
    }),
  ],
  // The engine is a linked workspace package. Without dedupe, its Babylon
  // imports resolve to a second copy of the library: the glTF loader then
  // registers with the wrong instance ("Unable to find a plugin to load
  // .glb files") and the production bundle ships Babylon twice.
  resolve: {
    dedupe: ['@babylonjs/core', '@babylonjs/materials', '@babylonjs/loaders'],
  },
  // Each app gets its own dependency cache: two dev servers sharing
  // node_modules/.vite re-optimise over each other, and the glTF loader
  // (a lazily imported subpath, listed here so it's bundled up front)
  // ends up registered against a second copy of Babylon.
  cacheDir: '../../node_modules/.vite/runner',
  optimizeDeps: {
    include: ['@babylonjs/core', '@babylonjs/materials', '@babylonjs/loaders', '@babylonjs/loaders/glTF'],
  },
})
