import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Les appels /api sont redirigés vers le backend NestJS
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
