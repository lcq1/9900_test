// Batch 0: Vite build configuration and frontend tooling
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward API calls to the FastAPI backend during development.
      '/api': {
        // 127.0.0.1 (not `localhost`): `localhost` can resolve to ::1 first,
        // and the backend only listens on IPv4 — that made every dev API call
        // fail with 502.
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
