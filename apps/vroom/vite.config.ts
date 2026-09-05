import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const REPO = 'endless-runner'
const APP  = 'vroom'
// Deployed at github.io/endless-runner/vroom/ alongside the other games.
const BASE = process.env.NODE_ENV === 'production' ? `/${REPO}/${APP}/` : '/'

export default defineConfig({
  base: BASE,
  build: {
    outDir: '../../dist/vroom',
    emptyOutDir: true,
  },
  server: {
    host: true,   // bind to 0.0.0.0 so LAN devices can connect
    port: 5174,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'favicon.svg'],
      manifest: {
        name: 'Vroom Road',
        short_name: 'Vroom',
        description: 'Drive, jump and honk. Never lose.',
        theme_color: '#1a3a5e',
        background_color: '#1a3a5e',
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
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  // The engine is a linked workspace package; without dedupe its Babylon
  // imports resolve to a second copy (breaks the glTF loader, doubles the bundle).
  resolve: {
    dedupe: ['@babylonjs/core', '@babylonjs/materials', '@babylonjs/loaders'],
  },
  // Each app gets its own dependency cache: two dev servers sharing
  // node_modules/.vite re-optimise over each other, and the glTF loader
  // (a lazily imported subpath, listed here so it's bundled up front)
  // ends up registered against a second copy of Babylon.
  cacheDir: '../../node_modules/.vite/vroom',
  optimizeDeps: {
    include: ['@babylonjs/core', '@babylonjs/materials', '@babylonjs/loaders', '@babylonjs/loaders/glTF'],
  },
})
