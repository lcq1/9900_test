// Batch 0: Vite build configuration and frontend tooling
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      usePolling: process.env.VITE_USE_POLLING === 'true',
    },
    proxy: {
      // Forward API calls to the FastAPI backend during development.
      '/api': {
        // Compose uses the backend service; local development uses IPv4 loopback.
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
