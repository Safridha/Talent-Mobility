import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  base: command === 'serve' ? '/' : '/spa/',
  publicDir: 'pwa-assets',
  build: {
    outDir: 'public/spa',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 8000,
    strictPort: true,
    watch: {
      ignored: ['**/target/**'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyRequest, request) => {
            if (request.headers.host) {
              proxyRequest.setHeader('Host', request.headers.host)
            }
          })
        },
      },
    },
  },
}))
