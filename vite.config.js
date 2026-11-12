import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createLogger, defineConfig } from 'vite'

// The Rust backend takes a while to compile on start. Instead of an ECONNREFUSED stack trace for every
// proxied request, print one short notice and let the proxy answer 503 until the backend is up.
const logger = createLogger()
const logError = logger.error
let backendNoticeShown = false
logger.error = (message, options) => {
  if (typeof message === 'string' && message.includes('http proxy error') && message.includes('ECONNREFUSED')) {
    if (!backendNoticeShown) {
      backendNoticeShown = true
      logger.warn('Backend belum siap di port 8001, menunggu proses kompilasi selesai...')
    }
    return
  }
  logError(message, options)
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  customLogger: logger,
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
          proxy.on('error', (error, _request, response) => {
            if (error.code === 'ECONNREFUSED' && response && typeof response.writeHead === 'function' && !response.headersSent) {
              response.writeHead(503, { 'Content-Type': 'application/json' })
              response.end(JSON.stringify({ message: 'Backend sedang dimulai. Coba lagi sebentar.' }))
            }
          })
          proxy.on('proxyRes', () => { backendNoticeShown = false })
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
