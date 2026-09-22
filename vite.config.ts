import { defineConfig } from 'vite';

// base relative pour pouvoir héberger le site n'importe où (GitHub Pages, etc.)
export default defineConfig({
  base: './',
  // three.js (via Photo Sphere Viewer) pèse lourd, c'est attendu
  build: { chunkSizeWarningLimit: 1000 },
});
