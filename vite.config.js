import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')

  // Vercel-specific optimizations
  const isVercel = process.env.VERCEL || env.VERCEL
  const isProduction = mode === 'production'

  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'MeetingFlow - AI Meeting Management',
        short_name: 'MeetingFlow',
        description: 'Your intelligent meeting management companion with AI insights',
        theme_color: '#2563eb',
        background_color: '#f9fafb',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
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
        ],
        categories: ['business', 'productivity']
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  build: {
    target: 'esnext',
    minify: isProduction ? 'terser' : 'esbuild',
    sourcemap: !isProduction || env.GENERATE_SOURCEMAP !== 'false',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          icons: ['lucide-react'],
          utils: ['date-fns']
        },
        // Optimize for Vercel edge functions
        ...(isVercel && {
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        })
      }
    },
    // Vercel-specific optimizations
    ...(isVercel && {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true
    })
  },
  server: {
    port: 5173,
    host: '0.0.0.0'
  },
  preview: {
    port: 4173,
    host: '0.0.0.0'
  },
  // Environment variables
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.3'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  }
  }
})
