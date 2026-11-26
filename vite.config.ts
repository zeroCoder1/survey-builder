import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE is set for GitHub Pages builds, where the app is served from /<repo>/.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
