// `vitest/config` re-exports Vite's own defineConfig with the `test` key added to
// its type. The old `/// <reference types="vitest" />` trick was removed in Vitest 3.
import { defineConfig } from 'vitest/config'
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
  },
  test: {
    // jsdom, not the real browser: these tests never need a camera or a canvas.
    environment: 'jsdom',
    // Registers the jest-dom matchers once, for every file.
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Undo every vi.spyOn between tests, so one file's mock can't leak into the next.
    restoreMocks: true,
    // Pin the feature flags the app reads at import time. Without this the suite would
    // pick up whatever sits in the git-ignored .env - green here, red on a machine
    // that has reCAPTCHA switched on (and a real network call to Google).
    env: {
      VITE_FEATURE_RECAPTCHA: 'false',
    },
  },
})
