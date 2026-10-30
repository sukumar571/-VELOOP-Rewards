import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    // Dev convenience: with no VITE_API_BASE_URL set, the client calls /api/v1
    // same-origin and this proxies to the Express API on :4000. This keeps local
    // dev CORS-free; a real deployment either sets VITE_API_BASE_URL or fronts
    // both under one origin (backend CORS allow-list still governs cross-origin).
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
});
