import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const REPO = 'endless-runner'
const BASE = process.env.NODE_ENV === 'production' ? `/${REPO}/` : '/'

export default defineConfig({
  base: BASE,
  server: {
    host: true,   // bind to 0.0.0.0 so LAN devices can connect
    port: 5173,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'favicon.svg'],
      manifest: {
        name: 'Endless Runner',
        short_name: 'Runner',
        description: 'A fun endless runner game',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: `/${REPO}/`,
        scope: `/${REPO}/`,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,glb,gltf}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,  // 8 MB — Babylon.js bundle is ~5 MB
      },
    }),
  ],
  optimizeDeps: {
    include: ['@babylonjs/core', '@babylonjs/materials', '@babylonjs/loaders'],
  },
})
