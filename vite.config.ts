import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl() // Generates a local self-signed HTTPS certificate
  ],
  server: {
    host: true, // Listen on all local IPs (0.0.0.0)
    proxy: {
      // Proxy all /api requests to the local FastAPI backend
      // This solves both CORS and the HTTPS -> HTTP Mixed Content blocking
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        ws: true, // Proxy WebSockets too!
      }
    }
  }
})