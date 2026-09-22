import { defineConfig } from 'vite';

// base relative : le build fonctionne à la racine (Vercel) comme dans un sous-dossier
export default defineConfig({
  base: './',
  // three.js (via Photo Sphere Viewer) pèse lourd, c'est attendu
  build: { chunkSizeWarningLimit: 1000 },
});
