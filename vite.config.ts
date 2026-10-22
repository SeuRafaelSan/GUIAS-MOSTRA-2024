import { defineConfig } from 'vite';

// Projeto sem framework: index.html → index.tsx → js/app.js.
// Arquivos em public/ (sw.js, manifest.json) são servidos na raiz sem processamento.
export default defineConfig({
  base: './',
  server: { port: 3000, host: '0.0.0.0' },
  build: { outDir: 'dist', target: 'es2020' },
});
