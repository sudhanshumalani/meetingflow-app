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
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      workbox: {
        // Force cache refresh
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      injectManifest: {
        // Allow large WASM files (transformers.js models) - 25MB limit
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
      },
      includeAssets: ['favicon.ico', 'pwa-icon.svg'],
      manifest: {
        name: 'MeetingFlow',
        short_name: 'MeetingFlow',
        description: 'AI Meeting Management PWA',
        theme_color: '#2563eb',
        background_color: '#f9fafb',
        display: 'standalone',
        id: './',
        scope: './',
        start_url: './',
        icons: [
          {
            src: './pwa-icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: './pwa-icon.svg',
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
    sourcemap: false,
    rollupOptions: {
      output: {
        // Force unique filenames for cache busting
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify('1.0.28'), // Bump version for cache bust
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    https: true,
    host: '0.0.0.0', // Allow external connections
    port: 5173,
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    }
  },
  preview: {
    https: true,
    host: '0.0.0.0', // Allow external connections
    port: 4173,
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    }
  },
  optimizeDeps: {
    exclude: []
  },
  worker: {
    format: 'es'
  }
})