import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Simple local development configuration
export default defineConfig({
  base: '/', // No base path for local development
  plugins: [
    react()
  ],
  server: {
    https: false, // Use HTTP for simplicity
    host: 'localhost',
    port: 3000,
    open: true, // Auto-open browser
    strictPort: false, // Allow port switching
    proxy: {
      // Proxy n8n requests to avoid CORS issues
      '/n8n-proxy': {
        target: 'http://localhost:5678',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/n8n-proxy/, ''),
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err);
          });
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true // Enable sourcemaps for debugging
  }
})