import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Simplified GitHub Pages configuration
export default defineConfig({
  base: '/meetingflow-app/',
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      includeAssets: ['favicon.ico', 'pwa-icon.svg'],
      manifest: {
        name: 'MeetingFlow',
        short_name: 'MeetingFlow',
        description: 'AI Meeting Management PWA',
        theme_color: '#2563eb',
        background_color: '#f9fafb',
        display: 'standalone',
        scope: '/meetingflow-app/',
        start_url: '/meetingflow-app/',
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'pwa-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  },
  server: {
    https: true,
    host: '0.0.0.0', // Allow external connections
    port: 5173,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  preview: {
    https: true,
    host: '0.0.0.0', // Allow external connections
    port: 4173,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  optimizeDeps: {
    include: ['tesseract.js']
  },
  worker: {
    format: 'es'
  }
})