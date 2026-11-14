import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds to a single self-contained dist/index.html (JS, CSS and data inlined).
export default defineConfig({
  base: './',
  // The model lives in /data at the repo root and is imported from there.
  server: { fs: { allow: ['..'] } },
  plugins: [viteSingleFile()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
